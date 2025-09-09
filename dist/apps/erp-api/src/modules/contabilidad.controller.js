"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContabilidadController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const accounting_integration_service_1 = require("../shared/integration/accounting-integration.service");
let ContabilidadController = class ContabilidadController {
    constructor(accountingService) {
        this.accountingService = accountingService;
    }
    getEstadoResultados(periodo) {
        // TODO: Implement real P&L statement
        return {
            success: true,
            data: {
                ingresos: {
                    ventasNetas: 0,
                    otrosIngresos: 0,
                    totalIngresos: 0
                },
                costos: {
                    costoVentas: 0,
                    utilidadBruta: 0
                },
                gastos: {
                    gastosOperativos: 0,
                    gastosAdministrativos: 0,
                    gastosVentas: 0,
                    gastosFinancieros: 0,
                    totalGastos: 0
                },
                resultado: {
                    utilidadOperativa: 0,
                    utilidadAntesImpuestos: 0,
                    impuestos: 0,
                    utilidadNeta: 0
                }
            }
        };
    }
    getBalanceGeneral() {
        // TODO: Implement real balance sheet
        return {
            success: true,
            data: {
                activos: {
                    corrientes: {
                        efectivo: 0,
                        cuentasPorCobrar: 0,
                        inventarios: 0,
                        otrosActivos: 0,
                        totalCorrientes: 0
                    },
                    fijos: {
                        equipos: 0,
                        muebles: 0,
                        depreciacion: 0,
                        totalFijos: 0
                    },
                    totalActivos: 0
                },
                pasivos: {
                    corrientes: {
                        cuentasPorPagar: 0,
                        prestamosCortoplazo: 0,
                        otrosPasivos: 0,
                        totalCorrientes: 0
                    },
                    largoplazo: {
                        prestamosLargoplazo: 0,
                        totalLargoplazo: 0
                    },
                    totalPasivos: 0
                },
                patrimonio: {
                    capital: 0,
                    utilidadesRetenidas: 0,
                    totalPatrimonio: 0
                }
            }
        };
    }
    getFlujoEfectivo(periodo) {
        // TODO: Implement real cash flow statement
        return {
            success: true,
            data: {
                operacion: {
                    utilidadNeta: 0,
                    depreciacion: 0,
                    cambiosCapitalTrabajo: 0,
                    flujoOperacion: 0
                },
                inversion: {
                    compraActivos: 0,
                    ventaActivos: 0,
                    flujoInversion: 0
                },
                financiamiento: {
                    prestamosRecibidos: 0,
                    pagosPrestamos: 0,
                    aportesSocios: 0,
                    dividendos: 0,
                    flujoFinanciamiento: 0
                },
                resumen: {
                    flujoNetoEfectivo: 0,
                    efectivoInicial: 0,
                    efectivoFinal: 0
                }
            }
        };
    }
    async getPlanCuentas() {
        try {
            console.log('📚 Obteniendo plan de cuentas...');
            const planCuentas = await this.accountingService.getPlanCuentas();
            return {
                success: true,
                data: planCuentas
            };
        }
        catch (error) {
            console.error('❌ Error obteniendo plan de cuentas:', error);
            return {
                success: false,
                message: 'Error obteniendo plan de cuentas',
                data: []
            };
        }
    }
    getRatiosFinancieros() {
        // TODO: Implement real financial ratios calculation
        return {
            success: true,
            data: {
                liquidez: {
                    ratioLiquidez: 0,
                    pruebaAcida: 0,
                    capitalTrabajo: 0
                },
                rentabilidad: {
                    margenBruto: 0,
                    margenOperativo: 0,
                    margenNeto: 0,
                    roa: 0,
                    roe: 0
                },
                endeudamiento: {
                    ratioDeuda: 0,
                    ratioCobertura: 0,
                    apalancamiento: 0
                },
                eficiencia: {
                    rotacionActivos: 0,
                    rotacionInventario: 0,
                    rotacionCuentasCobrar: 0
                }
            }
        };
    }
    crearAsientoContable(asientoData) {
        // TODO: Implement real accounting entry creation
        return {
            success: true,
            data: {
                id: Date.now().toString(),
                numeroAsiento: `A-${Date.now()}`,
                fecha: new Date().toISOString(),
                concepto: asientoData.concepto || '',
                totalDebe: asientoData.totalDebe || 0,
                totalHaber: asientoData.totalHaber || 0,
                estado: 'BORRADOR'
            },
            message: 'Asiento contable creado exitosamente'
        };
    }
    async getAsientosContables(filtros) {
        try {
            console.log('📚 Obteniendo asientos contables...', filtros);
            const asientos = await this.accountingService.getAsientosContables(filtros);
            return {
                success: true,
                data: asientos
            };
        }
        catch (error) {
            console.error('❌ Error obteniendo asientos contables:', error);
            return {
                success: false,
                message: 'Error obteniendo asientos contables',
                data: []
            };
        }
    }
    async getLibroMayor(cuentaCodigo, filtros) {
        try {
            console.log(`📊 Generando Libro Mayor para cuenta: ${cuentaCodigo}`, filtros);
            const libroMayor = await this.accountingService.getLibroMayorPorCuenta(cuentaCodigo, filtros);
            return {
                success: true,
                data: libroMayor
            };
        }
        catch (error) {
            console.error('❌ Error generando Libro Mayor:', error);
            return {
                success: false,
                message: 'Error generando Libro Mayor',
                data: null
            };
        }
    }
    async getLibroMayorCompleto(filtros) {
        try {
            console.log('📊 Generando Libro Mayor Completo...', filtros);
            const libroMayorCompleto = await this.accountingService.getLibroMayorCompleto(filtros);
            return {
                success: true,
                data: libroMayorCompleto
            };
        }
        catch (error) {
            console.error('❌ Error generando Libro Mayor Completo:', error);
            return {
                success: false,
                message: 'Error generando Libro Mayor Completo',
                data: []
            };
        }
    }
    getBalanceComprobacion(periodo) {
        // TODO: Implement real trial balance
        return {
            success: true,
            data: {
                cuentas: [],
                totales: {
                    totalDebe: 0,
                    totalHaber: 0,
                    diferencia: 0
                }
            }
        };
    }
    realizarCierreContable(cierreData) {
        // TODO: Implement real accounting period closing
        return {
            success: true,
            data: {
                periodo: cierreData.periodo || '',
                fechaCierre: new Date().toISOString(),
                estado: 'CERRADO'
            },
            message: 'Cierre contable realizado exitosamente'
        };
    }
    async getLibroDiario(filtros) {
        try {
            console.log('📖 Generando Libro Diario...', filtros);
            // Obtener asientos contables con sus detalles
            const asientos = await this.accountingService.getAsientosContables(filtros);
            // Formatear para Libro Diario (cronológico)
            const libroDiario = asientos.map(asiento => ({
                numeroAsiento: asiento.numero_asiento,
                fecha: asiento.fecha,
                concepto: asiento.concepto,
                referencia: asiento.referencia,
                detalles: asiento.detalle_asientos.map(detalle => ({
                    cuentaId: detalle.cuenta_id,
                    concepto: detalle.concepto,
                    debe: detalle.debe,
                    haber: detalle.haber
                })),
                totalDebe: asiento.total_debe,
                totalHaber: asiento.total_haber,
                estado: asiento.estado
            }));
            return {
                success: true,
                data: {
                    periodo: filtros.fechaDesde && filtros.fechaHasta
                        ? `${filtros.fechaDesde} al ${filtros.fechaHasta}`
                        : 'Todos los registros',
                    totalAsientos: libroDiario.length,
                    totalDebe: libroDiario.reduce((sum, a) => sum + a.totalDebe, 0),
                    totalHaber: libroDiario.reduce((sum, a) => sum + a.totalHaber, 0),
                    asientos: libroDiario
                }
            };
        }
        catch (error) {
            console.error('❌ Error generando Libro Diario:', error);
            return {
                success: false,
                message: 'Error generando Libro Diario',
                data: null
            };
        }
    }
    async getRegistroVentas(filtros) {
        try {
            console.log('📝 Generando Registro de Ventas...', filtros);
            const registroVentas = await this.accountingService.getRegistroVentas(filtros);
            return {
                success: true,
                data: registroVentas
            };
        }
        catch (error) {
            console.error('❌ Error generando Registro de Ventas:', error);
            return {
                success: false,
                message: 'Error generando Registro de Ventas',
                data: null
            };
        }
    }
    async getRegistroCompras(filtros) {
        try {
            console.log('🛒 Generando Registro de Compras...', filtros);
            // TODO: Implementar cuando tengas facturas de proveedores
            return {
                success: true,
                data: {
                    periodo: 'Próximamente',
                    totalCompras: 0,
                    compras: [],
                    resumen: {
                        baseImponible: 0,
                        igv: 0,
                        total: 0
                    }
                }
            };
        }
        catch (error) {
            console.error('❌ Error generando Registro de Compras:', error);
            return {
                success: false,
                message: 'Error generando Registro de Compras',
                data: null
            };
        }
    }
};
exports.ContabilidadController = ContabilidadController;
__decorate([
    (0, common_1.Get)('estado-resultados'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener Estado de Resultados (P&L)' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Estado de Resultados obtenido exitosamente' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ContabilidadController.prototype, "getEstadoResultados", null);
__decorate([
    (0, common_1.Get)('balance-general'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener Balance General' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Balance General obtenido exitosamente' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ContabilidadController.prototype, "getBalanceGeneral", null);
__decorate([
    (0, common_1.Get)('flujo-efectivo'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener Estado de Flujo de Efectivo' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Flujo de Efectivo obtenido exitosamente' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ContabilidadController.prototype, "getFlujoEfectivo", null);
__decorate([
    (0, common_1.Get)('plan-cuentas'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener Plan de Cuentas' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Plan de Cuentas obtenido exitosamente' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ContabilidadController.prototype, "getPlanCuentas", null);
__decorate([
    (0, common_1.Get)('ratios-financieros'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener Ratios Financieros' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Ratios Financieros obtenidos exitosamente' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ContabilidadController.prototype, "getRatiosFinancieros", null);
__decorate([
    (0, common_1.Post)('asiento-contable'),
    (0, swagger_1.ApiOperation)({ summary: 'Crear nuevo asiento contable' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Asiento contable creado exitosamente' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ContabilidadController.prototype, "crearAsientoContable", null);
__decorate([
    (0, common_1.Get)('asientos-contables'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener listado de asientos contables' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Asientos contables obtenidos exitosamente' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ContabilidadController.prototype, "getAsientosContables", null);
__decorate([
    (0, common_1.Get)('libro-mayor/:cuentaCodigo'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener libro mayor de una cuenta específica' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Libro mayor obtenido exitosamente' }),
    __param(0, (0, common_1.Param)('cuentaCodigo')),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ContabilidadController.prototype, "getLibroMayor", null);
__decorate([
    (0, common_1.Get)('libro-mayor-completo'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener libro mayor de todas las cuentas con movimientos' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Libro mayor completo obtenido exitosamente' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ContabilidadController.prototype, "getLibroMayorCompleto", null);
__decorate([
    (0, common_1.Get)('balance-comprobacion'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener Balance de Comprobación' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Balance de Comprobación obtenido exitosamente' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ContabilidadController.prototype, "getBalanceComprobacion", null);
__decorate([
    (0, common_1.Post)('cierre-contable'),
    (0, swagger_1.ApiOperation)({ summary: 'Realizar cierre contable del período' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Cierre contable realizado exitosamente' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ContabilidadController.prototype, "realizarCierreContable", null);
__decorate([
    (0, common_1.Get)('libro-diario'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener Libro Diario (Registro cronológico de asientos)' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Libro Diario obtenido exitosamente' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ContabilidadController.prototype, "getLibroDiario", null);
__decorate([
    (0, common_1.Get)('registro-ventas'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener Registro de Ventas (Libro de Ventas e Ingresos)' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Registro de Ventas obtenido exitosamente' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ContabilidadController.prototype, "getRegistroVentas", null);
__decorate([
    (0, common_1.Get)('registro-compras'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener Registro de Compras' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Registro de Compras obtenido exitosamente' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ContabilidadController.prototype, "getRegistroCompras", null);
exports.ContabilidadController = ContabilidadController = __decorate([
    (0, swagger_1.ApiTags)('contabilidad'),
    (0, common_1.Controller)('contabilidad'),
    __metadata("design:paramtypes", [accounting_integration_service_1.AccountingIntegrationService])
], ContabilidadController);
