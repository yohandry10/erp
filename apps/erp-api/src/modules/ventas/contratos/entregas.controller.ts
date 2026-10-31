import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentTenant } from "../../../common/decorators/current-tenant.decorator";
import { RequirePermission } from "../../../common/decorators/require-permission.decorator";
import { PermissionGuard } from "../../../common/guards/permission.guard";
import { CurrentUser } from "../../auth/current-user.decorator";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { AnularRecepcionDto, BaseFacturacionDto, RegistrarRecepcionDto } from "./entregas.dto";
import { EntregasService } from "./entregas.service";
import { ArchivoSuministro, ExpedienteService } from "./expediente.service";

@ApiTags("Ventas - Entregas y conformidades de suministro")
@ApiBearerAuth()
@Controller("ventas/contratos")
@UseGuards(JwtAuthGuard, PermissionGuard)
export class EntregasController {
  constructor(
    private readonly service: EntregasService,
    private readonly expediente: ExpedienteService,
  ) {}

  @Get(":id/ejecucion")
  @RequirePermission("ventas.contratos.ver")
  ejecucion(
    @CurrentTenant() t: string,
    @CurrentUser("id") a: string,
    @Param("id", new ParseUUIDPipe({ version: "4" })) c: string,
  ) {
    return this.service.ejecucion(t, a, c);
  }

  @Get(":id/estado-cuenta")
  @RequirePermission("ventas.contratos.ver")
  estadoCuenta(
    @CurrentTenant() t: string,
    @CurrentUser("id") a: string,
    @Param("id", new ParseUUIDPipe({ version: "4" })) c: string,
  ) {
    return this.service.estadoCuenta(t, a, c);
  }

  @Put(":id/facturacion")
  @RequirePermission("ventas.contratos.gestionar")
  facturacion(
    @CurrentTenant() t: string,
    @CurrentUser("id") a: string,
    @Param("id", new ParseUUIDPipe({ version: "4" })) c: string,
    @Body() dto: BaseFacturacionDto,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.configurarFacturacion(t, a, c, dto, key);
  }

  @Post(":id/recepciones")
  @RequirePermission("ventas.contratos.conformar")
  registrar(
    @CurrentTenant() t: string,
    @CurrentUser("id") a: string,
    @Param("id", new ParseUUIDPipe({ version: "4" })) c: string,
    @Body() dto: RegistrarRecepcionDto,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.registrar(t, a, c, dto, key);
  }

  @Post(":id/recepciones/:recepcionId/anular")
  @RequirePermission("ventas.contratos.conformar")
  anular(
    @CurrentTenant() t: string,
    @CurrentUser("id") a: string,
    @Param("id", new ParseUUIDPipe({ version: "4" })) c: string,
    @Param("recepcionId", new ParseUUIDPipe({ version: "4" })) r: string,
    @Body() dto: AnularRecepcionDto,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.anular(t, a, c, r, dto, key);
  }

  /** Guía, PECOSA o conformidad firmada; no exige gestionar el contrato. */
  @Post(":id/recepciones/:recepcionId/adjuntos")
  @RequirePermission("ventas.contratos.conformar")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 10485760, files: 1, fields: 0, parts: 1 },
    }),
  )
  adjuntar(
    @CurrentTenant() t: string,
    @CurrentUser("id") a: string,
    @Param("id", new ParseUUIDPipe({ version: "4" })) c: string,
    @Param("recepcionId", new ParseUUIDPipe({ version: "4" })) r: string,
    @Headers("idempotency-key") key?: string,
    @UploadedFile() file?: ArchivoSuministro,
  ) {
    return this.expediente.upload(t, a, c, { recurso_tipo: "RECEPCION", recurso_id: r }, key, file);
  }
}
