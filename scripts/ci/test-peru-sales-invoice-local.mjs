import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fetchWithLocalLoginRetry} from './peru-local-http.mjs';
// Facturar desde el pedido (POST /generar-factura, el que usa la pantalla) con
// API/PostgreSQL locales efímeros. Sin SUNAT: el CPE queda emitido localmente.
assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB,'1');assert.equal(process.env.PGHOST,'127.0.0.1');assert.equal(process.env.PGDATABASE,'erp_e2e');
const api=process.env.LOCAL_API_URL;assert.equal(new URL(api).hostname,'127.0.0.1');const output=process.env.LOCAL_INTEGRATED_OUTPUT_DIR;
const first=JSON.parse(fs.readFileSync(path.join(output,'fact-first-fixture.json'))),other=JSON.parse(fs.readFileSync(path.join(output,'fact-other-fixture.json')));
const sql=query=>execFileSync(process.env.PSQL_BIN,['-XqAt','-h','127.0.0.1','-p',process.env.PGPORT,'-U','postgres','-d','erp_e2e','-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8',windowsHide:true}).trim();
assert.equal(sql("SELECT current_database()||'|'||environment||'|'||project_ref FROM app.deployment_environment WHERE singleton;"),'erp_e2e|DEV|localerpephemeralqax');
const q=id=>{assert.match(id,/^[0-9a-f-]{36}$/i);return "'"+id+"'::uuid";};
const PASSWORD='Cliente-Local-2026-Only!';
let token,otherToken;const scenarios=[],requests=[];let success=false;
async function raw(endpoint,body,access=token,method=body===undefined?'GET':'POST',key=randomUUID()){
 const response=await fetchWithLocalLoginRetry(api+'/api/'+endpoint,{method,headers:{'content-type':'application/json',connection:'close','idempotency-key':key,...(access?{authorization:'Bearer '+access}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 const bytes=Buffer.from(await response.arrayBuffer());let value;try{value=JSON.parse(bytes.toString());}catch{value=bytes.toString();}
 requests.push({method,endpoint:endpoint.replace(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/gi,':id').split('?')[0],status:response.status});
 return {status:response.status,body:value,data:value&&typeof value==='object'&&Object.hasOwn(value,'data')?value.data:value};
}
async function call(endpoint,body,status=body===undefined?200:201,access=token,method){
 const result=await raw(endpoint,body,access,method);assert.equal(result.status,status,endpoint.split('?')[0]+': '+JSON.stringify(result.body).slice(0,400));return result.data;
}
async function check(scenario,action){try{const detail=await action();scenarios.push({scenario,passed:true,...(detail||{})});}catch(error){scenarios.push({scenario,passed:false,message:String(error.message).slice(0,900)});}}
const revoke=async(grant,revokeSql,action)=>{sql(revokeSql);try{return await action();}finally{sql(grant);}};
const signature=name=>{const s=sql(`SELECT p.oid::regprocedure::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='${name}';`).split('\n').filter(Boolean);assert.equal(s.length,1,'Firma única '+name);return s[0];};
const estado=id=>sql(`SELECT estado||'|'||coalesce(factura_id::text,'') FROM pedidos_venta WHERE id=${q(id)};`);
const cpes=tenant=>Number(sql(`SELECT count(*) FROM cpe WHERE tenant_id=${q(tenant)};`));
const salidas=id=>Number(sql(`SELECT count(*) FROM movimientos_inventario WHERE referencia_id=${q(id)} AND referencia_tipo='PEDIDO_FACTURA_446';`));
// RUC sintético con dígito verificador válido (mismo cálculo que los fixtures).
const ruc=base=>{const weights=[5,4,3,2,7,6,5,4,3,2];const digit=11-weights.reduce((sum,weight,index)=>sum+Number(base[index])*weight,0)%11;return base+String(digit===10?0:digit===11?1:digit);};
async function catalog(access,suffix){
 const warehouse=await call('inventario/almacenes',{idempotency_key:randomUUID(),codigo:'FACT-'+suffix,nombre:'Almacén facturación '+suffix,es_principal:true},201,access);
 await call('inventario/categorias',{idempotency_key:randomUUID(),codigo:'FACT-'+suffix,nombre:'Mercaderías facturación '+suffix},201,access);
 return call('inventario/productos',{idempotency_key:randomUUID(),codigo:'FACT-STOCK-'+suffix,nombre:'Producto facturación '+suffix,categoria:'Mercaderías facturación '+suffix,unidad_medida:'NIU',precio_compra:10,precio_venta:20,controla_stock:true,almacen_id:warehouse.id,stock_inicial:20,afectacion_igv:'10'},201,access);
}
try{
 token=(await call('auth/login',{email:first.email,password:PASSWORD},201,null)).access_token;
 otherToken=(await call('auth/login',{email:other.email,password:PASSWORD},201,null)).access_token;
 const forge=createRequire(path.resolve('apps/erp-api/package.json'))('node-forge');
 const keys=forge.pki.rsa.generateKeyPair(2048),cert=forge.pki.createCertificate();cert.publicKey=keys.publicKey;cert.serialNumber='0C';cert.validity.notBefore=new Date(Date.now()-86400000);cert.validity.notAfter=new Date(Date.now()+365*86400000);
 const attrs=[{name:'commonName',value:'CERTIFICADO LOCAL '+first.ruc},{name:'countryName',value:'PE'},{name:'organizationName',value:'Ensayo facturación'},{type:'2.5.4.5',value:first.ruc}];cert.setSubject(attrs);cert.setIssuer(attrs);cert.sign(keys.privateKey,forge.md.sha256.create());
 const p12=forge.pkcs12.toPkcs12Asn1(keys.privateKey,[cert],'Clave-Fact-local',{algorithm:'3des'});
 await call('configuration/complete',{configuration:{ruc:first.ruc,pais:'PE',pais_id:1,razonSocial:'Empresa facturación local',direccion:'Origen local 123',ubigeo:'150101',tipo_empresa:'MICRO',regimen_tributario:'GENERAL',serie_factura:'F001',serie_boleta:'B001',serie_guia_remision:'T001',certificateBase64:Buffer.from(forge.asn1.toDer(p12).getBytes(),'binary').toString('base64'),certificatePassword:'Clave-Fact-local',sunat_environment:'homologacion'}});
 const product=await catalog(token,'A');
 const company=await call('ventas/clientes',{tipo:'EMPRESA',documento_tipo:'RUC',documento_numero:ruc('2098765483'),razon_social:'Cliente facturación SAC'});
 const person=await call('ventas/clientes',{tipo:'PERSONA',documento_tipo:'DNI',documento_numero:'45678912',razon_social:'Cliente boleta local'});
 const line=(item,cantidad=2)=>({producto_id:item.id,descripcion:item.nombre,cantidad,precio_unitario:20});
 const order=async(client=company,{confirm=true,access=token,item=product}={})=>{
  const created=await call('ventas/pedidos',{cliente_id:client.id,notas:'Pedido para facturar',detalle:[line(item)]},201,access);
  if(confirm){const confirmed=await call('ventas/pedidos/'+created.id+'/confirmar',{},201,access);assert.notEqual(confirmed.requiere_aprobacion,true,'El pedido quedó pendiente de aprobación');created.ready=estado(created.id);assert.ok(['LISTO_FACTURAR|','CONFIRMADO|'].includes(created.ready),'Estado tras confirmar: '+created.ready);}
  return created;};
 const invoice=(id,access=token)=>raw('ventas/pedidos/'+id+'/generar-factura',{},access);
 let invoiced;
 await check('Facturar pedido: confirmado se factura con CPE, salida de stock y estado FACTURADO',async()=>{
  invoiced=await order();const before=cpes(first.tenant);
  const result=await invoice(invoiced.id);assert.ok([200,201].includes(result.status),'Factura respondió '+result.status+' '+JSON.stringify(result.body).slice(0,300));
  const facturaId=result.data?.factura_id;assert.match(String(facturaId),/^[0-9a-f-]{36}$/,'Sin factura_id');
  assert.equal(estado(invoiced.id),'FACTURADO|'+facturaId);assert.equal(cpes(first.tenant),before+1);
  assert.equal(sql(`SELECT tipo_documento FROM cpe WHERE id=${q(facturaId)};`),'01');assert.equal(salidas(invoiced.id),1);
  invoiced.factura_id=facturaId;
 });
 await check('Facturar pedido: repetir tras perder la respuesta devuelve la misma factura sin otro CPE ni otra salida',async()=>{
  assert.ok(invoiced?.factura_id,'Sin factura previa');const before=cpes(first.tenant);
  const result=await invoice(invoiced.id);assert.ok([200,201].includes(result.status),'Reintento respondió '+result.status+' '+JSON.stringify(result.body).slice(0,300));
  assert.equal(result.data?.factura_id,invoiced.factura_id);assert.equal(cpes(first.tenant),before);assert.equal(salidas(invoiced.id),1);
 });
 await check('Facturar pedido: sin confirmar o cancelado responde 409 sin comprobante',async()=>{
  const draft=await order(company,{confirm:false});const cancelled=await order();
  await call('ventas/pedidos/'+cancelled.id+'/cancelar',{motivo:'Cancelado antes de facturar'});
  const before=cpes(first.tenant);const statuses={draft:(await invoice(draft.id)).status,cancelled:(await invoice(cancelled.id)).status};
  assert.deepEqual(statuses,{draft:409,cancelled:409},JSON.stringify(statuses));assert.equal(cpes(first.tenant),before);
 });
 await check('Facturar pedido: ajeno o inexistente responde 404',async()=>{
  const pending=await order();
  const statuses={foreign:(await invoice(pending.id,otherToken)).status,missing:(await invoice(randomUUID())).status};
  assert.deepEqual(statuses,{foreign:404,missing:404},JSON.stringify(statuses));assert.equal(estado(pending.id),pending.ready);
 });
 await check('Facturar pedido: sin certificado configurado responde 409 legible sin efectos',async()=>{
  const otherProduct=await catalog(otherToken,'B');
  const otherClient=await call('ventas/clientes',{tipo:'EMPRESA',documento_tipo:'RUC',documento_numero:ruc('2098765484'),razon_social:'Cliente sin certificado SAC'},201,otherToken);
  const pending=await order(otherClient,{access:otherToken,item:otherProduct});const before=cpes(other.tenant);
  const result=await invoice(pending.id,otherToken);
  assert.equal(result.status,409,'Sin certificado respondió '+result.status+' '+JSON.stringify(result.body).slice(0,300));
  assert.match(String(result.body?.message),/Certificado/i);assert.equal(cpes(other.tenant),before);assert.equal(estado(pending.id),pending.ready);
 });
 await check('Facturar pedido: sin lectura de configuración o sin writer responde 503 sin efectos',async()=>{
  const pending=await order();const before=cpes(first.tenant);const statuses={};
  statuses.config=await revoke('GRANT SELECT ON public.empresa_config TO service_role;','REVOKE SELECT ON public.empresa_config FROM service_role;',async()=>(await invoice(pending.id)).status);
  const writer=signature('facturar_pedido_venta_tx');
  statuses.writer=await revoke(`GRANT EXECUTE ON FUNCTION ${writer} TO service_role;`,`REVOKE EXECUTE ON FUNCTION ${writer} FROM service_role;`,async()=>(await invoice(pending.id)).status);
  assert.deepEqual(statuses,{config:503,writer:503},JSON.stringify(statuses));
  assert.equal(estado(pending.id),pending.ready);assert.equal(cpes(first.tenant),before);assert.equal(salidas(pending.id),0);
  const recovered=await invoice(pending.id);assert.ok([200,201].includes(recovered.status),'No se recuperó: '+recovered.status);
 });
 await check('Facturar pedido: cliente con DNI recibe boleta',async()=>{
  const pending=await order(person);const result=await invoice(pending.id);
  assert.ok([200,201].includes(result.status),'Boleta respondió '+result.status+' '+JSON.stringify(result.body).slice(0,300));
  assert.equal(sql(`SELECT tipo_documento FROM cpe WHERE id=${q(result.data.factura_id)};`),'03');
 });
 success=scenarios.every(scenario=>scenario.passed);
}catch(error){scenarios.push({scenario:'Facturar pedido: preparación o dependencia',passed:false,message:String(error.message).slice(0,900)});}
finally{fs.writeFileSync(path.join(output,'sales-invoice.json'),JSON.stringify({success,remoteWrites:false,scope:'Facturación desde pedido API/DB local; sin SUNAT ni aceptación integral',scenarios,requests},null,2));}
console.log(JSON.stringify({success,passed:scenarios.filter(scenario=>scenario.passed).length,failed:scenarios.filter(scenario=>!scenario.passed).map(scenario=>scenario.scenario)}));
if(!success)process.exitCode=1;
