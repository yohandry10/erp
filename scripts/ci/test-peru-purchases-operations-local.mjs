import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {fetchWithLocalLoginRetry} from './peru-local-http.mjs';
// Diagnóstico de compras: API/PostgREST/PostgreSQL locales efímeros; sin transporte fiscal.
assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB,'1');assert.equal(process.env.PGHOST,'127.0.0.1');assert.equal(process.env.PGDATABASE,'erp_e2e');
const api=process.env.LOCAL_API_URL;assert.equal(new URL(api).hostname,'127.0.0.1');const output=process.env.LOCAL_INTEGRATED_OUTPUT_DIR;
const fixtureName='purchases';
const first=JSON.parse(fs.readFileSync(path.join(output,fixtureName+'-first-fixture.json'))),other=JSON.parse(fs.readFileSync(path.join(output,fixtureName+'-other-fixture.json')));
const sql=query=>execFileSync(process.env.PSQL_BIN,['-XqAt','-h','127.0.0.1','-p',process.env.PGPORT,'-U','postgres','-d','erp_e2e','-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8',windowsHide:true}).trim();
assert.equal(sql("SELECT current_database()||'|'||environment||'|'||project_ref FROM app.deployment_environment WHERE singleton;"),'erp_e2e|DEV|localerpephemeralqax');
const q=id=>{assert.match(id,/^[0-9a-f-]{36}$/i);return "'"+id+"'::uuid";};
let token,otherToken,approverToken;const scenarios=[],requests=[];let success=false;
async function raw(endpoint,body,access=token,method=body===undefined?'GET':'POST'){
 const response=await fetchWithLocalLoginRetry(api+'/api/'+endpoint,{method,headers:{'content-type':'application/json',connection:'close','idempotency-key':randomUUID(),...(access?{authorization:'Bearer '+access}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 const bytes=Buffer.from(await response.arrayBuffer());let value;try{value=JSON.parse(bytes.toString());}catch{value=bytes.toString();}
 requests.push({method,endpoint:endpoint.replace(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/gi,':id').split('?')[0],status:response.status});
 return {status:response.status,body:value,data:value&&typeof value==='object'&&Object.hasOwn(value,'data')?value.data:value};
}
async function call(endpoint,body,status=body===undefined?200:201,access=token,method=body===undefined?'GET':'POST'){
 const result=await raw(endpoint,body,access,method);assert.equal(result.status,status,method+' '+endpoint.split('?')[0]+': '+JSON.stringify(result.body).slice(0,400));return result.data;
}
async function check(scenario,action){try{const detail=await action();scenarios.push({scenario,passed:true,...(detail||{})});}catch(error){scenarios.push({scenario,passed:false,message:String(error.message).slice(0,600)});}}
const count=(table,where)=>Number(sql(`SELECT count(*) FROM ${table} WHERE tenant_id=${q(first.tenant)}${where?' AND '+where:''};`));
const outage=async(table,action)=>{sql(`REVOKE SELECT ON public.${table} FROM service_role;`);try{return await action();}finally{sql(`GRANT SELECT ON public.${table} TO service_role;`);}};
try{
 token=(await call('auth/login',{email:first.email,password:'Cliente-Local-2026-Only!'})).access_token;
 otherToken=(await call('auth/login',{email:other.email,password:'Cliente-Local-2026-Only!'})).access_token;
 const forge=(await import('node:module')).createRequire(path.resolve('apps/erp-api/package.json'))('node-forge');
 const keys=forge.pki.rsa.generateKeyPair(2048),cert=forge.pki.createCertificate();cert.publicKey=keys.publicKey;cert.serialNumber='0a';cert.validity.notBefore=new Date(Date.now()-86400000);cert.validity.notAfter=new Date(Date.now()+365*86400000);
 const attrs=[{name:'commonName',value:'CERTIFICADO LOCAL '+first.ruc},{name:'countryName',value:'PE'},{name:'organizationName',value:'Ensayo compras ERP'},{type:'2.5.4.5',value:first.ruc}];cert.setSubject(attrs);cert.setIssuer(attrs);cert.sign(keys.privateKey,forge.md.sha256.create());
 const p12=forge.pkcs12.toPkcs12Asn1(keys.privateKey,[cert],'Clave-Compras-local',{algorithm:'3des'});
 await call('configuration/complete',{configuration:{ruc:first.ruc,pais:'PE',pais_id:1,razonSocial:'Empresa compras local configurada',direccion:'Origen local 123',ubigeo:'150101',tipo_empresa:'MICRO',regimen_tributario:'GENERAL',serie_factura:'F001',serie_boleta:'B001',serie_guia_remision:'T001',certificateBase64:Buffer.from(forge.asn1.toDer(p12).getBytes(),'binary').toString('base64'),certificatePassword:'Clave-Compras-local',sunat_environment:'homologacion'}});
 const warehouse=await call('inventario/almacenes',{idempotency_key:randomUUID(),codigo:'COMPRAS-LOCAL',nombre:'Almacén compras local',es_principal:true});
 await call('inventario/categorias',{idempotency_key:randomUUID(),codigo:'COMPRAS-LOCAL',nombre:'Mercaderías compras locales'});
 const product=await call('inventario/productos',{idempotency_key:randomUUID(),codigo:'COMPRAS-LOCAL',nombre:'Producto compras local',categoria:'Mercaderías compras locales',unidad_medida:'NIU',precio_compra:10,precio_venta:20,controla_stock:true,almacen_id:warehouse.id,stock_inicial:0,afectacion_igv:'10'});
 const provider=await call('compras/proveedores',{ruc:other.ruc,razon_social:'Proveedor compras local SAC',email:'proveedor-compras-local@example.test',direccion:'Av. Proveedor 123',condiciones_pago:'CREDITO_30',dias_credito:30});
 const roles=await call('roles'),admin=roles.find(role=>role.nombre==='ADMIN');assert.ok(admin);
 await call('users',{nombre:'Aprobador compras local',email:'aprobador-compras-local@example.test',password:'Compras-Aprobador-Local-2026!',roles:[admin.id],idempotency_key:randomUUID()});
 approverToken=(await call('auth/login',{email:'aprobador-compras-local@example.test',password:'Compras-Aprobador-Local-2026!'})).access_token;
 const line=(cantidad,precio)=>({producto_id:product.id,descripcion:product.nombre,cantidad,precio_unitario:precio});
 const order=async extra=>(await call('compras/ordenes',{idempotency_key:randomUUID(),numero:'OC-LOCAL-'+randomUUID().slice(0,8),proveedor_id:provider.id,condiciones_pago:'CREDITO_30',dias_credito:30,almacen_destino_id:warehouse.id,detalles:[line(2,10)],...extra}));

 await check('Compras: proveedor se encuentra por RUC; RUC ajeno o inexistente no se expone',async()=>{
  const found=await call('compras/proveedores/buscar-ruc/'+other.ruc);assert.equal((found?.id??found?.proveedor?.id),provider.id,JSON.stringify(found).slice(0,200));
  const missing=await raw('compras/proveedores/buscar-ruc/20100000000');assert.ok([404,200].includes(missing.status));if(missing.status===200)assert.ok(!missing.data||missing.data.id===undefined,'RUC inexistente devolvió proveedor');
  const foreign=await raw('compras/proveedores/buscar-ruc/'+other.ruc,undefined,otherToken);assert.ok(foreign.status===404||!foreign.data||foreign.data.id!==provider.id,'Proveedor visible desde otra empresa');
 });
 await check('Compras: cotización editada, enviada, aprobada por otro actor y convertida en una sola OC',async()=>{
  const intent={idempotency_key:randomUUID(),numero:'CQ-LOCAL-'+randomUUID().slice(0,8),proveedor_id:provider.id,detalles:[line(1,10)]};
  const quote=await call('compras/cotizaciones',intent);assert.equal((await call('compras/cotizaciones',intent)).id,quote.id);
  await call('compras/cotizaciones/'+quote.id,{detalles:[line(3,10)],observaciones:'Cotización compra editada'},200,token,'PUT');
  const detail=await call('compras/cotizaciones/'+quote.id);assert.equal(Number(detail.detalles[0].cantidad),3);
  const list=await call('compras/cotizaciones?proveedor_id='+provider.id);assert.ok((Array.isArray(list)?list:list.items??[]).some(r=>r.id===quote.id),JSON.stringify(list).slice(0,200));
  await call('compras/cotizaciones/'+quote.id+'/enviar',{},200);
  await call('compras/cotizaciones/'+quote.id+'/aprobar',{},200,approverToken);
  const before=count('ordenes_compra');const oc=await call('compras/cotizaciones/'+quote.id+'/convertir-oc',{});assert.ok(oc?.id??oc?.orden?.id,JSON.stringify(oc).slice(0,200));
  const again=await raw('compras/cotizaciones/'+quote.id+'/convertir-oc',{});assert.equal(count('ordenes_compra')-before,1,'Una sola OC; segunda conversión '+again.status);
 });
 await check('Compras: cotización rechazada con motivo no se convierte',async()=>{
  const quote=await call('compras/cotizaciones',{idempotency_key:randomUUID(),numero:'CQ-REJ-'+randomUUID().slice(0,8),proveedor_id:provider.id,detalles:[line(1,10)]});
  await call('compras/cotizaciones/'+quote.id+'/enviar',{},200);await call('compras/cotizaciones/'+quote.id+'/rechazar',{motivo:'Precio no competitivo local'},200,approverToken);
  const before=count('ordenes_compra');const conv=await raw('compras/cotizaciones/'+quote.id+'/convertir-oc',{});assert.ok([400,409].includes(conv.status),'Conversión de rechazada '+conv.status);assert.equal(count('ordenes_compra'),before);
 });
 await check('Compras: OC en borrador se edita y recalcula; listado filtra por proveedor y estado',async()=>{
  const oc=await order();await call('compras/ordenes/'+oc.id,{detalles:[line(4,10)]},200,token,'PUT');
  const detail=await call('compras/ordenes/'+oc.id);assert.equal(Number(detail.detalles[0].cantidad),4);assert.equal(Math.round(Number(detail.total)*100),Math.round(40*1.18*100));
  const list=await call('compras/ordenes?proveedor_id='+provider.id+'&estado=BORRADOR');const rows=Array.isArray(list)?list:list.items??list.ordenes??[];assert.ok(rows.some(r=>r.id===oc.id)&&rows.every(r=>r.estado==='BORRADOR'),JSON.stringify(list).slice(0,200));
 });
 await check('Compras: OC rechazada por otro actor y OC cancelada con motivo no admiten recepción',async()=>{
  const rejected=await order();await call('compras/ordenes/'+rejected.id+'/rechazar',{motivo_rechazo:'Presupuesto local insuficiente'},200,approverToken);
  // Rechazo y cancelación anulan la OC (453) y conservan su actor distinto.
  assert.equal(sql(`SELECT estado||'|'||(rechazado_by IS NOT NULL)::text FROM ordenes_compra WHERE id=${q(rejected.id)};`),'ANULADA|true');
  const cancelled=await order();await call('compras/ordenes/'+cancelled.id+'/cancelar',{motivo_cancelacion:'Cambio de requerimiento local'},200);
  assert.equal(sql(`SELECT estado||'|'||(cancelado_by IS NOT NULL)::text FROM ordenes_compra WHERE id=${q(cancelled.id)};`),'ANULADA|true');
  const before=count('recepciones');const receipt=await raw('compras/recepciones/ordenes/'+cancelled.id,{orden_id:cancelled.id,idempotency_key:randomUUID(),almacen_id:warehouse.id,items:[]});
  assert.ok([400,409].includes(receipt.status),'Recepción sobre OC cancelada '+receipt.status);assert.equal(count('recepciones'),before);
 });
 await check('Compras: recepción desde la ruta de la orden, editada y listada; replay no duplica',async()=>{
  const oc=await order();await call('compras/ordenes/'+oc.id+'/aprobar',{comentarios:'Aprobación local'},200,approverToken);
  const detail=await call('compras/ordenes/'+oc.id);const intent={orden_id:oc.id,idempotency_key:randomUUID(),almacen_id:warehouse.id,items:[{detalle_id:detail.detalles[0].id,cantidad_recibida:1,calidad:'OK'}]};
  const receipt=await call('compras/ordenes/'+oc.id+'/recepciones',intent);const id=receipt.id??receipt.data?.id;assert.ok(id,JSON.stringify(receipt).slice(0,200));
  const replay=await call('compras/ordenes/'+oc.id+'/recepciones',intent);assert.equal(replay.id??replay.data?.id,id);assert.equal(count('recepciones','orden_id='+q(oc.id)),1);
  await call('compras/recepciones/'+id,{observaciones:'Recepción local editada'},200,token,'PUT');
  const list=await call('compras/recepciones?orden_id='+oc.id);const rows=Array.isArray(list)?list:list.items??[];assert.ok(rows.some(r=>r.id===id),JSON.stringify(list).slice(0,200));
  await call('compras/devoluciones');
 });
 await check('Compras: documentos de otra empresa responden 404',async()=>{
  const oc=await order();await call('compras/ordenes/'+oc.id,undefined,404,otherToken);await call('compras/ordenes/'+oc.id,{observaciones:'ajeno'},404,otherToken,'PUT');
  await call('compras/ordenes/'+oc.id+'/cancelar',{motivo_cancelacion:'Intento ajeno local'},404,otherToken);assert.equal((await call('compras/ordenes/'+oc.id)).estado,'BORRADOR');
 });
 await check('Compras: resumen, listado y reporte heredados responden con datos de la empresa',async()=>{
  const statuses={};for(const endpoint of ['compras/stats','compras','compras/reporte-compras','compras/next-number','compras/productos']){const r=await raw(endpoint);statuses[endpoint]=r.status+(r.body?.success===false?' success:false':'');}
  assert.ok(Object.values(statuses).every(s=>s==='200'),JSON.stringify(statuses));
  const gone=await raw('compras',{});assert.equal(gone.status,410);
 });
 for(const [table,endpoint] of [['ordenes_compra','compras/stats'],['ordenes_compra','compras'],['ordenes_compra','compras/ordenes'],['cotizaciones_compra','compras/cotizaciones'],['recepciones','compras/recepciones'],['ordenes_compra','compras/reporte-compras']])await check('Compras: lectura de '+endpoint+' sin '+table+' responde 503',async()=>{
  const failed=await outage(table,()=>raw(endpoint));assert.equal(failed.status,503,'Indisponibilidad: '+failed.status+' '+JSON.stringify(failed.body).slice(0,200));await call(endpoint);
 });
 success=scenarios.every(s=>s.passed);
}catch(error){scenarios.push({scenario:'Compras: preparación o dependencia',passed:false,message:String(error.message).slice(0,600)});}
finally{fs.writeFileSync(path.join(output,'purchases-operations.json'),JSON.stringify({success,remoteWrites:false,scope:'Compras API/DB local diagnóstico; sin aceptación integral',scenarios,requests},null,2));}
console.log(JSON.stringify({success,passed:scenarios.filter(s=>s.passed).length,failed:scenarios.filter(s=>!s.passed).map(s=>s.scenario)}));
