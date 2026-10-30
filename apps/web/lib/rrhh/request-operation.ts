import { readRequestCatalogs, type EmployeeRequest, type RequestEmployee } from './requests-catalog'

export type RequestScope = { tenantId: string; actorId: string }
export type RequestPayload = {
  id_empleado: string; tipo: string; fecha_inicio: string; fecha_fin: string; motivo: string; dias: number;
}
export type RequestIntent = RequestScope & { version: 1; createdAt: string; key: string } & (
  { kind: 'create'; payload: RequestPayload } |
  { kind: 'decide'; action: 'aprobar' | 'rechazar'; request: RequestPayload & { id: string }; payload: { aprobado_por: string; observaciones: string } }
)
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const civil = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v + 'T00:00:00Z')) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v
const time = (v: unknown): v is string => typeof v === 'string' && civil(v.slice(0, 10)) && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v))
function fail(): never { throw new Error('No se pudo recuperar la operación pendiente. Sus datos se conservan y se bloquean otras operaciones.') }
export function requestIntentKey(scope: RequestScope) {
  if (!uuid(scope.tenantId) || !uuid(scope.actorId)) return fail()
  return `erp.rrhh-request.pending.v1.${scope.tenantId}:${scope.actorId}`
}
export function requestPayload(row: RequestPayload): RequestPayload {
  return { id_empleado: row.id_empleado, tipo: row.tipo, fecha_inicio: row.fecha_inicio, fecha_fin: row.fecha_fin, motivo: row.motivo, dias: row.dias }
}
function validPayload(v: unknown, decision = false): v is RequestPayload {
  if (!object(v) || Object.keys(v).some(k => !['id_empleado','tipo','fecha_inicio','fecha_fin','motivo','dias',...(decision ? ['id'] : [])].includes(k))) return false
  return uuid(v.id_empleado) && ['vacaciones','licencia','permiso','descanso_medico','compensacion','otro'].includes(String(v.tipo)) &&
    civil(v.fecha_inicio) && civil(v.fecha_fin) && v.fecha_fin >= v.fecha_inicio && Number.isInteger(v.dias) &&
    v.dias === (Date.parse(v.fecha_fin + 'T00:00:00Z') - Date.parse(v.fecha_inicio + 'T00:00:00Z')) / 86400000 + 1 &&
    typeof v.motivo === 'string' && !!v.motivo.trim() && v.motivo.length <= 2000 && (!decision || uuid(v.id))
}
export function readRequestIntent(serialized: string | null, scope: RequestScope): RequestIntent | null {
  requestIntentKey(scope)
  if (serialized === null) return null
  let v: unknown
  try { v = JSON.parse(serialized) } catch { return fail() }
  if (!object(v) || v.version !== 1 || v.tenantId !== scope.tenantId || v.actorId !== scope.actorId ||
      !time(v.createdAt) || typeof v.key !== 'string' || !v.key.startsWith('rrhh-request:') || !uuid(v.key.slice(13))) return fail()
  const allowed = ['version','tenantId','actorId','createdAt','key','kind','payload',...(v.kind === 'decide' ? ['action','request'] : [])]
  if (Object.keys(v).some(k => !allowed.includes(k))) return fail()
  if (v.kind === 'create') {
    if (!validPayload(v.payload)) return fail()
  } else if (v.kind === 'decide') {
    if (!['aprobar','rechazar'].includes(String(v.action)) || !validPayload(v.request, true) || !object(v.payload) ||
        Object.keys(v.payload).some(k => !['aprobado_por','observaciones'].includes(k)) || v.payload.aprobado_por !== scope.actorId ||
        typeof v.payload.observaciones !== 'string' || v.payload.observaciones !== v.payload.observaciones.trim() ||
        v.payload.observaciones.length > 2000 || (v.action === 'rechazar' && !v.payload.observaciones)) return fail()
  } else return fail()
  return v as unknown as RequestIntent
}
export function readRequestReceipt(response: unknown, intent: RequestIntent, employees: RequestEmployee[]): EmployeeRequest {
  const unconfirmed = (): never => { throw new Error('La respuesta no confirma esta operación. Se conservan los datos para reintentar el mismo registro.') }
  try {
    if (!object(response) || response.success !== true || !object(response.data) || response.queued === true || response.cached === true) return unconfirmed()
    const row = response.data
    const own = readRequestCatalogs([row], employees, intent).requests[0]
    const expected = intent.kind === 'create' ? intent.payload : intent.request
    for (const key of ['id_empleado','tipo','fecha_inicio','fecha_fin','motivo','dias'] as const) if (own[key] !== expected[key]) return unconfirmed()
    if (typeof row.activo !== 'boolean' || !row.activo || !time(row.created_at) || !time(row.updated_at) || Date.parse(row.updated_at) < Date.parse(row.created_at)) return unconfirmed()
    if (intent.kind === 'create') {
      if (own.estado !== 'pendiente' || own.aprobado_por != null || own.fecha_aprobacion != null || own.observaciones_aprobacion != null) return unconfirmed()
    } else if (own.id !== intent.request.id || own.estado !== (intent.action === 'aprobar' ? 'aprobada' : 'rechazada') ||
        own.aprobado_por !== intent.actorId || (own.observaciones_aprobacion ?? '') !== intent.payload.observaciones) return unconfirmed()
    return own
  } catch { return unconfirmed() }
}
