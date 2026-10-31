import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fetchWithLocalLoginRetry} from './peru-local-http.mjs';
// Inicio del dashboard (GET /dashboard/stats y /activities) con API/PostgreSQL
// locales efímeros. El API corre con TZ=UTC, como el runtime de Render.
assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB,'1');assert.equal(process.env.PGHOST,'127.0.0.1');assert.equal(process.env.PGDATABASE,'erp_e2e');
const api=process.env.LOCAL_API_URL;assert.equal(new URL(api).hostname,'127.0.0.1');const output=process.env.LOCAL_INTEGRATED_OUTPUT_DIR;
const first=JSON.parse(fs.readFileSync(path.join(output,'dash-first-fixture.json'))),other=JSON.parse(fs.readFileSync(path.join(output,'dash-other-fixture.json')));
const sql=query=>execFileSync(process.env.PSQL_BIN,['-XqAt','-h','127.0.0.1','-p',process.env.PGPORT,'-U','postgres','-d','erp_e2e','-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8',windowsHide:true}).trim();
assert.equal(sql("SELECT current_database()||'|'||environment||'|'||project_ref FROM app.deployment_environment WHERE singleton;"),'erp_e2e|DEV|localerpephemeralqax');
const q=id=>{assert.match(id,/^[0-9a-f-]{36}$/i);return "'"+id+"'::uuid";};
const PASSWORD='Cliente-Local-2026-Only!';
let token,otherToken;const scenarios=[],requests=[];let success=false;
async function raw(endpoint,body,access=token,method=body===undefined?'GET':'POST'){
 const response=await fetchWithLocalLoginRetry(api+'/api/'+endpoint,{method,headers:{'content-type':'application/json',connection:'close','idempotency-key':randomUUID(),...(access?{authorization:'Bearer '+access}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 const bytes=Buffer.from(await response.arrayBuffer());let value;try{value=JSON.parse(bytes.toString());}catch{value=bytes.toString();}
 requests.push({method,endpoint:endpoint.replace(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/gi,':id').split('?')[0],status:response.status});
 return {status:response.status,body:value,data:value&&typeof value==='object'&&Object.hasOwn(value,'data')?value.data:value};
}
async function call(endpoint,body,status=body===undefined?200:201,access=token,method){
 const result=await raw(endpoint,body,access,method);assert.equal(result.status,status,endpoint.split('?')[0]+': '+JSON.stringify(result.body).slice(0,400));return result.data;
}
async function check(scenario,action){try{const detail=await action();scenarios.push({scenario,passed:true,...(detail||{})});}catch(error){scenarios.push({scenario,passed:false,message:String(error.message).slice(0,900)});}}
const revoke=async(grant,revokeSql,action)=>{sql(revokeSql);try{return await action();}finally{sql(grant);}};
// El snapshot de métricas dura minutos: cada lectura parte de uno nuevo.
const stats=async(access=token)=>{await raw('dashboard/cache/invalidate',{},access);return raw('dashboard/stats',undefined,access);};
const ruc=base=>{const weights=[5,4,3,2,7,6,5,4,3,2];const digit=11-weights.reduce((sum,weight,index)=>sum+Number(base[index])*weight,0)%11;return base+String(digit===10?0:digit===11?1:digit);};
try{
 token=(await call('auth/login',{email:first.email,password:PASSWORD},201,null)).access_token;
 otherToken=(await call('auth/login',{email:other.email,password:PASSWORD},201,null)).access_token;
 const forge=createRequire(path.resolve('apps/erp-api/package.json'))('node-forge');
 const keys=forge.pki.rsa.generateKeyPair(2048),cert=forge.pki.createCertificate();cert.publicKey=keys.publicKey;cert.serialNumber='0E';cert.validity.notBefore=new Date(Date.now()-86400000);cert.validity.notAfter=new Date(Date.now()+365*86400000);
 const attrs=[{name:'commonName',value:'CERTIFICADO LOCAL '+first.ruc},{name:'countryName',value:'PE'},{name:'organizationName',value:'Ensayo dashboard'},{type:'2.5.4.5',value:first.ruc}];cert.setSubject(attrs);cert.setIssuer(attrs);cert.sign(keys.privateKey,forge.md.sha256.create());
 const p12=forge.pkcs12.toPkcs12Asn1(keys.privateKey,[cert],'Clave-Dash-local',{algorithm:'3des'});
 await call('configuration/complete',{configuration:{ruc:first.ruc,pais:'PE',pais_id:1,razonSocial:'Empresa dashboard local',direccion:'Origen local 123',ubigeo:'150101',tipo_empresa:'MICRO',regimen_tributario:'GENERAL',serie_factura:'F001',serie_boleta:'B001',serie_guia_remision:'T001',certificateBase64:Buffer.from(forge.asn1.toDer(p12).getBytes(),'binary').toString('base64'),certificatePassword:'Clave-Dash-local',sunat_environment:'homologacion'}});
 const receiver=ruc('2098765497');
 const client=await call('ventas/clientes',{tipo:'EMPRESA',documento_tipo:'RUC',documento_numero:receiver,razon_social:'Cliente dashboard SAC'});
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima'}).format(new Date());
 const invoice=base=>call('cpe/comprobantes',{tipo_documento:'01',serie:'F001',cliente_id:client.id,tipo_documento_receptor:'6',documento_receptor:receiver,razon_social_receptor:'Cliente dashboard SAC',moneda:'PEN',fecha_emision:today,condicion_pago:'CREDITO',plazo_pago_dias:30,items:[{codigo:'DASH',descripcion:'Servicio dashboard',cantidad:1,precio_unitario:base,valor_venta:base,igv:base*0.18,total:base*1.18,unidadMedida:'ZZ'}]});
 // Importe que el dashboard suma por comprobante (misma columna que usa el servicio).
 const amount=id=>Number(sql(`SELECT coalesce(total_venta,total) FROM cpe WHERE id=${q(id)};`));
 const warehouse=await call('inventario/almacenes',{idempotency_key:randomUUID(),codigo:'DASH',nombre:'Almacén dashboard',es_principal:true});
 await call('inventario/categorias',{idempotency_key:randomUUID(),codigo:'DASH',nombre:'Mercaderías dashboard'});
 const product=await call('inventario/productos',{idempotency_key:randomUUID(),codigo:'DASH-STOCK',nombre:'Producto dashboard',categoria:'Mercaderías dashboard',unidad_medida:'NIU',precio_compra:10,precio_venta:20,controla_stock:true,almacen_id:warehouse.id,stock_inicial:20,afectacion_igv:'10'});
 await check('Dashboard: cotizaciones pendientes y conversión cuentan los estados reales',async()=>{
  const line={producto_id:product.id,descripcion:product.nombre,cantidad:1,precio_unitario:20};
  const quote=()=>call('ventas/cotizaciones',{cliente_id:client.id,notas:'Cotización dashboard',detalle:[line]});
  await quote();const sent=await quote();await call('ventas/cotizaciones/'+sent.id+'/enviar',{});
  const approved=await quote();await call('ventas/cotizaciones/'+approved.id+'/enviar',{});await call('ventas/cotizaciones/'+approved.id+'/aprobar',{motivo:'Aprobación comercial local'});
  const result=await stats();assert.equal(result.status,200,'Stats respondió '+result.status);
  const values={pendientes:result.data.cotizacionesPendientes,conversion:result.data.tasaConversionCotizaciones,total:result.data.totalCotizaciones};
  assert.deepEqual(values,{pendientes:2,conversion:33.3,total:3},JSON.stringify(values));
 });
 await check('Dashboard: ventas de hoy y del mes usan el día de Lima y no suman anulados',async()=>{
  const now=await invoice(100);
  // Venta previa: el fixture traslada su hora a un límite del día limeño. Antes de las
  // 19:00 de Lima va a las 22:00 de ayer (fuera de hoy); después, a la 01:00 de hoy.
  const limaHour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'America/Lima',hour:'2-digit',hourCycle:'h23'}).format(new Date()));
  const earlier=await invoice(50);const earlierToday=limaHour>=19;
  const localStamp=earlierToday?today+' 01:00':new Date(Date.parse(today+'T12:00:00Z')-86400000).toISOString().slice(0,10)+' 22:00';
  sql(`UPDATE cpe SET created_at=(timestamp '${localStamp}' AT TIME ZONE 'America/Lima') WHERE id=${q(earlier.id)};`);
  const annulled=await invoice(1000);
  // Comunicación de baja aceptada por SUNAT: estado externo emulado en el fixture.
  sql(`UPDATE cpe SET estado='ANULADO' WHERE id=${q(annulled.id)};`);
  const result=await stats();assert.equal(result.status,200,'Stats respondió '+result.status);
  const sameMonth=earlierToday||today.slice(8)!=='01';
  const expected={hoy:amount(now.id)+(earlierToday?amount(earlier.id):0),mes:amount(now.id)+(sameMonth?amount(earlier.id):0)};
  const values={hoy:result.data.ventasHoy,mes:result.data.ventasMes};
  assert.deepEqual(values,expected,JSON.stringify(values)+' (hora Lima '+limaHour+', anulado '+amount(annulled.id)+')');
 });
 await check('Dashboard: sin lectura de comprobantes responde 503 y no informa ventas en cero',async()=>{
  const status=await revoke('GRANT SELECT ON public.cpe TO service_role;','REVOKE SELECT ON public.cpe FROM service_role;',async()=>{const result=await stats();return {status:result.status,ventasMes:result.data?.ventasMes};});
  assert.equal(status.status,503,'Stats sin lectura respondió '+JSON.stringify(status));
 });
 await check('Dashboard: actividades muestran lo emitido y sin lectura responden 503',async()=>{
  await raw('dashboard/cache/invalidate',{});
  const list=await raw('dashboard/activities');assert.equal(list.status,200);assert.ok((list.data||[]).some(item=>item.type==='CPE'),'Sin el comprobante emitido');
  const status=await revoke('GRANT SELECT ON public.cpe TO service_role;','REVOKE SELECT ON public.cpe FROM service_role;',async()=>{await raw('dashboard/cache/invalidate',{});const result=await raw('dashboard/activities');return {status:result.status,success:result.body?.success,items:(result.data||[]).length};});
  assert.equal(status.status,503,'Actividades sin lectura respondió '+JSON.stringify(status));
 });
 await check('Dashboard: otra empresa no ve las ventas ni las actividades de la primera',async()=>{
  const result=await stats(otherToken);assert.equal(result.status,200);assert.equal(result.data.ventasMes,0);assert.equal(result.data.totalCotizaciones,0);
  await raw('dashboard/cache/invalidate',{},otherToken);const list=await raw('dashboard/activities',undefined,otherToken);assert.equal(list.status,200);assert.equal((list.data||[]).length,0);
 });
 success=scenarios.every(scenario=>scenario.passed);
}catch(error){scenarios.push({scenario:'Dashboard: preparación o dependencia',passed:false,message:String(error.message).slice(0,900)});}
finally{fs.writeFileSync(path.join(output,'dashboard.json'),JSON.stringify({success,remoteWrites:false,scope:'Inicio del dashboard API/DB local con TZ=UTC; sin aceptación integral',scenarios,requests},null,2));}
console.log(JSON.stringify({success,passed:scenarios.filter(scenario=>scenario.passed).length,failed:scenarios.filter(scenario=>!scenario.passed).map(scenario=>scenario.scenario)}));
if(!success)process.exitCode=1;
