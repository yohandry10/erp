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
        this.eventBus.onComprobanteCreadoEvent(async (event) => {
            console.log('💰 [Finanzas] Procesando comprobante para cuentas por cobrar...');
            await this.procesarComprobanteParaFinanzas(event.data);
        });
        this.eventBus.onMovimientoStock(async (event) => {
            console.log('💰 [Finanzas] Actualizando KPIs por movimiento de inventario...');
            await this.invalidarCacheKPIs();
        });
        this.eventBus.onCompraEntregada(async (event) => {
            console.log('💰 [Finanzas] Procesando compra entregada para KPIs...');
            await this.procesarCompraParaFinanzas(event.data);
        });
        this.eventBus.onPlanillaCalculada(async (event) => {
            console.log('💰 [Finanzas] Procesando planilla calculada para KPIs...');
            await this.procesarPlanillaParaFinanzas(event.data);
        });
        this.eventBus.onPlanillaPagada(async (event) => {
            console.log('💰 [Finanzas] Procesando pago de planilla para flujo de efectivo...');
            await this.procesarPagoPlanillaParaFinanzas(event.data);
        });
        this.eventBus.onPagoFactura(async (event) => {
            console.log('💰 [Finanzas] Procesando pago de factura para flujo de efectivo...');
            await this.procesarPagoFacturaParaFinanzas(event.data);
        });
        this.eventBus.onGastoRegistrado(async (event) => {
            console.log('💰 [Finanzas] Procesando gasto registrado para KPIs...');
            await this.procesarGastoParaFinanzas(event.data);
        });
    }
    async procesarVentaParaFinanzas(venta) {
        try {
            await this.actualizarEfectivoDisponible(venta.total, venta.metodoPago);
            await this.invalidarCacheKPIs();
            await this.verificarAlertas();
            console.log(`✅ Finanzas actualizadas para venta ${venta.numeroTicket}`);
        }
        catch (error) {
            console.error('❌ Error procesando venta para finanzas:', error);
        }
    }
    async procesarComprobanteParaFinanzas(comprobante) {
        try {
            if (comprobante.esCredito && comprobante.tipoDocumento === '01') {
                await this.crearCuentaPorCobrar(comprobante);
            }
            console.log(`✅ Comprobante ${comprobante.serie}-${comprobante.numero} procesado para finanzas`);
        }
        catch (error) {
            console.error('❌ Error procesando comprobante para finanzas:', error);
        }
    }
    async procesarCompraParaFinanzas(compra) {
        try {
            console.log(`💰 Procesando compra ${compra.numeroOrden} para finanzas`);
            await this.crearCuentaPorPagar(compra);
            await this.invalidarCacheKPIs();
            console.log(`✅ Compra ${compra.numeroOrden} procesada para finanzas`);
        }
        catch (error) {
            console.error('❌ Error procesando compra para finanzas:', error);
        }
    }
    async procesarPlanillaParaFinanzas(planilla) {
        try {
            console.log(`💰 Procesando planilla ${planilla.periodo} para finanzas`);
            await this.registrarGastoPlanilla(planilla);
            await this.invalidarCacheKPIs();
            console.log(`✅ Planilla ${planilla.periodo} procesada para finanzas`);
        }
        catch (error) {
            console.error('❌ Error procesando planilla para finanzas:', error);
        }
    }
    async procesarPagoPlanillaParaFinanzas(pago) {
        try {
            console.log(`💰 Procesando pago de planilla ${pago.periodo} para finanzas`);
            await this.actualizarEfectivoDisponible(-pago.totalPagado, pago.metodoPago);
            await this.invalidarCacheKPIs();
            console.log(`✅ Pago de planilla ${pago.periodo} procesado para finanzas`);
        }
        catch (error) {
            console.error('❌ Error procesando pago de planilla para finanzas:', error);
        }
    }
    async procesarPagoFacturaParaFinanzas(pago) {
        try {
            console.log(`💰 Procesando pago de factura ${pago.numeroFactura} para finanzas`);
            await this.actualizarEfectivoDisponible(pago.montoPagado, pago.metodoPago);
            await this.actualizarCuentasPorCobrar(pago);
            await this.invalidarCacheKPIs();
            console.log(`✅ Pago de factura ${pago.numeroFactura} procesado para finanzas`);
        }
        catch (error) {
            console.error('❌ Error procesando pago de factura para finanzas:', error);
        }
    }
    async procesarGastoParaFinanzas(gasto) {
        try {
            console.log(`💰 Procesando gasto ${gasto.concepto} para finanzas`);
            await this.actualizarEfectivoDisponible(-gasto.monto, gasto.metodoPago);
            await this.invalidarCacheKPIs();
            console.log(`✅ Gasto ${gasto.concepto} procesado para finanzas`);
        }
        catch (error) {
            console.error('❌ Error procesando gasto para finanzas:', error);
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
        try {
            const fechaInicio = new Date();
            fechaInicio.setDate(fechaInicio.getDate() - 30);
            const { data: ventas } = await this.supabase.getClient()
                .from('ventas_pos')
                .select('total, metodo_pago')
                .eq('metodo_pago', 'EFECTIVO')
                .gte('fecha', fechaInicio.toISOString());
            return ventas?.reduce((sum, venta) => sum + parseFloat(venta.total || 0), 0) || 0;
        }
        catch (error) {
            console.error('❌ Error calculando efectivo:', error);
            return 0;
        }
    }
    async calcularVentas30Dias() {
        try {
            const fechaInicio = new Date();
            fechaInicio.setDate(fechaInicio.getDate() - 30);
            const { data: ventas } = await this.supabase.getClient()
                .from('ventas_pos')
                .select('total')
                .gte('fecha', fechaInicio.toISOString());
            return ventas?.reduce((sum, venta) => sum + parseFloat(venta.total || 0), 0) || 0;
        }
        catch (error) {
            console.error('❌ Error calculando ventas 30 días:', error);
            return 0;
        }
    }
    async calcularGastos30Dias() {
        try {
            const fechaInicio = new Date();
            fechaInicio.setDate(fechaInicio.getDate() - 30);
            const { data: gastos } = await this.supabase.getClient()
                .from('detalle_asientos')
                .select('debe')
                .gte('created_at', fechaInicio.toISOString());
            return gastos?.reduce((sum, gasto) => sum + parseFloat(gasto.debe || 0), 0) || 0;
        }
        catch (error) {
            console.error('❌ Error calculando gastos 30 días:', error);
            return 0;
        }
    }
    async calcularCuentasPorCobrar() {
        try {
            const { data: cuentas } = await this.supabase.getClient()
                .from('cuentas_por_cobrar')
                .select('saldo_pendiente')
                .neq('estado', 'COBRADA');
            return cuentas?.reduce((sum, cuenta) => sum + parseFloat(cuenta.saldo_pendiente || 0), 0) || 0;
        }
        catch (error) {
            console.error('❌ Error calculando cuentas por cobrar:', error);
            return 0;
        }
    }
    async calcularCuentasPorPagar() {
        try {
            const { data: cuentas } = await this.supabase.getClient()
                .from('cuentas_por_pagar')
                .select('saldo_pendiente')
                .neq('estado', 'PAGADA');
            return cuentas?.reduce((sum, cuenta) => sum + parseFloat(cuenta.saldo_pendiente || 0), 0) || 0;
        }
        catch (error) {
            console.error('❌ Error calculando cuentas por pagar:', error);
            return 0;
        }
    }
    async calcularValorInventario() {
        try {
            const { data: productos } = await this.supabase.getClient()
                .from('productos')
                .select('precio, stock');
            return productos?.reduce((sum, producto) => {
                const precio = parseFloat(producto.precio || 0);
                const stock = parseFloat(producto.stock || 0);
                return sum + (precio * stock);
            }, 0) || 0;
        }
        catch (error) {
            console.error('❌ Error calculando valor inventario:', error);
            return 0;
        }
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
            fechaActual.setDate(fechaActual.getDate() - 30);
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
            console.error('❌ Error evaluando crecimiento:', error);
            return 'ESTABLE';
        }
    }
    async calcularVentasPeriodo(fechaInicio, fechaFin) {
        const { data: ventas } = await this.supabase.getClient()
            .from('ventas_pos')
            .select('total')
            .gte('fecha', fechaInicio.toISOString())
            .lte('fecha', fechaFin.toISOString());
        return ventas?.reduce((sum, venta) => sum + parseFloat(venta.total || 0), 0) || 0;
    }
    async crearCuentaPorCobrar(comprobante) {
        try {
            const fechaVencimiento = new Date();
            fechaVencimiento.setDate(fechaVencimiento.getDate() + 30);
            await this.supabase.getClient()
                .from('cuentas_por_cobrar')
                .insert({
                cpe_id: comprobante.cpeId,
                cliente_id: comprobante.clienteId,
                numero_documento: `${comprobante.serie}-${comprobante.numero}`,
                fecha_emision: new Date().toISOString(),
                fecha_vencimiento: fechaVencimiento.toISOString(),
                monto_original: comprobante.total,
                saldo_pendiente: comprobante.total,
                estado: 'VIGENTE',
                created_at: new Date().toISOString()
            });
            console.log(`✅ Cuenta por cobrar creada para ${comprobante.serie}-${comprobante.numero}`);
        }
        catch (error) {
            console.error('❌ Error creando cuenta por cobrar:', error);
        }
    }
    async crearCuentaPorPagar(compra) {
        try {
            const fechaVencimiento = new Date();
            fechaVencimiento.setDate(fechaVencimiento.getDate() + 30);
            await this.supabase.getClient()
                .from('cuentas_por_pagar')
                .insert({
                orden_id: compra.ordenId,
                proveedor_id: compra.proveedorId,
                numero_documento: compra.numeroOrden,
                fecha_emision: new Date().toISOString(),
                fecha_vencimiento: fechaVencimiento.toISOString(),
                monto_original: compra.total,
                saldo_pendiente: compra.total,
                estado: 'VIGENTE',
                created_at: new Date().toISOString()
            });
            console.log(`✅ Cuenta por pagar creada para compra ${compra.numeroOrden}`);
        }
        catch (error) {
            console.error('❌ Error creando cuenta por pagar:', error);
        }
    }
    async actualizarEfectivoDisponible(monto, metodoPago) {
        if (metodoPago === 'EFECTIVO') {
            console.log(`💰 Efectivo incrementado en ${monto}`);
        }
    }
    async invalidarCacheKPIs() {
        this.kpisCache = null;
        this.lastKPIUpdate = null;
        console.log('🔄 Cache de KPIs invalidado');
    }
    async verificarAlertas() {
        const alertas = [];
        const kpis = await this.getKPIsFinancieros();
        if (kpis.liquidez === 'CRITICA') {
            alertas.push({
                tipo: 'CRITICA',
                titulo: 'Liquidez Crítica',
                mensaje: 'El efectivo disponible es insuficiente para cubrir las obligaciones',
                accion: 'Gestionar cobranzas urgentes',
                valor: kpis.efectivoDisponible
            });
        }
        if (kpis.rentabilidad === 'MALA' || kpis.rentabilidad === 'CRITICA') {
            alertas.push({
                tipo: 'ADVERTENCIA',
                titulo: 'Rentabilidad Baja',
                mensaje: 'Los márgenes de ganancia están por debajo del objetivo',
                accion: 'Revisar precios y costos',
                valor: kpis.margenBruto
            });
        }
        if (kpis.cuentasPorCobrar > kpis.ventasUltimos30dias * 0.5) {
            alertas.push({
                tipo: 'ADVERTENCIA',
                titulo: 'Cuentas por Cobrar Elevadas',
                mensaje: 'Las cuentas por cobrar superan el 50% de las ventas mensuales',
                accion: 'Intensificar gestión de cobranza',
                valor: kpis.cuentasPorCobrar
            });
        }
        return alertas;
    }
    async getCuentasPorCobrarDetalladas() {
        try {
            const { data: cuentas } = await this.supabase.getClient()
                .from('cuentas_por_cobrar')
                .select(`
          *,
          cpe (serie, numero, razon_social_receptor)
        `)
                .neq('estado', 'COBRADA')
                .order('fecha_vencimiento');
            return cuentas?.map(cuenta => ({
                id: cuenta.id,
                cpeId: cuenta.cpe_id,
                clienteId: cuenta.cliente_id,
                clienteNombre: cuenta.cpe?.razon_social_receptor || 'Cliente',
                numeroDocumento: cuenta.numero_documento,
                fechaEmision: cuenta.fecha_emision,
                fechaVencimiento: cuenta.fecha_vencimiento,
                montoOriginal: parseFloat(cuenta.monto_original),
                saldoPendiente: parseFloat(cuenta.saldo_pendiente),
                diasVencidos: this.calcularDiasVencidos(cuenta.fecha_vencimiento),
                estado: cuenta.estado
            })) || [];
        }
        catch (error) {
            console.error('❌ Error obteniendo cuentas por cobrar:', error);
            return [];
        }
    }
    calcularDiasVencidos(fechaVencimiento) {
        const hoy = new Date();
        const vencimiento = new Date(fechaVencimiento);
        const diffTime = hoy.getTime() - vencimiento.getTime();
        return Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    }
    async getAlertas() {
        return await this.verificarAlertas();
    }
    async registrarGastoPlanilla(planilla) {
        try {
            await this.supabase.getClient()
                .from('gastos_automaticos')
                .insert({
                concepto: `Planilla ${planilla.periodo}`,
                categoria: 'RRHH',
                monto: planilla.totalNeto,
                fecha: new Date().toISOString(),
                origen: 'PLANILLA',
                referencia: planilla.planillaId,
                detalle: `${planilla.cantidadEmpleados} empleados - Total neto: S/ ${planilla.totalNeto}`
            });
        }
        catch (error) {
            console.error('❌ Error registrando gasto de planilla:', error);
        }
    }
    async actualizarCuentasPorCobrar(pago) {
        try {
            await this.supabase.getClient()
                .from('cuentas_por_cobrar')
                .update({
                saldo_pendiente: pago.saldoPendiente,
                estado: pago.estadoPago === 'COMPLETO' ? 'COBRADA' : 'PARCIAL',
                ultimo_pago: new Date().toISOString(),
                monto_pagado: pago.montoPagado
            })
                .eq('factura_id', pago.facturaId);
        }
        catch (error) {
            console.error('❌ Error actualizando cuentas por cobrar:', error);
        }
    }
};
exports.FinancialIntegrationService = FinancialIntegrationService;
exports.FinancialIntegrationService = FinancialIntegrationService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [supabase_service_1.SupabaseService,
        event_bus_service_1.EventBusService])
], FinancialIntegrationService);
