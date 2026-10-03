import {fetchWithLocalLoginRetry} from './peru-local-http.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB,'1');
assert.equal(process.env.PGHOST,'127.0.0.1');assert.equal(process.env.PGDATABASE,'erp_e2e');
const api=process.env.LOCAL_API_URL;assert.equal(new URL(api).hostname,'127.0.0.1');
const output=process.env.LOCAL_INTEGRATED_OUTPUT_DIR;
const fixture=JSON.parse(fs.readFileSync(path.join(output,'hr-financial-fixture.json')));
const sql=query=>execFileSync(process.env.PSQL_BIN||'psql',['-XqAt','-h','127.0.0.1','-p',process.env.PGPORT,'-U','postgres','-d','erp_e2e','-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8',windowsHide:true}).trim();
assert.equal(sql('SELECT current_database();'),'erp_e2e');
const q=id=>{assert.match(id,/^[0-9a-f-]{36}$/i);return `'${id}'::uuid`;};
const tenant=fixture.tenant;const scenarios=[];const requests=[];
const proof={success:false,local_only:true,remoteWrites:false,scope:'RRHH financiero Perú, primer ADMIN: CTS/liquidación, segregación, banco y asientos locales; no aceptación normativa externa',scenarios,requests};
let token;
async function call(endpoint,body,expected=body===undefined?200:201,headers={},method=body===undefined?'GET':'POST') {
 const response=await fetchWithLocalLoginRetry(`${api}/api/${endpoint}`,{method,headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`} : {}),'idempotency-key':randomUUID(),...headers},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)},()=>requests.push({method,endpoint:'auth/login',status:429}));
 const value=await response.json();requests.push({method,endpoint:endpoint.replace(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/gi,':id'),status:response.status});
 assert.equal(response.status,expected,`${endpoint}: ${value.message||JSON.stringify(value)}`);return value.data??value;
}
const pass=scenario=>scenarios.push({scenario,passed:true});
const snapshot=()=>sql(`SELECT md5(jsonb_build_object('liq',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM liquidaciones x WHERE tenant_id=${q(tenant)}),'cts',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM depositos_cts x WHERE tenant_id=${q(tenant)}),'pay',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM pagos_liquidaciones x WHERE tenant_id=${q(tenant)}),'bank',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM cuentas_bancarias x WHERE tenant_id=${q(tenant)}))::text);`);
const cents=value=>Math.round(Number(value)*100);
try {
 const login=await call('auth/login',{email:fixture.email,password:'Cliente-Local-2026-Only!'});token=login.access_token;
 assert.equal(login.user.tenant_id,tenant);assert.equal(login.user.is_super_admin,false);
 const roles=await call('roles');const admin=roles.find(row=>row.nombre==='ADMIN');assert.ok(admin);
 await call('users',{nombre:'Aprobador RRHH local',email:'checker-financial-hr@example.test',password:'Aprobador-RRHH-2026!',roles:[admin.id],idempotency_key:randomUUID()});
 const checker=await call('auth/login',{email:'checker-financial-hr@example.test',password:'Aprobador-RRHH-2026!'});
 const checkerHeaders={authorization:`Bearer ${checker.access_token}`};
 const other=await call('auth/login',{email:'peru-integrated-2@example.test',password:'Local-Peru-2026-Only!'});
 const foreign={authorization:`Bearer ${other.access_token}`};
 const accounts=await call('contabilidad/plan-cuentas');
 const account=code=>{const row=accounts.find(x=>x.codigo===code&&x.activo);assert.ok(row,code);return row.id;};
 const bank=await call('finanzas/bancos/cuentas',{nombre:'Banco RRHH local',banco:'BANCO LOCAL',numero_cuenta:'LOCAL-RRHH',moneda:'PEN',tipo_cuenta:'CORRIENTE',cuenta_contable_id:account('1041'),saldo:0});
 await call('finanzas/bancos/movimientos',{cuenta_bancaria_id:bank.id,cuenta_contrapartida_id:account('70'),tipo:'ABONO',monto:10000,moneda:'PEN',fecha:'2026-05-01',descripcion:'Fondo RRHH local',referencia:'FUND-HR',categoria:'OTRO_INGRESO',metodo_pago:'TRANSFERENCIA',idempotency_key:randomUUID()});
 const employees=[];
 for(const [index,document] of ['98765321','98765322'].entries()) {
  const employee=await call('rrhh/empleados',{nombres:`Trabajador ${index+1}`,apellidos:'Local financiero',tipo_documento:'DNI',numero_documento:document,fecha_ingreso:'2025-11-01',puesto:'Operador',tiene_hijos:false,cantidad_hijos:0,estado:'activo'});
  await call('rrhh/contratos',{empleado_id:employee.id,tipo_contrato:'indefinido',fecha_inicio:'2025-11-01',sueldo_bruto:1500,moneda:'PEN',regimen_pensionario:'ONP',jornada_laboral:'tiempo_completo',periodo_prueba_meses:3,estado:'vigente'});
  employees.push(employee);
 }
 const beforeCts=snapshot();await call('rrhh/cts/depositos',{periodo:'2026-06'},400);assert.equal(snapshot(),beforeCts);
 const cts=await call('rrhh/cts/depositos',{periodo:'2026-05'});assert.equal(cts.depositos.length,2);
 const a=cts.depositos.find(row=>row.empleado_id===employees[0].id);const b=cts.depositos.find(row=>row.empleado_id===employees[1].id);
 assert.equal(cents(a.monto),87500);assert.equal(cents(b.monto),87500);
 const repeated=await call('rrhh/cts/depositos',{periodo:'2026-05'});assert.deepEqual(repeated.depositos.map(x=>x.id).sort(),cts.depositos.map(x=>x.id).sort());
 pass('CTS: semestre inválido rechazado, dos cálculos 875 persistidos y recálculo sin duplicar');
 const depositBody={cuenta_bancaria_id:bank.id,referencia:'CTS-HR-LOCAL',fecha_deposito:'2026-05-15'};
 const beforeDeposit=snapshot();await call(`rrhh/cts/depositos/${a.id}/depositar`,depositBody,403);assert.equal(snapshot(),beforeDeposit);
 await call(`rrhh/cts/depositos/${a.id}/depositar`,depositBody,201,checkerHeaders);
 const afterDeposit=snapshot();await call(`rrhh/cts/depositos/${a.id}/depositar`,depositBody,201,checkerHeaders);assert.equal(snapshot(),afterDeposit);
 assert.equal(sql(`SELECT estado FROM depositos_cts WHERE id=${q(a.id)};`),'DEPOSITADO');
 assert.equal(cents((await call(`finanzas/bancos/cuentas/${bank.id}`)).saldo),912500);
 await call('rrhh/cts/depositos',{periodo:'2026-05'},409);
 assert.equal(snapshot(),afterDeposit);
 assert.equal(sql(`SELECT estado||':'||monto::text FROM depositos_cts WHERE id=${q(a.id)};`),'DEPOSITADO:875.00');
 pass('CTS: depositante distinto, banco debitado, replay y recálculo rechazado conservan depósito realizado');
 const liquidationBody={motivo_terminacion:'renuncia',fecha_terminacion:'2026-09-30'};
 const liquidation=await call(`rrhh/empleados/${employees[1].id}/liquidacion`,liquidationBody);q(liquidation.id);
 assert.equal((await call(`rrhh/empleados/${employees[1].id}/liquidacion`,liquidationBody)).id,liquidation.id);
 assert.equal(sql(`SELECT estado FROM empleados WHERE id=${q(employees[1].id)};`),'activo');
 assert.equal(cents(liquidation.metadata.monto_cts_semestres_pendientes),87500);
 const frozenTotal=cents(liquidation.total_liquidacion);assert.ok(frozenTotal>87500);
 const base=`rrhh/liquidaciones/${liquidation.id}`;
 const beforeConfirm=snapshot();await call(`${base}/confirmar`,{},403);assert.equal(snapshot(),beforeConfirm);
 await call(`${base}/confirmar`,{},201,checkerHeaders);
 const afterConfirm=snapshot();await call(`${base}/confirmar`,{},201,checkerHeaders);assert.equal(snapshot(),afterConfirm);
 assert.equal(sql(`SELECT estado FROM empleados WHERE id=${q(employees[1].id)};`),'inactivo');
 assert.equal(sql(`SELECT estado FROM contratos WHERE empleado_id=${q(employees[1].id)};`),'terminado');
 assert.equal(sql(`SELECT estado FROM depositos_cts WHERE id=${q(b.id)};`),'ANULADO');
 await call(`rrhh/cts/depositos/${b.id}/depositar`,{...depositBody,referencia:'CTS-CONSUMIDA'},409,checkerHeaders);
 assert.equal(snapshot(),afterConfirm);
 pass('Liquidación: cálculo/replay sin cese; confirmación distinta termina contrato y consume CTS pendiente una sola vez');
 const payment={metodo_pago:'transferencia',cuenta_bancaria_id:bank.id,referencia:'LIQ-HR-LOCAL',fecha_pago:'2026-09-30',idempotency_key:randomUUID()};
 await call(`${base}/pagar`,payment,403,checkerHeaders);assert.equal(snapshot(),afterConfirm);
 await call(`${base}/pagar`,{...payment,metodo_pago:'efectivo'},409);assert.equal(snapshot(),afterConfirm);
 await call(`${base}/pagar`,payment);
 const paid=snapshot();await call(`${base}/pagar`,payment);assert.equal(snapshot(),paid);
 assert.equal(sql(`SELECT estado FROM liquidaciones WHERE id=${q(liquidation.id)};`),'pagada');
 assert.equal(Number(sql(`SELECT count(*) FROM pagos_liquidaciones WHERE liquidacion_id=${q(liquidation.id)} AND estado='APLICADO';`)),1);
 assert.equal(cents((await call(`finanzas/bancos/cuentas/${bank.id}`)).saldo),912500-frozenTotal);
 pass('Liquidación: pagador distinto, efectivo bloqueado, transferencia completa y replay conservan banco/pago únicos');
 await call(`${base}/pago/revertir`,{motivo:'Reversa local'},403);assert.equal(snapshot(),paid);
 await call(`${base}/pago/revertir`,{motivo:'Reversa local'},201,checkerHeaders);
 const reversed=snapshot();await call(`${base}/pago/revertir`,{motivo:'Reversa local'},201,checkerHeaders);assert.equal(snapshot(),reversed);
 assert.equal(sql(`SELECT estado FROM liquidaciones WHERE id=${q(liquidation.id)};`),'aprobada');
 assert.equal(cents((await call(`finanzas/bancos/cuentas/${bank.id}`)).saldo),912500);
 assert.equal(Number(sql(`SELECT count(*) FROM pagos_liquidaciones WHERE liquidacion_id=${q(liquidation.id)} AND estado='REVERTIDO';`)),1);
 pass('Liquidación: reversor distinto recupera obligación y banco exactos, preserva pago original y replay sin duplicar');
 for(const endpoint of [`${base}/confirmar`,`${base}/pagar`,`${base}/pago/revertir`,`rrhh/cts/depositos/${a.id}/depositar`]) {
  const body=endpoint.endsWith('/pagar')?payment:endpoint.endsWith('/revertir')?{motivo:'Ajena'}:endpoint.endsWith('/depositar')?depositBody:{};
  await call(endpoint,body,404,foreign);assert.equal(snapshot(),reversed);
 }
 const foreignRows=await call('rrhh/liquidaciones',undefined,200,foreign);assert.ok(!foreignRows.some(x=>x.id===liquidation.id));
 pass('RRHH financiero: confirmación, pago, reversa y depósito ajenos 404 sin mutar; consulta aislada');
 const apiDirectory=path.resolve('apps/erp-api');const require=createRequire(path.join(apiDirectory,'package.json'));
 fs.writeFileSync(path.join(output,'hr-financial-accounting.log'),execFileSync(process.execPath,[require.resolve('ts-node/dist/bin.js'),'--transpile-only','tests/e2e/helpers/local-api-harness.ts','--accounting-once'],{cwd:apiDirectory,env:process.env,encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:5000000}));
 const postings=JSON.parse(sql(`SELECT coalesce(jsonb_agg(jsonb_build_object('event_type',e.event_type,'status',e.status,'entries',(SELECT count(*) FROM asientos_contables a WHERE a.source_event_id=e.event_id),'balanced',(SELECT bool_and(a.total_debe=a.total_haber AND a.estado='CONFIRMADO') FROM asientos_contables a WHERE a.source_event_id=e.event_id)) ORDER BY e.created_at),'[]') FROM outbox_events e WHERE tenant_id=${q(tenant)} AND event_type IN ('banco.movimiento.registrado','cts.depositado','liquidacion.aprobada','liquidacion.pagada','liquidacion.pago.revertido');`));
 assert.equal(postings.length,5,JSON.stringify(postings));
 for(const row of postings) {assert.equal(row.status,'completed',JSON.stringify(row));assert.equal(row.entries,1,JSON.stringify(row));assert.equal(row.balanced,true,JSON.stringify(row));}
 proof.postings=postings;proof.liquidation_total_cents=frozenTotal;
 pass('RRHH financiero: fondo, CTS, devengo, pago y reversa con un asiento confirmado cuadrado por evento');
 fs.writeFileSync(path.join(output,'hr-financial-fixture.json'),JSON.stringify({...fixture,
  liquidation_id:liquidation.id,bank_id:bank.id,employee_id:employees[1].id,total_cents:frozenTotal,
  checker_email:'checker-financial-hr@example.test'}));
 proof.success=true;
} finally {proof.checkedAt=new Date().toISOString();fs.writeFileSync(path.join(output,'hr-financial.json'),JSON.stringify(proof,null,2));}
console.log(JSON.stringify({success:proof.success,scenarios:scenarios.length,requests:requests.length,remoteWrites:false}));
