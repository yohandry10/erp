import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
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
import {
  AdjuntarDocumentoDto,
  ConsultaContratosDto,
  MotivoSuministroDto,
  VincularPedidoDto,
} from "./contratos.dto";
import { ArchivoSuministro, ExpedienteService } from "./expediente.service";

@ApiTags("Ventas - Expediente de suministro")
@ApiBearerAuth()
@Controller("ventas/contratos")
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ExpedienteController {
  constructor(private readonly service: ExpedienteService) {}
  @Get("origen-pedido/:pedidoId")
  @RequirePermission("ventas.pedidos.ver")
  origenPedido(
    @CurrentTenant() t: string,
    @CurrentUser("id") a: string,
    @Param("pedidoId", new ParseUUIDPipe({ version: "4" })) p: string,
  ) {
    return this.service.origenPedido(t, a, p);
  }
  @Get(":id/pedidos")
  @RequirePermission("ventas.contratos.ver")
  pedidos(
    @CurrentTenant() t: string,
    @CurrentUser("id") a: string,
    @Param("id", new ParseUUIDPipe({ version: "4" })) c: string,
  ) {
    return this.service.pedidos(t, a, c, "LISTAR");
  }
  @Get(":id/pedidos/candidatos")
  @RequirePermission("ventas.contratos.ver")
  candidatos(
    @CurrentTenant() t: string,
    @CurrentUser("id") a: string,
    @Param("id", new ParseUUIDPipe({ version: "4" })) c: string,
    @Query() query: ConsultaContratosDto,
  ) {
    return this.service.pedidos(t, a, c, "CANDIDATOS", null, query);
  }
  @Get(":id/pedidos/candidatos/:pedidoId")
  @RequirePermission("ventas.contratos.ver")
  candidato(
    @CurrentTenant() t: string,
    @CurrentUser("id") a: string,
    @Param("id", new ParseUUIDPipe({ version: "4" })) c: string,
    @Param("pedidoId", new ParseUUIDPipe({ version: "4" })) p: string,
  ) {
    return this.service.pedidos(t, a, c, "CANDIDATO", p);
  }
  @Post(":id/pedidos/:pedidoId/vincular")
  @RequirePermission("ventas.contratos.gestionar")
  vincular(
    @CurrentTenant() t: string,
    @CurrentUser("id") a: string,
    @Param("id", new ParseUUIDPipe({ version: "4" })) c: string,
    @Param("pedidoId", new ParseUUIDPipe({ version: "4" })) p: string,
    @Body() dto: VincularPedidoDto,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.operarPedido(t, a, c, p, "VINCULAR_PEDIDO", dto, key);
  }
  @Post(":id/pedidos/:pedidoId/desvincular")
  @RequirePermission("ventas.contratos.gestionar")
  desvincular(
    @CurrentTenant() t: string,
    @CurrentUser("id") a: string,
    @Param("id", new ParseUUIDPipe({ version: "4" })) c: string,
    @Param("pedidoId", new ParseUUIDPipe({ version: "4" })) p: string,
    @Body() dto: MotivoSuministroDto,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.operarPedido(
      t,
      a,
      c,
      p,
      "DESVINCULAR_PEDIDO",
      dto,
      key,
    );
  }
  @Get(":id/adjuntos")
  @RequirePermission("ventas.contratos.ver")
  adjuntos(
    @CurrentTenant() t: string,
    @CurrentUser("id") a: string,
    @Param("id", new ParseUUIDPipe({ version: "4" })) c: string,
  ) {
    return this.service.adjuntos(t, a, c);
  }
  @Post(":id/adjuntos")
  @RequirePermission("ventas.contratos.gestionar")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 10485760, files: 1, fields: 2, parts: 3 },
    }),
  )
  upload(
    @CurrentTenant() t: string,
    @CurrentUser("id") a: string,
    @Param("id", new ParseUUIDPipe({ version: "4" })) c: string,
    @Body() dto: AdjuntarDocumentoDto,
    @Headers("idempotency-key") key?: string,
    @UploadedFile() file?: ArchivoSuministro,
  ) {
    return this.service.upload(t, a, c, dto, key, file);
  }
  @Get(":id/adjuntos/:adjuntoId/descarga")
  @RequirePermission("ventas.contratos.ver")
  descarga(
    @CurrentTenant() t: string,
    @CurrentUser("id") a: string,
    @Param("id", new ParseUUIDPipe({ version: "4" })) c: string,
    @Param("adjuntoId", new ParseUUIDPipe({ version: "4" })) f: string,
  ) {
    return this.service.download(t, a, c, f);
  }
  @Post(":id/adjuntos/:adjuntoId/retirar")
  @RequirePermission("ventas.contratos.gestionar")
  retirar(
    @CurrentTenant() t: string,
    @CurrentUser("id") a: string,
    @Param("id", new ParseUUIDPipe({ version: "4" })) c: string,
    @Param("adjuntoId", new ParseUUIDPipe({ version: "4" })) f: string,
    @Body() dto: MotivoSuministroDto,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.retirar(t, a, c, f, dto.motivo, key);
  }
}
