import { isPurchaseQuantity, isPurchaseUnitPrice } from './quantity'

export type PurchaseReceiptScope = { tenantId: string; actorId: string; orderId: string }
export type PurchaseReceiptItem = {
  detalle_id: string; cantidad_recibida: number; calidad: 'OK' | 'OBSERVADO' | 'RECHAZADO';
  almacen_id?: string; ubicacion_id?: string; observaciones?: string; lote?: string; serie?: string; fecha_expiracion?: string;
}
export type PurchaseReceiptPayload = { orden_id: string; idempotency_key: string; observaciones: string; items: PurchaseReceiptItem[] }
export type PurchaseReceiptExpected = {
  detailId: string; productId: string; name: string; code: string | null; ordered: number; price: number; service: boolean; stock: boolean;
}
type CreatedReceipt = { id: string; number: string; createdAt: string; receivedAt: string; fingerprint: string; itemIds: string[] }
export type ReceiptCloseValuation = { moneda: string; moneda_base: string; tipo_cambio: string; referencia: string }
export type PurchaseReceiptIntent = PurchaseReceiptScope & {
  version: 1; createdAt: string; stage: 'CREATE' | 'CLOSE'; payload: PurchaseReceiptPayload;
  expected: PurchaseReceiptExpected[]; closePayload: { observaciones: string; valuacion?: ReceiptCloseValuation }; created?: CreatedReceipt;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const text = (v: unknown): v is string => typeof v === 'string' && !!v.trim()
const civil = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && Number.isFinite(Date.parse(v)) && new Date(v+'T00:00:00Z').toISOString().slice(0,10) === v
const timestamp = (v: unknown): v is string => typeof v === 'string' && civil(v.slice(0,10))
  && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v))
const object = (v: any, keys: string[]) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).every(k=>keys.includes(k))
const live = (v: any) => v && typeof v === 'object' && !Array.isArray(v) && !v.offline && !v.cached && !v.queued && !v.pending
const fingerprint = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{64}$/i.test(v)
const rate = (v: unknown): v is string => typeof v === 'string' && /^(0|[1-9][0-9]{0,9})(?:\.\d{1,6})?$/.test(v) && /[1-9]/.test(v)
const normalizeRate = (v: string) => v.includes('.') ? v.replace(/0+$/,'').replace(/\.$/,'') : v
export function isReceiptCloseValuation(v: any): v is ReceiptCloseValuation {
  return object(v,['moneda','moneda_base','tipo_cambio','referencia']) && Object.keys(v).length===4
    && typeof v.moneda==='string' && /^[A-Z]{3}$/.test(v.moneda)
    && typeof v.moneda_base==='string' && /^[A-Z]{3}$/.test(v.moneda_base) && rate(v.tipo_cambio)
    && (v.moneda!==v.moneda_base || normalizeRate(v.tipo_cambio)==='1')
    && typeof v.referencia==='string' && v.referencia.trim().length>=5 && v.referencia.trim().length<=200
}
const fail = (): never => { throw new Error('La recepción no está confirmada. Sus datos se conservan para reintentar con conexión.') }
export function purchaseReceiptIntentKey(scope: PurchaseReceiptScope): string {
  if (![scope.tenantId,scope.actorId,scope.orderId].every(v=>uuid.test(v))) return fail()
  return `erp.purchase-receipt.pending.v1.${scope.tenantId}:${scope.actorId}:${scope.orderId}`
}
export function readPurchaseReceiptIntent(raw: string | null, scope: PurchaseReceiptScope): PurchaseReceiptIntent | null {
  purchaseReceiptIntentKey(scope)
  if (raw === null) return null
  let i: PurchaseReceiptIntent
  try { i=JSON.parse(raw) } catch { return fail() }
  const p=i?.payload
  if (!object(i,['version','createdAt','tenantId','actorId','orderId','stage','payload','expected','closePayload','created'])
    || i.version!==1 || i.tenantId!==scope.tenantId || i.actorId!==scope.actorId || i.orderId!==scope.orderId || !timestamp(i.createdAt)
    || !['CREATE','CLOSE'].includes(i.stage) || !object(p,['orden_id','idempotency_key','observaciones','items'])
    || p.orden_id!==scope.orderId || !text(p.idempotency_key) || p.idempotency_key.length>200 || !text(p.observaciones)
    || !object(i.closePayload,['observaciones','valuacion']) || !text(i.closePayload.observaciones)
    || Object.hasOwn(i.closePayload,'valuacion') && !isReceiptCloseValuation(i.closePayload.valuacion)
    || !Array.isArray(p.items) || p.items.length<1 || p.items.length>999
    || new Set(p.items.map(v=>v?.detalle_id)).size!==p.items.length
    || !p.items.every(v=>object(v,['detalle_id','cantidad_recibida','calidad','almacen_id','ubicacion_id','observaciones','lote','serie','fecha_expiracion'])
      && uuid.test(v.detalle_id || '') && isPurchaseQuantity(v.cantidad_recibida) && ['OK','OBSERVADO','RECHAZADO'].includes(v.calidad)
      && ['almacen_id','ubicacion_id'].every(k=>!Object.hasOwn(v,k)||uuid.test((v as any)[k] || ''))
      && ['observaciones','lote','serie'].every(k=>!Object.hasOwn(v,k)||text((v as any)[k]))
      && (!Object.hasOwn(v,'fecha_expiracion')||civil(v.fecha_expiracion)))
    || !Array.isArray(i.expected) || i.expected.length!==p.items.length
    || !i.expected.every((e,index)=>object(e,['detailId','productId','name','code','ordered','price','service','stock'])
      && e.detailId===p.items[index].detalle_id && uuid.test(e.productId || '') && text(e.name) && (e.code===null || typeof e.code==='string')
      && isPurchaseQuantity(e.ordered) && e.ordered>=p.items[index].cantidad_recibida && isPurchaseUnitPrice(e.price)
      && typeof e.service==='boolean' && typeof e.stock==='boolean' && (!e.service||!e.stock)
      && ((e.stock && p.items[index].calidad!=='RECHAZADO') ? !!p.items[index].almacen_id
        : !p.items[index].almacen_id && !p.items[index].ubicacion_id && !p.items[index].fecha_expiracion))) return fail()
  if (i.stage==='CREATE' && Object.hasOwn(i,'created')) return fail()
  if (i.stage==='CLOSE' && (!object(i.created,['id','number','createdAt','receivedAt','fingerprint','itemIds'])
    || !uuid.test(i.created?.id || '') || !text(i.created?.number) || !timestamp(i.created?.createdAt) || !timestamp(i.created?.receivedAt)
    || !fingerprint(i.created?.fingerprint) || !Array.isArray(i.created?.itemIds) || i.created.itemIds.length!==p.items.length
    || !i.created.itemIds.every(v=>uuid.test(v)) || new Set(i.created.itemIds).size!==p.items.length)) return fail()
  return i
}
function receipt(response: any, scope: PurchaseReceiptScope, intent: PurchaseReceiptIntent, closed: boolean): any {
  const verified=readPurchaseReceiptIntent(JSON.stringify(intent),scope)
  if (!verified || !live(response) || response.success===false || Object.hasOwn(response,'data') && response.success!==true) return fail()
  const d=Object.hasOwn(response,'data') ? response.data : response
  if (!live(d) || !uuid.test(d.id || '') || d.tenant_id!==scope.tenantId || d.orden_id!==scope.orderId || d.created_by!==scope.actorId
    || !text(d.numero) || d.activo!==true || d.estado!==(closed?'CERRADA':'BORRADOR')
    || !timestamp(d.created_at) || !timestamp(d.updated_at) || !timestamp(d.fecha_recepcion)
    || d.idempotency_key!==verified.payload.idempotency_key || !fingerprint(d.create_fingerprint)
    || d.observaciones!==(closed?verified.closePayload.observaciones:verified.payload.observaciones)
    || (closed ? !timestamp(d.cerrado_at)||d.cerrado_por!==scope.actorId : d.cerrado_at!==null||d.cerrado_por!==null)
    || !live(d.orden) || d.orden.id!==scope.orderId || !text(d.orden.numero)
    || !Array.isArray(d.items) || d.items.length!==verified.payload.items.length || new Set(d.items.map((v:any)=>v?.id)).size!==d.items.length) return fail()
  for (let index=0;index<verified.payload.items.length;index++) {
    const p=verified.payload.items[index], e=verified.expected[index]
    const r=d.items.find((v:any)=>v?.detalle_id===p.detalle_id)
    if (!live(r) || !uuid.test(r.id || '') || r.tenant_id!==scope.tenantId || r.recepcion_id!==d.id || r.producto_id!==e.productId
      || r.estado!=='ACTIVO' || !timestamp(r.created_at) || !timestamp(r.updated_at)
      || r.cantidad_recibida!==p.cantidad_recibida || r.cantidad!==p.cantidad_recibida || r.calidad!==p.calidad
      || r.cantidad_devuelta!==0 || r.cantidad_disponible_devolucion!==p.cantidad_recibida
      || ['almacen_id','ubicacion_id','lote','serie','fecha_expiracion','observaciones'].some(k=>r[k]!==((p as any)[k] || null))
      || !live(r.detalle) || r.detalle.id!==p.detalle_id || r.detalle.cantidad!==e.ordered || r.detalle.precio_unitario!==e.price
      || !live(r.producto) || r.producto.id!==e.productId || r.producto.nombre!==e.name || r.producto.codigo!==e.code
      || !live(r.metadata) || r.metadata.es_servicio!==e.service || r.metadata.controla_stock!==e.stock
      || closed && r.id!==verified.created?.itemIds[index]) return fail()
  }
  if (closed && (!verified.created || d.id!==verified.created.id || d.numero!==verified.created.number
    || d.created_at!==verified.created.createdAt || d.fecha_recepcion!==verified.created.receivedAt
    || d.create_fingerprint!==verified.created.fingerprint)) return fail()
  const valuation=verified.closePayload.valuacion
  if (closed && valuation && (!isReceiptCloseValuation(d.valuacion_cierre)
    || d.valuacion_cierre.moneda!==valuation.moneda || d.valuacion_cierre.moneda_base!==valuation.moneda_base
    || normalizeRate(d.valuacion_cierre.tipo_cambio)!==normalizeRate(valuation.tipo_cambio)
    || d.valuacion_cierre.referencia!==valuation.referencia.trim())) return fail()
  return d
}
export function confirmPurchaseReceiptCreated(response: any, scope: PurchaseReceiptScope, intent: PurchaseReceiptIntent): PurchaseReceiptIntent {
  if (intent.stage!=='CREATE') return fail()
  const d=receipt(response,scope,intent,false)
  return {...intent,stage:'CLOSE',created:{id:d.id,number:d.numero,createdAt:d.created_at,receivedAt:d.fecha_recepcion,fingerprint:d.create_fingerprint,
    itemIds:intent.payload.items.map(item=>d.items.find((v:any)=>v.detalle_id===item.detalle_id).id)}}
}
export function confirmPurchaseReceiptClosed(response: any, scope: PurchaseReceiptScope, intent: PurchaseReceiptIntent): void {
  if (intent.stage!=='CLOSE') return fail()
  receipt(response,scope,intent,true)
}
