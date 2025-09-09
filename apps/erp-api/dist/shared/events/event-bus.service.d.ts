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
    descripcion: string;
    categoria: string;
    monto: number;
    proveedor?: string;
    metodoPago: string;
    fecha: string;
    requiereAsiento: boolean;
}
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
export declare class EventBusService {
    private eventEmitter;
    constructor();
    emit(eventType: string, data: any, module?: string): void;
    on(eventType: string, listener: (event: ERPEvent) => void): void;
    emitVentaProcessed(data: VentaProcessedEvent): void;
    emitComprobanteCreadoEvent(data: ComprobanteCreadoEvent): void;
    emitComprobanteEnviadoSunat(data: ComprobanteEnviadoSunatEvent): void;
    emitCierreVentasDiario(data: CierreVentasDiarioEvent): void;
    emitMovimientoStock(data: MovimientoStockEvent): void;
    emitProductoStockBajo(data: ProductoStockBajoEvent): void;
    emitInventarioCiclico(data: InventarioCiclicoEvent): void;
    emitCompraEntregada(data: CompraEntregadaEvent): void;
    emitCotizacionCreada(data: CotizacionCreadaEvent): void;
    emitCotizacionAprobada(data: CotizacionAprobadaEvent): void;
    emitGuiaRemisionCreada(data: GuiaRemisionCreadaEvent): void;
    emitGuiaRemisionEntregada(data: GuiaRemisionEntregadaEvent): void;
    emitPlanillaCalculada(data: PlanillaCalculadaEvent): void;
    emitPlanillaPagada(data: PlanillaPagadaEvent): void;
    emitEmpleadoAsistencia(data: EmpleadoAsistenciaEvent): void;
    emitPagoFactura(data: PagoFacturaEvent): void;
    emitFacturaCobrada(data: FacturaCobradaEvent): void;
    emitVencimientoPago(data: VencimientoPagoEvent): void;
    emitGastoRegistrado(data: GastoRegistradoEvent): void;
    emitReporteSireGenerado(data: ReporteSireGeneradoEvent): void;
    emitDashboardMetricsUpdated(data: DashboardMetricsUpdatedEvent): void;
    onComprobanteCreadoEvent(listener: (event: ERPEvent) => void): void;
    onComprobanteEnviadoSunat(listener: (event: ERPEvent) => void): void;
    onCierreVentasDiario(listener: (event: ERPEvent) => void): void;
    onMovimientoStock(listener: (event: ERPEvent) => void): void;
    onProductoStockBajo(listener: (event: ERPEvent) => void): void;
    onInventarioCiclico(listener: (event: ERPEvent) => void): void;
    onVentaProcessed(listener: (event: ERPEvent) => void): void;
    onCompraEntregada(listener: (event: ERPEvent) => void): void;
    onCotizacionCreada(listener: (event: ERPEvent) => void): void;
    onCotizacionAprobada(listener: (event: ERPEvent) => void): void;
    onGuiaRemisionCreada(listener: (event: ERPEvent) => void): void;
    onGuiaRemisionEntregada(listener: (event: ERPEvent) => void): void;
    onPlanillaCalculada(listener: (event: ERPEvent) => void): void;
    onPlanillaPagada(listener: (event: ERPEvent) => void): void;
    onEmpleadoAsistencia(listener: (event: ERPEvent) => void): void;
    onPagoFactura(listener: (event: ERPEvent) => void): void;
    onFacturaCobrada(listener: (event: ERPEvent) => void): void;
    onVencimientoPago(listener: (event: ERPEvent) => void): void;
    onGastoRegistrado(listener: (event: ERPEvent) => void): void;
    onReporteSireGenerado(listener: (event: ERPEvent) => void): void;
    onDashboardMetricsUpdated(listener: (event: ERPEvent) => void): void;
}
