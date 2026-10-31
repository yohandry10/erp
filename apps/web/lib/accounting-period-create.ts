import { readPeriodDetail, type PeriodSnapshot } from './accounting-period-read'

export type PeriodCreateScope = { tenantId: string; actorId: string }
export type PeriodCreateIntent = PeriodCreateScope & {
  version: 1
  createdAt: string
  idempotencyKey: string
  payload: { anio: number; mes: number }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const fail = (): never => { throw new Error('La creación del período no está confirmada. Se conservan sus datos para reintentar con conexión.') }
const object = (value: unknown, keys: string[]): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key))
const payload = (value: unknown): value is PeriodCreateIntent['payload'] => object(value, ['anio','mes']) && Number.isInteger(value.anio) && value.anio >= 2000 && value.anio <= 2200 && Number.isInteger(value.mes) && value.mes >= 1 && value.mes <= 12

export function periodCreateIntentKey(scope: PeriodCreateScope): string {
  if (!uuid.test(scope.tenantId) || !uuid.test(scope.actorId)) return fail()
  return `erp.accounting.period-create.pending.v1.${scope.tenantId}:${scope.actorId}`
}

export function readPeriodCreateIntent(raw: string | null, scope: PeriodCreateScope): PeriodCreateIntent | null {
  periodCreateIntentKey(scope)
  if (raw === null) return null
  let value: unknown
  try { value = JSON.parse(raw) } catch { return fail() }
  if (!object(value, ['version','createdAt','tenantId','actorId','idempotencyKey','payload']) || value.version !== 1 || value.tenantId !== scope.tenantId || value.actorId !== scope.actorId || !payload(value.payload)) return fail()
  if (typeof value.createdAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.createdAt) || !Number.isFinite(Date.parse(value.createdAt)) || new Date(value.createdAt).toISOString() !== value.createdAt) return fail()
  if (typeof value.idempotencyKey !== 'string' || !value.idempotencyKey.startsWith('period-create:') || !uuid.test(value.idempotencyKey.slice('period-create:'.length))) return fail()
  return value as PeriodCreateIntent
}

export function newPeriodCreateIntent(values: PeriodCreateIntent['payload'], scope: PeriodCreateScope): PeriodCreateIntent {
  if (!payload(values)) return fail()
  const value = { version: 1 as const, ...scope, createdAt: new Date().toISOString(), idempotencyKey: `period-create:${crypto.randomUUID()}`, payload: { ...values } }
  return readPeriodCreateIntent(JSON.stringify(value), scope) || fail()
}

export function confirmPeriodCreated(response: unknown, intent: PeriodCreateIntent, scope: PeriodCreateScope): PeriodSnapshot {
  const verified = readPeriodCreateIntent(JSON.stringify(intent), scope)
  if (!verified) return fail()
  const id = (response as { data?: { id?: unknown } })?.data?.id
  if (typeof id !== 'string') return fail()
  const row = readPeriodDetail(response, scope.tenantId, id)
  if (row.anio !== verified.payload.anio || row.mes !== verified.payload.mes || row.estado !== 'ABIERTO' || row.metadata.created_by !== scope.actorId || row.fecha_cierre !== null || row.cerrado_por !== null) return fail()
  return row
}
