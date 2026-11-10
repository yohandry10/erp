import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../../lib/auth-service.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const oldUser = { id: 'old-actor', tenant_id: 'old-tenant', email: 'old@example.test', roles: ['ADMIN_DEMO'] };
const newUser = { id: 'new-actor', tenant_id: 'new-tenant', email: 'new@example.test', roles: ['ADMIN_DEMO'] };
const flush = () => new Promise(setImmediate);
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const response = (user, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => user });

function load() {
  const oldProfile = deferred(), profileRequests = [], module = { exports: {} };
  const store = new Map([['erp.auth.session.snapshot', JSON.stringify({ user: oldUser })]]);
  const storage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) };
  const window = { location: { pathname: '/dashboard/' }, localStorage: storage, sessionStorage: storage };
  const dependencies = {
    './api-url': { buildApiUrl: route => `http://127.0.0.1${route}` },
    './offline-store': { isDesktopRuntime: () => false, getOfflineStatus: async () => ({ offline_mode: false }), clearCachedApiResponses: async () => {} },
    './desktop-secure-session': { saveDesktopAccessToken: async () => {}, loadDesktopAccessToken: async () => null, clearDesktopAccessToken: async () => {} },
  };
  vm.runInNewContext(compiled, {
    module, exports: module.exports, window, navigator: { onLine: true }, AbortController, setTimeout, clearTimeout, console,
    require: name => { assert.ok(dependencies[name], `Dependencia inesperada: ${name}`); return dependencies[name]; },
    fetch: async (url, options) => {
      if (url.includes('/login/')) return response({ user: newUser, access_token: 'new-synthetic-token' });
      if (url.includes('/logout/')) return response({ success: true });
      assert.ok(url.includes('/profile/'), url);
      profileRequests.push(options?.headers?.Authorization ?? 'cookie-old-session');
      if (profileRequests.length === 1) return oldProfile.promise;
      return response(newUser);
    },
  });
  return { auth: module.exports.customAuth, oldProfile, profileRequests, window };
}

for (const oldStatus of [200, 401]) {
  const { auth, oldProfile, profileRequests, window } = load();
  const readingOldSession = auth.getSession();
  await flush();
  assert.equal(profileRequests.length, 1);
  window.location.pathname = '/demo/';
  const signingIn = auth.signInWithPassword({ email: newUser.email, password: 'synthetic-existing-password' });
  await flush();
  oldProfile.resolve(response(oldUser, oldStatus));
  const [oldRead, login] = await Promise.all([readingOldSession, signingIn]);
  assert.equal(login.error, null);
  assert.equal(login.data.user.id, newUser.id, `Perfil anterior ${oldStatus} no debe decidir la identidad del nuevo login`);
  assert.equal(auth.getCachedSession().session.user.tenant_id, newUser.tenant_id, 'El perfil tardío no reinstala ni elimina la empresa recién autenticada');
  assert.equal(auth.getCachedSession().accessToken, 'new-synthetic-token');
  assert.equal(profileRequests.length, 2, 'Login debe validar un perfil con su nueva autenticación');
  assert.equal(profileRequests[1], 'Bearer new-synthetic-token');
  assert.notEqual(oldRead.data.session?.user.id, oldUser.id, 'Una lectura antigua tampoco devuelve identidad obsoleta al contexto React');
}

{
  const { auth, oldProfile } = load();
  const reading = auth.getSession();
  await flush();
  await auth.signOut();
  oldProfile.resolve(response(oldUser));
  const oldRead = await reading;
  assert.equal(oldRead.data.session, null, 'El perfil tardío no revive la sesión después de salir');
  assert.equal(auth.getCachedSession().session, null);
  assert.equal(auth.getCachedSession().accessToken, null);
}

{
  const { auth, oldProfile, profileRequests } = load();
  const reads = [auth.getSession(), auth.getSession(), auth.getSession()];
  await flush();
  assert.equal(profileRequests.length, 1, 'Las consultas de la misma sesión siguen compartiendo un único perfil en vuelo');
  oldProfile.resolve(response(oldUser));
  assert.ok((await Promise.all(reads)).every(r => r.data.session?.user.id === oldUser.id));
}
console.log('PASS perfil de sesión: login no reutiliza la identidad previa; lecturas tardías no reviven sesiones y el vuelo vigente se comparte');
