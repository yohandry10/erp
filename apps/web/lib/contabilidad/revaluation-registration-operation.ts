import { readRevaluationSimulation } from './revaluation-read-contract'
import { consolidationLive } from './consolidation-read-contract'

export interface RevaluationRegistrationScope { tenantId: string; actorId: string }
export interface RevaluationRegistrationIntent extends RevaluationRegistrationScope {
  version: 1; createdAt: string; idempotencyKey: string; body: string
  source: { fuentes: any; posiciones_total: number; excluidas_total: number }
}
const object = (v: any) => !!v && typeof v === 'object' && !Array.isArray(v)
const uuid = (v: any) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
const exact = (v: any, fields: string[]) => object(v) && Object.keys(v).length === fields.length && fields.every(k => Object.prototype.hasOwnProperty.call(v, k))
const timestamp = (v: any) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v))
const number = (v: any) => (typeof v === 'number' || typeof v === 'string' && /^[1-9]\d*$/.test(v)) && Number.isSafeInteger(Number(v)) && Number(v) > 0
const scopeValid = (v: RevaluationRegistrationScope) => uuid(v.tenantId) && uuid(v.actorId)
function unknown(): never { throw new Error('No se pudo recuperar el registro pendiente de revaluación. Sus datos se conservan sin reemplazarlos.') }
function receiptUnknown(): never { throw new Error('Se necesita el recibo completo y coincidente de la revaluación. Se conserva el registro pendiente.') }
function canonical(v: any): string {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']'
  if (object(v)) return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}'
  return JSON.stringify(v) ?? 'undefined'
}
const sorted = (rows: any[]) => [...rows].sort((a, b) => String(a.tipo).localeCompare(String(b.tipo)) || String(a.documento_id).localeCompare(String(b.documento_id)))
const economic = (v: any) => ({ ...v, posiciones: sorted(v.posiciones), ...(v.excluidas !== undefined ? { excluidas: sorted(v.excluidas) } : {}) })
export function revaluationRegistrationKey(scope: RevaluationRegistrationScope) {
  if (!scopeValid(scope)) unknown()
  return `erp.accounting.fx-revaluation.pending.v1.${scope.tenantId}:${scope.actorId}`
}
const archivePrefix = (scope: RevaluationRegistrationScope) => revaluationRegistrationKey(scope).replace('.pending.', '.intents.') + '.'
const archiveKey = (intent: RevaluationRegistrationIntent) => archivePrefix(intent) + intent.idempotencyKey
export const revaluationRegistrationReceiptKey = (intent: RevaluationRegistrationIntent) => revaluationRegistrationKey(intent).replace('.pending.', '.receipts.') + '.' + intent.idempotencyKey
export function revaluationRegistrationPayload(intent: RevaluationRegistrationIntent) {
  const p = JSON.parse(intent.body)
  if (!exact(p, ['fecha', 'simulacion', 'idempotency_key']) || p.idempotency_key !== intent.idempotencyKey || typeof p.fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(p.fecha) || !object(p.simulacion) || !exact(intent.source, ['fuentes', 'posiciones_total', 'excluidas_total'])) unknown()
  const snapshot = readRevaluationSimulation({ success: true, complete: true, tenant_id: intent.tenantId, data: p.simulacion, ...intent.source }, intent.tenantId, p.fecha, p.simulacion.moneda_local)
  if (!snapshot.posiciones.length) unknown()
  return p as { fecha: string; simulacion: any; idempotency_key: string }
}
export function readRevaluationRegistrationIntent(raw: string, scope: RevaluationRegistrationScope): RevaluationRegistrationIntent {
  try {
    if (!scopeValid(scope) || raw.length > 1048576) unknown()
    const v = JSON.parse(raw)
    if (!exact(v, ['version', 'tenantId', 'actorId', 'createdAt', 'idempotencyKey', 'body', 'source']) || v.version !== 1 || v.tenantId !== scope.tenantId || v.actorId !== scope.actorId || !timestamp(v.createdAt) || !uuid(v.idempotencyKey) || typeof v.body !== 'string' || v.body.length > 900000) unknown()
    revaluationRegistrationPayload(v)
    return v
  } catch { unknown() }
}
export function newRevaluationRegistrationIntent(response: any, scope: RevaluationRegistrationScope, fecha: string, currency: string): RevaluationRegistrationIntent {
  if (!scopeValid(scope)) unknown()
  const simulation = readRevaluationSimulation(response, scope.tenantId, fecha, currency)
  if (!simulation.posiciones.length) unknown()
  const key = crypto.randomUUID()
  const intent: RevaluationRegistrationIntent = { version: 1, ...scope, createdAt: new Date().toISOString(), idempotencyKey: key, body: JSON.stringify({ fecha, simulacion: simulation, idempotency_key: key }), source: structuredClone({ fuentes: response.fuentes, posiciones_total: response.posiciones_total, excluidas_total: response.excluidas_total }) }
  return readRevaluationRegistrationIntent(JSON.stringify(intent), scope)
}
export function confirmRevaluationRegistration(value: any, intent: RevaluationRegistrationIntent) {
  const p = revaluationRegistrationPayload(intent), d = value?.data, op = value?.operation, j = value?.journal
  if (!consolidationLive(value) || value.success !== true || value.complete !== true || value.tenant_id !== intent.tenantId || !consolidationLive(d) || !uuid(d.asiento_id) || !number(d.numero_asiento) || !consolidationLive(op) || !consolidationLive(j)) receiptUnknown()
  const { asiento_id, numero_asiento, ...snapshot } = d
  if (!Array.isArray(snapshot.posiciones) || canonical(economic(snapshot)) !== canonical(economic(p.simulacion))) receiptUnknown()
  if (op.status !== 'COMMITTED' || op.type !== 'FX_REVALUATION' || !uuid(op.operation_id) || op.tenant_id !== intent.tenantId || op.actor_id !== intent.actorId || op.idempotency_key !== intent.idempotencyKey || op.record_id !== asiento_id || !timestamp(op.created_at) || typeof op.request_fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(op.request_fingerprint) || !exact(op.payload, ['fecha', 'simulacion', 'concepto']) || op.payload.fecha !== p.fecha || op.payload.concepto !== null || canonical(op.payload.simulacion) !== canonical(p.simulacion)) receiptUnknown()
  if (j.id !== asiento_id || j.tenant_id !== intent.tenantId || !number(j.numero_asiento) || Number(j.numero_asiento) !== Number(numero_asiento) || Date.parse(j.fecha) !== Date.parse(p.fecha + 'T00:00:00Z') || !['CONFIRMADO', 'ANULADO'].includes(j.estado_actual) || j.origen !== 'REVALUACION_MONEDA' || j.tipo_asiento !== 'AJUSTE' || j.created_by !== intent.actorId || j.confirmado_por !== intent.actorId || !timestamp(j.confirmado_en) || j.concepto !== 'Diferencia de cambio no realizada al ' + p.fecha) receiptUnknown()
  return d
}
export function currentRevaluationActor(scope: RevaluationRegistrationScope) {
  try { const session = JSON.parse(localStorage.getItem('erp.auth.session.snapshot') || 'null'); return scopeValid(scope) && session?.user?.id === scope.actorId && session?.user?.tenant_id === scope.tenantId } catch { return false }
}
/** Read-only recovery: immutable requests survive a missing pointer; no automatic send or retirement. */
export function loadRevaluationRegistration(scope: RevaluationRegistrationScope): RevaluationRegistrationIntent | null {
  const key = revaluationRegistrationKey(scope), pointer = localStorage.getItem(key)
  const active = pointer === null ? null : readRevaluationRegistrationIntent(pointer, scope)
  const unresolved = new Map<string, RevaluationRegistrationIntent>()
  for (let i = 0; i < localStorage.length; i++) {
    const name = localStorage.key(i)
    if (!name?.startsWith(archivePrefix(scope))) continue
    const raw = localStorage.getItem(name)
    if (raw === null) unknown()
    const v = readRevaluationRegistrationIntent(raw, scope)
    if (name !== archiveKey(v) || active?.idempotencyKey === v.idempotencyKey && raw !== pointer) unknown()
    const receipt = localStorage.getItem(revaluationRegistrationReceiptKey(v))
    if (receipt === null) unresolved.set(v.idempotencyKey, v)
    else confirmRevaluationRegistration(JSON.parse(receipt), v)
  }
  if (active) unresolved.set(active.idempotencyKey, active)
  if (unresolved.size > 1) throw new Error('Hay más de una intención de revaluación conservada. Se bloquea otro registro y se mantienen todos sus datos.')
  return unresolved.values().next().value ?? null
}
function writeExact(key: string, raw: string) { localStorage.setItem(key, raw); if (localStorage.getItem(key) !== raw) unknown() }
export function preserveRevaluationRegistration(intent: RevaluationRegistrationIntent) {
  const raw = JSON.stringify(intent), active = loadRevaluationRegistration(intent)
  readRevaluationRegistrationIntent(raw, intent)
  if (active && JSON.stringify(active) !== raw) unknown()
  const archive = localStorage.getItem(archiveKey(intent))
  if (archive !== null && archive !== raw) unknown()
  if (archive !== null && localStorage.getItem(revaluationRegistrationKey(intent)) === null && localStorage.getItem(revaluationRegistrationReceiptKey(intent)) !== null) throw new Error('Este registro ya tiene un recibo conservado. No se vuelve a abrir la intención cerrada.')
  if (archive === null) writeExact(archiveKey(intent), raw)
  const pointer = localStorage.getItem(revaluationRegistrationKey(intent))
  if (pointer !== null && pointer !== raw) unknown()
  if (pointer === null) writeExact(revaluationRegistrationKey(intent), raw)
  return raw
}
export function retireRevaluationRegistration(intent: RevaluationRegistrationIntent, response: any) {
  const receipt = confirmRevaluationRegistration(response, intent), raw = JSON.stringify(intent), key = revaluationRegistrationKey(intent), saved = loadRevaluationRegistration(intent)
  if (!saved || JSON.stringify(saved) !== raw || localStorage.getItem(key) !== raw || localStorage.getItem(archiveKey(intent)) !== raw) unknown()
  const receiptKey = revaluationRegistrationReceiptKey(intent), existing = localStorage.getItem(receiptKey)
  if (existing === null) writeExact(receiptKey, JSON.stringify(response))
  else {
    const earlier = JSON.parse(existing); confirmRevaluationRegistration(earlier, intent)
    if (earlier.operation.operation_id !== response.operation.operation_id) receiptUnknown()
  }
  confirmRevaluationRegistration(JSON.parse(localStorage.getItem(receiptKey) || 'null'), intent)
  if (localStorage.getItem(key) !== raw) unknown()
  localStorage.removeItem(key)
  if (localStorage.getItem(key) !== null) unknown()
  return receipt
}
export async function withRevaluationRegistrationLock<T>(scope: RevaluationRegistrationScope, action: () => Promise<T>): Promise<T> {
  if (!currentRevaluationActor(scope) || !navigator.locks?.request) throw new Error('No se pudo confirmar la sesión o reservar el registro. La intención se conserva sin enviar.')
  return navigator.locks.request(revaluationRegistrationKey(scope) + '.writer', { ifAvailable: true }, async lock => {
    if (!lock || !currentRevaluationActor(scope)) throw new Error('Otro registro está en curso. La intención se conserva; reintente manualmente cuando termine.')
    return action()
  })
}
