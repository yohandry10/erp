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
  AsignarDistribucionDto,
  DistribucionAnaliticaResponseDto,
  CreateDiferidoDto,
  DevengarDiferidoDto,
  DiferidoResponseDto,
  ResultadoDevengoDto,
} from "@erp-suite/dtos";
import { DistribucionAnaliticaService } from "../services/distribucion-analitica.service";
import { DiferidosService } from "../services/diferidos.service";

@ApiTags("contabilidad")
@Controller("contabilidad")
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ContabilidadAnaliticaController {
  constructor(
    private readonly distribucionService: DistribucionAnaliticaService,
    private readonly diferidosService: DiferidosService,
  ) {}

  // -------------------------------------------------------------------------
  // Distribución analítica
  // -------------------------------------------------------------------------

  @Get("distribucion-analitica/:detalleId")
  @RequirePermission("contabilidad.distribucion.read")
  @ApiOperation({ summary: "Distribución analítica de una línea de asiento" })
  @ApiResponse({ status: 200, type: [DistribucionAnaliticaResponseDto] })
  async obtenerDistribucion(
    @CurrentTenant() tenantId: string,
    @Param("detalleId") detalleId: string,
  ) {
    const data = await this.distribucionService.obtenerPorLinea(tenantId, detalleId);
    return { success: true, data, message: "Distribución obtenida exitosamente" };
  }

  @Post("distribucion-analitica")
  @RequirePermission("contabilidad.distribucion.asignar")
  @ApiOperation({
    summary: "Repartir una línea de asiento entre varios destinos",
    description:
      "Los porcentajes deben sumar 100 dentro del eje. Ejes distintos son " +
      "independientes: la misma línea puede repartirse por centro y por proyecto.",
  })
  @ApiResponse({ status: 201, type: [DistribucionAnaliticaResponseDto] })
  @ApiResponse({
    status: 400,
    description: "Los porcentajes no suman 100, o hay destinos de otro eje o inactivos",
  })
  async asignarDistribucion(
    @CurrentTenant() tenantId: string,
    @CurrentUser("id") userId: string,
    @Body() dto: AsignarDistribucionDto,
  ) {
    const data = await this.distribucionService.asignar(tenantId, userId, dto);
    return { success: true, data, message: `Distribución ${dto.eje} asignada` };
  }

  @Delete("distribucion-analitica/:detalleId")
  @RequirePermission("contabilidad.distribucion.asignar")
  @ApiOperation({ summary: "Eliminar el reparto de una línea en un eje" })
  async eliminarDistribucion(
    @CurrentTenant() tenantId: string,
    @Param("detalleId") detalleId: string,
    @Query("eje") eje: string,
  ) {
    await this.distribucionService.eliminar(tenantId, detalleId, eje || "CENTRO_COSTO");
    return { success: true, message: "Distribución eliminada" };
  }

  // -------------------------------------------------------------------------
  // Diferidos
  // -------------------------------------------------------------------------

  @Get("diferidos")
  @RequirePermission("contabilidad.diferidos.read")
  @ApiOperation({ summary: "Listar ingresos y gastos diferidos" })
  @ApiResponse({ status: 200, type: [DiferidoResponseDto] })
  async listarDiferidos(
    @CurrentTenant() tenantId: string,
    @Query("estado") estado?: string,
  ) {
    const data = await this.diferidosService.listar(tenantId, estado);
    return { success: true, data, message: "Diferidos obtenidos exitosamente" };
  }

  @Get("diferidos/:id")
  @RequirePermission("contabilidad.diferidos.read")
  @ApiOperation({ summary: "Obtener un diferido con su cronograma de devengo" })
  @ApiResponse({ status: 200, type: DiferidoResponseDto })
  async obtenerDiferido(
    @CurrentTenant() tenantId: string,
    @Param("id") diferidoId: string,
  ) {
    const data = await this.diferidosService.obtener(tenantId, diferidoId);
    return { success: true, data, message: "Diferido obtenido exitosamente" };
  }

  @Post("diferidos")
  @RequirePermission("contabilidad.diferidos.crear")
  @ApiOperation({ summary: "Registrar un ingreso o gasto diferido" })
  @ApiResponse({ status: 201, type: DiferidoResponseDto })
  async crearDiferido(
    @CurrentTenant() tenantId: string,
    @CurrentUser("id") userId: string,
    @Body() dto: CreateDiferidoDto,
  ) {
    const data = await this.diferidosService.crear(tenantId, userId, dto);
    return { success: true, data, message: `Diferido "${data.nombre}" creado` };
  }

  @Post("diferidos/devengar")
  @RequirePermission("contabilidad.diferidos.devengar")
  @ApiOperation({
    summary: "Devengar la cuota del período de todos los diferidos vigentes",
    description:
      "Genera un único asiento con una línea por diferido. Idempotente por período.",
  })
  @ApiResponse({ status: 201, type: ResultadoDevengoDto })
  @ApiResponse({
    status: 400,
    description: "El período está cerrado o el devengo ya fue registrado",
  })
  async devengar(
    @CurrentTenant() tenantId: string,
    @CurrentUser("id") userId: string,
    @Body() dto: DevengarDiferidoDto,
  ) {
    const data = await this.diferidosService.devengarPeriodo(
      tenantId,
      userId,
      dto.anio,
      dto.mes,
    );

    return {
      success: true,
      data,
      message: `Devengo ${data.periodo}: ${data.diferidos_devengados} diferido(s), total ${data.total_devengado}`,
    };
  }

  @Delete("diferidos/:id")
  @RequirePermission("contabilidad.diferidos.cancelar")
  @ApiOperation({
    summary: "Cancelar un diferido",
    description: "Deja de devengar. Lo ya devengado permanece en los libros.",
  })
  @ApiResponse({ status: 200, type: DiferidoResponseDto })
  async cancelarDiferido(
    @CurrentTenant() tenantId: string,
    @Param("id") diferidoId: string,
  ) {
    const data = await this.diferidosService.cancelar(tenantId, diferidoId);
    return { success: true, data, message: `Diferido "${data.nombre}" cancelado` };
  }
}
