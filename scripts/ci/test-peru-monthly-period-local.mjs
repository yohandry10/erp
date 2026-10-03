import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fetchWithLocalLoginRetry} from './peru-local-http.mjs';
assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB,'1');
assert.equal(process.env.PGHOST,'127.0.0.1');assert.equal(process.env.PGDATABASE,'erp_e2e');
const api=process.env.LOCAL_API_URL;assert.equal(new URL(api).hostname,'127.0.0.1');
const output=process.env.LOCAL_INTEGRATED_OUTPUT_DIR,fixture=JSON.parse(fs.readFileSync(path.join(output,'configuration-admin-fixture.json')));
const response=await fetchWithLocalLoginRetry(api+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:fixture.email,password:'Cliente-Local-2026-Only!'})});
assert.equal(response.status,201);const auth=await response.json(),token=auth.access_token??auth.data?.access_token;assert.ok(token);
const setup=await fetch(api+'/api/configuration/empresa',{method:'PUT',headers:{authorization:'Bearer '+token,'content-type':'application/json','idempotency-key':randomUUID()},body:JSON.stringify({regimen:'MYPE'})});assert.equal(setup.status,200,await setup.text());
const scenarios=[],defects=[],requests=[];
for(const [year,uit] of [[2024,5150],[2025,5350],[2026,5500],[2027,null]]){
 const result=await fetch(api+'/api/contabilidad/impuestos/mensual?periodo='+year+'-09',{headers:{authorization:'Bearer '+token}}),body=await result.json();
 const expectedStatus=uit===null?400:200,data=body.data??body;
 const passed=result.status===expectedStatus&&(uit===null||data.uit===uit);
 const row={scenario:'Impuesto mensual: UIT del ejercicio '+year,passed,expected_status:expectedStatus,status:result.status,expected_uit:uit,actual_uit:data.uit??null,actual_limit_rmt:data.limite_rmt_300_uit??null,error_message:result.status>=400?body.message??null:null};
 scenarios.push(row);requests.push({method:'GET',endpoint:'contabilidad/impuestos/mensual',status:result.status});if(!passed)defects.push(row);
}
const sql=query=>execFileSync(process.env.PSQL_BIN,['-XqAt','-h','127.0.0.1','-p',process.env.PGPORT,'-U','postgres','-d','erp_e2e','-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8',windowsHide:true}).trim();
assert.equal(sql("SELECT current_database()||'|'||environment||'|'||project_ref FROM app.deployment_environment WHERE singleton;"),'erp_e2e|DEV|localerpephemeralqax');
const prior=await fetch(api+'/api/contabilidad/impuestos/mensual',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json','idempotency-key':randomUUID()},body:JSON.stringify({periodo:'2026-08',saldo_favor_anterior:125.50,notas:'Saldo de prueba exclusivamente local'})});
const priorBody=await prior.json();assert.equal(prior.status,201,JSON.stringify(priorBody));const priorData=priorBody.data??priorBody;
assert.equal(Number(priorData.saldo_favor_siguiente),125.50);requests.push({method:'POST',endpoint:'contabilidad/impuestos/mensual',status:prior.status});
const creditBefore=sql("SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]')::text) FROM tributos_declaraciones_mensuales t;");
try{
 sql('REVOKE SELECT ON tributos_declaraciones_mensuales FROM service_role;');
 assert.equal(sql("SELECT has_table_privilege('service_role','tributos_declaraciones_mensuales','SELECT');"),'f');
 const r=await fetch(api+'/api/contabilidad/impuestos/mensual?periodo=2026-09',{headers:{authorization:'Bearer '+token}}),body=await r.json(),data=body.data??body;
 const row={scenario:'Impuesto mensual: fallo real de lectura del saldo previo bloquea cálculo',passed:r.status===503,expected_status:503,status:r.status,actual_saldo_favor:data.saldo_favor_anterior??null,error_message:r.status>=400?body.message??null:null};
 scenarios.push(row);requests.push({method:'GET',endpoint:'contabilidad/impuestos/mensual',status:r.status});if(!row.passed)defects.push(row);
 const blocked=await fetch(api+'/api/contabilidad/impuestos/mensual',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json','idempotency-key':randomUUID()},body:JSON.stringify({periodo:'2026-09'})});await blocked.body?.cancel();
 const noWrite=sql("SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]')::text) FROM tributos_declaraciones_mensuales t;")===creditBefore;
 const saveRow={scenario:'Impuesto mensual: fallo de saldo bloquea guardado sin nueva versión',passed:blocked.status===503&&noWrite,status:blocked.status,persisted_unchanged:noWrite};scenarios.push(saveRow);requests.push({method:'POST',endpoint:'contabilidad/impuestos/mensual',status:blocked.status});if(!saveRow.passed)defects.push(saveRow);
}finally{sql('GRANT SELECT ON tributos_declaraciones_mensuales TO service_role;');}
const recovery=await fetch(api+'/api/contabilidad/impuestos/mensual?periodo=2026-09',{headers:{authorization:'Bearer '+token}}),recoveryBody=await recovery.json(),recovered=recoveryBody.data??recoveryBody;
const recoveredRow={scenario:'Impuesto mensual: recupera lectura y arrastra saldo persistido de 125.50',passed:recovery.status===200&&Number(recovered.saldo_favor_anterior)===125.50,status:recovery.status,saldo_favor:recovered.saldo_favor_anterior};scenarios.push(recoveredRow);requests.push({method:'GET',endpoint:'contabilidad/impuestos/mensual',status:recovery.status});if(!recoveredRow.passed)defects.push(recoveredRow);
fs.writeFileSync(path.join(output,'monthly-period.json'),JSON.stringify({success:defects.length===0,remoteWrites:false,local_only:true,scope:'Cálculo mensual para períodos 2024/2025/2026 y bloqueo de ejercicio sin UIT verificada; no presenta documentos',scenarios,defects,requests,sources:['https://mef.gob.pe/en/normatividad-sp-9322/por-instrumento/decretos-supremos/32370-decreto-supremo-n-309-2023-ef-1/file','https://www.gob.pe/institucion/mef/normas-legales/7540449-301-2025-ef','https://www.gob.pe/institucion/mef/normas-legales/6302495-260-2024-ef']},null,2));
