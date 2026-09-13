import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

// Sólo acepta contenedores PostgreSQL efímeros del runner integrado. No admite
// URLs, credenciales ni destinos existentes para restaurar.
const [source, outputArg] = process.argv.slice(2);
if (!source || !outputArg || process.argv.length !== 4) throw new Error('Uso: sourceContainer outputDirectory');
const output = path.resolve(outputArg);
const artifacts = path.resolve('artifacts');
assert.ok(output.startsWith(artifacts + path.sep), 'La evidencia debe estar en artifacts');
mkdirSync(output, { recursive: true });
function docker(args, options = {}) {
  return execFileSync('docker', args, { windowsHide: true, timeout: 120000, maxBuffer: 100 * 1024 * 1024, ...options });
}
const inspection = JSON.parse(docker(['inspect', source], { encoding: 'utf8' }))[0];
assert.match(inspection.Name, /^\/erp-peru-integrated-\d+-\d+-pg$/);
assert.equal(inspection.Config.Image, 'postgres:16');
function sql(container, statement) {
  return docker(['exec', '-i', container, 'psql', '-XqAt', '-U', 'postgres', '-d', 'erp_e2e', '-v', 'ON_ERROR_STOP=1'],
    { input: statement, encoding: 'utf8' }).trim();
}
assert.equal(sql(source, "SELECT current_database()||'|'||environment||'|'||project_ref FROM app.deployment_environment WHERE singleton;"),
  'erp_e2e|DEV|localerpephemeralqax');

const hashesSql = `SET timezone='UTC';
SELECT format('SELECT ''ROW|'' || json_build_object(''table'',%L,''count'',count(*),''digest'',md5(coalesce(string_agg(md5(to_jsonb(t)::text),'''' ORDER BY md5(to_jsonb(t)::text)),'''')))::text FROM %I.%I t;',
  schemaname||'.'||tablename,schemaname,tablename)
FROM pg_tables WHERE schemaname IN ('public','app','auth','storage') ORDER BY schemaname,tablename
\\gexec
`;
const parseHashes = value => value.split(/\r?\n/).filter(line => line.startsWith('ROW|')).map(line => JSON.parse(line.slice(4)));
let target;
let transaction;
let successful = false;
const started = Date.now();
try {
  transaction = spawn('docker', ['exec', '-i', source, 'psql', '-XqAt', '-U', 'postgres', '-d', 'erp_e2e', '-v', 'ON_ERROR_STOP=1'],
    { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  // Mantener viva la transacción exportadora hasta terminar dump y huellas.
  // Ambos lectores usan exactamente el mismo snapshot, aunque la API escriba.
  const snapshot = await new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => reject(new Error('No se pudo exportar snapshot')), 30000);
    transaction.once('error', reject);
    transaction.once('exit', code => { if (code) reject(new Error('Falló la transacción de snapshot')); });
    transaction.stdout.on('data', chunk => {
      buffer += chunk.toString();
      const match = buffer.match(/SNAPSHOT\|([0-9A-Fa-f-]+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
    transaction.stdin.write("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SELECT 'SNAPSHOT|'||pg_export_snapshot();\n");
  });
  assert.match(snapshot, /^[0-9A-Fa-f-]+$/);
  const archive = docker(['exec', source, 'pg_dump', '-U', 'postgres', '-d', 'erp_e2e', '--format=custom', `--snapshot=${snapshot}`]);
  writeFileSync(path.join(output, 'database.dump'), archive);
  const expected = parseHashes(sql(source, `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET TRANSACTION SNAPSHOT '${snapshot}';\n${hashesSql}\nCOMMIT;`));
  assert.ok(expected.length > 100, 'Se deben verificar todas las tablas de la aplicación');
  transaction.stdin.end('COMMIT;\n\\q\n');
  const roles = docker(['exec', source, 'pg_dumpall', '-U', 'postgres', '--roles-only', '--no-role-passwords'], { encoding: 'utf8' })
    .replace(/^CREATE ROLE postgres;\r?\n/m, '');
  const restoreStarted = Date.now();
  target = docker(['run', '--rm', '--detach', '--name', `erp-peru-restore-${Date.now()}-${process.pid}`,
    '--network', 'none', '--env', 'POSTGRES_DB=erp_e2e', '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:16'], { encoding: 'utf8' }).trim();
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      docker(['exec', target, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'erp_e2e'], { stdio: 'ignore' });
      ready = true;
      break;
    } catch { await delay(1000); }
  }
  assert.ok(ready, 'La base nueva debe estar disponible');
  sql(target, roles);
  docker(['exec', '-i', target, 'pg_restore', '-U', 'postgres', '-d', 'erp_e2e', '--exit-on-error', '--single-transaction'], { input: archive });
  const actual = parseHashes(sql(target, hashesSql));
  assert.deepEqual(actual, expected, 'El respaldo restaurado debe conservar cada tabla y cada fila del snapshot');
  const acl = sql(target, "SELECT has_function_privilege('service_role','public.validar_contexto_sesion_auth_tx(text,uuid,uuid,boolean)','EXECUTE') AND NOT has_table_privilege('service_role','public.audit_log','INSERT') AND (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='public.audit_log'::regclass);");
  assert.equal(acl, 't', 'La restauración debe conservar permisos y RLS');
  const report = { success: true, completedAt: new Date().toISOString(), remoteWrites: false,
    source: inspection.Name, database: 'PostgreSQL 16 local efímero', tables: actual.length,
    rows: actual.reduce((sum, table) => sum + table.count, 0), archiveBytes: archive.length,
    archiveSha256: createHash('sha256').update(archive).digest('hex'),
    elapsedMs: Date.now() - started, restoreMs: Date.now() - restoreStarted,
    checks: ['mismo snapshot para dump y huellas', 'contenido íntegro de todas las tablas', 'restore atómico sin errores', 'ACL y RLS conservados'],
    limits: ['No acredita backup de PROD', 'No incluye archivos externos de Storage ni disponibilidad del proveedor', 'Duración local no equivale a RTO productivo'] };
  writeFileSync(path.join(output, 'restore.json'), JSON.stringify(report, null, 2));
  writeFileSync(path.join(output, 'table-fingerprints.json'), JSON.stringify(actual, null, 2));
  successful = true;
  console.log(`PASS restauración local: ${actual.length} tablas verificadas`);
} finally {
  if (transaction?.stdin.writable) transaction.stdin.end('ROLLBACK;\n\\q\n');
  if (target) docker(['stop', '--time', '2', target], { stdio: 'ignore' });
  if (!successful) writeFileSync(path.join(output, 'restore-failure.json'), JSON.stringify({ success: false, remoteWrites: false, at: new Date().toISOString() }));
}
