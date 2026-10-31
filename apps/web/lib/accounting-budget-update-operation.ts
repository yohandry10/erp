import { readBudgetDetail, type BudgetRow } from './accounting-budget-read'
import { budgetCreateIntentKey, readBudgetCreateIntent, newBudgetCreateIntent, type BudgetCreateContext, type BudgetCreateScope } from './accounting-budget-create-operation'
export type BudgetUpdateScope=BudgetCreateScope
export type BudgetUpdatePayload={monto_presupuestado:number;notas:string;estado:'ACTIVO'|'BLOQUEADO'|'CERRADO';expected_snapshot:BudgetRow}
export type BudgetUpdateIntent=BudgetUpdateScope&{version:1;createdAt:string;idempotencyKey:string;recordId:string;body:string;context:BudgetCreateContext}
const object=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const exact=(v:Record<string,any>,keys:string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.prototype.hasOwnProperty.call(v,k))
const equal=(a:unknown,b:unknown):boolean=>{
 if(a===b)return true
 if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((value,i)=>equal(value,b[i]))
 if(!object(a)||!object(b)||Object.keys(a).length!==Object.keys(b).length)return false
 return Object.keys(a).every(k=>Object.prototype.hasOwnProperty.call(b,k)&&equal(a[k],b[k]))
}
function invalid():never{throw new Error('No se pudo recuperar la edición pendiente del presupuesto. Sus datos se conservan sin reemplazarlos.')}
export function budgetUpdateIntentKey(scope:BudgetUpdateScope){budgetCreateIntentKey(scope);return `erp.accounting.budget-update.pending.v1.${scope.tenantId}:${scope.actorId}`}
export function readBudgetUpdatePayload(value:unknown,scope:BudgetUpdateScope,id:string):BudgetUpdatePayload{
 if(!object(value)||!exact(value,['monto_presupuestado','notas','estado','expected_snapshot'])||typeof value.monto_presupuestado!=='number'||!Number.isFinite(value.monto_presupuestado)||value.monto_presupuestado<=0||!Number.isSafeInteger(Math.round(value.monto_presupuestado*100))||Math.abs(value.monto_presupuestado*100-Math.round(value.monto_presupuestado*100))>.00001||typeof value.notas!=='string'||value.notas!==value.notas.trim()||value.notas.length>10000||!['ACTIVO','BLOQUEADO','CERRADO'].includes(value.estado))invalid()
 readBudgetDetail({success:true,data:value.expected_snapshot},scope.tenantId,id)
 return value as BudgetUpdatePayload
}
function createAdapter(p:BudgetUpdatePayload){return {centro_costo_id:p.expected_snapshot.centro_costo_id,cuenta_id:p.expected_snapshot.cuenta_id,periodo_contable_id:p.expected_snapshot.periodo_contable_id,monto_presupuestado:p.monto_presupuestado,notas:p.notas,estado:'ACTIVO' as const}}
export function newBudgetUpdateIntent(payload:BudgetUpdatePayload,scope:BudgetUpdateScope,context:BudgetCreateContext):BudgetUpdateIntent{
 const p=readBudgetUpdatePayload(payload,scope,payload.expected_snapshot.id),base=newBudgetCreateIntent(createAdapter(p),scope,context)
 return {...base,recordId:p.expected_snapshot.id,body:JSON.stringify(p)}
}
export function readBudgetUpdateIntent(raw:string|null,scope:BudgetUpdateScope):BudgetUpdateIntent|null{
 if(raw===null)return null
 try{
  if(raw.length>131072)invalid();const v=JSON.parse(raw)
  if(!object(v)||!exact(v,['version','tenantId','actorId','createdAt','idempotencyKey','recordId','body','context'])||typeof v.body!=='string'||v.body.length>65536)invalid()
  const payload=readBudgetUpdatePayload(JSON.parse(v.body),scope,v.recordId);const adapted:Record<string,any>={...v,body:JSON.stringify(createAdapter(payload))};delete adapted.recordId;readBudgetCreateIntent(JSON.stringify(adapted),scope)
  return v as BudgetUpdateIntent
 }catch{invalid()}
}
export function confirmBudgetUpdated(response:unknown,intent:BudgetUpdateIntent){
 const payload=readBudgetUpdatePayload(JSON.parse(intent.body),intent,intent.recordId),row=readBudgetDetail(response,intent.tenantId,intent.recordId)
 if(!object(response)||!object(response.data))invalid();const raw=response.data,op=raw.operation
 if(!object(op)||['cached','queued','offline','pending'].some(k=>op[k]!==undefined&&op[k]!==false)||op.success!==true||op.action!=='UPDATE'||op.id!==intent.recordId||typeof op.operation_id!=='string'||!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(op.operation_id)||op.tenant_id!==intent.tenantId||op.actor_id!==intent.actorId||op.idempotency_key!==intent.idempotencyKey||typeof op.idempotent!=='boolean'||typeof op.request_fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(op.request_fingerprint)||!equal(op.payload,payload))throw new Error('Se necesita la identidad y fotografía completas de la edición.')
 if(row.monto_presupuestado!==payload.monto_presupuestado||row.estado!==payload.estado||row.notas!==(payload.notas||null)||raw.updated_by!==intent.actorId||Date.parse(row.updated_at)<Date.parse(payload.expected_snapshot.updated_at))throw new Error('El recibo no coincide con los cambios conservados del presupuesto.')
 const ignored=['monto_presupuestado','monto_disponible','porcentaje_ejecutado','notas','estado','updated_by','updated_at','operation']
 const before=Object.fromEntries(Object.entries(payload.expected_snapshot).filter(([k])=>!ignored.includes(k))),after=Object.fromEntries(Object.entries(raw).filter(([k])=>!ignored.includes(k)))
 if(!equal(before,after))throw new Error('El recibo cambió campos ajenos a la edición pendiente.')
 return row
}

export function confirmBudgetUpdateResolution(response:unknown,intent:BudgetUpdateIntent):'COMMITTED'|'ABANDONED'{
 if(!object(response)||response.success!==true||['cached','queued','offline','pending'].some(k=>response[k]!==undefined&&response[k]!==false)||!object(response.data)||['cached','queued','offline','pending'].some(k=>response.data[k]!==undefined&&response.data[k]!==false))throw new Error('No se pudo verificar la resolución completa de la edición. Sus datos se conservan.')
 const result=response.data
 if(result.resolution==='COMMITTED'){
  confirmBudgetUpdated(result.receipt,intent)
  return 'COMMITTED'
 }
 const op=result.receipt,payload=readBudgetUpdatePayload(JSON.parse(intent.body),intent,intent.recordId)
 if(result.resolution!=='ABANDONED'||!object(op)||['cached','queued','offline','pending'].some(k=>op[k]!==undefined&&op[k]!==false)||op.success!==true||op.action!=='ABANDON_UPDATE'||op.id!==intent.recordId||typeof op.operation_id!=='string'||!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(op.operation_id)||op.tenant_id!==intent.tenantId||op.actor_id!==intent.actorId||op.idempotency_key!==intent.idempotencyKey||typeof op.idempotent!=='boolean'||typeof op.request_fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(op.request_fingerprint)||!equal(op.payload,payload)||typeof op.abandoned_at!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(op.abandoned_at)||!Number.isFinite(Date.parse(op.abandoned_at)))throw new Error('Se necesita el recibo completo que bloquea esta edición pendiente. Sus datos se conservan.')
 return 'ABANDONED'
}
