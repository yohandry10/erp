import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {fetchWithLocalLoginRetry} from './peru-local-http.mjs';
// Presupuestos de contabilidad (lo que hace el formulario: sin Idempotency-Key)
// con API/PostgreSQL locales efímeros.
assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB,'1');assert.equal(process.env.PGHOST,'127.0.0.1');assert.equal(process.env.PGDATABASE,'erp_e2e');
const api=process.env.LOCAL_API_URL;assert.equal(new URL(api).hostname,'127.0.0.1');const output=process.env.LOCAL_INTEGRATED_OUTPUT_DIR;
const first=JSON.parse(fs.readFileSync(path.join(output,'pres-first-fixture.json'))),other=JSON.parse(fs.readFileSync(path.join(output,'pres-other-fixture.json')));
const sql=query=>execFileSync(process.env.PSQL_BIN,['-XqAt','-h','127.0.0.1','-p',process.env.PGPORT,'-U','postgres','-d','erp_e2e','-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8',windowsHide:true}).trim();
assert.equal(sql("SELECT current_database()||'|'||environment||'|'||project_ref FROM app.deployment_environment WHERE singleton;"),'erp_e2e|DEV|localerpephemeralqax');
const q=id=>{assert.match(id,/^[0-9a-f-]{36}$/i);return "'"+id+"'::uuid";};
let token,otherToken;const scenarios=[],requests=[];let success=false;
// Sin Idempotency-Key, como envía PresupuestoForm.
async function raw(endpoint,body,access=token,method=body===undefined?'GET':'POST'){
 const response=await fetchWithLocalLoginRetry(api+'/api/'+endpoint,{method,headers:{'content-type':'application/json',connection:'close',...(access?{authorization:'Bearer '+access}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 const bytes=Buffer.from(await response.arrayBuffer());let value;try{value=JSON.parse(bytes.toString());}catch{value=bytes.toString();}
 requests.push({method,endpoint:endpoint.replace(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/gi,':id').split('?')[0],status:response.status});
 return {status:response.status,body:value,data:value&&typeof value==='object'&&Object.hasOwn(value,'data')?value.data:value};
}
async function call(endpoint,body,status=body===undefined?200:201,access=token,method){
 const result=await raw(endpoint,body,access,method);assert.equal(result.status,status,endpoint.split('?')[0]+': '+JSON.stringify(result.body).slice(0,400));return result.data;
}
async function check(scenario,action){try{const detail=await action();scenarios.push({scenario,passed:true,...(detail||{})});}catch(error){scenarios.push({scenario,passed:false,message:String(error.message).slice(0,900)});}}
const monto=id=>Number(sql(`SELECT monto_presupuestado FROM presupuestos WHERE id=${q(id)};`));
const vivos=(centro,cuenta,periodo)=>Number(sql(`SELECT count(*) FROM presupuestos WHERE centro_costo_id=${q(centro)} AND cuenta_id=${q(cuenta)} AND periodo_contable_id=${q(periodo)};`));
try{
 const login=async email=>{const r=await raw('auth/login',{email,password:'Cliente-Local-2026-Only!'},null);return r.data?.access_token??r.body?.access_token;};
 token=await login(first.email);otherToken=await login(other.email);assert.ok(token&&otherToken,'Sin sesión');
 const [anio,mes]=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima'}).format(new Date()).split('-').map(Number);
 const periods=await call('contabilidad/periodos');const rows=Array.isArray(periods)?periods:periods?.items??periods?.data??[];
 if(!rows.some(p=>Number(p.anio)===anio&&Number(p.mes)===mes))await call('contabilidad/periodos',{anio,mes});
 const periodo=sql(`SELECT id FROM periodos_contables WHERE tenant_id=${q(first.tenant)} AND anio=${anio} AND mes=${mes} LIMIT 1;`);
 const cuentas=sql(`SELECT string_agg(id::text,',' ORDER BY codigo) FROM (SELECT id,codigo FROM plan_cuentas WHERE tenant_id=${q(first.tenant)} AND activo AND codigo LIKE '6%' ORDER BY codigo LIMIT 3) c;`).split(',');
 assert.equal(cuentas.length,3,'Faltan cuentas de gasto');
 const cc=await raw('contabilidad/centros-costo',{codigo:'CC-PRES',nombre:'Centro presupuestos',descripcion:'Centro local'});assert.equal(cc.status,201,'Centro: '+JSON.stringify(cc.body).slice(0,200));
 const centro=cc.data?.id??cc.data?.centro?.id;assert.ok(centro);
 const crear=(cuenta,montoPresupuestado)=>raw('contabilidad/presupuestos',{centro_costo_id:centro,cuenta_id:cuenta,periodo_contable_id:periodo,monto_presupuestado:montoPresupuestado,notas:'Presupuesto local'});
 await check('Presupuestos: editar el monto y volver a uno anterior se aplica cada vez',async()=>{
  const created=await crear(cuentas[0],1000);assert.equal(created.status,201,'Alta: '+JSON.stringify(created.body).slice(0,200));
  const id=created.data?.id;assert.ok(id);
  const editar=async valor=>{const r=await raw('contabilidad/presupuestos/'+id,{monto_presupuestado:valor,notas:'Ajuste',estado:'ACTIVO'},token,'PUT');assert.ok([200,201].includes(r.status),'Edición '+valor+': '+r.status+' '+JSON.stringify(r.body).slice(0,200));return monto(id);};
  const valores=[await editar(2000),await editar(3000),await editar(2000)];
  assert.deepEqual(valores,[2000,3000,2000],'Montos tras cada edición: '+JSON.stringify(valores));
 });
 await check('Presupuestos: borrar y volver a crear el mismo presupuesto lo crea de nuevo',async()=>{
  const created=await crear(cuentas[1],500);assert.equal(created.status,201);const id=created.data?.id;
  const removed=await raw('contabilidad/presupuestos/'+id,undefined,token,'DELETE');assert.ok([200,204].includes(removed.status),'Baja: '+removed.status);
  assert.equal(vivos(centro,cuentas[1],periodo),0,'Sigue vivo tras borrar');
  const again=await crear(cuentas[1],500);assert.equal(again.status,201,'Recreación: '+again.status+' '+JSON.stringify(again.body).slice(0,200));
  assert.equal(vivos(centro,cuentas[1],periodo),1,'La recreación no dejó un presupuesto vivo (respuesta '+JSON.stringify(again.data).slice(0,160)+')');
 });
 await check('Presupuestos: duplicado del mismo centro, cuenta y periodo responde 409 legible',async()=>{
  assert.equal((await crear(cuentas[2],700)).status,201);
  const duplicate=await crear(cuentas[2],800);
  assert.equal(duplicate.status,409,'Duplicado respondió '+duplicate.status+' '+JSON.stringify(duplicate.body).slice(0,200));
  assert.doesNotMatch(String(duplicate.body?.message),/duplicate key|violates|ux_/i);
 });
 await check('Presupuestos: inexistente o ajeno responde 404',async()=>{
  const id=sql(`SELECT id FROM presupuestos WHERE tenant_id=${q(first.tenant)} LIMIT 1;`);
  const statuses={missing:(await raw('contabilidad/presupuestos/'+randomUUID())).status,foreign:(await raw('contabilidad/presupuestos/'+id,undefined,otherToken)).status,
   editForeign:(await raw('contabilidad/presupuestos/'+id,{monto_presupuestado:1,notas:'x',estado:'ACTIVO'},otherToken,'PUT')).status};
  assert.deepEqual(statuses,{missing:404,foreign:404,editForeign:404},JSON.stringify(statuses));
 });
 await check('Presupuestos: sin lectura responde 503 legible',async()=>{
  sql('REVOKE SELECT ON public.presupuestos FROM service_role;');
  let result;try{result=await raw('contabilidad/presupuestos');}finally{sql('GRANT SELECT ON public.presupuestos TO service_role;');}
  assert.equal(result.status,503,'Lista sin lectura respondió '+result.status+' '+JSON.stringify(result.body).slice(0,200));
  assert.doesNotMatch(String(result.body?.message),/permission denied|42501/i);
 });
 success=scenarios.every(scenario=>scenario.passed);
}catch(error){scenarios.push({scenario:'Presupuestos: preparación o dependencia',passed:false,message:String(error.message).slice(0,900)});}
finally{fs.writeFileSync(path.join(output,'budgets.json'),JSON.stringify({success,remoteWrites:false,scope:'Presupuestos de contabilidad API/DB local; sin aceptación integral',scenarios,requests},null,2));}
console.log(JSON.stringify({success,passed:scenarios.filter(scenario=>scenario.passed).length,failed:scenarios.filter(scenario=>!scenario.passed).map(scenario=>scenario.scenario)}));
if(!success)process.exitCode=1;
