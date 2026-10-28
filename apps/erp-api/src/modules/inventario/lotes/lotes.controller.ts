import {
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
import { CurrentTenant } from "../../../common/decorators/current-tenant.decorator";
import { RequirePermission } from "../../../common/decorators/require-permission.decorator";
import { PermissionGuard } from "../../../common/guards/permission.guard";
import { CurrentUser } from "../../auth/current-user.decorator";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import {
  ConsultaLotesDto,
  PoliticaLoteDto,
  ReasignarReservaDto,
  RegularizarLotesDto,
} from "./lotes.dto";
import { LotesService } from "./lotes.service";

@ApiTags("Inventario - Lotes y vencimientos")
@ApiBearerAuth()
@Controller("inventario/lotes")
@UseGuards(JwtAuthGuard, PermissionGuard)
export class LotesController {
  constructor(private readonly service: LotesService) {}

  @Get("productos")
  @RequirePermission("inventario.lotes.read")
  productos(
    @CurrentTenant() tenant: string,
    @CurrentUser("id") actor: string,
    @Query() query: ConsultaLotesDto,
  ) {
    return this.service.consultar(tenant, actor, "PRODUCTOS", null, query);
  }

  @Get("por-vencer")
  @RequirePermission("inventario.lotes.read")
  porVencer(
    @CurrentTenant() tenant: string,
    @CurrentUser("id") actor: string,
    @Query() query: ConsultaLotesDto,
  ) {
    return this.service.consultar(tenant, actor, "POR_VENCER", null, query);
  }

  @Get("productos/:id")
  @RequirePermission("inventario.lotes.read")
  detalle(
    @CurrentTenant() tenant: string,
    @CurrentUser("id") actor: string,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Query() query: ConsultaLotesDto,
  ) {
    return this.service.consultar(tenant, actor, "PRODUCTO", id, query);
  }

  @Get("productos/:id/movimientos")
  @RequirePermission("inventario.lotes.read")
  movimientos(
    @CurrentTenant() tenant: string,
    @CurrentUser("id") actor: string,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Query() query: ConsultaLotesDto,
  ) {
    return this.service.consultar(tenant, actor, "MOVIMIENTOS", id, query);
  }

  @Put("productos/:id/politica")
  @RequirePermission("inventario.lotes.manage")
  politica(
    @CurrentTenant() tenant: string,
    @CurrentUser("id") actor: string,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() dto: PoliticaLoteDto,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.operar(tenant, actor, "CONFIGURAR_POLITICA", id, dto, key);
  }

  @Post("productos/:id/regularizaciones")
  @RequirePermission("inventario.lotes.manage")
  regularizar(
    @CurrentTenant() tenant: string,
    @CurrentUser("id") actor: string,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() dto: RegularizarLotesDto,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.operar(tenant, actor, "REGULARIZAR", id, dto, key);
  }

  @Post("productos/:id/reservas/reasignar")
  @RequirePermission("inventario.lotes.manage")
  reasignar(
    @CurrentTenant() tenant: string,
    @CurrentUser("id") actor: string,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() dto: ReasignarReservaDto,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.operar(tenant, actor, "REASIGNAR_RESERVA", id, dto, key);
  }
}
