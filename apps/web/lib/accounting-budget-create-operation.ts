import { readBudgetDetail } from './accounting-budget-read'
export type BudgetCreateScope = {tenantId:string;actorId:string}
export type BudgetCreatePayload = {centro_costo_id:string;cuenta_id:string;periodo_contable_id:string;monto_presupuestado:number;notas:string;estado:'ACTIVO'}
export type BudgetReference = {id:string;code:string;name:string}
export type BudgetCreateContext = {center:BudgetReference;account:BudgetReference;period:{id:string;anio:number;mes:number;estado:'ABIERTO'}}
export type BudgetCreateIntent = BudgetCreateScope & {version:1;createdAt:string;idempotencyKey:string;body:string;context:BudgetCreateContext}
const object=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
const exact=(v:Record<string,any>,fields:string[])=>Object.keys(v).length===fields.length&&fields.every(k=>Object.prototype.hasOwnProperty.call(v,k))
const text=(v:unknown):v is string=>typeof v==='string'&&v===v.trim()&&!!v
const money=(v:unknown):v is number=>typeof v==='number'&&v>0&&Number.isFinite(v)&&Number.isSafeInteger(Math.round(v*100))&&Math.abs(v*100-Math.round(v*100))<.00001
const scopeValid=(s:BudgetCreateScope)=>uuid(s.tenantId)&&uuid(s.actorId)
const timestamp=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v.slice(0,10)
function invalid():never{throw new Error('No se pudo recuperar el alta pendiente del presupuesto. Sus datos se conservan sin reemplazarlos.')}
export function budgetCreateIntentKey(s:BudgetCreateScope){if(!scopeValid(s))invalid();return `erp.accounting.budget-create.pending.v1.${s.tenantId}:${s.actorId}`}
export function readBudgetCreatePayload(v:unknown):BudgetCreatePayload{
 if(!object(v)||!exact(v,['centro_costo_id','cuenta_id','periodo_contable_id','monto_presupuestado','notas','estado'])||!uuid(v.centro_costo_id)||!uuid(v.cuenta_id)||!uuid(v.periodo_contable_id)||!money(v.monto_presupuestado)||typeof v.notas!=='string'||v.notas!==v.notas.trim()||v.notas.length>10000||v.estado!=='ACTIVO')invalid()
 return v as BudgetCreatePayload
}
function contextValid(v:unknown,p:BudgetCreatePayload):v is BudgetCreateContext{
 if(!object(v)||!exact(v,['center','account','period']))return false
 for(const [key,id] of [['center',p.centro_costo_id],['account',p.cuenta_id]]){const r=v[key];if(!object(r)||!exact(r,['id','code','name'])||r.id!==id||!text(r.code)||!text(r.name))return false}
 const r=v.period;return object(r)&&exact(r,['id','anio','mes','estado'])&&r.id===p.periodo_contable_id&&Number.isInteger(r.anio)&&r.anio>=1900&&r.anio<=9999&&Number.isInteger(r.mes)&&r.mes>=1&&r.mes<=12&&r.estado==='ABIERTO'
}
export function newBudgetCreateIntent(payload:BudgetCreatePayload,scope:BudgetCreateScope,context:BudgetCreateContext):BudgetCreateIntent{
 const p=readBudgetCreatePayload(payload);if(!scopeValid(scope)||!contextValid(context,p))invalid()
 return {version:1,...scope,createdAt:new Date().toISOString(),idempotencyKey:crypto.randomUUID(),body:JSON.stringify(p),context}
}
export function readBudgetCreateIntent(raw:string|null,scope:BudgetCreateScope):BudgetCreateIntent|null{
 if(raw===null)return null
 try{
  if(!scopeValid(scope)||raw.length>131072)invalid();const v=JSON.parse(raw)
  if(!object(v)||!exact(v,['version','tenantId','actorId','createdAt','idempotencyKey','body','context'])||v.version!==1||v.tenantId!==scope.tenantId||v.actorId!==scope.actorId||!uuid(v.idempotencyKey)||!timestamp(v.createdAt)||typeof v.body!=='string'||v.body.length>65536)invalid()
  const payload=readBudgetCreatePayload(JSON.parse(v.body));if(!contextValid(v.context,payload))invalid();return v as BudgetCreateIntent
 }catch{invalid()}
}
export function confirmBudgetCreated(response:unknown,intent:BudgetCreateIntent){
 const payload=readBudgetCreatePayload(JSON.parse(intent.body))
 if(!object(response)||!object(response.data)||!uuid(response.data.id))throw new Error('Se necesita el recibo completo y vivo del presupuesto registrado.')
 const row=readBudgetDetail(response,intent.tenantId,response.data.id),raw=response.data
 const op=raw.operation
 if(!object(op)||['cached','queued','offline','pending'].some(k=>op[k]!==undefined&&op[k]!==false)||op.success!==true||op.action!=='CREATE'||op.id!==row.id||!uuid(op.operation_id)||op.tenant_id!==intent.tenantId||op.actor_id!==intent.actorId||op.idempotency_key!==intent.idempotencyKey||typeof op.idempotent!=='boolean'||typeof op.request_fingerprint!=='string'||!/^([a-f0-9]{64})$/.test(op.request_fingerprint)||!object(op.payload))throw new Error('Se necesita la identidad completa de la operación de alta.')
 const echoed=readBudgetCreatePayload(op.payload)
 if(Object.entries(payload).some(([key,value])=>echoed[key as keyof BudgetCreatePayload]!==value))throw new Error('La operación no confirma los datos conservados del presupuesto.')
 if(raw.created_by!==intent.actorId||raw.updated_by!==intent.actorId||row.centro_costo_id!==payload.centro_costo_id||row.cuenta_id!==payload.cuenta_id||row.periodo_contable_id!==payload.periodo_contable_id||row.monto_presupuestado!==payload.monto_presupuestado||row.notas!==(payload.notas||null)||row.estado!=='ACTIVO'||row.monto_ejecutado!==0||row.monto_comprometido!==0||row.monto_disponible!==payload.monto_presupuestado||row.porcentaje_ejecutado!==0)throw new Error('El recibo no coincide con el alta pendiente. Se conserva para verificar su resultado.')
 return row
}