import {readInvoiceOrder,type InvoiceScope} from './invoice-generation-operation'
export type DeliveryScope=InvoiceScope
export type DeliveryPayload={estado:'ENTREGADO';notas:string;expected_snapshot:Record<string,any>;idempotency_key:string}
export type DeliveryIntent=DeliveryScope&{version:1;createdAt:string;body:string;context:{number:string;currency:string;total:number;lines:{id:string;productId:string;description:string;quantity:number;price:number;subtotal:number;dispatched:number;billed:number}[]}}
const rawKeys=["id", "igv", "fecha", "notas", "total", "codigo", "estado", "gre_id", "moneda", "nombre", "numero", "metadata", "subtotal", "pedido_id", "tenant_id", "cliente_id", "created_at", "created_by", "factura_id", "updated_at", "aprobado_en", "aprobado_por", "fecha_pedido", "confirmado_en", "cotizacion_id", "observaciones", "confirmado_por", "estado_credito", "tipo_documento", "tracking_notas", "tracking_estado", "requiere_aprobacion", "tracking_actualizado_en", "motivo_requiere_aprobacion"]
const object=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(v)
const live=(v:Record<string,any>)=>['cached','queued','offline','pending'].every(k=>v[k]===undefined||v[k]===false)
const exact=(v:Record<string,any>,keys:string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.prototype.hasOwnProperty.call(v,k))
const equal=(a:any,b:any):boolean=>a===b||(Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>equal(v,b[i])))||(object(a)&&object(b)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.prototype.hasOwnProperty.call(b,k)&&equal(a[k],b[k])))
const stamp=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v.slice(0,10)+'T00:00:00Z').toISOString().slice(0,10)===v.slice(0,10)
const money=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&Number.isSafeInteger(Math.round(v*100))&&Math.abs(v*100-Math.round(v*100))<.00001
function fail():never{throw new Error('Se necesita la identidad y fotografía completas de la entrega. La operación pendiente se conserva.')}
function scopeValid(s:DeliveryScope){return uuid(s.tenantId)&&uuid(s.actorId)&&uuid(s.orderId)}
export function deliveryIntentKey(s:DeliveryScope){if(!scopeValid(s))fail();return `erp.sales.delivery.pending.v1.${s.tenantId}:${s.actorId}:${s.orderId}`}
export function readDeliverySnapshot(v:unknown,s:DeliveryScope):Record<string,any>{
 if(!scopeValid(s)||!object(v)||!exact(v,rawKeys)||v.id!==s.orderId||v.tenant_id!==s.tenantId||!uuid(v.cliente_id)||typeof v.numero!=='string'||!v.numero.trim()||!['DESPACHO_PARCIAL','LISTO_FACTURAR','FACTURADO','COMPLETADO'].includes(v.estado)||typeof v.tracking_estado!=='string'||!object(v.metadata)||!stamp(v.created_at)||!stamp(v.updated_at)||!money(v.subtotal)||!money(v.igv)||!money(v.total)||v.total<0||Math.abs(v.subtotal+v.igv-v.total)>.00001||!['PEN','USD'].includes(v.moneda))fail()
 return v
}
export function newDeliveryIntent(response:unknown,s:DeliveryScope,notes:string):DeliveryIntent{
 const order=readInvoiceOrder(response,s);if(!object(response)||!object(response.data))fail()
 const snapshot=readDeliverySnapshot(Object.fromEntries(rawKeys.map(k=>[k,response.data[k]])),s)
 if(snapshot.tracking_estado==='ENTREGADO'||typeof notes!=='string'||notes!==notes.trim()||notes.length>10000)fail()
 const body:DeliveryPayload={estado:'ENTREGADO',notas:notes,expected_snapshot:snapshot,idempotency_key:crypto.randomUUID()}
 return {version:1,...s,createdAt:new Date().toISOString(),body:JSON.stringify(body),context:{number:order.snapshot.number,currency:order.snapshot.currency,total:order.snapshot.total,lines:order.snapshot.lines.map((l,i)=>({id:l.id,productId:l.productId,description:l.description,quantity:l.quantity,price:l.price,subtotal:l.subtotal,dispatched:order.dispatched[i],billed:order.billed[i]}))}}
}
export function readDeliveryIntent(raw:string|null,s:DeliveryScope):DeliveryIntent|null{
 if(raw===null)return null
 try{
  if(raw.length>262144)fail();const i=JSON.parse(raw)
  if(!object(i)||!exact(i,['version','tenantId','actorId','orderId','createdAt','body','context'])||i.version!==1||i.tenantId!==s.tenantId||i.actorId!==s.actorId||i.orderId!==s.orderId||!stamp(i.createdAt)||typeof i.body!=='string'||!object(i.context))fail()
  const p=JSON.parse(i.body);if(!object(p)||!exact(p,['estado','notas','expected_snapshot','idempotency_key'])||p.estado!=='ENTREGADO'||!uuid(p.idempotency_key)||typeof p.notas!=='string'||p.notas!==p.notas.trim()||p.notas.length>10000)fail()
  const snapshot=readDeliverySnapshot(p.expected_snapshot,s);if(snapshot.tracking_estado==='ENTREGADO'||i.context.number!==snapshot.numero||i.context.currency!==snapshot.moneda||i.context.total!==snapshot.total||!exact(i.context,['number','currency','total','lines'])||!Array.isArray(i.context.lines)||i.context.lines.length<1||new Set(i.context.lines.map((l:any)=>l.id)).size!==i.context.lines.length||i.context.lines.some((l:any)=>!object(l)||!exact(l,['id','productId','description','quantity','price','subtotal','dispatched','billed'])||!uuid(l.id)||!uuid(l.productId)||!money(l.price)||l.price<0||!money(l.subtotal)||!money(l.billed)||l.billed<0||l.billed>l.quantity||typeof l.description!=='string'||!money(l.quantity)||l.quantity<=0||!money(l.dispatched)||l.dispatched<0||l.dispatched>l.quantity))fail()
  return i as DeliveryIntent
 }catch{fail()}
}
export function confirmDeliveryRegistered(response:unknown,intent:DeliveryIntent):Record<string,any>{
 if(!object(response)||!live(response)||response.success!==true)fail();const r=response.data===undefined?response:response.data,p:DeliveryPayload=JSON.parse(intent.body)
 if(!object(r)||!live(r)||r.success!==true||r.action!=='TRACKING'||r.tenant_id!==intent.tenantId||r.actor_id!==intent.actorId||r.pedido_id!==intent.orderId||r.idempotency_key!==p.idempotency_key||typeof r.idempotent!=='boolean'||typeof r.request_fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(r.request_fingerprint)||!equal(r.payload,{estado:p.estado,notas:p.notas,expected_snapshot:p.expected_snapshot}))fail()
 const order=r.pedido,event=r.evento,audit=r.auditoria
 if(!object(order)||!exact(order,rawKeys)||order.tracking_estado!=='ENTREGADO'||order.tracking_notas!==p.notas||order.estado!==(p.expected_snapshot.estado==='FACTURADO'?'COMPLETADO':p.expected_snapshot.estado)||!stamp(order.tracking_actualizado_en)||!stamp(order.updated_at)||Date.parse(order.updated_at)<Date.parse(p.expected_snapshot.updated_at))fail()
 const changes=['estado','tracking_estado','tracking_actualizado_en','tracking_notas','updated_at']
 if(!equal(Object.fromEntries(Object.entries(order).filter(([k])=>!changes.includes(k))),Object.fromEntries(Object.entries(p.expected_snapshot).filter(([k])=>!changes.includes(k)))))fail()
 if(!object(event)||!exact(event,["id", "tenant_id", "nombre", "codigo", "estado", "metadata", "created_at", "updated_at", "pedido_id", "datos", "registrado_por", "registrado_en", "tipo", "idempotency_key"])||!uuid(event.id)||event.tenant_id!==intent.tenantId||event.pedido_id!==intent.orderId||(!stamp(event.created_at)||!stamp(event.updated_at)||!object(event.metadata)||event.tipo!=='ENTREGA')||event.registrado_por!==intent.actorId||event.idempotency_key!==p.idempotency_key||event.registrado_en!==order.tracking_actualizado_en||!object(event.datos)||event.datos.accion!=='TRACKING'||event.datos.estado!=='ENTREGADO'||event.datos.notas!==p.notas||event.datos.fingerprint!==r.request_fingerprint||!equal(event.datos.expected_snapshot,p.expected_snapshot)||'resultado' in event.datos)fail()
 if(!object(audit)||!exact(audit,["id", "tenant_id", "user_id", "table_name", "operation", "old_values", "new_values", "ip_address", "user_agent", "timestamp", "record_id", "email", "changed_fields", "metadata", "backend_event_fingerprint"])||!uuid(audit.id)||audit.tenant_id!==intent.tenantId||audit.user_id!==intent.actorId||audit.table_name!=='pedidos_venta'||(!stamp(audit.timestamp)||audit.operation!=='UPDATE')||audit.record_id!==intent.orderId||!object(audit.metadata)||audit.metadata.source!=='operar_logistica_tx'||audit.metadata.idempotency_key!==p.idempotency_key||!object(audit.old_values)||audit.old_values.estado!==p.expected_snapshot.estado||audit.old_values.tracking_estado!==p.expected_snapshot.tracking_estado||!object(audit.new_values)||audit.new_values.accion!=='TRACKING'||audit.new_values.tracking_estado!=='ENTREGADO')fail()
 if(!Array.isArray(r.detalle)||r.detalle.length!==intent.context.lines.length||new Set(r.detalle.map((d:any)=>d.id)).size!==r.detalle.length)fail()
 for(const line of intent.context.lines){const d=r.detalle.find((d:any)=>d.id===line.id);if(!object(d)||d.tenant_id!==intent.tenantId||d.pedido_id!==intent.orderId||d.producto_id!==line.productId||d.descripcion!==line.description||d.cantidad!==line.quantity||d.precio_unitario!==line.price||d.subtotal!==line.subtotal||d.cantidad_despachada!==line.dispatched||d.cantidad_facturada!==line.billed)fail()}
 return r
}
