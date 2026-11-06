import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ts = createRequire(path.join(web, 'package.json'))('typescript');
const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(web, 'lib/finanzas/supplier-invoice-intent.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: mod, exports: mod.exports });
const { validateSupplierInvoiceAmounts: validate, releaseRejectedSupplierInvoiceIntent: release, readSupplierInvoiceIntent: read, supplierInvoiceIntentKey: key } = mod.exports;
const scope = { tenantId: '11111111-1111-4111-8111-111111111111', actorId: '22222222-2222-4222-8222-222222222222' };
const intent = { ...scope, version: 1, createdAt: '2026-11-05T12:00:00Z', payload: {
  proveedor_id: '33333333-3333-4333-8333-333333333333', tipo_documento: 'FACTURA', serie: '', numero_documento: 'QA-1',
  fecha_emision: '2026-11-05', fecha_vencimiento: '2026-11-05', condiciones_pago: 'CONTADO',
  subtotal: 1e12, igv: 0, total: 1e12, moneda: 'PEN', tipo_cambio: 1, destino_credito_fiscal: 'GRAVADAS',
} };
// El intento heredado sigue siendo recuperable; no se esconde al endurecer la validación de nuevas altas.
assert.equal(read(JSON.stringify(intent), scope).payload.total, 1e12);
assert.throws(() => validate(intent.payload));
validate({ subtotal: 999999999999.99, igv: 0, total: 999999999999.99 });
for (const amount of [Infinity, NaN, -1, .001, 1e12]) assert.throws(() => validate({ subtotal: amount, igv: 0, total: amount }));
assert.throws(() => validate({ subtotal: 999999999999.99, igv: 0, total: 999999999999.99, percepcion: .01 }));
const code = 'SUPPLIER_INVOICE_AMOUNT_OUT_OF_RANGE';
for (const error of [{ status: 500, data: { code } }, { status: 400 }, new Error('offline'), { status: 409, data: { code } }, { status: 401, data: { code } }]) {
  let removed = false;
  assert.equal(release(error, intent, { getItem: () => JSON.stringify(intent), removeItem: () => { removed = true; } }), false);
  assert.equal(removed, false);
}
let serialized = JSON.stringify(intent);
const storage = { getItem: k => { assert.equal(k, key(scope)); return serialized; }, removeItem: () => { serialized = null; } };
assert.equal(release({ status: 400, data: { code } }, intent, storage), true);
assert.equal(serialized, null);
assert.equal(intent.payload.total, 1e12); // Permite corregir conservando los datos del formulario.
assert.equal(release({ status: 400, data: { code } }, intent, { getItem: () => 'otro intento', removeItem: () => assert.fail('No borrar el intento de otra pestaña') }), false);
serialized = JSON.stringify(intent);
assert.equal(release({ status: 400, data: { code: 'SUPPLIER_INVOICE_PERIOD_NOT_OPEN' } }, intent, storage), true);
assert.equal(serialized, null);
assert.equal(intent.payload.fecha_emision, '2026-11-05');
assert.equal(release({ status: 500, data: { code: 'SUPPLIER_INVOICE_PERIOD_NOT_OPEN' } }, intent, { getItem: () => JSON.stringify(intent), removeItem: () => assert.fail('No liberar ante respuesta incierta') }), false);
console.log('D-13/B-09: límites, período cerrado, rechazo confirmado, red incierta y concurrencia: PASS');
