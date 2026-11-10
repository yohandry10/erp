const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');

const web = path.resolve(__dirname, '..');
const names = ['BASE_URL', 'NEXT_PUBLIC_API_URL', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_API_PROXY', 'NEXT_PUBLIC_COOKIE_AUTH'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function profile(env) {
  for (const name of ['E2E_ISOLATED_BROWSER', 'PLAYWRIGHT_SKIP_GLOBAL_AUTH', 'PLAYWRIGHT_PRODUCTION_WEB']) assert.equal(env[name], '1', `Falta perfil aislado: ${name}`);
  assert.ok(!env.NEXT_DIST_DIR || env.NEXT_DIST_DIR === '.next', 'El perfil aislado usa su build .next propio');
  for (const name of names.slice(0, 4)) {
    const url = new URL(env[name]);
    assert.ok(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname) && !url.username && !url.password && !url.search && !url.hash, `${name} debe ser loopback HTTP sin credenciales`);
  }
  return Object.fromEntries(names.map(name => [name, env[name] ?? null]));
}
function proxy(manifest, api) {
  const routes = Array.isArray(manifest.rewrites) ? manifest.rewrites : Object.values(manifest.rewrites).flat();
  assert.equal(routes.length, 1, 'El build aislado sólo admite el proxy esperado');
  assert.equal(routes[0].source, '/backend/:path*');
  assert.equal(routes[0].destination, api.replace(/\/+$/, '') + '/:path*', 'El build compiló otro destino API');
}
function assertIsolatedProductionBuild(env = process.env, webRoot = web) {
  const expected = profile(env), root = path.resolve(webRoot, '../..'), dist = path.join(webRoot, '.next');
  const gate = JSON.parse(fs.readFileSync(path.join(dist, 'isolated-test-gate.json'), 'utf8'));
  assert.equal(gate.mode, 'isolated-browser-contracts');
  assert.equal(gate.profileSha256, sha(JSON.stringify(expected)), 'El build usa otras URLs o flags públicos');
  assert.equal(gate.buildId, fs.readFileSync(path.join(dist, 'BUILD_ID'), 'utf8').trim(), 'BUILD_ID distinto');
  const routes = fs.readFileSync(path.join(dist, 'routes-manifest.json'));
  assert.equal(sha(routes), gate.routesSha256, 'El proxy compilado cambió');
  proxy(JSON.parse(routes), expected.NEXT_PUBLIC_API_URL);
  assert.ok(gate.sources?.length > 0, 'Faltan fuentes del build');
  for (const entry of gate.sources) {
    const file = path.resolve(root, entry.file);
    assert.ok(file.startsWith(root + path.sep) && /^(apps\/web\/|libs\/dtos\/|libs\/crypto\/|package\.json$|pnpm-lock\.yaml$)/.test(entry.file), 'Fuente fuera del workspace');
    assert.equal(sha(fs.readFileSync(file)), entry.sha256, 'Fuente modificada después del build: ' + entry.file);
  }
  return gate;
}
function build() {
  const publicProfile = profile(process.env), root = path.resolve(web, '../..');
  for (const folder of [root, web]) for (const name of ['.env', '.env.local', '.env.production', '.env.production.local', '.env.test', '.env.test.local']) assert.ok(!fs.existsSync(path.join(folder, name)), 'El build aislado no carga archivos de entorno');
  const inputs = execFileSync('git', ['ls-files', '-z', '--', 'apps/web', 'libs/dtos', 'libs/crypto', 'package.json', 'pnpm-lock.yaml'], { cwd: root, encoding: 'utf8', windowsHide: true }).split('\0').filter(file => file && /\.(?:[cm]?js|tsx?|css|json|yaml)$/.test(file) && !file.includes('/tests/'));
  const snapshot = () => inputs.map(file => ({ file, sha256: sha(fs.readFileSync(path.join(root, file))) }));
  const sources = snapshot();
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|SYSTEMROOT|WINDIR|COMSPEC|PATHEXT|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|PROGRAMFILES|PROGRAMFILES\(X86\)|PROGRAMDATA|NUMBER_OF_PROCESSORS|PROCESSOR_ARCHITECTURE)$/i.test(key)));
  for (const name of names) if (publicProfile[name] !== null) env[name] = publicProfile[name];
  Object.assign(env, { NODE_ENV: 'production', DEPLOYMENT_ENV: 'PROD', NEXT_TELEMETRY_DISABLED: '1', E2E_ISOLATED_BROWSER: '1', PLAYWRIGHT_SKIP_GLOBAL_AUTH: '1', PLAYWRIGHT_PRODUCTION_WEB: '1' });
  execFileSync(process.execPath, [require.resolve('next/dist/bin/next'), 'build'], { cwd: web, env, windowsHide: true, stdio: 'inherit', timeout: 1200000 });
  assert.deepEqual(snapshot(), sources, 'Fuentes cambiadas durante el build');
  const dist = path.join(web, '.next'), routes = fs.readFileSync(path.join(dist, 'routes-manifest.json'));
  proxy(JSON.parse(routes), publicProfile.NEXT_PUBLIC_API_URL);
  const gate = { mode: 'isolated-browser-contracts', buildId: fs.readFileSync(path.join(dist, 'BUILD_ID'), 'utf8').trim(), profileSha256: sha(JSON.stringify(publicProfile)), routesSha256: sha(routes), sources, remoteWrites: false };
  fs.writeFileSync(path.join(dist, 'isolated-test-gate.json'), JSON.stringify(gate, null, 2));
  assertIsolatedProductionBuild();
  console.log('ISOLATED_PRODUCTION_BUILD_PASS');
}
module.exports = { profile, assertIsolatedProductionBuild };
if (require.main === module) build();
