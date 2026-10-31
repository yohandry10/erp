import { readPurchaseOrder } from './purchase-order-read-contract'
import { isPurchaseQuantity, isPurchaseUnitPrice } from './quantity'

export type PurchaseOrderCreateScope = { tenantId: string; actorId: string }
export type PurchaseOrderCreatePayload = {
  idempotency_key: string; numero: string; proveedor_id: string; moneda: string;
  fecha_orden: string; fecha_entrega_esperada?: string; condiciones_pago?: string;
  dias_credito: number; almacen_destino_id?: string; observaciones?: string;
  detalles: { producto_id: string; descripcion: string; cantidad: number; precio_unitario: number }[];
}
export type PurchaseOrderCreateExpectation = { taxRate: number; affectations: string[] }
export type PurchaseOrderCreateIntent = PurchaseOrderCreateScope & PurchaseOrderCreateExpectation & {
  version: 1; createdAt: string; payload: PurchaseOrderCreatePayload;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const text = (v: unknown): v is string => typeof v === 'string' && !!v.trim() && v === v.trim()
const civil = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && Number.isFinite(Date.parse(v)) && new Date(v+'T00:00:00Z').toISOString().slice(0,10) === v
const cents = (v: number) => Math.round((v + Number.EPSILON) * 100)
const money = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0
  && Number.isSafeInteger(cents(v)) && Math.abs(v*100-cents(v)) < 1e-6
const timestamp = (v: unknown): v is string => typeof v === 'string'
  && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(v)
  && civil(v.slice(0,10)) && Number.isFinite(Date.parse(v))
const fail = (): never => { throw new Error('La orden pendiente no está confirmada. Sus datos se conservan; reintenta con conexión.') }
const object = (v: any, keys: string[]) => v && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).every(k => keys.includes(k))
const expectedDelivery = (p: PurchaseOrderCreatePayload) => {
  if (p.fecha_entrega_esperada) return p.fecha_entrega_esperada
  const d = new Date(p.fecha_orden+'T00:00:00Z'); d.setUTCDate(d.getUTCDate()+30)
  return d.toISOString().slice(0,10)
}
export function purchaseOrderCreateIntentKey(scope: PurchaseOrderCreateScope): string {
  if (!uuid.test(scope.tenantId) || !uuid.test(scope.actorId)) return fail()
  return `erp.purchase-order.create.pending.v1.${scope.tenantId}:${scope.actorId}`
}
export function readPurchaseOrderCreateIntent(raw: string | null, scope: PurchaseOrderCreateScope): PurchaseOrderCreateIntent | null {
  purchaseOrderCreateIntentKey(scope)
  if (raw === null) return null
  let i: PurchaseOrderCreateIntent
  try { i = JSON.parse(raw) } catch { return fail() }
  const p = i?.payload
  if (!object(i,['version','createdAt','tenantId','actorId','taxRate','affectations','payload'])
    || i.version !== 1 || i.tenantId !== scope.tenantId || i.actorId !== scope.actorId
    || !timestamp(i.createdAt)
    || typeof i.taxRate !== 'number' || !Number.isFinite(i.taxRate) || i.taxRate < 0 || i.taxRate > 1
    || !object(p,['idempotency_key','numero','proveedor_id','moneda','fecha_orden','fecha_entrega_esperada','condiciones_pago','dias_credito','almacen_destino_id','observaciones','detalles'])
    || !text(p.idempotency_key) || p.idempotency_key.length > 200 || !text(p.numero) || !uuid.test(p.proveedor_id || '')
    || !['PEN','COP','ARS','USD'].includes(p.moneda) || !civil(p.fecha_orden)
    || (Object.hasOwn(p,'fecha_entrega_esperada') && (!civil(p.fecha_entrega_esperada) || p.fecha_entrega_esperada! < p.fecha_orden))
    || !Number.isInteger(p.dias_credito) || p.dias_credito < 0 || p.dias_credito > 3650
    || (Object.hasOwn(p,'almacen_destino_id') && !uuid.test(p.almacen_destino_id || ''))
    || ['condiciones_pago','observaciones'].some(k => Object.hasOwn(p,k) && !text(p[k as 'observaciones']))
    || !Array.isArray(p.detalles) || p.detalles.length < 1 || p.detalles.length > 999
    || !p.detalles.every(d => object(d,['producto_id','descripcion','cantidad','precio_unitario']) && uuid.test(d.producto_id || '')
      && text(d.descripcion) && isPurchaseQuantity(d.cantidad) && isPurchaseUnitPrice(d.precio_unitario)
      && Number.isSafeInteger(cents(d.cantidad*d.precio_unitario)))
    || !Array.isArray(i.affectations) || i.affectations.length !== p.detalles.length
    || !i.affectations.every(v => typeof v === 'string' && /^\d{2}$/.test(v))) return fail()
  if (!Number.isSafeInteger(p.detalles.reduce((sum,d) => sum+cents(d.cantidad*d.precio_unitario),0))) return fail()
  return i
}

export function confirmPurchaseOrderCreated(response: any, scope: PurchaseOrderCreateScope, intent: PurchaseOrderCreateIntent): string {
  const verified = readPurchaseOrderCreateIntent(JSON.stringify(intent),scope)
  if (!verified) return fail()
  const p = verified.payload
  const d = readPurchaseOrder(response,response?.data?.id || '',scope.tenantId,scope.actorId)
  const subtotalCents = p.detalles.reduce((sum,row) => sum+cents(row.cantidad*row.precio_unitario),0)
  const taxableCents = p.detalles.reduce((sum,row,index) => verified.affectations[index].startsWith('1')
    ? sum+cents(row.cantidad*row.precio_unitario) : sum,0)
  const taxCents = Math.round(taxableCents*verified.taxRate + Number.EPSILON)
  if (!Number.isSafeInteger(taxCents) || !Number.isSafeInteger(subtotalCents+taxCents)
    || d.estado !== 'BORRADOR' || d.created_by !== scope.actorId || d.updated_by !== scope.actorId
    || d.cotizacion_id != null || d.numero !== p.numero || d.numero_orden !== p.numero
    || d.proveedor_id !== p.proveedor_id || d.moneda !== p.moneda || d.fecha_orden !== p.fecha_orden
    || d.fecha_entrega_esperada !== expectedDelivery(p) || d.fecha_entrega !== expectedDelivery(p)
    || d.condiciones_pago !== (p.condiciones_pago || (p.dias_credito > 0 ? 'CREDITO' : 'CONTADO'))
    || d.dias_credito !== p.dias_credito || d.almacen_destino_id !== (p.almacen_destino_id || null)
    || d.observaciones !== (p.observaciones || null) || typeof d.idempotent !== 'boolean'
    || !timestamp(d.created_at) || !timestamp(d.updated_at)
    || d.metadata?.idempotency_key !== p.idempotency_key || d.metadata?.revision !== 1
    || !/^[0-9a-f]{64}$/i.test(d.metadata?.request_fingerprint || '')
    || !money(d.subtotal) || !money(d.igv) || !money(d.total)
    || cents(d.subtotal) !== subtotalCents || cents(d.igv) !== taxCents || cents(d.total) !== subtotalCents+taxCents
    || d.detalles.length !== p.detalles.length || !Array.isArray(d.items) || d.items.length !== p.detalles.length
    || d.detalles.some((row: any,index: number) => {
      const expected = p.detalles[index]
      return row.numero !== index+1 || row.producto_id !== expected.producto_id || row.descripcion !== expected.descripcion
        || row.cantidad !== expected.cantidad || row.precio_unitario !== expected.precio_unitario
        || row.cantidad_recibida !== 0 || row.cantidad_pendiente !== expected.cantidad
        || !money(row.subtotal) || row.metadata?.afectacion_igv !== verified.affectations[index]
        || row.metadata?.tax_rate !== (verified.affectations[index].startsWith('1') ? verified.taxRate : 0)
    }) || d.items.some((row: any,index: number) => {
      const expected = p.detalles[index]
      return !row || row.offline || row.cached || row.queued || row.pending
        || row.producto_id !== expected.producto_id || row.cantidad !== expected.cantidad
        || row.precio_unitario !== expected.precio_unitario || !money(row.subtotal) || cents(row.subtotal) !== cents(expected.cantidad*expected.precio_unitario)
        || typeof row.producto_nombre !== 'string' || !row.producto_nombre.trim()
    })) return fail()
  return d.id
}
