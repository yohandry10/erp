"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function")
        r = Reflect.decorate(decorators, target, key, desc);
    else
        for (var i = decorators.length - 1; i >= 0; i--)
            if (d = decorators[i])
                r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function")
        return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const supabase_service_1 = require("../shared/supabase/supabase.service");
const financial_integration_service_1 = require("../shared/integration/financial-integration.service");
const inventory_integration_service_1 = require("../shared/integration/inventory-integration.service");
let AnalyticsController = class AnalyticsController {
    constructor(supabase, financialService, inventoryService) {
        this.supabase = supabase;
        this.financialService = financialService;
        this.inventoryService = inventoryService;
    }
    async getVentasTiempo(filtros) {
        try {
            console.log('📊 [Analytics] Analizando ventas por tiempo...');
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
            const ventasPorDia = ventas ? this.procesarVentasDiarias(ventas) : [];
            const labels = ventasPorDia.map(v => v.fecha);
            const data = ventasPorDia.map(v => v.total);
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
        }
        catch (error) {
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
    procesarVentasDiarias(ventas) {
        const ventasPorDia = new Map();
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
    async calcularVentasMesAnterior() {
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
        }
        catch (error) {
            console.error('❌ Error calculando ventas mes anterior:', error);
            return 0;
        }
    }
    getDeudasClientes() {
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
    getDeudasProveedores() {
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
    getFlujoEfectivo(periodo) {
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
    getRentabilidadProductos() {
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
                            data: [],
                            backgroundColor: '#10b981'
                        }
                    ]
                },
                recomendaciones: []
            }
        };
    }
    getVentasCategoria() {
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
    getEstacionalidadVentas() {
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
    getKPIsVisuales() {
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
    getAlertasFinancieras() {
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
    generarReportePersonalizado(configuracion) {
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
};
exports.AnalyticsController = AnalyticsController;
__decorate([
    (0, common_1.Get)('ventas-tiempo'),
    (0, swagger_1.ApiOperation)({ summary: 'Gráfico de ventas en el tiempo' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Datos de ventas en el tiempo obtenidos exitosamente' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "getVentasTiempo", null);
__decorate([
    (0, common_1.Get)('deudas-clientes'),
    (0, swagger_1.ApiOperation)({ summary: 'Gráfico de deudas de clientes' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Datos de deudas de clientes obtenidos exitosamente' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AnalyticsController.prototype, "getDeudasClientes", null);
__decorate([
    (0, common_1.Get)('deudas-proveedores'),
    (0, swagger_1.ApiOperation)({ summary: 'Gráfico de deudas a proveedores' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Datos de deudas a proveedores obtenidos exitosamente' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AnalyticsController.prototype, "getDeudasProveedores", null);
__decorate([
    (0, common_1.Get)('flujo-efectivo'),
    (0, swagger_1.ApiOperation)({ summary: 'Gráfico de flujo de efectivo' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Datos de flujo de efectivo obtenidos exitosamente' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AnalyticsController.prototype, "getFlujoEfectivo", null);
__decorate([
    (0, common_1.Get)('rentabilidad-productos'),
    (0, swagger_1.ApiOperation)({ summary: 'Gráfico de rentabilidad por productos' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Datos de rentabilidad por productos obtenidos exitosamente' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AnalyticsController.prototype, "getRentabilidadProductos", null);
__decorate([
    (0, common_1.Get)('ventas-categoria'),
    (0, swagger_1.ApiOperation)({ summary: 'Gráfico de ventas por categoría' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Datos de ventas por categoría obtenidos exitosamente' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AnalyticsController.prototype, "getVentasCategoria", null);
__decorate([
    (0, common_1.Get)('estacionalidad-ventas'),
    (0, swagger_1.ApiOperation)({ summary: 'Análisis de estacionalidad de ventas' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Datos de estacionalidad obtenidos exitosamente' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AnalyticsController.prototype, "getEstacionalidadVentas", null);
__decorate([
    (0, common_1.Get)('kpis-visuales'),
    (0, swagger_1.ApiOperation)({ summary: 'KPIs con elementos visuales' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'KPIs visuales obtenidos exitosamente' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AnalyticsController.prototype, "getKPIsVisuales", null);
__decorate([
    (0, common_1.Get)('alertas-financieras'),
    (0, swagger_1.ApiOperation)({ summary: 'Sistema de alertas financieras' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Alertas financieras obtenidas exitosamente' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AnalyticsController.prototype, "getAlertasFinancieras", null);
__decorate([
    (0, common_1.Post)('reporte-personalizado'),
    (0, swagger_1.ApiOperation)({ summary: 'Generar reporte personalizado' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Reporte personalizado generado exitosamente' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AnalyticsController.prototype, "generarReportePersonalizado", null);
exports.AnalyticsController = AnalyticsController = __decorate([
    (0, swagger_1.ApiTags)('analytics'),
    (0, common_1.Controller)('analytics'),
    __metadata("design:paramtypes", [supabase_service_1.SupabaseService,
        financial_integration_service_1.FinancialIntegrationService,
        inventory_integration_service_1.InventoryIntegrationService])
], AnalyticsController);
