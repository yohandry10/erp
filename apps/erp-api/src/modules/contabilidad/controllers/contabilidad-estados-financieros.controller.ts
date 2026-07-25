import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { AccountingBooksService } from "../../../shared/integration/accounting-books.service";
import { SupabaseService } from "../../../shared/supabase/supabase.service";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { CurrentTenant } from "../../../common";
import { PermissionGuard } from "../../../common/guards/permission.guard";
import { RequirePermission } from "../../../common/decorators/require-permission.decorator";
import { EstadosFinancierosService } from "../services/estados-financieros.service";
import { CashflowService } from "../services/cashflow.service";
import { PeriodoQueryDto } from "../dto/periodo-query.dto";

@ApiTags("contabilidad")
@Controller("contabilidad")
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ContabilidadEstadosFinancierosController {
  constructor(
    private readonly accountingService: AccountingBooksService,
    private readonly supabaseService: SupabaseService,
    private readonly estadosFinancierosService: EstadosFinancierosService,
    private readonly cashflowService: CashflowService,
  ) {}

  @Get("estados/balance-comprobacion")
  @RequirePermission("contabilidad.reportes.read") // HARDENING: permisos granulares.
  @ApiOperation({ summary: "Obtener Balance de Comprobación por período" })
  @ApiResponse({
    status: 200,
    description: "Balance de Comprobación obtenido exitosamente",
  })
  @ApiResponse({
    status: 400,
    description: "Parámetros inválidos (anio y mes son requeridos)",
  })
  async getBalanceComprobacionPorPeriodo(
    @CurrentTenant() tenantId: string,
    @Query("anio") anio?: string,
    @Query("mes") mes?: string,
  ): Promise<{ success: boolean; data: any; message?: string }> {
    try {
      // Validar parámetros requeridos
      if (!anio || !mes) {
        return {
          success: false,
          data: null,
          message: "Los parámetros anio y mes son requeridos",
        };
      }

      const anioNum = parseInt(anio, 10);
      const mesNum = parseInt(mes, 10);

      // Validar rangos
      if (isNaN(anioNum) || isNaN(mesNum) || mesNum < 1 || mesNum > 12) {
        return {
          success: false,
          data: null,
          message:
            "Parámetros inválidos: anio debe ser un número y mes debe estar entre 1 y 12",
        };
      }

      console.log(
        `⚖️ [Contabilidad] Obteniendo Balance de Comprobación para ${anioNum}-${mesNum}, tenant: ${tenantId}`,
      );

      const balance =
        await this.estadosFinancierosService.getBalanceComprobacion(
          tenantId,
          anioNum,
          mesNum,
        );

      // Calcular totales
      const totalDebe = balance.reduce((sum, item) => sum + item.debe, 0);
      const totalHaber = balance.reduce((sum, item) => sum + item.haber, 0);
      const diferencia = totalDebe - totalHaber;

      return {
        success: true,
        data: {
          periodo: {
            anio: anioNum,
            mes: mesNum,
            descripcion: `${anioNum}-${String(mesNum).padStart(2, "0")}`,
          },
          cuentas: balance,
          totales: {
            debe: totalDebe,
            haber: totalHaber,
            diferencia: diferencia,
            cuadrado: Math.abs(diferencia) < 0.01, // Tolerancia de 1 centavo
          },
          resumen: {
            total_cuentas: balance.length,
            cuentas_con_saldo: balance.filter(
              (c) => Math.abs(c.saldo_final) > 0.01,
            ).length,
          },
        },
      };
    } catch (error) {
      console.error(
        "❌ [Contabilidad] Error obteniendo Balance de Comprobación:",
        error,
      );
      throw error;
    }
  }

  @Get("estados/estado-resultados")
  @RequirePermission("contabilidad.reportes.read") // HARDENING: permisos granulares.
  @ApiOperation({ summary: "Obtener Estado de Resultados (P&L) por período" })
  @ApiResponse({
    status: 200,
    description: "Estado de Resultados obtenido exitosamente",
  })
  @ApiResponse({
    status: 400,
    description: "Parámetros inválidos (anio y mes son requeridos)",
  })
  async getEstadoResultadosPorPeriodo(
    @CurrentTenant() tenantId: string,
    @Query("anio") anio?: string,
    @Query("mes") mes?: string,
  ): Promise<{ success: boolean; data: any; message?: string }> {
    try {
      // Validar parámetros requeridos
      if (!anio || !mes) {
        return {
          success: false,
          data: null,
          message: "Los parámetros anio y mes son requeridos",
        };
      }

      const anioNum = parseInt(anio, 10);
      const mesNum = parseInt(mes, 10);

      // Validar rangos
      if (isNaN(anioNum) || isNaN(mesNum) || mesNum < 1 || mesNum > 12) {
        return {
          success: false,
          data: null,
          message:
            "Parámetros inválidos: anio debe ser un número y mes debe estar entre 1 y 12",
        };
      }

      console.log(
        `📊 [Contabilidad] Obteniendo Estado de Resultados para ${anioNum}-${mesNum}, tenant: ${tenantId}`,
      );

      const estadoResultados =
        await this.estadosFinancierosService.getEstadoResultados(
          tenantId,
          anioNum,
          mesNum,
        );

      return {
        success: true,
        data: {
          periodo: {
            anio: anioNum,
            mes: mesNum,
            descripcion: `${anioNum}-${String(mesNum).padStart(2, "0")}`,
          },
          ...estadoResultados,
          resumen: {
            margen_bruto:
              estadoResultados.ingresos.total_ingresos > 0
                ? (estadoResultados.costos.utilidad_bruta /
                    estadoResultados.ingresos.total_ingresos) *
                  100
                : 0,
            margen_neto:
              estadoResultados.ingresos.total_ingresos > 0
                ? (estadoResultados.utilidad_neta /
                    estadoResultados.ingresos.total_ingresos) *
                  100
                : 0,
          },
        },
      };
    } catch (error) {
      console.error(
        "❌ [Contabilidad] Error obteniendo Estado de Resultados:",
        error,
      );
      throw error;
    }
  }

  @Get("estados/balance-general")
  @RequirePermission("contabilidad.reportes.read") // HARDENING: permisos granulares.
  @ApiOperation({ summary: "Obtener Balance General por período" })
  @ApiResponse({
    status: 200,
    description: "Balance General obtenido exitosamente",
  })
  @ApiResponse({
    status: 400,
    description: "Parámetros inválidos (anio y mes son requeridos)",
  })
  async getBalanceGeneralPorPeriodo(
    @CurrentTenant() tenantId: string,
    @Query("anio") anio?: string,
    @Query("mes") mes?: string,
  ): Promise<{ success: boolean; data: any; message?: string }> {
    try {
      // Validar parámetros requeridos
      if (!anio || !mes) {
        return {
          success: false,
          data: null,
          message: "Los parámetros anio y mes son requeridos",
        };
      }

      const anioNum = parseInt(anio, 10);
      const mesNum = parseInt(mes, 10);

      // Validar rangos
      if (isNaN(anioNum) || isNaN(mesNum) || mesNum < 1 || mesNum > 12) {
        return {
          success: false,
          data: null,
          message:
            "Parámetros inválidos: anio debe ser un número y mes debe estar entre 1 y 12",
        };
      }

      console.log(
        `🏦 [Contabilidad] Obteniendo Balance General para ${anioNum}-${mesNum}, tenant: ${tenantId}`,
      );

      const balanceGeneral =
        await this.estadosFinancierosService.getBalanceGeneral(
          tenantId,
          anioNum,
          mesNum,
        );

      // Validar ecuación contable
      const totalActivosPasivosPatrimonio =
        balanceGeneral.pasivos.total_pasivos +
        balanceGeneral.patrimonio.total_patrimonio;
      const diferencia =
        balanceGeneral.activos.total_activos - totalActivosPasivosPatrimonio;
      const ecuacionCuadra = Math.abs(diferencia) < 0.01; // Tolerancia de 1 centavo

      return {
        success: true,
        data: {
          periodo: {
            anio: anioNum,
            mes: mesNum,
            descripcion: `${anioNum}-${String(mesNum).padStart(2, "0")}`,
          },
          ...balanceGeneral,
          validacion: {
            ecuacion_contable: "Activos = Pasivos + Patrimonio",
            activos: balanceGeneral.activos.total_activos,
            pasivos_patrimonio: totalActivosPasivosPatrimonio,
            diferencia: diferencia,
            cuadrado: ecuacionCuadra,
          },
        },
      };
    } catch (error) {
      console.error(
        "❌ [Contabilidad] Error obteniendo Balance General:",
        error,
      );
      throw error;
    }
  }

  @Get("estados/balance-comprobacion/formatted")
  @RequirePermission("contabilidad.reportes.read") // HARDENING: permisos granulares.
  @ApiOperation({
    summary:
      "Obtener Balance de Comprobación formateado según estándares contables",
  })
  @ApiResponse({
    status: 200,
    description: "Balance de Comprobación formateado obtenido exitosamente",
  })
  @ApiResponse({
    status: 400,
    description: "Parámetros inválidos (anio y mes son requeridos)",
  })
  async getBalanceComprobacionFormateado(
    @CurrentTenant() tenantId: string,
    @Query("anio") anio?: string,
    @Query("mes") mes?: string,
    @Query("showCurrency") showCurrency?: string,
  ): Promise<{ success: boolean; data: any; message?: string }> {
    try {
      if (!anio || !mes) {
        return {
          success: false,
          data: null,
          message: "Los parámetros anio y mes son requeridos",
        };
      }

      const anioNum = parseInt(anio, 10);
      const mesNum = parseInt(mes, 10);
      const mostrarMoneda = showCurrency === "true";

      if (isNaN(anioNum) || isNaN(mesNum) || mesNum < 1 || mesNum > 12) {
        return {
          success: false,
          data: null,
          message:
            "Parámetros inválidos: anio debe ser un número y mes debe estar entre 1 y 12",
        };
      }

      console.log(
        `⚖️ [Contabilidad] Obteniendo Balance de Comprobación formateado para ${anioNum}-${mesNum}, tenant: ${tenantId}`,
      );

      const balance =
        await this.estadosFinancierosService.getBalanceComprobacionFormatted(
          tenantId,
          anioNum,
          mesNum,
          mostrarMoneda,
        );

      return {
        success: true,
        data: {
          periodo: {
            anio: anioNum,
            mes: mesNum,
            descripcion: `${anioNum}-${String(mesNum).padStart(2, "0")}`,
          },
          cuentas: balance,
          formato: {
            moneda: "S/",
            decimales: 2,
            separador_miles: ",",
            negativos: "paréntesis",
          },
        },
      };
    } catch (error) {
      console.error(
        "❌ [Contabilidad] Error obteniendo Balance de Comprobación formateado:",
        error,
      );
      throw error;
    }
  }

  @Get("estados/estado-resultados/formatted")
  @RequirePermission("contabilidad.reportes.read") // HARDENING: permisos granulares.
  @ApiOperation({
    summary:
      "Obtener Estado de Resultados formateado según estándares contables",
  })
  @ApiResponse({
    status: 200,
    description: "Estado de Resultados formateado obtenido exitosamente",
  })
  @ApiResponse({
    status: 400,
    description: "Parámetros inválidos (anio y mes son requeridos)",
  })
  async getEstadoResultadosFormateado(
    @CurrentTenant() tenantId: string,
    @Query("anio") anio?: string,
    @Query("mes") mes?: string,
    @Query("showCurrency") showCurrency?: string,
  ): Promise<{ success: boolean; data: any; message?: string }> {
    try {
      if (!anio || !mes) {
        return {
          success: false,
          data: null,
          message: "Los parámetros anio y mes son requeridos",
        };
      }

      const anioNum = parseInt(anio, 10);
      const mesNum = parseInt(mes, 10);
      const mostrarMoneda = showCurrency === "true";

      if (isNaN(anioNum) || isNaN(mesNum) || mesNum < 1 || mesNum > 12) {
        return {
          success: false,
          data: null,
          message:
            "Parámetros inválidos: anio debe ser un número y mes debe estar entre 1 y 12",
        };
      }

      console.log(
        `📊 [Contabilidad] Obteniendo Estado de Resultados formateado para ${anioNum}-${mesNum}, tenant: ${tenantId}`,
      );

      const estadoResultados =
        await this.estadosFinancierosService.getEstadoResultadosFormatted(
          tenantId,
          anioNum,
          mesNum,
          mostrarMoneda,
        );

      return {
        success: true,
        data: {
          periodo: {
            anio: anioNum,
            mes: mesNum,
            descripcion: `${anioNum}-${String(mesNum).padStart(2, "0")}`,
          },
          ...estadoResultados,
          formato: {
            moneda: "S/",
            decimales: 2,
            separador_miles: ",",
            negativos: "paréntesis",
          },
        },
      };
    } catch (error) {
      console.error(
        "❌ [Contabilidad] Error obteniendo Estado de Resultados formateado:",
        error,
      );
      throw error;
    }
  }

  @Get("estados/balance-general/formatted")
  @RequirePermission("contabilidad.reportes.read") // HARDENING: permisos granulares.
  @ApiOperation({
    summary: "Obtener Balance General formateado según estándares contables",
  })
  @ApiResponse({
    status: 200,
    description: "Balance General formateado obtenido exitosamente",
  })
  @ApiResponse({
    status: 400,
    description: "Parámetros inválidos (anio y mes son requeridos)",
  })
  async getBalanceGeneralFormateado(
    @CurrentTenant() tenantId: string,
    @Query("anio") anio?: string,
    @Query("mes") mes?: string,
    @Query("showCurrency") showCurrency?: string,
  ): Promise<{ success: boolean; data: any; message?: string }> {
    try {
      if (!anio || !mes) {
        return {
          success: false,
          data: null,
          message: "Los parámetros anio y mes son requeridos",
        };
      }

      const anioNum = parseInt(anio, 10);
      const mesNum = parseInt(mes, 10);
      const mostrarMoneda = showCurrency === "true";

      if (isNaN(anioNum) || isNaN(mesNum) || mesNum < 1 || mesNum > 12) {
        return {
          success: false,
          data: null,
          message:
            "Parámetros inválidos: anio debe ser un número y mes debe estar entre 1 y 12",
        };
      }

      console.log(
        `🏦 [Contabilidad] Obteniendo Balance General formateado para ${anioNum}-${mesNum}, tenant: ${tenantId}`,
      );

      const balanceGeneral =
        await this.estadosFinancierosService.getBalanceGeneralFormatted(
          tenantId,
          anioNum,
          mesNum,
          mostrarMoneda,
        );

      return {
        success: true,
        data: {
          periodo: {
            anio: anioNum,
            mes: mesNum,
            descripcion: `${anioNum}-${String(mesNum).padStart(2, "0")}`,
          },
          ...balanceGeneral,
          formato: {
            moneda: "S/",
            decimales: 2,
            separador_miles: ",",
            negativos: "paréntesis",
          },
        },
      };
    } catch (error) {
      console.error(
        "❌ [Contabilidad] Error obteniendo Balance General formateado:",
        error,
      );
      throw error;
    }
  }

  @Post("estados/refrescar")
  @RequirePermission("contabilidad.reportes.actualizar") // HARDENING: permisos granulares.
  @ApiOperation({
    summary: "Refrescar vistas materializadas de estados financieros",
  })
  @ApiResponse({
    status: 200,
    description: "Vistas materializadas refrescadas exitosamente",
  })
  @ApiResponse({
    status: 400,
    description: "Parámetros inválidos (anio y mes son requeridos)",
  })
  @ApiResponse({
    status: 500,
    description: "Error al refrescar vistas materializadas",
  })
  async refrescarEstadosFinancieros(
    @CurrentTenant() tenantId: string,
    @Body() body: { anio: number; mes: number },
  ): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      const { anio, mes } = body;

      // Validar parámetros requeridos
      if (!anio || !mes) {
        return {
          success: false,
          message: "Los parámetros anio y mes son requeridos",
        };
      }

      // Validar rangos
      if (isNaN(anio) || isNaN(mes) || mes < 1 || mes > 12) {
        return {
          success: false,
          message:
            "Parámetros inválidos: anio debe ser un número y mes debe estar entre 1 y 12",
        };
      }

      console.log(
        `🔄 [Contabilidad] Refrescando estados financieros para ${anio}-${mes}, tenant: ${tenantId}`,
      );

      const startTime = Date.now();

      // Verificar si existen vistas materializadas
      const { data: views, error: viewsError } = await this.supabaseService
        .getClient()
        .from("pg_matviews")
        .select("matviewname")
        .in("matviewname", [
          "mv_balance_comprobacion",
          "mv_estado_resultados",
          "mv_balance_general",
        ]);

      if (viewsError) {
        console.warn(
          "⚠️ No se pudieron verificar las vistas materializadas:",
          viewsError,
        );
      }

      const existingViews = views?.map((v) => v.matviewname) || [];
      const refreshedViews: string[] = [];
      const errors: string[] = [];

      // Refrescar cada vista materializada si existe
      for (const viewName of [
        "mv_balance_comprobacion",
        "mv_estado_resultados",
        "mv_balance_general",
      ]) {
        if (existingViews.includes(viewName)) {
          try {
            console.log(`🔄 Refrescando vista: ${viewName}`);

            // Ejecutar REFRESH MATERIALIZED VIEW
            const { error: refreshError } = await this.supabaseService
              .getClient()
              .rpc("refresh_materialized_view", {
                view_name: viewName,
                tenant_id: tenantId,
                p_anio: anio,
                p_mes: mes,
              });

            if (refreshError) {
              console.error(`❌ Error refrescando ${viewName}:`, refreshError);
              errors.push(`${viewName}: ${refreshError.message}`);
            } else {
              refreshedViews.push(viewName);
              console.log(`✅ Vista ${viewName} refrescada exitosamente`);
            }
          } catch (error) {
            console.error(`❌ Error refrescando ${viewName}:`, error);
            errors.push(`${viewName}: ${error.message}`);
          }
        } else {
          console.log(`ℹ️ Vista ${viewName} no existe, se omite`);
        }
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Si no hay vistas materializadas, informar al usuario
      if (existingViews.length === 0) {
        console.log(
          "ℹ️ No se encontraron vistas materializadas. Los estados financieros se calculan en tiempo real.",
        );
        return {
          success: true,
          message:
            "No hay vistas materializadas configuradas. Los estados financieros se calculan en tiempo real desde las tablas base.",
          data: {
            periodo: {
              anio,
              mes,
              descripcion: `${anio}-${String(mes).padStart(2, "0")}`,
            },
            vistas_materializadas: false,
            duracion_ms: duration,
            nota: "Para mejorar el rendimiento, considere crear vistas materializadas ejecutando la migración correspondiente.",
          },
        };
      }

      // Si hubo errores pero también éxitos
      if (errors.length > 0 && refreshedViews.length > 0) {
        return {
          success: true,
          message: `Vistas refrescadas parcialmente. ${refreshedViews.length} exitosas, ${errors.length} con errores.`,
          data: {
            periodo: {
              anio,
              mes,
              descripcion: `${anio}-${String(mes).padStart(2, "0")}`,
            },
            vistas_refrescadas: refreshedViews,
            errores: errors,
            duracion_ms: duration,
          },
        };
      }

      // Si solo hubo errores
      if (errors.length > 0 && refreshedViews.length === 0) {
        return {
          success: false,
          message: "Error al refrescar las vistas materializadas",
          data: {
            periodo: {
              anio,
              mes,
              descripcion: `${anio}-${String(mes).padStart(2, "0")}`,
            },
            errores: errors,
            duracion_ms: duration,
          },
        };
      }

      // Todo exitoso
      return {
        success: true,
        message: `${refreshedViews.length} vistas materializadas refrescadas exitosamente`,
        data: {
          periodo: {
            anio,
            mes,
            descripcion: `${anio}-${String(mes).padStart(2, "0")}`,
          },
          vistas_refrescadas: refreshedViews,
          duracion_ms: duration,
        },
      };
    } catch (error) {
      console.error(
        "❌ [Contabilidad] Error refrescando estados financieros:",
        error,
      );
      return {
        success: false,
        message: `Error al refrescar estados financieros: ${error.message}`,
      };
    }
  }

  @Get("balance-general")
  @RequirePermission("contabilidad.reportes.read") // HARDENING: permisos granulares.
  @ApiOperation({
    summary:
      "Obtener Balance General (legacy endpoint - usar /estados/balance-general)",
  })
  @ApiResponse({
    status: 200,
    description: "Balance General obtenido exitosamente",
  })
  async getBalanceGeneral(
    @CurrentTenant() tenantId: string,
    @Query("anio") anio?: string,
    @Query("mes") mes?: string,
  ) {
    try {
      // Si se proporcionan anio y mes, usar el nuevo servicio
      if (anio && mes) {
        const anioNum = parseInt(anio, 10);
        const mesNum = parseInt(mes, 10);

        // Validar rangos
        if (isNaN(anioNum) || isNaN(mesNum) || mesNum < 1 || mesNum > 12) {
          return {
            success: false,
            data: null,
            message:
              "Parámetros inválidos: anio debe ser un número y mes debe estar entre 1 y 12",
          };
        }

        console.log(
          `🏦 [Contabilidad] Usando nuevo servicio para ${anioNum}-${mesNum}`,
        );

        const balanceGeneral =
          await this.estadosFinancierosService.getBalanceGeneral(
            tenantId,
            anioNum,
            mesNum,
          );

        // Validar ecuación contable
        const totalActivosPasivosPatrimonio =
          balanceGeneral.pasivos.total_pasivos +
          balanceGeneral.patrimonio.total_patrimonio;
        const diferencia =
          balanceGeneral.activos.total_activos - totalActivosPasivosPatrimonio;
        const ecuacionCuadra = Math.abs(diferencia) < 0.01;

        return {
          success: true,
          data: {
            periodo: {
              anio: anioNum,
              mes: mesNum,
              descripcion: `${anioNum}-${String(mesNum).padStart(2, "0")}`,
            },
            ...balanceGeneral,
            validacion: {
              ecuacion_contable: "Activos = Pasivos + Patrimonio",
              activos: balanceGeneral.activos.total_activos,
              pasivos_patrimonio: totalActivosPasivosPatrimonio,
              diferencia: diferencia,
              cuadrado: ecuacionCuadra,
            },
          },
        };
      }

      // Fallback: retornar estructura vacía si no se proporcionan parámetros
      return {
        success: false,
        data: null,
        message: "Los parámetros anio y mes son requeridos",
      };
    } catch (error) {
      console.error("❌ Error obteniendo Balance General:", error);
      throw error;
    }
  }

  @Get("flujo-efectivo")
  @RequirePermission("contabilidad.reportes.read") // HARDENING: permisos granulares.
  @ApiOperation({ summary: "Obtener Estado de Flujo de Efectivo" })
  @ApiResponse({
    status: 200,
    description: "Flujo de Efectivo obtenido exitosamente",
  })
  async getFlujoEfectivo(
    @CurrentTenant() tenantId: string,
    @Query() periodo: PeriodoQueryDto,
  ) {
    if (!periodo?.anio || !periodo?.mes) {
      throw new BadRequestException("Los parámetros anio y mes son requeridos");
    }

    const data = await this.cashflowService.getCashFlow(
      tenantId,
      Number(periodo.anio),
      Number(periodo.mes),
    );

    return {
      success: true,
      data,
    };
  }

  @Get("plan-cuentas")
  @RequirePermission("contabilidad.reportes.read") // HARDENING: permisos granulares.
  @ApiOperation({ summary: "Obtener Plan de Cuentas" })
  @ApiResponse({
    status: 200,
    description: "Plan de Cuentas obtenido exitosamente",
  })
  async getPlanCuentas() {
    try {
      console.log("📚 Obteniendo plan de cuentas...");
      const planCuentas = await this.accountingService.getPlanCuentas();

      return {
        success: true,
        data: planCuentas,
      };
    } catch (error) {
      console.error("❌ Error obteniendo plan de cuentas:", error);
      return {
        success: false,
        message: "Error obteniendo plan de cuentas",
        data: [],
      };
    }
  }

  @Get("ratios-financieros")
  @RequirePermission("contabilidad.reportes.read") // HARDENING: permisos granulares.
  @ApiOperation({ summary: "Obtener Ratios Financieros" })
  @ApiResponse({
    status: 200,
    description: "Ratios Financieros obtenidos exitosamente",
  })
  async getRatiosFinancieros(
    @CurrentTenant() tenantId: string,
    @Query() periodo: PeriodoQueryDto,
  ) {
    if (!periodo?.anio || !periodo?.mes) {
      throw new BadRequestException("Los parámetros anio y mes son requeridos");
    }

    const data = await this.cashflowService.getRatios(
      tenantId,
      Number(periodo.anio),
      Number(periodo.mes),
    );

    return {
      success: true,
      data,
    };
  }
}
