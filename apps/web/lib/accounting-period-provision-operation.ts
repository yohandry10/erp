import { confirmPeriodProvision, periodProvisionDays, type PeriodProvisionReceipt } from './accounting-period-provision'

export type ProvisionScope = { tenantId: string; actorId: string }
export type ProvisionPayload = { periodo: string; periodoId: string; diasVencido: number }
export type ProvisionIntent = ProvisionScope & { version: 1; createdAt: string; idempotencyKey: string; payload: ProvisionPayload }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const fail = (): never => { throw new Error('La estimación no está confirmada. Se conservan el período y el criterio para reintentar con conexión.') }
const object = (v: unknown): Record<string, any> => { if (!v || typeof v !== 'object' || Array.isArray(v)) return fail(); return v as Record<string, any> }
const exactKeys = (v: Record<string, any>, keys: string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(v, k))
const date = (v: unknown): string => { if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString().slice(0,10) !== v) return fail(); return v }
const timestamp = (v: unknown) => { if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(v) || !Number.isFinite(Date.parse(v))) return fail() }
const cents = (v: unknown): number => {
  if (!['number','string'].includes(typeof v) || !/^\d+(?:\.\d{1,2})?$/.test(String(v))) return fail()
  const n = Number(v), c = Math.round(n*100)
  if (!Number.isFinite(n) || !Number.isSafeInteger(c)) return fail()
  return c
}
export function provisionIntentKey(scope: ProvisionScope): string {
  if (!uuid.test(scope.tenantId) || !uuid.test(scope.actorId)) return fail()
  return `erp.accounting.period-provision.pending.v1.${scope.tenantId}:${scope.actorId}`
}
export function readProvisionIntent(raw: string | null, scope: ProvisionScope): ProvisionIntent | null {
  provisionIntentKey(scope)
  if (raw === null) return null
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { return fail() }
  const v = object(parsed), p = object(v.payload)
  if (!exactKeys(v,['version','createdAt','idempotencyKey','tenantId','actorId','payload']) ||
      !exactKeys(p,['periodo','periodoId','diasVencido']) || v.version !== 1 || v.tenantId !== scope.tenantId || v.actorId !== scope.actorId ||
      typeof p.periodo !== 'string' || !/^(20[0-9]{2}|21[0-9]{2}|2200)-(0[1-9]|1[0-2])$/.test(p.periodo) || !uuid.test(p.periodoId) ||
      typeof p.diasVencido !== 'number' || periodProvisionDays(String(p.diasVencido)) !== p.diasVencido) return fail()
  if (typeof v.createdAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v.createdAt) || !Number.isFinite(Date.parse(v.createdAt)) || new Date(v.createdAt).toISOString() !== v.createdAt) return fail()
  if (typeof v.idempotencyKey !== 'string' || !v.idempotencyKey.startsWith('period-provision:') || !uuid.test(v.idempotencyKey.slice('period-provision:'.length))) return fail()
  return v as ProvisionIntent
}
export function newProvisionIntent(payload: ProvisionPayload, scope: ProvisionScope): ProvisionIntent {
  return readProvisionIntent(JSON.stringify({version:1,...scope,createdAt:new Date().toISOString(),idempotencyKey:`period-provision:${crypto.randomUUID()}`,payload:{...payload}}),scope) || fail()
}
export function confirmProvisionOperation(response: unknown, intent: ProvisionIntent, scope: ProvisionScope): PeriodProvisionReceipt {
  if (!readProvisionIntent(JSON.stringify(intent),scope)) return fail()
  const p = intent.payload, receipt = confirmPeriodProvision(response,p,scope.tenantId)
  const data = object(object(response).data)
  if (data.tenant_id !== scope.tenantId || data.actor_id !== scope.actorId || data.periodo_id !== p.periodoId ||
      data.idempotency_key !== intent.idempotencyKey || !uuid.test(data.operation_id) || typeof data.idempotent !== 'boolean' ||
      typeof data.request_fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(data.request_fingerprint) || data.moneda !== 'PEN') return fail()
  const echo = object(data.payload)
  if (!exactKeys(echo,['periodo','dias_vencido']) || echo.periodo !== p.periodo || echo.dias_vencido !== p.diasVencido) return fail()
  const [year, month] = p.periodo.split('-').map(Number), cut = new Date(Date.UTC(year,month,0)).toISOString().slice(0,10)
  if (date(data.corte) !== cut || !Array.isArray(data.detalles) || !Array.isArray(data.provisiones)) return fail()
  if (receipt.documentos === 0) {
    if (data.asiento !== null || data.detalles.length !== 0 || data.provisiones.length !== 0) return fail()
    return receipt
  }
  const amount = cents(receipt.monto_provisionado), journal = object(data.asiento)
  if (journal.id !== receipt.asiento_id || journal.tenant_id !== scope.tenantId || journal.estado !== 'CONFIRMADO' ||
      journal.created_by !== scope.actorId || journal.confirmado_por !== scope.actorId || journal.origen !== 'PROVISION_COBRANZA_DUDOSA' ||
      journal.referencia !== `PCD-${p.periodo}` || !uuid.test(journal.source_event_id) || typeof journal.fecha !== 'string' ||
      journal.fecha.slice(0,10) !== cut || !Number.isFinite(Date.parse(journal.fecha)) ||
      cents(journal.total_debe) !== amount || cents(journal.total_haber) !== amount || data.detalles.length !== 2 || data.provisiones.length !== receipt.documentos) return fail()
  timestamp(journal.created_at); timestamp(journal.updated_at)
  const lineIds = new Set<string>(), codes = new Set<string>()
  for (const value of data.detalles) {
    const line = object(value), code = String(line.cuenta_codigo).trim()
    if (!uuid.test(line.id) || lineIds.has(line.id) || line.tenant_id !== scope.tenantId || line.asiento_id !== journal.id ||
        !uuid.test(line.cuenta_id) || !['68','19'].includes(code) || codes.has(code) ||
        cents(line.debe) !== (code === '68' ? amount : 0) || cents(line.haber) !== (code === '19' ? amount : 0)) return fail()
    timestamp(line.created_at); timestamp(line.updated_at); lineIds.add(line.id); codes.add(code)
  }
  let sum = 0
  const provisionIds = new Set<string>(), receivables = new Set<string>()
  for (const value of data.provisiones) {
    const row = object(value), due = date(row.fecha_vencimiento), overdue = (Date.parse(cut)-Date.parse(due))/86400000
    const valueCents = cents(row.monto_provisionado)
    if (!uuid.test(row.id) || provisionIds.has(row.id) || !uuid.test(row.cuenta_por_cobrar_id) || receivables.has(row.cuenta_por_cobrar_id) ||
        !uuid.test(row.cliente_id) || row.tenant_id !== scope.tenantId || row.asiento_id !== journal.id || row.periodo !== p.periodo ||
        row.moneda !== 'PEN' || typeof row.numero_documento !== 'string' || !row.numero_documento.trim() ||
        !Number.isInteger(row.dias_vencido) || row.dias_vencido !== overdue || overdue < p.diasVencido || valueCents <= 0) return fail()
    timestamp(row.created_at); timestamp(row.updated_at)
    provisionIds.add(row.id); receivables.add(row.cuenta_por_cobrar_id); sum += valueCents
  }
  if (!Number.isSafeInteger(sum) || sum !== amount) return fail()
  return receipt
}
