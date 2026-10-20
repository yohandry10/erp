import { spawn, execFileSync } from 'node:child_process';
import { openSync, closeSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

// Ensayo enfocado de autenticación: misma base nueva que CI (todas las
// migraciones y verificadores), PostgREST, buzón SMTP local, API real y web.
// No toma URLs de Supabase ni carga dotenv; sólo detiene lo que creó.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const withBrowser = process.argv.includes('--browser');
// Cada bloque declara fixtures, sonda HTTP, spec de navegador y fuentes a sellar.
const blocks = {
  auth: { kinds: ['auth-first', 'auth-other'], browserKind: 'auth-browser', probe: 'scripts/ci/test-peru-auth-recovery-local.mjs',
    spec: 'tests/e2e/peru-auth-recovery-local.spec.ts', scope: 'auth_recovery_sessions_subset',
    sources: ['apps/erp-api/src/modules/auth/auth.controller.ts', 'apps/erp-api/src/modules/auth/auth.service.ts', 'apps/erp-api/src/shared/email/email.service.ts',
      'apps/web/app/reset-password/page.tsx', 'apps/web/app/login/page.tsx'] },
  approvals: { kinds: ['aprob-first', 'aprob-other'], browserKind: 'aprob-browser', probe: 'scripts/ci/test-peru-sales-approvals-local.mjs',
    spec: 'tests/e2e/peru-sales-approvals-local.spec.ts', scope: 'sales_approvals_subset',
    sources: ['apps/erp-api/src/modules/ventas/pedidos/pedidos.service.ts', 'apps/erp-api/src/modules/ventas/pedidos/pedidos.controller.ts',
      'apps/web/app/dashboard/ventas/aprobaciones/page.tsx'] },
  invoice: { kinds: ['fact-first', 'fact-other'], browserKind: 'fact-browser', probe: 'scripts/ci/test-peru-sales-invoice-local.mjs',
    spec: 'tests/e2e/peru-sales-invoice-local.spec.ts', scope: 'sales_order_invoice_subset',
    sources: ['apps/erp-api/src/modules/ventas/pedidos/pedidos.service.ts', 'apps/erp-api/src/modules/ventas/pedidos/cpe-integration.service.ts',
      'apps/web/components/ventas/GenerarFacturaButton.tsx'] },
  tenants: { kinds: [], probe: 'scripts/ci/test-peru-tenant-create-local.mjs',
    spec: 'tests/e2e/peru-tenant-create-local.spec.ts', scope: 'tenant_create_subset',
    sources: ['apps/erp-api/src/modules/tenants/tenant-management.service.ts', 'apps/web/components/superadmin/components/CrearTenantModal.tsx'] },
  dashboard: { kinds: ['dash-first', 'dash-other'], probe: 'scripts/ci/test-peru-dashboard-local.mjs', env: { TZ: 'UTC' },
    spec: 'tests/e2e/peru-dashboard-local.spec.ts', scope: 'dashboard_home_subset',
    sources: ['apps/erp-api/src/modules/dashboard/dashboard-metrics.service.ts', 'apps/erp-api/src/modules/dashboard.controller.ts', 'apps/web/app/dashboard/page.tsx'] },
  payables_dates: { kinds: ['tz-first'], probe: 'scripts/ci/test-peru-payables-dates-local.mjs',
    // Render corre en UTC; PERU_BLOCK_TZ permite otra zona cuando UTC y Lima coinciden de día.
    env: { TZ: process.env.PERU_BLOCK_TZ || 'UTC' },
    spec: 'tests/e2e/peru-payables-dates-local.spec.ts', scope: 'payables_dates_subset',
    sources: ['apps/erp-api/src/modules/finanzas/cxp/cxp.service.ts', 'apps/erp-api/src/modules/finanzas/tesoreria/tesoreria.service.ts'] },
  read_faults: { kinds: ['rf-first'], probe: 'scripts/ci/test-peru-read-faults-local.mjs',
    spec: 'tests/e2e/peru-read-faults-local.spec.ts', scope: 'read_faults_subset',
    sources: ['apps/erp-api/src/modules/inventario/inventario.controller.ts', 'apps/web/app/dashboard/inventario/productos/page.tsx'] },
  budgets: { kinds: ['pres-first', 'pres-other'], browserKind: 'pres-browser', probe: 'scripts/ci/test-peru-budgets-local.mjs',
    spec: 'tests/e2e/peru-budgets-local.spec.ts', scope: 'accounting_budgets_subset',
    sources: ['apps/erp-api/src/modules/contabilidad/services/presupuestos.service.ts', 'apps/web/components/contabilidad/PresupuestoForm.tsx'] },
  derived_keys: { kinds: ['dk-first'], probe: 'scripts/ci/test-peru-derived-keys-local.mjs',
    spec: 'tests/e2e/peru-derived-keys-local.spec.ts', scope: 'derived_keys_subset',
    sources: ['apps/erp-api/src/modules/contabilidad/services/tipos-cambio.service.ts', 'apps/erp-api/src/modules/contabilidad/services/centros-costo.service.ts', 'apps/erp-api/src/modules/finanzas/cxp/cxp.service.ts'] },
  statements: { kinds: ['est-first'], probe: 'scripts/ci/test-peru-statements-refresh-local.mjs',
    spec: 'tests/e2e/peru-statements-refresh-local.spec.ts', scope: 'statements_refresh_subset',
    sources: ['apps/web/app/dashboard/contabilidad/estados/page.tsx'] },
  cxc: { kinds: ['cxc-first', 'cxc-other'], browserKind: 'cxc-browser', probe: 'scripts/ci/test-peru-cxc-operations-local.mjs',
    spec: 'tests/e2e/peru-cxc-local.spec.ts', scope: 'cxc_reprogram_credit_note_subset',
    sources: ['apps/erp-api/src/modules/finanzas/cxc/cxc.service.ts', 'apps/erp-api/src/modules/finanzas/cxc/cxc.controller.ts',
      'apps/web/components/finanzas/cxc/ReprogramarModal.tsx', 'apps/web/components/finanzas/cxc/NotaCreditoModal.tsx'] },
  notifications: { kinds: ['notif-first', 'notif-other'], browserKind: 'notif-browser', probe: 'scripts/ci/test-peru-notifications-local.mjs',
    spec: 'tests/e2e/peru-notifications-local.spec.ts', scope: 'notifications_subset',
    sources: ['apps/erp-api/src/modules/notifications.controller.ts', 'apps/erp-api/src/modules/notifications/notifications.service.ts',
      'apps/web/components/notifications/NotificationPanel.tsx', 'apps/web/components/notifications/NotificationItem.tsx', 'apps/web/components/notifications/NotificationBell.tsx'] },
};
const blockIndex = process.argv.indexOf('--block');
const blockName = process.argv[blockIndex + 1];
const block = blocks[blockName];
if (blockIndex < 0 || !block || process.argv.slice(2).some((arg, index) => !['--browser', '--block'].includes(arg) && index !== blockIndex - 1)) {
  throw new Error('Uso: node artifacts/peru-block-runner-20261019.mjs --block <' + Object.keys(blocks).join('|') + '> [--browser]');
}
const runId = new Date().toISOString().replace(/[^0-9]/g, '') + '-' + process.pid;
const output = path.join(root, 'artifacts', `peru-${blockName}-local-${runId}`);
mkdirSync(output, { recursive: true });
const proofFiles = ['artifacts/peru-block-runner-20261019.mjs', block.probe, 'scripts/ci/peru-local-smtp-sink.mjs',
  'scripts/ci/prepare-peru-first-client-local.mjs', 'apps/erp-api/tests/e2e/helpers/local-api-harness.ts', ...block.sources, 'apps/web/' + block.spec];
const hash = file => { try { return createHash('sha256').update(readFileSync(path.join(root, file))).digest('hex'); } catch { return null; } };
writeFileSync(path.join(output, 'provenance.json'), JSON.stringify({ capturedAt: new Date().toISOString(), capture: 'Before launch',
  source_hashes: Object.fromEntries(proofFiles.map(file => [file, hash(file)])), complete_acceptance: false, remoteWrites: false }, null, 2));
const network = `erp-peru-integrated-${runId}`;
const containers = [];
const children = [];
let createdNetwork = false;
const pgPort = '55470', restPort = '55471', smtpPort = '55472', apiPort = '3270', webPort = '3209';
const apiUrl = `http://127.0.0.1:${apiPort}`;
const webUrl = `http://127.0.0.1:${webPort}`;
// distDir estable: reutiliza la compilación de Next entre ensayos locales (una
// compilación en frío de /dashboard supera el plazo de 25 s del login local).
const distDir = `.next-peru-block-local`;
const apiDirectory = path.join(root, 'apps/erp-api');
const webDirectory = path.join(root, 'apps/web');
const apiRequire = createRequire(path.join(apiDirectory, 'package.json'));
const webRequire = createRequire(path.join(webDirectory, 'package.json'));
const generatedFiles = withBrowser ? ['tsconfig.json', 'next-env.d.ts'].map(name => ({
  name, file: path.join(webDirectory, name), before: readFileSync(path.join(webDirectory, name)),
})) : [];
const env = { ...process.env };
for (const key of Object.keys(env)) {
  if (/^(SUPABASE_|NEXT_PUBLIC_SUPABASE_|EXPECTED_SUPABASE_|SUNAT_|OSE_|SMTP_|PFX_|CERT_|CERTIFICATE_|STRIPE_|SIRE_|DIAN_|ARCA_|REDIS_|PG|APP_URL)/.test(key)) delete env[key];
}
// Un bloque puede fijar el entorno del runtime que emula (p. ej. TZ=UTC de Render).
Object.assign(env, block.env ?? {});
Object.assign(env, {
  POS_WORKER_JWT_SECRET: 'LOCAL-POS-WORKER-2026-Only-Ephemeral-Secret',
  NODE_ENV: 'development', JWT_SECRET: 'local-api-integration-jwt-key-20260905-never-production',
  EMAIL_DISABLED: 'true', EMAIL_PROVIDER: 'smtp', LOCAL_SMTP_PORT: smtpPort,
  LOCAL_INTEGRATED_FOCUS: 'full',
  E2E_EPHEMERAL_LOCAL_DB: '1', E2E_ISOLATED_BROWSER: '0',
  LOCAL_API_URL: apiUrl, LOCAL_API_PORT: apiPort, LOCAL_WEB_URL: webUrl,
  LOCAL_POSTGREST_URL: `http://127.0.0.1:${restPort}`,
  LOCAL_INTEGRATED_OUTPUT_DIR: output,
  DEMO_PFX_PATH: path.join(output, 'demo.pfx'),
  PGHOST: '127.0.0.1', PGPORT: pgPort, PGDATABASE: 'erp_e2e', PGUSER: 'postgres',
  PGPASSWORD: '', PSQL_BIN: process.env.PSQL_BIN || 'psql',
  DEPLOYMENT_ENV: 'PROD', NEXT_PUBLIC_API_URL: apiUrl,
  NEXT_PUBLIC_API_PROXY: '1', NEXT_PUBLIC_COOKIE_AUTH: '1',
  NEXT_DIST_DIR: distDir,
  PLAYWRIGHT_SKIP_GLOBAL_AUTH: '1', PLAYWRIGHT_SKIP_WEBSERVER: '1', BASE_URL: webUrl,
});
delete env.REQUIRED_DATABASE_SCHEMA_VERSION;

const docker = args => execFileSync('docker', args, { encoding: 'utf8', windowsHide: true, timeout: 60000 }).trim();
function launch(label, executable, args, cwd = root) {
  const log = openSync(path.join(output, `${label}.log`), 'w');
  const child = spawn(executable, args, { cwd, env, windowsHide: true, stdio: ['ignore', log, log] });
  closeSync(log);
  children.push(child);
  return child;
}
async function run(label, executable, args, cwd) {
  console.log(`[peru-block] ${label}`);
  const child = launch(label, executable, args, cwd);
  await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${label} terminó con ${code}; revisar ${output}`)));
  });
}
async function waitReady(label, probe, child) {
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) throw new Error(`${label} terminó antes de estar listo`);
    try { if (await probe()) return; } catch { /* Todavía inicia; el límite es explícito. */ }
    await delay(500);
  }
  throw new Error(`${label} no estuvo listo a tiempo`);
}
async function httpReady(url) {
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(2000) });
  await response.body?.cancel();
  return response.status < 500;
}
function rememberContainer(args) {
  const id = docker(['run', '--rm', '--detach', ...args]);
  if (!/^[0-9a-f]{64}$/.test(id)) throw new Error('Docker no devolvió un ID de contenedor');
  containers.push(id);
  return id;
}
async function cleanupNow() {
  for (const child of children.reverse()) {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null) continue;
    try {
      if (process.platform === 'win32') execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      else child.kill('SIGTERM');
    } catch { /* El proceso puede haber terminado mientras se cerraba. */ }
  }
  for (const id of containers.reverse()) {
    try { docker(['stop', '--time', '2', id]); } catch (error) { console.error(`No se pudo detener ${id}: ${error.message}`); }
  }
  if (createdNetwork) {
    try { docker(['network', 'rm', network]); } catch (error) { console.error(`No se pudo retirar ${network}: ${error.message}`); }
  }
  const stable = value => JSON.stringify(value, (key, entry) => {
    if (key === 'include' && Array.isArray(entry)) return [...entry].sort();
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) return Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b)));
    return entry;
  });
  for (const snapshot of generatedFiles) {
    const before = snapshot.before.toString('utf8');
    const current = readFileSync(snapshot.file, 'utf8');
    let onlyGenerated = false;
    if (snapshot.name === 'tsconfig.json') {
      const parsed = JSON.parse(current);
      parsed.include = parsed.include.filter(entry => entry !== `${distDir}/types/**/*.ts`);
      onlyGenerated = stable(parsed) === stable(JSON.parse(before));
    } else {
      const previousRouteRoot = before.match(/path="\.\/([^\"]+)\/types\/routes\.d\.ts"/)?.[1] || '.next';
      onlyGenerated = current.replaceAll(distDir, previousRouteRoot).replaceAll('\r\n', '\n') === before.replaceAll('\r\n', '\n');
    }
    if (onlyGenerated) writeFileSync(snapshot.file, snapshot.before);
    else console.warn(`[peru-block] Se conserva ${snapshot.name}: hay diferencias adicionales a las generadas por este ensayo`);
  }
}
let cleanupTask;
const cleanup = () => cleanupTask ??= cleanupNow();
for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]]) process.once(signal, async () => { await cleanup(); process.exit(code); });

let success = false, probeFailure, browserFailure;
try {
  console.log(`[peru-block] Evidencia: ${output}`);
  for (const library of ['dtos', 'crypto']) await run(`build-${library}`, process.execPath, [apiRequire.resolve('typescript/bin/tsc'), '--project', 'tsconfig.json'], path.join(root, 'libs', library));
  await run('demo-certificate', process.execPath, [path.join(apiDirectory, 'scripts/generate-demo-pfx.cjs'), env.DEMO_PFX_PATH]);
  await run('harness-typecheck', process.execPath, [apiRequire.resolve('typescript/bin/tsc'), '--project', 'tests/e2e/tsconfig.local.json'], apiDirectory);
  docker(['network', 'create', '--label', `com.erp.local-test=${runId}`, network]);
  createdNetwork = true;
  const pgName = `${network}-pg`;
  const pg = rememberContainer(['--name', pgName, '--network', network, '--publish', `127.0.0.1:${pgPort}:5432`,
    '--env', 'POSTGRES_DB=erp_e2e', '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:16']);
  await waitReady('PostgreSQL', () => docker(['exec', pg, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'erp_e2e']).includes('accepting connections'));
  await run('database-contracts', process.execPath, ['scripts/ci/verify-database-contracts.mjs']);
  await run('fixtures', env.PSQL_BIN, ['-X', '-qAt', '-h', '127.0.0.1', '-p', pgPort, '-U', 'postgres', '-d', 'erp_e2e', '-v', 'ON_ERROR_STOP=1', '-f', 'apps/erp-api/tests/e2e/fixtures/peru-integrated-local.sql']);
  rememberContainer(['--name', `${network}-rest`, '--network', network, '--publish', `127.0.0.1:${restPort}:3000`,
    '--env', `PGRST_DB_URI=postgres://postgres@${pgName}:5432/erp_e2e`, '--env', 'PGRST_DB_ANON_ROLE=anon', '--env', 'PGRST_DB_SCHEMAS=public',
    '--env', 'PGRST_JWT_SECRET=local-integration-key-only-never-production-20260905', '--env', 'GHCRTS=-N2',
    'postgrest/postgrest@sha256:85258123312dc496ad4c2ed832154a65e9746f84df0d6d09b44229ff9230c08e']);
  await waitReady('PostgREST', () => httpReady(env.LOCAL_POSTGREST_URL));
  const smtp = launch('smtp', process.execPath, ['scripts/ci/peru-local-smtp-sink.mjs']);
  await waitReady('SMTP', () => readFileSync(path.join(output, 'smtp.log'), 'utf8').includes('LOCAL_SMTP_SINK_READY'), smtp);
  const api = launch('api', process.execPath, [apiRequire.resolve('ts-node/dist/bin.js'), '--transpile-only', 'tests/e2e/helpers/local-api-harness.ts'], apiDirectory);
  await waitReady('API', () => readFileSync(path.join(output, 'api.log'), 'utf8').includes('LOCAL_INTEGRATED_API_READY') && httpReady(`${apiUrl}/api/auth/profile`), api);
  for (const kind of [...block.kinds, ...(withBrowser && block.browserKind ? [block.browserKind] : [])]) await run('prepare-' + kind, process.execPath, ['scripts/ci/prepare-peru-first-client-local.mjs', kind]);
  try { await run(blockName + '-lifecycle', process.execPath, [block.probe]); } catch (error) { probeFailure = error; }
  if (withBrowser) {
    const web = launch('web', process.execPath, [webRequire.resolve('next/dist/bin/next'), 'dev', '-p', webPort, '--hostname', '127.0.0.1'], webDirectory);
    await waitReady('Web', () => readFileSync(path.join(output, 'web.log'), 'utf8').includes('Ready in') && httpReady(`${webUrl}/login/`), web);
    try {
      await run('browser', process.execPath, [path.join(path.dirname(webRequire.resolve('@playwright/test/package.json')), 'cli.js'), 'test', block.spec, '--reporter=list'], webDirectory);
    } catch (error) { browserFailure = error; }
  }
  await run('backup-restore', process.execPath, ['scripts/ci/test-peru-backup-restore-local.mjs', pg, path.join(output, 'backup')]);
  if (probeFailure) throw probeFailure;
  if (browserFailure) throw browserFailure;
  success = true;
  console.log('[peru-block] PASS: ' + blockName + ' API/DB' + (withBrowser ? ' y navegador' : '') + ', restore local; no aceptación integral');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await cleanup();
  writeFileSync(path.join(output, 'run.json'), JSON.stringify({ completedAt: new Date().toISOString(), success, withBrowser,
    block: blockName, scope: block.scope, database: 'PostgreSQL 16 efímero (migraciones completas)', output: path.relative(root, output), remoteWrites: false }, null, 2));
}
