import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fetchWithLocalLoginRetry} from './peru-local-http.mjs';
assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB,'1');
assert.equal(process.env.PGHOST,'127.0.0.1');assert.equal(process.env.PGDATABASE,'erp_e2e');
const api=process.env.LOCAL_API_URL;assert.equal(new URL(api).hostname,'127.0.0.1');
const output=process.env.LOCAL_INTEGRATED_OUTPUT_DIR;
const fixture=JSON.parse(fs.readFileSync(path.join(output,'tax-intents-fixture.json')));
const other=JSON.parse(fs.readFileSync(path.join(output,'tax-other-fixture.json')));
const sql=query=>execFileSync(process.env.PSQL_BIN,['-XqAt','-h','127.0.0.1','-p',process.env.PGPORT,'-U','postgres','-d','erp_e2e','-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8',windowsHide:true}).trim();
assert.equal(sql("SELECT current_database()||'|'||environment||'|'||project_ref FROM app.deployment_environment WHERE singleton;"),'erp_e2e|DEV|localerpephemeralqax');
const q=id=>{assert.match(id,/^[0-9a-f-]{36}$/i);return "'"+id+"'::uuid";};
const scenarios=[],requests=[];let token;
async function call(endpoint,body,expected=body===undefined?200:201,key=randomUUID(),access=token){
 const result=await fetchWithLocalLoginRetry(api+'/api/'+endpoint,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',...(access?{authorization:'Bearer '+access}:{}),...(key?{'idempotency-key':key}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 const value=await result.json();requests.push({method:body===undefined?'GET':'POST',endpoint:endpoint.replace(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/gi,':id').split('?')[0],status:result.status});
 assert.equal(result.status,expected,endpoint+': '+JSON.stringify(value));return value.data??value;
}
const pass=scenario=>scenarios.push({scenario,passed:true});
const snapshot=()=>sql(`SELECT md5(jsonb_build_object('monthly',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM tributos_declaraciones_mensuales t WHERE tenant_id=${q(fixture.tenant)}),'annual',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM tributos_declaraciones_anuales t WHERE tenant_id=${q(fixture.tenant)}),'intents',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM tributos_operaciones_562 t WHERE tenant_id=${q(fixture.tenant)}))::text);`);
let success=false;
try{
 token=(await call('auth/login',{email:fixture.email,password:'Cliente-Local-2026-Only!'})).access_token;assert.ok(token);
 const configure=async access=>{const result=await fetch(api+'/api/configuration/empresa',{method:'PUT',headers:{authorization:'Bearer '+access,'content-type':'application/json','idempotency-key':randomUUID()},body:JSON.stringify({regimen:'MYPE'})});assert.equal(result.status,200,await result.text());};
 await configure(token);
 const monthly='contabilidad/impuestos/mensual',annual='contabilidad/impuestos/anual';
 const firstBody={periodo:'2026-07',saldo_favor_anterior:80,notas:'Intención mensual local'},key=randomUUID();
 const first=await call(monthly,firstBody,201,key),replay=await call(monthly,firstBody,201,key);assert.deepEqual(replay,first);pass('Mensual: misma intención conserva ID, versión y corte congelado');
 let before=snapshot();await call(monthly,{...firstBody,saldo_favor_anterior:90},409,key);assert.equal(snapshot(),before);pass('Mensual: colisión 409 no altera borradores ni intenciones');
 const concurrentKey=randomUUID(),concurrent=await Promise.all([call(monthly,{...firstBody,notas:'Concurrencia local'},201,concurrentKey),call(monthly,{...firstBody,notas:'Concurrencia local'},201,concurrentKey)]);assert.deepEqual(concurrent[0],concurrent[1]);assert.equal(concurrent[0].version,2);pass('Mensual: dos solicitudes concurrentes producen una sola versión');
 const receiptKey=randomUUID(),receiptBody={constancia:'LOCAL-SIMULADA-NO-ENVIADA',fecha_presentacion:'2026-09-01T15:00:00.000Z'},receiptPath='contabilidad/impuestos/declaraciones/'+concurrent[0].id+'/constancia';
 const presented=await call(receiptPath,receiptBody,201,receiptKey);assert.equal(presented.estado,'PRESENTADA');assert.deepEqual(await call(receiptPath,receiptBody,201,receiptKey),presented);pass('Mensual: constancia simulada y replay devuelven una misma presentación local');
 before=snapshot();await call(receiptPath,{...receiptBody,constancia:'LOCAL-OTRA'},409,receiptKey);assert.equal(snapshot(),before);pass('Mensual: constancia distinta con misma intención rechazada');
 const corrected=await call(monthly,{...firstBody,notas:'Rectificación local'});assert.equal(corrected.version,3);assert.equal(sql(`SELECT estado FROM tributos_declaraciones_mensuales WHERE id=${q(presented.id)};`),'PRESENTADA');pass('Mensual: nueva versión conserva constancia previa hasta presentar corrección');
 await call('contabilidad/impuestos/declaraciones/'+corrected.id+'/constancia',receiptBody);assert.equal(sql(`SELECT estado FROM tributos_declaraciones_mensuales WHERE id=${q(presented.id)};`),'RECTIFICADA');pass('Mensual: presentación corregida rectifica únicamente la versión anterior');
 assert.deepEqual(await call(monthly,firstBody,201,key),first);assert.deepEqual(await call(receiptPath,receiptBody,201,receiptKey),presented);pass('Mensual: replay histórico recupera respuesta congelada sin reactivar versión anterior');
 const annualBody={ejercicio:2025,adiciones_tributarias:100,notas:'Conciliación anual local'},annualKey=randomUUID();
 const annualFirst=await call(annual,annualBody,201,annualKey);assert.deepEqual(await call(annual,annualBody,201,annualKey),annualFirst);pass('Anual: replay conserva ID, versión, UIT y corte');
 before=snapshot();await call(annual,{...annualBody,adiciones_tributarias:101},409,annualKey);assert.equal(snapshot(),before);pass('Anual: cambio de adición con misma clave rechaza sin escritura');
 await call('contabilidad/impuestos/anuales/'+annualFirst.id+'/constancia',receiptBody,400);pass('Anual: ejercicio abierto bloquea constancia sin presentarla');
 const period=await call('contabilidad/periodos',{anio:2025,mes:12});await call('contabilidad/periodos/'+period.id+'/cerrar',{});const closed=await call('contabilidad/impuestos/anual?ejercicio=2025');assert.equal(closed.source_snapshot.ejercicio_cerrado,true);assert.equal(closed.warnings.some(w=>w.bloquea_presentacion),false);pass('Anual: cierre contable real habilita un nuevo papel de trabajo revisable');
 const closedKey=randomUUID(),annualNew=await Promise.all([call(annual,{...annualBody,notas:'Ejercicio cerrado local'},201,closedKey),call(annual,{...annualBody,notas:'Ejercicio cerrado local'},201,closedKey)]);assert.deepEqual(annualNew[0],annualNew[1]);assert.equal(annualNew[0].version,2);pass('Anual: concurrencia tras cierre produce una sola nueva versión');
 const annualReceiptKey=randomUUID(),annualReceiptPath='contabilidad/impuestos/anuales/'+annualNew[0].id+'/constancia';const annualPresented=await call(annualReceiptPath,receiptBody,201,annualReceiptKey);assert.deepEqual(await call(annualReceiptPath,receiptBody,201,annualReceiptKey),annualPresented);pass('Anual: constancia simulada y replay recuperan el resultado local');
 const annualCorrection=await call(annual,{...annualBody,notas:'Rectificación anual local'});assert.equal(sql(`SELECT estado FROM tributos_declaraciones_anuales WHERE id=${q(annualPresented.id)};`),'PRESENTADA');await call('contabilidad/impuestos/anuales/'+annualCorrection.id+'/constancia',receiptBody);assert.equal(sql(`SELECT estado FROM tributos_declaraciones_anuales WHERE id=${q(annualPresented.id)};`),'RECTIFICADA');assert.deepEqual(await call(annualReceiptPath,receiptBody,201,annualReceiptKey),annualPresented);pass('Anual: rectifica constancia previa y conserva replay histórico congelado');
 before=snapshot();await call(monthly,firstBody,400,null);await call(monthly,{...firstBody,saldo_favor_anterior:-1},400);await call(annual,{ejercicio:2027},400);assert.equal(snapshot(),before);pass('Validaciones: clave ausente, crédito negativo y año sin UIT no escriben');
 const actor=sql(`SELECT id FROM usuarios_sistema WHERE tenant_id=${q(fixture.tenant)} AND email='${fixture.email}';`);
 sql(`UPDATE rol_permisos rp SET concedido=false FROM permisos p,roles r WHERE rp.permiso_id=p.id AND rp.role_id=r.id AND p.tenant_id=${q(fixture.tenant)} AND r.tenant_id=${q(fixture.tenant)} AND lower(p.codigo)='contabilidad.reportes.actualizar';`);
 try{before=snapshot();await call(monthly,firstBody,403,key);assert.equal(snapshot(),before);pass('Permiso retirado: JWT previo no recupera ni muta intención');}finally{sql(`UPDATE rol_permisos rp SET concedido=true FROM permisos p,roles r WHERE rp.permiso_id=p.id AND rp.role_id=r.id AND p.tenant_id=${q(fixture.tenant)} AND r.tenant_id=${q(fixture.tenant)} AND lower(p.codigo)='contabilidad.reportes.actualizar';`);}
 const otherToken=(await call('auth/login',{email:other.email,password:'Cliente-Local-2026-Only!'})).access_token;await configure(otherToken);
 before=snapshot();await call(receiptPath,receiptBody,404,randomUUID(),otherToken);assert.equal(snapshot(),before);pass('Aislamiento: administrador de otra empresa no registra constancia ajena');
 const otherRow=await call(monthly,firstBody,201,key,otherToken);assert.notEqual(otherRow.id,first.id);assert.equal(otherRow.version,1);assert.equal(otherRow.tenant_id,other.tenant);pass('Aislamiento: la misma clave en otra empresa genera sólo su propio borrador');
 sql(`CREATE FUNCTION public.fail_tax_intent_local_562() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.notas='FALLO_LOCAL_562' THEN RAISE EXCEPTION 'Fallo local de inserción tributaria'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_tax_intent_local_562 BEFORE INSERT ON public.tributos_declaraciones_mensuales FOR EACH ROW EXECUTE FUNCTION public.fail_tax_intent_local_562();`);
 const failureKey=randomUUID(),failureBody={periodo:'2026-08',notas:'FALLO_LOCAL_562'};
 try{before=snapshot();await call(monthly,failureBody,503,failureKey);assert.equal(snapshot(),before);pass('Rollback: fallo real tras reserva no deja intención ni nueva versión');}finally{sql('DROP TRIGGER fail_tax_intent_local_562 ON public.tributos_declaraciones_mensuales; DROP FUNCTION public.fail_tax_intent_local_562();');}
 const recovered=await call(monthly,failureBody,201,failureKey);assert.equal(recovered.version,1);pass('Recuperación: misma intención después de fallo real guarda exactamente una versión');
 before=snapshot();sql('REVOKE EXECUTE ON FUNCTION public.mutar_tributo_peru_tx(uuid,uuid,text,text,uuid,jsonb,jsonb) FROM service_role;');
 try{await call(monthly,{periodo:'2026-06'},503);assert.equal(snapshot(),before);pass('Indisponibilidad de RPC: devuelve 503 sin alterar datos');}finally{sql('GRANT EXECUTE ON FUNCTION public.mutar_tributo_peru_tx(uuid,uuid,text,text,uuid,jsonb,jsonb) TO service_role;');}
 assert.deepEqual(await call(monthly,firstBody,201,key),first);const history=await call('contabilidad/impuestos/declaraciones?limite=36');assert.equal(history.filter(x=>x.periodo==='2026-07').length,3);pass('Consulta persistida: historial de tres versiones y recuperación tras error de RPC');
 assert.equal(sql("SELECT has_table_privilege('service_role','tributos_operaciones_562','INSERT') OR has_table_privilege('authenticated','tributos_operaciones_562','SELECT') OR has_function_privilege('anon','public.mutar_tributo_peru_tx(uuid,uuid,text,text,uuid,jsonb,jsonb)','EXECUTE');"),'f');assert.ok(actor);pass('ACL: intenciones privadas y RPC no accesible a anon/authenticated');
 success=true;
}finally{
 fs.writeFileSync(path.join(output,'tax-intents.json'),JSON.stringify({success,remoteWrites:false,local_only:true,scope:'Versionado y constancias simuladas exclusivamente locales; no envío ni aceptación SUNAT',scenarios,requests},null,2));
}
