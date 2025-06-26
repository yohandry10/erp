import { Controller, Get, Post, Body, Query, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SupabaseService } from '../shared/supabase/supabase.service';

import { InventoryIntegrationService } from '../shared/integration/inventory-integration.service';

@ApiTags('analytics')
@Controller('analytics')
export class AnalyticsController {
  
  constructor(
    private readonly supabase: SupabaseService,

    private readonly inventoryService: InventoryIntegrationService
  ) {}
  
  @Get('ventas-tiempo')
  @ApiOperation({ summary: 'Gráfico de ventas en el tiempo' })
  @ApiResponse({ status: 200, description: 'Datos de ventas en el tiempo obtenidos exitosamente' })
  async getVentasTiempo(@Query() filtros: any) {
    try {
      console.log('📊 [Analytics] Analizando ventas por tiempo...');

      // Obtener ventas de los últimos 30 días directamente
      const fechaInicio = new Date();
      fechaInicio.setDate(fechaInicio.getDate() - 30);

      const { data: ventas, error: ventasError } = await this.supabase.getClient()
        .from('ventas_pos')
        .select('fecha, total')
        .gte('fecha', fechaInicio.toISOString())
        .order('fecha');

      if (ventasError) {
        console.error('❌ Error obteniendo ventas:', ventasError);
        throw new Error(`Error consultando ventas: ${ventasError.message}`);
      }

      console.log(`📊 Se encontraron ${ventas?.length || 0} ventas en los últimos 30 días`);

      // Procesar datos para el gráfico
      const ventasPorDia = ventas ? this.procesarVentasDiarias(ventas) : [];
      const labels = ventasPorDia.map(v => v.fecha);
      const data = ventasPorDia.map(v => v.total);

      // Calcular totales
      const ventasActuales = ventas?.reduce((sum, v) => sum + parseFloat(v.total || 0), 0) || 0;
      const ventasAnterior = await this.calcularVentasMesAnterior();
      const crecimiento = ventasAnterior > 0 ? 
        ((ventasActuales - ventasAnterior) / ventasAnterior * 100).toFixed(1) + '%' : 
        'SIN DATOS';

      return {
        success: true,
        data: {
          labels,
          datasets: [
            {
              label: 'Ventas Diarias',
              data,
              backgroundColor: '#3b82f6',
              borderColor: '#1d4ed8',
              fill: false
            }
          ],
          totales: {
            ventasActuales,
            ventasAnterior,
            crecimiento
          }
        }
      };
    } catch (error) {
      console.error('❌ Error analizando ventas por tiempo:', error);
      return {
        success: false,
        message: error.message,
        data: {
          labels: [],
          datasets: [],
          totales: { ventasActuales: 0, ventasAnterior: 0, crecimiento: 'ERROR' }
        }
      };
    }
  }

  private procesarVentasDiarias(ventas: any[]): { fecha: string, total: number }[] {
    const ventasPorDia = new Map<string, number>();
    
    ventas.forEach(venta => {
      const fecha = new Date(venta.fecha).toLocaleDateString('es-PE', { 
        day: '2-digit', 
        month: '2-digit' 
      });
      const total = parseFloat(venta.total || 0);
      
      ventasPorDia.set(fecha, (ventasPorDia.get(fecha) || 0) + total);
    });

    return Array.from(ventasPorDia.entries()).map(([fecha, total]) => ({
      fecha,
      total
    }));
  }

  private async calcularVentasMesAnterior(): Promise<number> {
    try {
      const fechaInicio = new Date();
      fechaInicio.setDate(fechaInicio.getDate() - 60);
      const fechaFin = new Date();
      fechaFin.setDate(fechaFin.getDate() - 30);

      const { data: ventas } = await this.supabase.getClient()
        .from('ventas_pos')
        .select('total')
        .gte('fecha', fechaInicio.toISOString())
        .lte('fecha', fechaFin.toISOString());

      return ventas?.reduce((sum, venta) => sum + parseFloat(venta.total || 0), 0) || 0;
    } catch (error) {
      console.error('❌ Error calculando ventas mes anterior:', error);
      return 0;
    }
  }

  @Get('deudas-clientes')
  @ApiOperation({ summary: 'Gráfico de deudas de clientes' })
  @ApiResponse({ status: 200, description: 'Datos de deudas de clientes obtenidos exitosamente' })
  getDeudasClientes() {
    // TODO: Implement real customer debt analytics
    return {
      success: true,
      data: {
        graficoEdadSaldos: {
          labels: ['0-30 días', '31-60 días', '61-90 días', '90+ días'],
          data: [0, 0, 0, 0],
          backgroundColor: ['#10b981', '#f59e0b', '#ef4444', '#7c2d12']
        },
        topDeudores: [],
        alertasCobranza: [],
        totales: {
          totalPorCobrar: 0,
          vencido: 0,
          porcentajeVencido: 0
        }
      }
    };
  }

  @Get('deudas-proveedores')
  @ApiOperation({ summary: 'Gráfico de deudas a proveedores' })
  @ApiResponse({ status: 200, description: 'Datos de deudas a proveedores obtenidos exitosamente' })
  getDeudasProveedores() {
    // TODO: Implement real supplier debt analytics
    return {
      success: true,
      data: {
        graficoEdadSaldos: {
          labels: ['0-30 días', '31-60 días', '61-90 días', '90+ días'],
          data: [0, 0, 0, 0],
          backgroundColor: ['#10b981', '#f59e0b', '#ef4444', '#7c2d12']
        },
        proximosVencimientos: [],
        alertasPago: [],
        totales: {
          totalPorPagar: 0,
          vencido: 0,
          porcentajeVencido: 0
        }
      }
    };
  }

  @Get('flujo-efectivo')
  @ApiOperation({ summary: 'Gráfico de flujo de efectivo' })
  @ApiResponse({ status: 200, description: 'Datos de flujo de efectivo obtenidos exitosamente' })
  getFlujoEfectivo(@Query() periodo: any) {
    // TODO: Implement real cash flow analytics
    return {
      success: true,
      data: {
        graficoFlujo: {
          labels: [],
          datasets: [
            {
              label: 'Ingresos',
              data: [],
              backgroundColor: '#10b981'
            },
            {
              label: 'Egresos',
              data: [],
              backgroundColor: '#ef4444'
            },
            {
              label: 'Flujo Neto',
              data: [],
              backgroundColor: '#3b82f6',
              type: 'line'
            }
          ]
        },
        proyeccion: {
          labels: [],
          saldoProyectado: []
        },
        alertas: []
      }
    };
  }

  @Get('rentabilidad-productos')
  @ApiOperation({ summary: 'Gráfico de rentabilidad por productos' })
  @ApiResponse({ status: 200, description: 'Datos de rentabilidad por productos obtenidos exitosamente' })
  getRentabilidadProductos() {
    // TODO: Implement real product profitability analytics
    return {
      success: true,
      data: {
        graficoBarras: {
          labels: [],
          datasets: [
            {
              label: 'Margen Bruto (%)',
              data: [],
              backgroundColor: '#3b82f6'
            }
          ]
        },
        graficoScatter: {
          datasets: [
            {
              label: 'Productos',
              data: [], // [{x: volumen, y: margen, producto: 'nombre'}]
              backgroundColor: '#10b981'
            }
          ]
        },
        recomendaciones: []
      }
    };
  }

  @Get('ventas-categoria')
  @ApiOperation({ summary: 'Gráfico de ventas por categoría' })
  @ApiResponse({ status: 200, description: 'Datos de ventas por categoría obtenidos exitosamente' })
  getVentasCategoria() {
    // TODO: Implement real sales by category analytics
    return {
      success: true,
      data: {
        graficoPie: {
          labels: [],
          data: [],
          backgroundColor: [
            '#3b82f6', '#10b981', '#f59e0b', '#ef4444', 
            '#8b5cf6', '#06b6d4', '#84cc16', '#f97316'
          ]
        },
        tendencias: {
          labels: [],
          datasets: []
        },
        crecimientoPorCategoria: []
      }
    };
  }

  @Get('estacionalidad-ventas')
  @ApiOperation({ summary: 'Análisis de estacionalidad de ventas' })
  @ApiResponse({ status: 200, description: 'Datos de estacionalidad obtenidos exitosamente' })
  getEstacionalidadVentas() {
    // TODO: Implement real seasonality analytics
    return {
      success: true,
      data: {
        graficoEstacional: {
          labels: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
          datasets: [
            {
              label: 'Año Actual',
              data: [],
              borderColor: '#3b82f6'
            },
            {
              label: 'Año Anterior',
              data: [],
              borderColor: '#6b7280'
            }
          ]
        },
        indices: {
          mesesFuertes: [],
          mesesDebiles: [],
          variacionEstacional: 0
        },
        predicciones: []
      }
    };
  }

  @Get('kpis-visuales')
  @ApiOperation({ summary: 'KPIs con elementos visuales' })
  @ApiResponse({ status: 200, description: 'KPIs visuales obtenidos exitosamente' })
  getKPIsVisuales() {
    // TODO: Implement real visual KPIs
    return {
      success: true,
      data: {
        liquidez: {
          valor: 0,
          objetivo: 1.5,
          estado: 'NORMAL',
          tendencia: 'ESTABLE',
          graficoGauge: {
            valor: 0,
            minimo: 0,
            maximo: 3,
            rangos: [
              { min: 0, max: 1, color: '#ef4444', label: 'Crítico' },
              { min: 1, max: 1.5, color: '#f59e0b', label: 'Bajo' },
              { min: 1.5, max: 2.5, color: '#10b981', label: 'Bueno' },
              { min: 2.5, max: 3, color: '#3b82f6', label: 'Excelente' }
            ]
          }
        },
        rentabilidad: {
          valor: 0,
          objetivo: 15,
          estado: 'NORMAL',
          tendencia: 'ESTABLE',
          historicoMeses: []
        },
        crecimiento: {
          valor: 0,
          objetivo: 10,
          estado: 'NORMAL',
          tendencia: 'ESTABLE',
          comparativoAnual: []
        },
        eficiencia: {
          rotacionInventario: 0,
          rotacionCobros: 0,
          cicloEfectivo: 0,
          benchmarks: {
            industria: {
              rotacionInventario: 0,
              rotacionCobros: 0
            }
          }
        }
      }
    };
  }

  @Get('alertas-financieras')
  @ApiOperation({ summary: 'Sistema de alertas financieras' })
  @ApiResponse({ status: 200, description: 'Alertas financieras obtenidas exitosamente' })
  getAlertasFinancieras() {
    // TODO: Implement real financial alerts system
    return {
      success: true,
      data: {
        alertasCriticas: [],
        alertasAdvertencia: [],
        alertasInfo: [],
        resumen: {
          totalAlertas: 0,
          criticas: 0,
          advertencias: 0,
          informativas: 0
        }
      }
    };
  }

  @Post('reporte-personalizado')
  @ApiOperation({ summary: 'Generar reporte personalizado' })
  @ApiResponse({ status: 200, description: 'Reporte personalizado generado exitosamente' })
  generarReportePersonalizado(@Body() configuracion: any) {
    // TODO: Implement custom report generation
    return {
      success: true,
      data: {
        reporteId: null,
        configuracion: configuracion,
        datos: null,
        graficos: null
      },
      message: 'Funcionalidad en desarrollo'
    };
  }
} 