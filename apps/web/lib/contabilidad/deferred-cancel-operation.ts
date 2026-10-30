import { readDeferredRegister } from './deferred-read-contract'
import type { DeferredCreateScope } from './deferred-create-operation'
export type DeferredCancelSnapshot = {
  id: string; tenant_id: string; codigo: string | null; nombre: string; descripcion: string | null
  tipo: 'GASTO' | 'INGRESO'; cuenta_diferido_id: string; cuenta_resultado_id: string
  monto_total: number; monto_devengado: number; monto_pendiente: number; periodos: number
  fecha_inicio: string; centro_costo_id: string | null; estado: 'VIGENTE'; created_by: string
  created_at: string; updated_at: string
}
export interface DeferredCancelIntent extends DeferredCreateScope {
  version: 1; createdAt: string; idempotencyKey: string; body: ''; snapshot: DeferredCancelSnapshot
}
const object=(v: unknown): v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const uuid=(v: unknown): v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
const civil=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v
const timestamp=(v:unknown):v is string=>typeof v==='string'&&civil(v.slice(0,10))&&/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v)&&Number.isFinite(Date.parse(v))
const live=(v:Record<string,any>)=>['cached','queued','offline','pending'].every(k=>v[k]===undefined||v[k]===false)
const keys=['id','tenant_id','codigo','nombre','descripcion','tipo','cuenta_diferido_id','cuenta_resultado_id','monto_total','monto_devengado','monto_pendiente','periodos','fecha_inicio','centro_costo_id','estado','created_by','created_at','updated_at'] as const
const exact=(v:Record<string,any>,fields:readonly string[])=>Object.keys(v).length===fields.length&&fields.every(k=>Object.prototype.hasOwnProperty.call(v,k))
const text=(v:unknown)=>typeof v==='string'&&!!v.trim()
function invalid():never{throw new Error('No se pudo recuperar la cancelación pendiente con seguridad. Se conserva sin reemplazarla.')}
function readComplete(value:unknown,tenantId:string){
 if(!object(value)||!live(value)||!keys.every(k=>Object.prototype.hasOwnProperty.call(value,k))||!uuid(value.created_by)||!timestamp(value.created_at)||!timestamp(value.updated_at)||Date.parse(value.updated_at)<Date.parse(value.created_at)||
   (value.centro_costo_id!==null&&!uuid(value.centro_costo_id))||(value.codigo!==null&&!text(value.codigo))||(value.descripcion!==null&&typeof value.descripcion!=='string')||!Number.isSafeInteger(value.periodos)||!Number.isSafeInteger(Math.round(value.monto_total*100)))invalid()
 readDeferredRegister({success:true,data:[value]},tenantId)
 return value
}
export function deferredCancelIntentKey(scope:DeferredCreateScope){
 if(!uuid(scope.tenantId)||!uuid(scope.actorId))invalid()
 return `erp.accounting.deferred-cancel.pending.v1.${scope.tenantId}:${scope.actorId}`
}
export function readDeferredCancelCandidate(value: unknown, scope: DeferredCreateScope, recordId: string, selected?: unknown) {
 if(!object(value)||value.success!==true||!live(value)||(value.tenant_id!==undefined&&value.tenant_id!==scope.tenantId)||!object(value.data)||value.data.id!==recordId)throw new Error('Se necesita el diferido completo en vivo antes de cancelar.')
 const row=readComplete(value.data,scope.tenantId)
 if(selected!==undefined){const prior=readComplete(selected,scope.tenantId);if(keys.some(k=>row[k]!==prior[k]))throw new Error('El diferido cambió desde la consulta. Actualice antes de cancelar.')}
 if(row.estado!=='VIGENTE'||row.monto_pendiente<=0)throw new Error('El diferido ya no está vigente para cancelar. Se conserva la consulta para revisar su estado.')
 return row
}
export function newDeferredCancelIntent(value:unknown,scope:DeferredCreateScope):DeferredCancelIntent{
 deferredCancelIntentKey(scope);const row=readComplete(value,scope.tenantId)
 if(row.estado!=='VIGENTE'||row.monto_pendiente<=0)invalid()
 const snapshot=Object.fromEntries(keys.map(k=>[k,row[k]])) as unknown as DeferredCancelSnapshot
 return{version:1,...scope,createdAt:new Date().toISOString(),idempotencyKey:crypto.randomUUID(),body:'',snapshot}
}
export function readDeferredCancelIntent(raw:string,scope:DeferredCreateScope):DeferredCancelIntent{
 try{
  deferredCancelIntentKey(scope);if(raw.length>131072)invalid();const v=JSON.parse(raw)
  if(!object(v)||!exact(v,['version','tenantId','actorId','createdAt','idempotencyKey','body','snapshot'])||v.version!==1||v.tenantId!==scope.tenantId||v.actorId!==scope.actorId||!timestamp(v.createdAt)||!uuid(v.idempotencyKey)||v.body!==''||!object(v.snapshot)||!exact(v.snapshot,keys))invalid()
  const r=readComplete(v.snapshot,scope.tenantId);if(r.estado!=='VIGENTE'||r.monto_pendiente<=0)invalid()
  return v as DeferredCancelIntent
 }catch{invalid()}
}
export function confirmDeferredCancelled(value:unknown,intent:DeferredCancelIntent){
 if(!object(value)||value.success!==true||!live(value)||(value.tenant_id!==undefined&&value.tenant_id!==intent.tenantId)||!object(value.data)||!live(value.data))throw new Error('Se necesita el recibo completo en vivo de la cancelación.')
 const row=readComplete(value.data,intent.tenantId)
 if(row.estado!=='CANCELADO'||Date.parse(row.updated_at)<Date.parse(intent.snapshot.updated_at)||keys.filter(k=>!['estado','updated_at'].includes(k)).some(k=>row[k]!==intent.snapshot[k]))throw new Error('El recibo no coincide con la cancelación pendiente. Se conserva para verificar el resultado.')
 return row
}
