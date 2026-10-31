export interface DepreciationBatchScope { tenantId: string; actorId: string }
export interface DepreciationBatchIntent extends DepreciationBatchScope {
  version: 1; createdAt: string; idempotencyKey: string; body: string
  source: { paisCodigo: string; moneda: string }
}
const object = (v: any) => !!v && typeof v === 'object' && !Array.isArray(v)
const uuid = (v: any) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
const exact = (v: any, fields: string[]) => object(v) && Object.keys(v).length === fields.length && fields.every(k => Object.prototype.hasOwnProperty.call(v, k))
const timestamp = (v: any) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v))
const scopeValid = (v: DepreciationBatchScope) => uuid(v.tenantId) && uuid(v.actorId)
function unknown(): never { throw new Error('No se pudo recuperar el registro pendiente de lote de depreciación. Sus datos se conservan sin reemplazarlos.') }
function receiptUnknown(): never { throw new Error('Se necesita el recibo completo y coincidente del lote de depreciación. Se conserva el registro pendiente.') }
function canonical(v: any): string {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']'
  if (object(v)) return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}'
  return JSON.stringify(v) ?? 'undefined'
}
export function depreciationBatchKey(scope: DepreciationBatchScope) {
  if (!scopeValid(scope)) unknown()
  return `erp.accounting.asset-depreciation-batch.pending.v1.${scope.tenantId}:${scope.actorId}`
}
const archivePrefix = (scope: DepreciationBatchScope) => depreciationBatchKey(scope).replace('.pending.', '.intents.') + '.'
const archiveKey = (intent: DepreciationBatchIntent) => archivePrefix(intent) + intent.idempotencyKey
export const depreciationBatchReceiptKey = (intent: DepreciationBatchIntent) => depreciationBatchKey(intent).replace('.pending.', '.receipts.') + '.' + intent.idempotencyKey
const cents = (v: any) => typeof v === 'number' && Number.isFinite(v) && v>=0 && Number.isSafeInteger(Math.round(v*100)) && Math.abs(v*100-Math.round(v*100))<0.000001
const live = (v: any) => object(v) && ['cached','queued','offline','pending','from_cache'].every(k=>v[k]===undefined||v[k]===false)
function payloadValid(p:any){return exact(p,['anio','mes'])&&Number.isInteger(p.anio)&&p.anio>=1900&&p.anio<=9999&&Number.isInteger(p.mes)&&p.mes>=1&&p.mes<=12}
export function depreciationBatchPayload(intent:DepreciationBatchIntent){
 const p=JSON.parse(intent.body),source=intent.source
 if(!payloadValid(p)||!exact(source,['paisCodigo','moneda'])||!['PE','CO','AR'].includes(source.paisCodigo)||typeof source.moneda!=='string'||!/^[A-Z]{3}$/.test(source.moneda))unknown()
 return p as {anio:number;mes:number}
}
export function readDepreciationBatchIntent(raw: string, scope: DepreciationBatchScope): DepreciationBatchIntent {
  try {
    if (!scopeValid(scope) || raw.length > 1048576) unknown()
    const v = JSON.parse(raw)
    if (!exact(v, ['version', 'tenantId', 'actorId', 'createdAt', 'idempotencyKey', 'body', 'source']) || v.version !== 1 || v.tenantId !== scope.tenantId || v.actorId !== scope.actorId || !timestamp(v.createdAt) || !uuid(v.idempotencyKey) || typeof v.body !== 'string' || v.body.length > 900000) unknown()
    depreciationBatchPayload(v)
    return v
  } catch { unknown() }
}
export function newDepreciationBatchIntent(payload:any,scope:DepreciationBatchScope,country:{paisCodigo:string;moneda:string}):DepreciationBatchIntent{
 if(!scopeValid(scope)||!payloadValid(payload))unknown()
 return readDepreciationBatchIntent(JSON.stringify({version:1,...scope,createdAt:new Date().toISOString(),idempotencyKey:crypto.randomUUID(),body:JSON.stringify(payload),source:{paisCodigo:country.paisCodigo,moneda:country.moneda}}),scope)
}
export function confirmDepreciationBatch(v:any,intent:DepreciationBatchIntent){
  const tenant=intent.tenantId,actor=intent.actorId,key=intent.idempotencyKey,request=depreciationBatchPayload(intent)
  const op = v?.operation, d = v?.data, periodo = `${request.anio}-${String(request.mes).padStart(2,'0')}`;
  if (!live(v) || v.success !== true || v.complete !== true || v.tenant_id !== tenant || typeof v.idempotent !== 'boolean' || !live(op) || !live(d)) receiptUnknown();
  if (op.status !== 'COMMITTED' || op.type !== 'ACCOUNTING_ASSET_DEPRECIATION_BATCH' || !uuid(op.operation_id) || op.tenant_id !== tenant || op.actor_id !== actor || op.idempotency_key !== key || canonical(op.request) !== canonical(request) || typeof op.request_fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(op.request_fingerprint) || typeof op.created_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(op.created_at) || !Number.isFinite(Date.parse(op.created_at))) receiptUnknown();
  if (d.periodo !== periodo || !Array.isArray(d.cuotas) || !Array.isArray(d.omitidos) || !Number.isSafeInteger(op.snapshot_count) || op.snapshot_count !== d.cuotas.length+d.omitidos.length || !Number.isSafeInteger(d.activos_depreciados) || d.activos_depreciados !== d.cuotas.length || !cents(d.total_depreciado)) receiptUnknown();
  const assets = new Set<string>(), ids = new Set<string>(), events = new Set<string>(), outboxes = new Set<string>(); let total = 0;
  for (const row of d.cuotas) {
    const dep = row?.depreciacion, out = row?.outbox;
    if (!live(row) || !uuid(row.activo_id) || typeof row.codigo !== 'string' || !row.codigo.trim() || assets.has(row.activo_id) || !live(dep) || !live(out)) receiptUnknown();
    if (!uuid(dep.id) || ids.has(dep.id) || dep.tenant_id !== tenant || dep.activo_id !== row.activo_id || dep.created_by !== actor || dep.periodo !== periodo || dep.fecha_depreciacion !== new Date(Date.UTC(request.anio,request.mes,0)).toISOString().slice(0,10) || ![dep.monto_depreciacion,dep.depreciacion_acumulada,dep.valor_neto].every(cents) || dep.monto_depreciacion <= 0 || dep.depreciacion_acumulada < dep.monto_depreciacion || out.depreciacionId !== dep.id || !uuid(out.eventId) || !uuid(out.outboxId) || outboxes.has(out.outboxId) || events.has(out.eventId) || out.idempotencyKey !== `depreciacion.generada:${tenant}:${dep.id}`) receiptUnknown();
    assets.add(row.activo_id);ids.add(dep.id);events.add(out.eventId);outboxes.add(out.outboxId);total += Math.round(dep.monto_depreciacion*100);
  }
  for (const row of d.omitidos) {
    if (!live(row) || !uuid(row.activo_id) || typeof row.codigo !== 'string' || !row.codigo.trim() || assets.has(row.activo_id) || !['ALREADY_REGISTERED','OUTSIDE_USEFUL_LIFE_OR_RESIDUAL'].includes(row.motivo) || row.motivo === 'ALREADY_REGISTERED' && !uuid(row.depreciacion_id)) receiptUnknown();
    assets.add(row.activo_id);
  }
  if (!Number.isSafeInteger(total) || total !== Math.round(d.total_depreciado*100)) receiptUnknown();
  return d;
}

export function currentDepreciationBatchActor(scope: DepreciationBatchScope) {
  try { const session = JSON.parse(localStorage.getItem('erp.auth.session.snapshot') || 'null'); return scopeValid(scope) && session?.user?.id === scope.actorId && session?.user?.tenant_id === scope.tenantId } catch { return false }
}
/** Read-only recovery: immutable requests survive a missing pointer; no automatic send or retirement. */
export function loadDepreciationBatch(scope: DepreciationBatchScope): DepreciationBatchIntent | null {
  const key = depreciationBatchKey(scope), pointer = localStorage.getItem(key)
  const active = pointer === null ? null : readDepreciationBatchIntent(pointer, scope)
  const unresolved = new Map<string, DepreciationBatchIntent>()
  for (let i = 0; i < localStorage.length; i++) {
    const name = localStorage.key(i)
    if (!name?.startsWith(archivePrefix(scope))) continue
    const raw = localStorage.getItem(name)
    if (raw === null) unknown()
    const v = readDepreciationBatchIntent(raw, scope)
    if (name !== archiveKey(v) || active?.idempotencyKey === v.idempotencyKey && raw !== pointer) unknown()
    const receipt = localStorage.getItem(depreciationBatchReceiptKey(v))
    if (receipt === null) unresolved.set(v.idempotencyKey, v)
    else confirmDepreciationBatch(JSON.parse(receipt), v)
  }
  if (active) unresolved.set(active.idempotencyKey, active)
  if (unresolved.size > 1) throw new Error('Hay más de una intención de lote de depreciación conservada. Se bloquea otro registro y se mantienen todos sus datos.')
  return unresolved.values().next().value ?? null
}
function writeExact(key: string, raw: string) { localStorage.setItem(key, raw); if (localStorage.getItem(key) !== raw) unknown() }
export function preserveDepreciationBatch(intent: DepreciationBatchIntent) {
  const raw = JSON.stringify(intent), active = loadDepreciationBatch(intent)
  readDepreciationBatchIntent(raw, intent)
  if (active && JSON.stringify(active) !== raw) unknown()
  const archive = localStorage.getItem(archiveKey(intent))
  if (archive !== null && archive !== raw) unknown()
  if (archive !== null && localStorage.getItem(depreciationBatchKey(intent)) === null && localStorage.getItem(depreciationBatchReceiptKey(intent)) !== null) throw new Error('Este registro ya tiene un recibo conservado. No se vuelve a abrir la intención cerrada.')
  if (archive === null) writeExact(archiveKey(intent), raw)
  const pointer = localStorage.getItem(depreciationBatchKey(intent))
  if (pointer !== null && pointer !== raw) unknown()
  if (pointer === null) writeExact(depreciationBatchKey(intent), raw)
  return raw
}
export function retireDepreciationBatch(intent: DepreciationBatchIntent, response: any) {
  const receipt = confirmDepreciationBatch(response, intent), raw = JSON.stringify(intent), key = depreciationBatchKey(intent), saved = loadDepreciationBatch(intent)
  if (!saved || JSON.stringify(saved) !== raw || localStorage.getItem(key) !== raw || localStorage.getItem(archiveKey(intent)) !== raw) unknown()
  const receiptKey = depreciationBatchReceiptKey(intent), existing = localStorage.getItem(receiptKey)
  if (existing === null) writeExact(receiptKey, JSON.stringify(response))
  else {
    const earlier = JSON.parse(existing); confirmDepreciationBatch(earlier, intent)
    if (earlier.operation.operation_id !== response.operation.operation_id) receiptUnknown()
  }
  confirmDepreciationBatch(JSON.parse(localStorage.getItem(receiptKey) || 'null'), intent)
  if (localStorage.getItem(key) !== raw) unknown()
  localStorage.removeItem(key)
  if (localStorage.getItem(key) !== null) unknown()
  return receipt
}
export async function withDepreciationBatchLock<T>(scope: DepreciationBatchScope, action: () => Promise<T>): Promise<T> {
  if (!currentDepreciationBatchActor(scope) || !navigator.locks?.request) throw new Error('No se pudo confirmar la sesión o reservar el registro. La intención se conserva sin enviar.')
  return navigator.locks.request(depreciationBatchKey(scope) + '.writer', { ifAvailable: true }, async lock => {
    if (!lock || !currentDepreciationBatchActor(scope)) throw new Error('Otro registro está en curso. La intención se conserva; reintente manualmente cuando termine.')
    return action()
  })
}
