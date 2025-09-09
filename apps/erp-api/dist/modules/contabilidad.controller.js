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
const accounting_books_service_1 = require("../shared/integration/accounting-books.service");
const supabase_service_1 = require("../shared/supabase/supabase.service");
let ContabilidadController = class ContabilidadController {
    constructor(accountingService, supabaseService) {
        this.accountingService = accountingService;
        this.supabaseService = supabaseService;
        console.log('📚 [ContabilidadController] Inicializado con AccountingBooksService');
    }
    getEstadoResultados(periodo) {
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
    async getBalanceComprobacion(filtros) {
        try {
            console.log('⚖️ Generando Balance de Comprobación...', filtros);
            const balanceComprobacion = await this.accountingService.getBalanceComprobacion(filtros);
            return {
                success: true,
                data: balanceComprobacion
            };
        }
        catch (error) {
            console.error('❌ Error generando Balance de Comprobación:', error);
            return {
                success: false,
                message: 'Error generando Balance de Comprobación',
                data: null
            };
        }
    }
    async getKardexValorizado(filtros) {
        try {
            console.log('📦 Generando Kardex Valorizado...', filtros);
            const kardexValorizado = await this.accountingService.getKardexValorizado(filtros);
            return {
                success: true,
                data: kardexValorizado
            };
        }
        catch (error) {
            console.error('❌ Error generando Kardex Valorizado:', error);
            return {
                success: false,
                message: 'Error generando Kardex Valorizado',
                data: null
            };
        }
    }
    realizarCierreContable(cierreData) {
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
    async getLibroCajaBancos(filtros) {
        try {
            console.log('💰 Generando Libro de Caja y Bancos...', filtros);
            const libroCajaBancos = await this.accountingService.getLibroCajaBancos(filtros);
            return {
                success: true,
                data: libroCajaBancos
            };
        }
        catch (error) {
            console.error('❌ Error generando Libro de Caja y Bancos:', error);
            return {
                success: false,
                message: 'Error generando Libro de Caja y Bancos',
                data: null
            };
        }
    }
    async getRegistroActivosFijos(filtros) {
        try {
            console.log('🏦 Generando Registro de Activos Fijos...', filtros);
            const registroActivosFijos = await this.accountingService.getRegistroActivosFijos(filtros);
            return {
                success: true,
                data: registroActivosFijos
            };
        }
        catch (error) {
            console.error('❌ Error generando Registro de Activos Fijos:', error);
            return {
                success: false,
                message: 'Error generando Registro de Activos Fijos',
                data: null
            };
        }
    }
    async getLibroPlanillas(filtros) {
        try {
            console.log('👥 Generando Libro de Planillas...', filtros);
            const libroPlanillas = await this.accountingService.getLibroPlanillas(filtros);
            return {
                success: true,
                data: libroPlanillas
            };
        }
        catch (error) {
            console.error('❌ Error generando Libro de Planillas:', error);
            return {
                success: false,
                message: 'Error generando Libro de Planillas',
                data: null
            };
        }
    }
    async getLibroInventariosBalances(filtros) {
        try {
            console.log('📦 Generando Libro de Inventarios y Balances...', filtros);
            const libroInventariosBalances = await this.accountingService.getLibroInventariosBalances(filtros);
            return {
                success: true,
                data: libroInventariosBalances
            };
        }
        catch (error) {
            console.error('❌ Error generando Libro de Inventarios y Balances:', error);
            return {
                success: false,
                message: 'Error generando Libro de Inventarios y Balances',
                data: null
            };
        }
    }
    async getRegistroCostos(filtros) {
        try {
            console.log('🏭 Generando Registro de Costos...', filtros);
            const registroCostos = await this.accountingService.getRegistroCostos(filtros);
            return {
                success: true,
                data: registroCostos
            };
        }
        catch (error) {
            console.error('❌ Error generando Registro de Costos:', error);
            return {
                success: false,
                message: 'Error generando Registro de Costos',
                data: null
            };
        }
    }
    async getLibrosElectronicosSunat(filtros) {
        try {
            console.log('📱 Generando Libros Electrónicos SUNAT...', filtros);
            const librosElectronicos = await this.accountingService.getLibrosElectronicosSunat(filtros);
            return {
                success: true,
                data: librosElectronicos
            };
        }
        catch (error) {
            console.error('❌ Error generando Libros Electrónicos SUNAT:', error);
            return {
                success: false,
                message: 'Error generando Libros Electrónicos SUNAT',
                data: null
            };
        }
    }
    async getLibroDiario(filtros) {
        try {
            console.log('📖 Generando Libro Diario...', filtros);
            const asientos = await this.accountingService.getAsientosContables(filtros);
            let asientosRrhh = [];
            try {
                const { data: rrhhAsientos, error: rrhhError } = await this.supabaseService.getClient()
                    .from('asientos_contables_rrhh')
                    .select('*')
                    .order('fecha', { ascending: false });
                if (!rrhhError && rrhhAsientos) {
                    asientosRrhh = rrhhAsientos.map(asiento => ({
                        numero_asiento: `RRHH-${asiento.planilla_id?.substring(0, 8)}-${asiento.cuenta}`,
                        fecha: asiento.fecha,
                        concepto: asiento.descripcion,
                        referencia: `RRHH-${asiento.planilla_id}`,
                        total_debe: asiento.debe || 0,
                        total_haber: asiento.haber || 0,
                        estado: 'RRHH',
                        detalle_asientos: [{
                                cuenta_id: asiento.cuenta,
                                debe: asiento.debe || 0,
                                haber: asiento.haber || 0,
                                concepto: asiento.descripcion
                            }]
                    }));
                    console.log(`📊 [Contabilidad] Encontrados ${asientosRrhh.length} asientos de RRHH`);
                }
            }
            catch (rrhhError) {
                console.warn('⚠️ Error obteniendo asientos RRHH:', rrhhError);
            }
            const todosLosAsientos = [...asientos, ...asientosRrhh];
            const libroDiario = todosLosAsientos.map(asiento => ({
                numeroAsiento: asiento.numero_asiento,
                fecha: asiento.fecha,
                concepto: asiento.concepto,
                referencia: asiento.referencia,
                detalles: (asiento.detalle_asientos || []).map(detalle => ({
                    cuentaId: detalle.cuenta_id,
                    cuentaCodigo: detalle.cuenta_id,
                    cuentaNombre: detalle.cuenta_id,
                    descripcion: detalle.concepto || 'Movimiento contable',
                    debe: parseFloat(detalle.debe || 0),
                    haber: parseFloat(detalle.haber || 0)
                })),
                totalDebe: parseFloat(asiento.total_debe || 0),
                totalHaber: parseFloat(asiento.total_haber || 0),
                estado: asiento.estado
            }));
            libroDiario.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
            return {
                success: true,
                data: {
                    periodo: filtros.fechaDesde && filtros.fechaHasta
                        ? `${filtros.fechaDesde} al ${filtros.fechaHasta}`
                        : 'Todos los registros',
                    totalAsientos: libroDiario.length,
                    totalDebe: libroDiario.reduce((sum, a) => sum + a.totalDebe, 0),
                    totalHaber: libroDiario.reduce((sum, a) => sum + a.totalHaber, 0),
                    asientos: libroDiario,
                    fuentes: {
                        contabilidad: asientos.length,
                        rrhh: asientosRrhh.length
                    }
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
            const registroCompras = await this.accountingService.getRegistroCompras(filtros);
            return {
                success: true,
                data: registroCompras
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
    async getRegistroConsignaciones(fechaDesde, fechaHasta, estado) {
        try {
            console.log('📋 [ContabilidadController] Obteniendo registro de consignaciones...');
            const filtros = {
                fechaDesde,
                fechaHasta,
                estado
            };
            const consignaciones = await this.accountingService.getRegistroConsignaciones(filtros);
            return {
                success: true,
                data: consignaciones,
                message: 'Registro de consignaciones obtenido exitosamente'
            };
        }
        catch (error) {
            console.error('❌ [ContabilidadController] Error obteniendo registro de consignaciones:', error);
            throw error;
        }
    }
    async createConsignacion(consignacionData) {
        try {
            console.log('📋 [ContabilidadController] Creando nueva consignación...');
            const consignacion = await this.accountingService.createConsignacion(consignacionData);
            return {
                success: true,
                data: consignacion,
                message: 'Consignación creada exitosamente'
            };
        }
        catch (error) {
            console.error('❌ [ContabilidadController] Error creando consignación:', error);
            throw error;
        }
    }
    async updateEstadoConsignacion(id, nuevoEstado) {
        try {
            console.log('📋 [ContabilidadController] Actualizando estado de consignación...');
            const consignacion = await this.accountingService.updateEstadoConsignacion(id, nuevoEstado);
            return {
                success: true,
                data: consignacion,
                message: 'Estado de consignación actualizado exitosamente'
            };
        }
        catch (error) {
            console.error('❌ [ContabilidadController] Error actualizando estado:', error);
            throw error;
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
    __metadata("design:returntype", Promise)
], ContabilidadController.prototype, "getBalanceComprobacion", null);
__decorate([
    (0, common_1.Get)('kardex-valorizado'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener Kardex Valorizado de Inventarios' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Kardex Valorizado obtenido exitosamente' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ContabilidadController.prototype, "getKardexValorizado", null);
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
    (0, common_1.Get)('libro-caja-bancos'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener Libro de Caja y Bancos' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Libro de Caja y Bancos obtenido exitosamente' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ContabilidadController.prototype, "getLibroCajaBancos", null);
__decorate([
    (0, common_1.Get)('registro-activos-fijos'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener Registro de Activos Fijos' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Registro de Activos Fijos obtenido exitosamente' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ContabilidadController.prototype, "getRegistroActivosFijos", null);
__decorate([
    (0, common_1.Get)('libro-planillas'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener Libro de Planillas Oficial' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Libro de Planillas obtenido exitosamente' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ContabilidadController.prototype, "getLibroPlanillas", null);
__decorate([
    (0, common_1.Get)('libro-inventarios-balances'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener Libro de Inventarios y Balances' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Libro de Inventarios y Balances obtenido exitosamente' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ContabilidadController.prototype, "getLibroInventariosBalances", null);
__decorate([
    (0, common_1.Get)('registro-costos'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener Registro de Costos' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Registro de Costos obtenido exitosamente' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ContabilidadController.prototype, "getRegistroCostos", null);
__decorate([
    (0, common_1.Get)('libros-electronicos-sunat'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener Libros Electrónicos SUNAT' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Libros Electrónicos SUNAT obtenidos exitosamente' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ContabilidadController.prototype, "getLibrosElectronicosSunat", null);
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
__decorate([
    (0, common_1.Get)('registro-consignaciones'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener Registro de Consignaciones' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Registro de Consignaciones obtenido exitosamente' }),
    __param(0, (0, common_1.Query)('fechaDesde')),
    __param(1, (0, common_1.Query)('fechaHasta')),
    __param(2, (0, common_1.Query)('estado')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], ContabilidadController.prototype, "getRegistroConsignaciones", null);
__decorate([
    (0, common_1.Post)('registro-consignaciones'),
    (0, swagger_1.ApiOperation)({ summary: 'Crear nueva consignación' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'Consignación creada exitosamente' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ContabilidadController.prototype, "createConsignacion", null);
__decorate([
    (0, common_1.Post)('registro-consignaciones/:id/estado'),
    (0, swagger_1.ApiOperation)({ summary: 'Actualizar estado de consignación' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Estado de consignación actualizado exitosamente' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)('estado')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], ContabilidadController.prototype, "updateEstadoConsignacion", null);
exports.ContabilidadController = ContabilidadController = __decorate([
    (0, swagger_1.ApiTags)('contabilidad'),
    (0, common_1.Controller)('contabilidad'),
    __metadata("design:paramtypes", [accounting_books_service_1.AccountingBooksService,
        supabase_service_1.SupabaseService])
], ContabilidadController);
//# sourceMappingURL=contabilidad.controller.js.map