import { readCxcNoteReceipt, readCxcRescheduleReceipt, cxcRescheduleFingerprint } from './cxc-adjustment-receipt';

const id = (n: number) => 'aa470000-0000-4000-8000-' + String(n).padStart(12, '0');
const tenant = id(1), actor = id(2), account = id(3), origin = id(4), key = 'original-ui-request-key';
const dto = { nueva_fecha_vencimiento: '2026-12-31', motivo: ' Extensión de plazo ', comentarios: ' Aprobado ' };
const request = { monto: 0.01, codigo_motivo: '10', motivo: 'Ajuste comercial' };
const clone = (v: any) => JSON.parse(JSON.stringify(v));
function reschedule() {
  const rpc = { success: true, id: account, cuenta: { id: account, tenant_id: tenant, fecha_vencimiento: dto.nueva_fecha_vencimiento }, fecha_anterior: '2026-10-14', motivo: 'Extensión de plazo', idempotent: false };
  const op = { id: id(5), tenant_id: tenant, actor_id: actor, record_id: account, operation_type: 'CXC_REPROGRAM', idempotency_key: key, request_fingerprint: cxcRescheduleFingerprint(account, dto), result: clone(rpc) };
  return { rpc, op };
}
function note(type: '07' | '91' = '07') {
  const rpc = { success: true, documento_id: id(6), cpe_id: id(7), documento_origen_id: origin, tipo_documento: type, serie: 'FC01', numero: '1', total: 0.01, estado: 'BORRADOR', requiere_firma: true, financial_effect_status: 'PENDING_FISCAL_ACCEPTANCE', cxc_reduction: 0, saldo_favor: 0, cxc_id: null, saldo_favor_id: null, event_id: id(8), idempotent: false };
  const op = { id: id(5), tenant_id: tenant, actor_id: actor, tipo_operacion: 'CREAR', idempotency_key: key, fingerprint: 'a'.repeat(64), documento_origen_id: origin, nota_documento_id: rpc.documento_id, nota_cpe_id: rpc.cpe_id, event_id: rpc.event_id,
    payload: { version: type === '91' ? 529 : 1, actor_id: actor, documento_origen_id: origin, tipo_documento: type, monto_total: request.monto, motivo: request.motivo, codigo_motivo: request.codigo_motivo }, resultado: clone(rpc) };
  return { rpc, op };
}
function client(op: any, error: any = null) {
  const query: any = { select: jest.fn(() => query), eq: jest.fn(() => query), maybeSingle: jest.fn(async () => ({ data: op, error })) };
  return { from: jest.fn(() => query), query };
}
describe('CxC original adjustment receipts', () => {
  it('correlates the rescheduling ledger and preserves an original replay after later account changes', async () => {
    const { rpc, op } = reschedule(), db = client(op);
    const r = await readCxcRescheduleReceipt(db, tenant, actor, account, dto, key, { ...rpc, idempotent: true });
    expect(r.receipt).toEqual(expect.objectContaining({ operation_id: op.id, tenant_id: tenant, actor_id: actor, cuenta_id: account, idempotency_key: key, idempotent: true }));
    expect(db.from).toHaveBeenCalledTimes(1); expect(db.from).toHaveBeenCalledWith('financial_master_operations');
    expect(db.query.eq.mock.calls).toEqual([['tenant_id', tenant], ['operation_type', 'CXC_REPROGRAM'], ['idempotency_key', key]]);
  });
  it.each(['07', '91'] as const)('correlates neutral original note %s with its immutable creation ledger', async type => {
    const { rpc, op } = note(type), db = client(op);
    const r = await readCxcNoteReceipt(db, tenant, actor, account, origin, request, type, key, [{ ...rpc, idempotent: true }]);
    expect(r.receipt).toEqual(expect.objectContaining({ kind: 'CXC_CREDIT_NOTE_CREATE', operation_id: op.id, cuenta_id: account, documento_origen_id: origin, idempotency_key: key }));
    expect(r.cxc_reduction).toBe(0); expect(db.from).toHaveBeenCalledWith('notas_referenciadas_operaciones');
  });
  it.each(['id', 'tenant_id', 'actor_id', 'record_id', 'operation_type', 'idempotency_key', 'request_fingerprint'])('rejects a mismatched rescheduling ledger %s', async field => {
    const { rpc, op } = reschedule(); (op as any)[field] = 'wrong';
    await expect(readCxcRescheduleReceipt(client(op), tenant, actor, account, dto, key, rpc)).rejects.toThrow('recibo original');
  });
  it.each(['id', 'tenant_id', 'actor_id', 'tipo_operacion', 'idempotency_key', 'fingerprint', 'documento_origen_id', 'nota_documento_id', 'nota_cpe_id', 'event_id'])('rejects a mismatched note ledger %s', async field => {
    const { rpc, op } = note(); (op as any)[field] = 'wrong';
    await expect(readCxcNoteReceipt(client(op), tenant, actor, account, origin, request, '07', key, rpc)).rejects.toThrow('recibo original');
  });
  it.each(['version', 'actor_id', 'documento_origen_id', 'tipo_documento', 'monto_total', 'codigo_motivo', 'motivo'])('rejects a note bound to another canonical payload %s', async field => {
    const { rpc, op } = note(); (op.payload as any)[field] = 'wrong';
    await expect(readCxcNoteReceipt(client(op), tenant, actor, account, origin, request, '07', key, rpc)).rejects.toThrow('recibo original');
  });
  it.each([null, {}, { success: true }, { success: true, idempotent: false }, [], [{}, {}]])('rejects incomplete RPC %j before issuing a success', async raw => {
    await expect(readCxcRescheduleReceipt(client(reschedule().op), tenant, actor, account, dto, key, raw)).rejects.toThrow('recibo original');
    await expect(readCxcNoteReceipt(client(note().op), tenant, actor, account, origin, request, '07', key, raw)).rejects.toThrow('recibo original');
  });
  it.each(['financial_effect_status', 'cxc_reduction', 'saldo_favor', 'estado', 'requiere_firma', 'documento_origen_id', 'tipo_documento', 'documento_id', 'cpe_id', 'event_id', 'total'])('rejects a note receipt with invalid %s even if ledger agrees', async field => {
    const { rpc, op } = note(); (rpc as any)[field] = 'wrong'; op.resultado = clone(rpc);
    await expect(readCxcNoteReceipt(client(op), tenant, actor, account, origin, request, '07', key, rpc)).rejects.toThrow('recibo original');
  });
  it.each(['cached', 'offline', 'queued', 'pending', 'from_cache'])('rejects %s signals in ledger and RPC', async flag => {
    const a = reschedule(), n = note(); (a.op as any)[flag] = true; (n.rpc as any)[flag] = true;
    await expect(readCxcRescheduleReceipt(client(a.op), tenant, actor, account, dto, key, a.rpc)).rejects.toThrow('recibo original');
    await expect(readCxcNoteReceipt(client(n.op), tenant, actor, account, origin, request, '07', key, n.rpc)).rejects.toThrow('recibo original');
  });
  it('fails closed when immutable result differs or ledger read fails', async () => {
    const a = reschedule(), n = note(); a.op.result.motivo = 'Otra operación'; n.op.resultado.serie = 'OTHER';
    await expect(readCxcRescheduleReceipt(client(a.op), tenant, actor, account, dto, key, a.rpc)).rejects.toThrow();
    await expect(readCxcNoteReceipt(client(n.op), tenant, actor, account, origin, request, '07', key, n.rpc)).rejects.toThrow();
    await expect(readCxcRescheduleReceipt(client(null, { message: 'down' }), tenant, actor, account, dto, key, a.rpc)).rejects.toThrow();
  });
});
