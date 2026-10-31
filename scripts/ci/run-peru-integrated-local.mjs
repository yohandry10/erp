import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { openSync, closeSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import { readLocalProductionWebBuild } from './local-production-web-build.mjs';
import { onlyGeneratedRouteReference } from './local-generated-web-metadata.mjs';

// No toma URLs de Supabase ni carga dotenv. Crea recursos nuevos sin volúmenes
// y sólo detiene los procesos/contenedores cuyo identificador obtuvo al crearlos.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const productionWebBuild = readLocalProductionWebBuild(root, process.env.LOCAL_PRODUCTION_WEB_BUILD_GATE);
const withSurvey = process.argv.includes('--survey');
const withNative = process.argv.includes('--native');
if (withNative && (process.platform !== 'win32' || !process.env.LOCAL_NATIVE_CARGO_TARGET_DIR)) throw new Error('--native exige Windows y LOCAL_NATIVE_CARGO_TARGET_DIR explícito');
const recordsOnly = process.argv.includes('--records-only');
const withRecords = process.argv.includes('--records') || recordsOnly;
const withBrowser = process.argv.includes('--browser') || withSurvey || withRecords || withNative;
const focusOnboarding = process.argv.includes('--focus-onboarding');
const focusReports = process.argv.includes('--focus-reports');
const focusCash = process.argv.includes('--focus-cash');
const focusAssets = process.argv.includes('--focus-assets');
const focusBrowserRecovery = process.argv.includes('--focus-browser-recovery');
const focusCustomerRecovery = process.argv.includes('--focus-customer-recovery');
const focusReviewCorrections = process.argv.includes('--focus-review-corrections');
const focusPrintCorrections = process.argv.includes('--focus-print-corrections');
if (focusPrintCorrections && (!withBrowser || process.argv.slice(2).some(arg => !['--browser','--focus-print-corrections'].includes(arg)))) throw new Error('--focus-print-corrections exige sólo navegador y recursos efímeros nuevos');
if (focusReviewCorrections && (!withBrowser || process.argv.slice(2).some(arg => !['--browser','--focus-review-corrections'].includes(arg)))) throw new Error('--focus-review-corrections exige sólo navegador y recursos efímeros nuevos');
if (focusCustomerRecovery && (!withBrowser || process.argv.slice(2).some(arg => !['--browser','--focus-customer-recovery'].includes(arg)))) throw new Error('--focus-customer-recovery exige sólo navegador y recursos efímeros nuevos');
const focusNativeConcurrency=process.argv.includes('--focus-native-concurrency');
const focusImportedRecovery=process.argv.includes('--focus-imported-recovery');
const focusSurveys=process.argv.includes('--focus-surveys');
const focusDocuments=process.argv.includes('--focus-documents');
const focusVacations=process.argv.includes('--focus-vacations');
const focusInventoryMasters=process.argv.includes('--focus-inventory-masters');
const focusAuxiliary=process.argv.includes('--focus-auxiliary');
const focusSecurity=process.argv.includes('--focus-security');
if(focusSecurity&&(!withBrowser||!productionWebBuild||process.argv.slice(2).some(arg=>!['--browser','--focus-security'].includes(arg))))throw Error('--focus-security exige sólo navegador de producción y recursos efímeros propios');
if(focusAuxiliary&&(!withBrowser||withNative||withSurvey||withRecords||focusOnboarding||focusReports||focusCash||focusAssets||focusBrowserRecovery||focusNativeConcurrency||focusImportedRecovery||focusSurveys||focusDocuments||focusVacations||focusInventoryMasters))throw Error('--focus-auxiliary exige sólo navegador y recursos nuevos');
if(focusInventoryMasters&&(!withBrowser||withNative||withSurvey||withRecords||focusOnboarding||focusReports||focusCash||focusAssets||focusBrowserRecovery||focusNativeConcurrency||focusImportedRecovery||focusSurveys||focusDocuments||focusVacations))throw Error('--focus-inventory-masters exige sólo navegador y recursos nuevos');
if(focusVacations&&(!withBrowser||withNative||withSurvey||withRecords||focusOnboarding||focusReports||focusCash||focusAssets||focusBrowserRecovery||focusNativeConcurrency||focusImportedRecovery||focusSurveys||focusDocuments))throw Error('--focus-vacations exige sólo navegador y recursos locales nuevos');
if(focusDocuments&&(!withBrowser||withNative||withSurvey||withRecords||focusOnboarding||focusReports||focusCash||focusAssets||focusBrowserRecovery||focusNativeConcurrency||focusImportedRecovery||focusSurveys))throw Error('--focus-documents exige sólo navegador y recursos locales propios');
if(focusSurveys&&(!withSurvey||!withRecords||withNative||recordsOnly||focusOnboarding||focusReports||focusCash||focusAssets||focusBrowserRecovery||focusNativeConcurrency||focusImportedRecovery))throw Error('--focus-surveys exige --survey --records, sin otros focos ni Windows; sólo acredita los barridos locales');
if(focusImportedRecovery&&(!withBrowser||withNative||withSurvey||withRecords||focusOnboarding||focusReports||focusCash||focusAssets||focusBrowserRecovery||focusNativeConcurrency))throw Error('--focus-imported-recovery exige sólo navegador para CxC inicial e inventario');
if(focusNativeConcurrency&&(!withNative||!process.env.LOCAL_NATIVE_PYTHON_BIN||withSurvey||withRecords||focusOnboarding||focusReports||focusCash||focusAssets||focusBrowserRecovery))throw Error('--focus-native-concurrency exige --native y LOCAL_NATIVE_PYTHON_BIN; sólo acredita dos ventanas propias');
if (focusBrowserRecovery && (!withBrowser || withNative || withSurvey || withRecords || focusOnboarding || focusReports || focusCash || focusAssets)) throw new Error('--focus-browser-recovery exige sólo navegador para los nueve casos de recuperación afectados');
if (focusAssets && (!withBrowser || withSurvey || withRecords || focusOnboarding || focusReports || focusCash)) throw new Error('--focus-assets exige navegador y sólo acredita activos UI con API/SQL locales');
if (focusOnboarding && (withSurvey || withRecords)) throw new Error('El foco de onboarding no acredita el recorrido general de pantallas');
if (focusReports && (withBrowser || focusOnboarding)) throw new Error('--focus-reports sólo acredita la fase API/SQL aislada de reportes/consolidación');
if (focusCash && (withBrowser || focusOnboarding || focusReports)) throw new Error('--focus-cash sólo acredita POS/caja API/SQL aislados');
if (process.argv.slice(2).some(arg => !['--browser', '--survey', '--records', '--native', '--focus-onboarding', '--focus-reports', '--focus-cash', '--focus-assets', '--focus-browser-recovery', '--focus-customer-recovery', '--focus-review-corrections', '--focus-print-corrections', '--focus-native-concurrency', '--focus-imported-recovery', '--focus-surveys', '--focus-documents', '--focus-vacations','--focus-inventory-masters','--focus-auxiliary','--focus-security', '--records-only'].includes(arg))) throw new Error('Uso: node scripts/ci/run-peru-integrated-local.mjs [--browser] [--survey] [--records] [--native] [--focus-onboarding] [--focus-reports] [--focus-cash] [--focus-assets] [--focus-browser-recovery] [--focus-customer-recovery --browser] [--focus-native-concurrency] [--focus-imported-recovery] [--focus-surveys --survey --records] [--focus-documents --browser] [--focus-vacations --browser] [--records-only]');
const runId = new Date().toISOString().replace(/[^0-9]/g, '') + '-' + process.pid;
const output = path.join(root, 'artifacts', `peru-integrated-${runId}`);
mkdirSync(output, { recursive: true });
const network = `erp-peru-integrated-${runId}`;
const containers = [];
const children = [];
let createdNetwork = false;
const pgPort = '55456';
const restPort = '55457';
const apiPort = '3126';
const webPort = '3125';
const smtpPort = '55458';
const apiUrl = `http://127.0.0.1:${apiPort}`;
// NextURL normalizes loopback IPs to localhost during middleware redirects.
// Use one origin for cookies, localStorage, sessions and the proxy allowlist.
const webUrl = `http://localhost:${webPort}`;
const distDir = `.next-peru-integrated-${runId}`;
const apiDirectory = path.join(root, 'apps/erp-api');
const webDirectory = path.join(root, 'apps/web');
const apiRequire = createRequire(path.join(apiDirectory, 'package.json'));
const webRequire = createRequire(path.join(webDirectory, 'package.json'));
const generatedFiles = withBrowser ? ['tsconfig.json', 'next-env.d.ts'].map(name => ({
  name, file: path.join(webDirectory, name), before: readFileSync(path.join(webDirectory, name)),
})) : [];
const env = { ...process.env };
for (const key of Object.keys(env)) {
  if (/^(SUPABASE_|NEXT_PUBLIC_SUPABASE_|EXPECTED_SUPABASE_|SUNAT_|OSE_|SMTP_|PFX_|CERT_|CERTIFICATE_|STRIPE_|SIRE_|DIAN_|ARCA_|REDIS_|PG)/.test(key)) delete env[key];
}
Object.assign(env, {
  POS_WORKER_JWT_SECRET: 'LOCAL-POS-WORKER-2026-Only-Ephemeral-Secret',
  NODE_ENV: 'development', JWT_SECRET: 'local-api-integration-jwt-key-20260905-never-production',
  EMAIL_DISABLED: 'true', EMAIL_PROVIDER: 'smtp', LOCAL_SMTP_PORT: smtpPort,
  LOCAL_INTEGRATED_FOCUS: focusOnboarding||focusImportedRecovery ? 'onboarding' : 'full',
  E2E_EPHEMERAL_LOCAL_DB: '1', E2E_ISOLATED_BROWSER: '0',
  E2E_TAURI_STATIC: withNative ? '1' : '0',
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

function docker(args) {
  return execFileSync('docker', args, { encoding: 'utf8', windowsHide: true, timeout: 60000 }).trim();
}
function launch(label, executable, args, cwd = root, overrides = {}) {
  const log = openSync(path.join(output, `${label}.log`), 'w');
  const child = spawn(executable, args, { cwd, env: { ...env, ...overrides, UAT_ASSERTION_PHASE: label }, windowsHide: true, stdio: ['ignore', log, log] });
  closeSync(log);
  children.push(child);
  return child;
}
async function run(label, executable, args, cwd) {
  console.log(`[peru-integrated] ${label}`);
  const child = launch(label, executable, args, cwd);
  await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${label} terminó con ${code}; revisar ${output}`)));
  });
}
async function waitReady(label, probe, child) {
  // El harness transpila Nest en Windows; su arranque en frío no mide el
  // arranque del binario compilado. Mantener un límite separado y finito.
  const startupTimeout = label === 'API' ? 120000 : 60000;
  const deadline = Date.now() + startupTimeout;
  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) throw new Error(`${label} terminó antes de estar listo`);
    try { if (await probe()) return; } catch { /* Todavía inicia; el límite es explícito. */ }
    await delay(500);
  }
  throw new Error(`${label} no estuvo listo en ${startupTimeout / 1000} segundos`);
}
async function httpReady(url) {
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(2000) });
  await response.body?.cancel();
  return response.status < 500;
}
async function stopWebForNextPhase(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) throw new Error('Web terminó inesperadamente antes de completar su fase');
  if (process.platform === 'win32') execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  else child.kill('SIGTERM');
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try { await httpReady(`${webUrl}/login/`); } catch {
      if (child.exitCode !== null || child.signalCode !== null) return;
    }
    await delay(250);
  }
  throw new Error('Web no liberó el puerto antes de la siguiente fase');
}
function rememberContainer(args) {
  const id = docker(['run', '--rm', '--detach', '--label', `com.erp.local-test=${runId}`, ...args]);
  if (!/^[0-9a-f]{64}$/.test(id)) throw new Error('Docker no devolvió un ID de contenedor');
  containers.push(id);
  return id;
}
async function cleanupNow() {
  for(const id of containers){
    const logs=spawnSync('docker',['logs','--timestamps',id],{encoding:'utf8',windowsHide:true,timeout:10000,maxBuffer:8*1024*1024});
    writeFileSync(path.join(output,'container-'+id.slice(0,12)+'.log'),(logs.stdout||'')+(logs.stderr||''));
  }
  if(!success&&env.LOCAL_RETAIN_FAILED_EPHEMERAL_STACK==='1'){
    writeFileSync(path.join(output,'failed-stack-retained.json'),JSON.stringify({scope:'FAILED_DIAGNOSTIC_STACK_ONLY_NOT_ACCEPTANCE',runId,network,containers,children:children.filter(c=>c.exitCode===null).map(c=>({pid:c.pid})),ports:{pgPort,restPort,apiPort,webPort},remoteWrites:false},null,2));
    console.error('Stack fallido propio retenido para diagnóstico; no volver a iniciar otro en sus puertos.');
    return;
  }
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
  // Next dev escribe estos dos ficheros. Restaurar únicamente sus cambios
  // generados; un cambio concurrente del usuario debe conservarse.
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
      onlyGenerated = onlyGeneratedRouteReference(before, current,
        [distDir, ...(withNative ? ['.next', `.next-peru-integrated-native-${runId}`] : [])]);
    }
    if (onlyGenerated) writeFileSync(snapshot.file, snapshot.before);
    else console.warn(`[peru-integrated] Se conserva ${snapshot.name}: hay diferencias adicionales a las generadas por este ensayo`);
  }
}

let cleanupTask;
const cleanup = () => cleanupTask ??= cleanupNow();
for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]]) {
  process.once(signal, async () => { await cleanup(); process.exit(code); });
}

let success = false;
let failureEvidencePg;
try {
  console.log(`[peru-integrated] Evidencia: ${output}`);
  // Un checkout limpio no tiene dist de los paquetes workspace. Prepararlos
  // aquí hace al runner autosuficiente, también fuera de GitHub Actions.
  for (const library of ['dtos', 'crypto']) {
    await run(`build-${library}`, process.execPath, [apiRequire.resolve('typescript/bin/tsc'), '--project', 'tsconfig.json'], path.join(root, 'libs', library));
  }
  // El certificado desechable pertenece sólo a esta ejecución. No depender
  // de un PFX local previo ni omitir las validaciones fiscales de la demo.
  await run('demo-certificate', process.execPath, [path.join(apiDirectory, 'scripts/generate-demo-pfx.cjs'), env.DEMO_PFX_PATH]);
  await run('harness-typecheck', process.execPath, [apiRequire.resolve('typescript/bin/tsc'), '--project', 'tests/e2e/tsconfig.local.json'], apiDirectory);
  docker(['network', 'create', '--label', `com.erp.local-test=${runId}`, network]);
  createdNetwork = true;
  const pgName = `${network}-pg`;
  const pg = rememberContainer(['--name', pgName, '--network', network,
    '--publish', `127.0.0.1:${pgPort}:5432`, '--env', 'POSTGRES_DB=erp_e2e',
    '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:16']);
  failureEvidencePg = pg;
  await waitReady('PostgreSQL', () => docker(['exec', pg, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'erp_e2e']).includes('accepting connections'));
  await run('database-contracts', process.execPath, ['scripts/ci/verify-database-contracts.mjs']);
  await run('fixtures', env.PSQL_BIN, ['-X', '-qAt', '-h', '127.0.0.1', '-p', pgPort, '-U', 'postgres', '-d', 'erp_e2e', '-v', 'ON_ERROR_STOP=1', '-f', 'apps/erp-api/tests/e2e/fixtures/peru-integrated-local.sql']);
  rememberContainer(['--name', `${network}-rest`, '--network', network,
    '--publish', `127.0.0.1:${restPort}:3000`,
    '--env', `PGRST_DB_URI=postgres://postgres@${pgName}:5432/erp_e2e`,
    '--env', 'PGRST_DB_ANON_ROLE=anon', '--env', 'PGRST_DB_SCHEMAS=public',
    '--env', 'PGRST_JWT_SECRET=local-integration-key-only-never-production-20260905',
    '--env', 'GHCRTS=-N2',
    'postgrest/postgrest@sha256:85258123312dc496ad4c2ed832154a65e9746f84df0d6d09b44229ff9230c08e']);
  await waitReady('PostgREST', () => httpReady(env.LOCAL_POSTGREST_URL));
  // Buzón SMTP local: el API envía correos reales sólo a este proceso.
  const smtp = launch('smtp', process.execPath, ['scripts/ci/peru-local-smtp-sink.mjs']);
  await waitReady('SMTP', () => readFileSync(path.join(output, 'smtp.log'), 'utf8').includes('LOCAL_SMTP_SINK_READY'), smtp);
  const api = launch('api', process.execPath, [apiRequire.resolve('ts-node/dist/bin.js'), '--transpile-only', 'tests/e2e/helpers/local-api-harness.ts'], apiDirectory);
  await waitReady('API', () => readFileSync(path.join(output, 'api.log'), 'utf8').includes('LOCAL_INTEGRATED_API_READY') && httpReady(`${apiUrl}/api/auth/profile`), api);
  if(focusCustomerRecovery){
    const web=launch('web',process.execPath,[webRequire.resolve('next/dist/bin/next'),'dev','-p',webPort,'--hostname','127.0.0.1'],webDirectory);
    await waitReady('Web',()=>readFileSync(path.join(output,'web.log'),'utf8').includes('Ready in')&&httpReady(`${webUrl}/login/`),web);
    await run('browser-customer-recovery',process.execPath,[path.join(path.dirname(webRequire.resolve('@playwright/test/package.json')),'cli.js'),'test','tests/e2e/peru-customer-update-recovery-local.spec.ts','--output',path.join(output,'customer-recovery-browser-results'),'--reporter=list,./tests/e2e/reporters/uat-assertions.ts'],webDirectory);
  }else if(focusNativeConcurrency){
    await run('prepare-accounting-first',process.execPath,['scripts/ci/prepare-peru-first-client-local.mjs','accounting-first']);
    env.LOCAL_NATIVE_PG_CONTAINER_ID=pg;
    await run('native-two-windows',process.execPath,['scripts/ci/test-peru-native-assets-local.mjs','--two-windows-only']);
  }else if(focusAssets){
    await run('prepare-accounting-first',process.execPath,['scripts/ci/prepare-peru-first-client-local.mjs','accounting-first']);
    const web = launch('web',process.execPath,[webRequire.resolve('next/dist/bin/next'),'dev','-p',webPort,'--hostname','127.0.0.1'],webDirectory);
    await waitReady('Web',()=>readFileSync(path.join(output,'web.log'),'utf8').includes('Ready in')&&httpReady(`${webUrl}/login/`),web);
    await run('browser-assets',process.execPath,[path.join(path.dirname(webRequire.resolve('@playwright/test/package.json')),'cli.js'),'test','tests/e2e/peru-assets-original-local.spec.ts','--reporter=list,./tests/e2e/reporters/uat-assertions.ts'],webDirectory);
    if(withNative){
      await stopWebForNextPhase(web);
      env.LOCAL_NATIVE_PG_CONTAINER_ID=pg;
      await run('native-assets',process.execPath,['scripts/ci/test-peru-native-assets-local.mjs']);
    }
  }else if(focusBrowserRecovery){
    await run('http',process.execPath,['scripts/ci/test-peru-integrated-local.mjs']);
    await run('prepare-hr',process.execPath,['scripts/ci/prepare-peru-first-client-local.mjs','hr']);
    await run('hr-lifecycle',process.execPath,['scripts/ci/test-peru-hr-lifecycle-local.mjs']);
    for(const kind of ['tax-intents','tax-other'])await run('prepare-'+kind,process.execPath,['scripts/ci/prepare-peru-first-client-local.mjs',kind]);
    await run('pos-first-client-lifecycle',process.execPath,['scripts/ci/test-peru-pos-first-client-local.mjs']);
    for(const kind of ['cash-first','cash-other'])await run('prepare-'+kind,process.execPath,['scripts/ci/prepare-peru-first-client-local.mjs',kind]);
    await run('cash-operations-lifecycle',process.execPath,['scripts/ci/test-peru-cash-operations-local.mjs']);
    await run('cash-faults-lifecycle',process.execPath,['scripts/ci/test-peru-cash-faults-local.mjs']);
    const web=launch('web',process.execPath,[webRequire.resolve('next/dist/bin/next'),'dev','-p',webPort,'--hostname','127.0.0.1'],webDirectory);
    await waitReady('Web',()=>readFileSync(path.join(output,'web.log'),'utf8').includes('Ready in')&&httpReady(`${webUrl}/login/`),web);
    await run('browser-recovery',process.execPath,[path.join(path.dirname(webRequire.resolve('@playwright/test/package.json')),'cli.js'),'test','tests/e2e/peru-integrated-local.spec.ts','tests/e2e/peru-cash-local.spec.ts','--grep','Caja Perú:|CxC cobrada|importa, edita|cobro CxC|ajuste con respuesta perdida|reembolso RMA|asiento manual perdido|candidato conserva|packing','--reporter=list,./tests/e2e/reporters/uat-assertions.ts'],webDirectory);
  }else if(focusImportedRecovery){
    await run('http',process.execPath,['scripts/ci/test-peru-integrated-local.mjs']);
    const web=launch('web',process.execPath,[webRequire.resolve('next/dist/bin/next'),'dev','-p',webPort,'--hostname','127.0.0.1'],webDirectory);
    await waitReady('Web',()=>readFileSync(path.join(output,'web.log'),'utf8').includes('Ready in')&&httpReady(`${webUrl}/login/`),web);
    await run('browser-imported-recovery',process.execPath,[path.join(path.dirname(webRequire.resolve('@playwright/test/package.json')),'cli.js'),'test','tests/e2e/peru-integrated-local.spec.ts','--grep','cobro CxC|ajuste con respuesta perdida|CPE histórico','--reporter=list,./tests/e2e/reporters/uat-assertions.ts'],webDirectory);
  }else if(focusVacations){
    await run('prepare-hr-ops-other',process.execPath,['scripts/ci/prepare-peru-first-client-local.mjs','hr-ops-other']);
    await run('prepare-vacation-payroll',process.execPath,['scripts/ci/prepare-peru-vacation-payroll-local.mjs']);
    const web=launch('web',process.execPath,[webRequire.resolve('next/dist/bin/next'),'dev','-p',webPort,'--hostname','127.0.0.1'],webDirectory);
    await waitReady('Web',()=>readFileSync(path.join(output,'web.log'),'utf8').includes('Ready in')&&httpReady(`${webUrl}/login/`),web);
    await run('browser-vacation-payroll',process.execPath,[path.join(path.dirname(webRequire.resolve('@playwright/test/package.json')),'cli.js'),'test','tests/e2e/peru-vacation-payroll-local.spec.ts','--reporter=list,./tests/e2e/reporters/uat-assertions.ts'],webDirectory);
  }else if(focusDocuments){
    await run('prepare-product-branch-read',process.execPath,['scripts/ci/prepare-peru-product-branch-read-local.mjs']);
    await run('product-branch-read',process.execPath,['scripts/ci/test-peru-product-branch-reads-local.mjs']);
    for(const kind of ['cpe-first','cpe-other'])await run('prepare-'+kind,process.execPath,['scripts/ci/prepare-peru-first-client-local.mjs',kind]);
    await run('cpe-operations-lifecycle',process.execPath,['scripts/ci/test-peru-cpe-operations-local.mjs']);
    const web=launch('web',process.execPath,[webRequire.resolve('next/dist/bin/next'),'dev','-p',webPort,'--hostname','127.0.0.1'],webDirectory);
    await waitReady('Web',()=>readFileSync(path.join(output,'web.log'),'utf8').includes('Ready in')&&httpReady(`${webUrl}/login/`),web);
    await run('browser-manual-documents',process.execPath,[path.join(path.dirname(webRequire.resolve('@playwright/test/package.json')),'cli.js'),'test','tests/e2e/peru-documents-local.spec.ts','--reporter=list,./tests/e2e/reporters/uat-assertions.ts'],webDirectory);
  }else if(focusSecurity){
    const web=launch('web',process.execPath,[webRequire.resolve('next/dist/bin/next'),'start','-p',webPort,'--hostname','127.0.0.1'],webDirectory,
      {NODE_ENV:'production',NEXT_DIST_DIR:productionWebBuild.buildDirectory,TAURI_BUILD:'',SUPABASE_URL:'http://127.0.0.1:9',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:9',NEXT_PUBLIC_SUPABASE_ANON_KEY:'local-build-only-no-service-role'});
    await waitReady('Web',()=>readFileSync(path.join(output,'web.log'),'utf8').includes('Ready in')&&httpReady(`${webUrl}/login/`),web);
    await run('browser-security',process.execPath,[path.join(path.dirname(webRequire.resolve('@playwright/test/package.json')),'cli.js'),'test','tests/e2e/peru-security-dashboard-local.spec.ts','--output',path.join(output,'security-browser-results'),'--reporter=list,./tests/e2e/reporters/uat-assertions.ts'],webDirectory);
  }else if(focusAuxiliary){
    for(const kind of ['accounting-first','accounting-other'])await run('prepare-'+kind,process.execPath,['scripts/ci/prepare-peru-first-client-local.mjs',kind]);
    await run('accounting-operations',process.execPath,['scripts/ci/test-peru-accounting-operations-local.mjs']);
    const web=launch('web',process.execPath,[webRequire.resolve('next/dist/bin/next'),'dev','-p',webPort,'--hostname','127.0.0.1'],webDirectory);
    await waitReady('Web',()=>readFileSync(path.join(output,'web.log'),'utf8').includes('Ready in')&&httpReady(`${webUrl}/login/`),web);
    await run('browser-auxiliary',process.execPath,[path.join(path.dirname(webRequire.resolve('@playwright/test/package.json')),'cli.js'),'test','tests/e2e/peru-offered-writers-local.spec.ts','tests/e2e/peru-zz-auxiliary-local.spec.ts','--output',path.join(output,'auxiliary-browser-results'),'--reporter=list,./tests/e2e/reporters/uat-assertions.ts'],webDirectory);
  }else if(focusInventoryMasters){
    await run('prepare-accounting-first',process.execPath,['scripts/ci/prepare-peru-first-client-local.mjs','accounting-first']);
    const web=launch('web',process.execPath,[webRequire.resolve('next/dist/bin/next'),'dev','-p',webPort,'--hostname','127.0.0.1'],webDirectory);
    await waitReady('Web',()=>readFileSync(path.join(output,'web.log'),'utf8').includes('Ready in')&&httpReady(`${webUrl}/login/`),web);
    await run('browser-inventory-masters',process.execPath,[path.join(path.dirname(webRequire.resolve('@playwright/test/package.json')),'cli.js'),'test','tests/e2e/peru-inventory-masters-local.spec.ts','--reporter=list,./tests/e2e/reporters/uat-assertions.ts'],webDirectory);
  }else if(focusSurveys){
    await run('http',process.execPath,['scripts/ci/test-peru-integrated-local.mjs']);
    const web=launch('web',process.execPath,[webRequire.resolve('next/dist/bin/next'),'dev','-p',webPort,'--hostname','127.0.0.1'],webDirectory);
    await waitReady('Web',()=>readFileSync(path.join(output,'web.log'),'utf8').includes('Ready in')&&httpReady(`${webUrl}/login/`),web);
    // El recorrido UI completo crea estos registros antes de los barridos.
    await run('browser-survey-record-fixtures',process.execPath,[path.join(path.dirname(webRequire.resolve('@playwright/test/package.json')),'cli.js'),'test','tests/e2e/peru-integrated-local.spec.ts','--grep','crea centro de costo y conserva un presupuesto','--reporter=list,./tests/e2e/reporters/uat-assertions.ts'],webDirectory);
    let surveyWeb=web;
    for(const [label,spec] of [['module-survey','peru-module-survey-local.spec.ts'],['record-survey','peru-record-survey-local.spec.ts']]){
      await stopWebForNextPhase(surveyWeb);
      surveyWeb=launch('web-'+label,process.execPath,[webRequire.resolve('next/dist/bin/next'),'dev','-p',webPort,'--hostname','127.0.0.1'],webDirectory);
      await waitReady('Web',()=>readFileSync(path.join(output,'web-'+label+'.log'),'utf8').includes('Ready in')&&httpReady(`${webUrl}/login/`),surveyWeb);
      await run(label,process.execPath,[path.join(path.dirname(webRequire.resolve('@playwright/test/package.json')),'cli.js'),'test','tests/e2e/'+spec,'--reporter=list,./tests/e2e/reporters/uat-assertions.ts'],webDirectory);
    }
  }else if(focusPrintCorrections){
    for(const kind of ['payroll-plame','finance']){
      await run('prepare-'+kind,process.execPath,['scripts/ci/prepare-peru-first-client-local.mjs',kind]);
      await run(kind+'-lifecycle',process.execPath,[kind==='payroll-plame'?'scripts/ci/test-peru-payroll-plame-local.mjs':'scripts/ci/test-peru-finance-lifecycle-local.mjs']);
    }
    const web=launch('web',process.execPath,[webRequire.resolve('next/dist/bin/next'),'dev','-p',webPort,'--hostname','127.0.0.1'],webDirectory);
    await waitReady('Web',()=>readFileSync(path.join(output,'web.log'),'utf8').includes('Ready in')&&httpReady(`${webUrl}/login/`),web);
    await run('browser-print-corrections',process.execPath,[path.join(path.dirname(webRequire.resolve('@playwright/test/package.json')),'cli.js'),'test','tests/e2e/peru-print-corrections-local.spec.ts','--output',path.join(output,'print-browser-results'),'--reporter=list,./tests/e2e/reporters/uat-assertions.ts'],webDirectory);
  }else if(focusReviewCorrections){
    for(const kind of ['tax-intents','tax-other'])await run('prepare-'+kind,process.execPath,['scripts/ci/prepare-peru-first-client-local.mjs',kind]);
    await run('reports-consolidation-lifecycle',process.execPath,['scripts/ci/test-peru-reports-consolidation-local.mjs']);
    await run('gre-lifecycle',process.execPath,['scripts/ci/test-peru-gre-operations-local.mjs']);
    for(const kind of ['cash-first','cash-other'])await run('prepare-'+kind,process.execPath,['scripts/ci/prepare-peru-first-client-local.mjs',kind]);
    await run('cash-operations-lifecycle',process.execPath,['scripts/ci/test-peru-cash-operations-local.mjs']);
    const web=launch('web',process.execPath,[webRequire.resolve('next/dist/bin/next'),'dev','-p',webPort,'--hostname','127.0.0.1'],webDirectory);
    await waitReady('Web',()=>readFileSync(path.join(output,'web.log'),'utf8').includes('Ready in')&&httpReady(`${webUrl}/login/`),web);
    await run('browser-review-corrections',process.execPath,[path.join(path.dirname(webRequire.resolve('@playwright/test/package.json')),'cli.js'),'test','tests/e2e/peru-gre-local.spec.ts','tests/e2e/peru-reports-consignations-local.spec.ts','tests/e2e/peru-review-corrections-local.spec.ts','--output',path.join(output,'review-browser-results'),'--reporter=list,./tests/e2e/reporters/uat-assertions.ts'],webDirectory);
  }else if(focusReports){
    for(const kind of ['tax-intents','tax-other'])await run('prepare-'+kind,process.execPath,['scripts/ci/prepare-peru-first-client-local.mjs',kind]);
    await run('reports-consolidation-lifecycle',process.execPath,['scripts/ci/test-peru-reports-consolidation-local.mjs']);
  }else if(focusCash){
    for(const kind of ['tax-intents','tax-other'])await run('prepare-'+kind,process.execPath,['scripts/ci/prepare-peru-first-client-local.mjs',kind]);
    await run('pos-first-client-lifecycle',process.execPath,['scripts/ci/test-peru-pos-first-client-local.mjs']);
    for(const kind of ['cash-first','cash-other'])await run('prepare-'+kind,process.execPath,['scripts/ci/prepare-peru-first-client-local.mjs',kind]);
    await run('cash-operations-lifecycle',process.execPath,['scripts/ci/test-peru-cash-operations-local.mjs']);
    await run('cash-faults-lifecycle',process.execPath,['scripts/ci/test-peru-cash-faults-local.mjs']);
  }else{
  await run('login-office',process.execPath,['scripts/ci/test-peru-login-office-local.mjs']);
  await run('http', process.execPath, ['scripts/ci/test-peru-integrated-local.mjs']);
  await run('prepare-product-branch-read',process.execPath,['scripts/ci/prepare-peru-product-branch-read-local.mjs']);
    await run('product-branch-read',process.execPath,['scripts/ci/test-peru-product-branch-reads-local.mjs']);
  for (const kind of ['annual','finance','hr','hr-financial','payroll-plame','configuration-admin']) {
    await run('prepare-' + kind, process.execPath, ['scripts/ci/prepare-peru-first-client-local.mjs',kind]);
    await run(kind + '-lifecycle', process.execPath, [{annual:'scripts/ci/test-peru-year-close-local.mjs',finance:'scripts/ci/test-peru-finance-lifecycle-local.mjs',hr:'scripts/ci/test-peru-hr-lifecycle-local.mjs','hr-financial':'scripts/ci/test-peru-hr-financial-local.mjs','payroll-plame':'scripts/ci/test-peru-payroll-plame-local.mjs','configuration-admin':'scripts/ci/test-peru-configuration-admin-local.mjs'}[kind]]);
  }
  await run('document-series-lifecycle',process.execPath,['scripts/ci/test-peru-document-series-local.mjs']);
  await run('tax-adjustments-lifecycle',process.execPath,['scripts/ci/test-peru-tax-adjustments-local.mjs']);
  await run('monthly-period-lifecycle',process.execPath,['scripts/ci/test-peru-monthly-period-local.mjs']);
  for(const kind of ['tax-intents','tax-other']) await run('prepare-'+kind,process.execPath,['scripts/ci/prepare-peru-first-client-local.mjs',kind]);
  await run('tax-intents-lifecycle',process.execPath,['scripts/ci/test-peru-tax-intents-local.mjs']);
  await run('reports-consolidation-lifecycle',process.execPath,['scripts/ci/test-peru-reports-consolidation-local.mjs']);
  await run('gre-lifecycle',process.execPath,['scripts/ci/test-peru-gre-operations-local.mjs']);
  await run('pos-first-client-lifecycle',process.execPath,['scripts/ci/test-peru-pos-first-client-local.mjs']);
  for(const kind of ['cpe-first','cpe-other'])await run('prepare-'+kind,process.execPath,['scripts/ci/prepare-peru-first-client-local.mjs',kind]);
  env.CPE_VOLUME='1';
  await run('cpe-operations-lifecycle',process.execPath,['scripts/ci/test-peru-cpe-operations-local.mjs']);
  delete env.CPE_VOLUME;
  for(const kind of ['cash-first','cash-other'])await run('prepare-'+kind,process.execPath,['scripts/ci/prepare-peru-first-client-local.mjs',kind]);
  await run('cash-operations-lifecycle',process.execPath,['scripts/ci/test-peru-cash-operations-local.mjs']);
  await run('cash-faults-lifecycle',process.execPath,['scripts/ci/test-peru-cash-faults-local.mjs']);
  for(const kind of ['sales-first','sales-other'])await run('prepare-'+kind,process.execPath,['scripts/ci/prepare-peru-first-client-local.mjs',kind]);
  await run('sales-operations-lifecycle',process.execPath,['scripts/ci/test-peru-sales-operations-local.mjs']);
  for(const kind of ['purchases-first','purchases-other'])await run('prepare-'+kind,process.execPath,['scripts/ci/prepare-peru-first-client-local.mjs',kind]);
  await run('purchases-operations-lifecycle',process.execPath,['scripts/ci/test-peru-purchases-operations-local.mjs']);
  for(const kind of ['accounting-first','accounting-other'])await run('prepare-'+kind,process.execPath,['scripts/ci/prepare-peru-first-client-local.mjs',kind]);
  await run('accounting-operations-lifecycle',process.execPath,['scripts/ci/test-peru-accounting-operations-local.mjs']);
  await run('supplier-credit-lifecycle',process.execPath,['scripts/ci/test-peru-supplier-credit-local.mjs']);
  for(const kind of ['users-first','users-other'])await run('prepare-'+kind,process.execPath,['scripts/ci/prepare-peru-first-client-local.mjs',kind]);
  await run('users-operations-lifecycle',process.execPath,['scripts/ci/test-peru-users-operations-local.mjs']);
  for(const kind of ['finance-ops-first','finance-ops-other'])await run('prepare-'+kind,process.execPath,['scripts/ci/prepare-peru-first-client-local.mjs',kind]);
  await run('finance-operations-lifecycle',process.execPath,['scripts/ci/test-peru-finance-operations-local.mjs']);
  for(const kind of ['hr-ops-first','hr-ops-other'])await run('prepare-'+kind,process.execPath,['scripts/ci/prepare-peru-first-client-local.mjs',kind]);
  await run('hr-operations-lifecycle',process.execPath,['scripts/ci/test-peru-hr-operations-local.mjs']);
  for(const kind of ['auth-first','auth-other',...(withBrowser?['auth-browser']:[])])await run('prepare-'+kind,process.execPath,['scripts/ci/prepare-peru-first-client-local.mjs',kind]);
  await run('auth-recovery-lifecycle',process.execPath,['scripts/ci/test-peru-auth-recovery-local.mjs']);
  for(const kind of ['notif-first','notif-other',...(withBrowser?['notif-browser']:[])])await run('prepare-'+kind,process.execPath,['scripts/ci/prepare-peru-first-client-local.mjs',kind]);
  await run('notifications-lifecycle',process.execPath,['scripts/ci/test-peru-notifications-local.mjs']);
  for(const kind of ['cxc-first','cxc-other',...(withBrowser?['cxc-browser']:[])])await run('prepare-'+kind,process.execPath,['scripts/ci/prepare-peru-first-client-local.mjs',kind]);
  await run('cxc-operations-lifecycle',process.execPath,['scripts/ci/test-peru-cxc-operations-local.mjs']);
  for(const kind of ['aprob-first','aprob-other',...(withBrowser?['aprob-browser']:[])])await run('prepare-'+kind,process.execPath,['scripts/ci/prepare-peru-first-client-local.mjs',kind]);
  await run('sales-approvals-lifecycle',process.execPath,['scripts/ci/test-peru-sales-approvals-local.mjs']);
  for(const kind of ['fact-first','fact-other',...(withBrowser?['fact-browser']:[])])await run('prepare-'+kind,process.execPath,['scripts/ci/prepare-peru-first-client-local.mjs',kind]);
  await run('sales-invoice-lifecycle',process.execPath,['scripts/ci/test-peru-sales-invoice-local.mjs']);
  await run('tenant-create-lifecycle',process.execPath,['scripts/ci/test-peru-tenant-create-local.mjs']);
  for(const kind of ['dash-first','dash-other'])await run('prepare-'+kind,process.execPath,['scripts/ci/prepare-peru-first-client-local.mjs',kind]);
  await run('dashboard-lifecycle',process.execPath,['scripts/ci/test-peru-dashboard-local.mjs']);
  for(const kind of ['rf-first'])await run('prepare-'+kind,process.execPath,['scripts/ci/prepare-peru-first-client-local.mjs',kind]);
  await run('read-faults-lifecycle',process.execPath,['scripts/ci/test-peru-read-faults-local.mjs']);
  for(const kind of ['pres-first','pres-other',...(withBrowser?['pres-browser']:[])])await run('prepare-'+kind,process.execPath,['scripts/ci/prepare-peru-first-client-local.mjs',kind]);
  await run('budgets-lifecycle',process.execPath,['scripts/ci/test-peru-budgets-local.mjs']);
  for(const kind of ['dk-first'])await run('prepare-'+kind,process.execPath,['scripts/ci/prepare-peru-first-client-local.mjs',kind]);
  await run('derived-keys-lifecycle',process.execPath,['scripts/ci/test-peru-derived-keys-local.mjs']);
  for(const kind of [...(withBrowser?['le-first']:[])])await run('prepare-'+kind,process.execPath,['scripts/ci/prepare-peru-first-client-local.mjs',kind]);
  await run('prepare-est-first',process.execPath,['scripts/ci/prepare-peru-first-client-local.mjs','est-first']);
  await run('statements-refresh-lifecycle',process.execPath,['scripts/ci/test-peru-statements-refresh-local.mjs']);
  await run('current-api-inventory',process.execPath,['scripts/ci/inventory-peru-api-operations.mjs']);
  await run('prepare-mi-first',process.execPath,['scripts/ci/prepare-peru-first-client-local.mjs','mi-first']);
  await run('missing-ids-expanded',process.execPath,['scripts/ci/test-peru-missing-ids-local.mjs']);
  for(const kind of ['asset-first','asset-other','asset-estimates',...(withBrowser?['asset-browser']:[])])await run('prepare-'+kind,process.execPath,['scripts/ci/prepare-peru-first-client-local.mjs',kind]);
  await run('assets-lifecycle',process.execPath,['scripts/ci/test-peru-assets-lifecycle-local.mjs']);
  await run('asset-estimates-lifecycle',process.execPath,['scripts/ci/test-peru-asset-estimates-local.mjs']);
  for(const kind of [...(withBrowser?['asset-critical-browser']:[]),...(withNative?['asset-critical-native']:[])])await run('prepare-'+kind,process.execPath,['scripts/ci/prepare-peru-first-client-local.mjs',kind]);
  await run('prepare-vacation-payroll',process.execPath,['scripts/ci/prepare-peru-vacation-payroll-local.mjs']);
  if(withBrowser) {
    await run('prepare-wizard',process.execPath,['scripts/ci/prepare-peru-first-client-local.mjs','wizard']);
    await run('wizard-preflight',process.execPath,['scripts/ci/test-peru-wizard-preflight-local.mjs']);
  }
  const httpEvidence=JSON.parse(readFileSync(path.join(output,'http.json'),'utf8'));
  for(const file of ['annual-acceptance.json','finance-lifecycle.json','hr-lifecycle.json','hr-financial.json','payroll-plame.json','configuration-admin.json','series-lifecycle.json','tax-adjustments.json','monthly-period.json','tax-intents.json','login-office.json','reports-consolidation-expanded.json','gre-operations.json','pos-operations.json','cpe-operations.json','cash-operations.json','cash-faults.json','sales-operations.json','purchases-operations.json','accounting-operations.json','supplier-credit.json','users-operations.json','finance-operations.json','hr-operations.json','auth-recovery.json','notifications-operations.json','cxc-operations.json','sales-approvals.json','sales-invoice.json','tenant-create.json','dashboard.json','read-faults.json','budgets.json','derived-keys.json','statements-refresh.json','assets-lifecycle.json','asset-estimates.json','missing-ids.json',...(withBrowser?['wizard-preflight.json']:[])]) {
    const phase=JSON.parse(readFileSync(path.join(output,file),'utf8'));
    if(phase.success!==true||phase.remoteWrites!==false) throw new Error('Fase funcional incompleta: '+file);
    const offset=httpEvidence.results.length;
    httpEvidence.results.push(...phase.scenarios);
    httpEvidence.request_traces.push(...phase.requests.map(request=>({method:request.method,pathname:new URL('/api/'+request.endpoint.replace(/^\/?api\//,''),apiUrl).pathname,status:request.status,scenario_index_hint:offset,evidence_file:file})));
  }
  writeFileSync(path.join(output,'http.json'),JSON.stringify(httpEvidence,null,2));
  if (withBrowser) {
    const startWeb = async label => {
      const child = launch(label, process.execPath, [webRequire.resolve('next/dist/bin/next'), productionWebBuild ? 'start' : 'dev', '-p', webPort, '--hostname', '127.0.0.1'], webDirectory,
        productionWebBuild ? {NODE_ENV:'production',NEXT_DIST_DIR:productionWebBuild.buildDirectory,TAURI_BUILD:'',
          SUPABASE_URL:'http://127.0.0.1:9',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:9',NEXT_PUBLIC_SUPABASE_ANON_KEY:'local-build-only-no-service-role'} : {});
      await waitReady('Web', () => readFileSync(path.join(output, `${label}.log`), 'utf8').includes('Ready in') && httpReady(`${webUrl}/login/`), child);
      return child;
    };
    let web = await startWeb('web');
    if (!recordsOnly) await run('browser', process.execPath, [path.join(path.dirname(webRequire.resolve('@playwright/test/package.json')), 'cli.js'), 'test', 'tests/e2e/peru-integrated-local.spec.ts', 'tests/e2e/peru-customer-update-recovery-local.spec.ts', 'tests/e2e/peru-cxp-cash-account-local.spec.ts', 'tests/e2e/peru-review-corrections-local.spec.ts', 'tests/e2e/peru-print-corrections-local.spec.ts', 'tests/e2e/peru-assets-original-local.spec.ts', 'tests/e2e/peru-recovery-critical-local.spec.ts', 'tests/e2e/peru-rrhh-financial-local.spec.ts', 'tests/e2e/peru-rrhh-registration-local.spec.ts', 'tests/e2e/peru-vacation-payroll-local.spec.ts', 'tests/e2e/peru-configuration-admin-local.spec.ts', 'tests/e2e/peru-tax-adjustments-local.spec.ts', 'tests/e2e/peru-tax-intents-local.spec.ts', 'tests/e2e/peru-reports-consignations-local.spec.ts', 'tests/e2e/peru-gre-local.spec.ts', 'tests/e2e/peru-pos-local.spec.ts', 'tests/e2e/peru-cpe-local.spec.ts', 'tests/e2e/peru-documents-local.spec.ts', 'tests/e2e/peru-inventory-masters-local.spec.ts', 'tests/e2e/peru-offered-writers-local.spec.ts', 'tests/e2e/peru-supplier-return-cancel-local.spec.ts', 'tests/e2e/peru-cash-local.spec.ts', 'tests/e2e/peru-zz-auxiliary-local.spec.ts', 'tests/e2e/peru-auth-recovery-local.spec.ts', 'tests/e2e/peru-notifications-local.spec.ts', 'tests/e2e/peru-cxc-local.spec.ts', 'tests/e2e/peru-sales-approvals-local.spec.ts', 'tests/e2e/peru-sales-invoice-local.spec.ts', 'tests/e2e/peru-tenant-create-local.spec.ts', 'tests/e2e/peru-dashboard-local.spec.ts', 'tests/e2e/peru-read-faults-local.spec.ts', 'tests/e2e/peru-budgets-local.spec.ts', 'tests/e2e/peru-list-errors-local.spec.ts', 'tests/e2e/peru-statements-refresh-local.spec.ts', 'tests/e2e/peru-security-dashboard-local.spec.ts', '--reporter=list,./tests/e2e/reporters/uat-assertions.ts',
      ...(focusOnboarding ? ['--grep', 'primer administrador|ajuste con respuesta perdida'] : [])], webDirectory);
    if (!recordsOnly) await run('browser-asset-estimates', process.env.LOCAL_NATIVE_PYTHON_BIN || 'python', ['scripts/ci/test-peru-assets-browser-local.py']);
    if (!recordsOnly) await run('wizard-fiscal-runtime',process.execPath,['scripts/ci/test-peru-wizard-runtime-local.cjs']);
    // Next dev conserva compilaciones en memoria. Cada barrido comienza con
    // un proceso nuevo; un fallo de su fase sigue deteniendo el ensayo.
    if (withSurvey) {
      await stopWebForNextPhase(web); web = await startWeb('web-module-survey');
      await run('module-survey', process.execPath, [path.join(path.dirname(webRequire.resolve('@playwright/test/package.json')), 'cli.js'), 'test', 'tests/e2e/peru-module-survey-local.spec.ts', '--reporter=list,./tests/e2e/reporters/uat-assertions.ts'], webDirectory);
    }
    if (withRecords) {
      await stopWebForNextPhase(web); web = await startWeb('web-record-survey');
      await run('record-survey', process.execPath, [path.join(path.dirname(webRequire.resolve('@playwright/test/package.json')), 'cli.js'), 'test', 'tests/e2e/peru-record-survey-local.spec.ts', '--reporter=list,./tests/e2e/reporters/uat-assertions.ts'], webDirectory);
    }
    if (withNative) await stopWebForNextPhase(web);
  }
  if(withNative){
    env.LOCAL_NATIVE_PG_CONTAINER_ID=pg;
    await run('native-assets',process.execPath,['scripts/ci/test-peru-native-assets-local.mjs']);
  }
  }
  // Invariantes tras todos los escritores reales de la corrida: cobros, pagos,
  // planilla, CTS y tesorería. Ningún movimiento nace inactivo y todo asiento confirmado cuadra.
  const invariantes = docker(['exec', pg, 'psql', '-XAt', '-U', 'postgres', '-d', 'erp_e2e', '-c',
    `SELECT (SELECT count(*) FROM public.movimientos_bancarios)||'|'||(SELECT count(*) FROM public.movimientos_bancarios WHERE activo IS NOT TRUE)||'|'||(SELECT count(*) FROM public.asientos_contables WHERE lower(estado::text)='confirmado')||'|'||(SELECT count(*) FROM (SELECT a.id FROM public.asientos_contables a JOIN public.detalle_asientos d ON d.asiento_id=a.id WHERE lower(a.estado::text)='confirmado' GROUP BY a.id HAVING round(sum(d.debe)-sum(d.haber),2)<>0) q);`]).trim();
  const [bancos, inactivos, confirmados, descuadrados] = invariantes.split('|').map(Number);
  console.log(`[peru-integrated] invariantes: ${bancos} movimientos bancarios, ${inactivos} inactivos; ${confirmados} asientos confirmados, ${descuadrados} descuadrados`);
  if (inactivos !== 0 || descuadrados !== 0) throw new Error('Invariantes financieros rotos: ' + invariantes);
  await run('backup-restore', process.execPath, ['scripts/ci/test-peru-backup-restore-local.mjs', pg, path.join(output, 'backup')]);
  success = true;
  console.log('[peru-integrated] PASS: contratos SQL, HTTP y contabilidad; alcance ' + (focusPrintCorrections?'impresiones RRHH/finanzas':focusReviewCorrections?'correcciones de revisión':focusCustomerRecovery?'edición de cliente con COMMIT/ACK perdido y replay':focusAuxiliary?'partidas, analítica y transferencia bancaria UI/API/SQL':focusInventoryMasters?'maestros de inventario UI/API/SQL':focusVacations?'planilla ligada a doce solicitudes':focusDocuments?'documentos manuales UI/API/SQL':focusSurveys?'barridos de pantallas y registros':focusImportedRecovery?'CPE histórico/CxC inicial/inventario':focusNativeConcurrency?'dos ventanas Windows originales':focusBrowserRecovery ? 'nueve recuperaciones UI/API/SQL aisladas' : focusAssets ? 'activos UI aislados' : focusCash ? 'POS/caja API/SQL aislados' : focusReports ? 'reportes/consolidación API/SQL aislado' : focusOnboarding ? 'onboarding/inventario/contabilidad' : recordsOnly ? 'pantallas con registros' : 'completo') + (withBrowser ? ', con recorridos de navegador' : ''));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
  if (failureEvidencePg) {
    try {
      await run('failure-backup-restore', process.execPath, ['scripts/ci/test-peru-backup-restore-local.mjs', failureEvidencePg, path.join(output, 'failure-backup')]);
    } catch (backupError) {
      // No retirar un entorno fallido cuya evidencia empresarial no se pudo
      // respaldar. Su identidad exacta queda en failed-stack-retained.json.
      console.error('No se pudo respaldar el fallo; se conserva el entorno propio:', backupError);
      env.LOCAL_RETAIN_FAILED_EPHEMERAL_STACK = '1';
    }
  }
} finally {
  await cleanup();
  writeFileSync(path.join(output, 'run.json'), JSON.stringify({ completedAt: new Date().toISOString(), success, withBrowser, withSurvey, withRecords, withNative,
    webRuntime: productionWebBuild ? 'production' : 'development', productionWebBuild,
    scope: focusSecurity?'security_dashboard_real_ui_api_sql_subset':focusPrintCorrections?'print_corrections_ui_api_sql_subset':focusReviewCorrections?'review_corrections_ui_api_sql_subset':focusCustomerRecovery?'customer_update_commit_ack_recovery_subset':focusAuxiliary?'auxiliary_functional_real_ui_subset':focusInventoryMasters?'inventory_masters_real_ui_subset':focusVacations?'vacation_payroll_real_ui_subset':focusDocuments?'manual_documents_ui_api_sql_subset':focusSurveys?'module_and_record_survey_subset':focusImportedRecovery?'imported_cpe_cxc_inventory_recovery_subset':focusNativeConcurrency?'native_two_windows_original_concurrency_subset':focusBrowserRecovery ? 'browser_recovery_api_sql_subset' : focusAssets ? 'assets_ui_api_sql_subset' : focusCash ? 'pos_cash_api_sql_subset' : focusReports ? 'reports_consolidation_api_sql_subset' : focusOnboarding ? 'onboarding_inventory_accounting_subset' : recordsOnly ? 'record_survey_subset' : 'full', database: 'PostgreSQL 16 efímero', output, remoteWrites: false }, null, 2));
}
