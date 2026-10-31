import { readPayrollCalculationIntent,confirmPayrollCalculationOperation,type PayrollCalculationIntent,type PayrollCalculationScope } from './payroll-calculation-operation'
export type PayrollCreationIntent = PayrollCalculationScope & {
  version:1;createdAt:string;idempotencyKey:string;calculationKey:string;body:string;childBody:string;
  employees:PayrollCalculationIntent['employees'];parentReceipt?:any
}
const object=(v:any):v is Record<string,any>=>!!v && typeof v==='object' && !Array.isArray(v)
const exact=(v:any,keys:string[])=>object(v) && Object.keys(v).every(k=>keys.includes(k))
const uuid=(v:any):v is string=>typeof v==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
const canonical=(v:any):string=>JSON.stringify(v,(_key,value)=>object(value)?Object.fromEntries(Object.keys(value).sort().map(k=>[k,value[k]])):value)
const live=(v:any)=>object(v) && ['cached','queued','offline','pending','from_cache'].every(k=>v[k]===undefined || v[k]===false)
const stamp=(v:any)=>typeof v==='string' && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v))
const fail=():never=>{throw new Error('No se pudo confirmar la solicitud original de alta y cálculo. Sus datos se conservan para recuperar o conciliar.')}
export function payrollCreationIntentKey(scope:PayrollCalculationScope) {
  if (!uuid(scope.tenantId) || !uuid(scope.actorId)) return fail()
  return `erp.payroll.creation.pending.v1.${scope.tenantId}:${scope.actorId}`
}
export function payrollCreationRequest(intent:PayrollCreationIntent) {
  let body:any;try {body=JSON.parse(intent.body)} catch {return fail()}
  if (!exact(body,['periodo','observaciones','metadata','pais_codigo','moneda','idempotency_key','calculo_idempotency_key','calculo_original'])
    || !/^\d{4}-(0[1-9]|1[0-2])$/.test(body.periodo || '') || !['PE','AR','CO'].includes(body.pais_codigo)
    || body.moneda!==({PE:'PEN',AR:'ARS',CO:'COP'} as Record<string,string>)[body.pais_codigo]
    || body.idempotency_key!==intent.idempotencyKey || body.calculo_idempotency_key!==intent.calculationKey
    || !uuid(body.idempotency_key) || !uuid(body.calculo_idempotency_key) || body.idempotency_key===body.calculo_idempotency_key
    || body.observaciones!==undefined && body.observaciones!==null && typeof body.observaciones!=='string'
    || typeof body.observaciones==='string' && body.observaciones.length>1000
    || body.metadata!==undefined && body.metadata!==null && !object(body.metadata)
    || !object(body.calculo_original) || JSON.stringify(body.calculo_original)!==intent.childBody) return fail()
  readPayrollCalculationIntent(JSON.stringify({version:1,tenantId:intent.tenantId,actorId:intent.actorId,createdAt:intent.createdAt,idempotencyKey:intent.calculationKey,body:intent.childBody,
    payroll:{id:intent.idempotencyKey,period:body.periodo,currency:body.moneda},employees:intent.employees}),intent)
  return body
}
export function confirmPayrollCreationOperation(response:any,intent:PayrollCreationIntent) {
  const body=payrollCreationRequest(intent),receipt=object(response?.data) && response.data.success===true?response.data:response,op=receipt?.creation_operation
  if (!live(response) || response.success!==true || !live(receipt) || receipt.success!==true || typeof receipt.idempotent!=='boolean'
    || !live(op) || op.version!==1 || !['CREATE_WITH_CALCULATION','ABANDON_CREATION'].includes(op.action) || !uuid(op.operation_id)
    || op.idempotency_key!==intent.idempotencyKey || op.calculation_key!==intent.calculationKey || op.tenant_id!==intent.tenantId || op.actor_id!==intent.actorId
    || canonical(op.request)!==canonical(body) || !/^[0-9a-f]{64}$/.test(op.request_fingerprint || '') || !stamp(op.confirmed_at)) return fail()
  if (op.action==='ABANDON_CREATION') {
    if (op.planilla_id!==null || ['id','tenant_id','periodo','pais_codigo','moneda','estado','estado_pago','metadata'].some(k=>receipt[k]!==undefined)) return fail()
    return {action:'ABANDON_CREATION' as const,receipt}
  }
  const metadata={...(body.metadata || {}),...(body.observaciones?{observaciones:body.observaciones.trim()}: {})}
  if (!uuid(receipt.id) || receipt.id!==op.planilla_id || receipt.tenant_id!==intent.tenantId || receipt.periodo!==body.periodo
    || receipt.pais_codigo!==body.pais_codigo || receipt.moneda!==body.moneda || receipt.estado!=='borrador' || receipt.estado_pago!=='pendiente'
    || !object(receipt.metadata) || receipt.metadata.creada_por!==intent.actorId || !stamp(receipt.metadata.creada_en)
    || canonical(Object.fromEntries(Object.entries(receipt.metadata).filter(([k])=>!['creada_por','creada_en'].includes(k))))!==canonical(Object.fromEntries(Object.entries(metadata).filter(([k])=>!['creada_por','creada_en'].includes(k))))
    || canonical(op.normalized_planilla)!==canonical({periodo:body.periodo,pais_codigo:body.pais_codigo,moneda:body.moneda,metadata})) return fail()
  return {action:'CREATE_WITH_CALCULATION' as const,receipt}
}
export function readPayrollCreationIntent(raw:string|null,scope:PayrollCalculationScope):PayrollCreationIntent|null {
  payrollCreationIntentKey(scope);if (raw===null)return null
  let v:any;try {v=JSON.parse(raw)} catch {return fail()}
  if (!exact(v,['version','tenantId','actorId','createdAt','idempotencyKey','calculationKey','body','childBody','employees','parentReceipt']) || v.version!==1
    || v.tenantId!==scope.tenantId || v.actorId!==scope.actorId || !uuid(v.idempotencyKey) || !uuid(v.calculationKey)
    || !stamp(v.createdAt) || new Date(v.createdAt).toISOString()!==v.createdAt || Date.parse(v.createdAt)>Date.now()+300000
    || typeof v.body!=='string' || v.body.length>1000000 || typeof v.childBody!=='string' || v.childBody.length>1000000) return fail()
  payrollCreationRequest(v)
  if (v.parentReceipt!==undefined && confirmPayrollCreationOperation(v.parentReceipt,v).action!=='CREATE_WITH_CALCULATION') return fail()
  return v
}
export function newPayrollCreationIntent(input:any,scope:PayrollCalculationScope,employees:any[]):PayrollCreationIntent {
  if (!Array.isArray(employees)) return fail()
  const idempotencyKey=crypto.randomUUID(),calculationKey=crypto.randomUUID(),body={...input,idempotency_key:idempotencyKey,calculo_idempotency_key:calculationKey}
  return readPayrollCreationIntent(JSON.stringify({version:1,...scope,createdAt:new Date().toISOString(),idempotencyKey,calculationKey,body:JSON.stringify(body),childBody:JSON.stringify(body.calculo_original),
    employees:employees.map(e=>({id:e.id,name:`${e.nombres || ''} ${e.apellidos || ''}`.trim(),document:e.numero_documento}))}),scope)!
}
export function payrollCreationChildIntent(intent:PayrollCreationIntent):PayrollCalculationIntent {
  const original=readPayrollCreationIntent(JSON.stringify(intent),intent)!,parent=original.parentReceipt
  if (!parent || confirmPayrollCreationOperation(parent,original).action!=='CREATE_WITH_CALCULATION') return fail()
  return readPayrollCalculationIntent(JSON.stringify({version:1,tenantId:original.tenantId,actorId:original.actorId,createdAt:original.createdAt,idempotencyKey:original.calculationKey,body:original.childBody,
    payroll:{id:parent.id,period:parent.periodo,currency:parent.moneda},employees:original.employees}),original)!
}
export function confirmPayrollCreationChild(response:any,intent:PayrollCreationIntent) {return confirmPayrollCalculationOperation(response,payrollCreationChildIntent(intent))}
export function payrollCreationArchiveKey(intent:PayrollCreationIntent,stage:'creation'|'resolved') {return `erp.payroll.creation.${stage}.v1.${intent.tenantId}:${intent.actorId}:${intent.idempotencyKey}`}
export function samePayrollCreationReceipt(a:any,b:any) {
  if (!object(a) || !object(b)) return false
  const omit=(v:any)=>Object.fromEntries(Object.entries(v).filter(([key])=>key!=='idempotent'))
  return canonical(omit(a))===canonical(omit(b))
}
