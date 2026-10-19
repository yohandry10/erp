import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fetchWithLocalLoginRetry} from './peru-local-http.mjs';
// CxC: reprogramación de vencimiento, nota de crédito desde la cuenta y lecturas
// con API/PostgreSQL locales efímeros. No transmite a SUNAT ni fabrica aceptaciones.
assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB,'1');assert.equal(process.env.PGHOST,'127.0.0.1');assert.equal(process.env.PGDATABASE,'erp_e2e');
const api=process.env.LOCAL_API_URL;assert.equal(new URL(api).hostname,'127.0.0.1');const output=process.env.LOCAL_INTEGRATED_OUTPUT_DIR;
const first=JSON.parse(fs.readFileSync(path.join(output,'cxc-first-fixture.json'))),other=JSON.parse(fs.readFileSync(path.join(output,'cxc-other-fixture.json')));
const sql=query=>execFileSync(process.env.PSQL_BIN,['-XqAt','-h','127.0.0.1','-p',process.env.PGPORT,'-U','postgres','-d','erp_e2e','-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8',windowsHide:true}).trim();
assert.equal(sql("SELECT current_database()||'|'||environment||'|'||project_ref FROM app.deployment_environment WHERE singleton;"),'erp_e2e|DEV|localerpephemeralqax');
const q=id=>{assert.match(id,/^[0-9a-f-]{36}$/i);return "'"+id+"'::uuid";};
const PASSWORD='Cliente-Local-2026-Only!';
let token,otherToken;const scenarios=[],requests=[];let success=false;
async function raw(endpoint,body,{access=token,key=randomUUID(),method=body===undefined?'GET':'POST'}={}){
 const headers={'content-type':'application/json',connection:'close',...(access?{authorization:'Bearer '+access}:{}),...(key===null?{}:{'idempotency-key':key})};
 const response=await fetchWithLocalLoginRetry(api+'/api/'+endpoint,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
 const bytes=Buffer.from(await response.arrayBuffer());let value;try{value=JSON.parse(bytes.toString());}catch{value=bytes.toString();}
 requests.push({method,endpoint:endpoint.replace(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/gi,':id').split('?')[0],status:response.status});
 return {status:response.status,body:value,data:value&&typeof value==='object'&&Object.hasOwn(value,'data')?value.data:value};
}
async function call(endpoint,body,status=body===undefined?200:201,options={}){
 const result=await raw(endpoint,body,options);assert.equal(result.status,status,endpoint.split('?')[0]+': '+JSON.stringify(result.body).slice(0,400));return result.data;
}
async function check(scenario,action){try{const detail=await action();scenarios.push({scenario,passed:true,...(detail||{})});}catch(error){scenarios.push({scenario,passed:false,message:String(error.message).slice(0,900)});}}
const revoke=async(grant,revokeSql,action)=>{sql(revokeSql);try{return await action();}finally{sql(grant);}};
const dueDate=id=>sql(`SELECT fecha_vencimiento::text FROM cuentas_por_cobrar WHERE id=${q(id)};`);
const plusDays=days=>{const date=new Date(Date.now()+days*86400000);return date.toISOString().slice(0,10);};
const financial=()=>sql(`SELECT md5(jsonb_build_object('docs',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM documentos t WHERE tenant_id=${q(first.tenant)}),'cxc',(SELECT jsonb_agg(jsonb_build_object('id',id,'saldo',saldo,'estado',estado)) FROM cuentas_por_cobrar WHERE tenant_id=${q(first.tenant)}),'cpe',(SELECT count(*) FROM cpe WHERE tenant_id=${q(first.tenant)}))::text);`);
try{
 token=(await call('auth/login',{email:first.email,password:PASSWORD},201,{access:null})).access_token;
 otherToken=(await call('auth/login',{email:other.email,password:PASSWORD},201,{access:null})).access_token;
 const require=createRequire(path.resolve('apps/erp-api/package.json')),forge=require('node-forge'),keys=forge.pki.rsa.generateKeyPair(2048),cert=forge.pki.createCertificate();
 cert.publicKey=keys.publicKey;cert.serialNumber='07';cert.validity.notBefore=new Date(Date.now()-86400000);cert.validity.notAfter=new Date(Date.now()+365*86400000);
 const attrs=[{name:'commonName',value:'CERTIFICADO LOCAL '+first.ruc},{name:'countryName',value:'PE'},{name:'organizationName',value:'Ensayo CxC local'},{type:'2.5.4.5',value:first.ruc}];cert.setSubject(attrs);cert.setIssuer(attrs);cert.sign(keys.privateKey,forge.md.sha256.create());
 const p12=forge.pkcs12.toPkcs12Asn1(keys.privateKey,[cert],'Clave-CXC-local',{algorithm:'3des'}),certificateBase64=Buffer.from(forge.asn1.toDer(p12).getBytes(),'binary').toString('base64');
 await call('configuration/complete',{configuration:{ruc:first.ruc,pais:'PE',pais_id:1,razonSocial:'Empresa CxC local',direccion:'Origen CxC local 123',ubigeo:'150101',tipo_empresa:'MICRO',regimen_tributario:'GENERAL',serie_factura:'F001',serie_boleta:'B001',serie_guia_remision:'T001',certificateBase64,certificatePassword:'Clave-CXC-local',sunat_environment:'homologacion'}});
 const client=await call('ventas/clientes',{tipo:'EMPRESA',documento_tipo:'RUC',documento_numero:other.ruc,razon_social:'Cliente CxC local'});
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima'}).format(new Date());
 const invoice=async()=>{
  const cpe=await call('cpe/comprobantes',{tipo_documento:'01',serie:'F001',cliente_id:client.id,tipo_documento_receptor:'6',documento_receptor:other.ruc,razon_social_receptor:'Cliente CxC local',moneda:'PEN',fecha_emision:today,condicion_pago:'CREDITO',plazo_pago_dias:30,items:[{codigo:'CXC-SERV',descripcion:'Servicio CxC local',cantidad:1,precio_unitario:100,valor_venta:100,igv:18,total:118,unidadMedida:'ZZ'}]});
  const id=sql(`SELECT id FROM cuentas_por_cobrar WHERE tenant_id=${q(first.tenant)} AND documento_id=(SELECT documento_id FROM cpe WHERE id=${q(cpe.id)});`);
  assert.match(id,/^[0-9a-f-]{36}$/,'La factura a crédito no generó CxC');return id;
 };
 const cxc=await invoice();
 const D1=plusDays(40),D2=plusDays(55),D3=plusDays(70);
 const reprogram=(id,date,options={})=>raw('finanzas/cxc/'+id+'/reprogramar',{nueva_fecha_vencimiento:date,motivo:'Reprogramación de vencimiento solicitada'},options);
 await check('CxC: reprogramar con intención aplica la fecha una vez y el reintento la recupera',async()=>{
  const key=randomUUID();
  assert.equal((await reprogram(cxc,D1,{key})).status,201);assert.equal(dueDate(cxc),D1);
  const again=await reprogram(cxc,D1,{key});assert.equal(again.status,201);assert.equal(dueDate(cxc),D1);
  assert.equal(sql(`SELECT count(*) FROM financial_master_operations WHERE tenant_id=${q(first.tenant)} AND operation_type='CXC_REPROGRAM' AND idempotency_key=lower('${key}');`),'1');
  const conflict=await reprogram(cxc,D2,{key});
  assert.equal(conflict.status,409,'Misma intención con otra fecha respondió '+conflict.status);assert.equal(dueDate(cxc),D1);
 });
 await check('CxC: sin clave explícita, volver a una fecha ya usada se aplica',async()=>{
  // La pantalla no envía Idempotency-Key: una clave derivada del contenido
  // convertía la tercera reprogramación en una repetición de la primera.
  for(const date of [D2,D3,D2]){const result=await reprogram(cxc,date,{key:null});assert.equal(result.status,201,'Reprogramar a '+date+': '+result.status);}
  assert.equal(dueDate(cxc),D2,'Volver a '+D2+' respondió éxito sin aplicarse');
 });
 await check('CxC: reprogramar una cuenta inexistente o de otra empresa responde 404',async()=>{
  const statuses={missing:(await reprogram(randomUUID(),D1)).status,foreign:(await reprogram(cxc,D3,{access:otherToken})).status};
  assert.deepEqual(statuses,{missing:404,foreign:404},JSON.stringify(statuses));assert.equal(dueDate(cxc),D2);
 });
 await check('CxC: fecha ausente o inválida responde 400',async()=>{
  assert.equal((await raw('finanzas/cxc/'+cxc+'/reprogramar',{motivo:'Sin fecha'})).status,400);
  assert.equal((await raw('finanzas/cxc/'+cxc+'/reprogramar',{nueva_fecha_vencimiento:'mañana'})).status,400);
  assert.equal(dueDate(cxc),D2);
 });
 await check('CxC: una cuenta anulada no se reprograma (409) y queda igual',async()=>{
  const closed=await invoice();sql(`UPDATE cuentas_por_cobrar SET estado='ANULADA' WHERE id=${q(closed)};`);
  const before=dueDate(closed),result=await reprogram(closed,D3);
  assert.equal(result.status,409,'Cuenta anulada respondió '+result.status);assert.equal(dueDate(closed),before);
 });
 await check('CxC: sin el writer de reprogramación responde 503',async()=>{
  const status=await revoke('GRANT EXECUTE ON FUNCTION public.reprogramar_cxc_tx(uuid,uuid,uuid,date,text,text,text) TO service_role;','REVOKE EXECUTE ON FUNCTION public.reprogramar_cxc_tx(uuid,uuid,uuid,date,text,text,text) FROM service_role;',async()=>(await reprogram(cxc,D3)).status);
  assert.equal(status,503,'Writer caído respondió '+status);assert.equal(dueDate(cxc),D2);
 });
 const note=(id,extra={},options={})=>raw('finanzas/cxc/'+id+'/notas-credito',{monto:10,fecha_emision:today,codigo_motivo:'10',motivo:'Descuento comercial local',idempotency_key:'cxc-note-'+randomUUID(),...extra},options);
 await check('CxC: nota con la contabilidad de la factura pendiente responde 409 con un motivo legible y sin efectos',async()=>{
  const before=financial(),result=await note(cxc);
  assert.equal(result.status,409,'Contabilidad pendiente respondió '+result.status+' '+JSON.stringify(result.body).slice(0,200));
  assert.doesNotMatch(String(result.body?.message),/^[A-Z_]+$/,'La UI recibe un código interno: '+result.body?.message);
  assert.match(String(result.body?.message),/contab/i);
  assert.equal(financial(),before,'La nota rechazada dejó efectos');
 });
 await check('CxC: con la venta contabilizada, la nota sobre factura sin aceptación SUNAT se rechaza (409) sin efectos',async()=>{
  // El worker contable real procesa la venta: sólo entonces se llega a la regla fiscal.
  const require=createRequire(path.resolve('apps/erp-api/package.json'));
  fs.writeFileSync(path.join(output,'cxc-accounting.log'),execFileSync(process.execPath,[require.resolve('ts-node/dist/bin.js'),'--transpile-only','tests/e2e/helpers/local-api-harness.ts','--accounting-drain'],{cwd:path.resolve('apps/erp-api'),env:process.env,encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:5000000}));
  const before=financial(),result=await note(cxc);
  assert.equal(result.status,409,'Origen no aceptado respondió '+result.status+' '+JSON.stringify(result.body).slice(0,200));
  assert.match(String(result.body?.message),/acept/i,'El rechazo no explica la falta de aceptación: '+result.body?.message);
  assert.equal(financial(),before,'La nota rechazada dejó efectos');
 });
 await check('CxC: nota con motivo fuera de catálogo o monto inválido responde 400 sin efectos',async()=>{
  const before=financial();
  assert.equal((await note(cxc,{codigo_motivo:'99'})).status,400);assert.equal((await note(cxc,{monto:0})).status,400);
  assert.equal(financial(),before);
 });
 await check('CxC: nota sobre cuenta inexistente o de otra empresa responde 404',async()=>{
  const statuses={missing:(await note(randomUUID())).status,foreign:(await note(cxc,{},{access:otherToken})).status};
  assert.deepEqual(statuses,{missing:404,foreign:404},JSON.stringify(statuses));
 });
 await check('CxC: sin configuración legible o sin writer, la nota responde 503',async()=>{
  const statuses={};
  statuses.config=await revoke('GRANT SELECT ON public.empresa_config TO service_role;','REVOKE SELECT ON public.empresa_config FROM service_role;',async()=>(await note(cxc)).status);
  // Dos sobrecargas (8 y 10 argumentos): sin ambas no hay writer.
  const overloads=['uuid,uuid,uuid,text,text,text,numeric,text','uuid,uuid,uuid,text,text,text,numeric,text,jsonb,boolean'];
  statuses.writer=await revoke(overloads.map(args=>`GRANT EXECUTE ON FUNCTION public.crear_nota_referenciada_tx(${args}) TO service_role;`).join(''),overloads.map(args=>`REVOKE EXECUTE ON FUNCTION public.crear_nota_referenciada_tx(${args}) FROM service_role;`).join(''),async()=>(await note(cxc)).status);
  assert.deepEqual(statuses,{config:503,writer:503},JSON.stringify(statuses));
 });
 await check('CxC: detalle con lectura caída responde 503 y ajeno 404',async()=>{
  assert.equal((await raw('finanzas/cxc/'+cxc,undefined,{access:otherToken})).status,404,'Detalle ajeno');
  const status=await revoke('GRANT SELECT ON public.cuentas_por_cobrar TO service_role;','REVOKE SELECT ON public.cuentas_por_cobrar FROM service_role;',async()=>(await raw('finanzas/cxc/'+cxc)).status);
  assert.equal(status,503,'Detalle con lectura caída respondió '+status);
 });
 success=scenarios.every(scenario=>scenario.passed);
}catch(error){scenarios.push({scenario:'CxC: preparación o dependencia',passed:false,message:String(error.message).slice(0,900)});}
finally{fs.writeFileSync(path.join(output,'cxc-operations.json'),JSON.stringify({success,remoteWrites:false,scope:'CxC reprogramación, nota de crédito y lecturas API/DB local; sin aceptación SUNAT ni integral',scenarios,requests},null,2));}
console.log(JSON.stringify({success,passed:scenarios.filter(scenario=>scenario.passed).length,failed:scenarios.filter(scenario=>!scenario.passed).map(scenario=>scenario.scenario)}));
if(!success)process.exitCode=1;
