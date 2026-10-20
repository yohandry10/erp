import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {fetchWithLocalLoginRetry} from './peru-local-http.mjs';
// Ediciones sin Idempotency-Key (así las envían las pantallas) con API/PostgreSQL
// locales: volver a un valor ya usado (A→B→A) debe aplicarse, no reproducir la
// respuesta de la primera vez.
assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB,'1');assert.equal(process.env.PGHOST,'127.0.0.1');assert.equal(process.env.PGDATABASE,'erp_e2e');
const api=process.env.LOCAL_API_URL;assert.equal(new URL(api).hostname,'127.0.0.1');const output=process.env.LOCAL_INTEGRATED_OUTPUT_DIR;
const first=JSON.parse(fs.readFileSync(path.join(output,'dk-first-fixture.json')));
const sql=query=>execFileSync(process.env.PSQL_BIN,['-XqAt','-h','127.0.0.1','-p',process.env.PGPORT,'-U','postgres','-d','erp_e2e','-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8',windowsHide:true}).trim();
assert.equal(sql("SELECT current_database()||'|'||environment||'|'||project_ref FROM app.deployment_environment WHERE singleton;"),'erp_e2e|DEV|localerpephemeralqax');
const q=id=>{assert.match(id,/^[0-9a-f-]{36}$/i);return "'"+id+"'::uuid";};
let token;const scenarios=[],requests=[];let success=false;
async function raw(endpoint,body,method=body===undefined?'GET':'POST'){
 const response=await fetchWithLocalLoginRetry(api+'/api/'+endpoint,{method,headers:{'content-type':'application/json',connection:'close',...(token?{authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 const bytes=Buffer.from(await response.arrayBuffer());let value;try{value=JSON.parse(bytes.toString());}catch{value=bytes.toString();}
 requests.push({method,endpoint:endpoint.replace(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/gi,':id').split('?')[0],status:response.status});
 return {status:response.status,body:value,data:value&&typeof value==='object'&&Object.hasOwn(value,'data')?value.data:value};
}
async function check(scenario,action){try{const detail=await action();scenarios.push({scenario,passed:true,...(detail||{})});}catch(error){scenarios.push({scenario,passed:false,message:String(error.message).slice(0,900)});}}
const ok=(result,label)=>{assert.ok(result.status<300,label+' respondió '+result.status+' '+JSON.stringify(result.body).slice(0,240));return result.data;};
try{
 const login=await raw('auth/login',{email:first.email,password:'Cliente-Local-2026-Only!'});token=login.data?.access_token??login.body?.access_token;assert.ok(token,'Sin sesión');
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima'}).format(new Date());
 await check('Claves: tipo de cambio 3.75, 3.80 y otra vez 3.75 el mismo día queda en 3.75',async()=>{
  const registrar=async valor=>{ok(await raw('contabilidad/tipos-cambio',{moneda_origen:'USD',moneda_destino:'PEN',fecha:today,compra:valor,venta:valor,fuente:'MANUAL'}),'Tipo '+valor);
   return Number(sql(`SELECT venta FROM tipos_cambio WHERE tenant_id=${q(first.tenant)} AND fecha='${today}' AND moneda_origen='USD' AND moneda_destino='PEN' AND coalesce(activo,true) ORDER BY updated_at DESC NULLS LAST LIMIT 1;`));};
  const valores=[await registrar(3.75),await registrar(3.8),await registrar(3.75)];
  assert.deepEqual(valores,[3.75,3.8,3.75],'Venta registrada tras cada alta: '+JSON.stringify(valores));
 });
 await check('Claves: renombrar un centro de costo B→C→B deja B',async()=>{
  const cc=ok(await raw('contabilidad/centros-costo',{codigo:'CC-DK',nombre:'Centro A',descripcion:'Centro local'}),'Centro');const id=cc?.id??cc?.centro?.id;assert.ok(id);
  const renombrar=async nombre=>{ok(await raw('contabilidad/centros-costo/'+id,{nombre},'PUT'),'Renombrar '+nombre);return sql(`SELECT nombre FROM centros_costo WHERE id=${q(id)};`);};
  const nombres=[await renombrar('Centro B'),await renombrar('Centro C'),await renombrar('Centro B')];
  assert.deepEqual(nombres,['Centro B','Centro C','Centro B'],'Nombre tras cada edición: '+JSON.stringify(nombres));
 });
 await check('Claves: cambiar el vencimiento de una CxP A→B→A deja A',async()=>{
  const weights=[5,4,3,2,7,6,5,4,3,2],base='2098765515',d=11-weights.reduce((sum,weight,index)=>sum+Number(base[index])*weight,0)%11;
  const provider=ok(await raw('compras/proveedores',{ruc:base+String(d===10?0:d===11?1:d),razon_social:'Proveedor claves local',direccion:'Av. Local 456',email:'prov-claves-'+randomUUID().slice(0,6)+'@example.test'}),'Proveedor');
  const shift=days=>new Date(Date.parse(today+'T12:00:00Z')+days*86400000).toISOString().slice(0,10);
  const cxp=ok(await raw('finanzas/cxp',{proveedor_id:provider.id,numero_documento:'00000201',serie:'F001',tipo_documento:'FACTURA',fecha_emision:today,fecha_vencimiento:shift(30),condiciones_pago:'CREDITO_30',subtotal:100,igv:18,total:118,moneda:'PEN',tipo_cambio:1,destino_credito_fiscal:'GRAVADAS'}),'CxP');
  const vencer=async dias=>{ok(await raw('finanzas/cxp/'+cxp.id,{fecha_vencimiento:shift(dias)},'PUT'),'Vencimiento');return sql(`SELECT fecha_vencimiento::text FROM cuentas_por_pagar WHERE id=${q(cxp.id)};`);};
  const fechas=[await vencer(45),await vencer(60),await vencer(45)];
  assert.deepEqual(fechas,[shift(45),shift(60),shift(45)],'Vencimiento tras cada edición: '+JSON.stringify(fechas));
 });
 success=scenarios.every(scenario=>scenario.passed);
}catch(error){scenarios.push({scenario:'Claves: preparación o dependencia',passed:false,message:String(error.message).slice(0,900)});}
finally{fs.writeFileSync(path.join(output,'derived-keys.json'),JSON.stringify({success,remoteWrites:false,scope:'Ediciones sin Idempotency-Key API/DB local; sin aceptación integral',scenarios,requests},null,2));}
console.log(JSON.stringify({success,passed:scenarios.filter(scenario=>scenario.passed).length,failed:scenarios.filter(scenario=>!scenario.passed).map(scenario=>scenario.scenario)}));
if(!success)process.exitCode=1;
