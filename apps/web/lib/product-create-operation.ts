export type ProductCreateScope = { tenantId: string; actorId: string }
export type ProductCreatePayload = {
  codigo: string; nombre: string; marca?: string; descripcion?: string; unidad_medida: string; categoria: string;
  precio_venta: number; precio_compra: number; stock_inicial: number; stock_minimo: number; stock_reservado: number;
  almacen_id: string | null; es_servicio: boolean; controla_stock: boolean; codigo_barras?: string; impuesto: number;
  afectacion_igv: string; atributos_extra?: Record<string,string>; costo_cero_confirmado?: boolean; idempotency_key: string;
}
export type ImageIntent = { name: string; type: string; size: number; lastModified: number; base64: string; seed: string; sha256: string }
export type ProductCreateIntent = ProductCreateScope & {
  version: 1; createdAt: string; stage: 'CREATE' | 'IMAGE'; payload: ProductCreatePayload; image?: ImageIntent;
  created?: { id: string; operationId: string; fingerprint: string };
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const text=(v:unknown,max:number):v is string=>typeof v==='string' && !!v.trim() && v.length<=max
const object=(v:any,keys?:string[])=>v && typeof v==='object' && !Array.isArray(v) && (!keys||Object.keys(v).every(k=>keys.includes(k)))
const number=(v:unknown,places=6):v is number=>typeof v==='number' && Number.isFinite(v) && v>=0 && v<=999999999999 && Math.abs(v*10**places-Math.round(v*10**places))<=0.000001
const timestamp=(v:unknown):v is string=>typeof v==='string' && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v.slice(0,10)+'T00:00:00Z').toISOString().slice(0,10)===v.slice(0,10)
const fingerprint=(v:unknown):v is string=>typeof v==='string' && /^[0-9a-f]{64}$/i.test(v)
const live=(v:any)=>object(v) && !v.offline && !v.cached && !v.queued && !v.pending
const fail=():never=>{throw new Error('El producto no está confirmado. Sus datos se conservan para reintentar con conexión.')}
export function productCreateIntentKey(scope:ProductCreateScope){
  if(!uuid.test(scope.tenantId)||!uuid.test(scope.actorId))return fail()
  return `erp.product.create.pending.v1.${scope.tenantId}:${scope.actorId}`
}
export function readProductCreateIntent(raw:string|null,scope:ProductCreateScope):ProductCreateIntent|null{
  productCreateIntentKey(scope);if(raw===null)return null
  let i:ProductCreateIntent;try{i=JSON.parse(raw)}catch{return fail()}
  const p=i?.payload
  if(!object(i,['version','createdAt','tenantId','actorId','stage','payload','image','created']) || i.version!==1 || i.tenantId!==scope.tenantId || i.actorId!==scope.actorId || !timestamp(i.createdAt) || !['CREATE','IMAGE'].includes(i.stage)
    || !object(p,['codigo','nombre','marca','descripcion','unidad_medida','categoria','precio_venta','precio_compra','stock_inicial','stock_minimo','stock_reservado','almacen_id','es_servicio','controla_stock','codigo_barras','impuesto','afectacion_igv','atributos_extra','costo_cero_confirmado','idempotency_key'])
    || !text(p.codigo,80)||!text(p.nombre,200)||!text(p.categoria,120)||!text(p.idempotency_key,180)||p.idempotency_key.length<8
    || !['NIU','KGM','LTR','MTR','ZZ'].includes(p.unidad_medida)||!['10','20','30','40'].includes(p.afectacion_igv)
    || !['precio_venta','precio_compra','stock_inicial','stock_minimo','stock_reservado'].every(k=>number((p as any)[k]))
    || p.stock_reservado!==0 || !number(p.impuesto,4)||p.impuesto>100 || (p.afectacion_igv!=='10' && p.impuesto!==0)
    || typeof p.es_servicio!=='boolean'||typeof p.controla_stock!=='boolean'||(p.es_servicio&&p.controla_stock)
    || ((p.es_servicio||!p.controla_stock)&&p.stock_inicial!==0)|| (p.stock_inicial>0&&!uuid.test(p.almacen_id||''))
    || (p.almacen_id!==null&&!uuid.test(p.almacen_id)) || ((!p.controla_stock||p.es_servicio)&&p.almacen_id!==null)
    || ['marca','descripcion','codigo_barras'].some(k=>Object.hasOwn(p,k)&&!text((p as any)[k],k==='descripcion'?1000:120))
    || (Object.hasOwn(p,'costo_cero_confirmado')&&(p.costo_cero_confirmado!==true||p.precio_compra!==0))
    || (p.stock_inicial>0&&p.precio_compra===0&&p.costo_cero_confirmado!==true)
    || (Object.hasOwn(p,'atributos_extra')&&(!object(p.atributos_extra)||Object.keys(p.atributos_extra||{}).length>500||!Object.entries(p.atributos_extra||{}).every(([k,v])=>text(k,120)&&typeof v==='string'&&v.length<=1000))))return fail()
  if(Object.hasOwn(i,'image') && (!i.image||!object(i.image,['name','type','size','lastModified','base64','seed','sha256'])||!text(i.image.name,255)||!['image/jpeg','image/png','image/webp'].includes(i.image.type)||!Number.isSafeInteger(i.image.size)||i.image.size<1||i.image.size>5*1024*1024||!Number.isSafeInteger(i.image.lastModified)||i.image.lastModified<0||!uuid.test(i.image.seed)||!fingerprint(i.image.sha256)||typeof i.image.base64!=='string'||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(i.image.base64)||i.image.base64.length>6990510||atob(i.image.base64).length!==i.image.size))return fail()
  if(i.stage==='CREATE'&&Object.hasOwn(i,'created'))return fail()
  if(i.stage==='IMAGE'&&(!i.image||!object(i.created,['id','operationId','fingerprint'])||!uuid.test(i.created?.id||'')||!uuid.test(i.created?.operationId||'')||!fingerprint(i.created?.fingerprint)))return fail()
  return i
}
export function confirmProductCreated(response:any,scope:ProductCreateScope,intent:ProductCreateIntent){
  const verified=readProductCreateIntent(JSON.stringify(intent),scope);if(!verified||verified.stage!=='CREATE'||!live(response)||response.success!==true||!live(response.data))return fail()
  const d=response.data,p=verified.payload
  if(!uuid.test(d.id||'')||d.tenant_id!==scope.tenantId||d.created_by!==scope.actorId||d.updated_by!==scope.actorId||d.activo!==true||d.estado!=='ACTIVO'||!timestamp(d.created_at)||!timestamp(d.updated_at)||typeof d.idempotent!=='boolean'||!uuid.test(d.operation_id||'')||!fingerprint(d.creation_fingerprint)
    || d.codigo!==p.codigo.trim().toUpperCase()||d.nombre!==p.nombre.trim()||d.categoria!==p.categoria.trim()
    || d.unidad_medida!==p.unidad_medida||d.es_servicio!==p.es_servicio||d.controla_stock!==p.controla_stock||d.afectacion_igv!==p.afectacion_igv||d.impuesto!==p.impuesto
    || d.precio_venta!==p.precio_venta||d.precio_compra!==p.precio_compra||d.stock_actual!==p.stock_inicial||d.stock!==p.stock_inicial||d.stock_minimo!==p.stock_minimo||d.stock_reservado!==p.stock_reservado
    || d.codigo_barras!==(p.codigo_barras?.trim()||p.codigo.trim().toUpperCase())||d.marca!==(p.marca?.trim()||null)||d.descripcion!==(p.descripcion?.trim()||null)||d.imagen_url!==''
    || !object(d.atributos_extra)||JSON.stringify(Object.entries(d.atributos_extra).sort())!==JSON.stringify(Object.entries(p.atributos_extra||{}).sort()))return fail()
  return d
}
export async function preserveProductImage(file:File):Promise<ImageIntent>{
  const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('No se pudo conservar la imagen antes del alta.'));reader.readAsDataURL(file)})
  const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer())
  return {name:file.name,type:file.type,size:file.size,lastModified:file.lastModified,base64:data.slice(data.indexOf(',')+1),seed:crypto.randomUUID(),sha256:Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('')}
}
export async function recoveredProductImage(intent:Pick<ProductCreateIntent,'image'>):Promise<File>{
  if(!intent.image)return fail();const image=intent.image,bytes=Uint8Array.from(atob(image.base64),c=>c.charCodeAt(0))
  const digest=await crypto.subtle.digest('SHA-256',bytes);if(Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('')!==image.sha256)return fail()
  return new File([bytes],image.name,{type:image.type,lastModified:image.lastModified})
}
export function productImageIntentKey(intent:ProductCreateIntent){if(!intent.image||!intent.created)return fail();return `inventory-product-image-upload:${intent.created.id}:${intent.image.seed}`}
export function confirmCreatedProductImage(response:any,scope:ProductCreateScope,intent:ProductCreateIntent){
  const verified=readProductCreateIntent(JSON.stringify(intent),scope);if(!verified||verified.stage!=='IMAGE'||!live(response)||response.success!==true||!live(response.data))return fail()
  const d=response.data,extension=verified.image!.type==='image/jpeg'?'jpg':verified.image!.type==='image/png'?'png':'webp'
  const expectedPath=`${scope.tenantId}/${verified.created!.id}/${d.imagen_id}.${extension}`
  if(d.producto_id!==verified.created!.id||!uuid.test(d.operation_id||'')||!uuid.test(d.imagen_id||'')||d.bucket_id!=='product-images'||d.object_path!==expectedPath||d.completed!==true||d.cleanup_pending||!text(d.imagen_url,2000)||d.estado!=='ACTIVA'||typeof d.idempotent!=='boolean'||d.sha256!==verified.image!.sha256||d.mime_type!==verified.image!.type||d.bytes!==verified.image!.size)return fail()
  let url:URL;try{url=new URL(d.imagen_url)}catch{return fail()}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||!url.pathname.endsWith('/storage/v1/object/public/product-images/'+expectedPath))return fail()
}
