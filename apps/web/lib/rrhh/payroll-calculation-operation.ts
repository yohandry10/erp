export type PayrollCalculationScope = { tenantId: string; actorId: string }
export type PayrollCalculationIntent = PayrollCalculationScope & {
  version: 1; createdAt: string; idempotencyKey: string; body: string;
  payroll: { id: string; period: string; currency: string };
  employees: { id: string; name: string; document: string }[];
}
const object = (v: any): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v)
const exact = (v: any, keys: string[]) => object(v) && Object.keys(v).every(k => keys.includes(k))
const uuid = (v: any): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
const known = (v: any) => typeof v === 'number' && Number.isFinite(v) && v >= 0
const operational = ['dias_trabajados','horas_extras_25','horas_extras_35','tardanzas_minutos','faltas'] as const
const amounts = [['totalIngresos','total_ingresos'],['totalDescuentos','total_descuentos'],['totalAportes','total_aportes'],['totalNeto','neto_pagar']] as const
const fail = (): never => { throw new Error('No se pudo recuperar la solicitud de cálculo. Sus datos se conservan; reintente la recuperación con conexión.') }
const text = (v: any, max: number) => typeof v === 'string' && !!v.trim() && v.length <= max
const live = (v: any) => object(v) && ['cached','queued','offline','pending','from_cache'].every(k => v[k] === undefined || v[k] === false)
const canonical = (v: any): string => JSON.stringify(v,(_,value) => object(value) ? Object.fromEntries(Object.keys(value).sort().map(k => [k,value[k]])) : value)
export function payrollCalculationIntentKey(scope: PayrollCalculationScope) {
  if (!uuid(scope.tenantId) || !uuid(scope.actorId)) return fail()
  return `erp.payroll.calculation.pending.v1.${scope.tenantId}:${scope.actorId}`
}
export function payrollCalculationRequest(intent: PayrollCalculationIntent) {
  let body: any;try { body=JSON.parse(intent.body) } catch { return fail() }
  if (!exact(body,['empleados','eps_cobertura']) || !Array.isArray(body.empleados) || !body.empleados.length) return fail()
  const ids=new Set<string>()
  for (const e of body.empleados) {
    if (!exact(e,['empleado_id',...operational,'bonos_adicionales','horas_recargo_nocturno','horas_dominicales_festivas','remuneracion_gratificacion_previa'])
      || !uuid(e.empleado_id) || ids.has(e.empleado_id.toLowerCase()) || !operational.every(k => known(e[k]))
      || !['dias_trabajados','tardanzas_minutos','faltas'].every(k => Number.isSafeInteger(e[k]))
      || e.dias_trabajados>30 || e.faltas>30
      || ['bonos_adicionales','horas_recargo_nocturno','horas_dominicales_festivas'].some(k => e[k] !== undefined && !known(e[k]))
      || e.remuneracion_gratificacion_previa !== undefined && !object(e.remuneracion_gratificacion_previa)) return fail()
    ids.add(e.empleado_id.toLowerCase())
  }
  if (body.eps_cobertura !== undefined && !object(body.eps_cobertura)) return fail()
  return body
}
export function readPayrollCalculationIntent(raw: string | null, scope: PayrollCalculationScope): PayrollCalculationIntent | null {
  payrollCalculationIntentKey(scope);if (raw === null) return null
  let v: any;try { v=JSON.parse(raw) } catch { return fail() }
  if (!exact(v,['version','tenantId','actorId','createdAt','idempotencyKey','body','payroll','employees']) || v.version !== 1
    || v.tenantId !== scope.tenantId || v.actorId !== scope.actorId || !uuid(v.idempotencyKey)
    || typeof v.createdAt !== 'string' || !Number.isFinite(Date.parse(v.createdAt)) || new Date(v.createdAt).toISOString() !== v.createdAt || Date.parse(v.createdAt)>Date.now()+300000
    || typeof v.body !== 'string' || v.body.length>1000000
    || !exact(v.payroll,['id','period','currency']) || !uuid(v.payroll.id) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(v.payroll.period || '')
    || !/^[A-Z]{3}$/.test(v.payroll.currency || '') || !Array.isArray(v.employees)) return fail()
  const request=payrollCalculationRequest(v),requested=new Set<string>(request.empleados.map((e: any) => e.empleado_id.toLowerCase()))
  if (v.employees.length !== requested.size || v.employees.some((e: any) => !exact(e,['id','name','document']) || !uuid(e.id) || !text(e.name,256) || !text(e.document,64)
    || !requested.delete(e.id.toLowerCase())) || requested.size) return fail()
  return v
}
export function newPayrollCalculationIntent(body: any, scope: PayrollCalculationScope, header: any, employees: any[]): PayrollCalculationIntent {
  if (header?.tenant_id !== scope.tenantId || header?.estado !== 'borrador' || !Array.isArray(employees)) return fail()
  const created={version:1,...scope,createdAt:new Date().toISOString(),idempotencyKey:crypto.randomUUID(),body:JSON.stringify(body),
    payroll:{id:header.id,period:header.periodo,currency:header.moneda},employees:employees.map(e => ({id:e.id,name:`${e.nombres || ''} ${e.apellidos || ''}`.trim(),document:e.numero_documento}))}
  return readPayrollCalculationIntent(JSON.stringify(created),scope)!
}
// Exact decimal HALF_UP from the number's JSON representation, matching the SQL425/Decimal validator.
function roundedCents(value: number): number {
  if (!known(value)) return fail()
  const match=String(value).match(/^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/);if (!match) return fail()
  const digits=BigInt(match[1]+(match[2] || '')),scale=(match[2] || '').length-Number(match[3] || 0)-2
  const divisor=scale>0 ? BigInt(10)**BigInt(scale) : BigInt(1)
  const cents=scale>0 ? (digits+divisor/BigInt(2))/divisor : digits*BigInt(10)**BigInt(-scale)
  const result=Number(cents);if (!Number.isSafeInteger(result)) return fail();return result
}
export function confirmPayrollCalculationOperation(response: any, intent: PayrollCalculationIntent) {
  const original=readPayrollCalculationIntent(JSON.stringify(intent),intent)!,request=payrollCalculationRequest(original)
  const receipt=object(response?.data) && response.data.success === true ? response.data : response,op=receipt?.calculation_operation
  const reject=(): never => { throw new Error('La respuesta no confirma la solicitud original completa. Se conserva para reintentar o conciliar.') }
  if (!live(response) || response.success !== true || !live(receipt) || receipt.success !== true || receipt.planillaId !== original.payroll.id
    || typeof receipt.idempotent !== 'boolean' || !live(op) || op.version !== 1 || !['CALCULATE','ABANDON_CALCULATION'].includes(op.action)
    || !uuid(op.operation_id) || op.idempotency_key !== original.idempotencyKey || op.tenant_id !== original.tenantId || op.actor_id !== original.actorId || op.planilla_id !== original.payroll.id
    || canonical(op.request) !== canonical(request) || !/^[0-9a-f]{64}$/.test(op.request_fingerprint || '')
    || typeof op.confirmed_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(op.confirmed_at) || !Number.isFinite(Date.parse(op.confirmed_at))) return reject()
  if (op.action === 'ABANDON_CALCULATION') {
    if (['totalEmpleados',...amounts.map(([field]) => field)].some(k => receipt[k] !== undefined)) return reject()
    return {action:'ABANDON_CALCULATION' as const,receipt}
  }
  if (!['ORDINARY','GRATIFICATION','EPS'].includes(op.rpc_kind) || !Array.isArray(op.calculated_employees) || receipt.totalEmpleados !== request.empleados.length
    || op.calculated_employees.length !== request.empleados.length || (op.rpc_kind === 'EPS' ? !object(op.eps_snapshot) : op.eps_snapshot !== null)) return reject()
  const requested=new Map<string,any>(request.empleados.map((e: any) => [e.empleado_id.toLowerCase(),e])),totals: Record<string,number>={}
  for (const row of op.calculated_employees) {
    if (!object(row) || !uuid(row.empleado_id)) return reject()
    const input=requested.get(row.empleado_id.toLowerCase());if (!input || !operational.every(k => known(row[k]) && row[k] === input[k])) return reject()
    requested.delete(row.empleado_id.toLowerCase())
    for (const [target,field] of amounts) {
      if (!known(row[field])) return reject()
      totals[target]=(totals[target] || 0)+roundedCents(row[field]);if (!Number.isSafeInteger(totals[target])) return reject()
    }
    if (!Array.isArray(row.conceptos) || row.conceptos.some((c: any) => !object(c) || !uuid(c.concepto_id) || !known(c.monto))
      || new Set(row.conceptos.map((c: any) => c.concepto_id)).size !== row.conceptos.length) return reject()
  }
  if (requested.size || amounts.some(([field]) => !known(receipt[field]) || receipt[field] !== roundedCents(receipt[field])/100 || roundedCents(receipt[field]) !== totals[field])) return reject()
  if (op.rpc_kind === 'EPS') {
    const eps=op.eps_snapshot
    if (eps.declarado_por !== original.actorId || eps.periodo_aplicacion !== original.payroll.period || !object(request.eps_cobertura)
      || ['periodo_cobertura','monto_pagado','fecha_pago','referencia','pago_oportuno'].some(k => eps[k] !== request.eps_cobertura[k])) return reject()
  }
  return {action:'CALCULATE' as const,receipt}
}
export function payrollCalculationArchiveKey(intent: PayrollCalculationIntent) { return `erp.payroll.calculation.resolved.v1.${intent.tenantId}:${intent.actorId}:${intent.idempotencyKey}` }
export function samePayrollCalculationReceipt(a: any,b: any) {
  if (!object(a) || !object(b)) return false
  const omit=(v: any) => Object.fromEntries(Object.entries(v).filter(([key]) => key !== 'idempotent'))
  return canonical(omit(a)) === canonical(omit(b))
}
