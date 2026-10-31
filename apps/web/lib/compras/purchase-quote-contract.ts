const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const fingerprint = /^[0-9a-f]{64}$/i
const live = (v: any) => v && !v.offline && !v.cached && !v.pending && !v.queued
const number = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0
const cents = (v: number) => Math.round((v + Number.EPSILON) * 100)
const date = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && Number.isFinite(Date.parse(v)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v
const timestamp = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v))
const fail = (): never => { throw new Error('La operación de compra no está confirmada. Reintenta con conexión.') }
export type PurchaseQuoteScope = { id: string; tenantId: string; actorId: string }

function validDetails(rows: any, parent: string, field: string, tenant: string): boolean {
  return Array.isArray(rows) && rows.length > 0 && new Set(rows.map(d => d?.id)).size === rows.length
    && rows.every(d => live(d) && uuid.test(d.id || '') && d.tenant_id === tenant && d[field] === parent
      && uuid.test(d.producto_id || '') && typeof d.descripcion === 'string'
      && number(d.cantidad) && d.cantidad > 0 && number(d.precio_unitario) && number(d.subtotal)
      && cents(d.cantidad * d.precio_unitario) === cents(d.subtotal))
}
function validAmounts(d: any): boolean {
  return number(d.subtotal) && number(d.igv) && number(d.total)
    && cents(d.subtotal + d.igv) === cents(d.total)
    && cents(d.detalles.reduce((sum: number, row: any) => sum + row.subtotal, 0)) === cents(d.subtotal)
}
const lineContent = (d: any) => JSON.stringify([d.producto_id, d.descripcion, d.cantidad, d.precio_unitario, d.subtotal,
  d.metadata?.afectacion_igv ?? null, d.metadata?.tax_rate ?? null])
function sameLines(a: any[], b: any[]): boolean {
  return a.length === b.length && JSON.stringify(a.map(lineContent).sort()) === JSON.stringify(b.map(lineContent).sort())
}

export function readPurchaseQuote(response: any, scope: PurchaseQuoteScope): any {
  const d = response?.data
  if (!uuid.test(scope.id) || !uuid.test(scope.tenantId) || !uuid.test(scope.actorId)
    || !live(response) || response.success !== true || !live(d) || d.id !== scope.id || d.tenant_id !== scope.tenantId
    || !uuid.test(d.proveedor_id || '') || !uuid.test(d.created_by || '') || !d.numero?.trim()
    || !['BORRADOR', 'ENVIADA', 'APROBADA', 'RECHAZADA', 'VENCIDA'].includes(d.estado)
    || !date(d.fecha_cotizacion) || !date(d.fecha_vencimiento)
    || !validDetails(d.detalles, scope.id, 'cotizacion_id', scope.tenantId) || !validAmounts(d)
    || (d.orden_compra_id != null && !uuid.test(d.orden_compra_id))) return fail()
  return d
}

export function confirmPurchaseQuoteAction(response: any, scope: PurchaseQuoteScope, previous: any,
  action: 'ENVIAR' | 'APROBAR' | 'RECHAZAR', reason?: string): void {
  const d = readPurchaseQuote(response, scope)
  const state = { ENVIAR: 'ENVIADA', APROBAR: 'APROBADA', RECHAZAR: 'RECHAZADA' }[action]
  const fields = ['numero', 'proveedor_id', 'created_by', 'fecha_cotizacion', 'fecha_vencimiento', 'subtotal', 'igv', 'total']
  if (d.estado !== state || d.orden_compra_id != null || d.updated_by !== scope.actorId
    || typeof d.idempotent !== 'boolean' || d.metadata?.last_action !== action || !timestamp(d.metadata?.last_action_at)
    || fields.some(k => d[k] !== previous[k]) || !sameLines(d.detalles, previous.detalles)
    || (action !== 'ENVIAR' && (d.metadata?.decision_actor_id !== scope.actorId || d.created_by === scope.actorId
      || !fingerprint.test(d.metadata?.decision_fingerprint || '')))
    || (action === 'RECHAZAR' && d.metadata?.motivo_rechazo !== reason?.trim())) return fail()
}

export function confirmPurchaseQuoteConversion(response: any, scope: PurchaseQuoteScope, previous: any): string {
  const d = response?.data
  if (!live(response) || response.success !== true || !live(d) || !uuid.test(d.id || '')
    || d.tenant_id !== scope.tenantId || d.cotizacion_id !== scope.id || d.proveedor_id !== previous.proveedor_id
    || d.created_by !== scope.actorId || !d.numero?.trim() || d.estado !== 'BORRADOR'
    || !date(d.fecha_orden) || !date(d.fecha_entrega_esperada || d.fecha_entrega)
    || typeof d.idempotent !== 'boolean' || d.moneda !== (previous.moneda || 'PEN')
    || d.metadata?.idempotency_key !== `compras:cotizacion:convertir:${scope.id}`
    || d.metadata?.source_quote_id !== scope.id || !fingerprint.test(d.metadata?.request_fingerprint || '')
    || !fingerprint.test(previous.metadata?.decision_fingerprint || '')
    || d.metadata?.source_quote_fingerprint !== previous.metadata.decision_fingerprint
    || d.subtotal !== previous.subtotal || d.igv !== previous.igv || d.total !== previous.total
    || !validDetails(d.detalles, d.id, 'orden_id', scope.tenantId) || !validAmounts(d)
    || d.detalles.some((row: any) => row.cantidad_recibida !== 0 || row.cantidad_pendiente !== row.cantidad
      || row.moneda !== d.moneda || row.metadata?.source_quote_id !== scope.id)
    || !sameLines(d.detalles, previous.detalles)) return fail()
  return d.id
}
