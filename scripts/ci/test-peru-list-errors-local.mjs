import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';
import {fetchWithLocalLoginRetry} from './peru-local-http.mjs';
// Listados de clientes y almacenes con la lectura caída: el API responde 503 y
// la pantalla lo muestra (la prueba de navegador del bloque lo comprueba).
assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB,'1');assert.equal(process.env.PGHOST,'127.0.0.1');assert.equal(process.env.PGDATABASE,'erp_e2e');
const api=process.env.LOCAL_API_URL;assert.equal(new URL(api).hostname,'127.0.0.1');const output=process.env.LOCAL_INTEGRATED_OUTPUT_DIR;
const first=JSON.parse(fs.readFileSync(path.join(output,'le-first-fixture.json')));
const sql=query=>execFileSync(process.env.PSQL_BIN,['-XqAt','-h','127.0.0.1','-p',process.env.PGPORT,'-U','postgres','-d','erp_e2e','-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8',windowsHide:true}).trim();
assert.equal(sql("SELECT current_database()||'|'||environment||'|'||project_ref FROM app.deployment_environment WHERE singleton;"),'erp_e2e|DEV|localerpephemeralqax');
const scenarios=[],requests=[];let success=false;
try{
 const login=await (await fetchWithLocalLoginRetry(api+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:first.email,password:'Cliente-Local-2026-Only!'})})).json();
 const token=login?.data?.access_token??login?.access_token;assert.ok(token,'Sin sesión');
 for(const [table,endpoint] of [['clientes','ventas/clientes'],['almacenes','inventario/almacenes']]){
  const scenario=`Listas: sin lectura de ${table} GET /api/${endpoint} responde 503`;
  sql(`REVOKE SELECT ON public.${table} FROM service_role;`);
  try{const r=await fetchWithLocalLoginRetry(api+'/api/'+endpoint,{headers:{authorization:'Bearer '+token}});requests.push({method:'GET',endpoint,status:r.status});
   assert.equal(r.status,503,endpoint+' respondió '+r.status);scenarios.push({scenario,passed:true});}
  catch(error){scenarios.push({scenario,passed:false,message:String(error.message).slice(0,300)});}
  finally{sql(`GRANT SELECT ON public.${table} TO service_role;`);}
 }
 success=scenarios.every(item=>item.passed);
}catch(error){scenarios.push({scenario:'Listas: preparación o dependencia',passed:false,message:String(error.message).slice(0,900)});}
finally{fs.writeFileSync(path.join(output,'list-errors.json'),JSON.stringify({success,remoteWrites:false,scope:'Listas de clientes y almacenes con lectura caída',scenarios,requests},null,2));}
console.log(JSON.stringify({success}));
if(!success)process.exitCode=1;
