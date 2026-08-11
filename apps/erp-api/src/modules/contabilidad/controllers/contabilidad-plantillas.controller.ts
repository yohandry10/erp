import {
  Controller,
  Get,
  Post,
  Put,
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
  CreatePlantillaAsientoDto,
  UpdatePlantillaAsientoDto,
  GenerarDesdePlantillaDto,
  PlantillaAsientoResponseDto,
  AsientoResponseDto,
} from "@erp-suite/dtos";
import { PlantillasAsientosService } from "../services/plantillas-asientos.service";

@ApiTags("contabilidad")
@Controller("contabilidad")
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ContabilidadPlantillasController {
  constructor(private readonly plantillasService: PlantillasAsientosService) {}

  @Get("plantillas-asientos")
  @RequirePermission("contabilidad.plantillas.read")
  @ApiOperation({ summary: "Listar plantillas de asiento" })
  @ApiResponse({ status: 200, type: [PlantillaAsientoResponseDto] })
  async listar(
    @CurrentTenant() tenantId: string,
    @Query("solo_activas") soloActivas?: string,
  ) {
    const data = await this.plantillasService.listar(
      tenantId,
      soloActivas === "true",
    );

    return { success: true, data, message: "Plantillas obtenidas exitosamente" };
  }

  @Get("plantillas-asientos/:id")
  @RequirePermission("contabilidad.plantillas.read")
  @ApiOperation({ summary: "Obtener una plantilla con sus movimientos" })
  @ApiResponse({ status: 200, type: PlantillaAsientoResponseDto })
  async obtener(
    @CurrentTenant() tenantId: string,
    @Param("id") plantillaId: string,
  ) {
    const data = await this.plantillasService.obtener(tenantId, plantillaId);
    return { success: true, data, message: "Plantilla obtenida exitosamente" };
  }

  @Post("plantillas-asientos")
  @RequirePermission("contabilidad.plantillas.crear")
  @ApiOperation({
    summary: "Crear una plantilla de asiento",
    description:
      "Con periodicidad distinta de NINGUNA la plantilla se agenda y el sistema " +
      "la instancia sola en cada período.",
  })
  @ApiResponse({ status: 201, type: PlantillaAsientoResponseDto })
  @ApiResponse({ status: 400, description: "La plantilla no cuadra o tiene menos de 2 movimientos" })
  async crear(
    @CurrentTenant() tenantId: string,
    @CurrentUser("id") userId: string,
    @Body() dto: CreatePlantillaAsientoDto,
  ) {
    const data = await this.plantillasService.crear(tenantId, userId, dto);
    return { success: true, data, message: `Plantilla "${data.nombre}" creada` };
  }

  @Put("plantillas-asientos/:id")
  @RequirePermission("contabilidad.plantillas.actualizar")
  @ApiOperation({ summary: "Actualizar una plantilla de asiento" })
  @ApiResponse({ status: 200, type: PlantillaAsientoResponseDto })
  async actualizar(
    @CurrentTenant() tenantId: string,
    @CurrentUser("id") userId: string,
    @Param("id") plantillaId: string,
    @Body() dto: UpdatePlantillaAsientoDto,
  ) {
    const data = await this.plantillasService.actualizar(tenantId, userId, plantillaId, dto);
    return { success: true, data, message: `Plantilla "${data.nombre}" actualizada` };
  }

  @Delete("plantillas-asientos/:id")
  @RequirePermission("contabilidad.plantillas.eliminar")
  @ApiOperation({
    summary: "Eliminar una plantilla",
    description:
      "El historial de asientos ya generados se conserva: siguen siendo rastreables.",
  })
  async eliminar(
    @CurrentTenant() tenantId: string,
    @CurrentUser("id") userId: string,
    @Param("id") plantillaId: string,
  ) {
    await this.plantillasService.eliminar(tenantId, userId, plantillaId);
    return { success: true, message: "Plantilla eliminada" };
  }

  @Post("plantillas-asientos/:id/generar")
  @RequirePermission("contabilidad.plantillas.generar")
  @ApiOperation({
    summary: "Generar un asiento desde la plantilla",
    description:
      "Permite sobrescribir fecha, concepto, referencia, estado e importes. " +
      "Una plantilla genera como mucho un asiento por período.",
  })
  @ApiResponse({ status: 201, type: AsientoResponseDto })
  @ApiResponse({
    status: 400,
    description: "La plantilla está inactiva o ya generó un asiento para el período",
  })
  async generar(
    @CurrentTenant() tenantId: string,
    @CurrentUser("id") userId: string,
    @Param("id") plantillaId: string,
    @Body() dto: GenerarDesdePlantillaDto,
  ) {
    const asiento = await this.plantillasService.generar(tenantId, userId, plantillaId, dto);

    return {
      success: true,
      data: asiento,
      message: `Asiento ${asiento.numero_asiento ?? asiento.id} generado desde la plantilla`,
    };
  }
}
