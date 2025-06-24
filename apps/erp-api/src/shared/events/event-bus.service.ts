import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';

export interface ERPEvent {
  type: string;
  data: any;
  timestamp: Date;
  module: string;
}

export interface VentaProcessedEvent {
  ventaId: string;
  numeroTicket: string;
  clienteId: string;
  clienteNombre: string;
  metodoPago: string;
  subtotal: number;
  impuestos: number;
  total: number;
  items: Array<{
    productoId: string;
    cantidad: number;
    precio: number;
    total: number;
  }>;
  cpeId?: string;
}

export interface ComprobanteCreadoEvent {
  cpeId: string;
  tipoDocumento: string;
  serie: string;
  numero: number;
  clienteId: string;
  total: number;
  esCredito: boolean;
  ventaId?: string;
  requiereTransporte?: boolean;
}

export interface MovimientoStockEvent {
  productoId: string;
  tipoMovimiento: 'ENTRADA' | 'SALIDA' | 'AJUSTE';
  cantidad: number;
  stockAnterior: number;
  stockNuevo: number;
  motivo: string;
  valor: number;
  ventaId?: string;
}

export interface CompraEntregadaEvent {
  ordenId: string;
  numeroOrden: string;
  proveedorId: string;
  proveedorNombre: string;
  fechaEntrega: string;
  total: number;
  items: Array<{
    productoId: string;
    cantidad: number;
    precioUnitario: number;
    total: number;
  }>;
}

export interface DashboardMetricsUpdatedEvent {
  totalCpe: number;
  totalGre: number;
  totalSire: number;
  totalUsers: number;
  totalInventario: number;
  totalCompras: number;
  totalCotizaciones: number;
  ventasMes: number;
  ventasHoy: number;
  comprasMes: number;
  valorInventario: number;
  productosConStockBajo: number;
  cotizacionesPendientes: number;
  ordenesCompraPendientes: number;
  movimientosHoy: number;
  tasaConversionCotizaciones: number;
  crecimientoVentas: number;
  ultimaActualizacion: string;
}

@Injectable()
export class EventBusService {
  private eventEmitter = new EventEmitter();

  constructor() {
    this.eventEmitter.setMaxListeners(100);
  }

  // Emitir eventos
  emit(eventType: string, data: any, module: string = 'unknown') {
    const event: ERPEvent = {
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

  // Escuchar eventos
  on(eventType: string, listener: (event: ERPEvent) => void) {
    console.log(`👂 [EventBus] Registrando listener para: ${eventType}`);
    this.eventEmitter.on(eventType, listener);
  }

  // Eventos específicos del negocio
  emitVentaProcessed(data: VentaProcessedEvent) {
    this.emit('venta.procesada', data, 'pos');
  }

  emitComprobanteCreadoEvent(data: ComprobanteCreadoEvent) {
    this.emit('comprobante.creado', data, 'cpe');
  }

  emitMovimientoStock(data: MovimientoStockEvent) {
    this.emit('stock.movimiento', data, 'inventario');
  }

  emitCompraEntregada(data: CompraEntregadaEvent) {
    this.emit('compra.entregada', data, 'compras');
  }

  emitDashboardMetricsUpdated(data: DashboardMetricsUpdatedEvent) {
    this.emit('dashboard.metrics.updated', data, 'dashboard');
  }

  // Listeners tipados
  onVentaProcessed(listener: (event: ERPEvent) => void) {
    this.on('venta.procesada', listener);
  }

  onComprobanteCreadoEvent(listener: (event: ERPEvent) => void) {
    this.on('comprobante.creado', listener);
  }

  onMovimientoStock(listener: (event: ERPEvent) => void) {
    this.on('stock.movimiento', listener);
  }

  onCompraEntregada(listener: (event: ERPEvent) => void) {
    this.on('compra.entregada', listener);
  }

  onDashboardMetricsUpdated(listener: (event: ERPEvent) => void) {
    this.on('dashboard.metrics.updated', listener);
  }
} 