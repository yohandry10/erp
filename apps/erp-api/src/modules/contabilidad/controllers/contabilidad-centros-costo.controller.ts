import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Query,
  Param,
  Headers,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { CurrentTenant, CurrentUser } from "../../../common";
import { PermissionGuard } from "../../../common/guards/permission.guard";
import { RequirePermission } from "../../../common/decorators/require-permission.decorator";
import { CentrosCostoService } from "../services/centros-costo.service";

@ApiTags("contabilidad")
@Controller("contabilidad")
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ContabilidadCentrosCostoController {
  constructor(private readonly centrosCostoService: CentrosCostoService) {}

  @Get("centros-costo")
  @RequirePermission("contabilidad.centros_costo.read") // HARDENING: permisos granulares.
  @ApiOperation({ summary: "Listar todos los centros de costo del tenant" })
  @ApiResponse({
    status: 200,
    description: "Centros de costo obtenidos exitosamente",
  })
  async listarCentrosCosto(
    @CurrentTenant() tenantId: string,
  ): Promise<{ success: boolean; data: any[] }> {
    try {
      console.log(
        `🏢 [Contabilidad] Listando centros de costo para tenant ${tenantId}`,
      );

      const centros =
        await this.centrosCostoService.listarCentrosCosto(tenantId);

      return {
        success: true,
        data: centros,
      };
    } catch (error) {
      console.error(
        "❌ [Contabilidad] Error listando centros de costo:",
        error,
      );
      throw error;
    }
  }

  @Get("centros-costo/:id")
  @RequirePermission("contabilidad.centros_costo.read") // HARDENING: permisos granulares.
  @ApiOperation({ summary: "Obtener un centro de costo específico por ID" })
  @ApiResponse({
    status: 200,
    description: "Centro de costo obtenido exitosamente",
  })
  @ApiResponse({
    status: 404,
    description: "Centro de costo no encontrado",
  })
  async obtenerCentroCosto(
    @CurrentTenant() tenantId: string,
    @Param("id") id: string,
  ): Promise<{ success: boolean; data: any }> {
    try {
      console.log(
        `🏢 [Contabilidad] Obteniendo centro de costo ${id} para tenant ${tenantId}`,
      );

      const centro = await this.centrosCostoService.obtenerCentroCosto(
        tenantId,
        id,
      );

      return {
        success: true,
        data: centro,
      };
    } catch (error) {
      console.error(
        "❌ [Contabilidad] Error obteniendo centro de costo:",
        error,
      );
      throw error;
    }
  }

  @Post("centros-costo")
  @RequirePermission("contabilidad.centros_costo.crear") // HARDENING: permisos granulares.
  @ApiOperation({ summary: "Crear nuevo centro de costo" })
  @ApiResponse({
    status: 201,
    description: "Centro de costo creado exitosamente",
  })
  @ApiResponse({
    status: 400,
    description: "Datos inválidos o código duplicado",
  })
  async crearCentroCosto(
    @CurrentTenant() tenantId: string,
    @CurrentUser("id") userId:string,
    @Body() body: { codigo: string; nombre: string; descripcion?: string },
    @Headers('idempotency-key') idempotencyKey?:string,
  ): Promise<{ success: boolean; data: any; message: string }> {
    try {
      console.log(
        `🏢 [Contabilidad] Creando centro de costo ${body.codigo} para tenant ${tenantId}`,
      );

      const centro = await this.centrosCostoService.crearCentroCosto(
        tenantId,
        body.codigo,
        body.nombre,
        body.descripcion,
        userId,
        idempotencyKey,
      );

      return {
        success: true,
        data: centro,
        message: `Centro de costo ${body.codigo} creado exitosamente`,
      };
    } catch (error) {
      console.error("❌ [Contabilidad] Error creando centro de costo:", error);
      throw error;
    }
  }

  @Put("centros-costo/:id")
  @RequirePermission("contabilidad.centros_costo.actualizar") // HARDENING: permisos granulares.
  @ApiOperation({ summary: "Actualizar un centro de costo existente" })
  @ApiResponse({
    status: 200,
    description: "Centro de costo actualizado exitosamente",
  })
  @ApiResponse({
    status: 404,
    description: "Centro de costo no encontrado",
  })
  @ApiResponse({
    status: 400,
    description: "Datos inválidos o código duplicado",
  })
  async actualizarCentroCosto(
    @CurrentTenant() tenantId: string,
    @CurrentUser("id") userId:string,
    @Param("id") id: string,
    @Body()
    body: {
      codigo?: string;
      nombre?: string;
      descripcion?: string;
      activo?: boolean;
    },
    @Headers('idempotency-key') idempotencyKey?:string,
  ): Promise<{ success: boolean; data: any; message: string }> {
    try {
      console.log(
        `🏢 [Contabilidad] Actualizando centro de costo ${id} para tenant ${tenantId}`,
      );

      const centro = await this.centrosCostoService.actualizarCentroCosto(
        tenantId,
        id,
        body,
        userId,
        idempotencyKey,
      );

      return {
        success: true,
        data: centro,
        message: `Centro de costo actualizado exitosamente`,
      };
    } catch (error) {
      console.error(
        "❌ [Contabilidad] Error actualizando centro de costo:",
        error,
      );
      throw error;
    }
  }

  @Get("centros-costo/:id/asientos")
  @RequirePermission("contabilidad.centros_costo.read") // HARDENING: permisos granulares.
  @ApiOperation({ summary: "Obtener asientos contables por centro de costo" })
  @ApiResponse({
    status: 200,
    description: "Asientos contables obtenidos exitosamente",
    schema: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        data: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              numero_asiento: { type: "string" },
              fecha: { type: "string", format: "date" },
              concepto: { type: "string" },
              referencia: { type: "string" },
              total_debe: { type: "number" },
              total_haber: { type: "number" },
              estado: { type: "string" },
              detalles: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    cuenta_id: { type: "string" },
                    cuenta_codigo: { type: "string" },
                    cuenta_nombre: { type: "string" },
                    debe: { type: "number" },
                    haber: { type: "number" },
                    concepto: { type: "string" },
                    centro_costo_id: { type: "string" },
                    centro_costo_nombre: { type: "string" },
                  },
                },
              },
            },
          },
        },
        pagination: {
          type: "object",
          properties: {
            total: { type: "number" },
            page: { type: "number" },
            limit: { type: "number" },
            totalPages: { type: "number" },
          },
        },
        message: { type: "string" },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: "Centro de costo no encontrado",
  })
  async obtenerAsientosPorCentro(
    @CurrentTenant() tenantId: string,
    @Param("id") centroCostoId: string,
    @Query("fecha_desde") fechaDesde?: string,
    @Query("fecha_hasta") fechaHasta?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ): Promise<{
    success: boolean;
    data: any[];
    pagination: any;
    message: string;
  }> {
    try {
      console.log(
        `🏢 [Contabilidad] Obteniendo asientos para centro de costo ${centroCostoId}`,
      );

      const filters = {
        fecha_desde: fechaDesde,
        fecha_hasta: fechaHasta,
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? parseInt(limit, 10) : 50,
      };

      const resultado = await this.centrosCostoService.obtenerAsientosPorCentro(
        tenantId,
        centroCostoId,
        filters,
      );

      return {
        success: true,
        data: resultado.data,
        pagination: {
          total: resultado.total,
          page: resultado.page,
          limit: resultado.limit,
          totalPages: resultado.totalPages,
        },
        message: `${resultado.total} asiento(s) encontrado(s) para el centro de costo`,
      };
    } catch (error) {
      console.error(
        "❌ [Contabilidad] Error obteniendo asientos por centro de costo:",
        error,
      );
      throw error;
    }
  }

  @Get("centros-costo/:id/reporte-gastos")
  @RequirePermission("contabilidad.reportes.read") // HARDENING: permisos granulares.
  @ApiOperation({ summary: "Obtener reporte de gastos por centro de costo" })
  @ApiResponse({
    status: 200,
    description: "Reporte de gastos obtenido exitosamente",
    schema: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        data: {
          type: "object",
          properties: {
            centro_costo: {
              type: "object",
              properties: {
                id: { type: "string" },
                codigo: { type: "string" },
                nombre: { type: "string" },
                descripcion: { type: "string" },
                activo: { type: "boolean" },
              },
            },
            periodo: {
              type: "object",
              properties: {
                fecha_desde: { type: "string", format: "date" },
                fecha_hasta: { type: "string", format: "date" },
              },
            },
            gastos_por_cuenta: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  cuenta_id: { type: "string" },
                  cuenta_codigo: { type: "string" },
                  cuenta_nombre: { type: "string" },
                  total_debe: { type: "number" },
                  total_haber: { type: "number" },
                  saldo: { type: "number" },
                  cantidad_movimientos: { type: "number" },
                },
              },
            },
            resumen: {
              type: "object",
              properties: {
                total_gastos: { type: "number" },
                total_movimientos: { type: "number" },
                cuenta_mayor_gasto: {
                  type: "object",
                  nullable: true,
                  properties: {
                    codigo: { type: "string" },
                    nombre: { type: "string" },
                    monto: { type: "number" },
                  },
                },
              },
            },
          },
        },
        message: { type: "string" },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: "Centro de costo no encontrado",
  })
  async obtenerReporteGastosPorCentro(
    @CurrentTenant() tenantId: string,
    @Param("id") centroCostoId: string,
    @Query("fecha_desde") fechaDesde?: string,
    @Query("fecha_hasta") fechaHasta?: string,
  ): Promise<{ success: boolean; data: any; message: string }> {
    try {
      console.log(
        `📊 [Contabilidad] Generando reporte de gastos para centro de costo ${centroCostoId}`,
      );

      const filters = {
        fecha_desde: fechaDesde,
        fecha_hasta: fechaHasta,
      };

      const reporte =
        await this.centrosCostoService.obtenerReporteGastosPorCentro(
          tenantId,
          centroCostoId,
          filters,
        );

      return {
        success: true,
        data: reporte,
        message: `Reporte generado: ${reporte.gastos_por_cuenta.length} cuenta(s) con gastos, total: S/ ${reporte.resumen.total_gastos.toFixed(2)}`,
      };
    } catch (error) {
      console.error(
        "❌ [Contabilidad] Error generando reporte de gastos por centro de costo:",
        error,
      );
      throw error;
    }
  }
}
