import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildPeruPromotionBundle } from './ci/peru-promotion-bundle.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = name => {
  const index = args.indexOf(name);
  assert.ok(index >= 0 && args[index + 1] && !args[index + 1].startsWith('--'), `Falta ${name}`);
  return args[index + 1];
};
const project = 'wypnbcptofqdmoynlonq';
const hash = value => createHash('sha256').update(value).digest('hex');
const command = (executable, parameters) => {
  const result = spawnSync(executable, parameters, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 60000 });
  assert.equal(result.status, 0, `Falló la comprobación ${path.basename(executable)}`);
  return result.stdout.trim();
};
const readArtifact = name => {
  const filename = fs.realpathSync(path.resolve(root, name));
  assert.equal(path.dirname(filename), fs.realpathSync(path.join(root, 'artifacts')));
  return JSON.parse(fs.readFileSync(filename, 'utf8'));
};
const manifest = readArtifact(option('--backup'));
const rehearsal = readArtifact(option('--rehearsal'));
assert.equal(manifest.project, project);
assert.equal(manifest.remoteWrites, false);
assert.ok(Date.now() - Date.parse(manifest.completedAt) >= 0 && Date.now() - Date.parse(manifest.completedAt) < 24 * 3600000, 'Respaldo fuera de la ventana de 24 horas');
const archive = fs.realpathSync(manifest.archive);
assert.equal(path.dirname(archive), fs.realpathSync(path.join(root, 'artifacts/db-backups')));
assert.equal(fs.statSync(archive).size, manifest.bytes);
assert.equal(hash(fs.readFileSync(archive)), manifest.sha256);
assert.equal(rehearsal.archiveSha256, manifest.sha256);
for (const key of ['success', 'atomicPromotionRollbackPassed', 'rlsPreserved', 'verifiersRolledBack']) assert.equal(rehearsal[key], true, key);
assert.equal(rehearsal.remoteWrites, false);
assert.equal(rehearsal.network, 'none');
const files = fs.readdirSync(path.join(root, 'supabase/migrations')).filter(name => /^\d+__.*\.sql$/.test(name));
const versions = files.map(name => Number(name.split('__')[0]));
assert.equal(new Set(versions).size, versions.length, 'Prefijos duplicados');
assert.equal(Math.max(...versions), 552);
const migrations = files.filter(name => Number(name.split('__')[0]) >= 537).sort().map(filename => ({
  filename, version: Number(filename.split('__')[0]), body: fs.readFileSync(path.join(root, 'supabase/migrations', filename), 'utf8'),
}));
assert.deepEqual(migrations.map(({ version, body }) => ({ version, sha256: hash(body) })), rehearsal.migrations.map(({ version, sha256 }) => ({ version, sha256 })));
const bundle = buildPeruPromotionBundle(migrations);
assert.equal(hash(bundle), rehearsal.promotionBundleSha256);
const commit = command('git', ['rev-parse', 'HEAD']);
const pull = JSON.parse(command('gh', ['pr', 'view', '109', '--json', 'headRefOid,baseRefName']));
assert.equal(pull.headRefOid, commit);
assert.equal(pull.baseRefName, 'main');
const checks = JSON.parse(command('gh', ['pr', 'checks', '109', '--json', 'name,state,link']));
assert.ok(checks.every(check => ['SUCCESS', 'SKIPPED', 'NEUTRAL'].includes(check.state)), 'CI pendiente o fallido');
for (const name of ['Tests', 'Build', 'Security audit', 'Type-check', 'Lint', 'Peru API, browser and backup recovery', 'PostgreSQL 16 fresh schema + SQL contracts', 'Playwright isolated browser contracts']) {
  assert.ok(checks.some(check => check.name === name && check.state === 'SUCCESS'), `Falta check exitoso: ${name}`);
}
// Runtime/migrations must match the checked commit. Generated Turbo logs are irrelevant.
const sourcePaths = ['scripts', 'supabase', 'apps/erp-api/src', 'apps/worker/src', 'libs/crypto/src', 'libs/dtos/src'];
assert.equal(command('git', ['diff', 'HEAD', '--name-only', '--', ...sourcePaths]), '', 'Fuentes operativas sin commit');
assert.equal(command('git', ['ls-files', '--others', '--exclude-standard', '--', ...sourcePaths]), '', 'Fuentes operativas no versionadas');
const report = { commit, project, backupSha256: manifest.sha256, bundleSha256: hash(bundle), remoteWrites: false, checks, success: false };
if (!args.includes('--apply')) {
  console.log(JSON.stringify({ ...report, prepared: true, message: 'Gates completos; sin conexión ni escritura DB. --apply exige --env-file y --pg-bin.' }, null, 2));
  process.exit(0);
}
const envFile = fs.realpathSync(path.resolve(option('--env-file')));
assert.equal(path.basename(envFile), '.env.production');
const require = createRequire(path.join(root, 'apps/erp-api/package.json'));
const values = require('dotenv').parse(fs.readFileSync(envFile));
assert.equal(values.DEPLOYMENT_ENV, 'PROD');
assert.equal(values.EXPECTED_SUPABASE_PROJECT_REF, project);
assert.equal(new URL(values.SUPABASE_URL).origin, `https://${project}.supabase.co`);
command('powershell.exe', ['-NoProfile', '-File', path.join(root, 'scripts/db-environment-preflight.ps1'), '-Environment', 'PROD', '-EnvFile', envFile]);
const psql = path.join(path.resolve(option('--pg-bin')), 'psql.exe');
assert.match(command(psql, ['--version']), /PostgreSQL\) 17\./);
const connection = new URL(values.DATABASE_URL);
const env = { ...process.env, PGHOST: connection.hostname, PGPORT: connection.port || '5432',
  PGDATABASE: decodeURIComponent(connection.pathname.slice(1)), PGUSER: decodeURIComponent(connection.username),
  PGPASSWORD: decodeURIComponent(connection.password), PGSSLMODE: 'require', PGCONNECT_TIMEOUT: '20',
  PGAPPNAME: 'erp-peru-schema-552-promotion', PGOPTIONS: '-c statement_timeout=60000 -c lock_timeout=10000' };
delete env.PGSERVICE;
delete env.PGSERVICEFILE;
const runId = new Date().toISOString().replace(/[^0-9]/g, '');
const sql = (input, step) => {
  const result = spawnSync(psql, ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], { cwd: root, input, env, encoding: 'utf8', windowsHide: true, timeout: 300000, maxBuffer: 5000000 });
  fs.writeFileSync(path.join(root, 'artifacts/db-backups', `promotion-552-${runId}-${step}.log`), result.stderr || '');
  assert.equal(result.status, 0, `Falló ${step}; revisar diagnóstico privado y estado remoto antes de reintentar`);
  return result.stdout.trim();
};
const stateSql = `BEGIN READ ONLY;
SELECT jsonb_build_object('project',(SELECT project_ref FROM app.deployment_environment WHERE singleton),
 'readiness',public.outbox_runtime_health_492(p_required_schema_version => 552),
 'history',(SELECT jsonb_agg(jsonb_build_object('version',version,'name',name) ORDER BY version)
 FROM supabase_migrations.schema_migrations WHERE version ~ '^[0-9]{1,9}$' AND version::integer BETWEEN 533 AND 552));
COMMIT;`;
try {
  report.before = JSON.parse(sql(stateSql, 'before'));
  assert.equal(report.before.project, project);
  assert.equal(report.before.history.length, 4);
  for (const row of report.before.history) {
    const filename = files.find(name => name.startsWith(`${row.version}__`));
    assert.ok(filename);
    assert.equal(row.name, filename.replace(/^\d+_/, '').replace(/\.sql$/, ''));
  }
  report.remoteWrites = true; // An attempted commit with a lost response is an uncertain result.
  sql(bundle, 'apply');
  report.after = JSON.parse(sql(stateSql, 'after'));
  assert.equal(report.after.project, project);
  assert.equal(report.after.readiness.ready, true);
  assert.equal(report.after.history.length, 20);
  report.success = true;
} finally {
  report.completedAt = new Date().toISOString();
  fs.writeFileSync(path.join(root, 'artifacts', `peru-prod-promotion-${runId}.json`), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify(report, null, 2));
