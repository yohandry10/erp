import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fetchWithLocalLoginRetry } from './peru-local-http.mjs';

assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB, '1');
assert.equal(process.env.PGHOST, '127.0.0.1');
assert.equal(process.env.PGDATABASE, 'erp_e2e');
const api = process.env.LOCAL_API_URL;
assert.equal(new URL(api).hostname, '127.0.0.1');
const output = process.env.LOCAL_INTEGRATED_OUTPUT_DIR;
const fixture = name => JSON.parse(fs.readFileSync(path.join(output, name + '-fixture.json')));
const first = fixture('wizard'), other = fixture('accounting-other');
const sql = query => execFileSync(process.env.PSQL_BIN, ['-XqAt', '-h', '127.0.0.1', '-p', process.env.PGPORT, '-U', 'postgres', '-d', 'erp_e2e', '-v', 'ON_ERROR_STOP=1'], { input: query, encoding: 'utf8', windowsHide: true }).trim();
assert.equal(sql("SELECT current_database()||'|'||environment||'|'||project_ref FROM app.deployment_environment WHERE singleton;"), 'erp_e2e|DEV|localerpephemeralqax');
assert.match(first.tenant, /^[0-9a-f-]{36}$/);
const scenarios = [], requests = [];
let token, otherToken, success = false;
async function raw(endpoint, body, access = token) {
  const method = body === undefined ? 'GET' : 'POST';
  const response = await fetchWithLocalLoginRetry(api + '/api/' + endpoint, { method, headers: { 'content-type': 'application/json', connection: 'close', ...(access ? { authorization: 'Bearer ' + access } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const value = await response.json();
  requests.push({ method, endpoint: endpoint.split('?')[0], status: response.status });
  return { status: response.status, data: value.data ?? value };
}
async function check(scenario, action) {
  try { await action(); scenarios.push({ scenario: 'Onboarding: ' + scenario, passed: true }); }
  catch (error) { scenarios.push({ scenario: 'Onboarding: ' + scenario, passed: false, message: error.name + ': ' + String(error.message).slice(0, 600) }); }
}
try {
  for (const [index, company] of [first, other].entries()) {
    const r = await raw('auth/login', { email: company.email, password: 'Cliente-Local-2026-Only!' }, null); assert.equal(r.status, 201);
    if (index === 0) token = r.data.access_token; else otherToken = r.data.access_token;
  }
  await check('la identidad básica está preparada sin marcar el asistente como finalizado', async () => {
    const r = await raw('configuration/status'); assert.equal(r.status, 200); assert.equal(r.data.isComplete, true);
    assert.equal(sql(`SELECT coalesce(bool_or(completado),false) FROM wizard_progress WHERE tenant_id='${first.tenant}'::uuid;`), 'f');
    assert.equal(sql(`SELECT is_demo FROM empresa_config WHERE tenant_id='${first.tenant}'::uuid;`), 'f');
  });
  await check('la configuración no se entrega sin autenticar', async () => {
    assert.equal((await raw('configuration/empresa', undefined, null)).status, 401);
  });
  const before = sql(`SELECT row_to_json(e) FROM empresa_config e WHERE tenant_id='${first.tenant}'::uuid;`);
  const cert = fs.readFileSync(path.join(output, 'wizard-local.pfx')).toString('base64');
  const payload = { ruc: first.ruc, certificateBase64: cert, certificatePassword: 'Clave-PFX-local' };
  await check('contraseña PFX incorrecta se rechaza antes de persistir', async () => {
    assert.equal((await raw('configuration/wizard/validate-certificate', { ...payload, certificatePassword: 'Clave-incorrecta-local' })).status, 400);
    assert.equal(sql(`SELECT row_to_json(e) FROM empresa_config e WHERE tenant_id='${first.tenant}'::uuid;`), before);
  });
  await check('PFX de otro RUC se rechaza sin cambiar la identidad de la empresa', async () => {
    assert.equal((await raw('configuration/wizard/validate-certificate', { ...payload, ruc: other.ruc })).status, 400);
    assert.equal(sql(`SELECT row_to_json(e) FROM empresa_config e WHERE tenant_id='${first.tenant}'::uuid;`), before);
  });
  await check('PFX propio se valida sin guardar ni completar el asistente', async () => {
    const r = await raw('configuration/wizard/validate-certificate', payload); assert.equal(r.status, 201); assert.equal(r.data.perteneceAlEmisor, true);
    assert.equal(sql(`SELECT row_to_json(e) FROM empresa_config e WHERE tenant_id='${first.tenant}'::uuid;`), before);
  });
  await check('un parámetro tenant ajeno no sustituye la empresa de la sesión', async () => {
    const denied = await raw('configuration/empresa?tenant_id=' + first.tenant, undefined, otherToken); assert.equal(denied.status, 403);
    const own = await raw('configuration/empresa', undefined, otherToken); assert.equal(own.status, 200); assert.equal(own.data.ruc, other.ruc); assert.notEqual(own.data.ruc, first.ruc);
  });
  success = scenarios.length === 6 && scenarios.every(s => s.passed);
} catch (error) { scenarios.push({ scenario: 'Onboarding: preparación o dependencia', passed: false, message: error.name + ': ' + String(error.message).slice(0, 500) }); }
finally { fs.writeFileSync(path.join(output, 'wizard-preflight.json'), JSON.stringify({ success, remoteWrites: false, complete_acceptance: false, actualSunatAcceptance: false, scope: 'Preparación del primer cliente en API/SQL locales; certificados sintéticos propios y sin transmisión externa', scenarios, requests }, null, 2)); }
console.log(JSON.stringify({ success, passed: scenarios.filter(s => s.passed).length, total: scenarios.length }));
if (!success) process.exitCode = 1;
