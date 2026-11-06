import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ts = createRequire(path.join(web, 'package.json'))('typescript');
const modules = new Map();
function load(file) {
  const full = path.join(web, file);
  if (modules.has(full)) return modules.get(full);
  const module = { exports: {} }; modules.set(full, module.exports);
  const source = ts.transpileModule(fs.readFileSync(full, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(source, { module, exports: module.exports, URLSearchParams, require: name => load(path.relative(web, path.resolve(path.dirname(full), name + '.ts'))) });
  return module.exports;
}
function storage() { const map = new Map(); return { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k) }; }
const id = n => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;
const owner = { tenantId: id(1), actorId: id(2) };
const intent = { mode: 'ajuste', payload: { producto_id: id(3), almacen_id: id(4), delta: 2, motivo: 'Ajuste de verificación', idempotency_key: `inventario-ajuste:${id(8)}` } };
const receipt = { success: true, operacion_id: id(5), movimiento_id: id(6), event_id: id(7), producto_id: id(3), almacen_id: id(4), delta: 2,
  cantidad: 2, tipo: 'SOBRANTE', idempotent: false, stock_nuevo: 50, costo_unitario: 18, valor: 36,
  operation_identity: { version: 1, type: 'AJUSTE', operation_id: id(5), tenant_id: id(1), actor_id: id(2),
    idempotency_key: intent.payload.idempotency_key, request_fingerprint: 'a'.repeat(64), confirmed_at: '2026-11-05T10:00:00Z',
    request_payload: { producto_id: id(3), almacen_id: id(4), ubicacion_id: null, centro_costo_id: null, delta: 2, motivo: intent.payload.motivo } } };
const { archiveInventoryConfirmation: confirm, readInventoryArchivedReceipt: archived } = load('lib/inventory-operation-archive.ts');
const pendingKey = `erp.inventory-operation-intent.${owner.tenantId}.${owner.actorId}`;
const shared = storage(); shared.setItem(pendingKey, JSON.stringify(intent));
confirm(shared, intent, receipt, owner); // Primera pestaña confirma y retira.
assert.equal(shared.getItem(pendingKey), null);
confirm(shared, intent, { ...receipt, idempotent: true }, owner); // Segundo 201 de la misma operación.
assert.equal(shared.getItem(pendingKey), null); // No recrea el pendiente.
assert.equal(archived(shared, intent, owner).stock_nuevo, 50);
assert.throws(() => confirm(shared, intent, { ...receipt, stock_nuevo: 100 }, owner));
assert.throws(() => confirm(shared, intent, receipt, { ...owner, actorId: id(9) }));
const changed = JSON.stringify({ ...intent, payload: { ...intent.payload, delta: 3 } });
shared.setItem(pendingKey, changed);
assert.throws(() => confirm(shared, intent, receipt, owner));
assert.equal(shared.getItem(pendingKey), changed);
const transfer = { mode: 'transferencia', payload: { producto_id: id(3), almacen_origen_id: id(4), almacen_destino_id: id(14), cantidad: 2, motivo: 'Traslado entre almacenes', idempotency_key: `inventario-transferencia:${id(16)}` } };
const transferReceipt = { success: true, operacion_id: id(17), movimiento_salida_id: id(18), movimiento_entrada_id: id(19),
  producto_id: id(3), almacen_origen_id: id(4), almacen_destino_id: id(14), cantidad: 2, idempotent: false, traslado_entre_establecimientos: null,
  operation_identity: { version: 1, type: 'TRANSFERENCIA', operation_id: id(17), tenant_id: id(1), actor_id: id(2),
    idempotency_key: transfer.payload.idempotency_key, request_fingerprint: 'b'.repeat(64), confirmed_at: '2026-11-05T10:00:01Z',
    request_payload: { producto_id: id(3), almacen_origen_id: id(4), almacen_destino_id: id(14), ubicacion_origen_id: null, ubicacion_destino_id: null,
      cantidad: 2, motivo: transfer.payload.motivo, lote: null, fecha_expiracion: null, guia_remision_id: null } } };
const transferStorage = storage(); transferStorage.setItem(pendingKey, JSON.stringify(transfer));
confirm(transferStorage, transfer, transferReceipt, owner);
confirm(transferStorage, transfer, { ...transferReceipt, idempotent: true }, owner);
assert.equal(transferStorage.getItem(pendingKey), null);
assert.equal(archived(transferStorage, transfer, owner).cantidad, 2);
assert.throws(() => confirm(transferStorage, transfer, { ...transferReceipt, movimiento_salida_id: id(20) }, owner));
console.log('D-06: mismo recibo en dos pestañas, recuperación archivada, recibo alterado, actor y pendiente distintos PASS');

const invoice = load('lib/ventas/invoice-generation-operation.ts');
const scope = { ...owner, orderId: id(10) };
const order = { state: 'CONFIRMADO', invoiceId: null, billed: [0], dispatched: [0], snapshot: {
  id: scope.orderId, tenantId: scope.tenantId, number: 'PED-LOCAL-1', clientId: id(11), clientDocument: null,
  currency: 'PEN', subtotal: 100, igv: 18, total: 118,
  lines: [{ id: id(12), productId: id(3), description: 'Producto de prueba', quantity: 2, price: 50, subtotal: 100 }],
} };
const invoiceIntent = invoice.newInvoiceIntent(order, scope, '01', false);
const key = invoice.invoiceIntentKey(scope), serialized = JSON.stringify(invoiceIntent);
const account = storage(); account.setItem(key, serialized);
for (const unsafe of [order, { ...order, state: 'CANCELADO', invoiceId: id(15) }, { ...order, state: 'CANCELADO', billed: [1] },
  { ...order, state: 'CANCELADO', snapshot: { ...order.snapshot, total: 999 } }]) {
  assert.equal(invoice.archiveCancelledInvoiceIntent(account, invoiceIntent, unsafe), false);
  assert.equal(account.getItem(key), serialized);
}
assert.equal(invoice.archiveCancelledInvoiceIntent(account, invoiceIntent, { ...order, state: 'CANCELADO' }), true);
assert.equal(account.getItem(key), null);
assert.equal(JSON.parse(account.getItem(key + '.cancelled')).resolution, 'ORDER_CANCELLED_NO_INVOICE');
account.setItem(key, 'intención de otra pestaña');
assert.throws(() => invoice.archiveCancelledInvoiceIntent(account, invoiceIntent, { ...order, state: 'CANCELADO' }));
assert.equal(account.getItem(key), 'intención de otra pestaña');
console.log('D-10: cancelar sin factura archiva intención; factura existente, cobro parcial, snapshot o pendiente distinto se conservan PASS');

const { journalPrintContext } = load('lib/contabilidad/journal-print-context.ts');
const context = { success: true, requiresSetup: false, data: { tenantId: id(1), razonSocial: 'Empresa local', monedaDefecto: 'PEN', isDemo: true } };
assert.equal(journalPrintContext(context, id(1)).company, 'Empresa local');
assert.throws(() => journalPrintContext(context, id(9)));
assert.throws(() => journalPrintContext({ ...context, data: { ...context.data, monedaDefecto: null } }, id(1)));
console.log('D-03: contexto de impresión confirma empresa, moneda y modalidad; rechaza empresa ajena y contexto incompleto PASS');
