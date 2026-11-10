import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const { profile, assertIsolatedProductionBuild } = createRequire(import.meta.url)('../../scripts/build-isolated-web.cjs');
const env = { E2E_ISOLATED_BROWSER: '1', PLAYWRIGHT_SKIP_GLOBAL_AUTH: '1', PLAYWRIGHT_PRODUCTION_WEB: '1', BASE_URL: 'http://127.0.0.1:3001', NEXT_PUBLIC_API_URL: 'http://127.0.0.1:3002', SUPABASE_URL: 'http://127.0.0.1:54321', NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321' };
for (const name of ['BASE_URL', 'NEXT_PUBLIC_API_URL', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL']) {
  assert.throws(() => profile({ ...env, [name]: 'https://wypnbcptofqdmoynlonq.supabase.co' }));
  assert.throws(() => profile({ ...env, [name]: 'http://user:secret@127.0.0.1:3002' }));
}
assert.throws(() => profile({ ...env, E2E_ISOLATED_BROWSER: '0' }));
assert.throws(() => profile({ ...env, NEXT_DIST_DIR: '../otra-carpeta' }));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-isolated-build-'));
const web = path.join(root, 'apps/web'), dist = path.join(web, '.next');
const sha = value => createHash('sha256').update(value).digest('hex');
try {
  fs.mkdirSync(dist, { recursive: true });
  fs.mkdirSync(path.join(web, 'app'));
  const file = path.join(web, 'app/page.tsx'); fs.writeFileSync(file, 'synthetic source');
  fs.writeFileSync(path.join(dist, 'BUILD_ID'), 'synthetic-build');
  const routes = JSON.stringify({ rewrites: { beforeFiles: [], afterFiles: [{ source: '/backend/:path*', destination: 'http://127.0.0.1:3002/:path*' }], fallback: [] } });
  fs.writeFileSync(path.join(dist, 'routes-manifest.json'), routes);
  const gate = { mode: 'isolated-browser-contracts', buildId: 'synthetic-build', profileSha256: sha(JSON.stringify(profile(env))), routesSha256: sha(routes), sources: [{ file: 'apps/web/app/page.tsx', sha256: sha('synthetic source') }] };
  const write = value => fs.writeFileSync(path.join(dist, 'isolated-test-gate.json'), JSON.stringify(value));
  assert.throws(() => assertIsolatedProductionBuild(env, web));
  write(gate); assert.equal(assertIsolatedProductionBuild(env, web).buildId, 'synthetic-build');
  assert.throws(() => assertIsolatedProductionBuild({ ...env, NEXT_PUBLIC_API_URL: 'http://127.0.0.1:3999' }, web));
  fs.writeFileSync(path.join(dist, 'BUILD_ID'), 'another-build'); assert.throws(() => assertIsolatedProductionBuild(env, web));
  fs.writeFileSync(path.join(dist, 'BUILD_ID'), 'synthetic-build');
  fs.writeFileSync(file, 'changed source'); assert.throws(() => assertIsolatedProductionBuild(env, web)); fs.writeFileSync(file, 'synthetic source');
  write({ ...gate, sources: [{ file: '../outside', sha256: sha('x') }] }); assert.throws(() => assertIsolatedProductionBuild(env, web));
  write(gate);
  const remoteRoutes = JSON.stringify({ rewrites: [{ source: '/backend/:path*', destination: 'https://example.test/:path*' }] });
  fs.writeFileSync(path.join(dist, 'routes-manifest.json'), remoteRoutes); write({ ...gate, routesSha256: sha(remoteRoutes) });
  assert.throws(() => assertIsolatedProductionBuild(env, web));
} finally {
  assert.ok(fs.realpathSync(root).startsWith(fs.realpathSync(os.tmpdir()) + path.sep));
  fs.rmSync(root, { recursive: true, force: true });
}
console.log('PASS E2E producción aislada: URLs, build, proxy y fuentes verificadas; PROD y builds ajenos rechazados.');
