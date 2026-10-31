import type { CxcCollectionExpectation } from './cxc-collection-contract'

export const CXC_COLLECTION_METHODS = [
  { value: 'EFECTIVO', label: 'Efectivo' }, { value: 'TRANSFERENCIA', label: 'Transferencia' },
  { value: 'CHEQUE', label: 'Cheque' }, { value: 'TARJETA', label: 'Tarjeta' },
] as const
export type CxcCollectionScope = { tenantId: string; actorId: string }
export type CxcCollectionAccount = { id: string; cliente_id: string; total: number; saldo: number; moneda: string; serie?: string | null; numero?: string | null; clientes?: { razon_social?: string | null } }
type AccountSnapshot = { id: string; cliente_id: string; total: number; saldo: number; moneda: string; serie: string | null; numero: string | null; clienteNombre: string | null }
export type CxcCollectionIntent = CxcCollectionScope & { version: 1; createdAt: string; cuenta: AccountSnapshot; body: string }
export type CxcCollectionBank = { id: string; tenant_id: string; banco: string; numero_cuenta: string; moneda: string; activa: boolean; estado: string; nombre?: string | null }
const object = (v: any): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v)
const uuid = (v: any): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
const live = (v: any) => object(v) && ['cached', 'offline', 'queued', 'pending', 'from_cache'].every(k => v[k] === undefined || v[k] === false)
const exact = (v: Record<string, any>, keys: readonly string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k))
const money = (v: any) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && Number.isSafeInteger(Math.round(v * 100)) && Math.abs(v * 100 - Math.round(v * 100)) < .000001
const civil = (v: any) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v
const text = (v: any) => typeof v === 'string' && !!v.trim() && v === v.trim()
function invalid(): never { throw new Error('No se pudo verificar el cobro pendiente. Se conserva sin reemplazarlo ni enviar otra operación.') }
function scope(scope: CxcCollectionScope) { if (!uuid(scope.tenantId) || !uuid(scope.actorId)) invalid() }
export function cxcCollectionPendingPrefix(value: CxcCollectionScope) { scope(value); return `erp.cxc.collection.pending.v1.${value.tenantId}:${value.actorId}:` }
export function cxcCollectionPendingKey(value: CxcCollectionScope, accountId: string) { if (!uuid(accountId)) invalid(); return cxcCollectionPendingPrefix(value) + accountId }

function snapshot(value: any): value is AccountSnapshot {
  return object(value) && exact(value, ['id', 'cliente_id', 'total', 'saldo', 'moneda', 'serie', 'numero', 'clienteNombre'])
    && uuid(value.id) && uuid(value.cliente_id) && money(value.total) && value.total > 0 && money(value.saldo) && value.saldo > 0 && value.saldo <= value.total
    && typeof value.moneda === 'string' && /^[A-Z]{3}$/.test(value.moneda)
    && ['serie', 'numero', 'clienteNombre'].every(k => value[k] === null || text(value[k]))
}
export function cxcCollectionPayload(intent: CxcCollectionIntent): CxcCollectionExpectation['payload'] {
  let v: any
  try { v = JSON.parse(intent.body) } catch { invalid() }
  const keys = ['monto', 'fecha_pago', 'metodo_pago', 'cuenta_bancaria_id', 'referencia', 'notas', 'idempotency_key']
  if (!object(v) || Object.keys(v).some(k => !keys.includes(k)) || !money(v.monto) || v.monto <= 0 || v.monto > intent.cuenta.saldo
    || !civil(v.fecha_pago) || !CXC_COLLECTION_METHODS.some(m => m.value === v.metodo_pago)
    || typeof v.idempotency_key !== 'string' || !v.idempotency_key.startsWith(`cxc-cobro:${intent.cuenta.id}:`) || !uuid(v.idempotency_key.slice(`cxc-cobro:${intent.cuenta.id}:`.length))
    || (v.metodo_pago === 'EFECTIVO' ? v.cuenta_bancaria_id !== undefined : !uuid(v.cuenta_bancaria_id) || !text(v.referencia))
    || ['referencia', 'notas'].some(k => Object.hasOwn(v, k) && (!text(v[k]) || v[k].length > (k === 'referencia' ? 120 : 1000)))) invalid()
  return v as CxcCollectionExpectation['payload']
}
export function readCxcCollectionIntent(raw: string | null, expected: CxcCollectionScope, accountId?: string): CxcCollectionIntent | null {
  scope(expected)
  if (raw === null) return null
  try {
    if (raw.length > 16384) invalid()
    const v = JSON.parse(raw)
    if (!object(v) || !exact(v, ['version', 'tenantId', 'actorId', 'createdAt', 'cuenta', 'body']) || v.version !== 1
      || v.tenantId !== expected.tenantId || v.actorId !== expected.actorId || !snapshot(v.cuenta) || accountId !== undefined && v.cuenta.id !== accountId
      || typeof v.createdAt !== 'string' || !Number.isFinite(Date.parse(v.createdAt)) || new Date(v.createdAt).toISOString() !== v.createdAt || typeof v.body !== 'string') invalid()
    cxcCollectionPayload(v as CxcCollectionIntent)
    return v as CxcCollectionIntent
  } catch { invalid() }
}
export function newCxcCollectionIntent(account: CxcCollectionAccount, fields: { monto: string; fechaPago: string; metodoPago: string; cuentaBancariaId: string; referencia: string; notas: string }, value: CxcCollectionScope): CxcCollectionIntent {
  scope(value)
  if (!/^\d+(?:\.\d{1,2})?$/.test(fields.monto)) invalid()
  const cuenta: AccountSnapshot = { id: account.id, cliente_id: account.cliente_id, total: account.total, saldo: account.saldo, moneda: account.moneda, serie: account.serie ?? null, numero: account.numero ?? null, clienteNombre: account.clientes?.razon_social ?? null }
  const body = JSON.stringify({ monto: Number(fields.monto), fecha_pago: fields.fechaPago, metodo_pago: fields.metodoPago,
    ...(fields.metodoPago === 'EFECTIVO' ? {} : { cuenta_bancaria_id: fields.cuentaBancariaId }),
    ...(fields.referencia.trim() ? { referencia: fields.referencia.trim() } : {}), ...(fields.notas.trim() ? { notas: fields.notas.trim() } : {}),
    idempotency_key: `cxc-cobro:${account.id}:${crypto.randomUUID()}` })
  const intent: CxcCollectionIntent = { version: 1, ...value, createdAt: new Date().toISOString(), cuenta, body }
  readCxcCollectionIntent(JSON.stringify(intent), value, account.id)
  return intent
}
export function cxcCollectionExpectation(intent: CxcCollectionIntent): CxcCollectionExpectation {
  return { tenantId: intent.tenantId, actorId: intent.actorId, cuenta: intent.cuenta, payload: cxcCollectionPayload(intent) }
}
export function cxcCollectionAccount(intent: CxcCollectionIntent): CxcCollectionAccount {
  return { ...intent.cuenta, clientes: { razon_social: intent.cuenta.clienteNombre } }
}
export function readCxcCollectionBanks(response: any, tenantId: string, currency: string): CxcCollectionBank[] {
  if (!uuid(tenantId) || !/^[A-Z]{3}$/.test(currency) || !live(response) || response.success !== true || response.complete !== true
    || !Array.isArray(response.data) || response.total !== response.data.length || response.count !== response.data.length) throw new Error('No se pudo verificar el catálogo completo de cuentas bancarias. Reintenta la consulta.')
  const ids = new Set<string>()
  for (const r of response.data) {
    if (!live(r) || !uuid(r.id) || ids.has(r.id) || r.tenant_id !== tenantId || !text(r.banco) || !text(r.numero_cuenta)
      || !/^[A-Z]{3}$/.test(r.moneda || '') || typeof r.activa !== 'boolean' || !text(r.estado)
      || r.activo !== undefined && r.activo !== r.activa) throw new Error('El catálogo bancario es incompleto o pertenece a otra empresa.')
    ids.add(r.id)
  }
  return response.data.filter((r: CxcCollectionBank) => r.activa && r.estado === 'ACTIVO' && r.moneda === currency)
}
