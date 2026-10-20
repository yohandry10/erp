import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';
import {fetchWithLocalLoginRetry} from './peru-local-http.mjs';
// Contrato de «Refrescar vistas» (estados financieros): el API lee el periodo del
// cuerpo. La pantalla lo enviaba en la URL con el cuerpo vacío.
assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB,'1');assert.equal(process.env.PGHOST,'127.0.0.1');assert.equal(process.env.PGDATABASE,'erp_e2e');
const api=process.env.LOCAL_API_URL;assert.equal(new URL(api).hostname,'127.0.0.1');const output=process.env.LOCAL_INTEGRATED_OUTPUT_DIR;
const first=JSON.parse(fs.readFileSync(path.join(output,'est-first-fixture.json')));
const sql=query=>execFileSync(process.env.PSQL_BIN,['-XqAt','-h','127.0.0.1','-p',process.env.PGPORT,'-U','postgres','-d','erp_e2e','-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8',windowsHide:true}).trim();
assert.equal(sql("SELECT current_database()||'|'||environment||'|'||project_ref FROM app.deployment_environment WHERE singleton;"),'erp_e2e|DEV|localerpephemeralqax');
const scenarios=[],requests=[];let success=false;
try{
 const login=await (await fetchWithLocalLoginRetry(api+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:first.email,password:'Cliente-Local-2026-Only!'})})).json();
 const token=login?.data?.access_token??login?.access_token;assert.ok(token,'Sin sesión');
 const [anio,mes]=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima'}).format(new Date()).split('-').map(Number);
 const post=async(url,body)=>{const r=await fetchWithLocalLoginRetry(api+url,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify(body)});requests.push({method:'POST',endpoint:'contabilidad/estados/refrescar',status:r.status});return r.status;};
 const scenario='Estados: refrescar con el periodo en el cuerpo responde 2xx';
 try{const status=await post('/api/contabilidad/estados/refrescar',{anio,mes});assert.ok(status<300,'Con cuerpo respondió '+status);scenarios.push({scenario,passed:true});}
 catch(error){scenarios.push({scenario,passed:false,message:String(error.message).slice(0,400)});}
 success=scenarios.every(item=>item.passed);
}catch(error){scenarios.push({scenario:'Estados: preparación o dependencia',passed:false,message:String(error.message).slice(0,900)});}
finally{fs.writeFileSync(path.join(output,'statements-refresh.json'),JSON.stringify({success,remoteWrites:false,scope:'Contrato de refresco de estados financieros API local',scenarios,requests},null,2));}
console.log(JSON.stringify({success}));
if(!success)process.exitCode=1;
