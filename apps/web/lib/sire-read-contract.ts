export type SireReadFilters = { periodo: string; tipoReporte: string; estado: string }
export type SireReadStats = { periodoActual: string; reportesDelMes: number; registrosTotales: number; totalDetalles: number; enviadosASunat: number; pendientes: number }
const object = (v: any) => !!v && typeof v === 'object' && !Array.isArray(v)
const uuid = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
const live = (v: any) => object(v) && ['cached','queued','offline','pending'].every(k => v[k] === undefined || v[k] === false)
const period = (v: unknown) => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v)
const timestamp = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v))
const count = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0
const reportStates = ['GENERANDO','GENERADO','PENDIENTE','ENVIADO','ERROR']
function envelope(v: any, tenantId: string) {
  if (!uuid(tenantId) || !live(v) || v.success !== true || v.complete !== true || v.tenant_id !== tenantId) throw new Error('Se necesita una lectura SIRE completa en vivo. Reintente la consulta.')
}
function rows(v: any, tenantId: string, validate: (row: any) => boolean): any[] {
  envelope(v,tenantId)
  if (!Array.isArray(v.data) || !count(v.total) || v.total !== v.data.length) throw new Error('La lectura SIRE está incompleta.')
  const ids=new Set<string>()
  for (const r of v.data) {
    if (!live(r) || !uuid(r.id) || r.tenant_id !== tenantId || ids.has(r.id) || !validate(r)) throw new Error('La lectura SIRE contiene datos incompletos o ajenos.')
    ids.add(r.id)
  }
  return v.data
}
export function readSireReports(v: any, tenantId: string, filters: SireReadFilters): any[] {
  const type=filters.tipoReporte === 'REGISTRO_VENTAS' ? 'REG_VEN' : filters.tipoReporte === 'REGISTRO_COMPRAS' ? 'REG_COM' : filters.tipoReporte
  return rows(v,tenantId,r => ['REG_VEN','REG_COM'].includes(r.tipo) && period(r.periodo) && timestamp(r.created_at) &&
    count(r.total_registros) && reportStates.includes(r.estado) && (!filters.periodo || r.periodo === filters.periodo) &&
    (!type || r.tipo === type) && (!filters.estado || r.estado === filters.estado) &&
    (r.filename === undefined || r.filename === null || typeof r.filename === 'string'))
}
export function readSireStats(v: any, tenantId: string): SireReadStats {
  envelope(v,tenantId)
  if (!live(v.data) || !period(v.data.periodoActual) || !['reportesDelMes','registrosTotales','totalDetalles','enviadosASunat','pendientes'].every(k=>count(v.data[k]))) throw new Error('Las estadísticas SIRE están incompletas o no disponibles.')
  return v.data
}
export function readSireOperations(v: any, tenantId: string, reportId: string): any[] {
  if (!uuid(reportId) || v?.reporte_id !== reportId) throw new Error('La bitácora no corresponde al reporte seleccionado.')
  return rows(v,tenantId,r => r.reporte_id === reportId && ['ACEPTAR_PROPUESTA','CONSULTAR_TICKET'].includes(r.accion) &&
    typeof r.estado === 'string' && ['SOLICITADO','PROCESANDO','TERMINADO','ERROR'].includes(r.estado) && timestamp(r.solicitado_at))
}

export async function readSireFrozenDownload(response: any, expected: any, tenantId: string): Promise<{ content: string; filename: string }> {
  const current = (value: any) => live(value) && (value.from_cache === undefined || value.from_cache === false)
  const hash = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value)
  const filename = (value: unknown): value is string => typeof value === 'string' && /^[^\\/\x00-\x1f]{1,255}$/.test(value) && value.trim().length > 0
  const invalid = (): never => { throw new Error('No se pudo verificar la instantánea SIRE seleccionada. Reintenta la descarga.') }
  if (!uuid(tenantId) || !current(expected) || expected.tenant_id !== tenantId || !uuid(expected.id)
    || !['GENERADO', 'ENVIADO'].includes(expected.estado) || !['REG_COM', 'REG_VEN'].includes(expected.tipo)
    || !period(expected.periodo) || !filename(expected.filename) || !hash(expected.contenido_sha256)
    || !hash(expected.source_fingerprint) || !timestamp(expected.source_cutoff_at)
    || !current(response) || response.success !== true || typeof response.data !== 'string'
    || response.filename !== expected.filename || response.contentType !== 'text/plain; charset=utf-8'
    || !current(response.metadata)) return invalid()
  const metadata = response.metadata
  if (metadata.sha256 !== expected.contenido_sha256 || metadata.sourceFingerprint !== expected.source_fingerprint
    || metadata.sourceCutoffAt !== expected.source_cutoff_at || !globalThis.crypto?.subtle) return invalid()
  const bytes = new TextEncoder().encode(response.data)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  const actual = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('')
  if (actual !== expected.contenido_sha256.toLowerCase()) return invalid()
  return { content: response.data, filename: expected.filename }
}
