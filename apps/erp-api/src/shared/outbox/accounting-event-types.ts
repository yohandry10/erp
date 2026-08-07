/**
 * Eventos cuya fila de outbox pertenece exclusivamente al worker contable.
 *
 * El worker genérico debe dejarlos pendientes: ContabilidadEventsListener es
 * quien genera el asiento y marca la fila como completada dentro de ese flujo.
 * Mantener una sola lista evita carreras donde otro worker cierre el evento
 * sin haber creado el asiento.
 */
export const ACCOUNTING_EVENT_TYPES = [
  'venta.procesada',
  'VentaFacturada',
  'pos.venta.registrada',
  'cobro.registrado',
  'CobroRegistrado',
  'recepcion.registrada',
  'RecepcionRegistrada',
  'factura.proveedor.registrada',
  'FacturaProveedorRegistrada',
  'devolucion.proveedor.registrada',
  'DevolucionProveedorEmitida',
  'cxc.creada',
  'CuentaPorCobrarCreada',
  'pago.proveedor.registrado',
  'PagoProveedorRegistrado',
  'ajuste.inventario.aplicado',
  'AjusteInventarioAplicado',
  'planilla.liquidada',
  'PlanillaLiquidada',
  'planilla.pagada',
  'PlanillaPagada',
  'depreciacion.generada',
  'DepreciacionGenerada',
  'cpe.anulado',
  'CPEAnulado',
  'factura.emitida',
  'FacturaEmitida',
  'producto.stock_bajo',
  'producto.stock.bajo',
  'ProductoStockBajo',
  'stock.movimiento',
  'StockMovimiento',
] as const;
