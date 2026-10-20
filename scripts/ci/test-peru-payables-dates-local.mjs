import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {fetchWithLocalLoginRetry} from './peru-local-http.mjs';
// Fechas de CxP y tesorería con el API en otra zona que Lima (TZ=UTC en Render).
// Sólo se ve el desfase cuando el día del servidor y el de Lima difieren: con UTC
// entre las 19:00 y la medianoche de Lima; con otra zona, en otra franja.
assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB,'1');assert.equal(process.env.PGHOST,'127.0.0.1');assert.equal(process.env.PGDATABASE,'erp_e2e');
const api=process.env.LOCAL_API_URL;assert.equal(new URL(api).hostname,'127.0.0.1');const output=process.env.LOCAL_INTEGRATED_OUTPUT_DIR;
const first=JSON.parse(fs.readFileSync(path.join(output,'tz-first-fixture.json')));
const sql=query=>execFileSync(process.env.PSQL_BIN,['-XqAt','-h','127.0.0.1','-p',process.env.PGPORT,'-U','postgres','-d','erp_e2e','-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8',windowsHide:true}).trim();
assert.equal(sql("SELECT current_database()||'|'||environment||'|'||project_ref FROM app.deployment_environment WHERE singleton;"),'erp_e2e|DEV|localerpephemeralqax');
let token;const scenarios=[],requests=[];let success=false;
async function raw(endpoint,body,access=token,method=body===undefined?'GET':'POST'){
 const response=await fetchWithLocalLoginRetry(api+'/api/'+endpoint,{method,headers:{'content-type':'application/json',connection:'close','idempotency-key':randomUUID(),...(access?{authorization:'Bearer '+access}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 const bytes=Buffer.from(await response.arrayBuffer());let value;try{value=JSON.parse(bytes.toString());}catch{value=bytes.toString();}
 requests.push({method,endpoint:endpoint.replace(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/gi,':id').split('?')[0],status:response.status});
 return {status:response.status,body:value,data:value&&typeof value==='object'&&Object.hasOwn(value,'data')?value.data:value};
}
async function call(endpoint,body,status=body===undefined?200:201,access=token){
 const result=await raw(endpoint,body,access);assert.equal(result.status,status,endpoint.split('?')[0]+': '+JSON.stringify(result.body).slice(0,400));return result.data;
}
async function check(scenario,action){try{const detail=await action();scenarios.push({scenario,passed:true,...(detail||{})});}catch(error){scenarios.push({scenario,passed:false,message:String(error.message).slice(0,900)});}}
const shift=(date,days)=>new Date(Date.parse(date+'T12:00:00Z')+days*86400000).toISOString().slice(0,10);
try{
 // Sólo se reproduce cuando Lima y UTC están en días distintos; fuera de esa
 // franja la sonda lo declara en vez de aprobar algo que no comprobó.
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima'}).format(new Date());
 const serverZone=Intl.DateTimeFormat().resolvedOptions().timeZone,serverToday=new Intl.DateTimeFormat('en-CA').format(new Date());
 assert.notEqual(today,serverToday,'Fuera de franja: Lima '+today+' y '+serverZone+' '+serverToday+' coinciden');
 token=(await call('auth/login',{email:first.email,password:'Cliente-Local-2026-Only!'},201,null)).access_token;
 const weights=[5,4,3,2,7,6,5,4,3,2],base='2098765499',d=11-weights.reduce((sum,weight,index)=>sum+Number(base[index])*weight,0)%11;
 const provider=await call('compras/proveedores',{ruc:base+String(d===10?0:d===11?1:d),razon_social:'Proveedor fechas local',direccion:'Av. Local 456',email:'prov-fechas-'+randomUUID().slice(0,6)+'@example.test'});
 const payable=(numero,vence)=>call('finanzas/cxp',{proveedor_id:provider.id,numero_documento:numero,serie:'F001',tipo_documento:'FACTURA',fecha_emision:shift(today,-20),fecha_vencimiento:vence,condiciones_pago:'CREDITO_30',subtotal:100,igv:18,total:118,moneda:'PEN',tipo_cambio:1,destino_credito_fiscal:'GRAVADAS'});
 const dueToday=await payable('00000101',today),dueYesterday=await payable('00000102',shift(today,-1));
 await check('Fechas CxP: la deuda que vence hoy en Lima aparece en próximos vencimientos con 0 días',async()=>{
  const result=await call('finanzas/cxp/vencimientos?dias=30');
  const item=(result.vencimientos||[]).find(row=>row.id===dueToday.id);
  assert.ok(item,'La deuda que vence hoy no aparece (consulta desde '+result.fecha_consulta+')');assert.equal(item.dias_hasta_vencimiento,0);
  assert.equal(result.fecha_consulta,today);
 });
 await check('Fechas tesorería: la programación no marca vencida la deuda de hoy y la de ayer lleva 1 día',async()=>{
  const result=await raw('finanzas/tesoreria/programacion?limit=50');assert.equal(result.status,200,'Programación respondió '+result.status);
  const rows=Array.isArray(result.data)?result.data:(result.data?.data||result.data?.items||[]);
  const hoy=rows.find(row=>row.id===dueToday.id),ayer=rows.find(row=>row.id===dueYesterday.id);
  assert.ok(hoy&&ayer,'Faltan deudas en la programación');
  assert.deepEqual({hoy:[hoy.urgencia,hoy.dias_hasta_vencimiento],ayer:[ayer.urgencia,ayer.dias_hasta_vencimiento]},{hoy:['HOY',0],ayer:['VENCIDA',-1]});
 });
 await check('Fechas CxP: la antigüedad cuenta 1 día para la deuda vencida ayer y 0 para la de hoy',async()=>{
  const result=await call('finanzas/cxp/aging');
  const detail=result.detalle||[];const hoy=detail.find(row=>row.id===dueToday.id||row.cxp_id===dueToday.id),ayer=detail.find(row=>row.id===dueYesterday.id||row.cxp_id===dueYesterday.id);
  assert.ok(hoy&&ayer,'Faltan deudas en la antigüedad');
  assert.deepEqual({hoy:hoy.dias_vencidos,ayer:ayer.dias_vencidos},{hoy:0,ayer:1});
 });
 await check('Fechas tesorería: el flujo de caja proyectado empieza hoy en Lima',async()=>{
  const result=await call('finanzas/tesoreria/flujo-caja');assert.equal(result.periodo?.fecha_desde,today,'Proyección desde '+result.periodo?.fecha_desde);
 });
 success=scenarios.every(scenario=>scenario.passed);
}catch(error){scenarios.push({scenario:'Fechas CxP: preparación o dependencia',passed:false,message:String(error.message).slice(0,900)});}
finally{fs.writeFileSync(path.join(output,'payables-dates.json'),JSON.stringify({success,remoteWrites:false,scope:'Fechas de CxP y tesorería con API en TZ=UTC; sin aceptación integral',scenarios,requests},null,2));}
console.log(JSON.stringify({success,passed:scenarios.filter(scenario=>scenario.passed).length,failed:scenarios.filter(scenario=>!scenario.passed).map(scenario=>scenario.scenario)}));
if(!success)process.exitCode=1;
