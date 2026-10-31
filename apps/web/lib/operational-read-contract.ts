const invalid = (): never => { throw new Error('Respuesta operativa incompleta') }
const object = (value: unknown): Record<string, any> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid()
  return value as Record<string, any>
}
const text = (value: unknown): string => {
  if (typeof value !== 'string' || !value.trim()) return invalid()
  return value
}
const number = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return invalid()
  return value
}
const count = (value: unknown): number => {
  if (!Number.isSafeInteger(value) || Number(value) < 0) return invalid()
  return value as number
}
const date = (value: unknown): string => {
  const result = text(value)
  if (!/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(result) || Number.isNaN(Date.parse(result))) return invalid()
  return result
}
const envelope = (response: unknown): unknown => {
  const value = object(response)
  if (value.success !== true || !('data' in value)) return invalid()
  return value.data
}
const rows = (value: unknown): any[] => {
  if (!Array.isArray(value)) return invalid()
  if (new Set(value.map(row => text(object(row).id))).size !== value.length) return invalid()
  return value
}

const dashboardLive = (value: unknown) => {
  const row = object(value)
  for (const flag of ['cached','queued','offline','pending']) {
    if (row[flag] !== undefined && row[flag] !== false) return invalid()
  }
  return row
}
const dashboardEnvelope = (response: unknown) => envelope(dashboardLive(response))

export function readDashboardStats(response: unknown) {
  const data = dashboardLive(dashboardEnvelope(response))
  for (const key of ['totalCpe','totalGre','totalSire','totalUsers','totalInventario','totalCompras','totalCotizaciones','productosConStockBajo','cotizacionesPendientes','ordenesCompraPendientes','movimientosHoy']) count(data[key])
  for (const key of ['ventasMes','ventasHoy','comprasMes','valorInventario','tasaConversionCotizaciones','crecimientoVentas']) number(data[key])
  const moneda = (value: unknown) => { if (typeof value !== 'string' || !/^[A-Z]{3}$/.test(value)) return invalid(); return value }
  const money = (value: unknown) => { const n = number(value); if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-7) return invalid(); return n }
  const base = moneda(data.monedaBase)
  if (!Array.isArray(data.importesPorMoneda) || !data.importesPorMoneda.length || data.importesPorMoneda.length > 100) return invalid()
  const codes = new Set<string>()
  for (const value of data.importesPorMoneda) {
    const row = object(value); const code = moneda(row.moneda)
    if (codes.has(code)) return invalid(); codes.add(code)
    money(row.ventasMes); money(row.ventasHoy); if (money(row.comprasMes) < 0) return invalid()
  }
  const primary = data.importesPorMoneda.find((row: any) => row.moneda === base)
  if (!primary || ['ventasMes','ventasHoy','comprasMes'].some(key => money(data[key]) !== primary[key])) return invalid()
  if (money(data.valorInventario) < 0 || data.tasaConversionCotizaciones < 0 || data.tasaConversionCotizaciones > 100) return invalid()
  date(data.ultimaActualizacion)
  const period = object(data.periodoCalculado)
  date(period.inicio); date(period.fin)
  if (period.inicio > period.fin) return invalid()
  return data
}

export function readDashboardActivities(response: unknown) {
  return rows(dashboardEnvelope(response)).map(value => {
    const row = dashboardLive(value)
    text(row.description); date(row.date)
    if (!['CPE','GRE','COMPRA','COTIZACION','VENTA'].includes(row.type) || !['success','warning','error','pending'].includes(row.status)) return invalid()
    if (row.amount !== undefined) {
      const amount = number(row.amount)
      if (Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-7 || typeof row.moneda !== 'string' || !/^[A-Z]{3}$/.test(row.moneda)) return invalid()
    }
    return row
  })
}

export interface OperationalDocument {
  id: string
  tipo_documento: string
  serie: string
  numero: string
  fecha_emision: string
  receptor_numero_doc: string
  receptor_razon_social: string
  total: number
  moneda: string
  estado: 'BORRADOR' | 'EMITIDO' | 'ENVIADO_SUNAT' | 'ACEPTADO' | 'RECHAZADO' | 'ANULADO'
  estado_sunat?: string
  observaciones?: string
  arca?: { cpe_id: string; codigo: number | null; estado: string; is_demo: boolean }
}

export function readDocumentList(response: unknown): OperationalDocument[] {
  return rows(envelope(response)).map(value => {
    const row = object(value)
    for (const key of ['tipo_documento','serie','numero','receptor_numero_doc','receptor_razon_social']) text(row[key])
    date(row.fecha_emision); number(row.total)
    if (!/^[A-Z]{3}$/.test(text(row.moneda)) || !['BORRADOR','EMITIDO','ENVIADO_SUNAT','ACEPTADO','RECHAZADO','ANULADO'].includes(row.estado)) return invalid()
    return row as OperationalDocument
  })
}

export interface DocumentStats {
  totalDocumentos: number; facturas: number; boletas: number
  notasCredito: number; contratos: number; pendientesEnvio: number
}
export function readDocumentStats(response: unknown): DocumentStats {
  const data = object(envelope(response))
  for (const key of ['totalDocumentos','facturas','boletas','notasCredito','contratos','pendientesEnvio']) count(data[key])
  if (['facturas','boletas','notasCredito','contratos','pendientesEnvio'].some(key => data[key] > data.totalDocumentos)) return invalid()
  return data as DocumentStats
}
