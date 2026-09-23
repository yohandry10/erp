import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { buildPeru554Bundle } from './ci/peru-554-bundle.mjs';

// Restaura el respaldo PROD únicamente en un contenedor propio sin red ni puertos.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
assert.equal(process.argv.length, 3, 'Uso: node scripts/rehearse-peru-554-local.mjs artifacts/peru-prod-backup-<id>.json');
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
const filename = '554__first_tenant_migration_permissions.sql';
const body = fs.readFileSync(path.join(root, 'supabase/migrations', filename), 'utf8');
const bundle = buildPeru554Bundle(filename, body);
const runId = new Date().toISOString().replace(/[^0-9]/g, '') + '-' + process.pid;
const containerName = `erp-peru-554-rehearsal-${runId}`;
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
const snapshot = () => JSON.parse(sql(`SELECT json_build_object(
  'history',(SELECT max(version::integer) FROM supabase_migrations.schema_migrations WHERE version ~ '^[0-9]{1,9}$'),
  'permissions',(SELECT md5(coalesce(string_agg(md5(to_jsonb(p)::text),'' ORDER BY p.tenant_id,p.codigo),'')) FROM public.permisos p),
  'rolePermissions',(SELECT md5(coalesce(string_agg(md5(to_jsonb(rp)::text),'' ORDER BY rp.role_id,rp.permiso_id),'')) FROM public.rol_permisos rp),
  'runsAcl',has_table_privilege('service_role','public.migration_runs','INSERT'),
  'rowsAcl',has_table_privilege('service_role','public.migration_run_rows','INSERT'),
  'seedBase',to_regprocedure('app.seed_operational_rbac_for_tenant_base_554(uuid,uuid)') IS NOT NULL
);`));
try {
  step = 'crear contenedor sin red';
  container = docker(['run', '--rm', '--detach', '--name', containerName,
    '--label', `erp.peru.554.rehearsal=${runId}`, '--network', 'none',
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
  const before = snapshot();
  report.historyBefore = before.history;
  assert.equal(before.history, 553, 'El respaldo debe estar exactamente en 553');
  assert.equal(before.seedBase, false);
  step = 'rollback atómico 554';
  sql(bundle.replace(/COMMIT;\s*$/, 'SELECT 1/0;\nCOMMIT;\n'), 'division by zero');
  assert.deepEqual(snapshot(), before, 'La inyección de fallo debe revertir filas, ACL y función');
  report.atomicRollbackPassed = true;
  step = 'aplicar 554 en copia aislada';
  sql(bundle);
  const after = snapshot();
  assert.equal(after.history, 554);
  assert.equal(after.seedBase, true);
  assert.equal(after.runsAcl, true);
  assert.equal(after.rowsAcl, true);
  assert.equal(sql(`SELECT count(*) FROM public.rol_permisos rp
    JOIN public.roles r ON r.id=rp.role_id JOIN public.permisos p ON p.id=rp.permiso_id
    JOIN public.empresa_config ec ON ec.tenant_id=r.tenant_id
    WHERE NOT ec.is_demo AND upper(r.nombre)='ADMIN' AND p.codigo='migration.preview' AND rp.concedido;`),
    sql(`SELECT count(*) FROM public.empresa_config ec JOIN public.roles r ON r.tenant_id=ec.tenant_id
      WHERE NOT ec.is_demo AND upper(r.nombre)='ADMIN';`));
  report.historyAfter = after.history;
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
