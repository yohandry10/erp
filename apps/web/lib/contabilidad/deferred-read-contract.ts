export interface DeferredRegisterRow {
  id: string; tenant_id: string; codigo?: string; nombre: string; tipo: 'GASTO' | 'INGRESO'
  monto_total: number; monto_devengado: number; monto_pendiente: number
  periodos: number; fecha_inicio: string; estado: 'VIGENTE' | 'DEVENGADO' | 'CANCELADO'
  cuenta_diferido_id: string; cuenta_resultado_id: string; centro_costo_id?: string | null
}
export interface DeferredAccount { id: string; tenant_id: string; codigo: string; nombre: string; estado: string; acepta_movimiento: boolean; nivel: number }
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v)
const text = (v: unknown): v is string => typeof v === 'string' && !!v.trim()
const money = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && Math.abs(v * 100 - Math.round(v * 100)) < .00001
const live = (v: Record<string, any>) => ['cached','queued','offline','pending'].every(k => v[k] === undefined || v[k] === false)
const date = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v+'T00:00:00Z')) && new Date(v+'T00:00:00Z').toISOString().slice(0,10) === v
function rows(value: unknown, tenantId: string, validate: (row: Record<string, any>) => boolean): any[] {
  if (!uuid(tenantId) || !object(value) || value.success !== true || !live(value) || !Array.isArray(value.data) ||
      (value.tenant_id !== undefined && value.tenant_id !== tenantId)) throw new Error('Se necesita el registro de diferidos y sus catálogos completos en vivo.')
  const ids = new Set<string>()
  for (const row of value.data) {
    if (!object(row) || !live(row) || !uuid(row.id) || row.tenant_id !== tenantId || ids.has(row.id) || !validate(row)) throw new Error('El registro contiene filas incompletas, incoherentes o de otra empresa.')
    ids.add(row.id)
  }
  return value.data
}
export function readDeferredRegister(value: unknown, tenantId: string): DeferredRegisterRow[] {
  return rows(value, tenantId, row => text(row.nombre) && (row.codigo === undefined || row.codigo === null || typeof row.codigo === 'string') &&
    ['GASTO','INGRESO'].includes(row.tipo) && ['VIGENTE','DEVENGADO','CANCELADO'].includes(row.estado) && date(row.fecha_inicio) &&
    Number.isInteger(row.periodos) && row.periodos > 0 && money(row.monto_total) && row.monto_total > 0 &&
    money(row.monto_devengado) && row.monto_devengado <= row.monto_total && money(row.monto_pendiente) &&
    Math.round(row.monto_pendiente * 100) === Math.round((row.monto_total-row.monto_devengado) * 100) &&
    uuid(row.cuenta_diferido_id) && uuid(row.cuenta_resultado_id) && row.cuenta_diferido_id !== row.cuenta_resultado_id &&
    (row.centro_costo_id === undefined || row.centro_costo_id === null || uuid(row.centro_costo_id)))
}
export function readDeferredAccounts(value: unknown, tenantId: string): DeferredAccount[] {
  const result = rows(value, tenantId, row => text(row.codigo) && text(row.nombre) && row.estado === 'ACTIVO' &&
    typeof row.acepta_movimiento === 'boolean' && Number.isInteger(row.nivel) && row.nivel > 0)
  const codes = new Set<string>()
  for (const row of result) { if (codes.has(row.codigo)) throw new Error('El catálogo contiene códigos de cuenta repetidos.'); codes.add(row.codigo) }
  return result
}
