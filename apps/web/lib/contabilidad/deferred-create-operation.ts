import { readDeferredRegister } from './deferred-read-contract'

export interface DeferredCreateScope { tenantId: string; actorId: string }
export interface DeferredCreatePayload {
  codigo?: string; nombre: string; descripcion?: string; tipo: 'GASTO' | 'INGRESO'
  cuenta_diferido_id: string; cuenta_resultado_id: string; monto_total: number
  periodos: number; fecha_inicio: string; centro_costo_id?: string
}
export interface DeferredCreateReference { id: string; code: string; name: string }
export interface DeferredCreateContext { balance: DeferredCreateReference; result: DeferredCreateReference; center: DeferredCreateReference | null }
export interface DeferredCreateIntent extends DeferredCreateScope {
  version: 1; createdAt: string; idempotencyKey: string; body: string; context: DeferredCreateContext
}
const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v)
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
const text = (v: unknown): v is string => typeof v === 'string' && !!v.trim() && v === v.trim()
const date = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v+'T00:00:00Z')) && new Date(v+'T00:00:00Z').toISOString().slice(0,10) === v
const timestamp = (v: unknown): v is string => typeof v === 'string' && date(v.slice(0,10)) && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v))
const money = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0 && Number.isSafeInteger(Math.round(v*100)) && Math.abs(v*100-Math.round(v*100)) < .00001
const live = (v: Record<string, any>) => ['cached','queued','offline','pending'].every(k => v[k] === undefined || v[k] === false)
const exact = (v: Record<string, any>, keys: string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(v,k))
const nullable = (v: unknown) => v === undefined || v === null ? null : v
const validScope = (s: DeferredCreateScope) => uuid(s.tenantId) && uuid(s.actorId)
function invalid(): never { throw new Error('No se pudo recuperar el alta pendiente con seguridad. Se conserva sin reemplazarla.') }

export function deferredCreateIntentKey(s: DeferredCreateScope): string {
  if (!validScope(s)) invalid()
  return `erp.accounting.deferred-create.pending.v1.${s.tenantId}:${s.actorId}`
}
export function readDeferredCreatePayload(v: unknown): DeferredCreatePayload {
  const required=['nombre','tipo','cuenta_diferido_id','cuenta_resultado_id','monto_total','periodos','fecha_inicio']
  const optional=['codigo','descripcion','centro_costo_id']
  if (!object(v) || !required.every(k=>Object.prototype.hasOwnProperty.call(v,k)) || Object.keys(v).some(k=>![...required,...optional].includes(k)) ||
      !text(v.nombre) || !['GASTO','INGRESO'].includes(v.tipo) || !uuid(v.cuenta_diferido_id) || !uuid(v.cuenta_resultado_id) || v.cuenta_diferido_id === v.cuenta_resultado_id ||
      !money(v.monto_total) || !Number.isSafeInteger(v.periodos) || v.periodos < 1 || !date(v.fecha_inicio) ||
      (v.codigo !== undefined && !text(v.codigo)) || (v.descripcion !== undefined && !text(v.descripcion)) || (v.centro_costo_id !== undefined && !uuid(v.centro_costo_id))) invalid()
  return v as DeferredCreatePayload
}
export function buildDeferredCreatePayload(form: Record<string, unknown>): DeferredCreatePayload {
  const value: Record<string, unknown> = { nombre: String(form.nombre ?? '').trim(), tipo: form.tipo,
    cuenta_diferido_id: form.cuenta_diferido_id, cuenta_resultado_id: form.cuenta_resultado_id,
    monto_total: Number(form.monto_total), periodos: Number(form.periodos), fecha_inicio: form.fecha_inicio }
  for (const field of ['codigo','descripcion','centro_costo_id']) { const v=String(form[field] ?? '').trim(); if(v) value[field]=v }
  return readDeferredCreatePayload(value)
}
function validReference(v: unknown, id: string, requireCode: boolean): boolean {
  return object(v) && exact(v,['id','code','name']) && v.id === id && uuid(v.id) && typeof v.code === 'string' && (!requireCode || text(v.code)) && text(v.name)
}
function validContext(c: unknown, p: DeferredCreatePayload): c is DeferredCreateContext {
  return object(c) && exact(c,['balance','result','center']) && validReference(c.balance,p.cuenta_diferido_id,true) && validReference(c.result,p.cuenta_resultado_id,true) &&
    (p.centro_costo_id ? validReference(c.center,p.centro_costo_id,false) : c.center === null)
}
export function newDeferredCreateIntent(payload: DeferredCreatePayload, scope: DeferredCreateScope, context: DeferredCreateContext): DeferredCreateIntent {
  const p=readDeferredCreatePayload(payload)
  if (!validScope(scope) || !validContext(context,p)) invalid()
  return {version:1,...scope,createdAt:new Date().toISOString(),idempotencyKey:crypto.randomUUID(),body:JSON.stringify(p),context}
}
export function readDeferredCreateIntent(raw: string, scope: DeferredCreateScope): DeferredCreateIntent {
  try {
    if(!validScope(scope) || raw.length > 131072) invalid()
    const v=JSON.parse(raw)
    if(!object(v) || !exact(v,['version','tenantId','actorId','createdAt','idempotencyKey','body','context']) || v.version !== 1 || v.tenantId !== scope.tenantId || v.actorId !== scope.actorId ||
        !timestamp(v.createdAt) || !uuid(v.idempotencyKey) || typeof v.body !== 'string' || v.body.length > 65536) invalid()
    const p=readDeferredCreatePayload(JSON.parse(v.body))
    if(!validContext(v.context,p)) invalid()
    return v as DeferredCreateIntent
  } catch { invalid() }
}
export function confirmDeferredCreated(value: unknown, intent: DeferredCreateIntent) {
  if(!object(value) || value.success !== true || !live(value) || (value.tenant_id !== undefined && value.tenant_id !== intent.tenantId) || !object(value.data) || !live(value.data)) throw new Error('Se necesita el recibo completo en vivo del diferido registrado.')
  const p=readDeferredCreatePayload(JSON.parse(intent.body));const row=value.data
  const required=['id','tenant_id','codigo','nombre','descripcion','tipo','cuenta_diferido_id','cuenta_resultado_id','monto_total','monto_devengado','monto_pendiente','periodos','fecha_inicio','centro_costo_id','estado','created_by','created_at','updated_at']
  if(!required.every(k=>Object.prototype.hasOwnProperty.call(row,k)) || row.created_by !== intent.actorId || !timestamp(row.created_at) || !timestamp(row.updated_at) || Date.parse(row.updated_at) < Date.parse(row.created_at)) throw new Error('El recibo del diferido está incompleto o pertenece a otro usuario.')
  const r=readDeferredRegister({success:true,data:[row]},intent.tenantId)[0]
  if(r.nombre !== p.nombre || nullable(r.codigo) !== nullable(p.codigo) || nullable(row.descripcion) !== nullable(p.descripcion) || r.tipo !== p.tipo ||
      r.cuenta_diferido_id !== p.cuenta_diferido_id || r.cuenta_resultado_id !== p.cuenta_resultado_id || nullable(r.centro_costo_id) !== nullable(p.centro_costo_id) ||
      r.monto_total !== p.monto_total || r.monto_devengado !== 0 || r.monto_pendiente !== p.monto_total || r.periodos !== p.periodos || r.fecha_inicio !== p.fecha_inicio || r.estado !== 'VIGENTE') throw new Error('El recibo no coincide con el alta pendiente. Se conserva para verificar el resultado.')
  return r
}
