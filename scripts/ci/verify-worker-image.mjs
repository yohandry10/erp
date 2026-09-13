import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';

const image = process.argv[2];
if (!image || !/^erp-peru-worker-validation:[a-z0-9.-]+$/.test(image)) {
  throw new Error('Indique una imagen local erp-peru-worker-validation:<tag>');
}
const inspected = JSON.parse(execFileSync('docker', ['image', 'inspect', image], { encoding: 'utf8' }))[0];
assert.notEqual(inspected.Config.User, 'root');
assert.ok(inspected.Config.User);
const health = inspected.Config.Healthcheck.Test;
assert.equal(health[0], 'CMD-SHELL');
assert.equal(health.length, 2);

const isolated = spawnSync('docker', ['run', '--rm', '--network', 'none', '-e', 'NODE_ENV=test', image], { encoding: 'utf8', timeout: 20000 });
assert.equal(isolated.status, 1);
assert.match(isolated.stderr, /El worker sólo admite NODE_ENV=production/);
assert.doesNotMatch(isolated.stderr, /ECONNREFUSED|ENOTFOUND/);

const probe = `
  const assert = require('node:assert/strict');
  const http = require('node:http');
  const { execFile } = require('node:child_process');
  const { promisify } = require('node:util');
  let status = 200;
  let calls = 0;
  const server = http.createServer((req, res) => {
    calls++;
    assert.equal(req.url, '/health');
    assert.equal(req.headers['x-health-token'], 'local-health-probe-only');
    res.writeHead(status); res.end();
  });
  server.listen(3050, async () => {
    try {
      const run = () => promisify(execFile)('/bin/sh', ['-c', process.argv[1]], {
        env: { ...process.env, HEALTH_TOKEN: 'local-health-probe-only' }, timeout: 5000,
      });
      await run();
      status = 503;
      await assert.rejects(run(), e => e.code === 1);
      assert.equal(calls, 2);
      console.log('Healthcheck real: acepta 200 autenticado y rechaza 503');
    } catch (error) { console.error(error); process.exitCode = 1; }
    finally { server.close(); }
  });
`;
execFileSync('docker', ['run', '--rm', '--network', 'none', '--entrypoint', 'node', image, '-e', probe, health[1]], { stdio: 'inherit', timeout: 20000 });
const startupProbe = `
  const assert = require('node:assert/strict');
  const http = require('node:http');
  const { startWorkerAfterReadiness } = require('/app/apps/worker/dist/startup-readiness.js');
  const { MINIMUM_WORKER_SCHEMA_VERSION } = require('/app/apps/worker/dist/runtime-config.js');
  let jobs = 0;
  let healthy = true;
  const server = http.createServer((req, res) => {
    assert.equal(req.url, '/api/health/ready');
    res.writeHead(healthy ? 200 : 503, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ready', checks: {
      database: { ready: true, contract: { required_schema_version: MINIMUM_WORKER_SCHEMA_VERSION,
        schema_version: MINIMUM_WORKER_SCHEMA_VERSION, required_schema_applied: true,
        service_role_reads: true, outbox_rpcs: true } }, redis: { ready: true },
    } }));
  });
  server.listen(3051, '127.0.0.1', async () => {
    const config = { apiBase: 'http://127.0.0.1:3051/api', requiredSchemaVersion: MINIMUM_WORKER_SCHEMA_VERSION };
    try {
      await startWorkerAfterReadiness(config, async () => { jobs++; });
      healthy = false;
      await assert.rejects(startWorkerAfterReadiness(config, async () => { jobs++; }));
      assert.equal(jobs, 1);
      console.log('Startup real: HTTP local habilita jobs sólo con contrato listo');
    } catch (error) { console.error(error); process.exitCode = 1; }
    finally { server.close(); }
  });
`;
execFileSync('docker', ['run', '--rm', '--network', 'none', '--entrypoint', 'node', image, '-e', startupProbe], { stdio: 'inherit', timeout: 20000 });
console.log('Worker image PASS: usuario no root, cierre previo a conexiones y healthcheck en shell');
