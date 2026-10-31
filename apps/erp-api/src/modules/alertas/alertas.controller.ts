import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentTenant } from "../../common/decorators/current-tenant.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { PermissionGuard } from "../../common/guards/permission.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ConsultaAlertasDto, ReglaAlertaDto, TIPOS_ALERTA, TipoAlerta } from "./alertas.dto";
import { AlertasService } from "./alertas.service";

@ApiTags("Alertas de suministro")
@ApiBearerAuth()
@Controller("alertas")
@UseGuards(JwtAuthGuard, PermissionGuard)
export class AlertasController {
  constructor(private readonly service: AlertasService) {}

  /** Las propias: cualquier usuario activo ve y reconoce lo que le llegó. */
  @Get("mias")
  mias(@CurrentTenant() t: string, @CurrentUser("id") a: string, @Query() q: ConsultaAlertasDto) {
    return this.service.consultar(t, a, "MIAS", q);
  }

  @Post(":id/reconocer")
  reconocer(
    @CurrentTenant() t: string,
    @CurrentUser("id") a: string,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
  ) {
    return this.service.reconocer(t, a, id);
  }

  @Get()
  @RequirePermission("alertas.suministro.ver")
  todas(@CurrentTenant() t: string, @CurrentUser("id") a: string, @Query() q: ConsultaAlertasDto) {
    return this.service.consultar(t, a, "TODAS", q);
  }

  @Get("reglas")
  @RequirePermission("alertas.suministro.ver")
  reglas(@CurrentTenant() t: string, @CurrentUser("id") a: string) {
    return this.service.consultar(t, a, "REGLAS");
  }

  @Put("reglas/:tipo")
  @RequirePermission("alertas.suministro.gestionar")
  configurar(
    @CurrentTenant() t: string,
    @CurrentUser("id") a: string,
    @Param("tipo") tipo: string,
    @Body() dto: ReglaAlertaDto,
    @Headers("idempotency-key") key?: string,
  ) {
    if (!(TIPOS_ALERTA as readonly string[]).includes(tipo)) throw new BadRequestException("Tipo de alerta inválido.");
    return this.service.configurar(t, a, tipo as TipoAlerta, dto, key);
  }

  @Post("evaluar")
  @RequirePermission("alertas.suministro.gestionar")
  evaluar(@CurrentTenant() t: string) {
    return this.service.evaluar(t);
  }
}
