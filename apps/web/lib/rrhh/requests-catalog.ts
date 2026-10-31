type Scope = { tenantId: string; actorId: string }
export type RequestEmployee = {
  id: string; tenant_id: string; nombres: string; apellidos: string;
  numero_documento: string; estado: 'activo' | 'inactivo'; activo: boolean;
}
export type EmployeeRequest = {
  id: string; tenant_id: string; id_empleado: string; tipo: string;
  fecha_inicio: string; fecha_fin: string; dias: number; estado: string;
  motivo: string; aprobado_por: string | null; fecha_aprobacion: string | null;
  observaciones_aprobacion: string | null; empleados?: {
    nombres: string; apellidos: string; numero_documento: string;
  } | null;
}
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const text = (v: unknown): v is string => typeof v === 'string' && !!v.trim()
const date = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v + 'T00:00:00Z')) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v
const time = (v: unknown) => typeof v === 'string' && date(v.slice(0, 10)) && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v))
function fail(): never { throw new Error('No se pudieron verificar las solicitudes y los empleados de esta empresa. Usa Actualizar para reintentar.') }
function rows(value: unknown, scope: Scope): Record<string, unknown>[] {
  if (!uuid(scope.tenantId) || !uuid(scope.actorId)) fail()
  let result = value
  if (object(value)) {
    if (value.success !== true || !Array.isArray(value.data)) fail()
    result = value.data
    for (const count of ['count', 'total', 'totalCount']) {
      if (value[count] !== undefined && (!Number.isInteger(value[count]) || value[count] !== value.data.length)) fail()
    }
    if (value.hasMore === true || value.nextCursor != null) fail()
    if (value.tenant_id !== undefined && value.tenant_id !== scope.tenantId) fail()
  }
  // Existing endpoints return an unpaged array. A full PostgREST default page
  // cannot establish that the employee/request catalogue is complete.
  if (!Array.isArray(result) || result.length >= 1000) fail()
  const seen = new Set<string>()
  return result.map(row => {
    if (!object(row) || !uuid(row.id) || row.tenant_id !== scope.tenantId || seen.has(row.id)) fail()
    seen.add(row.id)
    return row
  })
}
export function readRequestCatalogs(requests: unknown, employees: unknown, scope: Scope) {
  const people = rows(employees, scope).map(row => {
    if (!text(row.nombres) || !text(row.apellidos) || !text(row.numero_documento) ||
        !['activo', 'inactivo'].includes(String(row.estado)) || typeof row.activo !== 'boolean') fail()
    return row as unknown as RequestEmployee
  })
  const byId = new Map(people.map(person => [person.id, person]))
  const list = rows(requests, scope).map(row => {
    const person = byId.get(String(row.id_empleado))
    if (!uuid(row.id_empleado) || !person ||
        !['vacaciones', 'licencia', 'permiso', 'descanso_medico', 'compensacion', 'otro'].includes(String(row.tipo)) ||
        !['pendiente', 'aprobada', 'rechazada', 'cancelada', 'anulada'].includes(String(row.estado)) ||
        !date(row.fecha_inicio) || !date(row.fecha_fin) || row.fecha_fin < row.fecha_inicio ||
        !Number.isInteger(row.dias) || row.dias !== (Date.parse(row.fecha_fin + 'T00:00:00Z') - Date.parse(row.fecha_inicio + 'T00:00:00Z')) / 86400000 + 1 ||
        !text(row.motivo) || row.motivo.length > 2000) fail()
    if (row.estado === 'aprobada' || row.estado === 'rechazada') {
      if (!uuid(row.aprobado_por) || !time(row.fecha_aprobacion)) fail()
    }
    if (row.observaciones_aprobacion != null && typeof row.observaciones_aprobacion !== 'string') fail()
    if (row.empleados != null) {
      if (!object(row.empleados) || row.empleados.nombres !== person.nombres || row.empleados.apellidos !== person.apellidos || row.empleados.numero_documento !== person.numero_documento) fail()
    }
    return row as unknown as EmployeeRequest
  })
  return { requests: list, employees: people, scope: `${scope.tenantId}:${scope.actorId}` }
}
