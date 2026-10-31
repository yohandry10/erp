export interface PeriodSnapshot {
  id: string
  tenant_id: string
  anio: number
  mes: number
  codigo: string
  nombre: string
  estado: 'ABIERTO' | 'CERRADO' | 'BLOQUEADO'
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  fecha_cierre: string | null
  cerrado_por: string | null
}

export interface PeriodClosurePreview {
  puedeCerrar: boolean
  estado: { valido: boolean; actual: PeriodSnapshot['estado'] }
  previos: { valido: boolean; periodos: Array<{ id: string; anio: number; mes: number; estado: 'ABIERTO' }> }
  borradores: { valido: boolean; cantidad: number }
  asientos: { valido: boolean; cantidadInvalidos: number; asientosDescuadrados: Array<{ id: string; total_debe: number; total_haber: number }> }
  eventos: { valido: boolean; eventosPendientes: number }
  cierreAnual: { valido: boolean }
}

const invalid = (): never => { throw new Error('Respuesta de períodos incompleta o inconsistente. Reintente la consulta.') }
const object = (value: unknown): Record<string, any> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid()
  return value as Record<string, any>
}
const live = (value: unknown) => {
  const row = object(value)
  if (row.success === false) return invalid()
  for (const key of ['cached', 'queued', 'offline', 'pending']) {
    if (row[key] !== undefined && row[key] !== false) return invalid()
  }
  return row
}
const uuid = (value: unknown): string => {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return invalid()
  return value
}
const text = (value: unknown): string => {
  if (typeof value !== 'string' || !value.trim()) return invalid()
  return value
}
const count = (value: unknown): number => {
  if (!Number.isSafeInteger(value) || Number(value) < 0) return invalid()
  return value as number
}
const bool = (value: unknown): boolean => {
  if (typeof value !== 'boolean') return invalid()
  return value
}
const year = (value: unknown): number => {
  const n = count(value)
  if (n < 1900 || n > 9999) return invalid()
  return n
}
const month = (value: unknown): number => {
  const n = count(value)
  if (n < 1 || n > 12) return invalid()
  return n
}
const state = (value: unknown): PeriodSnapshot['estado'] => {
  if (!['ABIERTO', 'CERRADO', 'BLOQUEADO'].includes(value as string)) return invalid()
  return value as PeriodSnapshot['estado']
}
const stamp = (value: unknown): string => {
  const raw = text(value)
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(raw)
  if (!match || !Number.isFinite(Date.parse(raw))) return invalid()
  const y = Number(match[1]), m = Number(match[2]), d = Number(match[3])
  if (y < 1000 || m < 1 || m > 12 || d < 1 || d > new Date(Date.UTC(y, m, 0)).getUTCDate()) return invalid()
  if (Number(match[4]) > 23 || Number(match[5]) > 59 || Number(match[6]) > 59 || Number(match[7] || 0) > 23 || Number(match[8] || 0) > 59) return invalid()
  return raw
}
const civilDate = (value: unknown): string => {
  const raw = text(value), match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  if (!match) return invalid()
  const y = Number(match[1]), m = Number(match[2]), d = Number(match[3])
  if (y < 1000 || m < 1 || m > 12 || d < 1 || d > new Date(Date.UTC(y, m, 0)).getUTCDate()) return invalid()
  return raw
}
const envelope = (response: unknown) => {
  const row = live(response)
  if (row.success !== true || !('data' in row)) return invalid()
  return row.data
}
const readRow = (value: unknown, tenantId: string): PeriodSnapshot => {
  uuid(tenantId)
  const row = live(value)
  uuid(row.id)
  if (uuid(row.tenant_id) !== tenantId) return invalid()
  const anio = year(row.anio), mes = month(row.mes), estado = state(row.estado)
  if (text(row.codigo) !== `${anio}-${String(mes).padStart(2, '0')}`) return invalid()
  text(row.nombre); object(row.metadata)
  stamp(row.created_at); stamp(row.updated_at)
  if (Date.parse(row.updated_at) < Date.parse(row.created_at)) return invalid()
  if (!('fecha_cierre' in row) || !('cerrado_por' in row)) return invalid()
  if (row.fecha_cierre !== null) civilDate(row.fecha_cierre)
  if (row.cerrado_por !== null) uuid(row.cerrado_por)
  if ((row.fecha_cierre === null) !== (row.cerrado_por === null)) return invalid()
  if (estado === 'ABIERTO' && row.fecha_cierre !== null) return invalid()
  if (estado === 'CERRADO' && row.fecha_cierre === null) return invalid()
  return row as PeriodSnapshot
}

export function readPeriodCatalog(response: unknown, tenantId: string): PeriodSnapshot[] {
  uuid(tenantId)
  const data = envelope(response)
  if (!Array.isArray(data)) return invalid()
  const ids = new Set<string>(), periods = new Set<string>()
  const rows = data.map(value => {
    const row = readRow(value, tenantId), key = `${row.anio}-${row.mes}`
    if (ids.has(row.id) || periods.has(key)) return invalid()
    ids.add(row.id); periods.add(key)
    return row
  })
  return rows.sort((a,b) => b.anio - a.anio || b.mes - a.mes)
}

export function readPeriodDetail(response: unknown, tenantId: string, id: string): PeriodSnapshot {
  uuid(id)
  const row = readRow(envelope(response), tenantId)
  if (row.id !== id) return invalid()
  return row
}

export function readPeriodClosurePreview(response: unknown, selected: Pick<PeriodSnapshot, 'id' | 'anio' | 'mes'>): PeriodClosurePreview {
  uuid(selected.id); year(selected.anio); month(selected.mes)
  const data = live(response)
  const current = live(data.estado), previous = live(data.previos), drafts = live(data.borradores), journals = live(data.asientos), events = live(data.eventos), annual = live(data.cierreAnual)
  const actual = state(current.actual)
  if (bool(current.valido) !== (actual === 'ABIERTO')) return invalid()
  if (!Array.isArray(previous.periodos)) return invalid()
  const ids = new Set<string>(), months = new Set<number>()
  for (const value of previous.periodos) {
    const row = live(value), id = uuid(row.id), mes = month(row.mes)
    if (id === selected.id || year(row.anio) !== selected.anio || mes >= selected.mes || row.estado !== 'ABIERTO' || ids.has(id) || months.has(mes)) return invalid()
    ids.add(id); months.add(mes)
  }
  if (bool(previous.valido) !== (previous.periodos.length === 0)) return invalid()
  if (bool(drafts.valido) !== (count(drafts.cantidad) === 0)) return invalid()
  if (bool(journals.valido) !== (count(journals.cantidadInvalidos) === 0)) return invalid()
  if (!Array.isArray(journals.asientosDescuadrados) || journals.asientosDescuadrados.length > journals.cantidadInvalidos) return invalid()
  const journalIds = new Set<string>()
  for (const value of journals.asientosDescuadrados) {
    const row = live(value), id = uuid(row.id)
    if (journalIds.has(id)) return invalid()
    journalIds.add(id)
    for (const key of ['total_debe', 'total_haber']) {
      if (typeof row[key] !== 'number' || !Number.isFinite(row[key])) return invalid()
    }
  }
  if (bool(events.valido) !== (count(events.eventosPendientes) === 0)) return invalid()
  const annualValid = bool(annual.valido)
  if (selected.mes !== 12 && !annualValid) return invalid()
  const allowed = current.valido && previous.valido && drafts.valido && journals.valido && events.valido && annualValid
  if (bool(data.puedeCerrar) !== allowed) return invalid()
  return data as PeriodClosurePreview
}
