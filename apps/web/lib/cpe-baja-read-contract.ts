export type TipoLote = 'RA' | 'RC'

export interface CpeBajaElegible {
  id: string
  tipo: TipoLote
  tipoDocumento: '01' | '03'
  serie: string
  numero: string
  fechaEmision: string
  receptor?: string
  receptorDocumento?: string
  total: number
  moneda: string
  reversaComercialConfirmada: true
}

export interface LoteFiscal {
  id: string
  tipo: TipoLote
  numero_comunicacion?: string
  numero_resumen?: string
  comprobantes_ids?: string[]
  estado: string
  motivo_baja?: string
  fecha_comunicacion?: string
  fecha_referencia?: string
  idempotency_key?: string
  ticket_sunat?: string
  codigo_respuesta?: string
  descripcion_respuesta?: string
  ultimo_error?: string
  next_retry_at?: string
}


const object = (v: any) => !!v && typeof v === 'object' && !Array.isArray(v)
const uuid = (v: any) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
const text = (v: any) => typeof v === 'string' && !!v.trim() && v.length <= 4096
const live = (v: any) => object(v) && ['cached','queued','offline','pending','from_cache'].every(key => v[key] === undefined || v[key] === false)
const money = (v: any) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && Number.isSafeInteger(Math.round(v * 100)) && Math.abs(v * 100 - Math.round(v * 100)) < 0.000001
const date = (v: any) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v.slice(0,10)+'T00:00:00Z').toISOString().slice(0,10) === v.slice(0,10)
const states = ['PENDIENTE','GENERADO','ENVIADO','ACEPTADO','RECHAZADO','ERROR']
function invalid(): never { throw new Error('No se pudieron confirmar las fuentes actuales de bajas fiscales. Reintente la consulta.') }
function rows(value: any): any[] {
  if (!live(value) || value.success !== true || !Array.isArray(value.data) || !value.data.every(live)) invalid()
  return value.data
}
const ids = (value: any) => Array.isArray(value) && value.length > 0 && value.every(uuid) && new Set(value.map((id: string) => id.toLowerCase())).size === value.length
export function readFiscalBajaSources(eligibleResponse: any, batchResponse: any, tipo: TipoLote, tenantId: string) {
  if (!['RA','RC'].includes(tipo) || !uuid(tenantId)) invalid()
  const eligible = rows(eligibleResponse), batches = rows(batchResponse)
  for (const group of [eligible,batches]) {
    if (new Set(group.map(row => typeof row.id === 'string' ? row.id.toLowerCase() : row.id)).size !== group.length) invalid()
    for (const row of group) if (!uuid(row.id) || row.tipo !== tipo || row.tenant_id !== undefined && row.tenant_id !== tenantId) invalid()
  }
  for (const row of eligible) {
    if (row.tipoDocumento !== (tipo === 'RA' ? '01' : '03') || !text(row.serie) || typeof row.numero !== 'string' || !/^\d{1,20}$/.test(row.numero)
      || !date(row.fechaEmision) || !money(row.total) || typeof row.moneda !== 'string' || !/^[A-Z]{3}$/.test(row.moneda)
      || row.reversaComercialConfirmada !== true || ['receptor','receptorDocumento'].some(key => row[key] != null && !text(row[key]))) invalid()
  }
  const reserved = new Set<string>()
  for (const row of batches) {
    if (!states.includes(row.estado) || row.tenant_id !== tenantId || !ids(row.comprobantes_ids)) invalid()
    for (const key of ['numero_comunicacion','numero_resumen','idempotency_key','ticket_sunat','codigo_respuesta','descripcion_respuesta','ultimo_error','motivo_baja']) if (row[key] != null && !text(row[key])) invalid()
    if (row.estado === 'PENDIENTE' && (!text(row.idempotency_key) || !date(tipo === 'RA' ? row.fecha_comunicacion : row.fecha_referencia) || tipo === 'RA' && (!text(row.motivo_baja) || row.motivo_baja.trim().length < 3))) invalid()
    if (row.estado === 'ENVIADO' && !text(row.ticket_sunat)) invalid()
    if (['PENDIENTE','GENERADO','ENVIADO','ACEPTADO'].includes(row.estado)) {
      for (const id of row.comprobantes_ids) { if (reserved.has(id.toLowerCase())) invalid(); reserved.add(id.toLowerCase()) }
    }
  }
  if (eligible.some(row => reserved.has(row.id.toLowerCase()))) invalid()
  return { eligible: eligible as CpeBajaElegible[], batches: batches as LoteFiscal[] }
}
