import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {fetchWithLocalLoginRetry} from './peru-local-http.mjs';
import {createRequire} from 'node:module';
import {setTimeout as delay} from 'node:timers/promises';
assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB,'1');assert.equal(process.env.PGHOST,'127.0.0.1');assert.equal(process.env.PGDATABASE,'erp_e2e');
const api=process.env.LOCAL_API_URL;assert.equal(new URL(api).hostname,'127.0.0.1');const output=process.env.LOCAL_INTEGRATED_OUTPUT_DIR;
const first=JSON.parse(fs.readFileSync(path.join(output,'cash-first-fixture.json'))),other=JSON.parse(fs.readFileSync(path.join(output,'cash-other-fixture.json')));
const sql=query=>execFileSync(process.env.PSQL_BIN,['-XqAt','-h','127.0.0.1','-p',process.env.PGPORT,'-U','postgres','-d','erp_e2e','-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8',windowsHide:true}).trim();
assert.equal(sql("SELECT current_database()||'|'||environment||'|'||project_ref FROM app.deployment_environment WHERE singleton;"),'erp_e2e|DEV|localerpephemeralqax');
const q=id=>{assert.match(id,/^[0-9a-f-]{36}$/i);return "'"+id+"'::uuid";};
let token,otherToken,caja,session,user,supervisor,options,success=false;const scenarios=[],requests=[];
async function raw(endpoint,body,access=token,key=randomUUID(),method=body===undefined?'GET':'POST'){
 let response;
 for(let attempt=0;attempt<3;attempt++){
  response=await fetchWithLocalLoginRetry(api+'/api/'+endpoint,{method,headers:{'content-type':'application/json',connection:'close',...(access?{authorization:'Bearer '+access}:{}),...(key===null?{}:{'idempotency-key':key})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
  if(response.status!==429 || attempt===2)break;
  const seconds=Number(response.headers.get('retry-after'));assert.ok(seconds>0&&seconds<=60,'Límite HTTP acotado');await response.arrayBuffer();await delay((seconds+1)*1000);
 }
 const bytes=Buffer.from(await response.arrayBuffer());let value;try{value=JSON.parse(bytes.toString());}catch{value=bytes.toString();}
 requests.push({method,endpoint:endpoint.replace(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/gi,':id').split('?')[0],status:response.status});
 return {status:response.status,body:value,data:Object.hasOwn(value??{},'data')?value.data:value,bytes,type:response.headers.get('content-type')};
}
async function call(endpoint,body,status=body===undefined?200:201,access=token,key=randomUUID(),method=body===undefined?'GET':'POST'){
 const result=await raw(endpoint,body,access,key,method);assert.equal(result.status,status,endpoint.split('?')[0]+': '+JSON.stringify(result.body));return result.data;
}
async function check(scenario,action){try{await action();scenarios.push({scenario,passed:true});}catch(error){scenarios.push({scenario,passed:false,message:error.message});}}
const fingerprint=()=>sql(`SELECT md5(jsonb_build_object('sessions',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM sesiones_caja t WHERE tenant_id=${q(first.tenant)}),'movements',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM movimientos_caja t WHERE tenant_id=${q(first.tenant)}),'events',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM outbox_events t WHERE tenant_id=${q(first.tenant)}),'cuts',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM cortes_caja t WHERE tenant_id=${q(first.tenant)}))::text);`);
const balance=async()=>Number((await call('cajas/saldo-esperado/'+session.id)).saldo);
const today=new Date().toISOString().slice(0,10);
try{
 token=(await call('auth/login',{email:first.email,password:'Cliente-Local-2026-Only!'})).access_token;
 otherToken=(await call('auth/login',{email:other.email,password:'Cliente-Local-2026-Only!'})).access_token;
 const forge=createRequire(path.resolve('apps/erp-api/package.json'))('node-forge');
 const keys=forge.pki.rsa.generateKeyPair(2048),cert=forge.pki.createCertificate();cert.publicKey=keys.publicKey;cert.serialNumber='08';cert.validity.notBefore=new Date(Date.now()-86400000);cert.validity.notAfter=new Date(Date.now()+365*86400000);
 const attrs=[{name:'commonName',value:'CERTIFICADO LOCAL '+first.ruc},{name:'countryName',value:'PE'},{name:'organizationName',value:'Ensayo caja ERP'},{type:'2.5.4.5',value:first.ruc}];cert.setSubject(attrs);cert.setIssuer(attrs);cert.sign(keys.privateKey,forge.md.sha256.create());
 const p12=forge.pkcs12.toPkcs12Asn1(keys.privateKey,[cert],'Clave-Caja-local',{algorithm:'3des'});
 await call('configuration/complete',{configuration:{ruc:first.ruc,pais:'PE',pais_id:1,razonSocial:'Empresa caja local configurada',direccion:'Origen local 123',ubigeo:'150101',tipo_empresa:'MICRO',regimen_tributario:'GENERAL',serie_factura:'F001',serie_boleta:'B001',serie_guia_remision:'T001',certificateBase64:Buffer.from(forge.asn1.toDer(p12).getBytes(),'binary').toString('base64'),certificatePassword:'Clave-Caja-local',sunat_environment:'homologacion'}});
 const warehouse=await call('inventario/almacenes',{idempotency_key:randomUUID(),codigo:'CAJA-LOCAL',nombre:'Almacén caja local',es_principal:true});
 const branch=await call('sucursales',{nombre:'Sucursal caja local',codigo:'CAJA-LOCAL',direccion:'Av. Local 123',ubigeo:'150101'});
 const roles=await call('roles'),admin=roles.find(role=>role.nombre==='ADMIN');assert.ok(admin);
 user=await call('users',{nombre:'Cajero entrante local',email:'cajero-entrante-local@example.test',password:'Caja-Entrante-Local-2026!',roles:[admin.id],idempotency_key:randomUUID()});
 supervisor=await call('users',{nombre:'Supervisor caja local',email:'supervisor-caja-local@example.test',password:'Caja-Supervisor-Local-2026!',roles:[admin.id],idempotency_key:randomUUID()});
 await check('Caja: alta, replay y edición persisten una caja; identidad cambiada no duplica',async()=>{
  const key=randomUUID(),body={nombre:'Caja local, "uno"',almacen_id:warehouse.id,sucursal_id:branch.id};caja=await call('cajas',body,201,token,key);
  assert.equal((await call('cajas',body,201,token,key)).id,caja.id);await call('cajas',{...body,nombre:'Otra caja'},400,token,key);
  const editKey=randomUUID(),edit={nombre:'Caja local editada',descripcion:'Caja API real local'};await call('cajas/'+caja.id,edit,200,token,editKey,'PUT');await call('cajas/'+caja.id,edit,200,token,editKey,'PUT');
  const list=await call('cajas');assert.equal(list.length,1);assert.equal(list[0].nombre,edit.nombre);
 });
 options=await call('cajas/opciones-contables');assert.equal(options.moneda_local,'PEN');assert.ok(options.cuenta_caja.id);
 const income=options.cuentas.find(c=>c.aplicable_a?.ingreso),expense=options.cuentas.find(c=>c.aplicable_a?.gasto),vault=options.cuentas.find(c=>c.aplicable_a?.boveda);assert.ok(income&&expense&&vault,'Contrapartidas disponibles para primer cliente');
 await check('Caja: apertura y consultas no cambian la sesión; segunda apertura rechaza sin autocierre',async()=>{
  session=await call('cajas/'+caja.id+'/apertura',{monto_inicio:100,moneda:'PEN',dispositivo:'caja-local-api'});assert.ok(session.id);assert.equal(await balance(),100);
  const before=fingerprint();await call('cajas/'+caja.id+'/apertura',{monto_inicio:100,moneda:'PEN'},400);assert.equal(fingerprint(),before);
  const sessions=await call('cajas/sesiones?estado=ABIERTA');assert.ok(sessions.some(s=>s.id===session.id));await call('cajas/movimientos/'+session.id);await call('cajas/validar-precierre/'+session.id);await call('cajas/'+caja.id+'/corte-z?sesionId='+session.id);assert.equal(fingerprint(),before);
 });
 await check('Caja: ingreso/gasto manual, ledger y replay conservan un solo movimiento y saldo',async()=>{
  for(const [tipo,monto,account]of [['INGRESO',40,income],['GASTO',10,expense]]){
   const key=randomUUID(),body={tipo,monto,motivo:'Movimiento caja local '+tipo,cuenta_contrapartida_id:account.id};const movement=await call('cajas/movimientos/manual/'+session.id,body,201,token,key);const before=fingerprint();assert.equal((await call('cajas/movimientos/manual/'+session.id,body,201,token,key)).id,movement.id);assert.equal(fingerprint(),before);
  }assert.equal(await balance(),130);
 });
 await check('Caja: contrapartida ausente, monto cero y clave ausente rechazan sin movimiento',async()=>{
  const before=fingerprint();await call('cajas/movimientos/manual/'+session.id,{tipo:'INGRESO',monto:1,motivo:'Inválido'},400);await call('cajas/movimientos/manual/'+session.id,{tipo:'GASTO',monto:0,motivo:'Inválido',cuenta_contrapartida_id:expense.id},400);await call('cajas/movimientos/manual/'+session.id,{tipo:'INGRESO',monto:1,motivo:'Sin clave',cuenta_contrapartida_id:income.id},400,token,null);assert.equal(fingerprint(),before);
 });
 await check('Caja: retiro a bóveda/replay conserva saldo; conciliación bancaria inaplicable rechaza sin efectos',async()=>{
  const key=randomUUID(),body={monto:20,motivo:'BOVEDA',motivo_detalle:'Bóveda local',cuenta_contrapartida_id:vault.id};const withdrawal=await call('cajas/retiros/'+session.id,body,201,token,key);const before=fingerprint();assert.equal((await call('cajas/retiros/'+session.id,body,201,token,key)).id,withdrawal.id);assert.equal(fingerprint(),before);assert.equal(await balance(),110);
  const reconcileKey=randomUUID(),reconcile={numero_operacion:'CAJA-LOCAL-001',fecha_conciliacion:today};const after=fingerprint();await call('cajas/retiros/'+withdrawal.id+'/conciliar',reconcile,400,token,reconcileKey);assert.equal(fingerprint(),after);assert.equal(await balance(),110);
 });
 await check('Caja: cambio de turno congela; movimiento rechaza y cancelar/replay descongela una vez',async()=>{
  const key=randomUUID(),change=await call('cajas/cambio-turno/iniciar/'+session.id,{usuario_entrante_id:user.id},201,token,key);assert.equal((await call('cajas/cambio-turno/iniciar/'+session.id,{usuario_entrante_id:user.id},201,token,key)).id,change.id);assert.equal(sql(`SELECT congelada FROM sesiones_caja WHERE id=${q(session.id)};`),'t');
  const before=fingerprint();await call('cajas/movimientos/manual/'+session.id,{tipo:'INGRESO',monto:1,motivo:'Caja congelada',cuenta_contrapartida_id:income.id},400);assert.equal(fingerprint(),before);
  const cancelKey=randomUUID();await call('cajas/cambio-turno/cancelar/'+change.id,{razon:'Cancelación local del cambio'},201,token,cancelKey);await call('cajas/cambio-turno/cancelar/'+change.id,{razon:'Cancelación local del cambio'},201,token,cancelKey);assert.equal(sql(`SELECT congelada FROM sesiones_caja WHERE id=${q(session.id)};`),'f');
 });
 await check('Caja: cambio completado transfiere responsabilidad, no inventa ingreso y congela confirmaciones como hashes',async()=>{
  const change=await call('cajas/cambio-turno/iniciar/'+session.id,{usuario_entrante_id:user.id});const incoming=(await call('auth/login',{email:'cajero-entrante-local@example.test',password:'Caja-Entrante-Local-2026!'})).access_token;
  const key=randomUUID(),body={monto_contado:110,denominaciones:{billetes:{'100':1,'10':1},monedas:{}},foto_arqueo:'evidencia-local-arqueo',confirmacion_saliente:'Confirmación saliente local',confirmacion_entrante:'Confirmación entrante local'};
  await call('cajas/cambio-turno/completar/'+change.id,body,201,incoming,key);const before=fingerprint();await call('cajas/cambio-turno/completar/'+change.id,body,201,incoming,key);assert.equal(fingerprint(),before);assert.equal(await balance(),110);assert.equal(sql(`SELECT cajero_id::text||'|'||congelada::text FROM sesiones_caja WHERE id=${q(session.id)};`),user.id+'|false');
  const changes=await call('cajas/sesiones/'+session.id+'/cambios-turno');assert.equal(changes.length,2);assert.ok(!JSON.stringify(changes).includes(body.confirmacion_saliente));
 });
 await check('Caja: PIN supervisor se registra/rota por intención sin exponer código ni hash',async()=>{
  const key=randomUUID(),pin='482963';const set=await call('cajas/supervisores/'+supervisor.id+'/pin',{pin},200,token,key,'PUT');const replay=await call('cajas/supervisores/'+supervisor.id+'/pin',{pin},200,token,key,'PUT');assert.equal(replay.idempotent,true);assert.equal(replay.pin_version,set.pin_version);assert.equal(replay.rotado_at,set.rotado_at);assert.ok(!/482963|pin_hash/.test(JSON.stringify(set)));
  await call('cajas/supervisores/'+supervisor.id+'/pin',{pin:'864297'},400,token,key,'PUT');const management=await call('cajas/supervisores-gestion-pin');assert.ok(Array.isArray(management));const enabled=await call('cajas/supervisores-autorizados/'+session.id);assert.ok(enabled.some(s=>s.id===supervisor.id));assert.ok(!/482963|pin_hash/.test(JSON.stringify(enabled)));
 });
 await check('Caja: arqueo inconsistente y diferencia sin autorización no cierran ni mutan',async()=>{
  const before=fingerprint();await call('cajas/validar-cierre/'+session.id,{monto_contado:110,denominaciones:{billetes:{'100':1},monedas:{}}},400);await call('cajas/cerrar/'+session.id,{monto_contado:109,denominaciones:{billetes:{'100':1},monedas:{'1':9}}},400);assert.equal(fingerprint(),before);
 });
 await check('Caja: cierre con supervisor distinto y PIN produce corte durable; replay no duplica',async()=>{
  const body={monto_contado:109,denominaciones:{billetes:{'100':1},monedas:{'1':9}},supervisor_id:supervisor.id,codigo_autorizacion:'482963',notas:'Cierre local con diferencia'};
  const closed=await call('cajas/cerrar/'+session.id,body);assert.ok(closed);const before=fingerprint();await call('cajas/cerrar/'+session.id,body);assert.equal(fingerprint(),before);assert.equal(sql(`SELECT estado FROM sesiones_caja WHERE id=${q(session.id)};`),'CERRADA');
 });
 await check('Caja: corte, filtros, CSV y PDF representan sesión cerrada; no producen efectos',async()=>{
  const cuts=await call('cajas/cortes?caja_id='+caja.id);assert.equal(cuts.length,1);const before=fingerprint();const detail=await call('cajas/cortes/'+cuts[0].id);assert.ok(detail);const csv=await raw('cajas/cortes/'+cuts[0].id+'/csv'),pdf=await raw('cajas/cortes/'+cuts[0].id+'/pdf');assert.equal(csv.status,200);assert.equal(pdf.status,200);assert.equal(pdf.bytes.subarray(0,5).toString(),'%PDF-');assert.match(pdf.bytes.toString('latin1'),/%%EOF/);fs.writeFileSync(path.join(output,'cash-cut.pdf'),pdf.bytes);fs.writeFileSync(path.join(output,'cash-cut.csv'),csv.bytes);assert.equal(fingerprint(),before);
 });
 await check('Caja: lector consulta pero alta/edición/manual/PIN/cierre requieren permisos',async()=>{
  const permission=sql(`SELECT id FROM permisos WHERE tenant_id=${q(first.tenant)} AND codigo='cajas.ver';`);q(permission);const role=await call('roles',{nombre:'LECTOR_CAJA_LOCAL',permission_ids:[permission],idempotency_key:randomUUID()});await call('users',{nombre:'Lector caja local',email:'lector-caja-local@example.test',password:'Lector-Caja-Local-2026!',roles:[role.id],idempotency_key:randomUUID()});const reader=(await call('auth/login',{email:'lector-caja-local@example.test',password:'Lector-Caja-Local-2026!'})).access_token;
  await call('cajas',undefined,200,reader);const before=fingerprint();await call('cajas',{nombre:'Caja prohibida',almacen_id:warehouse.id},403,reader);await call('cajas/'+caja.id,{nombre:'Cambio prohibido'},403,reader,randomUUID(),'PUT');await call('cajas/movimientos/manual/'+session.id,{tipo:'INGRESO',monto:1,motivo:'Prohibido',cuenta_contrapartida_id:income.id},403,reader);await call('cajas/supervisores/'+supervisor.id+'/pin',{pin:'753194'},403,reader,randomUUID(),'PUT');assert.equal(fingerprint(),before);
 });
 await check('Caja: empresa ajena no lista cajas/sesiones/cortes ni obtiene movimientos o reporte',async()=>{
  assert.equal((await call('cajas',undefined,200,otherToken)).length,0);assert.equal((await call('cajas/sesiones',undefined,200,otherToken)).length,0);assert.equal((await call('cajas/cortes',undefined,200,otherToken)).length,0);
  const before=fingerprint();const validation=await call('cajas/validar-precierre/'+session.id,undefined,200,otherToken);assert.equal(validation.valido,false);assert.deepEqual(validation.errores,['Sesión de caja no encontrada']);assert.equal(fingerprint(),before);
 });
 await check('Caja: ID inexistente/mal formado y fecha inválida no aparentan datos ni causan 500',async()=>{
  await call('cajas/cortes/'+randomUUID(),undefined,404);await call('cajas/cortes/no-es-uuid',undefined,404);await call('cajas/sesiones?fecha_desde=2026-02-31',undefined,400);
 });
 await check('Caja: filtros desde/hasta incluyen el día local completo para sesiones y cortes',async()=>{
  const day=sql(`SELECT (fecha_apertura AT TIME ZONE 'America/Lima')::date FROM sesiones_caja WHERE id=${q(session.id)};`);
  const before=fingerprint(),cuts=await call('cajas/cortes?caja_id='+caja.id);
  assert.ok((await call('cajas/sesiones?fecha_desde='+day+'&fecha_hasta='+day)).some(s=>s.id===session.id),'La sesión del día debe estar incluida');
  assert.ok((await call('cajas/cortes?fecha_desde='+day+'&fecha_hasta='+day+'&caja_id='+caja.id)).some(c=>c.id===cuts[0].id),'El corte del día debe estar incluido');
  await call('cajas/cortes?fecha_desde=2026-10-04&fecha_hasta=2026-10-03',undefined,400);
  assert.equal(fingerprint(),before);
 });
 const cutId=(await call('cajas/cortes?caja_id='+caja.id))[0].id;
 await check('Caja: reporte de cierre incluye todos los retiros durables y sus turnos',async()=>{
  const report=await call('cajas/'+caja.id+'/corte-z?sesionId='+session.id);
  const count=Number(sql(`SELECT count(*) FROM retiros_caja WHERE tenant_id=${q(first.tenant)} AND sesion_caja_id=${q(session.id)};`));
  assert.ok(count>0);assert.equal(report.retiros.length,count);assert.equal(report.cambios_turno.length,2);
 });
 for(const [table,endpoints] of [
  ['sesiones_caja',['cajas/sesiones','cajas/validar-precierre/'+session.id,'cajas/'+caja.id+'/corte-z?sesionId='+session.id]],
  ['movimientos_caja',['cajas/movimientos/'+session.id,'cajas/saldo-esperado/'+session.id]],
  ['cortes_caja',['cajas/cortes','cajas/cortes/'+cutId,'cajas/cortes/'+cutId+'/pdf']],
 ]){
  await check('Caja: lectura indisponible de '+table+' devuelve 503 y se recupera sin mutación',async()=>{
   const before=fingerprint();let failure;
   sql('REVOKE SELECT ON public.'+table+' FROM service_role;');
   try{const statuses=[];for(const endpoint of endpoints){const result=await raw(endpoint);statuses.push([endpoint.split('?')[0],result.status]);}assert.ok(statuses.every(([,status])=>status===503),JSON.stringify(statuses));}catch(error){failure=error;}finally{sql('GRANT SELECT ON public.'+table+' TO service_role;');}
   for(const endpoint of endpoints)await call(endpoint,undefined,200);
   assert.equal(fingerprint(),before);if(failure)throw failure;
  });
 }
 await check('Caja: depósito bancario y conciliación positiva son idempotentes en caja y banco',async()=>{
  const accounts=await call('contabilidad/plan-cuentas');assert.ok(Array.isArray(accounts));const account=accounts.find(a=>a.codigo==='1041');assert.ok(account);
  const bank=await call('finanzas/bancos/cuentas',{cuenta_contable_id:account.id,nombre:'Banco caja local',banco:'BANCO LOCAL',numero_cuenta:'LOCAL-CAJA-001',moneda:'PEN',tipo_cuenta:'CORRIENTE',saldo:0});
  const newCaja=await call('cajas',{nombre:'Caja depósito',almacen_id:warehouse.id,sucursal_id:branch.id}),bankSession=await call('cajas/'+newCaja.id+'/apertura',{monto_inicio:100,moneda:'PEN'});
  const key=randomUUID(),body={monto:15,motivo:'DEPOSITO_BANCARIO',motivo_detalle:'Depósito local',cuenta_bancaria_id:bank.id,foto_comprobante:'comprobante-deposito-local'};const withdrawal=await call('cajas/retiros/'+bankSession.id,body,201,token,key);
  const after=fingerprint();assert.equal((await call('cajas/retiros/'+bankSession.id,body,201,token,key)).id,withdrawal.id);assert.equal(fingerprint(),after);
  assert.equal(Number((await call('cajas/saldo-esperado/'+bankSession.id)).saldo),85);assert.equal(Number((await call('finanzas/bancos/cuentas/'+bank.id)).saldo),15);
  const reconcile={numero_operacion:'CAJA-LOCAL-BANCO-001',fecha_conciliacion:today},reconcileKey=randomUUID();await call('cajas/retiros/'+withdrawal.id+'/conciliar',reconcile,201,token,reconcileKey);const reconciled=fingerprint();await call('cajas/retiros/'+withdrawal.id+'/conciliar',reconcile,201,token,reconcileKey);assert.equal(fingerprint(),reconciled);
  assert.equal(sql(`SELECT estado_conciliacion FROM retiros_caja WHERE id=${q(withdrawal.id)};`),'CONCILIADO');
  await call('cajas/'+newCaja.id+'/cierre',{sesion_id:bankSession.id,monto_cierre:85,moneda:'PEN',notas:'Cierre caja depósito'});assert.equal(sql(`SELECT estado FROM sesiones_caja WHERE id=${q(bankSession.id)};`),'CERRADA');
 });
 await check('Caja: cierre básico admite el alias monto_contado y sesionId ofrecido por el controlador',async()=>{
  const aliasCaja=await call('cajas',{nombre:'Caja alias cierre',almacen_id:warehouse.id,sucursal_id:branch.id}),aliasSession=await call('cajas/'+aliasCaja.id+'/apertura',{monto_inicio:10,moneda:'PEN'});
  try{await call('cajas/'+aliasCaja.id+'/cierre',{sesionId:aliasSession.id,monto_contado:10,moneda:'PEN',notas:'Alias de cierre'});assert.equal(sql(`SELECT estado FROM sesiones_caja WHERE id=${q(aliasSession.id)};`),'CERRADA');}finally{if(sql(`SELECT estado FROM sesiones_caja WHERE id=${q(aliasSession.id)};`)==='ABIERTA')await call('cajas/'+aliasCaja.id+'/cierre',{sesion_id:aliasSession.id,monto_cierre:10,moneda:'PEN',notas:'Limpieza explícita del ensayo alias'});}
 });
 await check('Caja: cierre administrativo exige razón y es durable sin duplicar efectos al reintentar',async()=>{
  const adminCaja=await call('cajas',{nombre:'Caja cierre administrativo',almacen_id:warehouse.id,sucursal_id:branch.id}),adminSession=await call('cajas/'+adminCaja.id+'/apertura',{monto_inicio:5,moneda:'PEN'});
  const before=fingerprint();await call('cajas/sesiones/'+adminSession.id+'/cierre-administrativo',{},400);assert.equal(fingerprint(),before);
  const body={razon_cierre:'Recuperación de sesión por incidente local controlado'};await call('cajas/sesiones/'+adminSession.id+'/cierre-administrativo',body);const after=fingerprint();await call('cajas/sesiones/'+adminSession.id+'/cierre-administrativo',body);assert.equal(fingerprint(),after);assert.equal(sql(`SELECT estado FROM sesiones_caja WHERE id=${q(adminSession.id)};`),'CERRADA');
 });
 await check('Caja: worker real registra asientos balanceados y el segundo consumo no los duplica',async()=>{
  const apiDirectory=path.resolve('apps/erp-api'),requireApi=createRequire(path.join(apiDirectory,'package.json'));
  const consume=label=>fs.writeFileSync(path.join(output,label+'.log'),execFileSync(process.execPath,[requireApi.resolve('ts-node/dist/bin.js'),'--transpile-only','tests/e2e/helpers/local-api-harness.ts','--accounting-drain'],{cwd:apiDirectory,env:process.env,encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:5000000}));
  consume('cash-accounting-first');
  const state=()=>sql(`SELECT md5(coalesce(jsonb_agg(to_jsonb(a) ORDER BY id)::text,'')) FROM asientos_contables a WHERE tenant_id=${q(first.tenant)};`);
  assert.ok(Number(sql(`SELECT count(*) FROM asientos_contables WHERE tenant_id=${q(first.tenant)};`))>=4,'Ingresos, gastos, retiros y faltante generan asientos');
  const postings=JSON.parse(sql(`SELECT coalesce(jsonb_agg(jsonb_build_object('event_type',e.event_type,'status',e.status,'difference',coalesce(e.payload->>'diferencia',e.payload->>'diferenciaOrigen','0'),'entries',(SELECT count(*) FROM asientos_contables a WHERE a.source_event_id=e.event_id),'balanced',(SELECT bool_and(a.total_debe=a.total_haber AND a.estado='CONFIRMADO') FROM asientos_contables a WHERE a.source_event_id=e.event_id)) ORDER BY e.created_at),'[]') FROM outbox_events e WHERE tenant_id=${q(first.tenant)} AND (event_type LIKE 'caja.%' OR event_type LIKE 'banco.%');`));
  assert.ok(postings.length>=4);for(const posting of postings){const neutral=['caja.cambio_turno.completado','caja.cerrada'].includes(posting.event_type)&&Math.abs(Number(posting.difference))<0.01;assert.equal(posting.status,'completed');assert.equal(posting.entries,neutral?0:1);if(!neutral)assert.equal(posting.balanced,true);}
  fs.writeFileSync(path.join(output,'cash-accounting.json'),JSON.stringify({success:true,postings,remoteWrites:false,complete_acceptance:false},null,2));
  const before=state();consume('cash-accounting-retry');assert.equal(state(),before);
 });
 const uiCaja=await call('cajas',{nombre:'Caja navegador local',almacen_id:warehouse.id,sucursal_id:branch.id});
 const faultsCaja=await call('cajas',{nombre:'Caja fallos local',almacen_id:warehouse.id,sucursal_id:branch.id});
 fs.writeFileSync(path.join(output,'cash-browser-fixture.json'),JSON.stringify({email:first.email,tenant:first.tenant,caja_id:uiCaja.id,caja_name:uiCaja.nombre,faults_caja_id:faultsCaja.id,income_account_id:income.id,expense_account_id:expense.id,vault_account_id:vault.id,incoming_user_id:user.id,supervisor_id:supervisor.id,first_cut_id:cutId}));
 success=scenarios.every(s=>s.passed);
}catch(error){scenarios.push({scenario:'Caja: preparación o dependencia',passed:false,message:error.message});}
finally{fs.writeFileSync(path.join(output,'cash-operations.json'),JSON.stringify({success,remoteWrites:false,scope:'Caja API/DB real local; sin aceptación integral',scenarios,requests},null,2));}
console.log(JSON.stringify({success,passed:scenarios.filter(s=>s.passed).length,failed:scenarios.filter(s=>!s.passed).map(s=>s.scenario),complete_acceptance:false}));
