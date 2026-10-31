export type ConsignmentRow = {
  id: string; tenant_id: string; numero: string; fecha_registro: string; fecha_entrega?: string | null
  consignatario_nombre: string; cantidad: number; valor_unitario: number; valor_total: number
  moneda: string; estado: string; producto_id?: string | null
}
export type ConsignmentProduct = { id: string; tenant_id: string; codigo: string; nombre: string; activo: true }
const object = (v: any) => !!v && typeof v === 'object' && !Array.isArray(v)
const uuid = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
const text = (v: unknown) => typeof v === 'string' && !!v.trim()
const number = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0
const live = (v: any) => object(v) && ['cached','queued','offline','pending'].every(k => v[k] === undefined || v[k] === false)
const date = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v+'T00:00:00Z')) && new Date(v+'T00:00:00Z').toISOString().slice(0,10) === v
function rows(value: any, tenantId: string, validate: (row: any) => boolean): any[] {
  if (!uuid(tenantId) || !live(value) || value.success !== true || value.complete !== true || !Array.isArray(value.data) ||
      !Number.isSafeInteger(value.total) || value.total !== value.data.length || (value.tenant_id !== undefined && value.tenant_id !== tenantId)) {
    throw new Error('Se necesita el registro y los productos completos en vivo. Reintente la consulta.')
  }
  const ids = new Set<string>()
  for (const row of value.data) {
    if (!live(row) || !uuid(row.id) || row.tenant_id !== tenantId || ids.has(row.id) || !validate(row)) {
      throw new Error('El registro o sus productos contienen datos incompletos, incoherentes o de otra empresa.')
    }
    ids.add(row.id)
  }
  return value.data
}
export function readConsignmentRegister(value: any, tenantId: string, state = ''): ConsignmentRow[] {
  return rows(value, tenantId, row => text(row.numero) && text(row.consignatario_nombre) && date(row.fecha_registro) &&
    (row.fecha_entrega === undefined || row.fecha_entrega === null || date(row.fecha_entrega)) &&
    (row.producto_id === undefined || row.producto_id === null || uuid(row.producto_id)) &&
    number(row.cantidad) && row.cantidad > 0 && number(row.valor_unitario) && number(row.valor_total) &&
    Number.isSafeInteger(Math.round(row.valor_total*100)) && Math.abs(row.valor_total*100-Math.round(row.valor_total*100)) < .00001 &&
    Math.abs(Math.round((row.cantidad*row.valor_unitario+Number.EPSILON)*100)-Math.round(row.valor_total*100)) <= 0 &&
    typeof row.moneda === 'string' && /^[A-Z]{3}$/.test(row.moneda) && ['PENDIENTE','VENDIDA','DEVUELTA','CERRADA','ANULADA'].includes(row.estado) && (!state || row.estado === state))
}
export function readConsignmentProducts(value: any, tenantId: string): ConsignmentProduct[] {
  return rows(value, tenantId, row => text(row.codigo) && text(row.nombre) && row.activo === true)
}
export function consignmentTotals(rows: ConsignmentRow[]): { moneda: string; total: number }[] {
  const totals = new Map<string, number>()
  for (const row of rows) totals.set(row.moneda, (totals.get(row.moneda) || 0) + Math.round(row.valor_total*100))
  return [...totals].sort(([a],[b]) => a.localeCompare(b)).map(([moneda,total]) => ({ moneda,total:total/100 }))
}
export function consignmentDestinations(state: string): string[] {
  return state === 'PENDIENTE' ? ['VENDIDA','DEVUELTA','ANULADA'] : state === 'VENDIDA' ? ['CERRADA'] : []
}
