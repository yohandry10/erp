import { readAdjustmentConfirmation, readTransferConfirmation, readInventoryIntent, type InventoryIntent } from './inventory-operation-contract'
import { confirmInventoryOperationIdentity, type InventoryReceiptScope } from './inventory-operation-identity'

const object = (v:any): v is Record<string,any> => !!v && typeof v === 'object' && !Array.isArray(v)
const uuid = (v:any) => typeof v==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
const live = (v:any) => object(v) && ['cached','queued','offline','pending','from_cache'].every(k=>v[k]===undefined || v[k]===false) && v.sync_status!=='pending'
const exact = (v:any,keys:string[]) => object(v) && Object.keys(v).length===keys.length && keys.every(k=>Object.prototype.hasOwnProperty.call(v,k))
const canonical = (v:any):string => JSON.stringify(v,(_key,value)=>object(value)?Object.fromEntries(Object.keys(value).sort().map(k=>[k,value[k]])):value)
const fail = ():never => { throw new Error('La resolución no confirma la identidad y los datos originales completos. El pendiente se conserva.') }
export function inventoryOriginalResolutionEndpoint(intent:InventoryIntent) {
  if(!readInventoryIntent(intent))return fail()
  return `/inventario/${intent.mode==='ajuste'?'movimientos':'transferencias'}/resolver`
}
export function inventoryOriginalResolutionRequest(intent:InventoryIntent,scope:InventoryReceiptScope) {
  if(!readInventoryIntent(intent) || !uuid(scope.tenantId) || !uuid(scope.actorId))return fail()
  return {expected_scope:{tenant_id:scope.tenantId,actor_id:scope.actorId},original:intent.payload}
}
export function readInventoryOriginalResolution(response:any,intent:InventoryIntent,scope:InventoryReceiptScope) {
  if(!readInventoryIntent(intent) || !live(response) || response.success!==true || !live(response.data))return fail()
  const r=response.data
  if(r.success!==true)return fail()
  if(r.resolution==='COMMITTED' && exact(r,['success','resolution','receipt']) && live(r.receipt) && r.receipt.idempotent===true) {
    const receipt=intent.mode==='ajuste'?readAdjustmentConfirmation({success:true,data:r.receipt},intent.payload,scope):readTransferConfirmation({success:true,data:r.receipt},intent.payload,scope)
    return {...r,receipt}
  }
  if(r.resolution!=='ABANDONED' || !exact(r,['success','resolution','idempotent','operation_identity']) || typeof r.idempotent!=='boolean')return fail()
  const op=r.operation_identity
  if(!live(op) || !exact(op,['version','action','operation_id','type','tenant_id','actor_id','idempotency_key','request_payload','request_fingerprint','confirmed_at']) || op.action!=='ABANDON_INVENTORY')return fail()
  // En el abandono este UUID identifica el control durable, sin movimientos de stock.
  confirmInventoryOperationIdentity({operacion_id:op.operation_id,operation_identity:op},intent.payload,intent.mode==='ajuste'?'AJUSTE':'TRANSFERENCIA',scope)
  return r
}
export function sameInventoryOriginalResolution(a:any,b:any) {
  if(!object(a)||!object(b))return false
  const withoutReplay=(v:any)=>Object.fromEntries(Object.entries(v).filter(([k])=>k!=='idempotent'))
  return canonical(withoutReplay(a))===canonical(withoutReplay(b))
}
