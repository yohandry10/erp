// Ejecuta expresiones y manejadores reales de los formularios; no es aceptación visual.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ts = createRequire(path.join(web, 'package.json'))('typescript');
let failures = 0, passed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('PASS ' + name); } catch (e) { failures++; console.log('FAIL ' + name + ': ' + e.message); } }
const baseline = process.argv.includes('--baseline');
function read(file) { return baseline ? execFileSync('git', ['show', '8aded64c:apps/web/' + file], { cwd: web, encoding: 'utf8' }) : fs.readFileSync(path.join(web, file), 'utf8'); }
function source(file) { return ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, file.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS); }
function nodes(file, predicate) { const found = []; function walk(n) { if (predicate(n)) found.push(n); ts.forEachChild(n, walk); } walk(file); return found; }
function run(code, context = {}) { return vm.runInNewContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, context); }
function load(file, imports = {}) { const mod = { exports: {} }; run(read(file), { module: mod, exports: mod.exports, require: name => { if (!(name in imports)) throw Error('Import no aislado: ' + name); return imports[name]; } }); return mod.exports; }
const quote = source('components/ventas/CotizacionForm.tsx');
const quantityInput = nodes(quote, n => ts.isJsxSelfClosingElement(n) && n.attributes.properties.some(a => ts.isJsxAttribute(a) && a.name.text === 'aria-label' && a.initializer?.text === 'Cantidad'))[0];
const quantityHandler = quantityInput.attributes.properties.find(a => a.name?.text === 'onChange').initializer.expression.getText(quote);
for (const value of ['1.5', '2.5', '0.5', '']) await test('D-09 cantidad ' + (value || 'vacía'), () => {
  let saved;
  const handler = run('(' + quantityHandler + ')', { index: 0, handleCantidadChange: (_index, quantity) => { saved = quantity; } });
  handler({ target: { value } });
  assert.equal(saved, value ? Number(value) : 0);
});
await test('D-07 Completada filtra el estado persistido CERRADA', () => {
  const page = source('app/dashboard/inventario/recepciones/page.tsx');
  const states = nodes(page, n => ts.isVariableDeclaration(n) && n.name.getText(page) === 'ESTADOS')[0];
  const values = run('(' + states.initializer.getText(page) + ')');
  assert.equal(values.find(row => row.label === 'Completada').value, 'CERRADA');
});
const fiscal = load('lib/fiscal-date.ts');
class LimaNight extends Date { constructor(...args) { super(...(args.length ? args : ['2027-01-01T01:30:00Z'])); } }
for (const target of ['components/modals/OrdenCompraModal.tsx', 'components/compras/OCWizard.tsx']) {
  const page = source(target);
  for (const [i, prop] of nodes(page, n => ts.isPropertyAssignment(n) && n.name.getText(page) === 'fecha_orden' && /new Date\(\)|fiscalDateForCountry/.test(n.initializer.getText(page))).entries()) {
    await test('D-08 fecha fiscal después de 19h Lima ' + target + ':' + i, () => {
      // La función usa el Date del mismo contexto congelado, sin depender de la zona del PC.
      const mod = { exports: {} };
      run(fs.readFileSync(path.join(web, 'lib/fiscal-date.ts'), 'utf8'), { Date: LimaNight, module: mod, exports: mod.exports });
      const value = run('(' + prop.initializer.getText(page) + ')', { Date: LimaNight, country: { paisCodigo: 'PE' }, ...mod.exports });
      assert.equal(value, '2026-12-31');
    });
  }
}
await test('D-17 conserva ambos accesos de la respuesta oficial de alta', () => {
  const page = source('app/demo/page.tsx');
  const setter = nodes(page, n => ts.isCallExpression(n) && n.expression.getText(page) === 'setCredentials')[0];
  const saved = run('(' + setter.arguments[0].getText(page) + ')', { data: { email: 'creator@example.invalid', password: 'synthetic-primary', aprobador_email: 'approver@example.invalid', aprobador_password: 'synthetic-approver' } });
  assert.equal(saved.aprobador?.email, 'approver@example.invalid');
  assert.equal(saved.aprobador?.password, 'synthetic-approver');
});
await test('D-04 lee el código del error anidado del API al crear asiento', () => {
  const page = source('app/dashboard/contabilidad/asientos/nuevo/page.tsx');
  const setter = nodes(page, n => ts.isCallExpression(n) && n.expression.getText(page) === 'setError' && /manualJournalError|Error al crear el asiento contable/.test(n.arguments[0]?.getText(page)))[0];
  const context = { err: { message: 'La solicitud no se pudo procesar con los datos enviados', data: { code: 'MANUAL_ACCOUNTING_PERIOD_NOT_OPEN' } } };
  if (!baseline) Object.assign(context, load('lib/contabilidad/manual-journal-error.ts'));
  assert.match(run('(' + setter.arguments[0].getText(page) + ')', context), /período.*no está abierto/i);
});
await test('D-12 un 403 de CxP explica permiso y no ofrece reintento técnico', async () => {
  let state;
  const react = { useState: initial => [initial, value => { state = value; }], useRef: value => ({ current: value }), useCallback: fn => fn, useEffect: () => {} };
  const imports = { react, '@/contexts/AuthContext': { useAuth: () => ({ session: { user: { id: 'actor', tenant_id: 'tenant' } }, loading: false }) }, '@/hooks/use-api': { useApi: () => ({ get: async () => { throw Object.assign(new Error('denegado'), { status: 403, data: { code: 'FORBIDDEN' } }); } }) } };
  if (!baseline) imports['@/lib/finanzas/cxp-read-error'] = load('lib/finanzas/cxp-read-error.ts');
  await load('hooks/use-cxp-read.ts', imports).useCxpRead('/api/finanzas/cxp/1', x => x).reload();
  assert.match(state.error, /permiso/i);
  assert.equal(state.retryable, false);
  assert.equal(state.data, null);
});
console.log(JSON.stringify({ passed, failures, acceptance: 'LOCAL_HANDLER_CONTRACTS_ONLY' }));
process.exitCode = failures ? 1 : 0;
