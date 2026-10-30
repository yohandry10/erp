export type MonitorStats = { pending: number; processed: number; processed_today: number; failed: number; dead_letter: number; avg_processing_time_ms: number | null }
export type MonitorEvent = { id: string; event_id: string; event_type: string; error_message: string | null; retry_count: number; status: string; created_at: string }
export type MonitorJournalType = { tipo: string; cantidad: number }
const object = (v: any) => !!v && typeof v === 'object' && !Array.isArray(v)
const live = (v: any) => object(v) && ['cached','queued','offline','pending'].every(k=>v[k] === undefined || v[k] === false)
const uuid = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
const count = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0
function envelope(v: any,tenant: string,events=false) {
  if (!uuid(tenant) || !live(v) || v.success !== true || v.complete !== true || v.tenant_id !== tenant || (events && v.scope !== 'ACCOUNTING_OWNED_EVENTS')) throw new Error('Monitoreo no disponible: se necesita una lectura completa en vivo de esta empresa.')
}
export function readMonitorSnapshot(stats: any,failed: any,dead: any,journals: any,tenant: string) {
  envelope(stats,tenant,true);envelope(failed,tenant,true);envelope(dead,tenant,true);envelope(journals,tenant)
  const s=stats.data
  // El campo pending es un contador dentro de stats; no es una marca de cola offline.
  if (!object(s) || ['cached','queued','offline'].some(k=>s[k] === true) || !['pending','processed','processed_today','failed','dead_letter'].every(k=>count(s[k])) ||
      !Object.prototype.hasOwnProperty.call(s,'avg_processing_time_ms') || (s.avg_processing_time_ms !== null && (typeof s.avg_processing_time_ms !== 'number' || !Number.isFinite(s.avg_processing_time_ms) || s.avg_processing_time_ms < 0))) throw new Error('Las estadísticas contables están incompletas o fuera de rango.')
  const ids=new Set<string>(),eventIDs=new Set<string>()
  for (const [v,state,total] of [[failed,'failed',s.failed],[dead,'dead_letter',s.dead_letter]] as const) {
    if (!Array.isArray(v.data) || v.window_limit !== 10 || !count(v.window_count) || v.window_count !== v.data.length || v.data.length !== Math.min(10,total)) throw new Error('La ventana de eventos contables está incompleta o cambió durante la consulta.')
    for (const r of v.data) {
      if (!live(r) || !uuid(r.id) || !uuid(r.event_id) || ids.has(r.id) || eventIDs.has(r.event_id) || (r.tenant_id !== undefined && r.tenant_id !== tenant) || r.status?.toLowerCase() !== state || typeof r.event_type !== 'string' || !r.event_type.trim() || !count(r.retry_count) || typeof r.created_at !== 'string' || !Number.isFinite(Date.parse(r.created_at)) || (r.error_message !== null && typeof r.error_message !== 'string')) throw new Error('La ventana contiene eventos incoherentes o ajenos.')
      ids.add(r.id);eventIDs.add(r.event_id)
    }
  }
  if (!Array.isArray(journals.data) || !count(journals.total) || journals.total !== journals.data.length) throw new Error('La distribución de asientos está incompleta.')
  const types=new Set<string>();let sum=0
  for (const r of journals.data) {
    if (!live(r) || typeof r.tipo !== 'string' || !r.tipo.trim() || types.has(r.tipo) || !count(r.cantidad)) throw new Error('La distribución de asientos contiene datos incoherentes.')
    types.add(r.tipo);sum+=r.cantidad
  }
  if (!Number.isSafeInteger(sum)) throw new Error('La distribución de asientos está fuera de rango.')
  return {stats:s as MonitorStats,events:[...failed.data,...dead.data].sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)).slice(0,10) as MonitorEvent[],journals:journals.data as MonitorJournalType[]}
}
