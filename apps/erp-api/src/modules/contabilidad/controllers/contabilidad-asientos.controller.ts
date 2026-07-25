import {
  Controller,
  Get,
  Post,
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
  ListarAsientosQueryDto,
  AsientoResponseDto,
  CreateAsientoManualDto,
} from "@erp-suite/dtos";
import { AsientosService } from "../services/asientos.service";

@ApiTags("contabilidad")
@Controller("contabilidad")
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ContabilidadAsientosController {
  constructor(private readonly asientosService: AsientosService) {}

  @Post("asiento-contable")
  @RequirePermission("contabilidad.asientos.crear") // HARDENING: creación manual de asiento.
  @ApiOperation({ summary: "Crear nuevo asiento contable manual" })
  @ApiResponse({
    status: 201,
    description: "Asiento contable creado exitosamente",
    type: AsientoResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: "Datos inválidos o asiento descuadrado",
  })
  @ApiResponse({
    status: 403,
    description: "Período contable cerrado o bloqueado",
  })
  async crearAsientoContable(
    @CurrentTenant() tenantId: string,
    @CurrentUser("id") userId: string,
    @Body() createAsientoDto: CreateAsientoManualDto,
  ): Promise<{ success: boolean; data: AsientoResponseDto; message: string }> {
    try {
      console.log(
        `📝 [Contabilidad] Creando asiento manual para tenant ${tenantId}`,
      );

      const asiento = await this.asientosService.crearAsientoManual(
        tenantId,
        userId,
        createAsientoDto,
      );

      return {
        success: true,
        data: asiento,
        message: `Asiento contable ${asiento.numero_asiento} creado exitosamente`,
      };
    } catch (error) {
      console.error("❌ [Contabilidad] Error creando asiento manual:", error);
      throw error;
    }
  }

  @Get("asientos-contables")
  @RequirePermission("contabilidad.asientos.read") // HARDENING: permisos granulares.
  @ApiOperation({
    summary: "Obtener listado de asientos contables con filtros",
  })
  @ApiResponse({
    status: 200,
    description: "Asientos contables obtenidos exitosamente",
    schema: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        data: {
          type: "array",
          items: { type: "object" },
        },
        total: { type: "number" },
        page: { type: "number" },
        limit: { type: "number" },
        totalPages: { type: "number" },
      },
    },
  })
  async getAsientosContables(
    @CurrentTenant() tenantId: string,
    @Query() filtros: ListarAsientosQueryDto,
  ) {
    try {
      console.log(
        "📚 [Contabilidad] Obteniendo asientos contables para tenant",
        tenantId,
        filtros,
      );

      const resultado = await this.asientosService.listarAsientos(
        tenantId,
        filtros,
      );

      return {
        success: true,
        ...resultado,
      };
    } catch (error) {
      console.error(
        "❌ [Contabilidad] Error obteniendo asientos contables:",
        error,
      );
      throw error;
    }
  }

  @Get("asientos-contables/:id")
  @RequirePermission("contabilidad.asientos.read") // HARDENING: permisos granulares.
  @ApiOperation({ summary: "Obtener un asiento contable específico por ID" })
  @ApiResponse({
    status: 200,
    description: "Asiento contable obtenido exitosamente",
    type: AsientoResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: "Asiento no encontrado",
  })
  async getAsientoContablePorId(
    @CurrentTenant() tenantId: string,
    @Param("id") asientoId: string,
  ): Promise<{ success: boolean; data: AsientoResponseDto }> {
    try {
      console.log(
        `📚 [Contabilidad] Obteniendo asiento ${asientoId} para tenant ${tenantId}`,
      );

      const asiento = await this.asientosService.obtenerAsientoPorId(
        tenantId,
        asientoId,
      );

      return {
        success: true,
        data: asiento,
      };
    } catch (error) {
      console.error("❌ [Contabilidad] Error obteniendo asiento:", error);
      throw error;
    }
  }

  @Get("asientos")
  @RequirePermission("contabilidad.asientos.read") // HARDENING: permisos granulares.
  @ApiOperation({ summary: "Listar asientos contables con filtros opcionales" })
  @ApiResponse({
    status: 200,
    description: "Lista de asientos contables obtenida exitosamente",
    schema: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        data: {
          type: "array",
          items: { $ref: "#/components/schemas/AsientoResponseDto" },
        },
        total: { type: "number", description: "Total de registros" },
        page: { type: "number", description: "Página actual" },
        limit: { type: "number", description: "Límite por página" },
        totalPages: { type: "number", description: "Total de páginas" },
        message: { type: "string" },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: "Parámetros inválidos",
  })
  async listarAsientos(
    @CurrentTenant() tenantId: string,
    @Query() filters: ListarAsientosQueryDto,
  ): Promise<{
    success: boolean;
    data: AsientoResponseDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    message: string;
  }> {
    try {
      console.log(
        `📒 [Contabilidad] Listando asientos para tenant ${tenantId} con filtros:`,
        filters,
      );

      const resultado = await this.asientosService.listarAsientos(
        tenantId,
        filters,
      );

      return {
        success: true,
        data: resultado.data,
        total: resultado.total,
        page: resultado.page,
        limit: resultado.limit,
        totalPages: resultado.totalPages,
        message: `${resultado.total} asiento(s) encontrado(s)`,
      };
    } catch (error) {
      console.error("❌ [Contabilidad] Error listando asientos:", error);
      throw error;
    }
  }

  @Get("asientos/estadisticas/por-tipo")
  @RequirePermission("contabilidad.asientos.read") // HARDENING: permisos granulares.
  @ApiOperation({
    summary: "Obtener estadísticas de asientos generados por tipo de evento",
  })
  @ApiResponse({
    status: 200,
    description: "Estadísticas de asientos por tipo obtenidas exitosamente",
    schema: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        data: {
          type: "array",
          items: {
            type: "object",
            properties: {
              tipo: {
                type: "string",
                description:
                  "Tipo de evento (VentaFacturada, CobroRegistrado, etc.)",
              },
              cantidad: {
                type: "number",
                description: "Cantidad de asientos generados",
              },
            },
          },
        },
        message: { type: "string" },
      },
    },
  })
  async obtenerEstadisticasAsientosPorTipo(
    @CurrentTenant() tenantId: string,
  ): Promise<{
    success: boolean;
    data: { tipo: string; cantidad: number }[];
    message: string;
  }> {
    try {
      console.log(
        `📊 [Contabilidad] Obteniendo estadísticas de asientos por tipo para tenant ${tenantId}`,
      );

      const estadisticas =
        await this.asientosService.obtenerEstadisticasAsientosPorTipo(tenantId);

      return {
        success: true,
        data: estadisticas,
        message: `Estadísticas de ${estadisticas.length} tipo(s) de asientos obtenidas`,
      };
    } catch (error) {
      console.error(
        "❌ [Contabilidad] Error obteniendo estadísticas de asientos por tipo:",
        error,
      );
      return {
        success: false,
        data: [],
        message: "Error obteniendo estadísticas de asientos por tipo",
      };
    }
  }

  @Get("asientos/:id")
  @RequirePermission("contabilidad.asientos.read") // HARDENING: permisos granulares.
  @ApiOperation({
    summary: "Obtener un asiento contable específico por ID con sus detalles",
  })
  @ApiResponse({
    status: 200,
    description: "Asiento contable obtenido exitosamente",
    type: AsientoResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: "Asiento no encontrado",
  })
  async obtenerAsientoPorId(
    @CurrentTenant() tenantId: string,
    @Param("id") asientoId: string,
  ): Promise<{ success: boolean; data: AsientoResponseDto; message: string }> {
    try {
      console.log(
        `📒 [Contabilidad] Obteniendo asiento ${asientoId} para tenant ${tenantId}`,
      );

      const asiento = await this.asientosService.obtenerAsientoPorId(
        tenantId,
        asientoId,
      );

      return {
        success: true,
        data: asiento,
        message: "Asiento contable obtenido exitosamente",
      };
    } catch (error) {
      console.error("❌ [Contabilidad] Error obteniendo asiento:", error);
      throw error;
    }
  }
}
