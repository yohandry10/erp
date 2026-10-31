export interface AssetLifecycleScope {tenantId:string;actorId:string}
export interface AssetLifecycleIntent extends AssetLifecycleScope {
 version:1;createdAt:string;idempotencyKey:string;body:string;assetId:string;action:AssetLifecycleAction;
 source:{paisCodigo:string;moneda:string}
}
export type AssetLifecycleAction = 'UPDATE' | 'RETIRE';
export const assetSnapshotFields = ['id','tenant_id','codigo','nombre','descripcion','fecha_adquisicion','fecha_inicio_depreciacion','valor_adquisicion','valor_residual','vida_util_meses','depreciacion_acumulada','centro_costo_id','situacion','updated_at','asiento_baja_id','estado','activo','created_at','created_by'];
const object = (v: any) => !!v && typeof v === 'object' && !Array.isArray(v);
const exact = (v: any, fields: string[]) => object(v) && Object.keys(v).length === fields.length && fields.every(k => Object.prototype.hasOwnProperty.call(v,k));
const uuid = (v: any) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const live = (v: any) => object(v) && ['cached','queued','offline','pending','from_cache'].every(k => v[k] === undefined || v[k] === false);
const money = (v: any) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && Number.isSafeInteger(Math.round(v*100)) && Math.abs(v*100-Math.round(v*100)) < 0.000001;
const timestamp = (v: any) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));
const date = (v: any) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number(v.slice(0,4))>=1900 && Number.isFinite(Date.parse(v+'T00:00:00Z')) && new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const text = (v: any) => typeof v === 'string' && !!v.trim() && v === v.trim();

const scopeValid=(v:AssetLifecycleScope)=>uuid(v.tenantId)&&uuid(v.actorId)
const journalNumber=(v:any)=>(typeof v==='number'||typeof v==='string'&&/^[1-9]\d*$/.test(v))&&Number.isSafeInteger(Number(v))&&Number(v)>0
function unknown():never{throw new Error('Se necesita el recibo completo y coincidente de la operación del activo. Se conserva la solicitud original.')}
function invalid():never{throw new Error('No se pudo recuperar la solicitud original completa del activo. Sus datos se conservan sin reemplazarlos.')}
function canonical(v:any):string{if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';if(object(v))return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';return JSON.stringify(v)??'undefined'}
export function assetLifecycleKey(scope:AssetLifecycleScope){if(!scopeValid(scope))invalid();return `erp.accounting.asset-lifecycle.pending.v1.${scope.tenantId}:${scope.actorId}`}
const archivePrefix=(scope:AssetLifecycleScope)=>assetLifecycleKey(scope).replace('.pending.','.intents.')+'.'
const archiveKey=(intent:AssetLifecycleIntent)=>archivePrefix(intent)+intent.idempotencyKey
export const assetLifecycleReceiptKey=(intent:AssetLifecycleIntent)=>assetLifecycleKey(intent).replace('.pending.','.receipts.')+'.'+intent.idempotencyKey
export function assetLifecycleRequest(tenant: string, assetId: string, action: AssetLifecycleAction, request: any) {
  if (!uuid(tenant) || !uuid(assetId) || !['UPDATE','RETIRE'].includes(action) || !exact(request,['expected','original'])) invalid();
  const e=request.expected,p=request.original;
  if (!exact(e,assetSnapshotFields) || !live(e) || !live(p) || e.id !== assetId || e.tenant_id !== tenant || !text(e.codigo) || !text(e.nombre) || e.descripcion !== null && typeof e.descripcion !== 'string' || !date(e.fecha_adquisicion) || e.fecha_inicio_depreciacion !== null && !date(e.fecha_inicio_depreciacion) || ![e.valor_adquisicion,e.valor_residual,e.depreciacion_acumulada].every(money) || e.valor_adquisicion <= 0 || e.valor_residual > e.valor_adquisicion || e.depreciacion_acumulada > e.valor_adquisicion || !Number.isSafeInteger(e.vida_util_meses) || e.vida_util_meses < 1 || !timestamp(e.created_at) || !timestamp(e.updated_at) || !uuid(e.created_by) || e.centro_costo_id !== null && !uuid(e.centro_costo_id) || e.asiento_baja_id !== null || e.activo !== true || e.estado !== 'ACTIVO' || !(action === 'UPDATE' ? ['ACTIVO'] : ['ACTIVO','DEPRECIADO']).includes(e.situacion)) invalid();
  if (action === 'UPDATE') {
    if (Object.keys(p).some(k=>!['nombre','descripcion','vida_util_meses','valor_residual','centro_costo_id'].includes(k)) || !text(p.nombre) || !Number.isSafeInteger(p.vida_util_meses) || p.vida_util_meses < 1 || p.vida_util_meses > 2147483647 || !money(p.valor_residual) || p.valor_residual > e.valor_adquisicion || p.descripcion !== undefined && p.descripcion !== null && (typeof p.descripcion !== 'string' || p.descripcion !== p.descripcion.trim()) || p.centro_costo_id !== undefined && p.centro_costo_id !== null && !uuid(p.centro_costo_id)) invalid();
  } else if (Object.keys(p).some(k=>!['fecha','tipo','valor_venta','motivo'].includes(k)) || !date(p.fecha) || !['BAJA','VENTA'].includes(p.tipo) || p.tipo === 'VENTA' && (!money(p.valor_venta) || p.valor_venta <= 0) || p.tipo === 'BAJA' && p.valor_venta != null || p.motivo !== undefined && p.motivo !== null && !text(p.motivo)) invalid();
  return JSON.parse(JSON.stringify(request));
}

export function assetLifecyclePayload(intent:AssetLifecycleIntent){return assetLifecycleRequest(intent.tenantId,intent.assetId,intent.action,JSON.parse(intent.body))}
export function readAssetLifecycleIntent(raw:string,scope:AssetLifecycleScope):AssetLifecycleIntent{
 try{
  if(!scopeValid(scope)||raw.length>1048576)invalid();const v=JSON.parse(raw)
  if(!exact(v,['version','tenantId','actorId','createdAt','idempotencyKey','body','source','assetId','action'])||v.version!==1||v.tenantId!==scope.tenantId||v.actorId!==scope.actorId||!timestamp(v.createdAt)||!uuid(v.idempotencyKey)||!uuid(v.assetId)||!['UPDATE','RETIRE'].includes(v.action)||typeof v.body!=='string'||v.body.length>900000||!exact(v.source,['paisCodigo','moneda'])||!['PE','CO','AR'].includes(v.source.paisCodigo)||typeof v.source.moneda!=='string'||!/^[A-Z]{3}$/.test(v.source.moneda))invalid()
  assetLifecyclePayload(v);return v
 }catch{invalid()}
}
export function newAssetLifecycleIntent(action:AssetLifecycleAction,asset:any,payload:any,scope:AssetLifecycleScope,country:{paisCodigo:string;moneda:string}):AssetLifecycleIntent{
 if(!scopeValid(scope)||!object(asset)||asset.tenant_id!==scope.tenantId)invalid()
 const expected=Object.fromEntries(assetSnapshotFields.map(k=>[k,asset[k]])),request=assetLifecycleRequest(scope.tenantId,asset.id,action,{expected,original:payload})
 return readAssetLifecycleIntent(JSON.stringify({version:1,...scope,assetId:asset.id,action,createdAt:new Date().toISOString(),idempotencyKey:crypto.randomUUID(),body:JSON.stringify(request),source:{paisCodigo:country.paisCodigo,moneda:country.moneda}}),scope)
}
export function confirmAssetLifecycle(v:any,intent:AssetLifecycleIntent){
 const tenant=intent.tenantId,actor=intent.actorId,assetId=intent.assetId,action=intent.action,key=intent.idempotencyKey,request=assetLifecyclePayload(intent)
  const e=request.expected,p=request.original,d=v?.data,op=v?.operation;
  if (!live(v) || v.success !== true || v.complete !== true || v.tenant_id !== tenant || typeof v.idempotent !== 'boolean' || !live(d) || !live(op)) unknown();
  if (op.status !== 'COMMITTED' || op.type !== 'ACCOUNTING_ASSET_'+action || !uuid(op.operation_id) || op.asset_id !== assetId || op.tenant_id !== tenant || op.actor_id !== actor || op.idempotency_key !== key || !timestamp(op.created_at) || canonical(op.request) !== canonical(request) || typeof op.request_fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(op.request_fingerprint)) unknown();
  for (const field of ['id','tenant_id','codigo','fecha_adquisicion','fecha_inicio_depreciacion','valor_adquisicion','depreciacion_acumulada','created_by','estado','activo']) if (d[field] !== e[field]) unknown();
  if (d.created_at !== e.created_at && Date.parse(d.created_at) !== Date.parse(e.created_at) || !timestamp(d.updated_at) || !timestamp(d.created_at) || d.metodo_depreciacion !== 'LINEAL' || ![d.valor_adquisicion,d.valor_residual,d.depreciacion_acumulada,d.valor_neto].every(money) || Math.round(d.valor_neto*100) !== Math.round((e.valor_adquisicion-e.depreciacion_acumulada)*100)) unknown();
  for (const field of ['nombre','descripcion','vida_util_meses','valor_residual','centro_costo_id']) {
    const expected=action === 'UPDATE' && Object.prototype.hasOwnProperty.call(p,field) ? p[field] : e[field];
    if (d[field] !== expected) unknown();
  }
  if (action === 'UPDATE') {
    if (d.situacion !== 'ACTIVO' || d.asiento_baja_id !== null || d.fecha_baja !== null || d.valor_venta !== null || v.journal !== null) unknown();
  } else {
    const j=v.journal;
    if (d.situacion !== (p.tipo === 'VENTA' ? 'VENDIDO' : 'BAJA') || d.fecha_baja !== p.fecha || d.valor_venta !== (p.valor_venta??null) || d.motivo_baja !== (p.motivo??null) || !uuid(d.asiento_baja_id) || !live(j) || j.id !== d.asiento_baja_id || j.tenant_id !== tenant || !journalNumber(j.numero_asiento) || !timestamp(j.created_at) || !timestamp(j.confirmado_en) || j.estado !== 'CONFIRMADO' || j.origen !== 'BAJA_ACTIVO_FIJO' || j.created_by !== actor || j.confirmado_por !== actor || typeof j.fecha !== 'string' || j.fecha.slice(0,10) !== p.fecha || !uuid(j.source_event_id) || !Array.isArray(j.detalles) || j.detalles.length < 2 || j.detalles.length > 5) unknown();
    const ids=new Set<string>();let debit=0,credit=0;
    for (const row of j.detalles) {
      if (!live(row) || !uuid(row.id) || ids.has(row.id) || row.asiento_id !== j.id || row.tenant_id !== tenant || !uuid(row.cuenta_id) || !money(row.debe) || !money(row.haber) || row.debe>0 && row.haber>0) unknown();
      ids.add(row.id);debit+=Math.round(row.debe*100);credit+=Math.round(row.haber*100);
    }
    const total=Math.round(e.valor_adquisicion*100)+Math.round((p.valor_venta??0)*100);
    if (!Number.isSafeInteger(debit) || !Number.isSafeInteger(credit) || debit !== total || credit !== total) unknown();
  }
  return v;
}

export function currentAssetLifecycleActor(scope: AssetLifecycleScope) {
  try { const session = JSON.parse(localStorage.getItem('erp.auth.session.snapshot') || 'null'); return scopeValid(scope) && session?.user?.id === scope.actorId && session?.user?.tenant_id === scope.tenantId } catch { return false }
}
/** Read-only recovery: immutable requests survive a missing pointer; no automatic send or retirement. */
export function loadAssetLifecycle(scope: AssetLifecycleScope): AssetLifecycleIntent | null {
  const key = assetLifecycleKey(scope), pointer = localStorage.getItem(key)
  const active = pointer === null ? null : readAssetLifecycleIntent(pointer, scope)
  const unresolved = new Map<string, AssetLifecycleIntent>()
  for (let i = 0; i < localStorage.length; i++) {
    const name = localStorage.key(i)
    if (!name?.startsWith(archivePrefix(scope))) continue
    const raw = localStorage.getItem(name)
    if (raw === null) unknown()
    const v = readAssetLifecycleIntent(raw, scope)
    if (name !== archiveKey(v) || active?.idempotencyKey === v.idempotencyKey && raw !== pointer) unknown()
    const receipt = localStorage.getItem(assetLifecycleReceiptKey(v))
    if (receipt === null) unresolved.set(v.idempotencyKey, v)
    else confirmAssetLifecycle(JSON.parse(receipt), v)
  }
  if (active) unresolved.set(active.idempotencyKey, active)
  if (unresolved.size > 1) throw new Error('Hay más de una intención de operación del activo conservada. Se bloquea otro registro y se mantienen todos sus datos.')
  return unresolved.values().next().value ?? null
}
function writeExact(key: string, raw: string) { localStorage.setItem(key, raw); if (localStorage.getItem(key) !== raw) unknown() }
export function preserveAssetLifecycle(intent: AssetLifecycleIntent) {
  const raw = JSON.stringify(intent), active = loadAssetLifecycle(intent)
  readAssetLifecycleIntent(raw, intent)
  if (active && JSON.stringify(active) !== raw) unknown()
  const archive = localStorage.getItem(archiveKey(intent))
  if (archive !== null && archive !== raw) unknown()
  if (archive !== null && localStorage.getItem(assetLifecycleKey(intent)) === null && localStorage.getItem(assetLifecycleReceiptKey(intent)) !== null) throw new Error('Este registro ya tiene un recibo conservado. No se vuelve a abrir la intención cerrada.')
  if (archive === null) writeExact(archiveKey(intent), raw)
  const pointer = localStorage.getItem(assetLifecycleKey(intent))
  if (pointer !== null && pointer !== raw) unknown()
  if (pointer === null) writeExact(assetLifecycleKey(intent), raw)
  return raw
}
export function retireAssetLifecycle(intent: AssetLifecycleIntent, response: any) {
  const receipt = confirmAssetLifecycle(response, intent), raw = JSON.stringify(intent), key = assetLifecycleKey(intent), saved = loadAssetLifecycle(intent)
  if (!saved || JSON.stringify(saved) !== raw || localStorage.getItem(key) !== raw || localStorage.getItem(archiveKey(intent)) !== raw) unknown()
  const receiptKey = assetLifecycleReceiptKey(intent), existing = localStorage.getItem(receiptKey)
  if (existing === null) writeExact(receiptKey, JSON.stringify(response))
  else {
    const earlier = JSON.parse(existing); confirmAssetLifecycle(earlier, intent)
    if (earlier.operation.operation_id !== response.operation.operation_id) unknown()
  }
  confirmAssetLifecycle(JSON.parse(localStorage.getItem(receiptKey) || 'null'), intent)
  if (localStorage.getItem(key) !== raw) unknown()
  localStorage.removeItem(key)
  if (localStorage.getItem(key) !== null) unknown()
  return receipt
}
export async function withAssetLifecycleLock<T>(scope: AssetLifecycleScope, action: () => Promise<T>): Promise<T> {
  if (!currentAssetLifecycleActor(scope) || !navigator.locks?.request) throw new Error('No se pudo confirmar la sesión o reservar el registro. La intención se conserva sin enviar.')
  return navigator.locks.request(assetLifecycleKey(scope) + '.writer', { ifAvailable: true }, async lock => {
    if (!lock || !currentAssetLifecycleActor(scope)) throw new Error('Otro registro está en curso. La intención se conserva; reintente manualmente cuando termine.')
    return action()
  })
}
