import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../../lib/auth-service.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function load(save, options = {}) {
  const module = { exports: {} };
  const dependencies = {
    './api-url': { buildApiUrl: path => `http://127.0.0.1${path}` },
    './offline-store': { isDesktopRuntime: () => options.desktop !== false, getOfflineStatus: async () => ({ offline_mode: false }), clearCachedApiResponses: async () => {} },
    './desktop-secure-session': { saveDesktopAccessToken: save, loadDesktopAccessToken: options.read || (async () => null), clearDesktopAccessToken: async () => {} },
  };
  vm.runInNewContext(compiled, {
    module, exports: module.exports, Error,
    require: name => { assert.ok(dependencies[name], `Dependencia inesperada: ${name}`); return dependencies[name]; },
    navigator: { onLine: true }, window: {}, console: { warn: () => {} },
    fetch: async url => ({ ok: true, json: async () => url.includes('/login/')
      ? { access_token: 'synthetic-token', user: { id: 'actor', tenant_id: 'target', roles: [] } }
      : { id: 'actor', tenant_id: 'target', is_super_admin: true, roles: [] } }),
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
let loginPersist;
let loginSettled = false;
const loginAuth = load(() => new Promise(resolve => { loginPersist = resolve; }));
const loggingIn = loginAuth.signInWithPassword({ email: 'synthetic@local.test', password: 'synthetic' }).then(result => { loginSettled = true; return result; });
await new Promise(setImmediate);
assert.equal(typeof loginPersist, 'function');
assert.equal(loginSettled, false, 'El login no debe navegar antes de persistir el token protegido');
loginPersist();
assert.equal((await loggingIn).error, null);
const unavailableLogin = load(async () => { throw new Error('Almacén seguro no disponible'); });
const rejectedLogin = await unavailableLogin.signInWithPassword({ email: 'synthetic@local.test', password: 'synthetic' });
assert.match(rejectedLogin.error.message, /Almacén seguro no disponible/);
assert.equal(rejectedLogin.data, null);
let restore, restoreCalls = 0, ready = false;
const restored = load(async () => {}, { read: () => { restoreCalls++; return new Promise(resolve => { restore = resolve; }); } });
const requests = Promise.all([restored.getRequestSession(), restored.getRequestSession()]).then(value => { ready = true; return value; });
await new Promise(setImmediate);
assert.equal(restoreCalls, 1, 'Las primeras consultas comparten una restauración protegida');
assert.equal(ready, false, 'No enviar lecturas autenticadas mientras falta el token seguro');
restore('synthetic-restored-token');
assert.ok((await requests).every(value => value.accessToken === 'synthetic-restored-token'));
await restored.getRequestSession();assert.equal(restoreCalls, 1, 'Una consulta posterior no vuelve a leer el almacén ni llama al perfil');
let lateRestore;
const revoked = load(async () => {}, { read: () => new Promise(resolve => { lateRestore = resolve; }) });
const oldRequest = revoked.getRequestSession();await new Promise(setImmediate);await revoked.signOut();lateRestore('synthetic-old-token');
assert.equal((await oldRequest).accessToken, null, 'Una lectura segura tardía no revive el token tras logout');
const browser = load(async () => {}, { desktop: false, read: async () => { throw new Error('No debe consultar almacén desktop'); } });
assert.equal((await browser.getRequestSession()).accessToken, null);
const apiSource = fs.readFileSync(new URL('../../lib/api-fetch.ts', import.meta.url), 'utf8');
const apiCompiled = ts.transpileModule(apiSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
let restoreBeforeFetch;
const firstAuth = load(async () => {}, { read: () => new Promise(resolve => { restoreBeforeFetch = resolve; }) });
const sent = [], apiModule = { exports: {} };
const apiDependencies = {
  './auth-service': { customAuth: firstAuth },
  './api-url': { buildApiUrl: value => `http://local${value}`, normalizeApiEndpoint: value => value, withTrailingSlash: value => value.endsWith('/') ? value : `${value}/` },
  './offline-store': { fetchWithOfflineSupport: async (url, options) => { sent.push({ url, authorization: options.headers.get('Authorization') }); return { ok: true }; } },
};
vm.runInNewContext(apiCompiled, { module: apiModule, exports: apiModule.exports, Headers, require: name => { assert.ok(apiDependencies[name]); return apiDependencies[name]; } });
const country = apiModule.exports.fetchApi('/api/configuration/context/country');
await new Promise(setImmediate);assert.equal(sent.length, 0, 'País no debe salir sin restaurar el token después de una recarga');
restoreBeforeFetch('synthetic-country-token');await country;
assert.equal(sent[0].authorization, 'Bearer synthetic-country-token');
console.log('PASS sesión desktop: persistencia antes de navegar, restauración coalescida antes de consultar y logout descarta lecturas tardías');
