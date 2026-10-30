import { readDeferredRegister, type DeferredRegisterRow } from './deferred-read-contract'
import type { DeferredCreateScope } from './deferred-create-operation'
import type { DeferredCancelSnapshot } from './deferred-cancel-operation'
export type DeferredAccrueRow = Omit<DeferredCancelSnapshot, 'estado'> & { estado: DeferredRegisterRow['estado'] }
export interface DeferredAccrueIntent extends DeferredCreateScope {
  version: 1; createdAt: string; body: string; sourceEventId: string; rows: DeferredAccrueRow[]
}
export interface DeferredAccrueResult { periodo: string; diferidos_devengados: number; total_devengado: number; omitidos?: Array<{ diferido_id: string; nombre: string; motivo: string }>; asiento_id?: string; numero_asiento?: string }
const fields = ['id','tenant_id','codigo','nombre','descripcion','tipo','cuenta_diferido_id','cuenta_resultado_id','monto_total','monto_devengado','monto_pendiente','periodos','fecha_inicio','centro_costo_id','estado','created_by','created_at','updated_at'] as const
const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v)
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
const civil = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v+'T00:00:00Z')) && new Date(v+'T00:00:00Z').toISOString().slice(0,10) === v
const timestamp = (v: unknown): v is string => typeof v === 'string' && civil(v.slice(0,10)) && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v))
const live = (v: Record<string, any>) => ['cached','queued','offline','pending'].every(k => v[k] === undefined || v[k] === false)
const exact = (v: Record<string, any>, keys: readonly string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v,k))
const cents = (n: number) => Math.round(n * 100)
function invalid(): never { throw new Error('No se pudo verificar el devengo pendiente con seguridad. Se conserva sin reemplazarlo.') }
function fullRows(value: unknown, tenantId: string): DeferredAccrueRow[] {
  const rows = readDeferredRegister(value,tenantId)
  if (rows.length > 5000) invalid()
  return rows.map(row => {
    const r = row as unknown as Record<string,any>
    if (!fields.every(k => Object.hasOwn(r,k)) || !uuid(r.created_by) || !timestamp(r.created_at) || !timestamp(r.updated_at) || Date.parse(r.updated_at)<Date.parse(r.created_at) || !Number.isSafeInteger(cents(r.monto_total)) || !Number.isSafeInteger(r.periodos) || r.centro_costo_id !== null && !uuid(r.centro_costo_id) || r.codigo !== null && (typeof r.codigo !== 'string' || !r.codigo.trim()) || r.descripcion !== null && typeof r.descripcion !== 'string') invalid()
    return Object.fromEntries(fields.map(k => [k,r[k]])) as unknown as DeferredAccrueRow
  }).sort((a,b) => a.id.localeCompare(b.id))
}
export function deferredAccrueIntentKey(scope: DeferredCreateScope) {
  if (!uuid(scope.tenantId) || !uuid(scope.actorId)) invalid()
  return `erp.accounting.deferred-accrue.pending.v1.${scope.tenantId}:${scope.actorId}`
}
export function deferredAccruePeriod(body: string) {
  let v: any
  try { v = JSON.parse(body) } catch { invalid() }
  if (!object(v) || !exact(v,['anio','mes']) || !Number.isInteger(v.anio) || v.anio<1900 || v.anio>9999 || !Number.isInteger(v.mes) || v.mes<1 || v.mes>12) invalid()
  return { anio: v.anio as number, mes: v.mes as number, periodo: `${v.anio}-${String(v.mes).padStart(2,'0')}` }
}
export async function deferredAccrueSourceEventId(tenantId: string, periodo: string) {
  if (!uuid(tenantId) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) invalid()
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`devengo-diferidos:${tenantId}:${periodo}`))), n => n.toString(16).padStart(2,'0')).join('').slice(0,32).split('')
  hash[12]='5'; hash[16]=((parseInt(hash[16],16)&3)|8).toString(16)
  const h=hash.join(''); return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`
}
export function readDeferredAccrueCandidates(value: unknown, scope: DeferredCreateScope, selected?: unknown) {
  const rows = fullRows(value,scope.tenantId)
  if (selected !== undefined && JSON.stringify(rows) !== JSON.stringify(fullRows({success:true,data:selected},scope.tenantId))) throw new Error('El registro cambió desde la consulta. Actualice antes de devengar.')
  return rows
}
export async function newDeferredAccrueIntent(anio: number, mes: number, rows: unknown, scope: DeferredCreateScope): Promise<DeferredAccrueIntent> {
  deferredAccrueIntentKey(scope);const body=JSON.stringify({anio,mes});const {periodo}=deferredAccruePeriod(body)
  return { version:1,...scope,createdAt:new Date().toISOString(),body,sourceEventId:await deferredAccrueSourceEventId(scope.tenantId,periodo),rows:fullRows({success:true,data:rows},scope.tenantId) }
}
export async function readDeferredAccrueIntent(raw: string, scope: DeferredCreateScope): Promise<DeferredAccrueIntent> {
  try {
    deferredAccrueIntentKey(scope);if(raw.length>8388608)invalid();const v=JSON.parse(raw)
    if(!object(v)||!exact(v,['version','tenantId','actorId','createdAt','body','sourceEventId','rows'])||v.version!==1||v.tenantId!==scope.tenantId||v.actorId!==scope.actorId||!timestamp(v.createdAt)||typeof v.body!=='string'||!Array.isArray(v.rows)||v.rows.some(r=>!object(r)||!exact(r,fields)))invalid()
    const {periodo}=deferredAccruePeriod(v.body);if(v.sourceEventId!==await deferredAccrueSourceEventId(scope.tenantId,periodo))invalid()
    const rows=fullRows({success:true,data:v.rows},scope.tenantId);if(JSON.stringify(rows)!==JSON.stringify(v.rows))invalid()
    return v as DeferredAccrueIntent
  } catch { invalid() }
}
export function deferredAccrueExpectation(intent: DeferredAccrueIntent) {
  const {anio,mes,periodo}=deferredAccruePeriod(intent.body)
  const active=intent.rows.filter(r=>r.estado==='VIGENTE');const items=active.flatMap(row=>{
    const elapsed=(anio-Number(row.fecha_inicio.slice(0,4)))*12+mes-Number(row.fecha_inicio.slice(5,7))
    const pending=cents(row.monto_pendiente);const amount=elapsed<0||elapsed>=row.periodos||pending<=0?0:Math.min(elapsed===row.periodos-1?pending:Math.round(cents(row.monto_total)/row.periodos),pending)
    return amount>0?[{row,amount:amount/100,accumulated:(cents(row.monto_devengado)+amount)/100}]:[]
  })
  const total=items.reduce((sum,i)=>sum+cents(i.amount),0);if(!Number.isSafeInteger(total))invalid()
  const omitted=active.filter(r=>!items.some(i=>i.row.id===r.id))
  return {periodo,items,omitted,total:total/100,fecha:new Date(Date.UTC(anio,mes,0)).toISOString().slice(0,10)}
}
export function readDeferredAccrueSummary(value: unknown, intent: DeferredAccrueIntent): DeferredAccrueResult {
  if(!object(value)||value.success!==true||!live(value)||value.tenant_id!==undefined&&value.tenant_id!==intent.tenantId||!object(value.data)||!live(value.data)||value.data.tenant_id!==undefined&&value.data.tenant_id!==intent.tenantId)invalid()
  const d=value.data;const e=deferredAccrueExpectation(intent)
  if(d.periodo!==e.periodo||d.diferidos_devengados!==e.items.length||d.total_devengado!==e.total)invalid()
  const omitted=d.omitidos===undefined?[]:d.omitidos
  if(!Array.isArray(omitted)||omitted.length!==e.omitted.length)invalid()
  const ids=new Set<string>()
  for(const r of omitted){const row=object(r)&&e.omitted.find(x=>x.id===r.diferido_id);if(!row||!live(r)||ids.has(row.id)||r.nombre!==row.nombre||typeof r.motivo!=='string'||!r.motivo.trim())invalid();ids.add(row.id)}
  return {periodo:e.periodo,diferidos_devengados:e.items.length,total_devengado:e.total,...(omitted.length?{omitidos:omitted}:{})}
}
export function readDeferredAccrueJournal(value: unknown, intent: DeferredAccrueIntent): Record<string,any> | null {
  if(!object(value)||value.success!==true||!live(value)||value.tenant_id!==undefined&&value.tenant_id!==intent.tenantId||!Array.isArray(value.data)||value.total!==value.data.length||value.page!==1||!Number.isInteger(value.limit)||value.limit<value.total||value.totalPages!==(value.total?1:0))invalid()
  const e=deferredAccrueExpectation(intent);const ids=new Set<string>()
  for(const r of value.data){if(!object(r)||!live(r)||!uuid(r.id)||r.tenant_id!==intent.tenantId||ids.has(r.id))invalid();ids.add(r.id)}
  const matches=value.data.filter(r=>r.source_event_id===intent.sourceEventId||r.referencia===`DIF-${e.periodo}`)
  if(!matches.length)return null
  if(matches.length!==1||!e.items.length)invalid()
  const j=matches[0]
  if(j.source_event_id!==intent.sourceEventId||j.referencia!==`DIF-${e.periodo}`||j.origen!=='DEVENGO_DIFERIDOS'||j.tipo_asiento!=='AJUSTE'||j.estado!=='CONFIRMADO'||typeof j.fecha!=='string'||!civil(j.fecha.slice(0,10))||Date.parse(j.fecha)!==Date.parse(e.fecha+'T00:00:00Z')||j.concepto!==`Devengo de ingresos y gastos diferidos ${e.periodo}`||j.created_by!==intent.actorId||j.confirmado_por!==intent.actorId||!timestamp(j.created_at)||!timestamp(j.confirmado_en)||!(typeof j.numero_asiento==='string'&&j.numero_asiento.trim()||Number.isSafeInteger(j.numero_asiento)&&j.numero_asiento>0)||!Array.isArray(j.detalles)||j.detalles.length!==e.items.length*2||cents(Number(j.total_debe))!==cents(e.total)||cents(Number(j.total_haber))!==cents(e.total))invalid()
  const expected=e.items.flatMap(({row:r,amount})=>r.tipo==='GASTO'?[{cuenta_id:r.cuenta_resultado_id,debe:amount,haber:0,concepto:`Devengo ${e.periodo} — ${r.nombre}`,centro_costo_id:r.centro_costo_id},{cuenta_id:r.cuenta_diferido_id,debe:0,haber:amount,concepto:`Diferido pendiente — ${r.nombre}`,centro_costo_id:null}]:[{cuenta_id:r.cuenta_diferido_id,debe:amount,haber:0,concepto:`Ingreso diferido — ${r.nombre}`,centro_costo_id:null},{cuenta_id:r.cuenta_resultado_id,debe:0,haber:amount,concepto:`Devengo ${e.periodo} — ${r.nombre}`,centro_costo_id:r.centro_costo_id}])
  const remaining=[...expected];const details=new Set<string>()
  for(const d of j.detalles){if(!object(d)||!live(d)||!uuid(d.id)||details.has(d.id)||!Number.isFinite(Number(d.debe))||!Number.isFinite(Number(d.haber)))invalid();details.add(d.id);const index=remaining.findIndex(r=>Object.keys(r).every(k=>['debe','haber'].includes(k)?Number(d[k])===r[k as keyof typeof r]:d[k]===r[k as keyof typeof r]));if(index<0)invalid();remaining.splice(index,1)}
  return j
}
export function confirmDeferredAccrueRegister(value: unknown, intent: DeferredAccrueIntent) {
  const rows=fullRows(value,intent.tenantId);const e=deferredAccrueExpectation(intent);if(rows.length!==intent.rows.length)invalid()
  for(const before of intent.rows){const row=rows.find(r=>r.id===before.id);if(!row)invalid();const item=e.items.find(i=>i.row.id===before.id)
    if(!item){if(fields.some(k=>row[k]!==before[k]))invalid();continue}
    if(fields.filter(k=>!['monto_devengado','monto_pendiente','estado','updated_at'].includes(k)).some(k=>row[k]!==before[k])||row.monto_devengado!==item.accumulated||cents(row.monto_pendiente)!==cents(before.monto_total)-cents(item.accumulated)||row.estado!==(item.accumulated===before.monto_total?'DEVENGADO':'VIGENTE')||Date.parse(row.updated_at)<Date.parse(before.updated_at))invalid()
  }
}
export function deferredAccrueRecoveredResult(intent: DeferredAccrueIntent, journal: Record<string,any> | null): DeferredAccrueResult {
  const e=deferredAccrueExpectation(intent);if(e.items.length&&!journal)invalid()
  return {periodo:e.periodo,diferidos_devengados:e.items.length,total_devengado:e.total,...(e.omitted.length?{omitidos:e.omitted.map(r=>({diferido_id:r.id,nombre:r.nombre,motivo:'Sin cuota pendiente dentro del calendario del período.'}))}:{}),...(journal?{asiento_id:journal.id,numero_asiento:String(journal.numero_asiento)}:{})}
}
