import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Query,
  Param,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { CurrentTenant, CurrentUser } from "../../../common";
import { PermissionGuard } from "../../../common/guards/permission.guard";
import { RequirePermission } from "../../../common/decorators/require-permission.decorator";
import {
  ListarPartidasAbiertasQueryDto,
  ConciliarPartidasDto,
  ConciliacionResponseDto,
  ResumenPartidasDto,
} from "@erp-suite/dtos";
import { ConciliacionPartidasService } from "../services/conciliacion-partidas.service";

@ApiTags("contabilidad")
@Controller("contabilidad")
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ContabilidadConciliacionController {
  constructor(private readonly conciliacionService: ConciliacionPartidasService) {}

  @Get("partidas-abiertas")
  @RequirePermission("contabilidad.partidas.read")
  @ApiOperation({
    summary: "Partidas abiertas de una cuenta de terceros",
    description:
      "Devuelve los apuntes confirmados con saldo sin casar, más el total deudor, " +
      "acreedor y el saldo abierto de la cuenta.",
  })
  @ApiResponse({ status: 200, type: ResumenPartidasDto })
  @ApiResponse({ status: 400, description: "La cuenta no es conciliable" })
  async partidasAbiertas(
    @CurrentTenant() tenantId: string,
    @Query() query: ListarPartidasAbiertasQueryDto,
  ) {
    const data = await this.conciliacionService.obtenerPartidasAbiertas(tenantId, query);
    return { success: true, data, message: "Partidas abiertas obtenidas exitosamente" };
  }

  @Get("conciliaciones-partidas")
  @RequirePermission("contabilidad.partidas.read")
  @ApiOperation({ summary: "Listar conciliaciones registradas" })
  @ApiResponse({ status: 200, type: [ConciliacionResponseDto] })
  async listar(
    @CurrentTenant() tenantId: string,
    @Query("cuenta_id") cuentaId?: string,
  ) {
    const data = await this.conciliacionService.listarConciliaciones(tenantId, cuentaId);
    return { success: true, data, message: "Conciliaciones obtenidas exitosamente" };
  }

  @Post("conciliaciones-partidas")
  @RequirePermission("contabilidad.partidas.conciliar")
  @ApiOperation({
    summary: "Casar partidas abiertas entre sí",
    description:
      "Todas las partidas deben ser de la misma cuenta y debe haber saldo de los " +
      "dos lados. Si los importes no coinciden, la conciliación es PARCIAL y el " +
      "resto queda abierto.",
  })
  @ApiResponse({ status: 201, type: ConciliacionResponseDto })
  @ApiResponse({
    status: 400,
    description:
      "Cuentas distintas, partidas ya conciliadas, asientos no confirmados, o un solo lado",
  })
  async conciliar(
    @CurrentTenant() tenantId: string,
    @CurrentUser("id") userId: string,
    @Body() dto: ConciliarPartidasDto,
  ) {
    const data = await this.conciliacionService.conciliar(tenantId, userId, dto);

    return {
      success: true,
      data,
      message: `Conciliación ${data.estado} por ${data.monto_conciliado}`,
    };
  }

  @Delete("conciliaciones-partidas/:id")
  @RequirePermission("contabilidad.partidas.desconciliar")
  @ApiOperation({
    summary: "Deshacer una conciliación",
    description:
      "Devuelve las partidas a su estado abierto. No toca los asientos: conciliar " +
      "nunca los modificó.",
  })
  async desconciliar(
    @CurrentTenant() tenantId: string,
    @Param("id") conciliacionId: string,
  ) {
    await this.conciliacionService.desconciliar(tenantId, conciliacionId);
    return { success: true, message: "Conciliación deshecha" };
  }
}
