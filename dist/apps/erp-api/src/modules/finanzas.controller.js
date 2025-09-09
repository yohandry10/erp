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
exports.FinanzasController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const supabase_service_1 = require("../shared/supabase/supabase.service");
const event_bus_service_1 = require("../shared/events/event-bus.service");
const financial_integration_service_1 = require("../shared/integration/financial-integration.service");
let FinanzasController = class FinanzasController {
    constructor(supabase, eventBus, financialService) {
        this.supabase = supabase;
        this.eventBus = eventBus;
        this.financialService = financialService;
    }
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
                        utilidadMensual: [] // TODO: Implementar consulta histórica
                    }
                }
            };
        }
        catch (error) {
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
    getFlujoProyectado(meses) {
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
    getAnalisisCredito(solicitudData) {
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
        }
        catch (error) {
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
    getAnalisisVentas(periodo) {
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
    getIndicadoresKPI() {
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
    simularEscenarios(parametros) {
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
    async getKPIsFinancieros() {
        try {
            const kpis = await this.financialService.getKPIsFinancieros();
            return {
                success: true,
                data: kpis
            };
        }
        catch (error) {
            console.error('❌ Error obteniendo KPIs financieros:', error);
            return {
                success: false,
                message: 'Error al obtener KPIs financieros',
                error: error.message
            };
        }
    }
    async getAlertas() {
        try {
            const alertas = await this.financialService.getAlertas();
            return {
                success: true,
                data: alertas
            };
        }
        catch (error) {
            console.error('❌ Error obteniendo alertas:', error);
            return {
                success: false,
                message: 'Error al obtener alertas financieras',
                error: error.message
            };
        }
    }
    async pagarFactura(facturaId, pagoData) {
        try {
            console.log(`💰 [Finanzas] Registrando pago de factura ${facturaId}`);
            // Obtener datos de la factura
            const { data: factura, error: facturaError } = await this.supabase.getClient()
                .from('comprobantes_electronicos')
                .select('*')
                .eq('id', facturaId)
                .single();
            if (facturaError) {
                throw new Error('Factura no encontrada');
            }
            // Calcular nuevo saldo
            const montoPagado = parseFloat(pagoData.monto);
            const saldoAnterior = parseFloat(factura.saldo_pendiente || factura.total);
            const nuevoSaldo = saldoAnterior - montoPagado;
            const estadoPago = nuevoSaldo <= 0 ? 'COMPLETO' : 'PARCIAL';
            // Registrar el pago en la base de datos
            const { data: pago, error: pagoError } = await this.supabase.getClient()
                .from('pagos_facturas')
                .insert({
                factura_id: facturaId,
                monto_pagado: montoPagado,
                metodo_pago: pagoData.metodoPago,
                fecha_pago: new Date().toISOString(),
                observaciones: pagoData.observaciones || '',
                usuario_id: pagoData.usuarioId || 'sistema'
            })
                .select()
                .single();
            if (pagoError) {
                throw pagoError;
            }
            // Actualizar saldo de la factura
            const { error: updateError } = await this.supabase.getClient()
                .from('comprobantes_electronicos')
                .update({
                saldo_pendiente: nuevoSaldo,
                estado_pago: estadoPago
            })
                .eq('id', facturaId);
            if (updateError) {
                throw updateError;
            }
            // 🎯 EMITIR EVENTO PARA CONTABILIDAD
            console.log('🎯 [Finanzas] Emitiendo evento de pago de factura para contabilidad...');
            const eventoPago = {
                facturaId: facturaId,
                cpeId: facturaId,
                numeroFactura: `${factura.serie}-${factura.numero}`,
                clienteId: factura.cliente_id,
                montoPagado: montoPagado,
                metodoPago: pagoData.metodoPago,
                fechaPago: new Date().toISOString(),
                saldoPendiente: nuevoSaldo,
                estadoPago: estadoPago
            };
            this.eventBus.emitPagoFactura(eventoPago);
            console.log('✅ [Finanzas] Evento de pago de factura emitido exitosamente');
            return {
                success: true,
                data: {
                    pago: pago,
                    nuevoSaldo: nuevoSaldo,
                    estadoPago: estadoPago
                },
                message: 'Pago registrado exitosamente'
            };
        }
        catch (error) {
            console.error('❌ Error registrando pago:', error);
            return {
                success: false,
                message: 'Error al registrar el pago',
                error: error.message
            };
        }
    }
    async registrarGasto(gastoData) {
        try {
            console.log(`💸 [Finanzas] Registrando gasto: ${gastoData.concepto}`);
            // Validar datos requeridos
            if (!gastoData.concepto || !gastoData.monto || !gastoData.categoria) {
                throw new Error('Datos incompletos: concepto, monto y categoría son requeridos');
            }
            // Registrar el gasto
            const { data: gasto, error: gastoError } = await this.supabase.getClient()
                .from('gastos')
                .insert({
                concepto: gastoData.concepto,
                categoria: gastoData.categoria,
                monto: parseFloat(gastoData.monto),
                proveedor: gastoData.proveedor || null,
                metodo_pago: gastoData.metodoPago || 'EFECTIVO',
                fecha: gastoData.fecha || new Date().toISOString(),
                observaciones: gastoData.observaciones || '',
                usuario_id: gastoData.usuarioId || 'sistema',
                requiere_asiento: gastoData.requiereAsiento !== false // por defecto true
            })
                .select()
                .single();
            if (gastoError) {
                throw gastoError;
            }
            // 🎯 EMITIR EVENTO PARA CONTABILIDAD (si se requiere asiento)
            if (gastoData.requiereAsiento !== false) {
                console.log('🎯 [Finanzas] Emitiendo evento de gasto registrado para contabilidad...');
                const eventoGasto = {
                    gastoId: gasto.id,
                    concepto: gasto.concepto,
                    categoria: gasto.categoria,
                    monto: parseFloat(gasto.monto),
                    proveedor: gasto.proveedor,
                    metodoPago: gasto.metodo_pago,
                    fecha: gasto.fecha,
                    requiereAsiento: gasto.requiere_asiento
                };
                this.eventBus.emitGastoRegistrado(eventoGasto);
                console.log('✅ [Finanzas] Evento de gasto registrado emitido exitosamente');
            }
            return {
                success: true,
                data: gasto,
                message: 'Gasto registrado exitosamente'
            };
        }
        catch (error) {
            console.error('❌ Error registrando gasto:', error);
            return {
                success: false,
                message: 'Error al registrar el gasto',
                error: error.message
            };
        }
    }
    async getGastos(filtros) {
        try {
            let query = this.supabase.getClient()
                .from('gastos')
                .select('*')
                .order('fecha', { ascending: false });
            if (filtros.categoria) {
                query = query.eq('categoria', filtros.categoria);
            }
            if (filtros.fecha_desde) {
                query = query.gte('fecha', filtros.fecha_desde);
            }
            if (filtros.fecha_hasta) {
                query = query.lte('fecha', filtros.fecha_hasta);
            }
            const { data: gastos, error } = await query;
            if (error)
                throw error;
            return {
                success: true,
                data: gastos || []
            };
        }
        catch (error) {
            console.error('❌ Error obteniendo gastos:', error);
            return {
                success: false,
                message: 'Error al obtener gastos',
                error: error.message
            };
        }
    }
    async getPagosFacturas(filtros) {
        try {
            let query = this.supabase.getClient()
                .from('pagos_facturas')
                .select(`
          *,
          comprobantes_electronicos (
            serie,
            numero,
            total,
            cliente_id
          )
        `)
                .order('fecha_pago', { ascending: false });
            if (filtros.factura_id) {
                query = query.eq('factura_id', filtros.factura_id);
            }
            if (filtros.fecha_desde) {
                query = query.gte('fecha_pago', filtros.fecha_desde);
            }
            if (filtros.fecha_hasta) {
                query = query.lte('fecha_pago', filtros.fecha_hasta);
            }
            const { data: pagos, error } = await query;
            if (error)
                throw error;
            return {
                success: true,
                data: pagos || []
            };
        }
        catch (error) {
            console.error('❌ Error obteniendo pagos:', error);
            return {
                success: false,
                message: 'Error al obtener pagos de facturas',
                error: error.message
            };
        }
    }
    async getFlujoEfectivo(filtros) {
        try {
            const fechaInicio = filtros.fecha_desde || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
            const fechaFin = filtros.fecha_hasta || new Date().toISOString();
            // Obtener ingresos (ventas y cobros)
            const { data: ingresos } = await this.supabase.getClient()
                .from('ventas_pos')
                .select('total, fecha, metodo_pago')
                .gte('fecha', fechaInicio)
                .lte('fecha', fechaFin);
            // Obtener egresos (gastos)
            const { data: egresos } = await this.supabase.getClient()
                .from('gastos')
                .select('monto, fecha, categoria')
                .gte('fecha', fechaInicio)
                .lte('fecha', fechaFin);
            const totalIngresos = (ingresos || []).reduce((sum, ingreso) => sum + parseFloat(ingreso.total || 0), 0);
            const totalEgresos = (egresos || []).reduce((sum, egreso) => sum + parseFloat(egreso.monto || 0), 0);
            const flujoNeto = totalIngresos - totalEgresos;
            return {
                success: true,
                data: {
                    periodo: {
                        inicio: fechaInicio,
                        fin: fechaFin
                    },
                    ingresos: {
                        total: totalIngresos,
                        detalle: ingresos || []
                    },
                    egresos: {
                        total: totalEgresos,
                        detalle: egresos || []
                    },
                    flujoNeto: flujoNeto,
                    analisis: {
                        estado: flujoNeto > 0 ? 'POSITIVO' : flujoNeto < 0 ? 'NEGATIVO' : 'NEUTRAL',
                        porcentajeMargen: totalIngresos > 0 ? ((flujoNeto / totalIngresos) * 100).toFixed(2) : 0
                    }
                }
            };
        }
        catch (error) {
            console.error('❌ Error obteniendo flujo de efectivo:', error);
            return {
                success: false,
                message: 'Error al obtener flujo de efectivo',
                error: error.message
            };
        }
    }
};
exports.FinanzasController = FinanzasController;
__decorate([
    (0, common_1.Get)('dashboard'),
    (0, swagger_1.ApiOperation)({ summary: 'Dashboard financiero principal' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Dashboard financiero obtenido exitosamente' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], FinanzasController.prototype, "getDashboardFinanciero", null);
__decorate([
    (0, common_1.Get)('flujo-caja-proyectado'),
    (0, swagger_1.ApiOperation)({ summary: 'Proyección de flujo de caja' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Flujo de caja proyectado obtenido exitosamente' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], FinanzasController.prototype, "getFlujoProyectado", null);
__decorate([
    (0, common_1.Get)('analisis-credito'),
    (0, swagger_1.ApiOperation)({ summary: 'Análisis para solicitud de crédito' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Análisis de crédito obtenido exitosamente' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], FinanzasController.prototype, "getAnalisisCredito", null);
__decorate([
    (0, common_1.Get)('cuentas-por-cobrar'),
    (0, swagger_1.ApiOperation)({ summary: 'Análisis de cuentas por cobrar' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Cuentas por cobrar obtenidas exitosamente' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], FinanzasController.prototype, "getCuentasPorCobrar", null);
__decorate([
    (0, common_1.Get)('cuentas-por-pagar'),
    (0, swagger_1.ApiOperation)({ summary: 'Análisis de cuentas por pagar' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Cuentas por pagar obtenidas exitosamente' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], FinanzasController.prototype, "getCuentasPorPagar", null);
__decorate([
    (0, common_1.Get)('rentabilidad-productos'),
    (0, swagger_1.ApiOperation)({ summary: 'Análisis de rentabilidad por producto' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Rentabilidad por producto obtenida exitosamente' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], FinanzasController.prototype, "getRentabilidadProductos", null);
__decorate([
    (0, common_1.Get)('punto-equilibrio'),
    (0, swagger_1.ApiOperation)({ summary: 'Análisis de punto de equilibrio' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Punto de equilibrio obtenido exitosamente' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], FinanzasController.prototype, "getPuntoEquilibrio", null);
__decorate([
    (0, common_1.Get)('ventas-analisis'),
    (0, swagger_1.ApiOperation)({ summary: 'Análisis detallado de ventas' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Análisis de ventas obtenido exitosamente' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], FinanzasController.prototype, "getAnalisisVentas", null);
__decorate([
    (0, common_1.Get)('indicadores-kpi'),
    (0, swagger_1.ApiOperation)({ summary: 'KPIs financieros principales' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'KPIs obtenidos exitosamente' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], FinanzasController.prototype, "getIndicadoresKPI", null);
__decorate([
    (0, common_1.Post)('simulacion-escenarios'),
    (0, swagger_1.ApiOperation)({ summary: 'Simulación de escenarios financieros' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Simulación completada exitosamente' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], FinanzasController.prototype, "simularEscenarios", null);
__decorate([
    (0, common_1.Get)('kpis'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener KPIs financieros' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'KPIs obtenidos exitosamente' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], FinanzasController.prototype, "getKPIsFinancieros", null);
__decorate([
    (0, common_1.Get)('alertas'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener alertas financieras' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Alertas obtenidas exitosamente' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], FinanzasController.prototype, "getAlertas", null);
__decorate([
    (0, common_1.Post)('facturas/:id/pagar'),
    (0, swagger_1.ApiOperation)({ summary: 'Registrar pago de factura' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Pago registrado exitosamente' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], FinanzasController.prototype, "pagarFactura", null);
__decorate([
    (0, common_1.Post)('gastos'),
    (0, swagger_1.ApiOperation)({ summary: 'Registrar nuevo gasto' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Gasto registrado exitosamente' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], FinanzasController.prototype, "registrarGasto", null);
__decorate([
    (0, common_1.Get)('gastos'),
    (0, swagger_1.ApiOperation)({ summary: 'Listar gastos' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Gastos obtenidos exitosamente' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], FinanzasController.prototype, "getGastos", null);
__decorate([
    (0, common_1.Get)('pagos-facturas'),
    (0, swagger_1.ApiOperation)({ summary: 'Listar pagos de facturas' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Pagos obtenidos exitosamente' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], FinanzasController.prototype, "getPagosFacturas", null);
__decorate([
    (0, common_1.Get)('flujo-efectivo'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener análisis de flujo de efectivo' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Flujo de efectivo obtenido exitosamente' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], FinanzasController.prototype, "getFlujoEfectivo", null);
exports.FinanzasController = FinanzasController = __decorate([
    (0, swagger_1.ApiTags)('finanzas'),
    (0, common_1.Controller)('finanzas'),
    __metadata("design:paramtypes", [supabase_service_1.SupabaseService,
        event_bus_service_1.EventBusService,
        financial_integration_service_1.FinancialIntegrationService])
], FinanzasController);
