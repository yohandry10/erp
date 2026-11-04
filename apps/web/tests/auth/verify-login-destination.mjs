import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../../lib/login-destination.ts', import.meta.url), 'utf8');
const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
  { module, exports: module.exports, URL });
const { loginDestination, sessionEndedLoginUrl } = module.exports;
const order = '/dashboard/ventas/pedidos/test-order/?view=detalle#entrega';
assert.equal(loginDestination(order, false), order);
assert.equal(loginDestination('/superadmin/tenants/?page=2', true), '/superadmin/tenants/?page=2');
for (const target of [null, '', 'https://example.test/dashboard/', '//example.test/dashboard/',
  '/\\example.test/dashboard/', '/login/', '/dashboard-externo/', '/dashboard/../../login/',
  '/dashboard/\nmalicioso', '/dashboard/%2e%2e/login/', '/superadmin/dashboard/']) {
  assert.equal(loginDestination(target, false), '/dashboard/', `Unsafe destination: ${target}`);
}
assert.equal(loginDestination(order, true), '/superadmin/dashboard/');
assert.equal(loginDestination(null, true), '/superadmin/dashboard/');
const expired = new URL(sessionEndedLoginUrl({ pathname: '/dashboard/ventas/rma/test-rma/', search: '?view=recepcion', hash: '#lineas' }, false), 'https://erp.invalid');
assert.equal(expired.pathname, '/login/');
assert.equal(expired.searchParams.get('reason'), 'session-ended');
assert.equal(expired.searchParams.get('redirect'), '/dashboard/ventas/rma/test-rma/?view=recepcion#lineas');
assert.equal(loginDestination(expired.searchParams.get('redirect'), false), '/dashboard/ventas/rma/test-rma/?view=recepcion#lineas');
assert.equal(new URL(sessionEndedLoginUrl({ pathname: '//evil.test/dashboard/' }, false), 'https://erp.invalid').searchParams.get('redirect'), '/dashboard/');
const login = fs.readFileSync(new URL('../../app/login/page.tsx', import.meta.url), 'utf8');
assert.ok(/window\.location\.replace\(loginDestination\(/.test(login), 'El login debe usar el resolver de destino seguro');
const hookSource = fs.readFileSync(new URL('../../hooks/use-api.ts', import.meta.url), 'utf8');
const hookCompiled = ts.transpileModule(hookSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
async function rejectedRequest(profileSession) {
  const hookModule = { exports: {} };
  let signedOut = 0;
  const location = { pathname: '/dashboard/ventas/rma/test-rma/', search: '?view=recepcion', hash: '#lineas', href: '' };
  const dependencies = {
    react: { useState: value => [value, () => {}], useCallback: fn => fn },
    '@/components/ui/use-toast': { useToast: () => ({ toast: () => {} }) },
    '@/contexts/AuthContext': { useAuth: () => ({ loading: false, session: { user: { id: 'qa', tenant_id: 'demo' } } }) },
    '@/lib/auth-service': { customAuth: { getSession: async () => ({ data: { session: profileSession } }), signOut: async () => { signedOut++; } } },
    '@/lib/api-contract': { getApiErrorMessage: value => value.message },
    '@/lib/api-url': { normalizeApiEndpoint: value => value, buildApiUrl: value => value, withTrailingSlash: value => value },
    '@/lib/offline-store': { fetchWithOfflineSupport: async () => ({ status: 401, json: async () => ({ message: 'Recurso no autorizado' }) }) },
    '@/lib/initial-country': { isActiveCountryId: () => false, INITIAL_ACTIVE_COUNTRY_ID: '1' },
    '@/lib/login-destination': module.exports,
  };
  vm.runInNewContext(hookCompiled, {
    module: hookModule, exports: hookModule.exports,
    require: name => { assert.ok(dependencies[name], `Dependencia inesperada: ${name}`); return dependencies[name]; },
    window: { location, localStorage: { getItem: () => null } },
    URLSearchParams, Headers, FormData, AbortController, Error, setTimeout, clearTimeout,
    console: { log: () => {}, error: () => {}, warn: () => {} },
  });
  await assert.rejects(hookModule.exports.useApi({ throwOnError: true, showErrorToast: false }).post('/api/demo-action', {}), error => error.status === 401);
  return { signedOut, location };
}
const lostSession = await rejectedRequest(null);
assert.equal(lostSession.signedOut, 1);
assert.equal(lostSession.location.href, expired.pathname + expired.search);
const validSession = await rejectedRequest({ user: { id: 'qa', tenant_id: 'demo' } });
assert.equal(validSession.signedOut, 0, 'Un 401 de módulo con perfil válido no debe cerrar la sesión');
assert.equal(validSession.location.href, '');
console.log('PASS: retorno al pedido conserva filtros y ancla; rechaza destinos externos y otro espacio de permisos');
