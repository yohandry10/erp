import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), ts = createRequire(path.join(web, 'package.json'))('typescript'), module = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(web, 'lib/finanzas/cxc-adjustment-contract.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module, exports: module.exports, Date, Object, Number, Math, JSON });
const { confirmCxcReschedule, confirmCxcCreditNote } = module.exports, id = n => 'aa470000-0000-4000-8000-' + String(n).padStart(12, '0'), clone = v => JSON.parse(JSON.stringify(v)), checks = [];
const scope = { tenantId: id(1), actorId: id(2), cuenta: { id: id(3), cliente_id: id(4), documento_id: id(5), total: 10, saldo: 10, moneda: 'PEN' }, key: 'original-ui-request-key' };
const reschedule = { ...clone(scope), payload: { nueva_fecha_vencimiento: '2026-12-31', motivo: 'Extensión', comentarios: 'Aprobado' } };
const note = { ...clone(scope), payload: { monto: .01, codigo_motivo: '10', motivo: 'Ajuste comercial', documento_id: id(5), idempotency_key: scope.key }, country: 'PE' };
const proof = (kind, e) => ({ version: 1, kind, operation_id: id(6), tenant_id: e.tenantId, actor_id: e.actorId, cuenta_id: e.cuenta.id, idempotency_key: e.key, request_fingerprint: 'a'.repeat(64) });
function receipt(e = reschedule) { return { success: true, data: { ...e.cuenta, tenant_id: e.tenantId, fecha_vencimiento: e.payload.nueva_fecha_vencimiento, estado: 'PENDIENTE', receipt: { ...proof('CXC_REPROGRAM', e), request: { ...e.payload }, fecha_anterior: '2026-10-14', idempotent: false } } }; }
function noteReceipt(e = note) { return { success: true, data: { success: true, documento_id: id(7), cpe_id: id(8), event_id: id(9), documento_origen_id: e.payload.documento_id, tipo_documento: e.country === 'CO' ? '91' : '07', total: e.payload.monto, serie: 'FC01', numero: '1', estado: 'BORRADOR', requiere_firma: true, financial_effect_status: 'PENDING_FISCAL_ACCEPTANCE', cxc_reduction: 0, saldo_favor: 0, cxc_id: null, saldo_favor_id: null, idempotent: false, receipt: { ...proof('CXC_CREDIT_NOTE_CREATE', e), documento_origen_id: e.payload.documento_id, request: { monto: e.payload.monto, codigo_motivo: e.payload.codigo_motivo, motivo: e.payload.motivo } } } }; }
const test = (name, run) => { run(); checks.push(name); };
const reject = (name, mutate, mode = 'reschedule') => test(name, () => { const expected = clone(mode === 'note' ? note : reschedule), r = mode === 'note' ? noteReceipt(expected) : receipt(expected); mutate(r, expected); assert.throws(() => (mode === 'note' ? confirmCxcCreditNote : confirmCxcReschedule)(r, expected)); });
test('reschedule_original_receipt', () => confirmCxcReschedule(receipt(), reschedule));
test('reschedule_replay_keeps_original_result', () => { const r = receipt(); r.data.receipt.idempotent = true; confirmCxcReschedule(r, reschedule); });
test('reschedule_does_not_rebase_on_later_balance', () => { const r = receipt(); r.data.saldo = 9; confirmCxcReschedule(r, reschedule); });
test('note_creation_is_financially_neutral', () => confirmCxcCreditNote(noteReceipt(), note));
test('note_original_replay', () => { const r = noteReceipt(); r.data.idempotent = true; confirmCxcCreditNote(r, note); });
test('DIAN91_existing_contract', () => { const e = clone(note); e.country = 'CO'; e.payload.codigo_motivo = '3'; confirmCxcCreditNote(noteReceipt(e), e); });
for (const mode of ['reschedule', 'note']) {
  for (const value of [null, {}, { success: true }, { success: true, data: {} }, { queued: true, success: true }]) test(mode + '_partial_' + JSON.stringify(value), () => assert.throws(() => (mode === 'note' ? confirmCxcCreditNote : confirmCxcReschedule)(value, mode === 'note' ? note : reschedule)));
  for (const flag of ['cached', 'offline', 'queued', 'pending', 'from_cache']) for (const place of ['envelope', 'data', 'receipt', 'request']) reject(mode + '_' + place + '_' + flag, r => { ({ envelope: r, data: r.data, receipt: r.data.receipt, request: r.data.receipt.request })[place][flag] = true; }, mode);
  for (const [field, value] of [['version', 2], ['kind', 'OTHER'], ['operation_id', ''], ['tenant_id', id(20)], ['actor_id', id(20)], ['cuenta_id', id(20)], ['idempotency_key', 'other-key'], ['request_fingerprint', ''], ['request', null]]) reject(mode + '_proof_' + field, r => r.data.receipt[field] = value, mode);
  for (const field of ['tenantId', 'actorId', 'key']) reject(mode + '_bad_expected_' + field, (_r, e) => e[field] = '', mode);
}
for (const [field, value] of [['id', id(20)], ['tenant_id', id(20)], ['cliente_id', id(20)], ['moneda', 'USD'], ['total', 11], ['saldo', -1], ['fecha_vencimiento', '2026-12-30'], ['estado', 'CANCELADO'], ['monto_total', 11], ['saldo_pendiente', 11]]) reject('reschedule_account_' + field, r => r.data[field] = value);
for (const field of ['nueva_fecha_vencimiento', 'motivo', 'comentarios']) reject('reschedule_request_' + field, r => r.data.receipt.request[field] = 'wrong');
reject('reschedule_no_replay_flag', r => delete r.data.receipt.idempotent);
reject('reschedule_invalid_previous_date', r => r.data.receipt.fecha_anterior = '2026-02-30');
reject('reschedule_invalid_request_date', (_r, e) => e.payload.nueva_fecha_vencimiento = '2026-02-30');
for (const [field, value] of [['success', false], ['documento_id', ''], ['cpe_id', ''], ['event_id', ''], ['documento_origen_id', id(20)], ['tipo_documento', '08'], ['total', .02], ['serie', ''], ['numero', '0'], ['estado', 'ACEPTADO'], ['requiere_firma', false], ['financial_effect_status', 'APPLIED'], ['cxc_reduction', .01], ['saldo_favor', .01], ['cxc_id', id(20)], ['saldo_favor_id', id(20)], ['idempotent', undefined]]) reject('note_result_' + field, r => r.data[field] = value, 'note');
for (const field of ['monto', 'codigo_motivo', 'motivo']) reject('note_request_' + field, r => r.data.receipt.request[field] = 'wrong', 'note');
reject('note_receipt_wrong_origin', r => r.data.receipt.documento_origen_id = id(20), 'note');
reject('note_expected_invalid_amount', (_r, e) => e.payload.monto = .001, 'note');
reject('note_expected_other_origin', (_r, e) => e.cuenta.documento_id = id(20), 'note');
reject('note_expected_over_balance', (_r, e) => e.cuenta.saldo = 0, 'note');
reject('note_expected_wrong_country', (_r, e) => e.country = 'AR', 'note');
console.log(JSON.stringify({ result: 'PASS', checks: checks.length, cases: checks }));
