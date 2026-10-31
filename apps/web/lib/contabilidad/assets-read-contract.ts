const id = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const money = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0
const live = (value: Record<string, unknown>) => ['cached', 'queued', 'offline', 'pending'].every(key => value[key] === undefined || value[key] === false)
const date = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value

export interface AssetRegisterRow {
  id: string
  tenant_id: string
  codigo: string
  nombre: string
  descripcion?: string
  fecha_adquisicion: string
  valor_adquisicion: number
  valor_residual: number
  vida_util_meses: number
  depreciacion_acumulada: number
  valor_neto: number
  situacion: 'ACTIVO' | 'DEPRECIADO' | 'BAJA' | 'VENDIDO'
  fecha_baja?: string
}
export interface AssetCostCenter { id: string; tenant_id: string; nombre: string; codigo?: string }

function rows(value: unknown, tenantId: string | undefined, valid: (row: Record<string, unknown>) => boolean): Record<string, unknown>[] {
  if (!id(tenantId) || !object(value) || value.success !== true || !live(value) || !Array.isArray(value.data)) throw new Error('Se necesita una respuesta completa en vivo del registro y sus catálogos.')
  if (value.tenant_id !== undefined && value.tenant_id !== tenantId) throw new Error('La respuesta pertenece a otra empresa.')
  const seen = new Set<string>()
  for (const row of value.data) {
    if (!object(row) || !live(row) || !id(row.id) || row.tenant_id !== tenantId || seen.has(row.id) || !valid(row)) throw new Error('La respuesta del registro contiene filas incompletas o de otra empresa.')
    seen.add(row.id)
  }
  return value.data
}

export function readAssetRegister(value: unknown, tenantId: string | undefined): AssetRegisterRow[] {
  return rows(value, tenantId, row => text(row.codigo) && text(row.nombre) && date(row.fecha_adquisicion) &&
    money(row.valor_adquisicion) && row.valor_adquisicion > 0 && money(row.valor_residual) && row.valor_residual <= row.valor_adquisicion &&
    typeof row.vida_util_meses === 'number' && Number.isInteger(row.vida_util_meses) && row.vida_util_meses >= 1 &&
    money(row.depreciacion_acumulada) && row.depreciacion_acumulada <= row.valor_adquisicion && money(row.valor_neto) &&
    Math.abs(row.valor_neto - (row.valor_adquisicion - row.depreciacion_acumulada)) < 0.011 &&
    typeof row.situacion === 'string' && ['ACTIVO', 'DEPRECIADO', 'BAJA', 'VENDIDO'].includes(row.situacion) &&
    (row.fecha_baja === undefined || row.fecha_baja === null || date(row.fecha_baja))) as unknown as AssetRegisterRow[]
}

export function readAssetCostCenters(value: unknown, tenantId: string | undefined): AssetCostCenter[] {
  return rows(value, tenantId, row => text(row.nombre) && (row.codigo === undefined || row.codigo === null || typeof row.codigo === 'string')) as unknown as AssetCostCenter[]
}

export interface AssetScheduleRow { registrada?: boolean; periodo: string; cuota: number; acumulada: number; valor_neto: number }

export function readAssetSchedule(value: unknown, tenantId: string | undefined, asset: Pick<AssetRegisterRow, 'id' | 'tenant_id' | 'valor_adquisicion'>): AssetScheduleRow[] {
  if (!id(tenantId) || !id(asset.id) || asset.tenant_id !== tenantId || !money(asset.valor_adquisicion) || asset.valor_adquisicion <= 0 ||
      !object(value) || value.success !== true || !live(value) || !Array.isArray(value.data) ||
      (value.tenant_id !== undefined && value.tenant_id !== tenantId) || (value.activo_id !== undefined && value.activo_id !== asset.id)) throw new Error('Se necesita un cronograma completo en vivo del activo seleccionado.')
  let previousPeriod = ''
  let previousAccumulated = 0
  for (const row of value.data) {
    if (!object(row) || !live(row) || typeof row.periodo !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(row.periodo) || row.periodo <= previousPeriod ||
        !money(row.cuota) || !money(row.acumulada) || !money(row.valor_neto) || row.acumulada < row.cuota || row.acumulada < previousAccumulated ||
        row.acumulada > asset.valor_adquisicion || Math.abs(row.valor_neto - (asset.valor_adquisicion - row.acumulada)) >= 0.011 ||
        (row.registrada !== undefined && typeof row.registrada !== 'boolean')) throw new Error('El cronograma contiene períodos o importes incompletos o incoherentes.')
    previousPeriod = row.periodo
    previousAccumulated = row.acumulada
  }
  return value.data as AssetScheduleRow[]
}
