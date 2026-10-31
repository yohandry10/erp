import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fetchWithLocalLoginRetry } from './peru-local-http.mjs';

assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB, '1');
assert.equal(process.env.PGHOST, '127.0.0.1');
assert.equal(process.env.PGDATABASE, 'erp_e2e');
const api = process.env.LOCAL_API_URL;
assert.equal(new URL(api).hostname, '127.0.0.1');
const output = process.env.LOCAL_INTEGRATED_OUTPUT_DIR;
const fixture = name => JSON.parse(fs.readFileSync(path.join(output, name + '-fixture.json')));
const first = fixture('asset-first'), other = fixture('asset-other');
const sql = query => execFileSync(process.env.PSQL_BIN, ['-XqAt', '-h', '127.0.0.1', '-p', process.env.PGPORT, '-U', 'postgres', '-d', 'erp_e2e', '-v', 'ON_ERROR_STOP=1'], { input: query, encoding: 'utf8', windowsHide: true }).trim();
assert.equal(sql("SELECT current_database()||'|'||environment||'|'||project_ref FROM app.deployment_environment WHERE singleton;"), 'erp_e2e|DEV|localerpephemeralqax');
const q = id => { assert.match(id, /^[0-9a-f-]{36}$/i); return `'${id}'::uuid`; };
const base = 'contabilidad/activos-fijos';
const scenarios = [], requests = [];
let token, otherToken, success = false;
async function raw(endpoint, body, { access = token, method = body === undefined ? 'GET' : 'POST', key } = {}) {
  if (body !== undefined && endpoint.startsWith(base)) key ??= randomUUID();
  if (body !== undefined && (method === 'PUT' || /^contabilidad\/activos-fijos\/[^/]+\/baja$/.test(endpoint))) {
    const id = endpoint.split('/')[2];
    const current = JSON.parse(sql(`SELECT row_to_json(a) FROM activos_fijos a WHERE id=${q(id)};`));
    const expected = Object.fromEntries(['id', 'tenant_id', 'codigo', 'nombre', 'descripcion', 'fecha_adquisicion', 'fecha_inicio_depreciacion', 'valor_adquisicion', 'valor_residual', 'vida_util_meses', 'depreciacion_acumulada', 'centro_costo_id', 'situacion', 'updated_at', 'asiento_baja_id', 'estado', 'activo', 'created_at', 'created_by'].map(k => [k, current[k]]));
    if (access === otherToken) expected.tenant_id = other.tenant;
    body = { expected, original: method === 'PUT' ? { nombre: current.nombre, vida_util_meses: current.vida_util_meses, valor_residual: current.valor_residual, ...body } : body };
  }
  const response = await fetchWithLocalLoginRetry(api + '/api/' + endpoint, { method, headers: { 'content-type': 'application/json', connection: 'close', ...(access ? { authorization: 'Bearer ' + access } : {}), ...(key ? { 'idempotency-key': key } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const value = await response.json();
  requests.push({ method, endpoint: endpoint.replace(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/gi, ':id'), status: response.status });
  return { status: response.status, body: value, data: Object.hasOwn(value, 'data') ? value.data : value };
}
async function call(endpoint, body, options = {}, expected = body === undefined ? 200 : 201) {
  const result = await raw(endpoint, body, options);
  assert.equal(result.status, expected, JSON.stringify(result.body).slice(0, 450));
  return result.data;
}
async function check(scenario, action) {
  try { const observed = await action(); scenarios.push({ scenario: 'Activos: ' + scenario, passed: true, ...observed }); }
  catch (error) { scenarios.push({ scenario: 'Activos: ' + scenario, passed: false, message: String(error.message).slice(0, 1100) }); }
}
async function readOutage(action) {
  assert.equal(sql("SELECT has_table_privilege('service_role','public.activos_fijos','SELECT');"), 't');
  sql('REVOKE SELECT ON public.activos_fijos FROM service_role;');
  try { assert.equal(sql("SELECT has_table_privilege('service_role','public.activos_fijos','SELECT');"), 'f'); return await action(); }
  finally { sql('GRANT SELECT ON public.activos_fijos TO service_role;'); }
}
async function writerOutage(name, action) {
  assert.ok(['gestionar_activo_diferido_tx', 'registrar_lote_depreciacion_tx_570', 'guardar_operacion_activo_tx_570'].includes(name));
  const sig = sql(`SELECT oid::regprocedure::text FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='${name}';`);
  assert.ok(sig && !sig.includes('\n'));
  assert.equal(sql(`SELECT has_function_privilege('service_role','${sig}','EXECUTE');`), 't');
  const publicGrant = sql(`SELECT EXISTS(SELECT 1 FROM pg_proc p,aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='${sig}'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE');`) === 't';
  sql(`REVOKE EXECUTE ON FUNCTION ${sig} FROM PUBLIC,service_role;`);
  try { assert.equal(sql(`SELECT has_function_privilege('service_role','${sig}','EXECUTE');`), 'f'); return await action(); }
  finally { sql(`GRANT EXECUTE ON FUNCTION ${sig} TO service_role;`); if (publicGrant) sql(`GRANT EXECUTE ON FUNCTION ${sig} TO PUBLIC;`); }
}
try {
  const login = async email => { const r = await raw('auth/login', { email, password: 'Cliente-Local-2026-Only!' }, { access: null }); assert.equal(r.status, 201); return r.data.access_token; };
  token = await login(first.email); otherToken = await login(other.email); assert.ok(token && otherToken);
  const today = sql(`SELECT app.hoy_tenant(${q(first.tenant)});`);
  const [anio, mes] = today.split('-').map(Number), start = today.slice(0, 7) + '-01';
  const periodRows = await call('contabilidad/periodos');
  if (!periodRows.some(p => Number(p.anio) === anio && Number(p.mes) === mes)) await call('contabilidad/periodos', { anio, mes });
  const dto = { codigo: 'AF-UAT-001', nombre: 'Equipo UAT A', fecha_adquisicion: start, fecha_inicio_depreciacion: start, valor_adquisicion: 12000, valor_residual: 0, vida_util_meses: 12 };
  const key = randomUUID();
  const asset = await call(base, dto, { key });
  assert.ok(asset.id); const id = asset.id;
  const current = () => JSON.parse(sql(`SELECT row_to_json(a) FROM activos_fijos a WHERE id=${q(id)};`));
  await check('alta y reintento conservan un único activo', async () => {
    const again = await call(base, dto, { key }); assert.equal(again.id, id);
    assert.equal(sql(`SELECT count(*) FROM activos_fijos WHERE tenant_id=${q(first.tenant)} AND codigo='AF-UAT-001';`), '1');
  });
  await check('código duplicado con otra intención responde 409', async () => {
    const result = await raw(base, dto, { key: randomUUID() }); assert.equal(result.status, 409, JSON.stringify(result.body));
  });
  await check('edición B→C→B persiste cada nombre con una nueva intención original', async () => {
    const observed = [];
    for (const nombre of ['Equipo UAT B', 'Equipo UAT C', 'Equipo UAT B']) { await call(base + '/' + id, { nombre }, { method: 'PUT' }, 200); observed.push(current().nombre); }
    assert.deepEqual(observed, ['Equipo UAT B', 'Equipo UAT C', 'Equipo UAT B']); return { observed };
  });
  await check('la clave reutilizada con otro contenido responde 409 y conserva el activo', async () => {
    const before = current(); const r = await raw(base, { ...dto, nombre: 'Contenido incompatible' }, { key });
    assert.equal(r.status, 409, JSON.stringify(r.body)); assert.deepEqual(current(), before);
  });
  await check('otro tenant no lee detalle ni cronograma', async () => {
    for (const suffix of ['', '/cronograma']) { const r = await raw(base + '/' + id + suffix, undefined, { access: otherToken }); assert.equal(r.status, 404, JSON.stringify(r.body)); }
  });
  await check('otro tenant no edita ni retira el activo', async () => {
    const before = current();
    for (const [suffix, method, body] of [['', 'PUT', { nombre: 'Edición ajena' }], ['/baja', 'POST', { fecha: today, tipo: 'BAJA', motivo: 'Intento ajeno' }]]) {
      const r = await raw(base + '/' + id + suffix, body, { access: otherToken, method }); assert.equal(r.status, 404, JSON.stringify(r.body));
    }
    assert.deepEqual(current(), before);
  });
  await check('cronograma lineal cuadra al céntimo con el residual', async () => {
    const rows = await call(base + '/' + id + '/cronograma'); assert.equal(rows.length, 12);
    assert.ok(rows.every(r => Number(r.cuota) === 1000)); assert.equal(Number(rows.at(-1).valor_neto), 0);
  });
  for (const suffix of ['', '/cronograma']) await check('lectura caída de ' + (suffix ? 'cronograma' : 'detalle') + ' responde 503', async () => {
    await readOutage(async () => { const r = await raw(base + '/' + id + suffix); assert.equal(r.status, 503, JSON.stringify(r.body)); });
  });
  await check('writer de alta indisponible responde 503 sin crear', async () => {
    await writerOutage('gestionar_activo_diferido_tx', async () => { const r = await raw(base, { ...dto, codigo: 'AF-NO-CREAR' }, { key: randomUUID() }); assert.equal(r.status, 503, JSON.stringify(r.body)); });
    assert.equal(sql(`SELECT count(*) FROM activos_fijos WHERE tenant_id=${q(first.tenant)} AND codigo='AF-NO-CREAR';`), '0');
  });
  await check('writer de edición indisponible responde 503 sin modificar', async () => {
    const before = current();
    await writerOutage('guardar_operacion_activo_tx_570', async () => { const r = await raw(base + '/' + id, { nombre: 'No persistir' }, { method: 'PUT' }); assert.equal(r.status, 503, JSON.stringify(r.body)); });
    assert.deepEqual(current(), before);
  });
  await check('depreciación con lectura caída responde 503', async () => {
    await readOutage(async () => { const r = await raw(base + '/depreciar', { anio, mes }); assert.equal(r.status, 503, JSON.stringify(r.body)); });
  });
  await check('writer de depreciación caído responde 503 y no dice éxito', async () => {
    await writerOutage('registrar_lote_depreciacion_tx_570', async () => { const r = await raw(base + '/depreciar', { anio, mes }); assert.equal(r.status, 503, JSON.stringify(r.body)); });
    assert.equal(Number(current().depreciacion_acumulada), 0);
  });
  await check('depreciar y repetir no duplica cuota ni evento', async () => {
    const batchKey = randomUUID(); const firstRun = await call(base + '/depreciar', { anio, mes }, { key: batchKey }); assert.equal(firstRun.activos_depreciados, 1); assert.equal(Number(firstRun.total_depreciado), 1000);
    await call(base + '/depreciar', { anio, mes }, { key: batchKey }); assert.equal(Number(current().depreciacion_acumulada), 1000);
    assert.equal(sql(`SELECT count(*) FROM depreciaciones WHERE activo_id=${q(id)};`), '1');
    assert.equal(sql(`SELECT count(*) FROM outbox_events WHERE tenant_id=${q(first.tenant)} AND event_type='depreciacion.generada';`), '1');
  });
  await check('baja conserva el valor neto y deja un asiento confirmado cuadrado', async () => {
    const removed = await call(base + '/' + id + '/baja', { fecha: today, tipo: 'BAJA', motivo: 'Baja UAT con valor neto pendiente' }); assert.equal(removed.situacion, 'BAJA');
    const entry = sql(`SELECT asiento_baja_id FROM activos_fijos WHERE id=${q(id)};`); assert.match(entry, /^[0-9a-f-]{36}$/);
    assert.equal(sql(`SELECT estado FROM asientos_contables WHERE id=${q(entry)};`), 'CONFIRMADO');
    assert.equal(Number(sql(`SELECT coalesce(sum(debe-haber),0) FROM detalle_asientos WHERE asiento_id=${q(entry)};`)), 0);
    assert.equal(Number(current().depreciacion_acumulada), 1000);
  });
  await check('activo retirado no vuelve a depreciarse ni genera otro asiento', async () => {
    const before = current(); const r = await raw(base + '/' + id + '/baja', { fecha: today, tipo: 'BAJA' }); assert.equal(r.status, 400);
    const after = await call(base + '/depreciar', { anio, mes }); assert.equal(after.activos_depreciados, 0); assert.deepEqual(current(), before);
  });
  success = scenarios.length === 16 && scenarios.every(s => s.passed);
} catch (error) { scenarios.push({ scenario: 'Activos: preparación o dependencia', passed: false, message: String(error.message).slice(0, 1000) }); }
finally { fs.writeFileSync(path.join(output, 'assets-lifecycle.json'), JSON.stringify({ success, remoteWrites: false, complete_acceptance: false, scope: 'API real y PostgreSQL local: activos, aislamiento, reintentos, fallas y baja. Sin aceptación normativa ni integral.', scenarios, requests }, null, 2)); }
console.log(JSON.stringify({ success, passed: scenarios.filter(s => s.passed).length, total: scenarios.length, failed: scenarios.filter(s => !s.passed).map(s => s.scenario) }));
if (!success) process.exitCode = 1;
