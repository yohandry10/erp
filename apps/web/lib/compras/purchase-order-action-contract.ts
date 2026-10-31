import { readPurchaseOrder } from './purchase-order-read-contract'

export type PurchaseOrderAction = 'APROBAR' | 'RECHAZAR' | 'CANCELAR'
type Scope = { id: string; tenantId: string; actorId: string }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const fingerprint = /^[0-9a-f]{64}$/i
const timestamp = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v))
const fail = (): never => { throw new Error('La acción de la orden no está confirmada. Reintenta con conexión.') }
const lineContent = (row: any) => JSON.stringify([row.id, row.producto_id, row.descripcion, row.cantidad,
  row.cantidad_recibida, row.cantidad_pendiente, row.precio_unitario, row.subtotal, row.moneda,
  row.metadata?.afectacion_igv ?? null, row.metadata?.tax_rate ?? null])

export function confirmPurchaseOrderAction(response: any, scope: Scope, previous: any,
  action: PurchaseOrderAction, reason?: string): any {
  const d = readPurchaseOrder(response, scope.id, scope.tenantId, scope.actorId)
  const fields = ['numero', 'proveedor_id', 'cotizacion_id', 'created_by', 'fecha_orden', 'fecha_entrega_esperada',
    'condiciones_pago', 'dias_credito', 'almacen_destino_id', 'moneda', 'subtotal', 'igv', 'total']
  if (d.estado !== (action === 'APROBAR' ? 'APROBADA' : 'ANULADA') || d.updated_by !== scope.actorId
    || typeof d.idempotent !== 'boolean' || d.metadata?.last_action !== action
    || fields.some(key => d[key] !== previous[key]) || !Array.isArray(previous.detalles)
    || JSON.stringify(d.detalles.map(lineContent).sort()) !== JSON.stringify(previous.detalles.map(lineContent).sort())) return fail()
  if (action === 'APROBAR') {
    if (d.created_by === scope.actorId || d.aprobado_by !== scope.actorId || !timestamp(d.aprobado_at)
      || d.metadata?.approval_actor_id !== scope.actorId || !fingerprint.test(d.metadata?.approval_fingerprint || '')
      || !uuid.test(d.metadata?.approval_event_id || '')) return fail()
  } else {
    if (d.metadata?.decision_actor_id !== scope.actorId || !fingerprint.test(d.metadata?.decision_fingerprint || '')) return fail()
    if (action === 'RECHAZAR' && (d.created_by === scope.actorId || d.rechazado_by !== scope.actorId
      || !timestamp(d.rechazado_at) || !reason?.trim() || d.motivo_rechazo !== reason.trim())) return fail()
    if (action === 'CANCELAR' && (d.cancelado_by !== scope.actorId || !timestamp(d.cancelado_at)
      || !reason?.trim() || d.motivo_cancelacion !== reason.trim())) return fail()
  }
  return d
}
