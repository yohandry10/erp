import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fetchWithLocalLoginRetry} from './peru-local-http.mjs';
// Aprobación de pedidos de venta (bandeja, decisión, historial) con API/PostgreSQL
// locales efímeros. El umbral de aprobación se fija en el fixture local.
assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB,'1');assert.equal(process.env.PGHOST,'127.0.0.1');assert.equal(process.env.PGDATABASE,'erp_e2e');
const api=process.env.LOCAL_API_URL;assert.equal(new URL(api).hostname,'127.0.0.1');const output=process.env.LOCAL_INTEGRATED_OUTPUT_DIR;
const first=JSON.parse(fs.readFileSync(path.join(output,'aprob-first-fixture.json'))),other=JSON.parse(fs.readFileSync(path.join(output,'aprob-other-fixture.json')));
const sql=query=>execFileSync(process.env.PSQL_BIN,['-XqAt','-h','127.0.0.1','-p',process.env.PGPORT,'-U','postgres','-d','erp_e2e','-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8',windowsHide:true}).trim();
assert.equal(sql("SELECT current_database()||'|'||environment||'|'||project_ref FROM app.deployment_environment WHERE singleton;"),'erp_e2e|DEV|localerpephemeralqax');
const q=id=>{assert.match(id,/^[0-9a-f-]{36}$/i);return "'"+id+"'::uuid";};
const PASSWORD='Cliente-Local-2026-Only!';
let token,otherToken,approverToken;const scenarios=[],requests=[];let success=false;
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
const estado=id=>sql(`SELECT estado FROM pedidos_venta WHERE id=${q(id)};`);
const decisions=id=>sql(`SELECT count(*) FROM pedido_aprobaciones WHERE pedido_id=${q(id)};`);
try{
 token=(await call('auth/login',{email:first.email,password:PASSWORD},201,null)).access_token;
 otherToken=(await call('auth/login',{email:other.email,password:PASSWORD},201,null)).access_token;
 const forge=createRequire(path.resolve('apps/erp-api/package.json'))('node-forge');
 const keys=forge.pki.rsa.generateKeyPair(2048),cert=forge.pki.createCertificate();cert.publicKey=keys.publicKey;cert.serialNumber='0A';cert.validity.notBefore=new Date(Date.now()-86400000);cert.validity.notAfter=new Date(Date.now()+365*86400000);
 const attrs=[{name:'commonName',value:'CERTIFICADO LOCAL '+first.ruc},{name:'countryName',value:'PE'},{name:'organizationName',value:'Ensayo aprobaciones'},{type:'2.5.4.5',value:first.ruc}];cert.setSubject(attrs);cert.setIssuer(attrs);cert.sign(keys.privateKey,forge.md.sha256.create());
 const p12=forge.pkcs12.toPkcs12Asn1(keys.privateKey,[cert],'Clave-Aprob-local',{algorithm:'3des'});
 await call('configuration/complete',{configuration:{ruc:first.ruc,pais:'PE',pais_id:1,razonSocial:'Empresa aprobaciones local',direccion:'Origen local 123',ubigeo:'150101',tipo_empresa:'MICRO',regimen_tributario:'GENERAL',serie_factura:'F001',serie_boleta:'B001',serie_guia_remision:'T001',certificateBase64:Buffer.from(forge.asn1.toDer(p12).getBytes(),'binary').toString('base64'),certificatePassword:'Clave-Aprob-local',sunat_environment:'homologacion'}});
 const warehouse=await call('inventario/almacenes',{idempotency_key:randomUUID(),codigo:'APROB-LOCAL',nombre:'Almacén aprobaciones',es_principal:true});
 await call('inventario/categorias',{idempotency_key:randomUUID(),codigo:'APROB-LOCAL',nombre:'Mercaderías aprobaciones'});
 const product=await call('inventario/productos',{idempotency_key:randomUUID(),codigo:'APROB-STOCK',nombre:'Producto aprobaciones',categoria:'Mercaderías aprobaciones',unidad_medida:'NIU',precio_compra:10,precio_venta:20,controla_stock:true,almacen_id:warehouse.id,stock_inicial:20,afectacion_igv:'10'});
 const client=await call('ventas/clientes',{tipo:'EMPRESA',documento_tipo:'RUC',documento_numero:other.ruc,razon_social:'Cliente aprobaciones SAC'});
 const roles=await call('roles'),adminRole=roles.find(role=>role.nombre==='ADMIN');assert.ok(adminRole,'Rol ADMIN ausente');
 const approverEmail=`aprobador.${randomUUID().slice(0,8)}@example.test`;
 await call('users',{nombre:'Aprobadora',apellido:'Comercial',email:approverEmail,password:'Aprobadora-Local-2026!',roles:[adminRole.id],idempotency_key:randomUUID()});
 approverToken=(await call('auth/login',{email:approverEmail,password:'Aprobadora-Local-2026!'},201,null)).access_token;
 // PROD concede SELECT a service_role por los privilegios por defecto de Supabase
 // (ninguna migración lo revoca en pedido_aprobaciones); la reconstrucción local no
 // los emula. Sólo se replica ese default si falta.
 sql(`DO $$ BEGIN IF NOT has_table_privilege('service_role','public.pedido_aprobaciones','SELECT') THEN GRANT SELECT ON public.pedido_aprobaciones TO service_role; END IF; END $$;`);
 // Umbral de aprobación por monto: estado de configuración del fixture local.
 sql(`UPDATE empresa_config SET monto_maximo_sin_aprobacion=30 WHERE tenant_id=${q(first.tenant)};`);
 const line=(cantidad,precio)=>({producto_id:product.id,descripcion:product.nombre,cantidad,precio_unitario:precio});
 const pendingOrder=async()=>{const order=await call('ventas/pedidos',{cliente_id:client.id,notas:'Pedido sobre umbral',detalle:[line(2,20)]});
  const confirm=await call('ventas/pedidos/'+order.id+'/confirmar',{});assert.equal(confirm.requiere_aprobacion,true,JSON.stringify(confirm).slice(0,300));
  assert.equal(estado(order.id),'PENDIENTE_APROBACION');return order;};
 const decide=(id,decision,access=approverToken,extra={})=>raw('ventas/pedidos/'+id+'/aprobaciones/decision',{decision,...extra},access);
 let approved;
 await check('Aprobaciones: un pedido sobre el umbral queda pendiente y aparece en la bandeja con su motivo',async()=>{
  approved=await pendingOrder();
  const inbox=await call('ventas/pedidos/aprobaciones/pendientes',undefined,200,approverToken);
  const row=(inbox.data??inbox).find(item=>item.id===approved.id);assert.ok(row,'El pedido no aparece en la bandeja');
  assert.match(JSON.stringify(row.motivos),/supera el l[ií]mite/i,'Sin motivo legible');
 });
 await check('Aprobaciones: el creador no puede aprobar su propio pedido (403) y el pedido no cambia',async()=>{
  const result=await decide(approved.id,'APROBADO',token);
  assert.equal(result.status,403,'Autoaprobación respondió '+result.status);
  assert.equal(estado(approved.id),'PENDIENTE_APROBACION');assert.equal(decisions(approved.id),'0');
 });
 await check('Aprobaciones: otro aprobador aprueba y el historial muestra la decisión con su nombre',async()=>{
  const result=await decide(approved.id,'APROBADO');assert.ok([200,201].includes(result.status),'Aprobación respondió '+result.status+' '+JSON.stringify(result.body).slice(0,200));
  assert.equal(estado(approved.id),'PENDIENTE');
  const history=await call('ventas/pedidos/'+approved.id+'/aprobaciones',undefined,200,approverToken);
  const rows=history.data??history;assert.equal(rows.length,1);assert.equal(rows[0].decision,'APROBADO');
  assert.match(JSON.stringify(rows[0].aprobador??{}),/Aprobadora/,'El historial no identifica al aprobador: '+JSON.stringify(rows[0]).slice(0,300));
  const confirmed=await call('ventas/pedidos/'+approved.id+'/confirmar',{});assert.equal(confirmed.confirmado,true,'El pedido aprobado no se confirma');
 });
 await check('Aprobaciones: repetir la misma decisión (respuesta perdida) no falla ni duplica',async()=>{
  const again=await decide(approved.id,'APROBADO');
  assert.ok([200,201].includes(again.status),'Reintento de la misma decisión respondió '+again.status+' '+JSON.stringify(again.body).slice(0,200));
  assert.equal(decisions(approved.id),'1','El reintento registró otra decisión');
 });
 await check('Aprobaciones: pedido ajeno o inexistente responde 404 en historial y decisión',async()=>{
  const statuses={history:(await raw('ventas/pedidos/'+approved.id+'/aprobaciones',undefined,otherToken)).status,
   decision:(await decide(approved.id,'RECHAZADO',otherToken)).status,missing:(await decide(randomUUID(),'APROBADO')).status};
  assert.deepEqual(statuses,{history:404,decision:404,missing:404},JSON.stringify(statuses));
 });
 let rejected;
 await check('Aprobaciones: rechazar cancela el pedido y una decisión distinta posterior responde 409',async()=>{
  rejected=await pendingOrder();
  const result=await decide(rejected.id,'RECHAZADO',approverToken,{motivos:['Cliente sin sustento comercial']});assert.ok([200,201].includes(result.status),'Rechazo respondió '+result.status);
  assert.equal(estado(rejected.id),'CANCELADO');
  const late=await decide(rejected.id,'APROBADO');assert.equal(late.status,409,'Decisión sobre pedido ya resuelto respondió '+late.status);
  assert.equal(estado(rejected.id),'CANCELADO');assert.equal(decisions(rejected.id),'1');
 });
 await check('Aprobaciones: sin lectura del historial o sin writer de decisión responde 503',async()=>{
  const pending=await pendingOrder();const statuses={};
  statuses.history=await revoke('GRANT SELECT ON public.pedido_aprobaciones TO service_role;','REVOKE SELECT ON public.pedido_aprobaciones FROM service_role;',async()=>(await raw('ventas/pedidos/'+pending.id+'/aprobaciones',undefined,approverToken)).status);
  statuses.writer=await revoke('GRANT EXECUTE ON FUNCTION public.decidir_aprobacion_pedido_tx(uuid,uuid,text,text,uuid,text) TO service_role;','REVOKE EXECUTE ON FUNCTION public.decidir_aprobacion_pedido_tx(uuid,uuid,text,text,uuid,text) FROM service_role;',async()=>(await decide(pending.id,'APROBADO')).status);
  assert.deepEqual(statuses,{history:503,writer:503},JSON.stringify(statuses));assert.equal(estado(pending.id),'PENDIENTE_APROBACION');
 });
 await check('Aprobaciones: la bandeja muestra al aprobador las cuentas vencidas del cliente',async()=>{
  const pending=await pendingOrder();
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima'}).format(new Date());
  const cpe=await call('cpe/comprobantes',{tipo_documento:'01',serie:'F001',cliente_id:client.id,tipo_documento_receptor:'6',documento_receptor:other.ruc,razon_social_receptor:'Cliente aprobaciones SAC',moneda:'PEN',fecha_emision:today,condicion_pago:'CREDITO',plazo_pago_dias:30,items:[{codigo:'APROB-SERV',descripcion:'Servicio previo',cantidad:1,precio_unitario:100,valor_venta:100,igv:18,total:118,unidadMedida:'ZZ'}]});
  const cxc=sql(`SELECT id FROM cuentas_por_cobrar WHERE documento_id=(SELECT documento_id FROM cpe WHERE id=${q(cpe.id)});`);
  // Una cuenta vencida real exige días; el fixture traslada emisión y vencimiento al pasado.
  sql(`UPDATE cuentas_por_cobrar SET fecha_emision=current_date-40, fecha_vencimiento=current_date-10 WHERE id=${q(cxc)};`);
  const inbox=await call('ventas/pedidos/aprobaciones/pendientes',undefined,200,approverToken);
  const row=(inbox.data??inbox).find(item=>item.id===pending.id);assert.ok(row,'El pedido no aparece en la bandeja');
  assert.equal(row.resumen_credito?.tieneVencidos,true,'La bandeja dice "sin morosidad" con una cuenta vencida: '+JSON.stringify(row.resumen_credito));
  assert.ok(Number(row.resumen_credito?.pendiente)>=118,'Pendiente sin la cuenta vencida');
 });
 success=scenarios.every(scenario=>scenario.passed);
}catch(error){scenarios.push({scenario:'Aprobaciones: preparación o dependencia',passed:false,message:String(error.message).slice(0,900)});}
finally{fs.writeFileSync(path.join(output,'sales-approvals.json'),JSON.stringify({success,remoteWrites:false,scope:'Aprobación de pedidos de venta API/DB local; sin aceptación integral',scenarios,requests},null,2));}
console.log(JSON.stringify({success,passed:scenarios.filter(scenario=>scenario.passed).length,failed:scenarios.filter(scenario=>!scenario.passed).map(scenario=>scenario.scenario)}));
if(!success)process.exitCode=1;
