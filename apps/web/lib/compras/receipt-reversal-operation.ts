export type ReceiptReversalScope = { tenantId: string; actorId: string; receiptId: string }
export type ReceiptReversalIntent = ReceiptReversalScope & {
  version: 1; createdAt: string; receiptNumber: string; key: string; fingerprint: string;
  body: { motivo: string; fecha_contable: string }
}
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>
type Row = Record<string, any>
export type ReceiptReversalOutcome = { status: 'COMMITTED'; receipt: Row } | { status: 'ABANDONED'; resolution: Row }
const object = (v: any): v is Row => !!v && typeof v === 'object' && !Array.isArray(v)
const exact = (v: any, keys: string[]) => object(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k))
const uuid = (v: any): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)
const live = (v: any): v is Row => object(v) && ['cached', 'queued', 'offline', 'pending', 'from_cache'].every(k => v[k] === undefined || v[k] === false)
const canonical = (v: any): string => JSON.stringify(v, (_key, x) => object(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x)
const time = (v: any) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v))
const civil = (v: any) => typeof v === 'string' && /^(?:20\d{2}|2100)-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v + 'T00:00:00Z'))
  && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v
const text = (v: string) => !v.includes('\0') && !Array.from(v).some(c => c.length === 1 && c.charCodeAt(0) >= 0xd800 && c.charCodeAt(0) <= 0xdfff)
const trim = (v: string) => { let a = 0, b = v.length; while (a < b && v[a] === ' ') a++; while (b > a && v[b - 1] === ' ') b--; return v.slice(a, b) }
const fail = (): never => { throw new Error('No se pudo comprobar la intención original. Sus datos se conservan; consulte o resuelva el pendiente con conexión.') }
function payload(i: ReceiptReversalIntent) {
  return { tipo: 'RECEPCION', fuente_id: i.receiptId, actor_id: i.actorId, motivo: i.body.motivo, fecha_contable: i.body.fecha_contable }
}
async function fingerprint(i: ReceiptReversalIntent) {
  const p = payload(i), encoder = new TextEncoder()
  // All keys are ASCII; jsonb orders them by UTF8 byte length, then bytes.
  const value = '{' + Object.keys(p).sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0))
    .map(k => JSON.stringify(k) + ': ' + JSON.stringify(p[k as keyof typeof p])).join(', ') + '}'
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))).map(x => x.toString(16).padStart(2, '0')).join('')
}
export function receiptReversalPendingKey(scope: ReceiptReversalScope) {
  if (![scope.tenantId, scope.actorId, scope.receiptId].every(uuid)) return fail()
  return `erp.receipt-reversal.pending.v1.${scope.tenantId}:${scope.actorId}:${scope.receiptId}`
}
export async function readReceiptReversalIntent(raw: string | null, scope: ReceiptReversalScope): Promise<ReceiptReversalIntent | null> {
  receiptReversalPendingKey(scope)
  if (raw === null) return null
  let i: any
  try { if (raw.length > 8000) return fail(); i = JSON.parse(raw) } catch { return fail() }
  if (!exact(i, ['version', 'tenantId', 'actorId', 'receiptId', 'createdAt', 'receiptNumber', 'key', 'fingerprint', 'body']) || i.version !== 1
    || i.tenantId !== scope.tenantId || i.actorId !== scope.actorId || i.receiptId !== scope.receiptId || !time(i.createdAt)
    || typeof i.receiptNumber !== 'string' || !i.receiptNumber.trim() || i.receiptNumber.length > 200
    || typeof i.key !== 'string' || i.key !== trim(i.key) || !text(i.key) || Array.from(i.key).length < 8 || Array.from(i.key).length > 180
    || !exact(i.body, ['motivo', 'fecha_contable']) || typeof i.body.motivo !== 'string' || i.body.motivo !== trim(i.body.motivo)
    || !i.body.motivo.trim() || !text(i.body.motivo) || Array.from(i.body.motivo).length < 5 || Array.from(i.body.motivo).length > 500
    || !civil(i.body.fecha_contable) || typeof i.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(i.fingerprint)
    || await fingerprint(i) !== i.fingerprint) return fail()
  return i as ReceiptReversalIntent
}
export async function newReceiptReversalIntent(scope: ReceiptReversalScope, receiptNumber: string, fields: { motivo: string; fecha_contable: string }) {
  receiptReversalPendingKey(scope)
  if (typeof fields?.motivo !== 'string') return fail()
  const i: ReceiptReversalIntent = { version: 1, ...scope, receiptNumber, createdAt: new Date().toISOString(), key: 'receipt-reversal:' + crypto.randomUUID(),
    body: { motivo: trim(fields.motivo), fecha_contable: fields.fecha_contable }, fingerprint: '' }
  i.fingerprint = await fingerprint(i)
  return (await readReceiptReversalIntent(JSON.stringify(i), scope))!
}
export function receiptReversalRequest(i: ReceiptReversalIntent) {
  return { expected_scope: { tenant_id: i.tenantId, actor_id: i.actorId, source_operation_id: i.receiptId }, original: { ...i.body, idempotency_key: i.key } }
}
function identity(row: any, i: ReceiptReversalIntent) {
  const op = row?.operation_identity
  return live(op) && op.version === 1 && op.type === 'RECEPCION_REVERSA' && uuid(op.operation_id) && op.operation_id === row.reversa_id
    && op.source_operation_id === i.receiptId && op.tenant_id === i.tenantId && op.actor_id === i.actorId && op.idempotency_key === i.key
    && op.request_fingerprint === i.fingerprint && canonical(op.request_payload) === canonical(payload(i)) && op.confirmed_at === row.created_at && time(op.confirmed_at)
}
function receipt(r: any, i: ReceiptReversalIntent) {
  if (!live(r) || r.success !== true || r.estado !== 'ANULADA' || r.tipo !== 'RECEPCION_REVERSA' || !identity(r, i)
    || r.tenant_id !== i.tenantId || r.actor_id !== i.actorId || r.recepcion_id !== i.receiptId || r.idempotency_key !== i.key
    || r.request_fingerprint !== i.fingerprint || canonical(r.payload) !== canonical(payload(i)) || r.motivo !== i.body.motivo || r.fecha_contable !== i.body.fecha_contable
    || typeof r.idempotent !== 'boolean' || !uuid(r.orden_id) || !['APROBADA', 'PARCIAL', 'RECIBIDA'].includes(r.orden_estado)
    || !live(r.contabilidad) || r.contabilidad.estado !== 'PENDIENTE' || !uuid(r.contabilidad.event_id) || !uuid(r.contabilidad.original_event_id)
    || r.contabilidad.event_id === r.contabilidad.original_event_id || !Array.isArray(r.movimientos)
    || new Set(r.movimientos.map(m => m?.id)).size !== r.movimientos.length || new Set(r.movimientos.map(m => m?.source_movement_id)).size !== r.movimientos.length
    || !r.movimientos.every(m => live(m) && uuid(m.id) && uuid(m.source_movement_id) && m.id !== m.source_movement_id && uuid(m.producto_id) && uuid(m.almacen_id)
      && (m.ubicacion_id === null || uuid(m.ubicacion_id)) && typeof m.cantidad === 'string' && /^\d{1,12}(?:\.\d{1,6})?$/.test(m.cantidad) && /[1-9]/.test(m.cantidad))) return fail()
  return r
}
export async function readReceiptReversalOutcome(response: any, i: ReceiptReversalIntent, resolving = false): Promise<ReceiptReversalOutcome> {
  await readReceiptReversalIntent(JSON.stringify(i), i)
  if (!live(response) || response.success !== true || !live(response.data)) return fail()
  const d = response.data
  if (!resolving) return { status: 'COMMITTED', receipt: receipt(d, i) }
  if (d.status === 'COMMITTED' && d.resolution === undefined) return { status: 'COMMITTED', receipt: receipt(d.receipt, i) }
  const r = d.resolution
  if (d.status !== 'ABANDONED' || d.receipt !== undefined || d.detail !== undefined || !live(r) || !uuid(r.id) || r.type !== 'RECEPCION_REVERSA'
    || r.tenant_id !== i.tenantId || r.actor_id !== i.actorId || r.source_operation_id !== i.receiptId || r.idempotency_key !== i.key
    || r.request_fingerprint !== i.fingerprint || canonical(r.request_payload) !== canonical(payload(i)) || !time(r.confirmed_at)) return fail()
  return { status: 'ABANDONED', resolution: r }
}
const outcomeResponse = (o: ReceiptReversalOutcome) => ({ success: true, data: o })
const same = (a: ReceiptReversalOutcome, b: ReceiptReversalOutcome) => canonical(a.status === 'COMMITTED' ? { ...a, receipt: { ...a.receipt, idempotent: false } } : a)
  === canonical(b.status === 'COMMITTED' ? { ...b, receipt: { ...b.receipt, idempotent: false } } : b)
export async function archiveReceiptReversal(storage: Storage, i: ReceiptReversalIntent, outcome: ReceiptReversalOutcome) {
  await readReceiptReversalOutcome(outcomeResponse(outcome), i, true)
  const pendingKey = receiptReversalPendingKey(i), raw = JSON.stringify(i), archiveKey = pendingKey + '.resolved.' + i.key
  const previous = storage.getItem(archiveKey)
  if (previous !== null) {
    const saved = JSON.parse(previous)
    if (JSON.stringify(saved.intent) !== raw || !same(await readReceiptReversalOutcome(outcomeResponse(saved.outcome), i, true), outcome)) return fail()
  } else storage.setItem(archiveKey, JSON.stringify({ intent: i, outcome }))
  const saved = JSON.parse(storage.getItem(archiveKey) || '{}')
  if (JSON.stringify(saved.intent) !== raw || !same(await readReceiptReversalOutcome(outcomeResponse(saved.outcome), i, true), outcome)) return fail()
  const pending = storage.getItem(pendingKey)
  if (pending !== null && pending !== raw) return fail()
  if (pending === raw) storage.removeItem(pendingKey)
  if (storage.getItem(pendingKey) !== null) return fail()
  return outcome
}
