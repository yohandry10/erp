export type PayrollApprovalScope = { tenantId: string; actorId: string }
type Totals = { income: number; discounts: number; contributions: number; net: number }
type Employee = Totals & { id: string; name: string; document: string; days: number; concepts: { code: string; name: string; amount: number }[] }
type Snapshot = Totals & { id: string; period: string; currency: string; calculator: string; calculationFingerprint: string | null; employees: Employee[] }
type Receipt = { eventId: string; state: 'aprobada' | 'pagada'; idempotent: boolean }
export type PayrollApprovalIntent = PayrollApprovalScope & { version: 1; createdAt: string; stage: 'APPROVE' | 'VERIFY'; payroll: Snapshot; receipt?: Receipt }
const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v)
const exact = (v: unknown, keys: string[]): v is Record<string, any> => object(v) && Object.keys(v).every(k => keys.includes(k))
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
const text = (v: unknown, max: number): v is string => typeof v === 'string' && !!v.trim() && v === v.trim() && v.length <= max
const money = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100000000 && Math.abs(v * 100 - Math.round(v * 100)) < 0.00001
const cents = (v: number) => Math.round(v * 100)
const totalKeys = ['income','discounts','contributions','net'] as const
const validTotals = (v: any) => totalKeys.every(k => money(v[k])) && Math.abs(cents(v.income) - cents(v.discounts) - cents(v.net)) <= 1
const fail = (): never => { throw new Error('No se pudo recuperar la aprobación pendiente. Sus datos se conservan; reintente con conexión.') }
const isReceipt = (v: any): v is Receipt => exact(v,['eventId','state','idempotent']) && uuid(v.eventId) && ['aprobada','pagada'].includes(v.state) && typeof v.idempotent === 'boolean'
export function payrollApprovalIntentKey(scope: PayrollApprovalScope) {
  if (!uuid(scope.tenantId) || !uuid(scope.actorId)) return fail()
  return `erp.payroll.approval.pending.v1.${scope.tenantId}:${scope.actorId}`
}
export function readPayrollApprovalIntent(serialized: string | null, scope: PayrollApprovalScope): PayrollApprovalIntent | null {
  payrollApprovalIntentKey(scope); if (serialized === null) return null
  let v: any; try { v=JSON.parse(serialized) } catch { return fail() }
  if (!exact(v,['version','createdAt','stage','tenantId','actorId','payroll','receipt']) || v.version !== 1 || v.tenantId !== scope.tenantId || v.actorId !== scope.actorId
    || typeof v.createdAt !== 'string' || !Number.isFinite(Date.parse(v.createdAt)) || new Date(v.createdAt).toISOString() !== v.createdAt || Date.parse(v.createdAt)>Date.now()+300000
    || !['APPROVE','VERIFY'].includes(v.stage) || v.stage === 'VERIFY' && !isReceipt(v.receipt) || v.stage === 'APPROVE' && Object.hasOwn(v,'receipt')
    || !exact(v.payroll,['id','period','currency','calculator','calculationFingerprint','employees',...totalKeys]) || !uuid(v.payroll.id) || !uuid(v.payroll.calculator) || v.payroll.calculator === scope.actorId
    || !/^\d{4}-(0[1-9]|1[0-2])$/.test(v.payroll.period || '') || !/^[A-Z]{3}$/.test(v.payroll.currency || '') || !validTotals(v.payroll)
    || v.payroll.calculationFingerprint !== null && (typeof v.payroll.calculationFingerprint !== 'string' || !/^[0-9a-f]{64}$/i.test(v.payroll.calculationFingerprint))
    || !Array.isArray(v.payroll.employees) || !v.payroll.employees.length || v.payroll.employees.length > 10000) return fail()
  const ids = new Set<string>(); const totals = {income:0,discounts:0,contributions:0,net:0}
  for (const e of v.payroll.employees) {
    if (!exact(e,['id','name','document','days','concepts',...totalKeys]) || !uuid(e.id) || ids.has(e.id) || !text(e.name,500) || !text(e.document,100)
      || !validTotals(e) || !Number.isInteger(e.days) || e.days < 0 || e.days > 31 || !Array.isArray(e.concepts) || !e.concepts.length || e.concepts.length > 1000) return fail()
    ids.add(e.id);const codes=new Set<string>()
    for (const c of e.concepts) { if (!exact(c,['code','name','amount']) || !text(c.code,100) || codes.has(c.code) || !text(c.name,500) || !money(c.amount)) return fail();codes.add(c.code) }
    for (const k of totalKeys) totals[k]+=cents(e[k])
  }
  if (totalKeys.some(k=>totals[k]!==cents(v.payroll[k]))) return fail()
  return v as PayrollApprovalIntent
}
function photograph(scope: PayrollApprovalScope, header: any, details: any[]): Snapshot {
  if (header?.tenant_id !== scope.tenantId || !Array.isArray(details)) return fail()
  const amount = (v: unknown) => typeof v === 'number' || typeof v === 'string' && v.trim() !== '' ? Number(v) : Number.NaN
  const totals = (v: any) => ({income:amount(v.total_ingresos),discounts:amount(v.total_descuentos),contributions:amount(v.total_aportes),net:amount(v.neto_pagar ?? v.total_neto)})
  return {id:header.id,period:header.periodo,currency:header.moneda,calculator:header.metadata?.calculada_por,calculationFingerprint:header.metadata?.calculation_fingerprint ?? null,...totals(header),employees:details.map(d=>{
    if (d.tenant_id !== scope.tenantId || d.id_planilla !== header.id || !Array.isArray(d.empleado_planilla_conceptos)) return fail()
    return {id:d.id_empleado,name:`${d.empleados?.nombres || ''} ${d.empleados?.apellidos || ''}`.trim(),document:d.empleados?.numero_documento,days:d.dias_trabajados,...totals(d),concepts:d.empleado_planilla_conceptos.map((c:any)=>({code:c.conceptos_planilla?.codigo,name:c.conceptos_planilla?.nombre,amount:amount(c.monto)})).sort((a:any,b:any)=>String(a.code).localeCompare(String(b.code)))}
  }).sort((a,b)=>String(a.id).localeCompare(String(b.id)))}
}
export function createPayrollApprovalIntent(scope: PayrollApprovalScope, header: any, details: any[]) {
  if (header?.estado !== 'calculada') return fail()
  return readPayrollApprovalIntent(JSON.stringify({version:1,...scope,createdAt:new Date().toISOString(),stage:'APPROVE',payroll:photograph(scope,header,details)}),scope)!
}
export function confirmPayrollApprovalReceipt(response: unknown, intent: PayrollApprovalIntent, scope: PayrollApprovalScope): PayrollApprovalIntent {
  const frozen=readPayrollApprovalIntent(JSON.stringify(intent),scope)!
  const live=(v:any)=>object(v) && !['queued','cached','offline','pending'].some(k=>v[k]===true)
  const d=(response as any)?.data
  if (frozen.stage!=='APPROVE' || !live(response) || (response as any).success!==true || !live(d) || d.success!==true || d.planillaId!==frozen.payroll.id
    || !uuid(d.eventId) || !['aprobada','pagada'].includes(d.estado) || d.devengoEncolado!==true || typeof d.idempotent!=='boolean'
    || d.estado==='pagada' && d.idempotent!==true || d.tenant_id!==undefined && d.tenant_id!==scope.tenantId || d.actor_id!==undefined && d.actor_id!==scope.actorId) throw new Error('La respuesta no confirma la aprobación. Se conserva el intento para reintentar.')
  return readPayrollApprovalIntent(JSON.stringify({...frozen,stage:'VERIFY',receipt:{eventId:d.eventId,state:d.estado,idempotent:d.idempotent}}),scope)!
}
export function confirmApprovedPayrollPhotograph(header: any, details: any[], intent: PayrollApprovalIntent, scope: PayrollApprovalScope) {
  const frozen=readPayrollApprovalIntent(JSON.stringify(intent),scope)!
  if (frozen.stage!=='VERIFY' || !['aprobada','pagada'].includes(header?.estado) || frozen.receipt?.state==='pagada' && header.estado!=='pagada'
    || header?.metadata?.aprobada_por!==scope.actorId || header?.metadata?.devengo_event_id!==frozen.receipt?.eventId
    || !sameSnapshot(photograph(scope,header,details),frozen.payroll)) throw new Error('No se pudo verificar la planilla aprobada completa. La intención se conserva; reintente la consulta.')
  return header
}
const canonical = (v: any): string => JSON.stringify(v,(_,value)=>object(value)?Object.fromEntries(Object.keys(value).sort().map(k=>[k,value[k]])):value)
function sameSnapshot(a: Snapshot,b: Snapshot) {
  const normalized=(v:Snapshot)=>({...v,employees:[...v.employees].sort((x,y)=>x.id.localeCompare(y.id)).map(e=>({...e,concepts:[...e.concepts].sort((x,y)=>x.code.localeCompare(y.code))}))})
  return canonical(normalized(a))===canonical(normalized(b))
}
export function confirmPayrollApprovalSource(header: any,details: any[],intent: PayrollApprovalIntent,scope: PayrollApprovalScope) {
  const frozen=readPayrollApprovalIntent(JSON.stringify(intent),scope)!
  if (!['calculada','aprobada','pagada'].includes(header?.estado) || !sameSnapshot(photograph(scope,header,details),frozen.payroll)
    || header.estado!=='calculada' && header.metadata?.aprobada_por!==scope.actorId) throw new Error('La fotografía o el aprobador de la planilla cambió. El intento se conserva para conciliarlo.')
  return header
}
