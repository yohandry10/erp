import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fetchWithLocalLoginRetry } from './peru-local-http.mjs';

assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB, '1');
assert.equal(process.env.PGHOST, '127.0.0.1');
assert.equal(process.env.PGDATABASE, 'erp_e2e');
const api = process.env.LOCAL_API_URL, output = process.env.LOCAL_INTEGRATED_OUTPUT_DIR;
assert.equal(new URL(api).hostname, '127.0.0.1');
const kind = process.env.ASSET_ESTIMATES_FIXTURE || 'asset-estimates';
assert.ok(['asset-estimates'].includes(kind));
const first = JSON.parse(fs.readFileSync(path.join(output, kind + '-fixture.json')));
const sql = query => execFileSync(process.env.PSQL_BIN, ['-XqAt', '-h', '127.0.0.1', '-p', process.env.PGPORT, '-U', 'postgres', '-d', 'erp_e2e', '-v', 'ON_ERROR_STOP=1'], { input: query, encoding: 'utf8', windowsHide: true }).trim();
assert.equal(sql("SELECT current_database()||'|'||environment||'|'||project_ref FROM app.deployment_environment WHERE singleton;"), 'erp_e2e|DEV|localerpephemeralqax');
const q = id => { assert.match(id, /^[0-9a-f-]{36}$/i); return `'${id}'::uuid`; };
const base = 'contabilidad/activos-fijos', scenarios = [], requests = [];
let token, success = false;
async function call(endpoint, body, method = body === undefined ? 'GET' : 'POST', key = randomUUID()) {
  if (method === 'PUT') {
    const id = endpoint.split('/').at(-1);
    const current = await call(endpoint);
    const expected = Object.fromEntries(['id', 'tenant_id', 'codigo', 'nombre', 'descripcion', 'fecha_adquisicion', 'fecha_inicio_depreciacion', 'valor_adquisicion', 'valor_residual', 'vida_util_meses', 'depreciacion_acumulada', 'centro_costo_id', 'situacion', 'updated_at', 'asiento_baja_id', 'estado', 'activo', 'created_at', 'created_by'].map(k => [k, current[k]]));
    body = { expected, original: { nombre: current.nombre, vida_util_meses: current.vida_util_meses, valor_residual: current.valor_residual, ...body } };
  }
  const response = await fetchWithLocalLoginRetry(api + '/api/' + endpoint, { method, headers: { 'content-type': 'application/json', connection: 'close', ...(token ? { authorization: 'Bearer ' + token } : {}), 'idempotency-key': key }, body: body === undefined ? undefined : JSON.stringify(body) });
  const value = await response.json();
  requests.push({ method, endpoint: endpoint.replace(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/gi, ':id'), status: response.status });
  assert.ok(response.status < 300, method + ' ' + endpoint + ': ' + JSON.stringify(value).slice(0, 400));
  return value.data ?? value;
}
async function check(scenario, action) {
  try { const result = await action(); scenarios.push({ scenario: 'Estimaciones: ' + scenario, passed: true, ...result }); }
  catch (error) { scenarios.push({ scenario: 'Estimaciones: ' + scenario, passed: false, message: String(error.message).slice(0, 900) }); }
}
try {
  token = (await call('auth/login', { email: first.email, password: 'Cliente-Local-2026-Only!' })).access_token;
  assert.ok(token);
  const today = sql(`SELECT app.hoy_tenant(${q(first.tenant)});`), start = today.slice(0, 7) + '-01';
  const date = new Date(start + 'T12:00:00Z'), next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 12));
  const months = [date, next].map(d => ({ anio: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 }));
  const periods = await call('contabilidad/periodos');
  for (const month of months) if (!periods.some(p => Number(p.anio) === month.anio && Number(p.mes) === month.mes)) await call('contabilidad/periodos', month);
  const create = codigo => call(base, { codigo, nombre: 'Equipo de revisión de estimación', fecha_adquisicion: start, fecha_inicio_depreciacion: start, valor_adquisicion: 12000, valor_residual: 0, vida_util_meses: 12 });
  const life = await create('AF-VIDA-UAT'), residual = await create('AF-RESIDUAL-UAT');
  await call(base + '/depreciar', months[0]);
  const history = () => sql(`SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY id),'[]'::jsonb) FROM depreciaciones d WHERE tenant_id=${q(first.tenant)} AND periodo='${start.slice(0, 7)}';`);
  const before = history();
  const originalRows = JSON.parse(before); assert.equal(originalRows.length, 2); assert.ok(originalRows.every(r => Number(r.monto_depreciacion) === 1000));
  await check('las dos ediciones conservan las cuotas originales confirmadas', async () => {
    await call(base + '/' + life.id, { vida_util_meses: 24 }, 'PUT');
    await call(base + '/' + residual.id, { valor_residual: 1000 }, 'PUT');
    assert.equal(history(), before);
  });
  await check('al ampliar vida útil el cronograma conserva1000 y reparte11000entre23meses', async () => {
    const rows = await call(base + '/' + life.id + '/cronograma');
    assert.equal(Number(rows[0].cuota), 1000, 'La cuota registrada del primer mes se reescribió en la proyección');
    assert.equal(Number(rows[1].cuota), 478.26, '11000/23 debe repartirse hacia adelante');
    assert.equal(Number(rows.at(-1).valor_neto), 0);
  });
  await check('al revisar residual el cronograma conserva1000 y reparte10000entre11meses', async () => {
    const rows = await call(base + '/' + residual.id + '/cronograma');
    assert.equal(Number(rows[0].cuota), 1000, 'La cuota registrada no puede recalcularse con el nuevo residual');
    assert.equal(Number(rows[1].cuota), 909.09, '10000/11 debe aplicarse sólo al pendiente');
    assert.equal(Number(rows.at(-1).valor_neto), 1000);
  });
  const secondBatchKey = randomUUID();
  await call(base + '/depreciar', months[1], 'POST', secondBatchKey);
  const amount = id => Number(sql(`SELECT monto_depreciacion FROM depreciaciones WHERE activo_id=${q(id)} AND periodo='${next.toISOString().slice(0, 7)}';`));
  await check('la siguiente cuota real de vida útil revisada es478.26', async () => { const actual = amount(life.id); assert.equal(actual, 478.26, 'Cuota realmente persistida: ' + actual); return { actual }; });
  await check('la siguiente cuota real de residual revisado es909.09', async () => { const actual = amount(residual.id); assert.equal(actual, 909.09, 'Cuota realmente persistida: ' + actual); return { actual }; });
  await check('el reintento no duplica cuotas ni eventos y conserva la historia', async () => {
    await call(base + '/depreciar', months[1], 'POST', secondBatchKey);
    assert.equal(sql(`SELECT count(*) FROM depreciaciones WHERE tenant_id=${q(first.tenant)};`), '4');
    assert.equal(sql(`SELECT count(*) FROM outbox_events WHERE tenant_id=${q(first.tenant)} AND event_type='depreciacion.generada';`), '4');
    assert.equal(history(), before);
  });
  success = scenarios.length === 6 && scenarios.every(s => s.passed);
} catch (error) { scenarios.push({ scenario: 'Estimaciones: preparación o dependencia', passed: false, message: String(error.message).slice(0, 900) }); }
finally { fs.writeFileSync(path.join(output, 'asset-estimates.json'), JSON.stringify({ success, remoteWrites: false, complete_acceptance: false, scope: 'Edición prospectiva de vida útil/residual después de depreciar: API y SQL locales reales', scenarios, requests }, null, 2)); }
console.log(JSON.stringify({ success, passed: scenarios.filter(s => s.passed).length, total: scenarios.length }));
if (!success) process.exitCode = 1;
