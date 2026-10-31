import { readPeriodDetail, type PeriodSnapshot } from './accounting-period-read'
export type PeriodTransitionAction = 'CLOSE' | 'REOPEN'
export type PeriodTransitionScope = { tenantId: string; actorId: string }
export type PeriodTransitionIntent = PeriodTransitionScope & { version: 1; action: PeriodTransitionAction; intentId: string; createdAt: string; snapshot: PeriodSnapshot }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const fail = (): never => { throw new Error('La transición del período no está confirmada. Se conservan sus datos para verificar el resultado con conexión.') }
const keys = ['id','tenant_id','anio','mes','codigo','nombre','estado','metadata','created_at','updated_at','fecha_cierre','cerrado_por']
function sorted(value: unknown): unknown { if (Array.isArray(value)) return value.map(sorted); if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,sorted(v)])); return value }
export function samePeriodSnapshot(a: PeriodSnapshot, b: PeriodSnapshot): boolean { return JSON.stringify(sorted(a))===JSON.stringify(sorted(b)) }
export function periodTransitionPrefix(scope: PeriodTransitionScope): string {
  if (!uuid.test(scope.tenantId) || !uuid.test(scope.actorId)) return fail()
  return `erp.accounting.period-transition.pending.v1.${scope.tenantId}:${scope.actorId}:`
}
export function periodTransitionIntentKey(intent: Pick<PeriodTransitionIntent,'tenantId'|'actorId'|'action'|'snapshot'>): string {
  if (!['CLOSE','REOPEN'].includes(intent.action) || !uuid.test(intent.snapshot.id)) return fail()
  return periodTransitionPrefix(intent)+intent.action+':'+intent.snapshot.id
}
export function readPeriodTransitionIntent(raw: string, scope: PeriodTransitionScope): PeriodTransitionIntent {
  periodTransitionPrefix(scope)
  let v: any
  try { v=JSON.parse(raw) } catch { return fail() }
  if (!v || typeof v!=='object' || Array.isArray(v) || Object.keys(v).some(k=>!['version','action','intentId','createdAt','tenantId','actorId','snapshot'].includes(k)) || v.version!==1 || v.tenantId!==scope.tenantId || v.actorId!==scope.actorId || !['CLOSE','REOPEN'].includes(v.action) || !uuid.test(v.intentId)) return fail()
  if (typeof v.createdAt!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v.createdAt) || !Number.isFinite(Date.parse(v.createdAt)) || new Date(v.createdAt).toISOString()!==v.createdAt) return fail()
  if (!v.snapshot || Object.keys(v.snapshot).some(k=>!keys.includes(k))) return fail()
  const row=readPeriodDetail({success:true,data:v.snapshot},scope.tenantId,v.snapshot.id)
  if (row.estado!==(v.action==='CLOSE'?'ABIERTO':'CERRADO')) return fail()
  periodTransitionIntentKey(v)
  return v as PeriodTransitionIntent
}
export function newPeriodTransitionIntent(snapshot: PeriodSnapshot, action: PeriodTransitionAction, scope: PeriodTransitionScope): PeriodTransitionIntent {
  return readPeriodTransitionIntent(JSON.stringify({version:1,action,...scope,intentId:crypto.randomUUID(),createdAt:new Date().toISOString(),snapshot}),scope)
}
export function confirmPeriodTransition(response: unknown, intent: PeriodTransitionIntent, scope: PeriodTransitionScope): PeriodSnapshot {
  const verified=readPeriodTransitionIntent(JSON.stringify(intent),scope),before=verified.snapshot,row=readPeriodDetail(response,scope.tenantId,before.id)
  for (const field of ['id','tenant_id','anio','mes','codigo','nombre','created_at'] as const) if (row[field]!==before[field]) return fail()
  if (Date.parse(row.updated_at)<Date.parse(before.updated_at)) return fail()
  const change=verified.action==='CLOSE'?['cerrado_en','cerrado_por','cierre_sequence','cierre_asiento_id']:['reabierto_en','reabierto_por']
  if (Object.keys(row.metadata).some(k=>!(k in before.metadata)&&!change.includes(k))) return fail()
  for (const [k,v] of Object.entries(before.metadata)) if (!change.includes(k)&&JSON.stringify(sorted(row.metadata[k]))!==JSON.stringify(sorted(v))) return fail()
  const time=row.metadata[verified.action==='CLOSE'?'cerrado_en':'reabierto_en']
  if (typeof time!=='string') return fail()
  readPeriodDetail({success:true,data:{...row,updated_at:time}},scope.tenantId,before.id)
  if (Date.parse(time)!==Date.parse(row.updated_at)) return fail()
  if (verified.action==='CLOSE') {
    const seq=before.metadata.cierre_sequence===undefined?0:before.metadata.cierre_sequence
    if (!Number.isSafeInteger(seq) || Number(seq)<0 || row.estado!=='CERRADO' || row.cerrado_por!==scope.actorId || row.metadata.cerrado_por!==scope.actorId || row.metadata.cierre_sequence!==Number(seq)+1 || !('cierre_asiento_id' in row.metadata)) return fail()
    const entry=row.metadata.cierre_asiento_id
    if (entry!==null&&(typeof entry!=='string'||!uuid.test(entry))) return fail()
    if (before.mes!==12&&entry!==null) return fail()
  } else if (row.estado!=='ABIERTO' || row.fecha_cierre!==null || row.cerrado_por!==null || row.metadata.reabierto_por!==scope.actorId) return fail()
  return row
}
