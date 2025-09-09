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
exports.EventBusService = void 0;
const common_1 = require("@nestjs/common");
const events_1 = require("events");
let EventBusService = class EventBusService {
    constructor() {
        this.eventEmitter = new events_1.EventEmitter();
        this.eventEmitter.setMaxListeners(200);
    }
    emit(eventType, data, module = 'unknown') {
        const event = {
            type: eventType,
            data,
            timestamp: new Date(),
            module
        };
        console.log(`🎯 [EventBus] Emitiendo evento: ${eventType} desde ${module}`);
        console.log(`🎯 [EventBus] Datos del evento:`, data);
        console.log(`🎯 [EventBus] Listeners registrados para ${eventType}:`, this.eventEmitter.listenerCount(eventType));
        this.eventEmitter.emit(eventType, event);
        console.log(`✅ [EventBus] Evento ${eventType} emitido exitosamente`);
    }
    on(eventType, listener) {
        console.log(`👂 [EventBus] Registrando listener para: ${eventType}`);
        this.eventEmitter.on(eventType, listener);
    }
    emitVentaProcessed(data) {
        this.emit('venta.procesada', data, 'pos');
    }
    emitComprobanteCreadoEvent(data) {
        this.emit('comprobante.creado', data, 'cpe');
    }
    emitComprobanteEnviadoSunat(data) {
        this.emit('comprobante.enviado.sunat', data, 'cpe');
    }
    emitCierreVentasDiario(data) {
        this.emit('ventas.cierre.diario', data, 'pos');
    }
    emitMovimientoStock(data) {
        this.emit('stock.movimiento', data, 'inventario');
    }
    emitProductoStockBajo(data) {
        this.emit('producto.stock.bajo', data, 'inventario');
    }
    emitInventarioCiclico(data) {
        this.emit('inventario.ciclico', data, 'inventario');
    }
    emitCompraEntregada(data) {
        this.emit('compra.entregada', data, 'compras');
    }
    emitCotizacionCreada(data) {
        this.emit('cotizacion.creada', data, 'cotizaciones');
    }
    emitCotizacionAprobada(data) {
        this.emit('cotizacion.aprobada', data, 'cotizaciones');
    }
    emitGuiaRemisionCreada(data) {
        this.emit('gre.creada', data, 'gre');
    }
    emitGuiaRemisionEntregada(data) {
        this.emit('gre.entregada', data, 'gre');
    }
    emitPlanillaCalculada(data) {
        this.emit('planilla.calculada', data, 'rrhh');
    }
    emitPlanillaPagada(data) {
        this.emit('planilla.pagada', data, 'rrhh');
    }
    emitEmpleadoAsistencia(data) {
        this.emit('empleado.asistencia', data, 'rrhh');
    }
    emitPagoFactura(data) {
        this.emit('factura.pago', data, 'finanzas');
    }
    emitFacturaCobrada(data) {
        this.emit('factura.cobrada', data, 'finanzas');
    }
    emitVencimientoPago(data) {
        this.emit('pago.vencimiento', data, 'finanzas');
    }
    emitGastoRegistrado(data) {
        this.emit('gasto.registrado', data, 'finanzas');
    }
    emitReporteSireGenerado(data) {
        this.emit('sire.reporte.generado', data, 'sire');
    }
    emitDashboardMetricsUpdated(data) {
        this.emit('dashboard.metrics.updated', data, 'dashboard');
    }
    onVentaProcessed(listener) {
        this.on('venta.procesada', listener);
    }
    onComprobanteCreadoEvent(listener) {
        this.on('comprobante.creado', listener);
    }
    onComprobanteEnviadoSunat(listener) {
        this.on('comprobante.enviado.sunat', listener);
    }
    onCierreVentasDiario(listener) {
        this.on('ventas.cierre.diario', listener);
    }
    onMovimientoStock(listener) {
        this.on('stock.movimiento', listener);
    }
    onProductoStockBajo(listener) {
        this.on('producto.stock.bajo', listener);
    }
    onInventarioCiclico(listener) {
        this.on('inventario.ciclico', listener);
    }
    onCompraEntregada(listener) {
        this.on('compra.entregada', listener);
    }
    onCotizacionCreada(listener) {
        this.on('cotizacion.creada', listener);
    }
    onCotizacionAprobada(listener) {
        this.on('cotizacion.aprobada', listener);
    }
    onGuiaRemisionCreada(listener) {
        this.on('gre.creada', listener);
    }
    onGuiaRemisionEntregada(listener) {
        this.on('gre.entregada', listener);
    }
    onPlanillaCalculada(listener) {
        this.on('planilla.calculada', listener);
    }
    onPlanillaPagada(listener) {
        this.on('planilla.pagada', listener);
    }
    onEmpleadoAsistencia(listener) {
        this.on('empleado.asistencia', listener);
    }
    onPagoFactura(listener) {
        this.on('factura.pago', listener);
    }
    onFacturaCobrada(listener) {
        this.on('factura.cobrada', listener);
    }
    onVencimientoPago(listener) {
        this.on('pago.vencimiento', listener);
    }
    onGastoRegistrado(listener) {
        this.on('gasto.registrado', listener);
    }
    onReporteSireGenerado(listener) {
        this.on('sire.reporte.generado', listener);
    }
    onDashboardMetricsUpdated(listener) {
        this.on('dashboard.metrics.updated', listener);
    }
};
exports.EventBusService = EventBusService;
exports.EventBusService = EventBusService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], EventBusService);
