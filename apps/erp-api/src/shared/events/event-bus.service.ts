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
  moneda?: string;
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

// EVENTOS PARA INTEGRACIONES CRÍTICAS

export interface PlanillaCalculadaEvent {
  planillaId: string;
  periodo: string;
  totalIngresos: number;
  totalDescuentos: number;
  totalAportes: number;
  totalNeto: number;
  cantidadEmpleados: number;
  empleados: Array<{
    empleadoId: string;
    nombres: string;
    apellidos: string;
    numeroDocumento: string;
    ingresos: number;
    descuentos: number;
    aportes: number;
    neto: number;
  }>;
}

export interface PlanillaPagadaEvent {
  planillaId: string;
  periodo: string;
  totalPagado: number;
  metodoPago: 'transferencia' | 'efectivo';
  fechaPago: string;
  cantidadEmpleados: number;
  empleados?: Array<{
    empleadoId: string;
    montoPagado: number;
  }>;
}

export interface PagoFacturaEvent {
  facturaId: string;
  cpeId?: string;
  numeroFactura: string;
  clienteId: string;
  montoPagado: number;
  metodoPago: string;
  fechaPago: string;
  saldoPendiente: number;
  estadoPago: 'PARCIAL' | 'COMPLETO';
}

export interface FacturaCobradaEvent {
  facturaId: string;
  cpeId: string;
  numeroFactura: string;
  clienteId: string;
  montoTotal: number;
  montoCobrado: number;
  metodoCobro: string;
  fechaCobro: string;
}

export interface GastoRegistradoEvent {
  gastoId: string;
  concepto: string;
  categoria: string;
  monto: number;
  proveedor?: string;
  metodoPago: string;
  fecha: string;
  requiereAsiento: boolean;
}

// NUEVOS EVENTOS CRÍTICOS PARA AUTOMATIZACIÓN COMPLETA

export interface CotizacionCreadaEvent {
  cotizacionId: string;
  numero: string;
  clienteId: string;
  clienteNombre: string;
  vendedorId: string;
  total: number;
  fechaVencimiento: string;
  items: Array<{
    productoId: string;
    descripcion: string;
    cantidad: number;
    precioUnitario: number;
    total: number;
  }>;
  estado: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';
}

export interface CotizacionAprobadaEvent {
  cotizacionId: string;
  numero: string;
  clienteId: string;
  vendedorId: string;
  total: number;
  fechaAprobacion: string;
  requiereFacturacion: boolean;
  requiereGuiaRemision: boolean;
}

export interface ProductoStockBajoEvent {
  productoId: string;
  codigoProducto: string;
  nombreProducto: string;
  stockActual: number;
  stockMinimo: number;
  valorInventario: number;
  ubicacion?: string;
  proveedor?: string;
  fechaVerificacion: string;
}

export interface ComprobanteEnviadoSunatEvent {
  cpeId: string;
  tipoDocumento: string;
  numeroDocumento: string;
  estadoSunat: 'ACEPTADO' | 'OBSERVADO' | 'RECHAZADO';
  codigoRespuesta: string;
  mensajeRespuesta: string;
  fechaEnvio: string;
  requiereReporte: boolean;
}

export interface GuiaRemisionCreadaEvent {
  greId: string;
  tipoDocumento: string;
  serie: string;
  numero: number;
  transportistaId: string;
  vehiculoId: string;
  ruta: string;
  peso: number;
  cpeRelacionado?: string;
  ventaRelacionada?: string;
  fechaTraslado: string;
}

export interface GuiaRemisionEntregadaEvent {
  greId: string;
  numeroGuia: string;
  transportistaId: string;
  fechaEntrega: string;
  clienteId: string;
  estadoEntrega: 'ENTREGADO' | 'PARCIAL' | 'RECHAZADO';
  observaciones?: string;
  requiereFacturacion: boolean;
}

export interface InventarioCiclicoEvent {
  productoId: string;
  ubicacion: string;
  stockSistema: number;
  stockFisico: number;
  diferencia: number;
  valorDiferencia: number;
  responsable: string;
  fechaConteo: string;
  requiereAjuste: boolean;
}

export interface CierreVentasDiarioEvent {
  fecha: string;
  totalVentas: number;
  cantidadVentas: number;
  ventasPorMetodoPago: Record<string, number>;
  ventasPorVendedor: Array<{
    vendedorId: string;
    vendedorNombre: string;
    cantidadVentas: number;
    montoVentas: number;
  }>;
  productosVendidos: Array<{
    productoId: string;
    cantidad: number;
    montoVendido: number;
  }>;
  requiereReporteSire: boolean;
}

export interface VencimientoPagoEvent {
  facturaId: string;
  clienteId: string;
  numeroFactura: string;
  montoVencido: number;
  diasVencido: number;
  fechaVencimiento: string;
  estado: 'VENCIDO' | 'POR_VENCER';
  requiereGestion: boolean;
}

export interface EmpleadoAsistenciaEvent {
  empleadoId: string;
  fecha: string;
  horaEntrada?: string;
  horaSalida?: string;
  horasExtras: number;
  tipoTurno: string;
  estado: 'PRESENTE' | 'AUSENTE' | 'TARDANZA' | 'JUSTIFICADO';
  requierePlanilla: boolean;
}

export interface ReporteSireGeneradoEvent {
  reporteId: string;
  periodo: string;
  tipoReporte: 'VENTAS' | 'COMPRAS' | 'INVENTARIO';
  cantidadRegistros: number;
  fechaGeneracion: string;
  requiereEnvioSunat: boolean;
  archivoGenerado: string;
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
    this.eventEmitter.setMaxListeners(200); // Aumentamos el límite para más listeners
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

  // ========== EMISORES DE EVENTOS ==========

  // Eventos de ventas y facturación
  emitVentaProcessed(data: VentaProcessedEvent) {
    this.emit('venta.procesada', data, 'pos');
  }

  emitComprobanteCreadoEvent(data: ComprobanteCreadoEvent) {
    this.emit('comprobante.creado', data, 'cpe');
  }

  emitComprobanteEnviadoSunat(data: ComprobanteEnviadoSunatEvent) {
    this.emit('comprobante.enviado.sunat', data, 'cpe');
  }

  emitCierreVentasDiario(data: CierreVentasDiarioEvent) {
    this.emit('ventas.cierre.diario', data, 'pos');
  }

  // Eventos de inventario
  emitMovimientoStock(data: MovimientoStockEvent) {
    this.emit('stock.movimiento', data, 'inventario');
  }

  emitProductoStockBajo(data: ProductoStockBajoEvent) {
    this.emit('producto.stock.bajo', data, 'inventario');
  }

  emitInventarioCiclico(data: InventarioCiclicoEvent) {
    this.emit('inventario.ciclico', data, 'inventario');
  }

  // Eventos de compras
  emitCompraEntregada(data: CompraEntregadaEvent) {
    this.emit('compra.entregada', data, 'compras');
  }

  // Eventos de cotizaciones
  emitCotizacionCreada(data: CotizacionCreadaEvent) {
    this.emit('cotizacion.creada', data, 'cotizaciones');
  }

  emitCotizacionAprobada(data: CotizacionAprobadaEvent) {
    this.emit('cotizacion.aprobada', data, 'cotizaciones');
  }

  // Eventos de GRE (Guías de Remisión)
  emitGuiaRemisionCreada(data: GuiaRemisionCreadaEvent) {
    this.emit('gre.creada', data, 'gre');
  }

  emitGuiaRemisionEntregada(data: GuiaRemisionEntregadaEvent) {
    this.emit('gre.entregada', data, 'gre');
  }

  // Eventos de RRHH
  emitPlanillaCalculada(data: PlanillaCalculadaEvent) {
    this.emit('planilla.calculada', data, 'rrhh');
  }

  emitPlanillaPagada(data: PlanillaPagadaEvent) {
    this.emit('planilla.pagada', data, 'rrhh');
  }

  emitEmpleadoAsistencia(data: EmpleadoAsistenciaEvent) {
    this.emit('empleado.asistencia', data, 'rrhh');
  }

  // Eventos financieros
  emitPagoFactura(data: PagoFacturaEvent) {
    this.emit('factura.pago', data, 'finanzas');
  }

  emitFacturaCobrada(data: FacturaCobradaEvent) {
    this.emit('factura.cobrada', data, 'finanzas');
  }

  emitVencimientoPago(data: VencimientoPagoEvent) {
    this.emit('pago.vencimiento', data, 'finanzas');
  }

  // Eventos de gastos
  emitGastoRegistrado(data: GastoRegistradoEvent) {
    this.emit('gasto.registrado', data, 'finanzas');
  }

  // Eventos de reportes SIRE
  emitReporteSireGenerado(data: ReporteSireGeneradoEvent) {
    this.emit('sire.reporte.generado', data, 'sire');
  }

  // Eventos del dashboard
  emitDashboardMetricsUpdated(data: DashboardMetricsUpdatedEvent) {
    this.emit('dashboard.metrics.updated', data, 'dashboard');
  }

  // ========== LISTENERS TIPADOS ==========

  // Ventas y facturación
  onVentaProcessed(listener: (event: ERPEvent) => void) {
    this.on('venta.procesada', listener);
  }

  onComprobanteCreadoEvent(listener: (event: ERPEvent) => void) {
    this.on('comprobante.creado', listener);
  }

  onComprobanteEnviadoSunat(listener: (event: ERPEvent) => void) {
    this.on('comprobante.enviado.sunat', listener);
  }

  onCierreVentasDiario(listener: (event: ERPEvent) => void) {
    this.on('ventas.cierre.diario', listener);
  }

  // Inventario
  onMovimientoStock(listener: (event: ERPEvent) => void) {
    this.on('stock.movimiento', listener);
  }

  onProductoStockBajo(listener: (event: ERPEvent) => void) {
    this.on('producto.stock.bajo', listener);
  }

  onInventarioCiclico(listener: (event: ERPEvent) => void) {
    this.on('inventario.ciclico', listener);
  }

  // Compras
  onCompraEntregada(listener: (event: ERPEvent) => void) {
    this.on('compra.entregada', listener);
  }

  // Cotizaciones
  onCotizacionCreada(listener: (event: ERPEvent) => void) {
    this.on('cotizacion.creada', listener);
  }

  onCotizacionAprobada(listener: (event: ERPEvent) => void) {
    this.on('cotizacion.aprobada', listener);
  }

  // GRE
  onGuiaRemisionCreada(listener: (event: ERPEvent) => void) {
    this.on('gre.creada', listener);
  }

  onGuiaRemisionEntregada(listener: (event: ERPEvent) => void) {
    this.on('gre.entregada', listener);
  }

  // RRHH
  onPlanillaCalculada(listener: (event: ERPEvent) => void) {
    this.on('planilla.calculada', listener);
  }

  onPlanillaPagada(listener: (event: ERPEvent) => void) {
    this.on('planilla.pagada', listener);
  }

  onEmpleadoAsistencia(listener: (event: ERPEvent) => void) {
    this.on('empleado.asistencia', listener);
  }

  // Finanzas
  onPagoFactura(listener: (event: ERPEvent) => void) {
    this.on('factura.pago', listener);
  }

  onFacturaCobrada(listener: (event: ERPEvent) => void) {
    this.on('factura.cobrada', listener);
  }

  onVencimientoPago(listener: (event: ERPEvent) => void) {
    this.on('pago.vencimiento', listener);
  }

  onGastoRegistrado(listener: (event: ERPEvent) => void) {
    this.on('gasto.registrado', listener);
  }

  // SIRE
  onReporteSireGenerado(listener: (event: ERPEvent) => void) {
    this.on('sire.reporte.generado', listener);
  }

  // Dashboard
  onDashboardMetricsUpdated(listener: (event: ERPEvent) => void) {
    this.on('dashboard.metrics.updated', listener);
  }
} 