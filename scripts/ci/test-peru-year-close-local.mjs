import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB, '1');
assert.equal(process.env.PGDATABASE, 'erp_e2e');
assert.equal(process.env.PGHOST, '127.0.0.1');
const api = process.env.LOCAL_API_URL;
assert.equal(new URL(api).hostname, '127.0.0.1');
const sql = query => execFileSync(process.env.PSQL_BIN || 'psql', ['-X','-qAt','-h','127.0.0.1','-p',process.env.PGPORT,
  '-U','postgres','-d','erp_e2e','-v','ON_ERROR_STOP=1','-c',query], {encoding:'utf8',windowsHide:true}).trim();
assert.equal(sql('SELECT current_database();'), 'erp_e2e');
const fixture=JSON.parse(fs.readFileSync(path.join(process.env.LOCAL_INTEGRATED_OUTPUT_DIR,'annual-fixture.json')));
const email=fixture.email;
let token;
const requests = [];
async function call(endpoint, body, expected = body === undefined ? 200 : 201, headers = {}, method = body === undefined ? 'GET' : 'POST') {
  const result = await fetch(`${api}/api/${endpoint}`, { method,
    headers: {'content-type':'application/json',...(token ? {authorization:`Bearer ${token}`} : {}),'idempotency-key':randomUUID(),...headers},
    body:body === undefined ? undefined : JSON.stringify(body) });
  const value = await result.json();
  requests.push({ method, endpoint: endpoint.replace(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/gi, ':id'), status: result.status });
  assert.equal(result.status, expected, `${endpoint}: ${JSON.stringify(value)}`);
  return value.data ?? value;
}
const login = await call('auth/login', { email, password:'Cliente-Local-2026-Only!' });
token = login.access_token;
assert.ok(token);
const tenant = login.user.tenant_id;
assert.match(tenant,/^[0-9a-f-]{36}$/i);
const clientToken = token;
const actor = sql("SELECT id FROM usuarios_sistema WHERE email='peru-integrated-restricted-1@example.test' AND NOT is_super_admin;");
assert.match(actor,/^[0-9a-f-]{36}$/i);
const year = Number(sql(`SELECT extract(year FROM app.hoy_tenant('${tenant}'::uuid))::integer;`)) - 1;
const date = `${year}-12-31`;
const entrySnapshot = () => sql(`SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY id),'[]') FROM asientos_contables a WHERE tenant_id='${tenant}'::uuid AND extract(year from fecha)=${year};`);
const cents = value => Math.round(Number(value)*100);
const scenarios = [];
try {
  sql(`UPDATE usuarios_sistema SET is_super_admin=true WHERE id='${actor}'::uuid;`);
  const admin = await call('auth/login',{email:'peru-integrated-restricted-1@example.test',password:'Local-Peru-2026-Only!'});
  token = admin.access_token;
  const platformToken = (await call('auth/switch-tenant',{targetTenantId:tenant})).access_token;
  token = platformToken;
  token = clientToken;
  const period = await call('contabilidad/periodos', {anio:year,mes:12});
  const accounts = await call('contabilidad/plan-cuentas');
  const account = code => { const value = accounts.find(row => row.codigo === code); assert.ok(value,code); return value.id; };
  assert.equal(accounts.find(row => row.codigo==='59').tipo_cuenta, 'PATRIMONIO');
  assert.equal(accounts.find(row => row.codigo==='89').tipo_cuenta, 'ORDEN');
  const post = async (fecha, code, value, expense = false) => call('contabilidad/asiento-contable', {
    fecha,concepto:`Ejercicio local ${fecha}`,estado:'CONFIRMADO',detalles: expense ? [
      {cuenta_id:account(code),debe:value,haber:0,concepto:'Gasto'}, {cuenta_id:account('1041'),debe:0,haber:value,concepto:'Banco'},
    ] : [{cuenta_id:account('1041'),debe:value,haber:0,concepto:'Banco'}, {cuenta_id:account(code),debe:0,haber:value,concepto:'Ingreso'}],
  });
  await post(date,'70',30);
  await post(date,'63',5,true);
  const balance = async (anio,mes) => call(`contabilidad/estados/balance-general?anio=${anio}&mes=${mes}`);
  const results = async (anio,mes) => call(`contabilidad/estados/estado-resultados?anio=${anio}&mes=${mes}`);
  const before = await balance(year,12);
  assert.equal(before.validacion.cuadrado,true);
  assert.equal(cents(before.patrimonio.resultado_ejercicio),2500);
  const profit = await call(`contabilidad/periodos/${period.id}/cerrar`,{});
  assert.equal(profit.estado,'CERRADO');
  assert.equal((await call(`contabilidad/periodos/${period.id}/cerrar`,{})).id,period.id);
  const annual = () => JSON.parse(sql(`SELECT json_agg(json_build_object('id',id,'estado',estado,'debe',total_debe,'haber',total_haber)) FROM asientos_contables
    WHERE tenant_id='${tenant}'::uuid AND origen='CIERRE_ANUAL' AND extract(year from fecha)=${year};`));
  assert.equal(annual().length,1);
  assert.equal(cents(annual()[0].debe),2500);
  assert.equal(cents(annual()[0].haber),2500);
  const after = await balance(year,12);
  assert.equal(after.validacion.cuadrado,true);
  assert.equal(cents(after.activos.total_activos),2500);
  assert.equal(cents(after.patrimonio.total_patrimonio),2500);
  assert.equal(cents(after.patrimonio.resultado_ejercicio),0);
  await results(year,12);
  const preserved = entrySnapshot();
  await call(`contabilidad/periodos/${period.id}/reabrir`,{},403);
  assert.equal(entrySnapshot(),preserved);
  scenarios.push({ scenario:'Cierre anual con utilidad, replay y balance sin duplicar resultado', passed:true });
  token = platformToken;
  await call(`contabilidad/periodos/${period.id}/reabrir`,{});
  assert.equal(annual()[0].estado,'ANULADO');
  assert.equal((await call(`contabilidad/periodos/${period.id}/reabrir`,{})).estado,'ABIERTO');
  token = clientToken;
  const reopened = await balance(year,12);
  assert.equal(reopened.validacion.cuadrado,true);
  assert.equal(cents(reopened.patrimonio.resultado_ejercicio),2500);
  await call(`contabilidad/periodos/${period.id}/cerrar`,{});
  assert.equal(annual().length,2);
  assert.equal(annual().filter(entry=>entry.estado==='CONFIRMADO').length,1);
  assert.equal(annual().filter(entry=>entry.estado==='ANULADO').length,1);
  scenarios.push({ scenario:'Reapertura administrativa anual anula sólo el cierre y recierre crea secuencia nueva', passed:true });
  token = platformToken;
  await call(`contabilidad/periodos/${period.id}/reabrir`,{});
  token = clientToken;
  await post(date,'63',32,true);
  await call(`contabilidad/periodos/${period.id}/cerrar`,{});
  const loss = annual().find(entry=>entry.estado==='CONFIRMADO');
  assert.equal(cents(loss.debe),700);
  assert.equal(cents(loss.haber),700);
  assert.equal(sql(`SELECT count(*) FROM detalle_asientos WHERE asiento_id='${loss.id}'::uuid AND cuenta_id='${account('59')}'::uuid AND debe=7 AND haber=0;`),'1');
  const lossBalance = await balance(year,12);
  assert.equal(lossBalance.validacion.cuadrado,true);
  assert.equal(cents(lossBalance.patrimonio.total_patrimonio),-700);
  assert.equal(cents(lossBalance.patrimonio.resultado_ejercicio),0);
  const january = await call('contabilidad/periodos',{anio:year+1,mes:1});
  await post(`${year+1}-01-15`,'70',8);
  const next = await balance(year+1,1);
  assert.equal(next.validacion.cuadrado,true);
  assert.equal(cents(next.activos.total_activos),100);
  assert.equal(cents(next.patrimonio.total_patrimonio),100);
  assert.equal(cents(next.patrimonio.resultado_ejercicio),800);
  await results(year+1,1);
  await call(`contabilidad/periodos/${january.id}/cerrar`,{});
  token = platformToken;
  const finalSnapshot = entrySnapshot();
  const rejected = await call(`contabilidad/periodos/${period.id}/reabrir`,{},400);
  assert.match(String(rejected.message),/ACCOUNTING_PERIOD_HAS_LATER_CLOSED_PERIODS/);
  assert.equal(entrySnapshot(),finalSnapshot);
  assert.equal((await call(`contabilidad/periodos/${period.id}`)).estado,'CERRADO');
  scenarios.push({ scenario:'Pérdida anual, resultado nuevo independiente y rechazo de reapertura con período posterior cerrado', passed:true });
  const proof = { checkedAt:new Date().toISOString(), success:true, local_only:true,remoteWrites:false,
    scope:'Primer administrador no demo, esquema canónico 558, API real y PostgreSQL efímero', year,
    scenarios, requests, annual_entries:annual(), utility_before_close:25, loss_after_correction:-7,
    next_year_result:8, next_year_assets:1 };
  fs.writeFileSync(path.join(process.env.LOCAL_INTEGRATED_OUTPUT_DIR,'annual-acceptance.json'),JSON.stringify(proof,null,2));
  console.log('ANNUAL ACCEPTANCE PASSED: profit, loss, replay, reopen/reclose and next-year balance');
} finally {
  token=clientToken;
  sql(`UPDATE usuarios_sistema SET is_super_admin=false WHERE id='${actor}'::uuid;`);
}
