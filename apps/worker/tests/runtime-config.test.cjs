const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { loadWorkerRuntimeConfig, loadWorkerEnvironment, PROD_SUPABASE_PROJECT_REF } = require('../dist/runtime-config.js');

const valid = () => ({
  NODE_ENV: 'production', DEPLOYMENT_ENV: 'PROD',
  EXPECTED_SUPABASE_PROJECT_REF: PROD_SUPABASE_PROJECT_REF,
  SUPABASE_URL: `https://${PROD_SUPABASE_PROJECT_REF}.supabase.co`,
  SUPABASE_SERVICE_ROLE_KEY: 'local-test-key-no-network',
  ERP_API_URL: 'https://api.example.invalid/api',
  POS_WORKER_JWT_SECRET: 'local-test-secret-with-24-characters',
  REQUIRED_DATABASE_SCHEMA_VERSION: '553',
});

test('acepta sólo la configuración PROD sin crear conexiones', () => {
  const result = loadWorkerRuntimeConfig(valid());
  assert.equal(result.supabaseUrl, valid().SUPABASE_URL);
  assert.equal(result.apiBase, valid().ERP_API_URL);
});

for (const url of [
  'https://abcdefghijklmnopqrst.supabase.co', 'http://127.0.0.1:54321',
  `http://${PROD_SUPABASE_PROJECT_REF}.supabase.co`,
  `https://${PROD_SUPABASE_PROJECT_REF}.supabase.co.evil.invalid`,
  `https://${PROD_SUPABASE_PROJECT_REF}.supabase.co/alternate`,
  `https://${PROD_SUPABASE_PROJECT_REF}.supabase.co?redirect=other`,
  `https://user:secret@${PROD_SUPABASE_PROJECT_REF}.supabase.co`,
]) {
  test(`rechaza destino ajeno o alterado: ${url.replace('user:secret@', '')}`, () => {
    assert.throws(() => loadWorkerRuntimeConfig({ ...valid(), SUPABASE_URL: url }), /proyecto PROD autorizado/);
  });
}

test('rechaza modos no operativos, referencia ausente y API sin configurar', () => {
  for (const change of [
    { NODE_ENV: 'development' }, { NODE_ENV: 'test' }, { DEPLOYMENT_ENV: 'QA' },
    { EXPECTED_SUPABASE_PROJECT_REF: '' }, { EXPECTED_SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst' },
    { ERP_API_URL: '' },
    { REQUIRED_DATABASE_SCHEMA_VERSION: '' }, { REQUIRED_DATABASE_SCHEMA_VERSION: '544' },
  ]) assert.throws(() => loadWorkerRuntimeConfig({ ...valid(), ...change }));
});

test('el entrypoint valida antes de importar jobs o clientes con efectos laterales', () => {
  const entry = path.resolve(__dirname, '../dist/index.js');
  const script = `
    const assert = require('node:assert/strict');
    const Module = require('node:module');
    const original = Module._load;
    Module._load = function (name, ...args) {
      if (name === 'dotenv/config' || name.startsWith('./jobs/') || name.startsWith('@supabase/') || name === 'bullmq') {
        throw new Error('Importación con efectos laterales antes de validar');
      }
      return original.call(this, name, ...args);
    };
    assert.throws(() => require(process.argv[1]), /El worker sólo admite/);
  `;
  const result = spawnSync(process.execPath, ['-e', script, entry], {
    env: { NODE_ENV: 'test', SystemRoot: process.env.SystemRoot || '' }, encoding: 'utf8', timeout: 10000,
  });
  assert.equal(result.status, 0, result.stderr);
});

test('carga sólo .env.production desde raíz o paquete y conserva secretos inyectados', () => {
  const sandbox = mkdtempSync(path.join(os.tmpdir(), 'erp-worker-config-'));
  const root = path.join(sandbox, 'workspace', 'erp');
  const worker = path.join(root, 'apps', 'worker');
  mkdirSync(worker, { recursive: true });
  try {
    writeFileSync(path.join(root, '.env'), 'LEGACY_ENV=must-not-load\n');
    writeFileSync(path.join(worker, '.env.local'), 'LEGACY_LOCAL=must-not-load\n');
    writeFileSync(path.join(root, '.env.production'), 'ROOT_VALUE=root\nPRIORITY=root\nINJECTED=file\n');
    writeFileSync(path.join(worker, '.env.production'), 'WORKER_VALUE=worker\nPRIORITY=worker\n');
    for (const cwd of [root, worker]) {
      const env = { NODE_ENV: 'production', INJECTED: 'runtime' };
      loadWorkerEnvironment(cwd, env);
      assert.deepEqual(env, { NODE_ENV: 'production', INJECTED: 'runtime', ROOT_VALUE: 'root', WORKER_VALUE: 'worker', PRIORITY: 'worker' });
    }
    const testEnv = { NODE_ENV: 'test' };
    loadWorkerEnvironment(root, testEnv);
    assert.deepEqual(testEnv, { NODE_ENV: 'test' });
  } finally {
    assert.ok(sandbox.startsWith(path.join(os.tmpdir(), 'erp-worker-config-')));
    rmSync(sandbox, { recursive: true, force: true });
  }
});
