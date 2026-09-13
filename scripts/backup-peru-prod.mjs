import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Sólo lectura remota. La restauración/ensayo se hace después en un contenedor aislado.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = name => process.argv[process.argv.indexOf(name) + 1];
if (!process.argv.includes('--env-file') || !process.argv.includes('--pg-bin')) {
  throw new Error('Se requieren --env-file .env.production y --pg-bin con PostgreSQL 17');
}
const envFile = path.resolve(arg('--env-file'));
if (path.basename(envFile) !== '.env.production') throw new Error('Sólo .env.production es operativo');
const pgBin = path.resolve(arg('--pg-bin'));
const require = createRequire(path.join(root, 'apps/erp-api/package.json'));
const values = require('dotenv').parse(fs.readFileSync(envFile));
const project = 'wypnbcptofqdmoynlonq';
if (values.DEPLOYMENT_ENV !== 'PROD' || values.EXPECTED_SUPABASE_PROJECT_REF !== project
  || new URL(values.SUPABASE_URL).origin !== `https://${project}.supabase.co`) {
  throw new Error('Respaldo bloqueado: destino fuera del único PROD autorizado');
}
const preflight = spawnSync('powershell.exe', ['-NoProfile', '-File', path.join(root, 'scripts/db-environment-preflight.ps1'),
  '-Environment', 'PROD', '-EnvFile', envFile], { encoding: 'utf8', windowsHide: true, timeout: 60_000 });
if (preflight.status !== 0) throw new Error('El preflight PROD no pasó; no se inició el respaldo');
const pgDump = path.join(pgBin, 'pg_dump.exe');
const pgRestore = path.join(pgBin, 'pg_restore.exe');
const version = spawnSync(pgDump, ['--version'], { encoding: 'utf8', windowsHide: true });
if (version.status !== 0 || !/PostgreSQL\) 17\./.test(version.stdout)) throw new Error('Se exige cliente PostgreSQL 17');
const connection = new URL(values.DATABASE_URL);
const connectionEnvironment = {
  ...process.env, PGHOST: connection.hostname, PGPORT: connection.port || '5432',
  PGDATABASE: decodeURIComponent(connection.pathname.slice(1)), PGUSER: decodeURIComponent(connection.username),
  PGPASSWORD: decodeURIComponent(connection.password), PGSSLMODE: 'require', PGCONNECT_TIMEOUT: '20',
  PGAPPNAME: 'erp-peru-production-backup',
  PGOPTIONS: '-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=10000',
};
delete connectionEnvironment.PGSERVICE;
delete connectionEnvironment.PGSERVICEFILE;
const runId = new Date().toISOString().replace(/[^0-9]/g, '');
const directory = path.join(root, 'artifacts/db-backups');
fs.mkdirSync(directory, { recursive: true });
const archive = path.join(directory, `prod-pre-peru-552-${runId}.dump`);
const schemas = ['public', 'app', 'auth', 'storage', 'supabase_migrations'];
const started = Date.now();
const backup = spawnSync(pgDump, ['--format=custom', '--no-owner', '--lock-wait-timeout=10s', '--file', archive,
  ...schemas.map(schema => `--schema=${schema}`)], {
  env: connectionEnvironment, encoding: 'utf8', windowsHide: true, timeout: 600_000, maxBuffer: 5 * 1024 * 1024,
});
if (backup.status !== 0) {
  // Se conserva para diagnóstico local, bajo la política *.log ignorada por Git.
  fs.writeFileSync(`${archive}.log`, backup.stderr || 'Fallo de proceso al respaldar');
  throw new Error('El respaldo no terminó correctamente; no usar el archivo parcial');
}
const catalog = spawnSync(pgRestore, ['--list', archive], { encoding: 'utf8', windowsHide: true, timeout: 60_000, maxBuffer: 10 * 1024 * 1024 });
if (catalog.status !== 0) throw new Error('El catálogo del respaldo no es legible');
const report = {
  completedAt: new Date().toISOString(), project, remoteWrites: false, archive,
  schemas, bytes: fs.statSync(archive).size, sha256: createHash('sha256').update(fs.readFileSync(archive)).digest('hex'),
  catalogEntries: catalog.stdout.split('\n').filter(line => /^\d+;/.test(line)).length,
  durationMs: Date.now() - started, restoreVerified: false,
  limits: 'Respaldo lógico de esquemas de la aplicación. No incluye objetos externos de Storage ni roles globales.',
};
fs.writeFileSync(path.join(root, 'artifacts', `peru-prod-backup-${runId}.json`), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
