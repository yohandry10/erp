import {
  Controller,
  Get,
  Post,
  Put,
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
  CreateActivoFijoDto,
  UpdateActivoFijoDto,
  DepreciarPeriodoDto,
  DarDeBajaActivoDto,
  ActivoFijoResponseDto,
  CuotaDepreciacionDto,
  ResultadoDepreciacionDto,
} from "@erp-suite/dtos";
import { ActivosFijosService } from "../services/activos-fijos.service";

@ApiTags("contabilidad")
@Controller("contabilidad")
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ContabilidadActivosController {
  constructor(private readonly activosService: ActivosFijosService) {}

  @Get("activos-fijos")
  @RequirePermission("contabilidad.activos.read")
  @ApiOperation({ summary: "Listar activos fijos" })
  @ApiResponse({ status: 200, type: [ActivoFijoResponseDto] })
  async listar(
    @CurrentTenant() tenantId: string,
    @Query("situacion") situacion?: string,
  ) {
    const data = await this.activosService.listar(tenantId, situacion);
    return { success: true, data, message: "Activos fijos obtenidos exitosamente" };
  }

  @Get("activos-fijos/:id")
  @RequirePermission("contabilidad.activos.read")
  @ApiOperation({ summary: "Obtener un activo fijo" })
  @ApiResponse({ status: 200, type: ActivoFijoResponseDto })
  async obtener(
    @CurrentTenant() tenantId: string,
    @Param("id") activoId: string,
  ) {
    const data = await this.activosService.obtener(tenantId, activoId);
    return { success: true, data, message: "Activo fijo obtenido exitosamente" };
  }

  @Get("activos-fijos/:id/cronograma")
  @RequirePermission("contabilidad.activos.read")
  @ApiOperation({
    summary: "Cronograma de depreciación proyectado",
    description:
      "Depreciación lineal mes a mes. La última cuota absorbe el residuo del " +
      "redondeo para que el activo llegue exactamente a su valor residual.",
  })
  @ApiResponse({ status: 200, type: [CuotaDepreciacionDto] })
  async cronograma(
    @CurrentTenant() tenantId: string,
    @Param("id") activoId: string,
  ) {
    const data = await this.activosService.obtenerCronograma(tenantId, activoId);
    return { success: true, data, message: "Cronograma calculado" };
  }

  @Post("activos-fijos")
  @RequirePermission("contabilidad.activos.crear")
  @ApiOperation({ summary: "Registrar un activo fijo" })
  @ApiResponse({ status: 201, type: ActivoFijoResponseDto })
  async crear(
    @CurrentTenant() tenantId: string,
    @CurrentUser("id") userId: string,
    @Body() dto: CreateActivoFijoDto,
  ) {
    const data = await this.activosService.crear(tenantId, userId, dto);
    return { success: true, data, message: `Activo ${data.codigo} registrado` };
  }

  @Put("activos-fijos/:id")
  @RequirePermission("contabilidad.activos.actualizar")
  @ApiOperation({
    summary: "Actualizar un activo fijo",
    description:
      "Un cambio de vida útil o valor residual se aplica hacia adelante: la " +
      "depreciación ya registrada no se recalcula.",
  })
  @ApiResponse({ status: 200, type: ActivoFijoResponseDto })
  async actualizar(
    @CurrentTenant() tenantId: string,
    @Param("id") activoId: string,
    @Body() dto: UpdateActivoFijoDto,
  ) {
    const data = await this.activosService.actualizar(tenantId, activoId, dto);
    return { success: true, data, message: `Activo ${data.codigo} actualizado` };
  }

  @Post("activos-fijos/depreciar")
  @RequirePermission("contabilidad.activos.depreciar")
  @ApiOperation({
    summary: "Registrar la depreciación del período",
    description:
      "Calcula la cuota de cada activo vigente. Un activo deprecia una sola vez " +
      "por período. El asiento Dr 68 / Cr 39 lo genera la cadena de eventos.",
  })
  @ApiResponse({ status: 201, type: ResultadoDepreciacionDto })
  @ApiResponse({ status: 400, description: "El período está cerrado o el mes es inválido" })
  async depreciar(
    @CurrentTenant() tenantId: string,
    @CurrentUser("id") userId: string,
    @Body() dto: DepreciarPeriodoDto,
  ) {
    const data = await this.activosService.depreciarPeriodo(
      tenantId,
      userId,
      dto.anio,
      dto.mes,
    );

    return {
      success: true,
      data,
      message: `Depreciación ${data.periodo}: ${data.activos_depreciados} activo(s), total ${data.total_depreciado}`,
    };
  }

  @Post("activos-fijos/:id/baja")
  @RequirePermission("contabilidad.activos.baja")
  @ApiOperation({
    summary: "Dar de baja o vender un activo",
    description:
      "Retira el bien del balance cancelando su depreciación acumulada. En una " +
      "venta reconoce además la cuenta por cobrar y el ingreso por enajenación.",
  })
  @ApiResponse({ status: 201, type: ActivoFijoResponseDto })
  @ApiResponse({
    status: 400,
    description: "El activo ya fue retirado, falta el importe de venta, o el período está cerrado",
  })
  async darDeBaja(
    @CurrentTenant() tenantId: string,
    @CurrentUser("id") userId: string,
    @Param("id") activoId: string,
    @Body() dto: DarDeBajaActivoDto,
  ) {
    const data = await this.activosService.darDeBaja(tenantId, userId, activoId, dto);
    return { success: true, data, message: `Activo ${data.codigo} retirado (${data.situacion})` };
  }
}
