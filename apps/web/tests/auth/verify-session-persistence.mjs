import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../../lib/auth-service.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function load(save) {
  const module = { exports: {} };
  const dependencies = {
    './api-url': { buildApiUrl: path => `http://127.0.0.1${path}` },
    './offline-store': { isDesktopRuntime: () => true, getOfflineStatus: async () => ({ offline_mode: false }) },
    './desktop-secure-session': { saveDesktopAccessToken: save, loadDesktopAccessToken: async () => null, clearDesktopAccessToken: async () => {} },
  };
  vm.runInNewContext(compiled, {
    module, exports: module.exports, Error,
    require: name => { assert.ok(dependencies[name], `Dependencia inesperada: ${name}`); return dependencies[name]; },
    navigator: { onLine: true }, window: {}, console: { warn: () => {} },
    fetch: async () => ({ ok: true, json: async () => ({ id: 'actor', tenant_id: 'target', is_super_admin: true, roles: [] }) }),
  });
  return module.exports.customAuth;
}
let persist;
let settled = false;
const auth = load(() => new Promise(resolve => { persist = resolve; }));
const installing = auth.setSession({ access_token: 'synthetic-token' }).then(result => { settled = true; return result; });
await new Promise(setImmediate);
assert.equal(typeof persist, 'function');
assert.equal(settled, false, 'No debe permitir recargar antes de completar el almacén seguro');
persist();
const installed = await installing;
assert.equal(installed.error, null);
assert.equal(installed.data.session.user.tenant_id, 'target');

const unavailable = load(async () => { throw new Error('Almacén seguro no disponible'); });
const rejected = await unavailable.setSession({ access_token: 'synthetic-token' });
assert.match(rejected.error.message, /Almacén seguro no disponible/);
assert.equal(rejected.data.session, null);
console.log('PASS sesión desktop: espera persistencia segura y comunica fallos antes de recargar');
