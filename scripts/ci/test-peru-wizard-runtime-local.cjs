// Consume lo que guardó el navegador: cifrado real en PostgreSQL y el mismo
// resolvedor OSE usado por CPE. No abre conexiones a SUNAT ni simula un CDR.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHmac } = require('node:crypto');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB, '1');
assert.equal(process.env.PGHOST, '127.0.0.1');
assert.equal(process.env.PGDATABASE, 'erp_e2e');
const root = path.resolve(__dirname, '../..');
const output = process.env.LOCAL_INTEGRATED_OUTPUT_DIR;
const api = process.env.LOCAL_API_URL, rest = new URL(process.env.LOCAL_POSTGREST_URL);
assert.equal(new URL(api).hostname, '127.0.0.1'); assert.equal(rest.hostname, '127.0.0.1');
const first = JSON.parse(fs.readFileSync(path.join(output, 'wizard-fixture.json')));
const other = JSON.parse(fs.readFileSync(path.join(output, 'accounting-other-fixture.json')));
const sql = query => execFileSync(process.env.PSQL_BIN, ['-XqAt', '-h', '127.0.0.1', '-p', process.env.PGPORT, '-U', 'postgres', '-d', 'erp_e2e', '-v', 'ON_ERROR_STOP=1'], { input: query, encoding: 'utf8', windowsHide: true }).trim();
assert.equal(sql("SELECT current_database()||'|'||environment||'|'||project_ref FROM app.deployment_environment WHERE singleton;"), 'erp_e2e|DEV|localerpephemeralqax');
for (const f of [first, other]) assert.match(f.tenant, /^[0-9a-f-]{36}$/);
const scenarios = [];
async function check(scenario, action) {
  try { await action(); scenarios.push({ scenario: 'Runtime fiscal: ' + scenario, passed: true }); }
  catch (error) { scenarios.push({ scenario: 'Runtime fiscal: ' + scenario, passed: false, message: error.name + ': falló la comprobación; sin imprimir material fiscal' }); }
}
(async () => {
  let success = false;
  try {
    const browser = JSON.parse(fs.readFileSync(path.join(output, 'browser-first-client-wizard.json')));
    assert.equal(browser.success, true);
    const row = JSON.parse(sql(`SELECT row_to_json(e) FROM empresa_config e WHERE tenant_id='${first.tenant}'::uuid;`));
    const apiRequire = createRequire(path.join(root, 'apps/erp-api/package.json'));
    apiRequire('ts-node').register({ transpileOnly: true, project: path.join(root, 'apps/erp-api/tsconfig.json') });
    apiRequire('reflect-metadata');
    const { ConfigService } = apiRequire('@nestjs/config');
    const { createClient } = apiRequire('@supabase/supabase-js');
    const { OseService } = require(path.join(root, 'apps/erp-api/src/modules/ose/ose.service.ts'));
    const encode = v => Buffer.from(JSON.stringify(v)).toString('base64url');
    const jwtInput = encode({ alg: 'HS256', typ: 'JWT' }) + '.' + encode({ role: 'service_role', exp: Math.floor(Date.now() / 1000) + 600 });
    const serviceJwt = jwtInput + '.' + createHmac('sha256', 'local-integration-key-only-never-production-20260905').update(jwtInput).digest('base64url');
    const client = createClient(rest.origin, serviceJwt, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: (input, init) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
      assert.equal(url.origin, rest.origin, 'Sólo PostgREST local');
      if (url.pathname.startsWith('/rest/v1/')) url.pathname = url.pathname.slice('/rest/v1'.length);
      return fetch(url, { ...init, redirect: 'error' });
    } } });
    const config = new ConfigService({ NODE_ENV: 'production', ENCRYPTION_KEY: 'local-integration-encryption-key-20260905-only',
      SUNAT_USERNAME: 'GLOBAL_DEBE_IGNORARSE', SUNAT_PASSWORD: 'GLOBAL_NO_USAR', EMPRESA_RUC: '00000000000',
      CERTIFICATE_PATH: path.join(output, 'global-certificate-does-not-exist.pfx') });
    const service = new OseService(config, {}, { getClient: () => client });
    await check('el arranque productivo no inventa un firmador global', async () => { assert.equal(service.xmlSigner, undefined); });
    await check('PFX y contraseñas permanecen cifrados en la base', async () => {
      const cert = fs.readFileSync(path.join(output, 'wizard-local.pfx')).toString('base64');
      assert.equal(row.is_demo, false); assert.equal(row.ruc, first.ruc);
      for (const [field, plain] of [['certificado_pfx', cert], ['certificado_password', 'Clave-PFX-local'], ['sunat_password', 'Clave-SOL-ensayo-local']]) {
        assert.ok(typeof row[field] === 'string' && row[field].length > 20); assert.notEqual(row[field], plain); assert.ok(!row[field].includes(plain));
      }
    });
    let runtime;
    await check('el resolvedor CPE usa y descifra las credenciales de ese tenant', async () => {
      runtime = await service.resolveTransportRuntime({ tenantId: first.tenant });
      assert.equal(runtime.config.isDemoTenant, false); assert.equal(runtime.config.ruc, first.ruc);
      assert.equal(runtime.config.usuario, first.ruc + 'SOL_SECUNDARIO_LOCAL');
      assert.equal(runtime.config.password, 'Clave-SOL-ensayo-local'); assert.equal(runtime.config.certificatePassword, 'Clave-PFX-local');
    });
    await check('el firmador carga el PFX propio y contrasta su RUC sin fallback demo', async () => {
      assert.ok(runtime?.signer); const info = runtime.signer.getCertificateInfo();
      assert.equal(info.demoMode, false); assert.equal(info.rucMatches, true); assert.ok(info.subject.includes(first.ruc));
    });
    await check('el encabezado WSSE lleva RUC más usuario secundario y su clave descifrada', async () => {
      assert.ok(runtime); const header = service.buildSecurityHeader(runtime.config);
      assert.ok(header.includes('<wsse:Username>' + first.ruc + 'SOL_SECUNDARIO_LOCAL</wsse:Username>'));
      assert.ok(header.includes('<wsse:Password>Clave-SOL-ensayo-local</wsse:Password>'));
      assert.ok(!header.includes('GLOBAL_'));
    });
    await check('una llamada sin tenant no usa credenciales globales', async () => {
      await assert.rejects(service.resolveTransportRuntime(), /tenantId es obligatorio/);
    });
    await check('otra empresa sin PFX no hereda el certificado del cliente configurado', async () => {
      await assert.rejects(service.resolveTransportRuntime({ tenantId: other.tenant }), /Certificado digital no configurado/);
    });
    success = scenarios.length === 7 && scenarios.every(s => s.passed);
  } catch (error) { scenarios.push({ scenario: 'Runtime fiscal: preparación o dependencia', passed: false, message: error.name + ': no se completó el ensayo; material fiscal omitido' }); }
  finally { fs.writeFileSync(path.join(output, 'wizard-runtime.json'), JSON.stringify({ success, remoteWrites: false, complete_acceptance: false, actualSunatAcceptance: false, externalConnections: 0, scope: 'Configuración guardada por navegador, SQL real cifrado, resolvedor OSE y encabezado WSSE. No prueba autorización SOL ni aceptación fiscal externa.', scenarios }, null, 2)); }
  console.log(JSON.stringify({ success, passed: scenarios.filter(s => s.passed).length, total: scenarios.length }));
  if (!success) process.exitCode = 1;
})().catch(() => { process.exitCode = 1; });
