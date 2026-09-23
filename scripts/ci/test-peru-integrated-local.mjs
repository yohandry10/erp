import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { testPurchases } from './test-peru-integrated-purchases.mjs';
import { testAudit } from './test-peru-integrated-audit.mjs';
import { testAuthContext } from './test-peru-integrated-auth.mjs';
import { testModuleReads } from './test-peru-integrated-module-reads.mjs';
import { testPayroll } from './test-peru-integrated-payroll.mjs';
import { testRecordFlows } from './test-peru-integrated-records.mjs';
import { testSire } from './test-peru-integrated-sire.mjs';
import { testPeruOnboarding } from './test-peru-onboarding-local.mjs';

if (process.env.E2E_EPHEMERAL_LOCAL_DB !== '1') throw new Error('Requiere E2E_EPHEMERAL_LOCAL_DB=1');
const origin = new URL(process.env.LOCAL_API_URL || 'http://127.0.0.1:3122');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)) throw new Error('La API debe ser local');
const results = [];
const outputDir = path.resolve(process.env.LOCAL_INTEGRATED_OUTPUT_DIR || 'artifacts/peru-integrated-local');
mkdirSync(outputDir, { recursive: true });
let token;
const pgHost = process.env.PGHOST || '127.0.0.1';
if (!['127.0.0.1', 'localhost', '::1'].includes(pgHost)) throw new Error('PostgreSQL debe ser local');
const psql = process.env.PSQL_BIN || 'psql';
const pgPort = process.env.PGPORT || '55446';
if (!/^\d{4,5}$/.test(pgPort)) throw new Error('Puerto PostgreSQL inválido');
function sql(query) {
  const pgEnvironment = { ...process.env, PGPASSWORD: '' };
  for (const key of ['PGSERVICE', 'PGSERVICEFILE', 'PGOPTIONS']) delete pgEnvironment[key];
  return execFileSync(psql, ['-X', '-qAt', '-h', pgHost, '-p', pgPort, '-U', 'postgres', '-d', 'erp_e2e', '-v', 'ON_ERROR_STOP=1'], {
    input: query, encoding: 'utf8', env: pgEnvironment,
  }).trim();
}
function uuid(value) {
  assert.match(value, /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i);
  return `'${value}'::uuid`;
}
async function request(path, body, expected = body === undefined ? 200 : 201, extraHeaders = {}) {
  const response = await fetch(new URL(`/api/${path}`, origin), {
    method: body === undefined ? 'GET' : 'POST', redirect: 'error',
    headers: { 'content-type': 'application/json', connection: 'close', ...(token ? { authorization: `Bearer ${token}` } : {}), ...extraHeaders },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30000),
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(`${path}: respuesta no JSON (${response.status})`); }
  assert.equal(response.status, expected, `${path}: HTTP ${response.status}; ${typeof data.message === 'string' ? data.message : 'contrato HTTP inesperado'}`);
  return data;
}
function processAccounting(label) {
  const apiDirectory = path.resolve('apps/erp-api');
  const requireApi = createRequire(path.join(apiDirectory, 'package.json'));
  const batchLog = execFileSync(process.execPath, [requireApi.resolve('ts-node/dist/bin.js'), '--transpile-only', 'tests/e2e/helpers/local-api-harness.ts', '--accounting-once'], {
    cwd: apiDirectory, encoding: 'utf8', timeout: 60000, maxBuffer: 5 * 1024 * 1024,
    env: { ...process.env, E2E_EPHEMERAL_LOCAL_DB: '1', LOCAL_POSTGREST_URL: process.env.LOCAL_POSTGREST_URL || 'http://127.0.0.1:55447' },
  });
  writeFileSync(path.join(outputDir, `${label}.log`), batchLog);
}
async function main() {
  assert.equal(sql("SELECT current_database() || '|' || environment || '|' || project_ref FROM app.deployment_environment WHERE singleton;"), 'erp_e2e|DEV|localerpephemeralqax');
  const auth = await request('auth/login', { email: 'peru-integrated-1@example.test', password: 'Local-Peru-2026-Only!' });
  token = auth.access_token;
  assert.ok(token);
  assert.equal(auth.user.tenant_id, sql("SELECT tenant_id FROM usuarios_sistema WHERE email='peru-integrated-1@example.test';"));
  results.push({ scenario: 'login real con sesión persistida', passed: true, tenant_id: auth.user.tenant_id });
  const catalog = {};
  for (const path of ['pos/productos', 'pos/clientes', 'pos/metodos-pago', 'pos/sesion-caja', 'cajas', 'pos/empresa-config']) {
    const data = await request(path);
    assert.equal(data.success, true, path);
    catalog[path] = data.data;
    results.push({ scenario: path, passed: true });
  }
  const company = catalog['pos/empresa-config'];
  for (const key of ['certificado_pfx', 'certificado_password', 'sunat_password', 'ose_api_key', 'dian_software_pin']) {
    assert.equal(key in company, false, `El POS no puede divulgar ${key}`);
  }
  const session = catalog['pos/sesion-caja'];
  if (session) {
    const balance = await request(`cajas/saldo-esperado/${session.id}`);
    const close = await request('pos/caja/cerrar', { sesion_id: session.id, caja_id: session.caja_id, monto_contado: balance.data.saldo, notas: 'Arqueo de fixture local antes del recorrido' });
    assert.equal(close.success, true);
    results.push({ scenario: 'cierre de sesión inicial con saldo real', passed: true });
  }
  const caja = catalog.cajas[0];
  const opened = await request('pos/caja/abrir', { monto_inicial: 100, caja_id: caja.id, moneda: 'PEN', dispositivo: 'integrated-http' });
  assert.equal(opened.success, true);
  assert.equal((await request('pos/sesion-caja')).data.id, opened.data.id);
  results.push({ scenario: 'apertura real de caja por HTTP', passed: true });
  const product = catalog['pos/productos'].find(row => row.codigo === 'DEMO-003');
  const cash = catalog['pos/metodos-pago'].find(row => row.codigo === 'EFECTIVO');
  const client = catalog['pos/clientes'].find(row => String(row.documento_identidad) === '12345678');
  assert.ok(product && cash && client);
  const intent = {
    idempotency_key: `local-integrated-${randomUUID()}`, sesion_caja_id: opened.data.id,
    cliente_id: client.id, cliente_documento: '12345678', cliente_nombre: client.nombre,
    cliente_tipo_documento: 'DNI', metodo_pago_id: cash.id, moneda: 'PEN', emitir_cpe: false,
    items: [{ producto_id: product.id, cantidad: 1, precio_unitario: Number(product.precio_venta) }],
  };
  const sale = await request('pos/venta', intent);
  assert.equal(sale.success, true);
  results.push({ scenario: 'venta de ticket interno por HTTP', passed: true });
  assert.equal(sale.cpe_id, null);
  assert.equal(sale.cpe_pendiente, false);
  assert.equal(sale.tipo_emision, 'TICKET');
  assert.equal(sale.total, 10.5);
  assert.equal(sale.impuestos, 1.6);
  const replay = await request('pos/venta', intent);
  assert.equal(replay.idempotent, true);
  assert.equal(replay.venta_id, sale.venta_id);
  const stockAfter = (await request('pos/productos')).data.find(row => row.id === product.id);
  assert.equal(Number(stockAfter.stock_actual), Number(product.stock_actual) - 1);
  const balanceAfter = await request(`cajas/saldo-esperado/${opened.data.id}`);
  assert.equal(balanceAfter.data.saldo, 110.5);
  const details = await request(`pos/detalles-venta/${sale.venta_id}`);
  assert.equal(details.data.length, 1);
  assert.equal(details.data[0].producto_id, product.id);
  results.push({ scenario: 'reintento sin duplicar venta, stock ni efectivo', passed: true });
  assert.equal(sql(`SELECT count(*) FROM ventas_pos WHERE id=${uuid(sale.venta_id)};`), '1');
  assert.equal(sql(`SELECT count(*) FROM movimientos_caja WHERE id=${uuid(sale.caja_movimiento_id)} AND sesion_caja_id=${uuid(opened.data.id)};`), '1');
  processAccounting('accounting');
  assert.equal(sql(`SELECT count(*) FROM asientos_contables WHERE source_event_id=${uuid(sale.accounting_event_id)} AND tenant_id=${uuid(auth.user.tenant_id)} AND estado='CONFIRMADO' AND total_debe=total_haber;`), '1');
  assert.equal(sql(`SELECT status FROM outbox_events WHERE event_id=${uuid(sale.accounting_event_id)};`), 'completed');
  results.push({ scenario: 'outbox procesado por servicio real y asiento único confirmado y cuadrado', passed: true, venta_id: sale.venta_id, accounting_event_id: sale.accounting_event_id });
  const primaryToken = token;
  const second = await request('auth/login', { email: 'peru-integrated-2@example.test', password: 'Local-Peru-2026-Only!' });
  token = second.access_token;
  const invisible = await request(`pos/detalles-venta/${sale.venta_id}`);
  assert.deepEqual(invisible.data, []);
  const secondCatalog = (await request('pos/productos')).data;
  assert.ok(secondCatalog.length > 0);
  assert.ok(secondCatalog.every(row => row.tenant_id === second.user.tenant_id));
  assert.ok(secondCatalog.every(row => row.id !== product.id));
  results.push({ scenario: 'aislamiento entre dos empresas autenticadas', passed: true });
  token = primaryToken;
  const closed = await request('pos/caja/cerrar', { sesion_id: opened.data.id, caja_id: caja.id, monto_contado: balanceAfter.data.saldo, notas: 'Arqueo integrado correcto' });
  assert.equal(closed.success, true);
  assert.equal((await request('pos/sesion-caja')).data, null);
  results.push({ scenario: 'cierre posterior a venta con arqueo correcto', passed: true });
  const purchaseContext = await testPurchases({ request, sql, uuid, results, processAccounting, tenantId: auth.user.tenant_id,
    setToken: value => { token = value; }, primaryToken, outputDir });
  await testAudit({ request, sql, uuid, results, tenantId: auth.user.tenant_id,
    setToken: value => { token = value; }, primaryToken });
  await testAuthContext({ request, sql, uuid, results,
    setToken: value => { token = value; }, primaryToken });
  await testModuleReads({ request, results, tenantId: auth.user.tenant_id });
  await testPayroll({ request, sql, uuid, results, tenantId: auth.user.tenant_id,
    setToken: value => { token = value; }, primaryToken, processAccounting, approverToken: purchaseContext.approverToken });
  await testRecordFlows({ request, sql, uuid, results, tenantId: auth.user.tenant_id,
    processAccounting, approverToken: purchaseContext.approverToken, otherTenantToken: second.access_token });
  await testSire({ request, sql, uuid, results, tenantId: auth.user.tenant_id, otherTenantToken: second.access_token });
  await testPeruOnboarding({ request, sql, uuid, results,
    setToken: value => { token = value; }, primaryToken });
}
try {
  await main();
  writeFileSync(path.join(outputDir, 'http.json'), JSON.stringify({ date: new Date().toISOString(), success: true, results }, null, 2));
  console.log(`PASS ${results.length} comprobaciones integradas locales`);
} catch (error) {
  writeFileSync(path.join(outputDir, 'http.json'), JSON.stringify({ date: new Date().toISOString(), success: false, results, error: error.message }, null, 2));
  console.error(error);
  process.exitCode = 1;
}
