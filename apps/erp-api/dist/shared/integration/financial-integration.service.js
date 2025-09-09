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
Object.defineProperty(exports, "__esModule", { value: true });
exports.FinancialIntegrationService = void 0;
const common_1 = require("@nestjs/common");
const supabase_service_1 = require("../supabase/supabase.service");
const event_bus_service_1 = require("../events/event-bus.service");
let FinancialIntegrationService = class FinancialIntegrationService {
    constructor(supabase, eventBus) {
        this.supabase = supabase;
        this.eventBus = eventBus;
        this.kpisCache = null;
        this.lastKPIUpdate = null;
        this.cacheValidityMinutes = 5;
        this.initializeEventListeners();
    }
    initializeEventListeners() {
        console.log('💰 [Finanzas] Inicializando listeners de eventos...');
        this.eventBus.onVentaProcessed(async (event) => {
            console.log('💰 [Finanzas] Procesando venta para KPIs...');
            await this.procesarVentaParaFinanzas(event.data);
        });
        this.eventBus.onCompraEntregada(async (event) => {
            console.log('💰 [Finanzas] Procesando compra entregada para KPIs...');
            await this.procesarCompraParaFinanzas(event.data);
        });
        this.eventBus.onGastoRegistrado(async (event) => {
            console.log('💰 [Finanzas] Procesando gasto registrado para KPIs...');
            await this.procesarGastoParaFinanzas(event.data);
        });
        this.eventBus.onPagoFactura(async (event) => {
            console.log('💰 [Finanzas] Procesando pago de factura para flujo de efectivo...');
            await this.procesarPagoFacturaParaFinanzas(event.data);
        });
    }
    async getDatosHistoricosCompleto() {
        try {
            const [ventasMensuales, gastosMensuales, utilidadMensual] = await Promise.all([
                this.obtenerVentasMensuales(),
                this.obtenerGastosMensuales(),
                this.obtenerUtilidadMensual()
            ]);
            return {
                ventasMensuales,
                gastosMensuales,
                utilidadMensual
            };
        }
        catch (error) {
            console.error('❌ Error obteniendo datos históricos:', error);
            return {
                ventasMensuales: [],
                gastosMensuales: [],
                utilidadMensual: []
            };
        }
    }
    async obtenerVentasMensuales() {
        const { data } = await this.supabase.getClient()
            .from('ventas_pos')
            .select('total, fecha, EXTRACT(YEAR FROM fecha) as anio, EXTRACT(MONTH FROM fecha) as mes, TO_CHAR(fecha, \'YYYY-MM\') as periodo')
            .gte('fecha', new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString())
            .order('fecha', { ascending: true });
        const ventasPorMes = new Map();
        data?.forEach(venta => {
            const periodo = venta.periodo;
            if (!ventasPorMes.has(periodo)) {
                ventasPorMes.set(periodo, {
                    mes: new Date(venta.fecha).toLocaleString('es-ES', { month: 'long' }),
                    anio: venta.anio,
                    ventas: 0,
                    gastos: 0,
                    utilidad: 0
                });
            }
            ventasPorMes.get(periodo).ventas += parseFloat(venta.total || 0);
        });
        return Array.from(ventasPorMes.values());
    }
    async obtenerGastosMensuales() {
        const { data } = await this.supabase.getClient()
            .from('gastos')
            .select('monto, categoria, fecha, TO_CHAR(fecha, \'YYYY-MM\') as periodo')
            .gte('fecha', new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString())
            .order('fecha', { ascending: true });
        const gastosPorMes = new Map();
        data?.forEach(gasto => {
            const periodo = gasto.periodo;
            if (!gastosPorMes.has(periodo)) {
                gastosPorMes.set(periodo, {
                    mes: new Date(gasto.fecha).toLocaleString('es-ES', { month: 'long' }),
                    categoria: gasto.categoria,
                    monto: 0
                });
            }
            gastosPorMes.get(periodo).monto += parseFloat(gasto.monto || 0);
        });
        return Array.from(gastosPorMes.values());
    }
    async obtenerUtilidadMensual() {
        const ventas = await this.obtenerVentasMensuales();
        const gastos = await this.obtenerGastosMensuales();
        const utilidadMap = new Map();
        ventas.forEach(v => {
            const key = `${v.anio}-${v.mes}`;
            if (!utilidadMap.has(key)) {
                utilidadMap.set(key, {
                    mes: v.mes,
                    anio: v.anio,
                    utilidad: 0,
                    ventas: 0
                });
            }
            utilidadMap.get(key).ventas += v.ventas;
        });
        gastos.forEach(g => {
            const key = `${g.anio}-${g.mes}`;
            if (utilidadMap.has(key)) {
                utilidadMap.get(key).utilidad -= g.monto;
            }
        });
        return Array.from(utilidadMap.values()).map(u => ({
            ...u,
            utilidad: u.ventas - Math.abs(u.utilidad),
            margen: u.ventas > 0 ? ((u.utilidad / u.ventas) * 100) : 0
        }));
    }
    async getFlujoProyectado(meses = 12) {
        try {
            const datosHistoricos = await this.getDatosHistoricosCompleto();
            const promedioVentas = this.calcularPromedio(datosHistoricos.ventasMensuales.map(v => v.ventas));
            const promedioGastos = this.calcularPromedio(datosHistoricos.gastosMensuales.map(g => g.monto));
            const proyeccion = [];
            let saldoAcumulado = await this.calcularEfectivoDisponible();
            for (let i = 1; i <= meses; i++) {
                const fecha = new Date();
                fecha.setMonth(fecha.getMonth() + i);
                const ingresos = promedioVentas * (1 + (Math.random() * 0.2 - 0.1));
                const egresos = promedioGastos * (1 + (Math.random() * 0.15 - 0.05));
                const saldoNeto = ingresos - egresos;
                saldoAcumulado += saldoNeto;
                proyeccion.push({
                    mes: fecha.toLocaleString('es-ES', { month: 'long' }),
                    anio: fecha.getFullYear(),
                    ingresos: Math.round(ingresos * 100) / 100,
                    egresos: Math.round(egresos * 100) / 100,
                    saldoNeto: Math.round(saldoNeto * 100) / 100,
                    saldoAcumulado: Math.round(saldoAcumulado * 100) / 100
                });
            }
            const recomendaciones = this.generarRecomendacionesFlujo(proyeccion);
            const escenarios = this.generarEscenarios(proyeccion);
            return {
                meses: proyeccion,
                recomendaciones,
                escenarios
            };
        }
        catch (error) {
            console.error('❌ Error calculando flujo proyectado:', error);
            return {
                meses: [],
                recomendaciones: ['Error en cálculos'],
                escenarios: { optimista: [], realista: [], pesimista: [] }
            };
        }
    }
    calcularPromedio(valores) {
        if (valores.length === 0)
            return 0;
        return valores.reduce((sum, val) => sum + val, 0) / valores.length;
    }
    generarRecomendacionesFlujo(proyeccion) {
        const recomendaciones = [];
        const mesesNegativos = proyeccion.filter(p => p.saldoNeto < 0).length;
        if (mesesNegativos > 0) {
            recomendaciones.push(`⚠️ Se proyectan ${mesesNegativos} meses con flujo negativo. Considere reducir gastos o aumentar ingresos.`);
        }
        const saldoMinimo = Math.min(...proyeccion.map(p => p.saldoAcumulado));
        if (saldoMinimo < 0) {
            recomendaciones.push('🔴 Se proyecta déficit acumulado. Necesita financiamiento adicional.');
        }
        const saldoFinal = proyeccion[proyeccion.length - 1]?.saldoAcumulado || 0;
        if (saldoFinal > 0) {
            recomendaciones.push('✅ Proyección positiva. Considere inversiones para crecimiento.');
        }
        return recomendaciones;
    }
    generarEscenarios(proyeccion) {
        return {
            optimista: proyeccion.map(p => ({ ...p, ingresos: p.ingresos * 1.2, egresos: p.egresos * 0.9 })),
            realista: proyeccion,
            pesimista: proyeccion.map(p => ({ ...p, ingresos: p.ingresos * 0.8, egresos: p.egresos * 1.1 }))
        };
    }
    async getAnalisisCredito(solicitudData) {
        try {
            const kpis = await this.getKPIsFinancieros();
            const gastosFijos = kpis.gastosUltimos30dias;
            const capacidadDisponible = kpis.utilidadUltimos30dias;
            const gastosPorcentaje = (gastosFijos / kpis.ventasUltimos30dias) * 100;
            const pagoMensual = solicitudData.montoSolicitado / solicitudData.plazoMeses;
            const ratioEndeudamiento = (pagoMensual / capacidadDisponible) * 100;
            const puntuacion = {
                liquidez: this.calcularPuntuacionLiquidez(kpis.efectivoDisponible, kpis.cuentasPorPagar),
                rentabilidad: this.calcularPuntuacionRentabilidad(kpis.margenBruto),
                historialPagos: this.calcularPuntuacionHistorial(solicitudData.historialCrediticio),
                estabilidad: this.calcularPuntuacionEstabilidad(kpis.crecimiento),
                puntuacionTotal: 0
            };
            puntuacion.puntuacionTotal = (puntuacion.liquidez * 0.25 +
                puntuacion.rentabilidad * 0.25 +
                puntuacion.historialPagos * 0.30 +
                puntuacion.estabilidad * 0.20);
            let recomendacion;
            let justificacion = '';
            if (puntuacion.puntuacionTotal >= 80 && ratioEndeudamiento <= 30) {
                recomendacion = 'RECOMENDAR';
                justificacion = 'Perfil financiero excelente y capacidad de pago adecuada';
            }
            else if (puntuacion.puntuacionTotal >= 60 && ratioEndeudamiento <= 50) {
                recomendacion = 'ANALIZAR';
                justificacion = 'Perfil aceptable pero requiere revisión adicional';
            }
            else {
                recomendacion = 'NO_RECOMENDAR';
                justificacion = 'Riesgo elevado o capacidad de pago insuficiente';
            }
            return {
                capacidadPago: {
                    ingresosMensuales: kpis.ventasUltimos30dias,
                    gastosFijos,
                    gastosPorcentaje,
                    capacidadDisponible,
                    recomendacionMaxima: Math.round(capacidadDisponible * 0.3)
                },
                puntuacion,
                recomendacion,
                justificacion,
                documentosNecesarios: [
                    'Estados financieros últimos 3 meses',
                    'Declaración de impuestos',
                    'Estado de cuenta bancario',
                    'Referencias comerciales'
                ]
            };
        }
        catch (error) {
            console.error('❌ Error en análisis de crédito:', error);
            return {
                capacidadPago: {
                    ingresosMensuales: 0,
                    gastosFijos: 0,
                    gastosPorcentaje: 0,
                    capacidadDisponible: 0,
                    recomendacionMaxima: 0
                },
                puntuacion: {
                    liquidez: 0,
                    rentabilidad: 0,
                    historialPagos: 0,
                    estabilidad: 0,
                    puntuacionTotal: 0
                },
                recomendacion: 'ANALIZAR',
                justificacion: 'Error en el análisis',
                documentosNecesarios: []
            };
        }
    }
    calcularPuntuacionLiquidez(efectivo, cuentasPorPagar) {
        const ratio = cuentasPorPagar > 0 ? efectivo / cuentasPorPagar : 999;
        if (ratio >= 2)
            return 100;
        if (ratio >= 1.5)
            return 80;
        if (ratio >= 1)
            return 60;
        if (ratio >= 0.5)
            return 40;
        return 20;
    }
    calcularPuntuacionRentabilidad(margen) {
        if (margen >= 40)
            return 100;
        if (margen >= 25)
            return 80;
        if (margen >= 15)
            return 60;
        if (margen >= 5)
            return 40;
        return 20;
    }
    calcularPuntuacionHistorial(historial) {
        switch (historial) {
            case 'EXCELENTE': return 100;
            case 'BUENO': return 80;
            case 'REGULAR': return 60;
            case 'MALO': return 30;
            default: return 50;
        }
    }
    calcularPuntuacionEstabilidad(crecimiento) {
        switch (crecimiento) {
            case 'POSITIVO': return 100;
            case 'ESTABLE': return 80;
            case 'NEGATIVO': return 40;
            default: return 60;
        }
    }
    async getKPIsFinancieros() {
        if (this.kpisCache && this.lastKPIUpdate &&
            (new Date().getTime() - this.lastKPIUpdate.getTime()) < (this.cacheValidityMinutes * 60 * 1000)) {
            console.log('💰 Retornando KPIs desde cache');
            return this.kpisCache;
        }
        console.log('💰 Calculando KPIs financieros en tiempo real...');
        const [efectivo, ventas30dias, gastos30dias, cuentasPorCobrar, cuentasPorPagar, inventario] = await Promise.all([
            this.calcularEfectivoDisponible(),
            this.calcularVentas30Dias(),
            this.calcularGastos30Dias(),
            this.calcularCuentasPorCobrar(),
            this.calcularCuentasPorPagar(),
            this.calcularValorInventario()
        ]);
        const utilidad30dias = ventas30dias - gastos30dias;
        const margenBruto = ventas30dias > 0 ? ((utilidad30dias / ventas30dias) * 100) : 0;
        const rotacionInventario = inventario > 0 ? (gastos30dias / inventario) : 0;
        this.kpisCache = {
            efectivoDisponible: efectivo,
            ventasUltimos30dias: ventas30dias,
            gastosUltimos30dias: gastos30dias,
            utilidadUltimos30dias: utilidad30dias,
            cuentasPorCobrar,
            cuentasPorPagar,
            rotacionInventario,
            margenBruto,
            liquidez: this.evaluarLiquidez(efectivo, cuentasPorPagar),
            rentabilidad: this.evaluarRentabilidad(margenBruto),
            crecimiento: await this.evaluarCrecimiento()
        };
        this.lastKPIUpdate = new Date();
        return this.kpisCache;
    }
    async calcularEfectivoDisponible() {
        const { data } = await this.supabase.getClient()
            .from('ventas_pos')
            .select('total')
            .eq('metodo_pago', 'EFECTIVO')
            .gte('fecha', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
        return data?.reduce((sum, venta) => sum + parseFloat(venta.total || 0), 0) || 0;
    }
    async calcularVentas30Dias() {
        const { data } = await this.supabase.getClient()
            .from('ventas_pos')
            .select('total')
            .gte('fecha', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
        return data?.reduce((sum, venta) => sum + parseFloat(venta.total || 0), 0) || 0;
    }
    async calcularGastos30Dias() {
        const { data } = await this.supabase.getClient()
            .from('gastos')
            .select('monto')
            .gte('fecha', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
        return data?.reduce((sum, gasto) => sum + parseFloat(gasto.monto || 0), 0) || 0;
    }
    async calcularCuentasPorCobrar() {
        const { data } = await this.supabase.getClient()
            .from('cuentas_por_cobrar')
            .select('saldo_pendiente')
            .neq('estado', 'COBRADA');
        return data?.reduce((sum, cuenta) => sum + parseFloat(cuenta.saldo_pendiente || 0), 0) || 0;
    }
    async calcularCuentasPorPagar() {
        const { data } = await this.supabase.getClient()
            .from('cuentas_por_pagar')
            .select('saldo_pendiente')
            .neq('estado', 'PAGADA');
        return data?.reduce((sum, cuenta) => sum + parseFloat(cuenta.saldo_pendiente || 0), 0) || 0;
    }
    async calcularValorInventario() {
        const { data } = await this.supabase.getClient()
            .from('productos')
            .select('precio, stock');
        return data?.reduce((sum, producto) => {
            const precio = parseFloat(producto.precio || 0);
            const stock = parseFloat(producto.stock || 0);
            return sum + (precio * stock);
        }, 0) || 0;
    }
    evaluarLiquidez(efectivo, cuentasPorPagar) {
        if (cuentasPorPagar === 0)
            return 'EXCELENTE';
        const ratio = efectivo / cuentasPorPagar;
        if (ratio >= 2)
            return 'EXCELENTE';
        if (ratio >= 1.5)
            return 'BUENA';
        if (ratio >= 1)
            return 'REGULAR';
        if (ratio >= 0.5)
            return 'MALA';
        return 'CRITICA';
    }
    evaluarRentabilidad(margenBruto) {
        if (margenBruto >= 40)
            return 'EXCELENTE';
        if (margenBruto >= 25)
            return 'BUENA';
        if (margenBruto >= 15)
            return 'REGULAR';
        if (margenBruto >= 5)
            return 'MALA';
        return 'CRITICA';
    }
    async evaluarCrecimiento() {
        try {
            const fechaActual = new Date();
            const fechaAnterior = new Date();
            fechaAnterior.setDate(fechaAnterior.getDate() - 60);
            const [ventasActuales, ventasAnteriores] = await Promise.all([
                this.calcularVentasPeriodo(fechaActual, new Date()),
                this.calcularVentasPeriodo(fechaAnterior, fechaActual)
            ]);
            if (ventasAnteriores === 0)
                return 'ESTABLE';
            const crecimiento = ((ventasActuales - ventasAnteriores) / ventasAnteriores) * 100;
            if (crecimiento >= 10)
                return 'POSITIVO';
            if (crecimiento >= -5)
                return 'ESTABLE';
            return 'NEGATIVO';
        }
        catch (error) {
            return 'ESTABLE';
        }
    }
    async calcularVentasPeriodo(fechaInicio, fechaFin) {
        const { data } = await this.supabase.getClient()
            .from('ventas_pos')
            .select('total')
            .gte('fecha', fechaInicio.toISOString())
            .lte('fecha', fechaFin.toISOString());
        return data?.reduce((sum, venta) => sum + parseFloat(venta.total || 0), 0) || 0;
    }
    async procesarVentaParaFinanzas(venta) {
        try {
            console.log(`✅ Venta ${venta.numeroTicket} procesada para KPIs`);
            this.kpisCache = null;
        }
        catch (error) {
            console.error('❌ Error procesando venta para finanzas:', error);
        }
    }
    async procesarCompraParaFinanzas(compra) {
        try {
            console.log(`✅ Compra ${compra.numeroOrden} procesada para KPIs`);
            this.kpisCache = null;
        }
        catch (error) {
            console.error('❌ Error procesando compra para finanzas:', error);
        }
    }
    async procesarGastoParaFinanzas(gasto) {
        try {
            console.log(`✅ Gasto ${gasto.concepto} procesado para KPIs`);
            this.kpisCache = null;
        }
        catch (error) {
            console.error('❌ Error procesando gasto para finanzas:', error);
        }
    }
    async procesarPagoFacturaParaFinanzas(pago) {
        try {
            console.log(`✅ Pago factura ${pago.numeroFactura} procesado para flujo`);
            this.kpisCache = null;
        }
        catch (error) {
            console.error('❌ Error procesando pago para finanzas:', error);
        }
    }
};
exports.FinancialIntegrationService = FinancialIntegrationService;
exports.FinancialIntegrationService = FinancialIntegrationService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [supabase_service_1.SupabaseService,
        event_bus_service_1.EventBusService])
], FinancialIntegrationService);
//# sourceMappingURL=financial-integration.service.js.map