import {
  Body,
  Controller,
  Get,
  Headers,
  Ip,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { Response } from "express";
import { CurrentTenant } from "../../common/decorators/current-tenant.decorator";
import { Public } from "../../common/decorators/public.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { PermissionGuard } from "../../common/guards/permission.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import {
  ConsultaTableroDto,
  CredencialBiDto,
  Dataset,
  DATASETS,
  FiltrosTableroDto,
  LecturaBiDto,
  RevocarCredencialDto,
} from "./tableros.dto";
import { BiApiKeyGuard } from "./bi-api-key.guard";
import { TablerosService } from "./tableros.service";

@ApiTags("Reportes - Tablero de suministro")
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, PermissionGuard)
export class TablerosController {
  constructor(private readonly service: TablerosService) {}

  @Get("reportes/suministro")
  @RequirePermission("reports.suministro.read")
  consultar(@CurrentTenant() t: string, @CurrentUser("id") a: string, @Query() dto: ConsultaTableroDto) {
    return this.service.consultar(t, a, dto);
  }

  @Post("reportes/suministro/cortes")
  @RequirePermission("reports.suministro.export")
  registrarCorte(@CurrentTenant() t: string, @CurrentUser("id") a: string, @Headers("idempotency-key") key?: string) {
    return this.service.registrarCorte(t, a, key);
  }

  @Get("reportes/suministro/cortes/:id/excel")
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @RequirePermission("reports.suministro.export")
  async excel(
    @CurrentTenant() t: string,
    @CurrentUser("id") a: string,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Query() filtros: FiltrosTableroDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const archivo = await this.service.excel(t, a, id, filtros);
    res.setHeader("X-Corte-Hash", archivo.hash);
    return new StreamableFile(archivo.buffer, {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      disposition: `attachment; filename="${archivo.nombre}"`,
    });
  }

  @Get("integraciones/bi/credenciales")
  @RequirePermission("integraciones.bi.gestionar")
  credenciales(@CurrentTenant() t: string, @CurrentUser("id") a: string) {
    return this.service.credenciales(t, a);
  }

  @Post("integraciones/bi/credenciales")
  @RequirePermission("integraciones.bi.gestionar")
  crearCredencial(
    @CurrentTenant() t: string, @CurrentUser("id") a: string,
    @Body() dto: CredencialBiDto, @Headers("idempotency-key") key?: string,
  ) {
    return this.service.crearCredencial(t, a, dto, key);
  }

  @Post("integraciones/bi/credenciales/:id/revocar")
  @RequirePermission("integraciones.bi.gestionar")
  revocarCredencial(
    @CurrentTenant() t: string, @CurrentUser("id") a: string,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() dto: RevocarCredencialDto, @Headers("idempotency-key") key?: string,
  ) {
    return this.service.revocarCredencial(t, a, id, dto.motivo, key);
  }
}

/** Lectura para Power BI: sin sesión de usuario; la credencial es la identidad. */
@ApiTags("Integraciones - Power BI")
@Public()
@UseGuards(BiApiKeyGuard)
@Controller("bi/v1/suministro")
export class BiController {
  constructor(private readonly service: TablerosService) {}

  @Get(":dataset")
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  leer(
    @Param("dataset") dataset: string,
    @Query() dto: LecturaBiDto,
    @Req() req: { biTokenDigest: string },
    @Headers("user-agent") agente: string | undefined,
    @Ip() ip: string,
  ) {
    if (!(DATASETS as readonly string[]).includes(dataset)) throw new NotFoundException("Conjunto inexistente.");
    return this.service.leerBi(req.biTokenDigest, dataset as Dataset, dto, { ip, agente });
  }
}
