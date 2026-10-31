const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const live = (v: any) => v && !v.offline && !v.cached && !v.pending && !v.queued
const number = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0
const cents = (v: number) => Math.round((v + Number.EPSILON) * 100)
const date = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && Number.isFinite(Date.parse(v)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v
const fail = (): never => { throw new Error('El detalle de la orden está incompleto o no corresponde a esta empresa. Reintenta con conexión.') }

export function readPurchaseOrder(response: any, id: string, tenantId: string, actorId: string): any {
  const d = response?.data
  if (!uuid.test(id) || !uuid.test(tenantId) || !uuid.test(actorId) || !live(response) || response.success !== true
    || !live(d) || d.id !== id || d.tenant_id !== tenantId || !d.numero?.trim()
    || !uuid.test(d.proveedor_id || '') || !uuid.test(d.created_by || '')
    || !['BORRADOR', 'PENDIENTE', 'APROBACION', 'APROBADA', 'PARCIAL', 'RECIBIDA', 'CERRADA', 'ENTREGADO', 'ENTREGADA', 'RECHAZADA', 'ANULADA'].includes(d.estado)
    || !/^[A-Z]{3}$/.test(d.moneda || '') || !date(d.fecha_orden)
    || (d.fecha_entrega_esperada != null && !date(d.fecha_entrega_esperada))
    || (d.cotizacion_id != null && !uuid.test(d.cotizacion_id))
    || !Array.isArray(d.detalles) || d.detalles.length === 0
    || new Set(d.detalles.map((row: any) => row?.id)).size !== d.detalles.length
    || !d.detalles.every((row: any) => live(row) && uuid.test(row.id || '') && row.tenant_id === tenantId && row.orden_id === id
      && uuid.test(row.producto_id || '') && typeof row.descripcion === 'string' && row.descripcion.trim()
      && number(row.cantidad) && row.cantidad > 0 && number(row.cantidad_recibida) && row.cantidad_recibida <= row.cantidad
      && number(row.cantidad_pendiente) && Math.abs(row.cantidad - row.cantidad_recibida - row.cantidad_pendiente) < 0.000001
      && row.moneda === d.moneda && number(row.precio_unitario) && number(row.subtotal)
      && cents(row.cantidad * row.precio_unitario) === cents(row.subtotal))
    || !number(d.subtotal) || !number(d.igv) || !number(d.total)
    || cents(d.subtotal + d.igv) !== cents(d.total)
    || cents(d.detalles.reduce((sum: number, row: any) => sum + row.subtotal, 0)) !== cents(d.subtotal)
    || (d.proveedor && (d.proveedor.id !== d.proveedor_id || !d.proveedor.razon_social?.trim()))) return fail()
  return d
}
