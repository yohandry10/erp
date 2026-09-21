const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startWorkerAfterReadiness } = require('../dist/startup-readiness.js');

const config = { apiBase: 'https://api.example.invalid/api', requiredSchemaVersion: 553 };
const ready = () => ({ status: 'ready', checks: {
  database: { ready: true, contract: { schema_version: 553, required_schema_version: 553,
    required_schema_applied: true, service_role_reads: true, outbox_rpcs: true } },
  redis: { ready: true },
} });

test('carga jobs sólo después de confirmar API, Redis y esquema compatibles', async () => {
  const steps = [];
  await startWorkerAfterReadiness(config, async () => { steps.push('jobs'); }, async (url, options) => {
    steps.push('readiness');
    assert.equal(url, 'https://api.example.invalid/api/health/ready');
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    return { ok: true, json: async () => ready() };
  });
  assert.deepEqual(steps, ['readiness', 'jobs']);
});

test('no inicia consumidores con esquema antiguo, contrato ausente o dependencia caída', async () => {
  const invalid = [null, {}, { status: 'ready' }];
  for (const change of [
    r => { r.status = 'unready'; }, r => { r.checks.database.ready = false; },
    r => { r.checks.redis.ready = false; },
    r => { r.checks.database.contract.required_schema_version = 544; },
    r => { r.checks.database.contract.schema_version = 544; },
    r => { r.checks.database.contract.required_schema_applied = false; },
    r => { r.checks.database.contract.service_role_reads = false; },
    r => { r.checks.database.contract.outbox_rpcs = false; },
  ]) { const value = ready(); change(value); invalid.push(value); }
  for (const value of invalid) {
    let loaded = false;
    await assert.rejects(startWorkerAfterReadiness(config, async () => { loaded = true; },
      async () => ({ ok: true, json: async () => value })), /Readiness/);
    assert.equal(loaded, false);
  }
});

test('falla cerrado ante HTTP 503, conexión o JSON inválido', async () => {
  for (const response of [
    async () => ({ ok: false }),
    async () => { throw new Error('Conexión fallida'); },
    async () => ({ ok: true, json: async () => { throw new Error('JSON inválido'); } }),
  ]) {
    let loaded = false;
    await assert.rejects(startWorkerAfterReadiness(config, async () => { loaded = true; }, response));
    assert.equal(loaded, false);
  }
});

test('propaga errores de inicialización sin anunciar arranque exitoso', async () => {
  await assert.rejects(startWorkerAfterReadiness(config, async () => { throw new Error('Job init failed'); },
    async () => ({ ok: true, json: async () => ready() })), /Job init failed/);
});
