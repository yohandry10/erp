import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';
import { OutboxService } from '../outbox/outbox.service';

export interface ERPEvent {
  type: string;
  data: any;
  timestamp: Date;
  module: string;
}

export interface VentaProcessedEvent {
  eventId: string;
  tenantId: string;
  idempotencyKey: string;
  source: string;
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
  inventarioAplicado?: boolean;
}

export interface ComprobanteCreadoEvent {
  eventId: string;
  tenantId: string;
  idempotencyKey: string;
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
  eventId?: string;
  tenantId?: string;
  idempotencyKey?: string;
  source?: string;
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
  tenantId: string;
  eventId: string;
  idempotencyKey: string;
  ordenId: string;
  numeroOrden: string;
  proveedorId: string;
  proveedorNombre: string;
  proveedorRuc?: string | null;
  fechaEntrega: string;
  subtotal: number;
  igv: number;
  total: number;
  moneda: string;
  diasCredito?: number | null;
  condicionesPago?: string | null;
  almacenId?: string | null;
  observaciones?: string | null;
  inventarioAplicado?: boolean;
  items: Array<{
    productoId: string;
    descripcion?: string;
    cantidad: number;
    precioUnitario: number;
    total: number;
    calidad?: string;
    lote?: string | null;
    serie?: string | null;
    ubicacionId?: string | null;
    recepcionId?: string;
  }>;
  emittedAt: string;
}

export interface OrdenCompraAprobadaEvent {
  eventId: string;
  idempotencyKey: string;
  ordenId: string;
  numeroOrden: string;
  proveedorId: string;
  proveedorNombre: string;
  total: number;
  subtotal: number;
  igv: number;
  moneda: string;
  fechaOrden: string;
  fechaEntregaEsperada?: string;
  aprobadoPor: string;
  aprobadoEn: string;
  diasCredito?: number;
  items: Array<{
    productoId: string;
    descripcion: string;
    cantidad: number;
    precioUnitario: number;
    total: number;
  }>;
  tenantId: string;
  emittedAt?: string;
}

export interface RecepcionRegistradaEvent {
  tenantId: string;
  eventId: string;
  idempotencyKey: string;
  recepcionId: string;
  numeroRecepcion: string;
  ordenId: string;
  numeroOrden: string;
  proveedorId: string;
  proveedorNombre: string;
  proveedorRuc?: string | null;
  almacenId?: string | null;
  fechaRecepcion: string;
  subtotal: number;
  igv: number;
  total: number;
  subtotalParcial?: number;
  igvParcial?: number;
  totalParcial?: number;
  moneda: string;
  diasCredito?: number;
  condicionesPago?: string;
  greProveedor?: string | null;
  items: Array<{
    productoId: string;
    descripcion: string;
    cantidadRecibida: number;
    precioUnitario: number;
    total: number;
    calidad: string;
    lote?: string;
    serie?: string;
    ubicacionId?: string;
  }>;
  emittedAt: string;
}

export interface FacturaEmitidaEvent {
  eventId: string;
  tenantId: string;
  // HARDENING: permitir facturación directa sin pedido asociado.
  pedidoId?: string;
  cpeId: string;
  facturaId?: string;
  serie: string;
  numero: string;
  clienteId: string;
  subtotal: number;
  impuestos: number;
  total: number;
  moneda: string;
  fechaEmision: string;
  fechaVencimiento: string;
  idempotencyKey: string;
  source: string;
  sunatStatus?: string;
  hashFirma?: string;
  hash?: string;
  ajustes?: {
    retencion: number;
    percepcion: number;
    detraccion: number;
    anticipo: number;
  };
  costoVentas?: number;
}

export interface CuentaPorCobrarCreadaEvent {
  eventId: string;
  tenantId: string;
  idempotencyKey: string; // HARDENING: evita duplicados al reintentar creación de CxC.
  cxcId: string; // HARDENING: identificador consistente con especificación cross-service.
  cuentaId?: string;
  cpeId?: string;
  facturaId?: string;
  serie?: string;
  numero?: string;
  clienteId: string;
  saldoInicial: number;
  saldoPendiente: number;
  moneda: string;
  montoTotal?: number;
  montoPendiente?: number;
  subtotal?: number;
  impuestos?: number;
  fechaEmision: string;
  fechaVencimiento: string;
  source?: string;
  costoVentas?: number;
  ajustes?: {
    retencion: number;
    percepcion: number;
    detraccion: number;
    anticipo: number;
  };
}

export interface DocumentoGeneradoEvent {
  eventId: string;
  tenantId: string;
  pedidoId: string;
  documentoId: string;
  tipoDocumento: string;
  serie: string;
  numero: string;
  total: number;
  moneda: string;
  cpeId?: string | null;
  cxcId?: string | null;
  userId?: string | null;
}

export interface DocumentoFiscalGeneradoEvent {
  eventId: string;
  tenantId: string;
  documentoId: string;
  pedidoId?: string;
  tipoDocumento: string;
  serie: string;
  numero: string;
  subtotal: number;
  impuesto: number;
  total: number;
  moneda: string;
  fechaEmision: string;
  paisId?: number | null;
}

export interface DevolucionProveedorEmitidaEvent {
  devolucionId: string;
  numeroDevolucion: string;
  ordenId: string;
  numeroOrden?: string;
  recepcionId?: string;
  numeroRecepcion?: string;
  proveedorId: string;
  proveedorNombre: string;
  fechaDevolucion: string;
  motivo: string;
  subtotal: number;
  igv: number;
  total: number;
  moneda: string;
  idempotencyKey?: string;
  items: Array<{
    productoId: string;
    descripcion: string;
    cantidad: number;
    precioUnitario: number;
    subtotal: number;
    motivoDetalle?: string;
    lote?: string;
    serie?: string;
  }>;
  emitidoPor?: string;
  emitidoEn: string;
  tenantId: string;
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
  eventId?: string;
  tenantId: string;
  idempotencyKey?: string;
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
  eventId: string;
  tenantId: string;
  cxcId: string;
  facturaId: string;
  cpeId?: string;
  numeroFactura: string;
  clienteId: string;
  montoPagado: number;
  moneda: string;
  metodoPago: string;
  cuentaBancariaId?: string | null;
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
  eventId?: string;
  tenantId?: string;
  idempotencyKey?: string;
  source?: string;
  gastoId: string;
  concepto: string;
  descripcion: string; // Add this line
  categoria: string;
  monto: number;
  proveedor?: string;
  metodoPago: string;
  fecha: string;
  requiereAsiento: boolean;
}

export interface PagoProveedorRegistradoEvent {
  tenantId: string;
  eventId: string;
  idempotencyKey: string;
  cxpId: string;
  pagoId: string;
  proveedorId?: string;
  proveedorNombre?: string;
  numeroDocumento?: string;
  monto: number;
  moneda: string;
  fecha: string;
  metodoPago: string;
  cuentaBancariaId?: string | null;
  cuentaBancariaNombre?: string | null;
  referencia?: string | null;
  observaciones?: string | null;
  saldoAnterior: number;
  saldoNuevo: number;
  estadoAnterior: string;
  estadoNuevo: string;
  createdBy?: string | null;
  movimientoBancarioId?: string | null;
  cuentaSaldoAnterior?: number | null;
  cuentaSaldoNuevo?: number | null;
  loteId?: string | null;
  source?: string;
}

export interface FacturaProveedorRegistradaEvent {
  tenantId: string;
  eventId: string;
  idempotencyKey: string;
  facturaProvId: string;
  numeroDocumento: string;
  serie?: string | null;
  ordenId?: string | null;
  recepcionId?: string | null;
  proveedorId: string;
  subtotal: number;
  igv: number;
  total: number;
  retencion?: number | null;
  percepcion?: number | null;
  detraccion?: number | null;
  anticipo?: number | null;
  moneda: string;
  tipoCambio?: number | null;
  fechaEmision: string;
  fechaVencimiento: string;
  estadoComparacion: 'OK' | 'DESVIACION_CANTIDAD' | 'DESVIACION_PRECIO';
  discrepancias?: Array<{
    tipo: 'CANTIDAD' | 'PRECIO';
    productoId: string;
    recibido: number;
    facturado: number;
    esperado?: number;
  }>;
  emittedAt?: string;
}

// HARDENING: evento de cobro endurecido con metadatos de idempotencia e identidad contable.
export interface CobroRegistradoEvent {
  tenantId: string;
  eventId: string;
  idempotencyKey: string;
  cobroId: string;
  cxcId: string;
  clienteId: string;
  clienteNombre?: string;
  documentoId?: string | null;
  numeroDocumento?: string | null;
  monto: number;
  moneda: string;
  fecha: string;
  medio: string;
  cuentaBancariaId?: string | null;
  referencia?: string | null;
  notas?: string | null;
  saldoAnterior: number;
  saldoNuevo: number;
  estadoAnterior: string;
  estadoNuevo: string;
  source?: string;
  createdBy?: string | null;
  timestamp?: string;
}

export interface MovimientoBancarioRegistradoEvent {
  tenantId: string;
  movimientoId: string;
  cuentaBancariaId: string;
  cuentaBancariaNombre: string;
  tipo: 'ABONO' | 'CARGO';
  monto: number;
  moneda: string;
  fecha: string;
  descripcion: string;
  referencia?: string;
  metodoPago?: string;
  proveedorId?: string;
  proveedorNombre?: string;
  cxpId?: string;
  saldoAnterior: number;
  saldoNuevo: number;
  createdBy?: string;
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
  eventId: string;
  tenantId: string;
  idempotencyKey: string;
  greId: string;
  tipoDocumento: string;
  serie: string;
  numero: number;
  numeroCompleto?: string;
  transportistaId?: string;
  vehiculoId?: string;
  ruta?: string;
  peso: number;
  cpeRelacionado?: string;
  ventaRelacionada?: string;
  fechaTraslado: string;
  destinatario?: string;
  direccionDestino?: string;
  sunatStatus?: string;
  hashGre?: string;
  notasSalida?: string[];
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
  private readonly canonicalOutboxEventTypes = new Set([
    'cxc.creada',
    'cobro.registrado',
    'recepcion.registrada',
    'pago.proveedor.registrado',
    'planilla.liquidada',
    'planilla.pagada',
    'cpe.anulado',
  ]);

  constructor(private readonly outboxService?: OutboxService) {
    this.eventEmitter.setMaxListeners(200); // Aumentamos el límite para más listeners
  }

  // Emitir eventos con persistencia en outbox (Outbox Pattern)
  async emit(eventType: string, data: any, module: string = 'unknown', tenantId?: string) {
    const event: ERPEvent = {
      type: eventType,
      data,
      timestamp: new Date(),
      module
    };
    
    console.log(`🎯 [EventBus] Emitiendo evento: ${eventType} desde ${module}`);
    console.log(`🎯 [EventBus] Datos del evento:`, data);
    console.log(`🎯 [EventBus] Listeners registrados para ${eventType}:`, this.eventEmitter.listenerCount(eventType));
    
    // 🔴 CRÍTICO FIX: Persistir evento en outbox antes de emitirlo
    // Esto garantiza que el evento no se pierda si el servicio se reinicia
    if (this.outboxService && tenantId) {
      try {
        const aggregateType = data?.aggregateType || eventType.split('.')[0] || 'unknown';
        const aggregateId =
          data?.aggregateId ||
          data?.id ||
          data?.ventaId ||
          data?.cpeId ||
          data?.facturaId ||
          data?.pedidoId ||
          'unknown';

        const idempotencyKey =
          data?.idempotencyKey ||
          data?.idempotency_key ||
          data?.correlationId ||
          data?.correlation_id ||
          undefined;

        const canonicalEventId =
          this.canonicalOutboxEventTypes.has(eventType)
            ? data?.eventId || data?.event_id
            : undefined;

        await this.outboxService.persistEventStandard({
          tenantId,
          eventType,
          aggregateType,
          aggregateId,
          eventData: data,
          eventId: canonicalEventId,
          idempotencyKey,
        });
        console.log(`✅ [EventBus] Evento ${eventType} persistido en outbox`);
      } catch (error) {
        console.error(`❌ [EventBus] Error persistiendo evento en outbox:`, error);
        // Continuar con emisión aunque falle persistencia (degradación controlada)
        // El worker procesará eventos pendientes luego
      }
    }
    
    // Emitir evento en memoria (para listeners síncronos)
    this.eventEmitter.emit(eventType, event);
    
    console.log(`✅ [EventBus] Evento ${eventType} emitido exitosamente`);
  }

  /**
   * Emits an event and awaits all registered listeners to complete.
   * Used by OutboxWorker to ensure handlers finish before marking events completed.
   */
  async emitAndAwait(eventType: string, data: any, module: string = 'unknown'): Promise<void> {
    const event: ERPEvent = {
      type: eventType,
      data,
      timestamp: new Date(),
      module,
    };

    const listeners = this.eventEmitter.rawListeners(eventType);
    const promises = listeners.map((listener) => {
      try {
        const result = (listener as any)(event);
        return result instanceof Promise ? result : Promise.resolve();
      } catch (error) {
        return Promise.reject(error);
      }
    });

    await Promise.all(promises);
  }

  // Escuchar eventos
  on(eventType: string, listener: (event: ERPEvent) => void) {
    console.log(`👂 [EventBus] Registrando listener para: ${eventType}`);
    this.eventEmitter.on(eventType, listener);
  }

  // ========== EMISORES DE EVENTOS ==========

  // Eventos de ventas y facturación
  async emitVentaProcessed(data: VentaProcessedEvent) {
    if (!data?.eventId || !data?.tenantId || !data?.idempotencyKey) {
      throw new Error('VentaProcessedEvent requiere eventId, tenantId e idempotencyKey');
    }

    const payload: VentaProcessedEvent = {
      ...data,
      numeroTicket: data.numeroTicket ?? data.ventaId,
      source: data.source ?? 'ventas.desconocido',
    };

    await this.emit('venta.procesada', payload, 'ventas', data.tenantId);
  }

  async emitComprobanteCreadoEvent(data: ComprobanteCreadoEvent) {
    if (!data?.eventId || !data?.tenantId || !data?.idempotencyKey || !data?.cpeId) {
      throw new Error('ComprobanteCreadoEvent requiere eventId, tenantId, idempotencyKey y cpeId');
    }
    const payload: ComprobanteCreadoEvent = {
      ...data,
      moneda: data.moneda ?? 'PEN',
      requiereTransporte: data.requiereTransporte ?? false,
    };
    await this.emit('comprobante.creado', payload, 'cpe', data.tenantId);
  }

  // HARDENING: evento granular para pipeline de finanzas/contabilidad.
  async emitFacturaEmitidaEvent(data: FacturaEmitidaEvent) {
    if (!data?.eventId || !data?.tenantId || !data?.idempotencyKey) {
      throw new Error('FacturaEmitidaEvent requiere eventId, tenantId e idempotencyKey');
    }
    const payload: FacturaEmitidaEvent = {
      ...data,
      pedidoId: data.pedidoId ?? undefined,
      numero: data.numero != null ? String(data.numero) : '0', // HARDENING: normaliza correlativo como string.
    };
    await this.emit('factura.emitida', payload, 'ventas', data.tenantId);
  }

  // HARDENING: notifica creación automática de CxC.
  emitCuentaPorCobrarCreadaEvent(data: CuentaPorCobrarCreadaEvent) {
    const resolvedCxcId = data?.cxcId ?? data?.cuentaId;
    if (!data?.eventId || !data?.tenantId || !data?.idempotencyKey || !resolvedCxcId) {
      throw new Error('CuentaPorCobrarCreadaEvent requiere eventId, tenantId, idempotencyKey y cxcId');
    }

    const payload: CuentaPorCobrarCreadaEvent = {
      ...data,
      cxcId: resolvedCxcId,
      cuentaId: data.cuentaId ?? resolvedCxcId,
      facturaId: data.facturaId ?? data.cpeId,
      cpeId: data.cpeId ?? data.facturaId,
      saldoInicial: data.saldoInicial ?? data.montoTotal ?? data.montoPendiente ?? 0, // HARDENING: normalizar campos legacy.
      saldoPendiente: data.saldoPendiente ?? data.montoPendiente ?? data.montoTotal ?? 0,
      montoTotal: data.montoTotal ?? data.saldoInicial ?? data.saldoPendiente,
      montoPendiente: data.montoPendiente ?? data.saldoPendiente ?? data.montoTotal,
    };

    this.emit('cxc.creada', payload, 'finanzas', data.tenantId);
  }

  async emitDocumentoGenerado(data: DocumentoGeneradoEvent) {
    if (!data?.eventId || !data?.tenantId || !data?.documentoId) {
      throw new Error('DocumentoGeneradoEvent requiere eventId, tenantId y documentoId');
    }

    await this.emit('documento.generado', data, 'ventas', data.tenantId);
  }

  async emitDocumentoFiscalGenerado(data: DocumentoFiscalGeneradoEvent) {
    if (!data?.eventId || !data?.tenantId || !data?.documentoId) {
      throw new Error('DocumentoFiscalGeneradoEvent requiere eventId, tenantId y documentoId');
    }

    await this.emit('documento.fiscal.generado', data, 'contabilidad', data.tenantId);
  }

  emitComprobanteEnviadoSunat(data: ComprobanteEnviadoSunatEvent) {
    this.emit('comprobante.enviado.sunat', data, 'cpe');
  }

  emitCierreVentasDiario(data: CierreVentasDiarioEvent) {
    this.emit('ventas.cierre.diario', data, 'pos');
  }

  // Eventos de inventario
  emitMovimientoStock(data: MovimientoStockEvent, tenantId?: string) {
    const resolvedTenant = tenantId ?? (data as any)?.tenantId ?? (data as any)?.tenant_id ?? null;
    const payload: MovimientoStockEvent = {
      ...data,
      tenantId: resolvedTenant ?? data?.tenantId,
    };
    this.emit('stock.movimiento', payload, 'inventario', resolvedTenant ?? undefined);
  }

  async emitProductoStockBajo(data: ProductoStockBajoEvent, tenantId?: string) {
    await this.emit('producto.stock.bajo', data, 'inventario', tenantId);
  }

  emitInventarioCiclico(data: InventarioCiclicoEvent) {
    this.emit('inventario.ciclico', data, 'inventario');
  }

  // Eventos de compras
  emitCompraEntregada(data: CompraEntregadaEvent) {
    if (!data?.tenantId || !data?.ordenId || !data?.eventId || !data?.idempotencyKey) {
      throw new Error('CompraEntregadaEvent requiere tenantId, ordenId, eventId e idempotencyKey');
    }
    const payload: CompraEntregadaEvent = {
      ...data,
      emittedAt: data.emittedAt ?? new Date().toISOString(), // HARDENING: garantizamos timestamp del evento.
    };
    this.emit('compra.entregada', payload, 'compras', data.tenantId);
  }

  emitOrdenCompraAprobada(data: OrdenCompraAprobadaEvent) {
    if (!data?.tenantId || !data?.eventId || !data?.idempotencyKey || !data?.ordenId) {
      throw new Error('OrdenCompraAprobadaEvent requiere tenantId, eventId, idempotencyKey y ordenId');
    }
    const payload: OrdenCompraAprobadaEvent = {
      ...data,
      emittedAt: data.emittedAt ?? new Date().toISOString(),
    };
    this.emit('orden.compra.aprobada', payload, 'compras', data.tenantId);
  }

  emitRecepcionRegistrada(data: RecepcionRegistradaEvent) {
    if (!data?.tenantId || !data?.eventId || !data?.idempotencyKey || !data?.recepcionId) {
      throw new Error('RecepcionRegistradaEvent requiere tenantId, eventId, idempotencyKey y recepcionId');
    }
    const payload: RecepcionRegistradaEvent = {
      ...data,
      emittedAt: data.emittedAt ?? new Date().toISOString(),
    };
    this.emit('recepcion.registrada', payload, 'compras', data.tenantId);
  }

  emitDevolucionProveedorEmitida(data: DevolucionProveedorEmitidaEvent) {
    this.emit('devolucion.proveedor.emitida', data, 'compras');
  }

  emitFacturaProveedorRegistrada(data: FacturaProveedorRegistradaEvent) {
    if (!data?.tenantId || !data?.eventId || !data?.idempotencyKey || !data?.facturaProvId) {
      throw new Error('FacturaProveedorRegistradaEvent requiere tenantId, eventId, idempotencyKey y facturaProvId');
    }
    const payload: FacturaProveedorRegistradaEvent = {
      ...data,
      emittedAt: data.emittedAt ?? new Date().toISOString(),
    };
    this.emit('factura.proveedor.registrada', payload, 'compras', data.tenantId);
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
    if (!data?.eventId || !data?.tenantId || !data?.idempotencyKey || !data?.greId) {
      throw new Error('GuiaRemisionCreadaEvent requiere eventId, tenantId, idempotencyKey y greId');
    }

    const payload: GuiaRemisionCreadaEvent = {
      ...data,
      numero: Number(data.numero ?? 0),
      transportistaId: data.transportistaId ?? undefined,
      vehiculoId: data.vehiculoId ?? undefined,
      ruta: data.ruta ?? undefined,
      notasSalida: data.notasSalida ?? [],
    };

    this.emit('gre.creada', payload, 'gre', data.tenantId);
  }

  emitGuiaRemisionEntregada(data: GuiaRemisionEntregadaEvent) {
    this.emit('gre.entregada', data, 'gre');
  }

  // Eventos de RRHH
  emitPlanillaCalculada(data: PlanillaCalculadaEvent) {
    this.emit('planilla.calculada', data, 'rrhh');
  }

  emitPlanillaPagada(data: PlanillaPagadaEvent) {
    this.emit('planilla.pagada', data, 'rrhh', data.tenantId);
  }

  emitEmpleadoAsistencia(data: EmpleadoAsistenciaEvent) {
    this.emit('empleado.asistencia', data, 'rrhh');
  }

  // Eventos financieros
  emitPagoFactura(data: PagoFacturaEvent) {
    if (!data?.eventId || !data?.tenantId || !data?.cxcId) {
      throw new Error('PagoFacturaEvent requiere eventId, tenantId y cxcId');
    }
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

  // Eventos de pagos a proveedores
  emitPagoProveedorRegistrado(data: PagoProveedorRegistradoEvent) {
    if (!data?.tenantId || !data?.eventId || !data?.idempotencyKey || !data?.pagoId) {
      throw new Error('PagoProveedorRegistradoEvent requiere tenantId, eventId, idempotencyKey y pagoId');
    }
    this.emit('pago.proveedor.registrado', data, 'finanzas', data.tenantId);
  }

  // Eventos de cobros a clientes
  emitCobroRegistrado(data: CobroRegistradoEvent) {
    // HARDENING: validar metadatos críticos antes de emitir el evento de cobro.
    if (!data?.eventId || !data?.tenantId || !data?.idempotencyKey || !data?.cobroId) {
      throw new Error('CobroRegistradoEvent requiere tenantId, eventId, idempotencyKey y cobroId');
    }
    this.emit('cobro.registrado', data, 'finanzas', data.tenantId);
  }

  // Eventos de movimientos bancarios
  emitMovimientoBancarioRegistrado(data: MovimientoBancarioRegistradoEvent) {
    this.emit('movimiento.bancario.registrado', data, 'finanzas');
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
  // Línea 462 - Eliminar el duplicado
  // Remover esta línea duplicada:
  // onVentaProcessed(listener: (event: ERPEvent) => void) {
  //   this.on('venta.procesada', listener);
  // }

  onComprobanteCreadoEvent(listener: (event: ERPEvent) => void) {
    this.on('comprobante.creado', listener);
  }

  onFacturaEmitidaEvent(listener: (event: ERPEvent) => void) {
    this.on('factura.emitida', listener);
  }

  onDocumentoFiscalGenerado(listener: (event: ERPEvent) => void) {
    this.on('documento.fiscal.generado', listener);
  }

  onCuentaPorCobrarCreadaEvent(listener: (event: ERPEvent) => void) {
    this.on('cxc.creada', listener);
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
  onVentaProcessed(listener: (event: ERPEvent) => void) {
    this.on('venta.procesada', listener);
  }

  onCompraEntregada(listener: (event: ERPEvent) => void) {
    this.on('compra.entregada', listener);
  }

  onOrdenCompraAprobada(listener: (event: ERPEvent) => void) {
    this.on('orden.compra.aprobada', listener);
  }

  onRecepcionRegistrada(listener: (event: ERPEvent) => void) {
    this.on('recepcion.registrada', listener);
  }

  onDevolucionProveedorEmitida(listener: (event: ERPEvent) => void) {
    this.on('devolucion.proveedor.emitida', listener);
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

  onPagoProveedorRegistrado(listener: (event: ERPEvent) => void) {
    this.on('pago.proveedor.registrado', listener);
  }

  onMovimientoBancarioRegistrado(listener: (event: ERPEvent) => void) {
    this.on('movimiento.bancario.registrado', listener);
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
