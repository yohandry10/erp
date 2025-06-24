import { Controller, Get, Post, Body, Query, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { FinancialIntegrationService } from '../shared/integration/financial-integration.service';

@ApiTags('finanzas')
@Controller('finanzas')
export class FinanzasController {
  
  constructor(private readonly financialService: FinancialIntegrationService) {}
  
  @Get('dashboard')
  @ApiOperation({ summary: 'Dashboard financiero principal' })
  @ApiResponse({ status: 200, description: 'Dashboard financiero obtenido exitosamente' })
  async getDashboardFinanciero() {
    try {
      console.log('💰 Obteniendo dashboard financiero en tiempo real...');
      
      const [kpis, alertas] = await Promise.all([
        this.financialService.getKPIsFinancieros(),
        this.financialService.getAlertas()
      ]);

      return {
        success: true,
        data: {
          resumenGeneral: {
            liquidez: kpis.liquidez,
            rentabilidad: kpis.rentabilidad,
            endeudamiento: kpis.cuentasPorPagar > kpis.efectivoDisponible ? 'ALTO' : 'BAJO',
            crecimiento: kpis.crecimiento
          },
          alertas: alertas,
          indicadores: {
            efectivoDisponible: kpis.efectivoDisponible,
            ventasUltimos30dias: kpis.ventasUltimos30dias,
            gastosUltimos30dias: kpis.gastosUltimos30dias,
            utilidadUltimos30dias: kpis.utilidadUltimos30dias,
            cuentasPorCobrar: kpis.cuentasPorCobrar,
            cuentasPorPagar: kpis.cuentasPorPagar,
            rotacionInventario: kpis.rotacionInventario,
            margenBruto: kpis.margenBruto
          },
          tendencias: {
            ventasMensuales: [], // TODO: Implementar consulta histórica
            gastosMensuales: [], // TODO: Implementar consulta histórica
            utilidadMensual: []  // TODO: Implementar consulta histórica
          }
        }
      };
    } catch (error) {
      console.error('❌ Error obteniendo dashboard financiero:', error);
      return {
        success: false,
        message: 'Error calculando indicadores financieros',
        data: {
          resumenGeneral: {
            liquidez: 'REGULAR',
            rentabilidad: 'REGULAR',
            endeudamiento: 'MEDIO',
            crecimiento: 'ESTABLE'
          },
          alertas: [{
            tipo: 'ADVERTENCIA',
            titulo: 'Error en Cálculos',
            mensaje: 'No se pudieron calcular los indicadores financieros',
            accion: 'Verificar conexión a base de datos'
          }],
          indicadores: {
            efectivoDisponible: 0,
            ventasUltimos30dias: 0,
            gastosUltimos30dias: 0,
            utilidadUltimos30dias: 0,
            cuentasPorCobrar: 0,
            cuentasPorPagar: 0
          },
          tendencias: {
            ventasMensuales: [],
            gastosMensuales: [],
            utilidadMensual: []
          }
        }
      };
    }
  }

  @Get('flujo-caja-proyectado')
  @ApiOperation({ summary: 'Proyección de flujo de caja' })
  @ApiResponse({ status: 200, description: 'Flujo de caja proyectado obtenido exitosamente' })
  getFlujoProyectado(@Query() meses: any) {
    // TODO: Implement real cash flow projection
    return {
      success: true,
      data: {
        proyeccion: [],
        recomendaciones: [],
        escenarios: {
          optimista: [],
          realista: [],
          pesimista: []
        }
      }
    };
  }

  @Get('analisis-credito')
  @ApiOperation({ summary: 'Análisis para solicitud de crédito' })
  @ApiResponse({ status: 200, description: 'Análisis de crédito obtenido exitosamente' })
  getAnalisisCredito(@Body() solicitudData: any) {
    // TODO: Implement real credit analysis
    return {
      success: true,
      data: {
        capacidadPago: {
          ingresosMensuales: 0,
          gastosFijos: 0,
          gastosPorcentaje: 0,
          capacidadDisponible: 0,
          recomendacionMaxima: 0
        },
        puntuacion: {
          liquidez: 0, // 0-100
          rentabilidad: 0, // 0-100
          historialPagos: 0, // 0-100
          estabilidad: 0, // 0-100
          puntuacionTotal: 0 // 0-100
        },
        recomendacion: 'ANALIZAR', // RECOMENDAR, ANALIZAR, NO_RECOMENDAR
        justificacion: '',
        documentosNecesarios: []
      }
    };
  }

  @Get('cuentas-por-cobrar')
  @ApiOperation({ summary: 'Análisis de cuentas por cobrar' })
  @ApiResponse({ status: 200, description: 'Cuentas por cobrar obtenidas exitosamente' })
  async getCuentasPorCobrar() {
    try {
      console.log('🧾 Obteniendo cuentas por cobrar...');
      
      const cuentas = await this.financialService.getCuentasPorCobrarDetalladas();
      
      const totalPorCobrar = cuentas.reduce((sum, cuenta) => sum + cuenta.saldoPendiente, 0);
      const vencidas = cuentas.filter(cuenta => cuenta.diasVencidos > 0);
      const porVencer = cuentas.filter(cuenta => cuenta.diasVencidos === 0);
      
      // Análisis por días de vencimiento
      const edadSaldos = {
        actual: cuentas.filter(c => c.diasVencidos === 0).reduce((s, c) => s + c.saldoPendiente, 0),
        dias30: cuentas.filter(c => c.diasVencidos > 0 && c.diasVencidos <= 30).reduce((s, c) => s + c.saldoPendiente, 0),
        dias60: cuentas.filter(c => c.diasVencidos > 30 && c.diasVencidos <= 60).reduce((s, c) => s + c.saldoPendiente, 0),
        dias90: cuentas.filter(c => c.diasVencidos > 60 && c.diasVencidos <= 90).reduce((s, c) => s + c.saldoPendiente, 0),
        mas90dias: cuentas.filter(c => c.diasVencidos > 90).reduce((s, c) => s + c.saldoPendiente, 0)
      };

      return {
        success: true,
        data: {
          resumen: {
            totalPorCobrar,
            vencidas: vencidas.reduce((sum, cuenta) => sum + cuenta.saldoPendiente, 0),
            porVencer: porVencer.reduce((sum, cuenta) => sum + cuenta.saldoPendiente, 0),
            promedioDiasCobranza: cuentas.length > 0 ? 
              cuentas.reduce((sum, cuenta) => sum + cuenta.diasVencidos, 0) / cuentas.length : 0
          },
          edadSaldos,
          clientesDeudores: cuentas.map(cuenta => ({
            clienteNombre: cuenta.clienteNombre,
            numeroDocumento: cuenta.numeroDocumento,
            saldoPendiente: cuenta.saldoPendiente,
            diasVencidos: cuenta.diasVencidos,
            fechaVencimiento: cuenta.fechaVencimiento,
            estado: cuenta.estado
          })),
          graficoDias: [
            { rango: 'Al día', monto: edadSaldos.actual },
            { rango: '1-30 días', monto: edadSaldos.dias30 },
            { rango: '31-60 días', monto: edadSaldos.dias60 },
            { rango: '61-90 días', monto: edadSaldos.dias90 },
            { rango: '+90 días', monto: edadSaldos.mas90dias }
          ]
        }
      };
    } catch (error) {
      console.error('❌ Error obteniendo cuentas por cobrar:', error);
      return {
        success: false,
        message: 'Error obteniendo cuentas por cobrar',
        data: {
          resumen: {
            totalPorCobrar: 0,
            vencidas: 0,
            porVencer: 0,
            promedioDiasCobranza: 0
          },
          edadSaldos: {
            actual: 0,
            dias30: 0,
            dias60: 0,
            dias90: 0,
            mas90dias: 0
          },
          clientesDeudores: [],
          graficoDias: []
        }
      };
    }
  }

  @Get('cuentas-por-pagar')
  @ApiOperation({ summary: 'Análisis de cuentas por pagar' })
  @ApiResponse({ status: 200, description: 'Cuentas por pagar obtenidas exitosamente' })
  getCuentasPorPagar() {
    // TODO: Implement real accounts payable analysis
    return {
      success: true,
      data: {
        resumen: {
          totalPorPagar: 0,
          vencidas: 0,
          porVencer: 0,
          promedioDiasPago: 0
        },
        edadSaldos: {
          actual: 0,
          dias30: 0,
          dias60: 0,
          dias90: 0,
          mas90dias: 0
        },
        proveedoresAcreedores: [],
        proximosVencimientos: []
      }
    };
  }

  @Get('rentabilidad-productos')
  @ApiOperation({ summary: 'Análisis de rentabilidad por producto' })
  @ApiResponse({ status: 200, description: 'Rentabilidad por producto obtenida exitosamente' })
  getRentabilidadProductos() {
    // TODO: Implement real product profitability analysis
    return {
      success: true,
      data: {
        productos: [],
        masRentables: [],
        menosRentables: [],
        recomendaciones: []
      }
    };
  }

  @Get('punto-equilibrio')
  @ApiOperation({ summary: 'Análisis de punto de equilibrio' })
  @ApiResponse({ status: 200, description: 'Punto de equilibrio obtenido exitosamente' })
  getPuntoEquilibrio() {
    // TODO: Implement real break-even analysis
    return {
      success: true,
      data: {
        costosVareiables: 0,
        costosFijos: 0,
        precioVentaPromedio: 0,
        margenContribucion: 0,
        puntoEquilibrioUnidades: 0,
        puntoEquilibrioSoles: 0,
        margenSeguridad: 0,
        graficoEquilibrio: []
      }
    };
  }

  @Get('ventas-analisis')
  @ApiOperation({ summary: 'Análisis detallado de ventas' })
  @ApiResponse({ status: 200, description: 'Análisis de ventas obtenido exitosamente' })
  getAnalisisVentas(@Query() periodo: any) {
    // TODO: Implement real sales analysis
    return {
      success: true,
      data: {
        ventasPorMes: [],
        ventasPorCategoria: [],
        ventasPorCliente: [],
        estacionalidad: [],
        tendencias: {
          crecimiento: 0,
          proyeccion: []
        },
        recomendaciones: []
      }
    };
  }

  @Get('indicadores-kpi')
  @ApiOperation({ summary: 'KPIs financieros principales' })
  @ApiResponse({ status: 200, description: 'KPIs obtenidos exitosamente' })
  getKPIsFinancieros() {
    // TODO: Implement real financial KPIs
    return {
      success: true,
      data: {
        liquidez: {
          efectivoDisponible: 0,
          ratioLiquidez: 0,
          diasEfectivo: 0,
          estado: 'NORMAL' // CRITICO, BAJO, NORMAL, BUENO
        },
        rentabilidad: {
          margenBruto: 0,
          margenNeto: 0,
          roa: 0,
          roe: 0,
          estado: 'NORMAL'
        },
        eficiencia: {
          rotacionInventario: 0,
          rotacionCuentasCobrar: 0,
          cicloEfectivo: 0,
          estado: 'NORMAL'
        },
        crecimiento: {
          ventasMesAnterior: 0,
          crecimientoMensual: 0,
          crecimientoAnual: 0,
          estado: 'NORMAL'
        }
      }
    };
  }

  @Post('simulacion-escenarios')
  @ApiOperation({ summary: 'Simulación de escenarios financieros' })
  @ApiResponse({ status: 200, description: 'Simulación completada exitosamente' })
  simularEscenarios(@Body() parametros: any) {
    // TODO: Implement real scenario simulation
    return {
      success: true,
      data: {
        escenarioBase: {},
        escenarioOptimista: {},
        escenarioPesimista: {},
        recomendaciones: [],
        riesgos: []
      }
    };
  }
} 