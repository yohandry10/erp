import type { AdjustmentIntent,TransferIntent } from '@/lib/inventory-operation-contract'
export type InventoryReceiptScope={tenantId:string;actorId:string}
const object=(v:any):v is Record<string,any>=>!!v && typeof v==='object' && !Array.isArray(v)
const uuid=(v:any)=>typeof v==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
const canonical=(v:any):string=>JSON.stringify(v,(_key,value)=>object(value)?Object.fromEntries(Object.keys(value).sort().map(k=>[k,value[k]])):value)
const trim=(v:string)=>v.replace(/^ +| +$/g,'')
const live=(v:any)=>object(v) && ['cached','queued','offline','pending','from_cache'].every(k=>v[k]===undefined || v[k]===false)
const fail=():never=>{throw new Error('El recibo no confirma la clave, usuario y datos originales de inventario. Sus datos se conservan para recuperar el resultado.')}
export function confirmInventoryOperationIdentity(row:any,intent:AdjustmentIntent|TransferIntent,type:'AJUSTE'|'TRANSFERENCIA',scope:InventoryReceiptScope) {
  const op=row?.operation_identity
  if (!uuid(scope.tenantId) || !uuid(scope.actorId) || !live(row) || !live(op) || op.version!==1 || op.type!==type
    || op.operation_id!==row.operacion_id || !uuid(op.operation_id) || op.tenant_id!==scope.tenantId || op.actor_id!==scope.actorId
    || op.idempotency_key!==trim(intent.idempotency_key) || !/^[0-9a-f]{64}$/.test(op.request_fingerprint || '')
    || typeof op.confirmed_at!=='string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(op.confirmed_at) || !Number.isFinite(Date.parse(op.confirmed_at))) return fail()
  const adjustment=intent as AdjustmentIntent,transfer=intent as TransferIntent
  const expected=type==='AJUSTE'?{producto_id:adjustment.producto_id,almacen_id:adjustment.almacen_id,ubicacion_id:null,centro_costo_id:null,delta:adjustment.delta,motivo:trim(adjustment.motivo)}
    :{producto_id:transfer.producto_id,almacen_origen_id:transfer.almacen_origen_id,almacen_destino_id:transfer.almacen_destino_id,ubicacion_origen_id:null,ubicacion_destino_id:null,cantidad:transfer.cantidad,motivo:trim(transfer.motivo),lote:null,fecha_expiracion:null,guia_remision_id:transfer.guia_remision_id || null}
  if (canonical(op.request_payload)!==canonical(expected))return fail()
  return row
}
export function sameInventoryOperationReceipt(a:any,b:any) {
  if(!object(a)||!object(b))return false
  const omit=(v:any)=>Object.fromEntries(Object.entries(v).filter(([k])=>k!=='idempotent'))
  return canonical(omit(a))===canonical(omit(b))
}
