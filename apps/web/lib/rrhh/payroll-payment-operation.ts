export type PayrollPaymentScope = { tenantId: string; actorId: string }
export type PayrollPaymentPayload = {
  metodo_pago: 'transferencia' | 'efectivo'; idempotency_key: string;
  cuenta_bancaria_id?: string; sesion_caja_id?: string; referencia?: string;
}
export type PayrollPaymentIntent = PayrollPaymentScope & {
  version: 1; createdAt: string; countryCode?: 'PE' | 'CO' | 'AR';
  payroll: { id: string; period: string; currency: string; total: number;
    employees: { id: string; name: string; document: string; net: number }[] };
  payload: PayrollPaymentPayload;
}
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v)
const exact = (v: unknown, keys: string[]): v is Record<string, any> => object(v) && Object.keys(v).every(k => keys.includes(k))
const text = (v: unknown, max: number): v is string => typeof v === 'string' && !!v.trim() && v === v.trim() && v.length <= max
const money = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100000000 && Math.abs(v * 100 - Math.round(v * 100)) < 0.00001
const cents = (v: number) => Math.round(v * 100)
const civil = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v + 'T00:00:00Z')) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v
const fingerprint = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{32}$/i.test(v)
const treasuryFingerprint = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{64}$/i.test(v)
const fail = (): never => { throw new Error('No se pudo recuperar el pago pendiente. Sus datos se conservan; reintente la misma operación con conexión.') }
const fiscalZones = { PE: 'America/Lima', CO: 'America/Bogota', AR: 'America/Argentina/Buenos_Aires' } as const
const country = (v: unknown): v is keyof typeof fiscalZones => typeof v === 'string' && Object.hasOwn(fiscalZones, v)
export function payrollPaymentCivilDate(countryCode = 'PE', instant = new Date()): string {
  if (!country(countryCode) || !Number.isFinite(instant.getTime())) return fail()
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en', { timeZone: fiscalZones[countryCode], year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant).map(p => [p.type, p.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}
export function payrollPaymentIntentKey(scope: PayrollPaymentScope) {
  if (!uuid(scope.tenantId) || !uuid(scope.actorId)) return fail()
  return `erp.payroll.payment.pending.v1.${scope.tenantId}:${scope.actorId}`
}
export function readPayrollPaymentIntent(serialized: string | null, scope: PayrollPaymentScope): PayrollPaymentIntent | null {
  payrollPaymentIntentKey(scope)
  if (serialized === null) return null
  let v: any
  try { v = JSON.parse(serialized) } catch { return fail() }
  if (!exact(v, ['version','createdAt','countryCode','tenantId','actorId','payroll','payload']) || v.version !== 1 || v.tenantId !== scope.tenantId || v.actorId !== scope.actorId
    || v.countryCode !== undefined && !country(v.countryCode)
    || typeof v.createdAt !== 'string' || !civil(v.createdAt.slice(0, 10)) || !/^\d{4}-\d{2}-\d{2}T/.test(v.createdAt) || !Number.isFinite(Date.parse(v.createdAt))
    || !exact(v.payroll, ['id','period','currency','total','employees']) || !uuid(v.payroll.id) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(v.payroll.period || '')
    || !/^[A-Z]{3}$/.test(v.payroll.currency || '') || !money(v.payroll.total) || v.payroll.total <= 0
    || !Array.isArray(v.payroll.employees) || !v.payroll.employees.length || v.payroll.employees.length > 10000) return fail()
  const ids = new Set<string>(); let total = 0
  for (const e of v.payroll.employees) {
    if (!exact(e, ['id','name','document','net']) || !uuid(e.id) || ids.has(e.id) || !text(e.name, 500) || !text(e.document, 100) || !money(e.net)) return fail()
    ids.add(e.id); total += cents(e.net)
  }
  if (total !== cents(v.payroll.total) || !exact(v.payload, ['metodo_pago','idempotency_key','cuenta_bancaria_id','sesion_caja_id','referencia']) || !uuid(v.payload.idempotency_key)) return fail()
  const p = v.payload
  if (p.metodo_pago === 'transferencia') {
    if (!uuid(p.cuenta_bancaria_id) || !text(p.referencia, 255) || Object.hasOwn(p, 'sesion_caja_id')) return fail()
  } else if (p.metodo_pago === 'efectivo') {
    if (!uuid(p.sesion_caja_id) || Object.hasOwn(p, 'cuenta_bancaria_id') || Object.hasOwn(p, 'referencia')) return fail()
  } else return fail()
  return v as PayrollPaymentIntent
}
export function createPayrollPaymentIntent(scope: PayrollPaymentScope, payroll: any, details: any[], payload: PayrollPaymentPayload, countryCode = 'PE'): PayrollPaymentIntent {
  if (payroll?.tenant_id !== scope.tenantId || payroll?.estado !== 'aprobada' || !Array.isArray(details) || !country(countryCode)) return fail()
  const intent: PayrollPaymentIntent = { version: 1, ...scope, createdAt: new Date().toISOString(), countryCode,
    payroll: { id: payroll.id, period: payroll.periodo, currency: payroll.moneda, total: Number(payroll.total_neto),
      employees: details.map(d => {
        if (d.tenant_id !== scope.tenantId || d.id_planilla !== payroll.id) return fail()
        return { id: d.id_empleado, name: `${d.empleados?.nombres || ''} ${d.empleados?.apellidos || ''}`.trim(), document: d.empleados?.numero_documento, net: Number(d.neto_pagar) }
      }) }, payload }
  return readPayrollPaymentIntent(JSON.stringify(intent), scope)!
}
export function confirmPayrollPayment(response: unknown, intent: PayrollPaymentIntent, scope: PayrollPaymentScope, countryCode?: string) {
  const frozen = readPayrollPaymentIntent(JSON.stringify(intent), scope)!
  const unconfirmed = (): never => { throw new Error('La respuesta no confirma el pago completo. Se conservan los datos para reintentar el mismo pago.') }
  const live = (v: any) => object(v) && !['queued','cached','offline','pending'].some(k => v[k] === true)
  if (!live(response) || (response as any).success !== true || !live((response as any).data)) return unconfirmed()
  const d = (response as any).data, p = frozen.payload, payroll = frozen.payroll
  const fiscalCountry = frozen.countryCode ?? countryCode ?? 'PE'
  if (!country(fiscalCountry) || countryCode !== undefined && countryCode !== fiscalCountry) return unconfirmed()
  // RPC495 devuelve una fecha civil del país. createdAt sigue siendo el mismo
  // instante UTC durable; nunca comparar ambos cortando la fecha UTC.
  // Los pendientes v1 anteriores conservan sus bytes y usan el país de su scope.
  const firstDay = payrollPaymentCivilDate(fiscalCountry, new Date(frozen.createdAt))
  const today = payrollPaymentCivilDate(fiscalCountry)
  if (d.success !== true || d.planillaId !== payroll.id || d.periodo !== payroll.period || d.metodoPago !== p.metodo_pago
    || typeof d.idempotent !== 'boolean' || !uuid(d.eventId) || !fingerprint(d.paymentFingerprint) || !treasuryFingerprint(d.treasuryFingerprint)
    || !civil(d.fechaPago) || d.fechaPago < firstDay || d.fechaPago > today
    || !money(d.totalPagado) || cents(d.totalPagado) !== cents(payroll.total) || d.empleadosPagados !== payroll.employees.length
    || !Number.isInteger(d.pagosInsertados) || ![payroll.employees.length, ...(d.idempotent ? [0] : [])].includes(d.pagosInsertados)
    || !Array.isArray(d.pagos) || d.pagos.length !== payroll.employees.length) return unconfirmed()
  const seenEmployees = new Set<string>(), seenPayments = new Set<string>()
  for (const row of d.pagos) {
    const employee = payroll.employees.find(e => e.id === row?.empleado_id)
    if (!employee || !uuid(row.id) || seenPayments.has(row.id) || seenEmployees.has(row.empleado_id) || !money(row.monto_neto) || cents(row.monto_neto) !== cents(employee.net)) return unconfirmed()
    seenPayments.add(row.id); seenEmployees.add(row.empleado_id)
  }
  if (p.metodo_pago === 'transferencia') {
    if (d.cuentaBancariaId !== p.cuenta_bancaria_id || !uuid(d.movimientoBancarioId) || d.sesionCajaId !== null || d.movimientoCajaId !== null) return unconfirmed()
  } else if (d.sesionCajaId !== p.sesion_caja_id || !uuid(d.movimientoCajaId) || d.cuentaBancariaId !== null || d.movimientoBancarioId !== null) return unconfirmed()
  // 495 no devuelve tenant, actor, referencia ni clave dentro del recibo. Su
  // identidad se ata a la planilla leída en vivo y al scope de la intención;
  // MD5 de pago y SHA-256 de tesorería se validan por forma, sin recálculo.
  if (d.tenant_id !== undefined && d.tenant_id !== scope.tenantId || d.actor_id !== undefined && d.actor_id !== scope.actorId) return unconfirmed()
  return d as { totalPagado: number; empleadosPagados: number; idempotent: boolean }
}
