export type GreAction = 'firmar' | 'enviar-sunat' | 'reenviar' | 'consultar-sunat' | 'anular'
export type GreDocument = {
  id: string; numero: string; destinatario: string; direccionDestino: string
  fechaTraslado: string; fechaCreacion: string; modalidad: 'TRANSPORTE_PUBLICO' | 'TRANSPORTE_PRIVADO'
  motivo: string; pesoTotal: number
  estado: 'BORRADOR' | 'FIRMADO' | 'ENVIADO' | 'ACEPTADO' | 'RECHAZADO' | 'ANULADO' | 'ERROR'
  observaciones?: string; transportista?: string; transportistaDocumento?: string; placaVehiculo?: string
  licenciaConducir?: string; conductorDocumentoTipo?: string; conductorDocumentoNumero?: string
  conductorNombres?: string; conductorApellidos?: string; sunatStatus?: string; errorMessage?: string
  items?: { descripcion: string; cantidad: number; unidadMedida?: string }[]
}
export type GreStats = { greEmitidas: number; totalGre: number; enTransito: number; completados: number }
export type GreIntent = { documentId: string; action: GreAction; key: string }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const states = ['BORRADOR','FIRMADO','ENVIADO','ACEPTADO','RECHAZADO','ANULADO','ERROR']
const actions = ['firmar','enviar-sunat','reenviar','consultar-sunat','anular']
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const validDate = (value: unknown) => nonempty(value) && /^\d{4}-\d{2}-\d{2}/.test(value) && Number.isFinite(Date.parse(value))
function data(response: any) {
  if (response?.success !== true || response.offline || response.pending || response.data?.offline || response.data?.pending || !('data' in response)) throw new Error('La respuesta de GRE está incompleta.')
  return response.data
}
function document(value: any): GreDocument {
  if (!uuid.test(value?.id || '') || !['numero','destinatario','direccionDestino','motivo'].every(key => nonempty(value[key]))
    || !validDate(value.fechaTraslado) || !validDate(value.fechaCreacion)
    || !['TRANSPORTE_PUBLICO','TRANSPORTE_PRIVADO'].includes(value.modalidad) || !states.includes(value.estado)
    || !finite(value.pesoTotal) || value.pesoTotal <= 0) throw new Error('La guía recibida está incompleta.')
  return value
}
export function greList(response: any): GreDocument[] {
  const rows = data(response)
  if (!Array.isArray(rows)) throw new Error('El listado de GRE está incompleto.')
  const result = rows.map(document)
  if (new Set(result.map(row => row.id)).size !== result.length) throw new Error('El listado contiene guías repetidas.')
  return result
}
export function greStats(response: any): GreStats {
  const value = data(response)
  if (!value || !['greEmitidas','totalGre','enTransito','completados'].every(key => Number.isSafeInteger(value[key]) && value[key] >= 0)
    || ['greEmitidas','enTransito','completados'].some(key => value[key] > value.totalGre)) throw new Error('Los indicadores de GRE están incompletos.')
  return value
}
export function greDetail(response: any, id: string): GreDocument {
  const value = document(data(response))
  if (value.id !== id || !Array.isArray(value.items) || !value.items.length
    || value.items.some(row => !nonempty(row.descripcion) || !finite(row.cantidad) || row.cantidad <= 0 || !nonempty(row.unidadMedida))) throw new Error('El detalle de la guía está incompleto.')
  return value
}
export function greCreated(response: any, intent: any): GreDocument {
  const value = document(data(response))
  if (!['BORRADOR','FIRMADO'].includes(value.estado) || value.destinatario !== intent.destinatario || value.modalidad !== intent.modalidad
    || value.motivo !== intent.motivo || value.pesoTotal !== intent.pesoTotal || value.fechaTraslado.slice(0,10) !== intent.fechaTraslado.slice(0,10)) throw new Error('El alta de GRE no fue confirmada.')
  return value
}
export type GreCreationIntent = { payload: any; draft: { formData: any; recipient: any; manualItems: any[]; partidaId: string; llegadaId: string } }
export function readGreCreationIntent(serialized: string | null): GreCreationIntent | null {
  if (!serialized) return null
  const value = JSON.parse(serialized); const payload = value?.payload; const draft = value?.draft
  if (!payload || !draft || !/^gre-create:[0-9a-f-]{36}$/i.test(payload.idempotencyKey || '')
    || !['destinatario','direccionDestino','motivo','modalidad'].every(key => nonempty(payload[key]))
    || !validDate(payload.fechaTraslado) || !finite(payload.pesoTotal) || payload.pesoTotal <= 0 || !draft.formData || !draft.recipient || !Array.isArray(draft.manualItems)) throw new Error('No se pudo recuperar el intento de alta GRE. Consulte nuevamente sus datos.')
  return value
}
type GreCreationContext = { pedidoId?: string; dispatches?: unknown }
function dispatchIds(value: unknown): string[] | null {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.some(id => typeof id !== 'string' || !uuid.test(id)) || new Set(value).size !== value.length) return null
  return [...value].sort()
}
export function greCreationMatchesContext(payload: any, context: GreCreationContext): boolean {
  if (!payload || (context.pedidoId !== undefined && !uuid.test(context.pedidoId))
    || payload.pedidoId !== context.pedidoId) return false
  const expected = dispatchIds(context.dispatches); const actual = dispatchIds(payload.despachosAsociados)
  if (!expected || !actual || expected.length !== actual.length || expected.some((id, index) => id !== actual[index])) return false
  const metadata = payload.datosAdicionales?.despacho
  return metadata === undefined || actual.length === 1 && metadata === actual[0]
}
export function greCreationRecoveryPath(payload: any, pedidoId?: string): string | null {
  if (!pedidoId || !uuid.test(pedidoId) || !greCreationMatchesContext(payload, { pedidoId, dispatches: payload?.despachosAsociados })) return null
  const dispatches = dispatchIds(payload.despachosAsociados)
  if (!dispatches || dispatches.length > 1) return null
  return `/dashboard/gre/nueva/?pedido_id=${encodeURIComponent(pedidoId)}${dispatches.length ? `&despacho=${encodeURIComponent(dispatches[0])}` : ''}`
}
export function greEstablishments(response: any): { id: string; nombre: string; codigo_establecimiento: string; direccion?: string | null; ubigeo?: string | null; activo: boolean }[] {
  const rows = data(response)
  if (!Array.isArray(rows) || rows.some(row => !uuid.test(row?.id || '') || !nonempty(row.nombre) || !/^\d{4}$/.test(row.codigo_establecimiento || '') || typeof row.activo !== 'boolean')
    || new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('Los establecimientos están incompletos.')
  return rows.filter(row => row.activo)
}
export function greProducts(response: any): { id: string; codigo: string; nombre: string; unidad_medida?: string }[] {
  const rows = data(response)
  if (!Array.isArray(rows) || rows.some(row => !uuid.test(row?.id || '') || !nonempty(row.nombre) || !nonempty(row.codigo) || typeof row.activo !== 'boolean')
    || new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('Los productos están incompletos.')
  return rows.filter(row => row.activo && !row.es_servicio)
}
export function greConfirmation(response: any, intent: GreIntent): GreDocument {
  const value = document(data(response))
  const expected = intent.action === 'anular' ? ['ANULADO'] : intent.action === 'firmar' ? ['FIRMADO'] : intent.action === 'consultar-sunat' ? ['ENVIADO','ACEPTADO','RECHAZADO','ERROR'] : ['ENVIADO','ACEPTADO']
  if (value.id !== intent.documentId || !expected.includes(value.estado)) throw new Error('La acción de GRE no fue confirmada.')
  return value
}
export function readGreIntent(value: string | null, documentId: string): GreIntent | null {
  if (!value) return null
  const parsed = JSON.parse(value)
  if (parsed?.documentId !== documentId || !uuid.test(documentId) || !actions.includes(parsed.action)
    || typeof parsed.key !== 'string' || !new RegExp(`^gre-${parsed.action}:[0-9a-f-]{36}$`, 'i').test(parsed.key)) throw new Error('No se pudo recuperar el intento de GRE. Consulte nuevamente la guía.')
  return parsed
}
export function greTransportNotApplied(error: unknown, action: GreAction): boolean {
  const status = (error as { status?: unknown } | null)?.status
  const data = (error as { data?: { statusCode?: unknown; error?: unknown; offline?: unknown; pending?: unknown; queued?: unknown } } | null)?.data
  return ['enviar-sunat', 'reenviar', 'consultar-sunat'].includes(action)
    && status === 400 && data?.statusCode === 400 && data.error === 'DEMO_EXTERNAL_TRANSPORT_BLOCKED'
    && !data.offline && !data.pending && !data.queued
}
export const greCsvHeader = ['serie','numero','fecha_emision','fecha_traslado','destinatario','direccion_destino','modalidad','motivo','peso_total','estado','sunat_status','numero_sunat']
export function parseGreCsv(csv: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i]
    if (c === '"') { if (quoted && csv[i+1] === '"') { cell += '"'; i++ } else quoted = !quoted }
    else if (!quoted && (c === ',' || c === '\n')) { row.push(cell); cell = ''; if (c === '\n') { rows.push(row); row = [] } }
    else if (c !== '\r' || quoted) cell += c
  }
  if (quoted) throw new Error('El CSV de GRE está incompleto.')
  if (cell || row.length) { row.push(cell); rows.push(row) }
  if (JSON.stringify(rows[0]) !== JSON.stringify(greCsvHeader) || rows.some(r => r.length !== greCsvHeader.length)
    || rows.slice(1).some(r => !r[1] || !validDate(r[3]) || !r[4] || !Number.isFinite(Number(r[8])) || Number(r[8]) <= 0 || !states.includes(r[9]))) throw new Error('El CSV de GRE no contiene el reporte completo.')
  return rows
}
