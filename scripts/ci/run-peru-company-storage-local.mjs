import { spawn, execFileSync } from 'node:child_process';
import { openSync, closeSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import {createHmac} from 'node:crypto';

// No toma URLs de Supabase ni carga dotenv. Crea recursos nuevos sin volúmenes
// y sólo detiene los procesos/contenedores cuyo identificador obtuvo al crearlos.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const withBrowser = process.argv.includes('--browser');
if (process.argv.slice(2).some(arg => arg !== '--browser')) throw new Error('Uso: node scripts/ci/run-peru-company-storage-local.mjs [--browser]');
const runId = new Date().toISOString().replace(/[^0-9]/g, '') + '-' + process.pid;
const output = path.join(root, 'artifacts', `peru-company-storage-${runId}`);
mkdirSync(output, { recursive: true });
const network = `erp-peru-integrated-${runId}`;
const containers = [];
const children = [];
let createdNetwork = false;
const pgPort = '55516';
const restPort = '55517';
const storagePort='55518';
const gatewayPort='55519';
const apiPort = '3186';
const webPort = '3185';
const apiUrl = `http://127.0.0.1:${apiPort}`;
const webUrl = `http://127.0.0.1:${webPort}`;
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
  NODE_ENV: 'development', JWT_SECRET: 'local-api-integration-jwt-key-20260905-never-production',
  EMAIL_DISABLED: 'true', EMAIL_PROVIDER: 'smtp',
  LOCAL_INTEGRATED_FOCUS: 'company-logo',
  E2E_EPHEMERAL_LOCAL_DB: '1', E2E_ISOLATED_BROWSER: '0',
  LOCAL_API_URL: apiUrl, LOCAL_API_PORT: apiPort, LOCAL_WEB_URL: webUrl,
  LOCAL_POSTGREST_URL: `http://127.0.0.1:${gatewayPort}`,
  LOCAL_STORAGE_PUBLIC_ORIGIN: 'https://wypnbcptofqdmoynlonq.supabase.co',
  LOCAL_RAW_POSTGREST_URL: `http://127.0.0.1:${restPort}`, LOCAL_STORAGE_URL: `http://127.0.0.1:${storagePort}`, LOCAL_STORAGE_GATEWAY_PORT: gatewayPort,
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
function launch(label, executable, args, cwd = root) {
  const log = openSync(path.join(output, `${label}.log`), 'w');
  const child = spawn(executable, args, { cwd, env, windowsHide: true, stdio: ['ignore', log, log] });
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
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) throw new Error(`${label} terminó antes de estar listo`);
    try { if (await probe()) return; } catch { /* Todavía inicia; el límite es explícito. */ }
    await delay(500);
  }
  throw new Error(`${label} no estuvo listo en 60 segundos`);
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
      const previousRouteRoot = before.match(/path="\.\/([^\"]+)\/types\/routes\.d\.ts"/)?.[1] || '.next';
      onlyGenerated = current.replaceAll(distDir, previousRouteRoot).replaceAll('\r\n', '\n') === before.replaceAll('\r\n', '\n');
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
try {
  console.log(`[peru-integrated] Evidencia: ${output}`);
  // Un checkout limpio no tiene dist de los paquetes workspace. Prepararlos
  // aquí hace al runner autosuficiente, también fuera de GitHub Actions.
  for (const library of ['dtos','crypto']) {
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
  await waitReady('PostgreSQL', () => docker(['exec', pg, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'erp_e2e']).includes('accepting connections'));
  await run('database-contracts',process.execPath,['scripts/ci/verify-database-contracts.mjs']);
  await run('fixtures',env.PSQL_BIN,['-X','-qAt','-h','127.0.0.1','-p',pgPort,'-U','postgres','-d','erp_e2e','-v','ON_ERROR_STOP=1','-f','apps/erp-api/tests/e2e/fixtures/peru-integrated-local.sql']);
  rememberContainer(['--name', `${network}-rest`, '--network', network,
    '--publish', `127.0.0.1:${restPort}:3000`,
    '--env', `PGRST_DB_URI=postgres://postgres@${pgName}:5432/erp_e2e`,
    '--env', 'PGRST_DB_ANON_ROLE=anon', '--env', 'PGRST_DB_SCHEMAS=public',
    '--env', 'PGRST_JWT_SECRET=local-integration-key-only-never-production-20260905',
    '--env', 'GHCRTS=-N2',
    'postgrest/postgrest@sha256:85258123312dc496ad4c2ed832154a65e9746f84df0d6d09b44229ff9230c08e']);
  await waitReady('PostgREST', () => httpReady(env.LOCAL_RAW_POSTGREST_URL));
  const localSql=query=>execFileSync(env.PSQL_BIN,['-XqAt','-h','127.0.0.1','-p',pgPort,'-U','postgres','-d','erp_e2e','-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8',windowsHide:true}).trim();
  if(localSql("SELECT current_database()||'|'||environment||'|'||project_ref FROM app.deployment_environment WHERE singleton;")!=='erp_e2e|DEV|localerpephemeralqax') throw new Error('Sólo preparar Storage en el fixture local');
  localSql('DROP SCHEMA storage CASCADE; CREATE SCHEMA storage;');
  const jwt=role=>{const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');const payload=encode({alg:'HS256',typ:'JWT'})+'.'+encode({role,exp:Math.floor(Date.now()/1000)+7200});return payload+'.'+createHmac('sha256','local-integration-key-only-never-production-20260905').update(payload).digest('base64url');};
  const storage=rememberContainer(['--name',network+'-storage','--network',network,'--publish',`127.0.0.1:${storagePort}:5000`,
   '--env','ANON_KEY='+jwt('anon'),'--env','SERVICE_KEY='+jwt('service_role'),'--env','AUTH_JWT_SECRET=local-integration-key-only-never-production-20260905',
   '--env',`DATABASE_URL=postgres://postgres@${pgName}:5432/erp_e2e`,'--env',`POSTGREST_URL=http://${network}-rest:3000`,
   '--env','STORAGE_BACKEND=file','--env','FILE_STORAGE_BACKEND_PATH=/var/lib/storage','--env','TENANT_ID=local-storage-peru-only','--env','REGION=local','--env','GLOBAL_S3_BUCKET=local-ephemeral','--env','FILE_SIZE_LIMIT=2097152','--env','ENABLE_IMAGE_TRANSFORMATION=false',
   'supabase/storage-api@sha256:f1546fac6d1c7e345428ac904bfaa7be7cecd50a1f549fe1cf38c628a7b15c85']);
  await waitReady('Storage',()=>httpReady(env.LOCAL_STORAGE_URL+'/status'));
  localSql('GRANT USAGE ON SCHEMA storage TO anon,authenticated,service_role; GRANT ALL ON ALL TABLES IN SCHEMA storage TO service_role; GRANT ALL ON ALL FUNCTIONS IN SCHEMA storage TO service_role; GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO anon,authenticated;');
  // Reinstalar únicamente bucket/políticas en el Storage oficial recién creado.
  // Los writers públicos ya fueron aplicados por la reconstrucción completa.
  const migration523=readFileSync(path.join(root,'supabase/migrations/523__logo_empresa_en_supabase_storage.sql'),'utf8');
  const bucketStart=migration523.indexOf('DO $bucket$');
  const policyEnd=migration523.indexOf('$storage_policies$;',bucketStart);
  if(bucketStart<0||policyEnd<bucketStart)throw new Error('Sección Storage 523 no localizada');
  localSql(migration523.slice(bucketStart,policyEnd+'$storage_policies$;'.length));
  await run('company-storage-contract',env.PSQL_BIN,['-X','-q','-h','127.0.0.1','-p',pgPort,'-U','postgres','-d','erp_e2e','-v','ON_ERROR_STOP=1','-f','supabase/verify/523__logo_empresa_en_supabase_storage.sql']);
  const gateway=launch('storage-gateway',process.execPath,['scripts/ci/peru-storage-local-gateway.mjs']);
  await waitReady('Gateway',()=>httpReady(env.LOCAL_POSTGREST_URL),gateway);
  const api = launch('api', process.execPath, [apiRequire.resolve('ts-node/dist/bin.js'), '--transpile-only', 'tests/e2e/helpers/local-api-harness.ts'], apiDirectory);
  await waitReady('API', () => readFileSync(path.join(output, 'api.log'), 'utf8').includes('LOCAL_INTEGRATED_API_READY') && httpReady(`${apiUrl}/api/auth/profile`), api);

  await run('configuration-client',process.execPath,['scripts/ci/prepare-peru-first-client-local.mjs','configuration-admin']);
  await run('second-company-client',process.execPath,['scripts/ci/prepare-peru-first-client-local.mjs','company-logo']);
  await run('company-logo-lifecycle',process.execPath,['scripts/ci/test-peru-company-logo-local.mjs']);

  if (withBrowser) {
    const web = launch('web', process.execPath, [webRequire.resolve('next/dist/bin/next'), 'dev', '-p', webPort, '--hostname', '127.0.0.1'], webDirectory);
    await waitReady('Web', () => readFileSync(path.join(output, 'web.log'), 'utf8').includes('Ready in') && httpReady(`${webUrl}/login/`), web);
    await run('browser', process.execPath, [path.join(path.dirname(webRequire.resolve('@playwright/test/package.json')), 'cli.js'), 'test', 'tests/e2e/peru-company-logo-local.spec.ts', '--reporter=list'], webDirectory);
  }
  await run('backup-restore', process.execPath, ['scripts/ci/test-peru-backup-restore-local.mjs', pg, path.join(output, 'backup'), '--keep-restored-on-network', network]);
  const restored=JSON.parse(readFileSync(path.join(output,'backup/retained-target.json'),'utf8'));
  if(!/^[0-9a-f]{64}$/.test(restored.id)||restored.network!==network||restored.ephemeral!==true)throw new Error('Restore retenido debe ser creado por este ensayo');
  containers.push(restored.id);
  await run('storage-files-restore',process.execPath,['scripts/ci/test-peru-storage-files-restore-local.mjs',storage,restored.id,network,output]);
  success = true;
  console.log('[peru-storage] PASS: API/Storage real local'+(withBrowser?' y UI':'')+'; alcance parcial logo');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await cleanup();
  writeFileSync(path.join(output, 'run.json'), JSON.stringify({ completedAt: new Date().toISOString(), success, withBrowser,
    scope:'company_logo_real_storage_subset', storage_image:'supabase/storage-api@sha256:f1546fac6d1c7e345428ac904bfaa7be7cecd50a1f549fe1cf38c628a7b15c85', transport:'Origen contractual exacto reescrito al gateway loopback antes del socket; ningún destino remoto', database: 'PostgreSQL 16 efímero', output, remoteWrites: false }, null, 2));
}
