import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { buildPeru564Bundle } from './ci/peru-564-bundle.mjs';
import { peru564StateSql, assertPeru564Preserved, summarizePeru564State } from './ci/peru-564-state.mjs';

// Restaura el respaldo PROD únicamente en un contenedor propio sin red ni puertos.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
assert.equal(process.argv.length, 3, 'Uso: node scripts/rehearse-peru-564-local.mjs artifacts/peru-prod-backup-<id>.json');
const manifestPath = path.resolve(process.argv[2]);
assert.equal(path.dirname(manifestPath), path.join(root, 'artifacts'));
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
assert.equal(manifest.project, 'wypnbcptofqdmoynlonq');
assert.equal(manifest.remoteWrites, false);
const archive = fs.realpathSync(manifest.archive);
assert.equal(path.dirname(archive), fs.realpathSync(path.join(root, 'artifacts/db-backups')));
const archiveBytes = fs.readFileSync(archive);
assert.equal(archiveBytes.length, manifest.bytes);
assert.equal(createHash('sha256').update(archiveBytes).digest('hex'), manifest.sha256);
const filename = '564__pos_first_client_readiness.sql';
const body = fs.readFileSync(path.join(root, 'supabase/migrations', filename), 'utf8');
const bundle = buildPeru564Bundle(filename, body);
const runId = new Date().toISOString().replace(/[^0-9]/g, '') + '-' + process.pid;
const containerName = `erp-peru-564-rehearsal-${runId}`;
const reportPath = path.join(root, 'artifacts', `${containerName}.json`);
const privateLog = path.join(root, 'artifacts/db-backups', `${containerName}.log`);
const report = { success: false, remoteWrites: false, network: 'none', project: manifest.project,
  archiveSha256: manifest.sha256, migrationSha256: createHash('sha256').update(body).digest('hex'),
  bundleSha256: createHash('sha256').update(bundle).digest('hex'),
  limits: ['Sin objetos externos de Storage ni roles globales; tiempo local no acredita RTO.'] };
let container;
let step = 'bootstrap';
function docker(args, input, expectedError) {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', windowsHide: true,
    timeout: 180000, maxBuffer: 30 * 1024 * 1024 });
  if (expectedError) {
    if (result.status === 0 || !result.stderr?.includes(expectedError)) {
      fs.appendFileSync(privateLog, `\n${step}\n${result.stderr || result.error?.message || 'Fallo sin stderr'}\n`);
    }
    assert.ok(result.status !== 0 && result.stderr?.includes(expectedError), `Control negativo: ${step}`);
    return '';
  }
  if (result.status !== 0) {
    fs.appendFileSync(privateLog, `\n${step}\n${result.stderr || result.error?.message || 'Fallo sin stderr'}\n`);
    throw new Error(`Falló ${step}; diagnóstico privado en artifacts/db-backups/*.log`);
  }
  return result.stdout.trim();
}
const sql = (statement, expectedError) => docker(
  ['exec', '-i', container, 'psql', '-XqAt', '-U', 'postgres', '-d', 'erp_e2e', '-v', 'ON_ERROR_STOP=1'],
  statement, expectedError,
);
const snapshot = required => JSON.parse(sql(peru564StateSql(required)));
try {
  step = 'crear contenedor sin red';
  container = docker(['run', '--rm', '--detach', '--name', containerName,
    '--label', `erp.peru.564.rehearsal=${runId}`, '--network', 'none',
    '--env', 'POSTGRES_DB=erp_e2e', '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:17-alpine']);
  const inspection = JSON.parse(docker(['inspect', container]))[0];
  assert.equal(inspection.Name, '/' + containerName);
  assert.equal(inspection.HostConfig.NetworkMode, 'none');
  assert.deepEqual(inspection.HostConfig.PortBindings, {});
  let ready = false;
  for (let i = 0; i < 30; i++) {
    const probe = spawnSync('docker', ['exec', container, 'pg_isready', '-h', '127.0.0.1',
      '-U', 'postgres', '-d', 'erp_e2e'], { windowsHide: true, stdio: 'ignore' });
    if (probe.status === 0) { ready = true; break; }
    await delay(500);
  }
  assert.ok(ready);
  step = 'restaurar respaldo privado';
  docker(['cp', archive, `${container}:/tmp/source.dump`]);
  const schema = docker(['exec', container, 'pg_restore', '--schema-only', '--no-owner', '--file=-', '/tmp/source.dump']);
  const roles = new Set(['anon', 'authenticated', 'service_role']);
  for (const line of schema.split('\n').filter(line => /^(GRANT |REVOKE |ALTER DEFAULT PRIVILEGES )/.test(line))) {
    for (const match of line.matchAll(/(?:TO|FROM|FOR ROLE) ([a-z_][a-z_0-9]*)/g)) roles.add(match[1]);
  }
  for (const role of roles) {
    if (role === 'postgres' || role === 'public') continue;
    assert.match(role, /^[a-z_][a-z_0-9]*$/);
    sql(`CREATE ROLE "${role}" NOLOGIN ${role === 'service_role' ? 'BYPASSRLS' : ''};`);
  }
  sql('CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions; CREATE EXTENSION "uuid-ossp" WITH SCHEMA extensions; CREATE EXTENSION citext WITH SCHEMA public; CREATE EXTENSION pg_trgm WITH SCHEMA public;');
  const catalog = docker(['exec', container, 'pg_restore', '--list', '/tmp/source.dump']);
  const lines = catalog.split('\n');
  assert.equal(lines.filter(line => /^\d+; \d+ \d+ SCHEMA - public /.test(line)).length, 1);
  docker(['exec', '-i', container, 'sh', '-c', 'cat > /tmp/restore.list'],
    lines.filter(line => !/^\d+; \d+ \d+ SCHEMA - public /.test(line)).join('\n'));
  docker(['exec', container, 'pg_restore', '-U', 'postgres', '-d', 'erp_e2e', '--no-owner',
    '--exit-on-error', '--single-transaction', '--use-list=/tmp/restore.list', '/tmp/source.dump']);
  report.restoreVerified = true;
  const before = snapshot(563);
  report.before = summarizePeru564State(before);
  report.historyBefore = before.schema;
  assert.equal(before.schema, 563, 'El respaldo debe estar exactamente en 563');
  step = 'rollback atómico 564';
  sql(bundle.replace(/COMMIT;\s*$/, 'SELECT 1/0;\nCOMMIT;\n'), 'division by zero');
  assert.deepEqual(snapshot(563), before, 'La inyección de fallo debe revertir filas, ACL e historia');
  report.atomicRollbackPassed = true;
  step = 'aplicar 564 en copia aislada';
  sql(bundle);
  const after = snapshot(564);
  assert.equal(after.schema, 564);
  assertPeru564Preserved(before, after);
  const changedData=structuredClone(after);
  changedData.existingData.sucursales='negative-control';
  assert.throws(()=>assertPeru564Preserved(before,changedData),/La migración alteró existingData/);
  const changedFunction=structuredClone(after);
  changedFunction.existingFunctions='negative-control';
  assert.throws(()=>assertPeru564Preserved(before,changedFunction),/La migración alteró existingFunctions/);
  const changedSecurity=structuredClone(after);
  changedSecurity.posBoundary.authenticated=true;
  assert.throws(()=>assertPeru564Preserved(before,changedSecurity));
  const changedPolicy=structuredClone(after);changedPolicy.policies='negative-control';
  assert.throws(()=>assertPeru564Preserved(before,changedPolicy),/La migración alteró policies/);
  const changedTrigger=structuredClone(after);changedTrigger.catalogTrigger=0;
  assert.throws(()=>assertPeru564Preserved(before,changedTrigger));
  report.preservationNegativeControlsPassed = true;
  report.existingDataPreserved = true;
  report.existingFunctionsPreserved = true;
  report.tableSecurityPreserved = true;
  report.onlyApprovedPosBoundaryAdded = true;
  report.before = summarizePeru564State(before);
  report.after = summarizePeru564State(after);
  step = 'contratos SQL 564';
  sql(fs.readFileSync(path.join(root, 'supabase/verify/564__pos_first_client_readiness.sql'), 'utf8'));
  assert.deepEqual(snapshot(564), after, 'Los verificadores deben revertir todos sus cambios');
  report.sqlContractsPassed = true;
  report.historyAfter = after.schema;
  report.success = true;
} finally {
  report.completedAt = new Date().toISOString();
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  if (container) {
    const check = spawnSync('docker', ['inspect', '--format', '{{.Name}}', container],
      { encoding: 'utf8', windowsHide: true, timeout: 10000 });
    if (check.status === 0 && check.stdout.trim() === '/' + containerName) {
      spawnSync('docker', ['stop', container], { windowsHide: true, timeout: 30000 });
    }
  }
}
console.log(JSON.stringify({ reportPath, ...report }, null, 2));
