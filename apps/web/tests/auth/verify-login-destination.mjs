import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../../lib/login-destination.ts', import.meta.url), 'utf8');
const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
  { module, exports: module.exports, URL });
const { loginDestination } = module.exports;
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
const login = fs.readFileSync(new URL('../../app/login/page.tsx', import.meta.url), 'utf8');
assert.ok(/window\.location\.replace\(loginDestination\(/.test(login), 'El login debe usar el resolver de destino seguro');
console.log('PASS: retorno al pedido conserva filtros y ancla; rechaza destinos externos y otro espacio de permisos');
