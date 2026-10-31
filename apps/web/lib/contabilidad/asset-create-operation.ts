export interface AssetCreateScope { tenantId: string; actorId: string }
export interface AssetCreateIntent extends AssetCreateScope {
  version: 1; createdAt: string; idempotencyKey: string; body: string
  source: { paisCodigo: string; moneda: string; centroCostoId: string | null }
}
const object = (v: any) => !!v && typeof v === 'object' && !Array.isArray(v)
const uuid = (v: any) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
const exact = (v: any, fields: string[]) => object(v) && Object.keys(v).length === fields.length && fields.every(k => Object.prototype.hasOwnProperty.call(v, k))
const timestamp = (v: any) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v))
const scopeValid = (v: AssetCreateScope) => uuid(v.tenantId) && uuid(v.actorId)
function unknown(): never { throw new Error('No se pudo recuperar el registro pendiente de alta de activo. Sus datos se conservan sin reemplazarlos.') }
function receiptUnknown(): never { throw new Error('Se necesita el recibo completo y coincidente del alta de activo. Se conserva el registro pendiente.') }
function canonical(v: any): string {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']'
  if (object(v)) return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}'
  return JSON.stringify(v) ?? 'undefined'
}
export function assetCreateKey(scope: AssetCreateScope) {
  if (!scopeValid(scope)) unknown()
  return `erp.accounting.asset-create.pending.v1.${scope.tenantId}:${scope.actorId}`
}
const archivePrefix = (scope: AssetCreateScope) => assetCreateKey(scope).replace('.pending.', '.intents.') + '.'
const archiveKey = (intent: AssetCreateIntent) => archivePrefix(intent) + intent.idempotencyKey
export const assetCreateReceiptKey = (intent: AssetCreateIntent) => assetCreateKey(intent).replace('.pending.', '.receipts.') + '.' + intent.idempotencyKey
const cents = (v: any) => typeof v === 'number' && Number.isFinite(v) && Number.isSafeInteger(Math.round(v*100)) && Math.abs(v*100-Math.round(v*100))<0.000001
const date = (v: any) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number(v.slice(0,4))>=1 && Number.isFinite(Date.parse(v+'T00:00:00Z')) && new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v
const live = (v: any) => object(v) && ['cached','queued','offline','pending','from_cache'].every(k=>v[k]===undefined||v[k]===false)
function payloadValid(p: any) {
  const required=['codigo','nombre','fecha_adquisicion','valor_adquisicion','valor_residual','vida_util_meses','fecha_inicio_depreciacion'],optional=['descripcion','centro_costo_id']
  return live(p)&&required.every(k=>Object.prototype.hasOwnProperty.call(p,k))&&Object.keys(p).every(k=>required.includes(k)||optional.includes(k))&&['codigo','nombre'].every(k=>typeof p[k]==='string'&&!!p[k].trim()&&p[k]===p[k].trim())&&date(p.fecha_adquisicion)&&date(p.fecha_inicio_depreciacion)&&cents(p.valor_adquisicion)&&p.valor_adquisicion>0&&cents(p.valor_residual)&&p.valor_residual>=0&&p.valor_residual<=p.valor_adquisicion&&Number.isSafeInteger(p.vida_util_meses)&&p.vida_util_meses>=1&&(p.descripcion===undefined||typeof p.descripcion==='string'&&!!p.descripcion.trim()&&p.descripcion===p.descripcion.trim())&&(p.centro_costo_id===undefined||uuid(p.centro_costo_id))
}
export function assetCreatePayload(intent: AssetCreateIntent) {
  const p=JSON.parse(intent.body),source=intent.source
  if(!payloadValid(p)||!exact(source,['paisCodigo','moneda','centroCostoId'])||!['PE','CO','AR'].includes(source.paisCodigo)||typeof source.moneda!=='string'||!/^[A-Z]{3}$/.test(source.moneda)||source.centroCostoId!==(p.centro_costo_id??null))unknown()
  return p as { codigo:string;nombre:string;descripcion?:string;fecha_adquisicion:string;valor_adquisicion:number;valor_residual:number;vida_util_meses:number;fecha_inicio_depreciacion:string;centro_costo_id?:string }
}
export function readAssetCreateIntent(raw: string, scope: AssetCreateScope): AssetCreateIntent {
  try {
    if (!scopeValid(scope) || raw.length > 1048576) unknown()
    const v = JSON.parse(raw)
    if (!exact(v, ['version', 'tenantId', 'actorId', 'createdAt', 'idempotencyKey', 'body', 'source']) || v.version !== 1 || v.tenantId !== scope.tenantId || v.actorId !== scope.actorId || !timestamp(v.createdAt) || !uuid(v.idempotencyKey) || typeof v.body !== 'string' || v.body.length > 900000) unknown()
    assetCreatePayload(v)
    return v
  } catch { unknown() }
}
export function newAssetCreateIntent(payload: any, scope: AssetCreateScope, country: { paisCodigo:string;moneda:string }, centerIds: string[]): AssetCreateIntent {
  if(!scopeValid(scope)||!payloadValid(payload)||payload.centro_costo_id&&!centerIds.includes(payload.centro_costo_id))unknown()
  const intent:AssetCreateIntent={version:1,...scope,createdAt:new Date().toISOString(),idempotencyKey:crypto.randomUUID(),body:JSON.stringify(payload),source:{paisCodigo:country.paisCodigo,moneda:country.moneda,centroCostoId:payload.centro_costo_id??null}}
  return readAssetCreateIntent(JSON.stringify(intent),scope)
}
export function confirmAssetCreate(value:any,intent:AssetCreateIntent){
  const p=assetCreatePayload(intent),d=value?.data,op=value?.operation,a=value?.asset
  if(!live(value)||value.success!==true||value.complete!==true||value.tenant_id!==intent.tenantId||!live(d)||!uuid(d.id)||!live(op)||!live(a))receiptUnknown()
  if(d.tenant_id!==intent.tenantId||d.created_by!==intent.actorId||!timestamp(d.created_at)||d.codigo!==p.codigo.toUpperCase()||d.nombre!==p.nombre||d.descripcion!==(p.descripcion??null)||d.fecha_adquisicion!==p.fecha_adquisicion||d.fecha_inicio_depreciacion!==p.fecha_inicio_depreciacion||d.valor_adquisicion!==p.valor_adquisicion||d.valor_residual!==p.valor_residual||d.vida_util_meses!==p.vida_util_meses||d.centro_costo_id!==(p.centro_costo_id??null)||d.metodo_depreciacion!=='LINEAL'||d.situacion!=='ACTIVO'||d.estado!=='ACTIVO'||d.activo!==true||d.depreciacion_acumulada!==0||d.valor_neto!==p.valor_adquisicion)receiptUnknown()
  if(op.status!=='COMMITTED'||op.type!=='ACCOUNTING_ASSET_CREATE'||!uuid(op.operation_id)||op.tenant_id!==intent.tenantId||op.actor_id!==intent.actorId||op.idempotency_key!==intent.idempotencyKey||op.record_id!==d.id||!timestamp(op.created_at)||typeof op.request_fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(op.request_fingerprint)||canonical(op.payload)!==canonical(p))receiptUnknown()
  if(a.id!==d.id||a.tenant_id!==intent.tenantId||a.codigo!==d.codigo||a.created_by!==intent.actorId||a.created_at!==d.created_at||!['ACTIVO','DEPRECIADO','BAJA','VENDIDO'].includes(a.situacion_actual))receiptUnknown()
  return d
}
export function currentAssetCreateActor(scope: AssetCreateScope) {
  try { const session = JSON.parse(localStorage.getItem('erp.auth.session.snapshot') || 'null'); return scopeValid(scope) && session?.user?.id === scope.actorId && session?.user?.tenant_id === scope.tenantId } catch { return false }
}
/** Read-only recovery: immutable requests survive a missing pointer; no automatic send or retirement. */
export function loadAssetCreate(scope: AssetCreateScope): AssetCreateIntent | null {
  const key = assetCreateKey(scope), pointer = localStorage.getItem(key)
  const active = pointer === null ? null : readAssetCreateIntent(pointer, scope)
  const unresolved = new Map<string, AssetCreateIntent>()
  for (let i = 0; i < localStorage.length; i++) {
    const name = localStorage.key(i)
    if (!name?.startsWith(archivePrefix(scope))) continue
    const raw = localStorage.getItem(name)
    if (raw === null) unknown()
    const v = readAssetCreateIntent(raw, scope)
    if (name !== archiveKey(v) || active?.idempotencyKey === v.idempotencyKey && raw !== pointer) unknown()
    const receipt = localStorage.getItem(assetCreateReceiptKey(v))
    if (receipt === null) unresolved.set(v.idempotencyKey, v)
    else confirmAssetCreate(JSON.parse(receipt), v)
  }
  if (active) unresolved.set(active.idempotencyKey, active)
  if (unresolved.size > 1) throw new Error('Hay más de una intención de alta de activo conservada. Se bloquea otro registro y se mantienen todos sus datos.')
  return unresolved.values().next().value ?? null
}
function writeExact(key: string, raw: string) { localStorage.setItem(key, raw); if (localStorage.getItem(key) !== raw) unknown() }
export function preserveAssetCreate(intent: AssetCreateIntent) {
  const raw = JSON.stringify(intent), active = loadAssetCreate(intent)
  readAssetCreateIntent(raw, intent)
  if (active && JSON.stringify(active) !== raw) unknown()
  const archive = localStorage.getItem(archiveKey(intent))
  if (archive !== null && archive !== raw) unknown()
  if (archive !== null && localStorage.getItem(assetCreateKey(intent)) === null && localStorage.getItem(assetCreateReceiptKey(intent)) !== null) throw new Error('Este registro ya tiene un recibo conservado. No se vuelve a abrir la intención cerrada.')
  if (archive === null) writeExact(archiveKey(intent), raw)
  const pointer = localStorage.getItem(assetCreateKey(intent))
  if (pointer !== null && pointer !== raw) unknown()
  if (pointer === null) writeExact(assetCreateKey(intent), raw)
  return raw
}
export function retireAssetCreate(intent: AssetCreateIntent, response: any) {
  const receipt = confirmAssetCreate(response, intent), raw = JSON.stringify(intent), key = assetCreateKey(intent), saved = loadAssetCreate(intent)
  if (!saved || JSON.stringify(saved) !== raw || localStorage.getItem(key) !== raw || localStorage.getItem(archiveKey(intent)) !== raw) unknown()
  const receiptKey = assetCreateReceiptKey(intent), existing = localStorage.getItem(receiptKey)
  if (existing === null) writeExact(receiptKey, JSON.stringify(response))
  else {
    const earlier = JSON.parse(existing); confirmAssetCreate(earlier, intent)
    if (earlier.operation.operation_id !== response.operation.operation_id) receiptUnknown()
  }
  confirmAssetCreate(JSON.parse(localStorage.getItem(receiptKey) || 'null'), intent)
  if (localStorage.getItem(key) !== raw) unknown()
  localStorage.removeItem(key)
  if (localStorage.getItem(key) !== null) unknown()
  return receipt
}
export async function withAssetCreateLock<T>(scope: AssetCreateScope, action: () => Promise<T>): Promise<T> {
  if (!currentAssetCreateActor(scope) || !navigator.locks?.request) throw new Error('No se pudo confirmar la sesión o reservar el registro. La intención se conserva sin enviar.')
  return navigator.locks.request(assetCreateKey(scope) + '.writer', { ifAvailable: true }, async lock => {
    if (!lock || !currentAssetCreateActor(scope)) throw new Error('Otro registro está en curso. La intención se conserva; reintente manualmente cuando termine.')
    return action()
  })
}
