import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Query,
  Param,
  Headers,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { SupabaseService } from "../../../shared/supabase/supabase.service";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { CurrentTenant, CurrentUser } from "../../../common";
import { PermissionGuard } from "../../../common/guards/permission.guard";
import { RequirePermission } from "../../../common/decorators/require-permission.decorator";
import {
  CreatePresupuestoDto,
  UpdatePresupuestoDto,
  PresupuestoResponseDto,
} from "@erp-suite/dtos";
import { PresupuestosService } from "../services/presupuestos.service";

@ApiTags("contabilidad")
@Controller("contabilidad")
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ContabilidadPresupuestosController {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly presupuestosService: PresupuestosService,
  ) {}

  @Post("presupuestos")
  @RequirePermission("contabilidad.presupuestos.crear") // HARDENING: permisos granulares.
  @ApiOperation({
    summary: "Crear nuevo presupuesto por centro de costo, cuenta y período",
  })
  @ApiResponse({
    status: 201,
    description: "Presupuesto creado exitosamente",
    type: PresupuestoResponseDto,
  })
  @ApiResponse({
    status: 400,
    description:
      "Datos inválidos o presupuesto duplicado (ya existe para el mismo centro, cuenta y período)",
  })
  async crearPresupuesto(
    @CurrentTenant() tenantId: string,
    @CurrentUser("id") userId: string,
    @Body() createPresupuestoDto: CreatePresupuestoDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<{
    success: boolean;
    data: PresupuestoResponseDto;
    message: string;
  }> {
    try {
      console.log(
        `💰 [Contabilidad] Creando presupuesto para tenant ${tenantId}`,
      );

      const presupuesto = await this.presupuestosService.crearPresupuesto(
        tenantId,
        createPresupuestoDto,
        userId,
        idempotencyKey,
      );

      return {
        success: true,
        data: presupuesto as PresupuestoResponseDto,
        message: "Presupuesto creado exitosamente",
      };
    } catch (error) {
      console.error("❌ [Contabilidad] Error creando presupuesto:", error);
      throw error;
    }
  }

  @Get("presupuestos")
  @RequirePermission("contabilidad.presupuestos.read") // HARDENING: permisos granulares.
  @ApiOperation({ summary: "Listar presupuestos con filtros opcionales" })
  @ApiResponse({
    status: 200,
    description: "Lista de presupuestos obtenida exitosamente",
    type: [PresupuestoResponseDto],
  })
  @ApiResponse({
    status: 400,
    description: "Parámetros inválidos",
  })
  async listarPresupuestos(
    @CurrentTenant() tenantId: string,
    @Query("centro_costo_id") centroCostoId?: string,
    @Query("cuenta_id") cuentaId?: string,
    @Query("periodo_contable_id") periodoContableId?: string,
    @Query("estado") estado?: string,
  ): Promise<{
    success: boolean;
    data: PresupuestoResponseDto[];
    message?: string;
  }> {
    try {
      console.log(
        `💰 [Contabilidad] Listando presupuestos para tenant ${tenantId}`,
      );

      // Construir filtros
      const filters: any = {};
      if (centroCostoId) filters.centro_costo_id = centroCostoId;
      if (cuentaId) filters.cuenta_id = cuentaId;
      if (periodoContableId) filters.periodo_contable_id = periodoContableId;
      if (estado) filters.estado = estado;

      const presupuestos = await this.presupuestosService.obtenerPresupuestos(
        tenantId,
        filters,
      );

      return {
        success: true,
        data: presupuestos as PresupuestoResponseDto[],
        message: `${presupuestos.length} presupuesto(s) encontrado(s)`,
      };
    } catch (error) {
      console.error("❌ [Contabilidad] Error listando presupuestos:", error);
      throw error;
    }
  }

  @Get("presupuestos/:id")
  @RequirePermission("contabilidad.presupuestos.read") // HARDENING: permisos granulares.
  @ApiOperation({ summary: "Obtener un presupuesto específico por ID" })
  @ApiResponse({
    status: 200,
    description: "Presupuesto obtenido exitosamente",
    type: PresupuestoResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: "Presupuesto no encontrado",
  })
  async obtenerPresupuestoPorId(
    @CurrentTenant() tenantId: string,
    @Param("id") presupuestoId: string,
  ): Promise<{
    success: boolean;
    data: PresupuestoResponseDto;
    message?: string;
  }> {
    try {
      console.log(
        `💰 [Contabilidad] Obteniendo presupuesto ${presupuestoId} para tenant ${tenantId}`,
      );

      const presupuesto =
        await this.presupuestosService.obtenerPresupuestoPorId(
          tenantId,
          presupuestoId,
        );

      return {
        success: true,
        data: presupuesto as PresupuestoResponseDto,
        message: "Presupuesto obtenido exitosamente",
      };
    } catch (error) {
      console.error("❌ [Contabilidad] Error obteniendo presupuesto:", error);
      throw error;
    }
  }

  @Put("presupuestos/:id")
  @RequirePermission("contabilidad.presupuestos.actualizar") // HARDENING: permisos granulares.
  @ApiOperation({ summary: "Actualizar un presupuesto existente" })
  @ApiResponse({
    status: 200,
    description: "Presupuesto actualizado exitosamente",
    type: PresupuestoResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: "Datos inválidos o período cerrado",
  })
  @ApiResponse({
    status: 404,
    description: "Presupuesto no encontrado",
  })
  async actualizarPresupuesto(
    @CurrentTenant() tenantId: string,
    @CurrentUser("id") userId: string,
    @Param("id") presupuestoId: string,
    @Body() updatePresupuestoDto: UpdatePresupuestoDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<{
    success: boolean;
    data: PresupuestoResponseDto;
    message: string;
  }> {
    try {
      console.log(
        `💰 [Contabilidad] Actualizando presupuesto ${presupuestoId} para tenant ${tenantId}`,
      );

      const presupuesto = await this.presupuestosService.actualizarPresupuesto(
        tenantId,
        presupuestoId,
        updatePresupuestoDto,
        userId,
        idempotencyKey,
      );

      return {
        success: true,
        data: presupuesto as PresupuestoResponseDto,
        message: "Presupuesto actualizado exitosamente",
      };
    } catch (error) {
      console.error("❌ [Contabilidad] Error actualizando presupuesto:", error);
      throw error;
    }
  }

  @Delete("presupuestos/:id")
  @RequirePermission("contabilidad.presupuestos.eliminar") // HARDENING: permisos granulares.
  @ApiOperation({ summary: "Eliminar un presupuesto existente" })
  @ApiResponse({
    status: 200,
    description: "Presupuesto eliminado exitosamente",
    type: PresupuestoResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: "No se puede eliminar el presupuesto (período cerrado)",
  })
  @ApiResponse({
    status: 404,
    description: "Presupuesto no encontrado",
  })
  async eliminarPresupuesto(
    @CurrentTenant() tenantId: string,
    @CurrentUser("id") userId: string,
    @Param("id") presupuestoId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<{
    success: boolean;
    data: PresupuestoResponseDto;
    message: string;
  }> {
    try {
      console.log(
        `💰 [Contabilidad] Eliminando presupuesto ${presupuestoId} para tenant ${tenantId}`,
      );

      const presupuesto = await this.presupuestosService.eliminarPresupuesto(
        tenantId,
        presupuestoId,
        userId,
        idempotencyKey,
      );

      return {
        success: true,
        data: presupuesto as PresupuestoResponseDto,
        message: "Presupuesto eliminado exitosamente",
      };
    } catch (error) {
      console.error("❌ [Contabilidad] Error eliminando presupuesto:", error);
      throw error;
    }
  }

  @Get("presupuestos/centro/:centroId/periodo/:periodoId")
  @RequirePermission("contabilidad.presupuestos.read") // HARDENING: permisos granulares.
  @ApiOperation({
    summary: "Obtener presupuestos por centro de costo y período",
  })
  @ApiResponse({
    status: 200,
    description:
      "Presupuestos obtenidos exitosamente con cálculos de ejecución",
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
              },
            },
            periodo: {
              type: "object",
              properties: {
                id: { type: "string" },
                anio: { type: "number" },
                mes: { type: "number" },
                estado: { type: "string" },
              },
            },
            presupuestos: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  cuenta: { type: "object" },
                  monto_presupuestado: { type: "number" },
                  monto_ejecutado: { type: "number" },
                  monto_comprometido: { type: "number" },
                  monto_disponible: { type: "number" },
                  porcentaje_ejecutado: { type: "number" },
                  alerta: {
                    type: "string",
                    enum: ["NORMAL", "ADVERTENCIA", "SOBREGIRO"],
                  },
                },
              },
            },
            resumen: {
              type: "object",
              properties: {
                total_presupuestado: { type: "number" },
                total_ejecutado: { type: "number" },
                total_disponible: { type: "number" },
                porcentaje_ejecucion_global: { type: "number" },
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
    description: "Centro de costo o período no encontrado",
  })
  async obtenerPresupuestosPorCentroYPeriodo(
    @CurrentTenant() tenantId: string,
    @Param("centroId") centroCostoId: string,
    @Param("periodoId") periodoContableId: string,
  ): Promise<{ success: boolean; data: any; message: string }> {
    try {
      console.log(
        `💰 [Contabilidad] Obteniendo presupuestos para centro ${centroCostoId} y período ${periodoContableId}`,
      );

      // Verificar que el centro de costo existe y pertenece al tenant
      const { data: centroCosto, error: errorCentro } =
        await this.supabaseService
          .getClient()
          .from("centros_costo")
          .select("id, codigo, nombre, descripcion")
          .eq("id", centroCostoId)
          .eq("tenant_id", tenantId)
          .maybeSingle();

      if (errorCentro || !centroCosto) {
        return {
          success: false,
          data: null,
          message:
            "Centro de costo no encontrado o no pertenece a su organización",
        };
      }

      // Verificar que el período existe y pertenece al tenant
      const { data: periodo, error: errorPeriodo } = await this.supabaseService
        .getClient()
        .from("periodos_contables")
        .select("id, anio, mes, estado")
        .eq("id", periodoContableId)
        .eq("tenant_id", tenantId)
        .maybeSingle();

      if (errorPeriodo || !periodo) {
        return {
          success: false,
          data: null,
          message:
            "Período contable no encontrado o no pertenece a su organización",
        };
      }

      // Obtener presupuestos con cálculos
      const presupuestos =
        await this.presupuestosService.obtenerPresupuestosPorCentroYPeriodo(
          tenantId,
          centroCostoId,
          periodoContableId,
        );

      // Calcular resumen
      const totalPresupuestado = presupuestos.reduce(
        (sum, p) => sum + p.monto_presupuestado,
        0,
      );
      const totalEjecutado = presupuestos.reduce(
        (sum, p) => sum + p.monto_ejecutado,
        0,
      );
      const totalDisponible = presupuestos.reduce(
        (sum, p) => sum + p.monto_disponible,
        0,
      );
      const porcentajeEjecucionGlobal =
        totalPresupuestado > 0
          ? (totalEjecutado / totalPresupuestado) * 100
          : 0;

      return {
        success: true,
        data: {
          centro_costo: centroCosto,
          periodo: periodo,
          presupuestos: presupuestos,
          resumen: {
            total_presupuestos: presupuestos.length,
            total_presupuestado: totalPresupuestado,
            total_ejecutado: totalEjecutado,
            total_comprometido: presupuestos.reduce(
              (sum, p) => sum + (p.monto_comprometido || 0),
              0,
            ),
            total_disponible: totalDisponible,
            porcentaje_ejecucion_global: porcentajeEjecucionGlobal,
            alertas: {
              sobregiros: presupuestos.filter((p) => p.alerta === "SOBREGIRO")
                .length,
              advertencias: presupuestos.filter(
                (p) => p.alerta === "ADVERTENCIA",
              ).length,
              normales: presupuestos.filter((p) => p.alerta === "NORMAL")
                .length,
            },
          },
        },
        message: `${presupuestos.length} presupuesto(s) encontrado(s) para ${centroCosto.nombre} en ${periodo.anio}-${String(periodo.mes).padStart(2, "0")}`,
      };
    } catch (error) {
      console.error(
        "❌ [Contabilidad] Error obteniendo presupuestos por centro y período:",
        error,
      );
      throw error;
    }
  }

  @Get("presupuestos/comparacion/:periodoId")
  @RequirePermission("contabilidad.presupuestos.read") // HARDENING: permisos granulares.
  @ApiOperation({
    summary:
      "Obtener comparación de presupuesto vs real para todos los centros de costo en un período",
  })
  @ApiResponse({
    status: 200,
    description: "Comparación de presupuesto vs real obtenida exitosamente",
    schema: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        data: {
          type: "object",
          properties: {
            periodo: {
              type: "object",
              properties: {
                id: { type: "string" },
                anio: { type: "number" },
                mes: { type: "number" },
                estado: { type: "string" },
                descripcion: { type: "string" },
              },
            },
            centros_costo: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  centro_costo: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      codigo: { type: "string" },
                      nombre: { type: "string" },
                      descripcion: { type: "string" },
                    },
                  },
                  cuentas: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        cuenta: { type: "object" },
                        monto_presupuestado: { type: "number" },
                        monto_ejecutado: { type: "number" },
                        monto_comprometido: { type: "number" },
                        monto_disponible: { type: "number" },
                        porcentaje_ejecutado: { type: "number" },
                        variacion: { type: "number" },
                        variacion_porcentaje: { type: "number" },
                        alerta: {
                          type: "string",
                          enum: ["NORMAL", "ADVERTENCIA", "SOBREGIRO"],
                        },
                      },
                    },
                  },
                  totales: {
                    type: "object",
                    properties: {
                      presupuestado: { type: "number" },
                      ejecutado: { type: "number" },
                      comprometido: { type: "number" },
                      disponible: { type: "number" },
                      variacion: { type: "number" },
                      porcentaje_ejecucion: { type: "number" },
                      variacion_porcentaje: { type: "number" },
                      alerta: { type: "string" },
                    },
                  },
                },
              },
            },
            resumen_global: {
              type: "object",
              properties: {
                total_presupuestado: { type: "number" },
                total_ejecutado: { type: "number" },
                total_comprometido: { type: "number" },
                total_disponible: { type: "number" },
                total_variacion: { type: "number" },
                porcentaje_ejecucion: { type: "number" },
                variacion_porcentaje: { type: "number" },
                total_centros: { type: "number" },
                total_cuentas: { type: "number" },
                alertas: {
                  type: "object",
                  properties: {
                    sobregiros: { type: "number" },
                    advertencias: { type: "number" },
                    normales: { type: "number" },
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
    description: "Período no encontrado",
  })
  async obtenerComparacionPresupuestoVsReal(
    @CurrentTenant() tenantId: string,
    @Param("periodoId") periodoContableId: string,
  ): Promise<{ success: boolean; data: any; message: string }> {
    try {
      console.log(
        `💰 [Contabilidad] Obteniendo comparación presupuesto vs real para período ${periodoContableId}`,
      );

      const comparacion =
        await this.presupuestosService.obtenerComparacionPresupuestoVsReal(
          tenantId,
          periodoContableId,
        );

      return {
        success: true,
        data: comparacion,
        message: `Comparación generada para ${comparacion.centros_costo.length} centro(s) de costo con ${comparacion.resumen_global.total_cuentas} cuenta(s) presupuestada(s)`,
      };
    } catch (error) {
      console.error(
        "❌ [Contabilidad] Error obteniendo comparación presupuesto vs real:",
        error,
      );
      throw error;
    }
  }

  @Post("presupuestos/:id/actualizar-ejecucion")
  @RequirePermission("contabilidad.presupuestos.ejecucion") // HARDENING: permisos granulares.
  @ApiOperation({
    summary:
      "Actualizar la ejecución presupuestal de un presupuesto específico",
  })
  @ApiResponse({
    status: 200,
    description: "Ejecución presupuestal actualizada exitosamente",
    type: PresupuestoResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: "Presupuesto no encontrado",
  })
  async actualizarEjecucionPresupuestal(
    @CurrentTenant() tenantId: string,
    @Param("id") presupuestoId: string,
  ): Promise<{
    success: boolean;
    data: PresupuestoResponseDto;
    message: string;
  }> {
    try {
      console.log(
        `💰 [Contabilidad] Actualizando ejecución presupuestal para presupuesto ${presupuestoId}`,
      );

      const presupuesto =
        await this.presupuestosService.actualizarEjecucionPresupuestal(
          tenantId,
          presupuestoId,
        );

      // Determinar mensaje según nivel de alerta
      let mensaje = "Ejecución presupuestal actualizada exitosamente";
      if (presupuesto.porcentaje_ejecutado > 100) {
        mensaje += ` - ⚠️ SOBREGIRO: ${presupuesto.porcentaje_ejecutado}% ejecutado`;
      } else if (presupuesto.porcentaje_ejecutado > 90) {
        mensaje += ` - ⚠️ ADVERTENCIA: ${presupuesto.porcentaje_ejecutado}% ejecutado`;
      }

      return {
        success: true,
        data: presupuesto as PresupuestoResponseDto,
        message: mensaje,
      };
    } catch (error) {
      console.error(
        "❌ [Contabilidad] Error actualizando ejecución presupuestal:",
        error,
      );
      throw error;
    }
  }

  @Post("presupuestos/periodo/:periodoId/actualizar-ejecucion")
  @RequirePermission("contabilidad.presupuestos.ejecucion") // HARDENING: permisos granulares.
  @ApiOperation({
    summary:
      "Actualizar la ejecución presupuestal de todos los presupuestos de un período",
  })
  @ApiResponse({
    status: 200,
    description:
      "Ejecución presupuestal actualizada para todos los presupuestos del período",
    schema: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        data: {
          type: "object",
          properties: {
            actualizados: { type: "number" },
            errores: { type: "number" },
          },
        },
        message: { type: "string" },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: "Período no encontrado",
  })
  async actualizarEjecucionPresupuestalPorPeriodo(
    @CurrentTenant() tenantId: string,
    @Param("periodoId") periodoContableId: string,
  ): Promise<{
    success: boolean;
    data: { actualizados: number; errores: number };
    message: string;
  }> {
    try {
      console.log(
        `💰 [Contabilidad] Actualizando ejecución presupuestal para todos los presupuestos del período ${periodoContableId}`,
      );

      const resultado =
        await this.presupuestosService.actualizarEjecucionPresupuestalPorPeriodo(
          tenantId,
          periodoContableId,
        );

      return {
        success: true,
        data: resultado,
        message: `Actualización masiva completada: ${resultado.actualizados} presupuesto(s) actualizado(s), ${resultado.errores} error(es)`,
      };
    } catch (error) {
      console.error(
        "❌ [Contabilidad] Error actualizando ejecución presupuestal por período:",
        error,
      );
      throw error;
    }
  }

  @Get("presupuestos/alertas")
  @RequirePermission("contabilidad.presupuestos.read") // HARDENING: permisos granulares.
  @ApiOperation({
    summary: "Obtener todas las alertas de sobregiro presupuestal activas",
  })
  @ApiResponse({
    status: 200,
    description: "Alertas de sobregiro obtenidas exitosamente",
    schema: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        data: {
          type: "array",
          items: {
            type: "object",
            properties: {
              presupuesto_id: { type: "string" },
              nivel_alerta: {
                type: "string",
                enum: ["SOBREGIRO", "ADVERTENCIA"],
              },
              severidad: { type: "string", enum: ["CRITICO", "ALTO"] },
              porcentaje_ejecutado: { type: "number" },
              monto_presupuestado: { type: "number" },
              monto_ejecutado: { type: "number" },
              monto_comprometido: { type: "number" },
              monto_disponible: { type: "number" },
              excedente: { type: "number" },
              centro_costo: { type: "object" },
              cuenta: { type: "object" },
              periodo: { type: "object" },
              mensaje: { type: "string" },
              fecha_deteccion: { type: "string" },
            },
          },
        },
        message: { type: "string" },
      },
    },
  })
  async obtenerAlertasSobregiro(
    @CurrentTenant() tenantId: string,
    @Query("periodo_id") periodoContableId?: string,
  ): Promise<{ success: boolean; data: any[]; message: string }> {
    try {
      console.log(
        `🚨 [Contabilidad] Obteniendo alertas de sobregiro para tenant ${tenantId}`,
      );

      const alertas = await this.presupuestosService.obtenerAlertasSobregiro(
        tenantId,
        periodoContableId,
      );

      const sobregiros = alertas.filter(
        (a) => a.nivel_alerta === "SOBREGIRO",
      ).length;
      const advertencias = alertas.filter(
        (a) => a.nivel_alerta === "ADVERTENCIA",
      ).length;

      return {
        success: true,
        data: alertas,
        message: `${alertas.length} alerta(s) detectada(s): ${sobregiros} sobregiro(s), ${advertencias} advertencia(s)`,
      };
    } catch (error) {
      console.error(
        "❌ [Contabilidad] Error obteniendo alertas de sobregiro:",
        error,
      );
      throw error;
    }
  }

  @Get("presupuestos/alertas/resumen")
  @RequirePermission("contabilidad.presupuestos.read") // HARDENING: permisos granulares.
  @ApiOperation({
    summary: "Obtener resumen de alertas agrupadas por nivel de severidad",
  })
  @ApiResponse({
    status: 200,
    description: "Resumen de alertas obtenido exitosamente",
    schema: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        data: {
          type: "object",
          properties: {
            total_alertas: { type: "number" },
            sobregiros: {
              type: "object",
              properties: {
                cantidad: { type: "number" },
                total_excedente: { type: "number" },
                alertas: { type: "array" },
              },
            },
            advertencias: {
              type: "object",
              properties: {
                cantidad: { type: "number" },
                total_en_riesgo: { type: "number" },
                alertas: { type: "array" },
              },
            },
            fecha_generacion: { type: "string" },
          },
        },
        message: { type: "string" },
      },
    },
  })
  async obtenerResumenAlertas(
    @CurrentTenant() tenantId: string,
    @Query("periodo_id") periodoContableId?: string,
  ): Promise<{ success: boolean; data: any; message: string }> {
    try {
      console.log(
        `📊 [Contabilidad] Obteniendo resumen de alertas para tenant ${tenantId}`,
      );

      const resumen = await this.presupuestosService.obtenerResumenAlertas(
        tenantId,
        periodoContableId,
      );

      return {
        success: true,
        data: resumen,
        message: `Resumen generado: ${resumen.total_alertas} alerta(s) total(es)`,
      };
    } catch (error) {
      console.error(
        "❌ [Contabilidad] Error obteniendo resumen de alertas:",
        error,
      );
      throw error;
    }
  }
}
