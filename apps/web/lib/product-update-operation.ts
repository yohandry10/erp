import { ImageIntent } from './product-create-operation'

export type ProductUpdateScope = { tenantId: string; actorId: string; productId: string }
export type ProductUpdatePayload = {
  codigo: string; nombre: string; marca: string; descripcion?: string; unidad_medida?: string; categoria: string;
  precio_venta: number; precio_compra: number; stock_minimo: number; codigo_barras?: string; impuesto: number;
  afectacion_igv: string; es_servicio: boolean; controla_stock: boolean; idempotency_key: string;
}
export type ProductSnapshot = {
  id: string; tenant_id: string; codigo: string; nombre: string; marca: string|null; descripcion: string|null;
  unidad_medida: string|null; categoria: string; precio_venta: number; precio_compra: number; stock_minimo: number;
  stock_actual: number; stock: number; stock_reservado: number; codigo_barras: string|null; impuesto: number;
  afectacion_igv: string; es_servicio: boolean; controla_stock: boolean; imagen_url: string; atributos_extra: Record<string,unknown>;
  activo: boolean; estado: string; created_by: string|null; updated_by: string|null; created_at: string; updated_at: string;
  creation_fingerprint: string|null;
}
export type ProductUpdateIntent = ProductUpdateScope & {
  version: 1; createdAt: string; stage: 'UPDATE'|'IMAGE_UPLOAD'|'IMAGE_DELETE'; payload: ProductUpdatePayload;
  original: ProductSnapshot; image?: ImageIntent; removeImage: boolean; imageKey: string;
  confirmed?: { operationId: string; updatedAt: string };
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const text=(v:unknown,max:number):v is string=>typeof v==='string'&&!!v.trim()&&v.length<=max
const object=(v:any,keys?:string[])=>v&&typeof v==='object'&&!Array.isArray(v)&&(!keys||Object.keys(v).every(k=>keys.includes(k)))
const numeric=(v:unknown,places=6):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=999999999999&&Math.abs(v*10**places-Math.round(v*10**places))<=0.000001
const timestamp=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v.slice(0,10)+'T00:00:00Z').toISOString().slice(0,10)===v.slice(0,10)
const fingerprint=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{64}$/i.test(v)
const live=(v:any)=>object(v)&&!v.offline&&!v.cached&&!v.queued&&!v.pending
const fail=():never=>{throw new Error('El cambio del producto no está confirmado. Sus datos se conservan para reintentar con conexión.')}
const fields=['id','tenant_id','codigo','nombre','marca','descripcion','unidad_medida','categoria','precio_venta','precio_compra','stock_minimo','stock_actual','stock','stock_reservado','codigo_barras','impuesto','afectacion_igv','es_servicio','controla_stock','imagen_url','atributos_extra','activo','estado','created_by','updated_by','created_at','updated_at','creation_fingerprint']
const canonical=(v:any):any=>Array.isArray(v)?v.map(canonical):object(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v
function snapshot(value:any,scope:ProductUpdateScope):ProductSnapshot {
  if(!live(value)||value.id!==scope.productId||value.tenant_id!==scope.tenantId||!text(value.codigo,80)||!text(value.nombre,200)||!text(value.categoria,120)
    || !['marca','descripcion','codigo_barras'].every(k=>value[k]===null||typeof value[k]==='string')
    || !(value.unidad_medida===null||['NIU','KGM','LTR','MTR','ZZ'].includes(value.unidad_medida))
    || !['precio_venta','precio_compra','stock_minimo','stock_actual','stock','stock_reservado'].every(k=>numeric(value[k]))||value.stock!==value.stock_actual
    || typeof value.es_servicio!=='boolean'||typeof value.controla_stock!=='boolean'||(value.es_servicio&&value.controla_stock)
    || !numeric(value.impuesto,4)||value.impuesto>100||!['10','20','30','40'].includes(value.afectacion_igv)
    || !object(value.atributos_extra)||typeof value.imagen_url!=='string'||typeof value.activo!=='boolean'||value.estado!==(value.activo?'ACTIVO':'INACTIVO')
    || !['created_by','updated_by'].every(k=>value[k]===null||uuid.test(value[k]||''))||!timestamp(value.created_at)||!timestamp(value.updated_at)
    || Date.parse(value.updated_at)<Date.parse(value.created_at)||!(value.creation_fingerprint===null||fingerprint(value.creation_fingerprint)))return fail()
  return Object.fromEntries(fields.map(k=>[k,value[k]])) as ProductSnapshot
}
export function productUpdateIntentKey(scope:ProductUpdateScope){
  if(![scope.tenantId,scope.actorId,scope.productId].every(v=>uuid.test(v)))return fail()
  return `erp.product.update.pending.v1.${scope.tenantId}:${scope.actorId}:${scope.productId}`
}
export function confirmProductUpdateSource(response:any,scope:ProductUpdateScope){
  productUpdateIntentKey(scope);if(!live(response)||response.success!==true)return fail();return snapshot(response.data,scope)
}
export function readProductUpdateIntent(raw:string|null,scope:ProductUpdateScope):ProductUpdateIntent|null{
  productUpdateIntentKey(scope);if(raw===null)return null
  let i:ProductUpdateIntent;try{i=JSON.parse(raw)}catch{return fail()}
  const p=i?.payload
  if(!object(i,['version','createdAt','tenantId','actorId','productId','stage','payload','original','image','removeImage','imageKey','confirmed'])||i.version!==1||i.tenantId!==scope.tenantId||i.actorId!==scope.actorId||i.productId!==scope.productId||!timestamp(i.createdAt)||!['UPDATE','IMAGE_UPLOAD','IMAGE_DELETE'].includes(i.stage)
    || !object(p,['codigo','nombre','marca','descripcion','unidad_medida','categoria','precio_venta','precio_compra','stock_minimo','codigo_barras','impuesto','afectacion_igv','es_servicio','controla_stock','idempotency_key'])
    || !text(p.codigo,80)||!text(p.nombre,200)||!text(p.categoria,120)||typeof p.marca!=='string'||p.marca.length>120||!text(p.idempotency_key,180)||p.idempotency_key.length<8
    || !['precio_venta','precio_compra','stock_minimo'].every(k=>numeric((p as any)[k]))||!numeric(p.impuesto,4)||p.impuesto>100||!['10','20','30','40'].includes(p.afectacion_igv)||(p.afectacion_igv!=='10'&&p.impuesto!==0)
    || typeof p.es_servicio!=='boolean'||typeof p.controla_stock!=='boolean'||(p.es_servicio&&p.controla_stock)
    || (Object.hasOwn(p,'unidad_medida')&&!['NIU','KGM','LTR','MTR','ZZ'].includes(p.unidad_medida||''))
    || ['descripcion','codigo_barras'].some(k=>Object.hasOwn(p,k)&&!text((p as any)[k],k==='descripcion'?1000:120))
    || typeof i.removeImage!=='boolean'||!text(i.imageKey,180)||i.imageKey.length<8||!object(i.original,fields))return fail()
  snapshot(i.original,scope)
  if(Object.hasOwn(i,'image')){
    const image=i.image
    if(!image||!object(image,['name','type','size','lastModified','base64','seed','sha256'])||!text(image.name,255)||!['image/jpeg','image/png','image/webp'].includes(image.type)||!Number.isSafeInteger(image.size)||image.size<1||image.size>5*1024*1024||!Number.isSafeInteger(image.lastModified)||image.lastModified<0||!uuid.test(image.seed)||!fingerprint(image.sha256)||typeof image.base64!=='string'||image.base64.length>6990510||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(image.base64)||atob(image.base64).length!==image.size||i.removeImage)return fail()
  }
  if(i.removeImage&&!i.original.imagen_url)return fail()
  if(i.stage==='UPDATE'&&Object.hasOwn(i,'confirmed'))return fail()
  if(i.stage!=='UPDATE'&&(!object(i.confirmed,['operationId','updatedAt'])||!uuid.test(i.confirmed?.operationId||'')||!timestamp(i.confirmed?.updatedAt)||(i.stage==='IMAGE_UPLOAD'?!i.image:!i.removeImage)))return fail()
  return i
}
export function confirmProductUpdated(response:any,scope:ProductUpdateScope,intent:ProductUpdateIntent):ProductUpdateIntent{
  const verified=readProductUpdateIntent(JSON.stringify(intent),scope);if(!verified||verified.stage!=='UPDATE'||!live(response)||response.success!==true||typeof response.data?.idempotent!=='boolean'||!uuid.test(response.data?.operation_id||''))return fail()
  const d=snapshot(response.data,scope),p=verified.payload,o=verified.original
  if(d.updated_by!==scope.actorId||d.codigo!==p.codigo.trim().toUpperCase()||d.nombre!==p.nombre.trim()||d.marca!==(p.marca.trim()||null)||d.categoria!==p.categoria.trim()
    || ['precio_venta','precio_compra','stock_minimo','impuesto','afectacion_igv','es_servicio','controla_stock'].some(k=>(d as any)[k]!== (p as any)[k])
    || d.descripcion!==(p.descripcion?.trim()||o.descripcion)||d.codigo_barras!==(p.codigo_barras?.trim()||o.codigo_barras)||d.unidad_medida!==(p.unidad_medida||o.unidad_medida)
    || ['created_by','created_at','creation_fingerprint','activo','estado','stock_actual','stock','stock_reservado','imagen_url'].some(k=>(d as any)[k]!==(o as any)[k])
    || JSON.stringify(canonical(d.atributos_extra))!==JSON.stringify(canonical(o.atributos_extra))||Date.parse(d.updated_at)<Date.parse(o.updated_at))return fail()
  if(!verified.image&&!verified.removeImage)return verified
  return {...verified,stage:verified.image?'IMAGE_UPLOAD':'IMAGE_DELETE',confirmed:{operationId:response.data.operation_id,updatedAt:d.updated_at}}
}
export function confirmUpdatedProductImage(response:any,scope:ProductUpdateScope,intent:ProductUpdateIntent){
  const i=readProductUpdateIntent(JSON.stringify(intent),scope);if(!i||i.stage==='UPDATE'||!live(response)||response.success!==true||!live(response.data))return fail()
  const d=response.data;if(d.producto_id!==scope.productId||!uuid.test(d.operation_id||'')||typeof d.idempotent!=='boolean'||d.completed!==true||d.cleanup_pending)return fail()
  if(i.stage==='IMAGE_UPLOAD'){
    const image=i.image!,ext=image.type==='image/jpeg'?'jpg':image.type==='image/png'?'png':'webp',path=`${scope.tenantId}/${scope.productId}/${d.imagen_id}.${ext}`
    if(!uuid.test(d.imagen_id||'')||d.bucket_id!=='product-images'||d.object_path!==path||d.sha256!==image.sha256||d.mime_type!==image.type||d.bytes!==image.size||d.estado!=='ACTIVA'||!text(d.imagen_url,2000))return fail()
    let url:URL;try{url=new URL(d.imagen_url)}catch{return fail()}
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password||!url.pathname.endsWith('/storage/v1/object/public/product-images/'+path))return fail()
  }else if(d.estado==='SIN_OBJETO'){
    if(d.legacy_url_removed!==true||Object.hasOwn(d,'imagen_id')||Object.hasOwn(d,'object_path'))return fail()
  }else if(d.estado==='BORRADA'){
    if(!uuid.test(d.imagen_id||'')||typeof d.object_path!=='string'||!new RegExp(`^${scope.tenantId}/${scope.productId}/${d.imagen_id}\\.(jpg|png|webp)$`).test(d.object_path))return fail()
  }else return fail()
}
