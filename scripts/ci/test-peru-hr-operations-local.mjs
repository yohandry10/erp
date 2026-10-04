import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {fetchWithLocalLoginRetry} from './peru-local-http.mjs';
// RRHH usado por la web y no cubierto por las fases existentes.
assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB,'1');assert.equal(process.env.PGHOST,'127.0.0.1');assert.equal(process.env.PGDATABASE,'erp_e2e');
const api=process.env.LOCAL_API_URL;assert.equal(new URL(api).hostname,'127.0.0.1');const output=process.env.LOCAL_INTEGRATED_OUTPUT_DIR;
const fixtureName='hr-ops';
const first=JSON.parse(fs.readFileSync(path.join(output,fixtureName+'-first-fixture.json'))),other=JSON.parse(fs.readFileSync(path.join(output,fixtureName+'-other-fixture.json')));
const sql=query=>execFileSync(process.env.PSQL_BIN,['-XqAt','-h','127.0.0.1','-p',process.env.PGPORT,'-U','postgres','-d','erp_e2e','-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8',windowsHide:true}).trim();
assert.equal(sql("SELECT current_database()||'|'||environment||'|'||project_ref FROM app.deployment_environment WHERE singleton;"),'erp_e2e|DEV|localerpephemeralqax');
const q=id=>{assert.match(id,/^[0-9a-f-]{36}$/i);return "'"+id+"'::uuid";};
let token,otherToken;const scenarios=[],requests=[];let success=false;
async function raw(endpoint,body,access=token,method=body===undefined?'GET':'POST',key=randomUUID()){
 const response=await fetchWithLocalLoginRetry(api+'/api/'+endpoint,{method,headers:{'content-type':'application/json',connection:'close','idempotency-key':key,...(access?{authorization:'Bearer '+access}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 const bytes=Buffer.from(await response.arrayBuffer());let value;const type=response.headers.get('content-type')||'';
 if(type.includes('json')){try{value=JSON.parse(bytes.toString());}catch{value=bytes.toString();}}else value=type.includes('pdf')?{pdfBytes:bytes.length,pdf:bytes.subarray(0,5).toString()}:bytes.toString();
 requests.push({method,endpoint:endpoint.replace(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/gi,':id').split('?')[0],status:response.status});
 return {status:response.status,body:value,data:value&&typeof value==='object'&&Object.hasOwn(value,'data')?value.data:value};
}
async function call(endpoint,body,status=body===undefined?200:201,access=token,method=body===undefined?'GET':'POST',key){
 const result=await raw(endpoint,body,access,method,key);assert.equal(result.status,status,method+' '+endpoint.split('?')[0]+': '+JSON.stringify(result.body).slice(0,400));return result.data;
}
async function check(scenario,action){try{const detail=await action();scenarios.push({scenario,passed:true,...(detail||{})});}catch(error){scenarios.push({scenario,passed:false,message:String(error.message).slice(0,900)});}}
const outage=async(table,action)=>{sql(`REVOKE SELECT ON public.${table} FROM service_role;`);try{return await action();}finally{sql(`GRANT SELECT ON public.${table} TO service_role;`);}};
const permissionIds=codes=>JSON.parse(sql(`SELECT coalesce(json_agg(id),'[]') FROM permisos WHERE tenant_id=${q(first.tenant)} AND codigo IN (${codes.map(c=>`'${c}'`).join(',')}) AND activo;`));
async function userWith(codes,label){
 const ids=permissionIds(codes);assert.equal(ids.length,codes.length,'Permisos '+codes.join(','));
 const role=await call('roles',{idempotency_key:randomUUID(),nombre:label+'-'+randomUUID().slice(0,4),permission_ids:ids});
 const email=label.toLowerCase()+'.'+randomUUID().slice(0,6)+'@local.test';
 await call('users',{nombre:label,email,password:'Rrhh-Local-2026-Only!',roles:[role.id],idempotency_key:randomUUID()});
 return (await call('auth/login',{email,password:'Rrhh-Local-2026-Only!'})).access_token;
}
try{
 token=(await call('auth/login',{email:first.email,password:'Cliente-Local-2026-Only!'})).access_token;
 otherToken=(await call('auth/login',{email:other.email,password:'Cliente-Local-2026-Only!'})).access_token;
 const today=sql(`SELECT app.hoy_tenant(${q(first.tenant)});`);const period=today.slice(0,7);
 const account=code=>sql(`SELECT id FROM plan_cuentas WHERE tenant_id=${q(first.tenant)} AND codigo='${code}' AND activo ORDER BY created_at,id LIMIT 1;`);
 const doc=()=>String(40000000+Math.floor(Math.random()*9999999));
 const employee=await call('rrhh/empleados',{nombres:'Trabajadora',apellidos:'Local RRHH',tipo_documento:'DNI',numero_documento:doc(),fecha_ingreso:period+'-01',puesto:'Operadora',tiene_hijos:false,cantidad_hijos:0,estado:'activo'});
 await call('rrhh/contratos',{empleado_id:employee.id,tipo_contrato:'indefinido',fecha_inicio:period+'-01',sueldo_bruto:1800,moneda:'PEN',regimen_pensionario:'ONP',jornada_laboral:'tiempo_completo',periodo_prueba_meses:3,estado:'vigente'});
 let payroll,detail,pagoId;

 await check('Planillas: borrador editable, listado y eliminación con intención',async()=>{
  payroll=await call('rrhh/planillas',{periodo:period,observaciones:'Planilla local',idempotency_key:randomUUID()});
  await call('rrhh/planillas/'+payroll.id,{observaciones:'Planilla local editada',idempotency_key:randomUUID()},200,token,'PUT');
  const list=await call('rrhh/planillas');assert.ok(JSON.stringify(list).includes('Planilla local editada'),'Edición no listada');
  assert.ok(!JSON.stringify(await call('rrhh/planillas',undefined,200,otherToken)).includes(payroll.id),'Planilla ajena listada');
  const prev=sql(`SELECT to_char((date_trunc('month',app.hoy_tenant(${q(first.tenant)}))-interval '1 month')::date,'YYYY-MM');`);
  const extra=await call('rrhh/planillas',{periodo:prev,observaciones:'Planilla a eliminar',idempotency_key:randomUUID()});
  assert.equal((await raw('rrhh/planillas/'+extra.id,undefined,otherToken,'DELETE')).status,404,'Eliminación ajena');
  const key=randomUUID();await call('rrhh/planillas/'+extra.id,undefined,200,token,'DELETE',key);
  const again=await raw('rrhh/planillas/'+extra.id,undefined,token,'DELETE',key);assert.ok([200,404].includes(again.status),'Reintento de eliminación '+again.status);
  assert.equal(sql(`SELECT count(*) FROM planillas WHERE id=${q(extra.id)} AND coalesce(estado,'') NOT IN ('ANULADA','ELIMINADA','anulada','eliminada');`),'0','La planilla eliminada sigue activa');
 });
 await check('Planillas: cálculo, aprobación por otro usuario, pago y trazas de pago',async()=>{
  assert.ok(payroll,'Sin planilla');
  await call('rrhh/planillas/'+payroll.id+'/calcular',{});
  const details=await call('rrhh/planillas/'+payroll.id+'/detalle');detail=details[0];assert.ok(detail,'Sin detalle');
  const checker=await userWith(['rrhh.access','rrhh.planillas.read','rrhh.planillas.approve'],'APROBADOR');
  await call('rrhh/planillas/'+payroll.id+'/aprobar',{},201,checker);
  const destinos=await call('rrhh/planillas/tesoreria/destinos');assert.ok(destinos,'Destinos de tesorería');
  const bank=await call('finanzas/bancos/cuentas',{nombre:'Banco planilla local',banco:'BANCO LOCAL',numero_cuenta:'LOCAL-RRHH-'+randomUUID().slice(0,6),moneda:'PEN',tipo_cuenta:'CORRIENTE',cuenta_contable_id:account('1041'),saldo:0});
  await call('finanzas/bancos/movimientos',{cuenta_bancaria_id:bank.id,cuenta_contrapartida_id:account('70'),tipo:'ABONO',monto:5000,moneda:'PEN',fecha:today,descripcion:'Fondos planilla',referencia:'FUND-RRHH',categoria:'OTRO_INGRESO',metodo_pago:'TRANSFERENCIA',idempotency_key:randomUUID()});
  const payBody={metodo_pago:'transferencia',idempotency_key:randomUUID(),cuenta_bancaria_id:bank.id,referencia:'PLANILLA-LOCAL'};
  await call('rrhh/planillas/'+payroll.id+'/pagar',payBody);await call('rrhh/planillas/'+payroll.id+'/pagar',payBody);
  const hist=await call('rrhh/planillas/'+payroll.id+'/historial-pagos');const histRows=Array.isArray(hist)?hist:hist.items??[];
  assert.equal(histRows.length,1,'El pago repetido no debe duplicar el historial: '+JSON.stringify(hist).slice(0,300));
  const pagos=await call('rrhh/pagos?periodo='+period);const list=Array.isArray(pagos)?pagos:pagos.items??pagos.data??[];
  const pago=list.find(p=>p.planilla_id===payroll.id||p.empleado_id===employee.id);assert.ok(pago,'Pagos sin la planilla: '+JSON.stringify(pagos).slice(0,300));pagoId=pago.id;
  const comprobante=await raw('rrhh/pagos/'+pagoId+'/comprobante');assert.equal(comprobante.status,200,'Comprobante '+comprobante.status);assert.equal(comprobante.body.pdf,'%PDF-','Comprobante no es PDF');
  const boleta=await raw('rrhh/empleados/'+employee.id+'/boleta-pago/'+period);assert.equal(boleta.status,200,'Boleta mensual '+boleta.status+' '+JSON.stringify(boleta.body).slice(0,200));
  assert.equal((await raw('rrhh/planillas/'+payroll.id+'/pagar-empleados',{metodo_pago:'transferencia'})).status>=400,true,'pagar-empleados heredado completó un pago');
 });
 await check('RRHH: sólo con rrhh.access no se leen sueldos, pagos ni boletas',async()=>{
  assert.ok(pagoId,'Sin pago previo');
  const limited=await userWith(['rrhh.access'],'ACCESO');
  const statuses={};
  for(const r of ['rrhh/planillas/'+payroll.id+'/historial-pagos','rrhh/pagos/'+pagoId+'/comprobante','rrhh/empleados/'+employee.id+'/boleta-pago/'+period,'rrhh/pagos','rrhh/planillas','rrhh/boleta/'+detail.id])statuses[r.replace(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/gi,':id')]=(await raw(r,undefined,limited)).status;
  assert.ok(Object.values(statuses).every(s=>s===403),'Datos de remuneración visibles con sólo rrhh.access: '+JSON.stringify(statuses));
 });
 await check('RRHH: otra empresa no ve historial, comprobante ni boleta',async()=>{
  assert.ok(pagoId,'Sin pago previo');
  for(const r of ['rrhh/planillas/'+payroll.id+'/historial-pagos','rrhh/pagos/'+pagoId+'/comprobante','rrhh/empleados/'+employee.id+'/boleta-pago/'+period]){
   const res=await raw(r,undefined,otherToken);assert.ok([403,404].includes(res.status)&&!JSON.stringify(res.body).includes('1800'),r+' ajeno '+res.status);
  }
 });
 await check('Asistencia: entrada y salida con intención, orden y listado del tenant',async()=>{
  const key=randomUUID();const entrada=await call('rrhh/asistencia/entrada/'+employee.id,{},201,token,'POST',key);
  const again=await raw('rrhh/asistencia/entrada/'+employee.id,{},token,'POST',key);assert.ok([200,201].includes(again.status),'Reintento de entrada '+again.status);
  assert.equal((again.data?.id??entrada.id),entrada.id,'El reintento creó otra entrada');
  const dup=await raw('rrhh/asistencia/entrada/'+employee.id,{});assert.ok([400,409].includes(dup.status),'Segunda entrada del día '+dup.status);
  // La salida exige ser posterior a la entrada: el fixture adelanta la entrada una hora.
  sql(`UPDATE asistencia SET hora_entrada=(hora_entrada::time - interval '1 hour')::time WHERE id=${q(entrada.id)};`);
  await call('rrhh/asistencia/salida/'+employee.id,{});
  const list=await call('rrhh/asistencia?empleado_id='+employee.id+'&fecha_desde='+today+'&fecha_hasta='+today);assert.ok(JSON.stringify(list).includes(employee.id),'Listado sin la asistencia');
  const foreignEntry=await raw('rrhh/asistencia/entrada/'+employee.id,{},otherToken);assert.ok([400,403,404].includes(foreignEntry.status),'Entrada ajena aceptada '+foreignEntry.status);
  assert.equal(sql(`SELECT count(*) FROM asistencia WHERE id_empleado=${q(employee.id)} AND tenant_id=${q(other.tenant)};`),'0','Entrada ajena persistida');
  assert.ok(!JSON.stringify(await call('rrhh/asistencia',undefined,200,otherToken)).includes(employee.id),'Asistencia ajena listada');
 });
 await check('Reclutamiento: vacante y candidato con intención, edición, estado y aislamiento',async()=>{
  const vk=randomUUID();const vac=await call('rrhh/vacantes',{titulo:'Vacante local',puesto_solicitado:'Vendedor'},201,token,'POST',vk);
  const vac2=await call('rrhh/vacantes',{titulo:'Vacante local',puesto_solicitado:'Vendedor'},201,token,'POST',vk);assert.equal(vac2.id,vac.id,'Reintento de vacante duplicó');
  const ck=randomUUID();const cand=await call('rrhh/candidatos',{nombres:'Candidata',apellidos:'Local',vacante_id:vac.id,email:'candidata.'+randomUUID().slice(0,6)+'@local.test'},201,token,'POST',ck);
  assert.equal((await call('rrhh/candidatos',{nombres:'Candidata',apellidos:'Local',vacante_id:vac.id,email:cand.email},201,token,'POST',ck)).id,cand.id,'Reintento de candidato duplicó');
  await call('rrhh/candidatos/'+cand.id,{nombres:'Candidata editada'},200,token,'PUT');
  await call('rrhh/candidatos/'+cand.id+'/estado',{estado:'entrevista',observaciones:'Pasa a entrevista'},200,token,'PUT');
  const list=await call('rrhh/candidatos?vacante_id='+vac.id);assert.ok(JSON.stringify(list).includes('Candidata editada'),'Edición no reflejada');
  const bad=await raw('rrhh/candidatos/'+cand.id+'/estado',{estado:'estado-inventado'},token,'PUT');assert.equal(bad.status,400,'Estado inválido '+bad.status);
  assert.ok([403,404].includes((await raw('rrhh/candidatos/'+cand.id,{nombres:'Intruso'},otherToken,'PUT')).status),'Edición ajena');
  assert.ok(!JSON.stringify(await call('rrhh/candidatos',undefined,200,otherToken)).includes(cand.id),'Candidato ajeno listado');
  assert.equal(sql(`SELECT nombres FROM candidatos WHERE id=${q(cand.id)};`),'Candidata editada');
 });
 await check('CTS: el listado de depósitos responde con el tenant',async()=>{await call('rrhh/cts/depositos?periodo='+period);});
 for(const [table,list] of [['planillas',['rrhh/planillas']],['rrhh_pagos',['rrhh/pagos']],['asistencia',['rrhh/asistencia']],['candidatos',['rrhh/candidatos']]])
  await check('RRHH: sin lectura de '+table+' la consulta responde 503',async()=>{
   const statuses={};await outage(table,async()=>{for(const r of list)statuses[r]=(await raw(r)).status;});
   assert.ok(Object.values(statuses).every(s=>s===503),JSON.stringify(statuses));
  });
 success=scenarios.every(s=>s.passed);
}catch(error){scenarios.push({scenario:'RRHH: preparación o dependencia',passed:false,message:String(error.message).slice(0,900)});}
finally{fs.writeFileSync(path.join(output,'hr-operations.json'),JSON.stringify({success,remoteWrites:false,scope:'RRHH API/DB local; sin aceptación integral',scenarios,requests},null,2));}
console.log(JSON.stringify({success,passed:scenarios.filter(s=>s.passed).length,failed:scenarios.filter(s=>!s.passed).map(s=>s.scenario)}));
