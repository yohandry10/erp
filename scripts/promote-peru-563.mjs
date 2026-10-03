import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildPeru563Bundle } from './ci/peru-563-bundle.mjs';
import { peru563StateSql, assertPeru563Preserved, summarizePeru563State } from './ci/peru-563-state.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = name => {
  const index = args.indexOf(name);
  assert.ok(index >= 0 && args[index + 1] && !args[index + 1].startsWith('--'), `Falta ${name}`);
  return args[index + 1];
};
const hash = value => createHash('sha256').update(value).digest('hex');
const artifact = name => {
  const filename = fs.realpathSync(path.resolve(root, name));
  assert.equal(path.dirname(filename), fs.realpathSync(path.join(root, 'artifacts')));
  return JSON.parse(fs.readFileSync(filename, 'utf8'));
};
const command = (executable, parameters) => {
  const result = spawnSync(executable, parameters, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 60000 });
  assert.equal(result.status, 0, `Falló ${path.basename(executable)}`);
  return result.stdout.trim();
};
const project = 'wypnbcptofqdmoynlonq';
const backup = artifact(option('--backup'));
const rehearsal = artifact(option('--rehearsal'));
assert.equal(backup.project, project);
assert.equal(backup.remoteWrites, false);
assert.ok(Date.now() - Date.parse(backup.completedAt) >= 0 && Date.now() - Date.parse(backup.completedAt) < 24 * 3600000,
  'El respaldo debe tener menos de 24 horas');
const archive = fs.realpathSync(backup.archive);
assert.equal(path.dirname(archive), fs.realpathSync(path.join(root, 'artifacts/db-backups')));
const archiveBytes = fs.readFileSync(archive);
assert.equal(archiveBytes.length, backup.bytes);
assert.equal(hash(archiveBytes), backup.sha256);
assert.equal(rehearsal.project, project);
assert.equal(rehearsal.archiveSha256, backup.sha256);
assert.equal(rehearsal.network, 'none');
assert.equal(rehearsal.remoteWrites, false);
for (const key of ['success', 'restoreVerified', 'atomicRollbackPassed', 'preservationNegativeControlsPassed', 'existingDataPreserved', 'existingFunctionsPreserved', 'tableSecurityPreserved', 'onlyApprovedReadGrantsChanged', 'sqlContractsPassed']) assert.equal(rehearsal[key], true, key);
assert.equal(rehearsal.historyBefore, 562);
assert.equal(rehearsal.historyAfter, 563);
const migrationFiles = fs.readdirSync(path.join(root, 'supabase/migrations')).filter(name => /^\d+__.*\.sql$/.test(name));
const versions = migrationFiles.map(name => Number(name.split('__')[0]));
assert.equal(new Set(versions).size, versions.length, 'Prefijos de migración duplicados');
assert.equal(Math.max(...versions), 563);
const filename = '563__consolidation_report_read_privileges.sql';
const body = fs.readFileSync(path.join(root, 'supabase/migrations', filename), 'utf8');
const bundle = buildPeru563Bundle(filename, body);
assert.equal(hash(body), rehearsal.migrationSha256);
assert.equal(hash(bundle), rehearsal.bundleSha256);
const commit = command('git', ['rev-parse', 'HEAD']);
const prNumber = option('--pr');
assert.match(prNumber, /^\d+$/);
const pull = JSON.parse(command('gh', ['pr', 'view', prNumber, '--json', 'headRefOid,baseRefName,state']));
assert.equal(pull.headRefOid, commit);
assert.equal(pull.baseRefName, 'main');
assert.equal(pull.state, 'OPEN');
const checks = JSON.parse(command('gh', ['pr', 'checks', prNumber, '--json', 'name,state']));
assert.ok(checks.length > 0 && checks.every(check => ['SUCCESS', 'SKIPPED', 'NEUTRAL'].includes(check.state)),
  'Los checks del PR deben estar completos');
for (const name of ['Tests', 'Build', 'Security audit', 'Type-check', 'Lint',
  'Peru API, browser and backup recovery', 'Peru company logo with real local Storage', 'PostgreSQL 16 fresh schema + SQL contracts',
  'Playwright isolated browser contracts']) {
  assert.ok(checks.some(check => check.name === name && check.state === 'SUCCESS'), `Falta ${name}`);
}
const sourcePaths = ['scripts', 'supabase', 'patches', 'package.json', 'pnpm-lock.yaml', 'apps/erp-api/Dockerfile', 'apps/worker/Dockerfile', 'apps/web/Dockerfile', 'apps/erp-api/src', 'apps/worker/src', 'libs/crypto/src', 'libs/dtos/src', 'apps/web/app', 'apps/web/components', 'apps/web/hooks', 'apps/web/lib', 'apps/web/contexts', 'apps/web/tests', '.github/workflows', 'render.yaml'];
assert.equal(command('git', ['diff', 'HEAD', '--name-only', '--', ...sourcePaths]), '');
assert.equal(command('git', ['ls-files', '--others', '--exclude-standard', '--', ...sourcePaths]), '');
const report = { commit, prNumber: Number(prNumber), project,
  backupSha256: backup.sha256, migrationSha256: hash(body), bundleSha256: hash(bundle),
  success: false, remoteWrites: false };
if (!args.includes('--apply')) {
  console.log(JSON.stringify({ ...report, prepared: true, message: 'Gates completos; sin conexión a PROD.' }, null, 2));
  process.exit(0);
}

const envFile = fs.realpathSync(path.resolve(option('--env-file')));
assert.equal(path.basename(envFile), '.env.production');
const require = createRequire(path.join(root, 'apps/erp-api/package.json'));
const values = require('dotenv').parse(fs.readFileSync(envFile));
assert.equal(values.DEPLOYMENT_ENV, 'PROD');
assert.equal(values.EXPECTED_SUPABASE_PROJECT_REF, project);
assert.equal(new URL(values.SUPABASE_URL).origin, `https://${project}.supabase.co`);
command('powershell.exe', ['-NoProfile', '-File', path.join(root, 'scripts/db-environment-preflight.ps1'),
  '-Environment', 'PROD', '-EnvFile', envFile]);
const psql = path.join(path.resolve(option('--pg-bin')), 'psql.exe');
assert.match(command(psql, ['--version']), /PostgreSQL\) 17\./);
const connection = new URL(values.DATABASE_URL);
const env = { ...process.env, PGHOST: connection.hostname, PGPORT: connection.port || '5432',
  PGDATABASE: decodeURIComponent(connection.pathname.slice(1)), PGUSER: decodeURIComponent(connection.username),
  PGPASSWORD: decodeURIComponent(connection.password), PGSSLMODE: 'require', PGCONNECT_TIMEOUT: '20',
  PGAPPNAME: 'erp-peru-schema-563-promotion', PGOPTIONS: '-c statement_timeout=120000 -c lock_timeout=10000' };
delete env.PGSERVICE;
delete env.PGSERVICEFILE;
const runId = new Date().toISOString().replace(/[^0-9]/g, '');
function sql(input, step) {
  const result = spawnSync(psql, ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], {
    cwd: root, input, env, encoding: 'utf8', windowsHide: true, timeout: 300000, maxBuffer: 5000000,
  });
  fs.writeFileSync(path.join(root, 'artifacts/db-backups', `promotion-563-${runId}-${step}.log`), result.stderr || '');
  assert.equal(result.status, 0, `Falló ${step}; revisar diagnóstico privado e historia remota antes de reintentar`);
  return result.stdout.trim();
}
const state = expected => JSON.parse(sql(`BEGIN READ ONLY;
${peru563StateSql(expected)}
COMMIT;`, expected === 562 ? 'before' : 'after'));
try {
  const before = state(562);
  report.before = summarizePeru563State(before);
  assert.equal(report.before.project, project);
  assert.equal(report.before.environment, 'PROD');
  assert.equal(report.before.schema, 562, 'No reaplicar 563');
  assert.equal(report.before.ready, true);
  report.remoteWrites = true; // Respuesta perdida del commit = resultado incierto.
  sql(bundle, 'apply');
  const after = state(563);
  report.after = summarizePeru563State(after);
  assert.equal(report.after.project, project);
  assert.equal(report.after.schema, 563);
  assert.equal(report.after.ready, true);
  assertPeru563Preserved(before, after);
  report.existingDataPreserved = true;
  report.existingFunctionsPreserved = true;
  report.tableSecurityPreserved = true;
  report.onlyApprovedReadGrantsChanged = true;
  report.success = true;
} finally {
  report.completedAt = new Date().toISOString();
  fs.writeFileSync(path.join(root, 'artifacts', `peru-563-promotion-${runId}.json`), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify(report, null, 2));
