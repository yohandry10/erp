import { confirmCxcCreditNote, confirmCxcReschedule } from './cxc-adjustment-contract'
import type { CxcAdjustmentAccount, CxcAdjustmentScope } from './cxc-adjustment-contract'

export type CxcAdjustmentKind = 'reprogramar' | 'notas-credito'
export type CxcAdjustmentSnapshot = CxcAdjustmentAccount & { documento_id: string | null; fecha_vencimiento: string; serie: string | null; numero: string | null }
export type CxcAdjustmentIntent = CxcAdjustmentScope & { version: 1; kind: CxcAdjustmentKind; country: string; createdAt: string; cuenta: CxcAdjustmentSnapshot; key: string; body: string }
const object = (v: any): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v)
const uuid = (v: any): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
const exact = (v: Record<string, any>, keys: string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k))
const money = (v: any) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && Number.isSafeInteger(Math.round(v * 100)) && Math.abs(v * 100 - Math.round(v * 100)) < .000001
const civil = (v: any) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v
const text = (v: any) => typeof v === 'string' && !!v.trim() && v === v.trim()
const kind = (v: any): v is CxcAdjustmentKind => ['reprogramar', 'notas-credito'].includes(v)
const fail = (): never => { throw new Error('No se pudo verificar el ajuste pendiente. Se conserva sin reemplazarlo ni preparar otra solicitud.') }
function scope(v: CxcAdjustmentScope) { if (!uuid(v.tenantId) || !uuid(v.actorId)) fail() }
export function cxcAdjustmentPendingPrefix(v: CxcAdjustmentScope) { scope(v); return `erp.cxc.adjustment.pending.v1.${v.tenantId}:${v.actorId}:` }
export function cxcAdjustmentPendingKey(v: CxcAdjustmentScope, accountId: string, action: CxcAdjustmentKind) { if (!uuid(accountId) || !kind(action)) fail(); return cxcAdjustmentPendingPrefix(v) + accountId + ':' + action }

function snapshot(v: any): v is CxcAdjustmentSnapshot {
  return object(v) && exact(v, ['id', 'cliente_id', 'documento_id', 'total', 'saldo', 'moneda', 'fecha_vencimiento', 'serie', 'numero'])
    && uuid(v.id) && uuid(v.cliente_id) && (v.documento_id === null || uuid(v.documento_id))
    && money(v.total) && v.total > 0 && money(v.saldo) && v.saldo > 0 && v.saldo <= v.total && typeof v.moneda === 'string' && /^[A-Z]{3}$/.test(v.moneda)
    && civil(v.fecha_vencimiento) && ['serie', 'numero'].every(k => v[k] === null || text(v[k]))
}
export function cxcAdjustmentPayload(intent: CxcAdjustmentIntent): Record<string, any> {
  let p: any
  try { p = JSON.parse(intent.body) } catch { fail() }
  if (!object(p)) fail()
  if (intent.kind === 'reprogramar') {
    if (Object.keys(p).some(k => !['nueva_fecha_vencimiento', 'motivo', 'comentarios'].includes(k)) || !civil(p.nueva_fecha_vencimiento)
      || ['motivo', 'comentarios'].some(k => Object.hasOwn(p, k) && (!text(p[k]) || p[k].length > 2000))) fail()
  } else if (!exact(p, ['monto', 'codigo_motivo', 'motivo', 'documento_id', 'fecha_emision', 'idempotency_key'])
    || !money(p.monto) || p.monto <= 0 || p.monto > intent.cuenta.saldo || !civil(p.fecha_emision)
    || p.documento_id !== intent.cuenta.documento_id || !uuid(p.documento_id) || p.idempotency_key !== intent.key
    || !text(p.motivo) || p.motivo.length < 3 || p.motivo.length > 500
    || !(intent.country === 'CO' ? ['1', '2', '3', '4', '5'] : ['04', '05', '08', '09', '10', '11', '12', '13']).includes(p.codigo_motivo)) fail()
  return p
}
export function readCxcAdjustmentIntent(raw: string | null, expected: CxcAdjustmentScope, accountId?: string, action?: CxcAdjustmentKind): CxcAdjustmentIntent | null {
  scope(expected)
  if (raw === null) return null
  try {
    if (raw.length > 16384) fail()
    const v = JSON.parse(raw)
    if (!object(v) || !exact(v, ['version', 'kind', 'country', 'createdAt', 'tenantId', 'actorId', 'cuenta', 'key', 'body'])
      || v.version !== 1 || !kind(v.kind) || v.tenantId !== expected.tenantId || v.actorId !== expected.actorId || !snapshot(v.cuenta)
      || accountId !== undefined && v.cuenta.id !== accountId || action !== undefined && v.kind !== action
      || !(v.kind === 'notas-credito' ? ['PE', 'CO'] : ['PE', 'CO', 'AR']).includes(v.country)
      || typeof v.createdAt !== 'string' || !Number.isFinite(Date.parse(v.createdAt)) || new Date(v.createdAt).toISOString() !== v.createdAt
      || typeof v.key !== 'string' || !v.key.startsWith(v.kind === 'reprogramar' ? 'cxc-reprogram-ui:' : 'cxc-note-ui:')
      || !uuid(v.key.slice((v.kind === 'reprogramar' ? 'cxc-reprogram-ui:' : 'cxc-note-ui:').length)) || typeof v.body !== 'string') fail()
    cxcAdjustmentPayload(v as CxcAdjustmentIntent)
    return v as CxcAdjustmentIntent
  } catch { return fail() }
}
export function newCxcAdjustmentIntent(action: CxcAdjustmentKind, cuenta: CxcAdjustmentAccount & { serie?: string | null; numero?: string | null }, country: string, fields: Record<string, any>, expected: CxcAdjustmentScope): CxcAdjustmentIntent {
  const key = `${action === 'reprogramar' ? 'cxc-reprogram-ui' : 'cxc-note-ui'}:${crypto.randomUUID()}`
  const frozen: CxcAdjustmentSnapshot = { id: cuenta.id, cliente_id: cuenta.cliente_id, documento_id: cuenta.documento_id ?? null, total: cuenta.total, saldo: cuenta.saldo, moneda: cuenta.moneda, fecha_vencimiento: cuenta.fecha_vencimiento || '', serie: cuenta.serie ?? null, numero: cuenta.numero ?? null }
  const body = JSON.stringify(action === 'reprogramar' ? fields : { ...fields, idempotency_key: key })
  const v: CxcAdjustmentIntent = { version: 1, kind: action, country, createdAt: new Date().toISOString(), tenantId: expected.tenantId, actorId: expected.actorId, cuenta: frozen, key, body }
  readCxcAdjustmentIntent(JSON.stringify(v), expected, cuenta.id, action)
  return v
}
export function confirmCxcAdjustmentIntent(response: any, intent: CxcAdjustmentIntent) {
  const payload = cxcAdjustmentPayload(intent)
  if (intent.kind === 'reprogramar') confirmCxcReschedule(response, { tenantId: intent.tenantId, actorId: intent.actorId, cuenta: intent.cuenta, key: intent.key, payload: payload as any })
  else confirmCxcCreditNote(response, { tenantId: intent.tenantId, actorId: intent.actorId, cuenta: intent.cuenta, key: intent.key, payload: payload as any, country: intent.country })
}
