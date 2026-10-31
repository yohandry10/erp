import {readBudgetDetail,type BudgetRow} from './accounting-budget-read'
import {budgetCreateIntentKey,type BudgetCreateScope} from './accounting-budget-create-operation'
export type BudgetDeleteScope=BudgetCreateScope
export type BudgetDeletePayload={expected_snapshot:BudgetRow}
export type BudgetDeleteIntent=BudgetDeleteScope&{version:1;createdAt:string;idempotencyKey:string;recordId:string;body:string}
const object=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const exact=(v:Record<string,any>,keys:string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.prototype.hasOwnProperty.call(v,k))
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(v)
const equal=(a:unknown,b:unknown):boolean=>{
 if(a===b)return true
 if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>equal(v,b[i]))
 return object(a)&&object(b)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.prototype.hasOwnProperty.call(b,k)&&equal(a[k],b[k]))
}
function invalid():never{throw new Error('No se pudo verificar la baja pendiente del presupuesto. Sus datos se conservan sin reemplazarlos.')}
export function budgetDeleteIntentKey(scope:BudgetDeleteScope){budgetCreateIntentKey(scope);return `erp.accounting.budget-delete.pending.v1.${scope.tenantId}:${scope.actorId}`}
export function readBudgetDeletePayload(value:unknown,scope:BudgetDeleteScope,id:string):BudgetDeletePayload{
 budgetDeleteIntentKey(scope)
 if(!object(value)||!exact(value,['expected_snapshot']))invalid()
 readBudgetDetail({success:true,data:value.expected_snapshot},scope.tenantId,id)
 return value as BudgetDeletePayload
}
export function newBudgetDeleteIntent(payload:BudgetDeletePayload,scope:BudgetDeleteScope):BudgetDeleteIntent{
 const p=readBudgetDeletePayload(payload,scope,payload.expected_snapshot.id)
 return {version:1,...scope,createdAt:new Date().toISOString(),idempotencyKey:crypto.randomUUID(),recordId:p.expected_snapshot.id,body:JSON.stringify(p)}
}
export function readBudgetDeleteIntent(raw:string|null,scope:BudgetDeleteScope):BudgetDeleteIntent|null{
 if(raw===null)return null
 try{
  budgetDeleteIntentKey(scope);if(raw.length>131072)invalid();const v=JSON.parse(raw)
  if(!object(v)||!exact(v,['version','tenantId','actorId','createdAt','idempotencyKey','recordId','body'])||v.version!==1||v.tenantId!==scope.tenantId||v.actorId!==scope.actorId||!uuid(v.idempotencyKey)||typeof v.createdAt!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(v.createdAt)||!Number.isFinite(Date.parse(v.createdAt))||new Date(v.createdAt).toISOString()!==v.createdAt||typeof v.body!=='string'||v.body.length>65536)invalid()
  readBudgetDeletePayload(JSON.parse(v.body),scope,v.recordId);return v as BudgetDeleteIntent
 }catch{invalid()}
}
export function confirmBudgetDeleted(response:unknown,intent:BudgetDeleteIntent):BudgetRow{
 const payload=readBudgetDeletePayload(JSON.parse(intent.body),intent,intent.recordId),row=readBudgetDetail(response,intent.tenantId,intent.recordId)
 if(!object(response)||!object(response.data))invalid();const op=response.data.operation
 if(!object(op)||['cached','queued','offline','pending'].some(k=>op[k]!==undefined&&op[k]!==false)||op.success!==true||op.action!=='DELETE'||op.id!==intent.recordId||!uuid(op.operation_id)||op.tenant_id!==intent.tenantId||op.actor_id!==intent.actorId||op.idempotency_key!==intent.idempotencyKey||typeof op.idempotent!=='boolean'||typeof op.request_fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(op.request_fingerprint)||!equal(op.payload,payload))throw new Error('Se necesita el recibo completo de la baja del presupuesto con sus datos conservados.')
 const before=Object.fromEntries(Object.entries(response.data).filter(([k])=>k!=='operation'))
 if(!equal(before,payload.expected_snapshot))throw new Error('El recibo de baja no coincide con la fotografía original del presupuesto.')
 return row
}
