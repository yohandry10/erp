import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { readMigrationVersions, preservedPrivilegesSql, assertReadPrivilegesPreserved } from './ci/read-migration-privileges.mjs';

// Sin URLs, dotenv, puertos publicados ni destinos de restauración configurables.
// Sólo escribe en un contenedor nuevo, propio y sin red. Nunca toca PROD.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [manifestArg] = process.argv.slice(2);
assert.equal(process.argv.length, 3, 'Uso: node scripts/rehearse-peru-prod-local.mjs artifacts/peru-prod-backup-<id>.json');
const manifestPath = path.resolve(manifestArg);
assert.equal(path.dirname(manifestPath), path.join(root, 'artifacts'));
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
assert.equal(manifest.project, 'wypnbcptofqdmoynlonq');
assert.equal(manifest.remoteWrites, false);
const archivePath = fs.realpathSync(manifest.archive);
assert.equal(path.dirname(archivePath), fs.realpathSync(path.join(root, 'artifacts/db-backups')));
const archive = fs.readFileSync(archivePath);
assert.equal(createHash('sha256').update(archive).digest('hex'), manifest.sha256);
assert.equal(archive.length, manifest.bytes);
const runId = new Date().toISOString().replace(/[^0-9]/g, '') + '-' + process.pid;
const containerName = `erp-peru-prod-rehearsal-${runId}`;
const privateLog = path.join(root, 'artifacts/db-backups', `${containerName}.log`);
const reportPath = path.join(root, 'artifacts', `${containerName}.json`);
const report = { success: false, remoteWrites: false, archiveSha256: manifest.sha256,
  archiveBytes: archive.length, network: 'none', database: 'erp_e2e', image: 'postgres:17-alpine',
  migrations: [], verifiers: [], limits: ['No restaura objetos externos de Storage ni roles globales.',
    'Roles locales sin login; propietarios se reasignan a postgres sólo en la copia.',
    'El tiempo local no acredita RTO del proveedor.'] };
let container;
let step = 'bootstrap';
const started = Date.now();
function docker(args, input) {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', windowsHide: true,
    timeout: 180000, maxBuffer: 30 * 1024 * 1024 });
  if (result.status !== 0) {
    // Errores PostgreSQL pueden contener valores reales. El log nunca se versiona.
    fs.appendFileSync(privateLog, `\n${step}\n${result.stderr || result.error?.message || 'Fallo sin stderr'}\n`);
    throw new Error(`Falló ${step}; diagnóstico privado en artifacts/db-backups/*.log`);
  }
  return result.stdout.trim();
}
function sql(statement) {
  return docker(['exec', '-i', container, 'psql', '-XqAt', '-U', 'postgres', '-d', 'erp_e2e', '-v', 'ON_ERROR_STOP=1'], statement);
}
const quote = value => "'" + value.replaceAll("'", "''") + "'";
const hashes = `SET timezone='UTC';
SELECT format('SELECT json_build_object(''table'',%L,''count'',count(*),''digest'',md5(coalesce(string_agg(md5(jsonb_strip_nulls(to_jsonb(t))::text),'''' ORDER BY md5(jsonb_strip_nulls(to_jsonb(t))::text)),'''')))::text FROM %I.%I t;',
  schemaname||'.'||tablename,schemaname,tablename)
FROM pg_tables WHERE schemaname IN ('public','app','auth','storage','supabase_migrations') ORDER BY schemaname,tablename
\\gexec
`;
const fingerprint = () => sql(hashes).split(/\r?\n/).filter(line => line.startsWith('{')).map(JSON.parse);
const security = () => JSON.parse(sql(`SELECT json_build_object('tables',(SELECT coalesce(json_agg(t ORDER BY t.schema,t.name),'[]') FROM (
  SELECT n.nspname AS schema,c.relname AS name,c.relrowsecurity AS rls,c.relforcerowsecurity AS forced
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE c.relkind IN ('r','p') AND n.nspname IN ('public','app','auth','storage')) t),
  'policies',(SELECT coalesce(json_agg(p ORDER BY schemaname,tablename,policyname),'[]') FROM pg_policies p
    WHERE schemaname IN ('public','app','auth','storage')));`));
const columns = () => JSON.parse(sql(`SELECT coalesce(json_agg(t ORDER BY relation,column_name),'[]') FROM (
  SELECT n.nspname||'.'||c.relname AS relation,a.attname AS column_name,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS required
  FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped
    AND n.nspname IN ('public','app','auth','storage','supabase_migrations')) t;`));
try {
  container = docker(['run', '--rm', '--detach', '--name', containerName, '--label', `erp.peru.rehearsal=${runId}`,
    '--network', 'none', '--env', 'POSTGRES_DB=erp_e2e', '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', report.image]);
  const inspection = JSON.parse(docker(['inspect', container]))[0];
  assert.equal(inspection.Name, '/' + containerName);
  assert.equal(inspection.Config.Labels['erp.peru.rehearsal'], runId);
  assert.equal(inspection.HostConfig.NetworkMode, 'none');
  assert.deepEqual(inspection.HostConfig.PortBindings, {});
  let ready = false;
  for (let i = 0; i < 30; i++) {
    const probe = spawnSync('docker', ['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'erp_e2e'], { windowsHide: true, stdio: 'ignore' });
    if (probe.status === 0) { ready = true; break; }
    await delay(500);
  }
  assert.ok(ready, 'PostgreSQL debe arrancar');
  assert.equal(sql('SELECT current_database();'), 'erp_e2e');
  assert.equal(sql("SELECT count(*) FROM pg_tables WHERE schemaname IN ('app','auth','storage','supabase_migrations','public');"), '0');
  docker(['cp', archivePath, `${container}:/tmp/source.dump`]);
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
  // public ya existe para las extensiones; conservar todas sus ACL/comentarios.
  const catalog = docker(['exec', container, 'pg_restore', '--list', '/tmp/source.dump']);
  const catalogLines = catalog.split('\n');
  const publicSchemaEntry = line => /^\d+; \d+ \d+ SCHEMA - public /.test(line);
  assert.equal(catalogLines.filter(publicSchemaEntry).length, 1);
  docker(['exec', '-i', container, 'sh', '-c', 'cat > /tmp/restore.list'], catalogLines.filter(line => !publicSchemaEntry(line)).join('\n'));
  step = 'restauración atómica';
  const restoreStarted = Date.now();
  docker(['exec', container, 'pg_restore', '-U', 'postgres', '-d', 'erp_e2e', '--no-owner', '--exit-on-error', '--single-transaction', '--use-list=/tmp/restore.list', '/tmp/source.dump']);
  report.restoreMs = Date.now() - restoreStarted;
  report.restoreVerified = true;
  report.serverVersion = sql('SHOW server_version;');
  const history = JSON.parse(sql("SELECT json_agg(t ORDER BY version::integer) FROM (SELECT version,name FROM supabase_migrations.schema_migrations WHERE version ~ '^[0-9]{1,9}$') t;"));
  assert.equal(Math.max(...history.map(row => Number(row.version))), 536, 'El respaldo debe corresponder al rango previsto');
  const files = fs.readdirSync(path.join(root, 'supabase/migrations')).filter(file => /^\d+__.*\.sql$/.test(file));
  const versions = files.map(file => Number(file.split('__')[0]));
  assert.equal(new Set(versions).size, versions.length, 'Prefijos duplicados');
  for (const row of history.filter(row => Number(row.version) >= 533)) {
    const filename = files.find(file => Number(file.split('__')[0]) === Number(row.version));
    assert.ok(filename && filename.slice(filename.indexOf('__') + 2, -4).replace(/^_/, '') === row.name.replace(/^_/, ''), `Historia distinta: ${row.version}`);
  }
  report.historyBefore = history.filter(row => Number(row.version) >= 529);
  report.policyBefore = JSON.parse(sql('SELECT to_jsonb(t) FROM app.deployment_environment t WHERE singleton;'));
  report.inheritedRuntimeDml = JSON.parse(sql(`SELECT coalesce(json_agg(c.relname ORDER BY c.relname),'[]')
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p')
      AND has_table_privilege('service_role',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE');`));
  report.limits.push('Conservar ACL heredadas no certifica privilegio mínimo de todos los módulos.');
  const before = fingerprint();
  const securityBefore = security();
  const columnsBefore = columns();
  const originalPrivileges = sql(preservedPrivilegesSql);
  const widenedPrivileges = sql(`BEGIN; GRANT UPDATE ON public.usuario_sucursales TO PUBLIC; ${preservedPrivilegesSql} ROLLBACK;`);
  assert.throws(() => assertReadPrivilegesPreserved(originalPrivileges, widenedPrivileges, 'control-negativo'));
  assert.equal(sql(preservedPrivilegesSql), originalPrivileges);
  report.aclNegativeControlPassed = true;
  // Guardar multiconjunto de filas para detectar incluso reemplazos con igual conteo.
  sql(`CREATE SCHEMA local_rehearsal;
CREATE TABLE local_rehearsal.original_rows (relation text,row_hash text);
SELECT format('INSERT INTO local_rehearsal.original_rows SELECT %L,md5(jsonb_strip_nulls(to_jsonb(t))::text) FROM %I.%I t;',
  schemaname||'.'||tablename,schemaname,tablename)
FROM pg_tables WHERE schemaname IN ('public','app','auth','storage','supabase_migrations')
\\gexec`);
  const pending = files.filter(file => { const n = Number(file.split('__')[0]); return n >= 537 && n <= 552; }).sort();
  assert.equal(pending.length, 16);
  console.log('[peru-rehearsal] Respaldo restaurado; aplicando 537..552 en copia local');
  for (const filename of pending) {
    step = `migración ${filename}`;
    const body = fs.readFileSync(path.join(root, 'supabase/migrations', filename), 'utf8');
    assert.match(body, /\bBEGIN;/);
    assert.match(body, /COMMIT;\s*$/);
    const version = filename.split('__')[0];
    const name = filename.replace(/^\d+_/, '').replace(/\.sql$/, '');
    const privilegesBefore = readMigrationVersions.has(Number(version)) ? sql(preservedPrivilegesSql) : null;
    // Registrar historia en la misma transacción: no deja esquema sin historial.
    const input = body.replace(/COMMIT;\s*$/, () => `INSERT INTO supabase_migrations.schema_migrations(version,statements,name) VALUES (${quote(version)},ARRAY[${quote(body)}],${quote(name)});\nCOMMIT;\n`);
    const migrationStarted = Date.now();
    sql(input);
    if (privilegesBefore !== null) assertReadPrivilegesPreserved(privilegesBefore, sql(preservedPrivilegesSql), version);
    report.migrations.push({ version: Number(version), sha256: createHash('sha256').update(body).digest('hex'), elapsedMs: Date.now() - migrationStarted });
  }
  const after = fingerprint();
  report.changedTables = after.filter(table => before.find(old => old.table === table.table)?.digest !== table.digest)
    .map(table => ({ table: table.table, before: before.find(old => old.table === table.table)?.count ?? 0, after: table.count }));
  const allowed = ['public.plan_cuentas', 'public.conceptos_planilla', 'supabase_migrations.schema_migrations'];
  assert.ok(report.changedTables.every(table => allowed.includes(table.table)), 'Cambio de datos fuera de los backfills previstos');
  sql(`CREATE TABLE local_rehearsal.current_rows (LIKE local_rehearsal.original_rows);
SELECT format('INSERT INTO local_rehearsal.current_rows SELECT %L,md5(jsonb_strip_nulls(to_jsonb(t))::text) FROM %I.%I t;',
  schemaname||'.'||tablename,schemaname,tablename)
FROM pg_tables WHERE schemaname IN ('public','app','auth','storage','supabase_migrations')
\\gexec`);
  assert.equal(sql('SELECT count(*) FROM (SELECT * FROM local_rehearsal.original_rows EXCEPT ALL SELECT * FROM local_rehearsal.current_rows) missing;'), '0', 'Todas las filas existentes deben conservarse');
  assert.deepEqual(security(), securityBefore, 'RLS no debe relajarse');
  const columnsAfter = new Set(columns().map(column => JSON.stringify(column)));
  assert.ok(columnsBefore.every(column => columnsAfter.has(JSON.stringify(column))), 'No se deben eliminar ni alterar columnas previas');
  report.existingColumnsPreserved = columnsBefore.length;
  assert.deepEqual(JSON.parse(sql('SELECT to_jsonb(t) FROM app.deployment_environment t WHERE singleton;')), report.policyBefore);
  report.existingRowsPreserved = before.reduce((sum, table) => sum + table.count, 0);
  report.tables = before.length;
  for (const filename of pending) {
    step = `verificador ${filename}`;
    const verifier = fs.readFileSync(path.join(root, 'supabase/verify', filename), 'utf8');
    assert.match(verifier, /ROLLBACK;\s*$/);
    sql(verifier);
    report.verifiers.push(Number(filename.split('__')[0]));
  }
  assert.deepEqual(fingerprint(), after, 'Los verificadores deben revertir todos los datos sintéticos');
  report.readiness = JSON.parse(sql('SELECT public.outbox_runtime_health_492(p_required_schema_version => 552);'));
  assert.equal(report.readiness.ready, true);
  report.success = true;
  report.rlsPreserved = true;
  report.verifiersRolledBack = true;
  console.log('[peru-rehearsal] PASS: 16 migraciones, datos existentes, RLS y verificadores');
} catch (error) {
  report.failedStep = step;
  report.failure = error.message;
  throw error;
} finally {
  report.elapsedMs = Date.now() - started;
  report.completedAt = new Date().toISOString();
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  if (container) {
    const inspection = JSON.parse(docker(['inspect', container]))[0];
    assert.equal(inspection.Config.Labels['erp.peru.rehearsal'], runId);
    docker(['stop', '--time', '2', container]);
  }
}
