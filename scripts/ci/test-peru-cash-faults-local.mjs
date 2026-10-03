import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';import {execFileSync} from 'node:child_process';
assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB,'1');assert.equal(process.env.PGHOST,'127.0.0.1');assert.equal(process.env.PGDATABASE,'erp_e2e');
const output=process.env.LOCAL_INTEGRATED_OUTPUT_DIR,fixture=JSON.parse(fs.readFileSync(path.join(output,'cash-browser-fixture.json'))),first=JSON.parse(fs.readFileSync(path.join(output,'cash-first-fixture.json')));
const api=process.env.LOCAL_API_URL;assert.equal(new URL(api).hostname,'127.0.0.1');assert.match(fixture.tenant,/^[0-9a-f-]{36}$/);assert.match(fixture.caja_id,/^[0-9a-f-]{36}$/);
const sql=query=>execFileSync(process.env.PSQL_BIN,['-XqAt','-h','127.0.0.1','-p',process.env.PGPORT,'-U','postgres','-d','erp_e2e','-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8',windowsHide:true}).trim();
const q=value=>{assert.match(value,/^[0-9a-f-]{36}$/);return "'"+value+"'::uuid";};
let token,session;const scenarios=[],requests=[];
async function raw(endpoint,body,key=randomUUID()){
 const response=await fetch(api+'/api/'+endpoint,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json','idempotency-key':key,...(token?{authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
 const value=await response.json();requests.push({method:body===undefined?'GET':'POST',endpoint:endpoint.replace(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/gi,':id'),status:response.status});return {status:response.status,data:value.data??value};
}
const call=async(endpoint,body,status=body===undefined?200:201,key=randomUUID())=>{const result=await raw(endpoint,body,key);assert.equal(result.status,status,endpoint+': '+JSON.stringify(result.data));return result.data;};
const fingerprint=()=>sql(`SELECT md5(jsonb_build_object('sessions',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM sesiones_caja t WHERE tenant_id=${q(fixture.tenant)}),'movements',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM movimientos_caja t WHERE tenant_id=${q(fixture.tenant)}),'events',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM outbox_events t WHERE tenant_id=${q(fixture.tenant)}),'cuts',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM cortes_caja t WHERE tenant_id=${q(fixture.tenant)}))::text);`);
const check=async(scenario,action)=>{try{await action();scenarios.push({scenario,passed:true});}catch(error){scenarios.push({scenario,passed:false,message:error.message});}};
try{
 token=(await call('auth/login',{email:first.email,password:'Cliente-Local-2026-Only!'})).access_token;
 assert.match(fixture.faults_caja_id,/^[0-9a-f-]{36}$/);session=await call('cajas/'+fixture.faults_caja_id+'/apertura',{monto_inicio:100,moneda:'PEN'});
 await check('Caja: dos ingresos concurrentes de la misma intención producen un único movimiento/evento',async()=>{
  const key=randomUUID(),body={tipo:'INGRESO',monto:2,motivo:'Concurrencia de caja local',cuenta_contrapartida_id:fixture.income_account_id};
  const responses=await Promise.all([call('cajas/movimientos/manual/'+session.id,body,201,key),call('cajas/movimientos/manual/'+session.id,body,201,key)]);assert.equal(responses[0].id,responses[1].id);const before=fingerprint();await call('cajas/movimientos/manual/'+session.id,{...body,monto:3},400,key);assert.equal(fingerprint(),before);assert.equal(Number((await call('cajas/saldo-esperado/'+session.id)).saldo),102);
 });
 await check('Caja: writer manual sin EXECUTE devuelve 503 y recupera la intención tras restituir permiso',async()=>{
  const before=fingerprint(),key=randomUUID(),body={tipo:'INGRESO',monto:1,motivo:'RPC local recuperable',cuenta_contrapartida_id:fixture.income_account_id};let error;
  sql('REVOKE EXECUTE ON FUNCTION public.registrar_movimiento_manual_caja_tx(uuid,uuid,jsonb,uuid,text) FROM service_role;');
  try{await call('cajas/movimientos/manual/'+session.id,body,503,key);assert.equal(fingerprint(),before);}catch(failure){error=failure;}finally{sql('GRANT EXECUTE ON FUNCTION public.registrar_movimiento_manual_caja_tx(uuid,uuid,jsonb,uuid,text) TO service_role;');}
  const recovered=await call('cajas/movimientos/manual/'+session.id,body,201,key);const after=fingerprint();assert.equal((await call('cajas/movimientos/manual/'+session.id,body,201,key)).id,recovered.id);assert.equal(fingerprint(),after);if(error)throw error;
 });
 await check('Caja: fallo interno después de INSERT revierte saldo/ledger/outbox y la intención se recupera una vez',async()=>{
  const before=fingerprint(),key=randomUUID(),body={tipo:'INGRESO',monto:1.01,motivo:'Fallo post INSERT local',cuenta_contrapartida_id:fixture.income_account_id};let error;
  sql(`CREATE FUNCTION public.fail_cash_insert_local_566() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'LOCAL_CASH_AFTER_INSERT_FAILURE' USING ERRCODE='XX000'; END $$;CREATE TRIGGER fail_cash_insert_local_566 AFTER INSERT ON movimientos_caja FOR EACH ROW WHEN(NEW.tenant_id=${q(fixture.tenant)} AND NEW.monto=1.01) EXECUTE FUNCTION public.fail_cash_insert_local_566();`);
  try{await call('cajas/movimientos/manual/'+session.id,body,503,key);assert.equal(fingerprint(),before);}catch(failure){error=failure;}finally{sql('DROP TRIGGER fail_cash_insert_local_566 ON movimientos_caja;DROP FUNCTION public.fail_cash_insert_local_566();');}
  const recovered=await call('cajas/movimientos/manual/'+session.id,body,201,key);const after=fingerprint();assert.equal((await call('cajas/movimientos/manual/'+session.id,body,201,key)).id,recovered.id);assert.equal(fingerprint(),after);if(error)throw error;
 });
 for(const table of ['ventas_pos','retiros_caja','cambios_turno'])await check('Caja: precierre no declara validación exitosa cuando no puede leer '+table,async()=>{
  const before=fingerprint();let error;sql('REVOKE SELECT ON public.'+table+' FROM service_role;');
  try{await call('cajas/validar-precierre/'+session.id,undefined,503);}catch(failure){error=failure;}finally{sql('GRANT SELECT ON public.'+table+' TO service_role;');}
  await call('cajas/validar-precierre/'+session.id);assert.equal(fingerprint(),before);if(error)throw error;
 });
 await check('Caja: RPC de tolerancia indisponible bloquea el preview con 503 y conserva el arqueo',async()=>{
  const before=fingerprint();let error;const body={monto_contado:100,denominaciones:{billetes:{'100':1},monedas:{}}};
  sql('REVOKE EXECUTE ON FUNCTION public.resolver_tolerancia_cierre_caja_518(uuid,uuid) FROM service_role;');
  try{await call('cajas/validar-cierre/'+session.id,body,503);}catch(failure){error=failure;}finally{sql('GRANT EXECUTE ON FUNCTION public.resolver_tolerancia_cierre_caja_518(uuid,uuid) TO service_role;');}
  // PEN no ofrece 0,01 física en el formulario; el preview de infra se prueba con 100.
  await call('cajas/validar-cierre/'+session.id,body);assert.equal(fingerprint(),before);if(error)throw error;
 });
 await check('Caja: preview no sustituye el saldo por el fondo inicial cuando no puede leer movimientos',async()=>{
  const before=fingerprint(),body={monto_contado:100,denominaciones:{billetes:{'100':1},monedas:{}}};let error;
  sql('REVOKE SELECT ON public.movimientos_caja FROM service_role;');
  try{await call('cajas/validar-cierre/'+session.id,body,503);}catch(failure){error=failure;}finally{sql('GRANT SELECT ON public.movimientos_caja TO service_role;');}
  const recovered=await call('cajas/validar-cierre/'+session.id,body);assert.equal(recovered.saldo_teorico,104.01);assert.equal(fingerprint(),before);if(error)throw error;
 });
 const reportSession=sql(`SELECT sesion_caja_id FROM cortes_caja WHERE id=${q(fixture.first_cut_id)};`);
 for(const table of ['ventas_pos','ventas_pos_pagos'])await check('Caja: reporte fiscal/pagos indisponible responde 503 para '+table,async()=>{
  const before=fingerprint();let error;sql('REVOKE SELECT ON public.'+table+' FROM service_role;');
  try{await call('cajas/'+fixture.caja_id+'/corte-z?sesionId='+reportSession,undefined,503);}catch(failure){error=failure;}finally{sql('GRANT SELECT ON public.'+table+' TO service_role;');}
  await call('cajas/'+fixture.caja_id+'/corte-z?sesionId='+reportSession);assert.equal(fingerprint(),before);if(error)throw error;
 });
 await check('Caja: CSV conserva comillas/salto de línea y neutraliza fórmula del nombre de caja',async()=>{
  const caja=sql(`SELECT caja_id FROM sesiones_caja WHERE id=${q(reportSession)};`),name='=SUM(1,2), "caja"\nlocal';
  const edit=await fetch(api+'/api/cajas/'+caja,{method:'PUT',headers:{'content-type':'application/json','idempotency-key':randomUUID(),authorization:'Bearer '+token},body:JSON.stringify({nombre:name})});assert.equal(edit.status,200);await edit.arrayBuffer();
  const before=fingerprint(),response=await fetch(api+'/api/cajas/cortes/'+fixture.first_cut_id+'/csv',{headers:{authorization:'Bearer '+token}});assert.equal(response.status,200);
  const csv=await response.text();assert.ok(csv.includes('"SESION","CAJA","\'=SUM(1,2), ""caja""\nlocal"'),'La celda debe representar el nombre completo y desactivar la fórmula');assert.equal(fingerprint(),before);
 });
 await check('Caja: la sesión de la fase de fallos queda cerrada con su saldo esperado',async()=>{
  await call('cajas/sesiones/'+session.id+'/cierre-administrativo',{razon_cierre:'Fin del ensayo local de fallos de caja'});
  assert.equal(sql(`SELECT estado FROM sesiones_caja WHERE id=${q(session.id)};`),'CERRADA');
 });
}finally{fs.writeFileSync(path.join(output,'cash-faults.json'),JSON.stringify({success:scenarios.every(s=>s.passed),scenarios,requests,remoteWrites:false,complete_acceptance:false},null,2));}
