import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { InventarioService } from './inventario.service';
import { prepareInventoryReceiptContext, bindInventoryOperationReceipt } from './inventory-operation-receipt';

const ids = Array.from({ length: 10 }, (_, i) => '80000000-0000-4000-8000-' + String(i + 1).padStart(12, '0'));
function fixture(type: 'AJUSTE' | 'TRANSFERENCIA' = 'AJUSTE') {
  const payload: any = type === 'AJUSTE' ? { producto_id: ids[2], almacen_id: ids[3], delta: .25, motivo: ' Original inventory request ' }
    : { producto_id: ids[2], almacen_origen_id: ids[3], almacen_destino_id: ids[4], cantidad: .125, motivo: ' Original transfer request ' };
  const context = prepareInventoryReceiptContext(ids[0], ids[1], 'inventory-original-key', type, payload);
  const receipt: any = type === 'AJUSTE' ? { success: true, operacion_id: ids[5], movimiento_id: ids[6], event_id: ids[8], producto_id: ids[2], almacen_id: ids[3], delta: .25, cantidad: .25, tipo: 'SOBRANTE', costo_unitario: 2, valor: .5, stock_nuevo: 10, idempotent: false }
    : { success: true, operacion_id: ids[5], movimiento_salida_id: ids[6], movimiento_entrada_id: ids[7], producto_id: ids[2], almacen_origen_id: ids[3], almacen_destino_id: ids[4], cantidad: .125, traslado_entre_establecimientos: null, idempotent: false };
  const ledger: any = { id: ids[5], tenant_id: ids[0], actor_id: ids[1], tipo: type, idempotency_key: context.key, fingerprint: 'f'.repeat(64), producto_id: ids[2],
    almacen_origen_id: ids[3], almacen_destino_id: type === 'AJUSTE' ? null : ids[4], ubicacion_origen_id: null, ubicacion_destino_id: null,
    cantidad: type === 'AJUSTE' ? .25 : .125, delta: type === 'AJUSTE' ? .25 : null, costo_unitario: type === 'AJUSTE' ? 2 : null, motivo: context.payload.motivo,
    movimiento_salida_id: type === 'AJUSTE' ? null : ids[6], movimiento_entrada_id: type === 'AJUSTE' ? ids[6] : ids[7], event_id: type === 'AJUSTE' ? ids[8] : null,
    resultado: JSON.parse(JSON.stringify(receipt)), metadata: { payload: context.payload }, created_at: '2026-10-14T12:00:00.000Z' };
  return { payload, context, receipt, ledger };
}
describe('Complete inventory receipt bound to existing immutable original operation', () => {
  it.each(['AJUSTE', 'TRANSFERENCIA'] as const)('binds complete %s original actor/tenant/key/canonical request and frozen receipt', type => {
    const f = fixture(type); const r = bindInventoryOperationReceipt(f.receipt, f.ledger, f.context);
    expect(r.operation_identity).toEqual({ version: 1, operation_id: ids[5], type, tenant_id: ids[0], actor_id: ids[1], idempotency_key: f.context.key, request_payload: f.context.payload, request_fingerprint: 'f'.repeat(64), confirmed_at: f.ledger.created_at });
    expect(r.idempotent).toBe(false); expect(bindInventoryOperationReceipt({ ...f.receipt, idempotent: true }, f.ledger, f.context).idempotent).toBe(true);
  });
  it('preserves full frozen weighted cost while binding the original numeric(18,6) ledger cost', () => {
    const f = fixture(); f.receipt.costo_unitario = 1.051643192488263; f.receipt.valor = .26;
    f.ledger.costo_unitario = '1.051643'; f.ledger.resultado = { ...f.receipt };
    const result = bindInventoryOperationReceipt(f.receipt, f.ledger, f.context);
    expect(result.costo_unitario).toBe(1.051643192488263); expect(result.valor).toBe(.26);
    expect(f.ledger.costo_unitario).toBe('1.051643');
  });
  it('uses original SQL HALF_UP at six decimals and rejects a truncated ledger at the midpoint', () => {
    const f = fixture(); f.receipt.costo_unitario = 1.0000005; f.receipt.valor = .25;
    f.ledger.costo_unitario = '1.000001'; f.ledger.resultado = { ...f.receipt };
    expect(bindInventoryOperationReceipt(f.receipt, f.ledger, f.context).costo_unitario).toBe(1.0000005);
    f.ledger.costo_unitario = '1.000000'; expect(() => bindInventoryOperationReceipt(f.receipt, f.ledger, f.context)).toThrow(ServiceUnavailableException);
  });
  it('different ledger cost beyond its documented precision never confirms even with matching rounded cents', () => {
    const f = fixture(); f.receipt.costo_unitario = 1.051643192488263; f.receipt.valor = .26;
    f.ledger.costo_unitario = '1.051644'; f.ledger.resultado = { ...f.receipt };
    expect(() => bindInventoryOperationReceipt(f.receipt, f.ledger, f.context)).toThrow(ServiceUnavailableException);
  });
  it.each(['id', 'tenant_id', 'actor_id', 'tipo', 'idempotency_key', 'fingerprint', 'metadata', 'resultado', 'created_at'])('missing immutable %s never confirms', field => {
    const f = fixture(); delete f.ledger[field]; expect(() => bindInventoryOperationReceipt(f.receipt, f.ledger, f.context)).toThrow(ServiceUnavailableException);
  });
  it.each(['tenant_id', 'actor_id', 'idempotency_key', 'id', 'producto_id', 'almacen_origen_id'])('foreign immutable %s never confirms', field => {
    const f = fixture(); f.ledger[field] = ids[9]; expect(() => bindInventoryOperationReceipt(f.receipt, f.ledger, f.context)).toThrow(ServiceUnavailableException);
  });
  it.each(['success', 'idempotent', 'operacion_id', 'movimiento_id', 'event_id', 'producto_id', 'almacen_id', 'delta', 'cantidad', 'tipo', 'stock_nuevo', 'costo_unitario', 'valor'])('partial RPC %s cannot retire an original operation', field => {
    const f = fixture(); delete f.receipt[field]; expect(() => bindInventoryOperationReceipt(f.receipt, f.ledger, f.context)).toThrow(ServiceUnavailableException);
  });
  it.each(['cached', 'queued', 'offline', 'pending', 'from_cache'])('nonlive %s blocked in RPC, ledger or frozen result', flag => {
    for (const level of ['rpc', 'ledger', 'result']) { const f = fixture(); (level === 'rpc' ? f.receipt : level === 'ledger' ? f.ledger : f.ledger.resultado)[flag] = true; expect(() => bindInventoryOperationReceipt(f.receipt, f.ledger, f.context)).toThrow(ServiceUnavailableException); }
  });
  it('unknown ledger cannot be replaced by success true, live current stock or partial RPC', () => { const f = fixture(); for (const v of [null, undefined, {}, { resultado: f.receipt }]) expect(() => bindInventoryOperationReceipt(f.receipt, v, f.context)).toThrow(ServiceUnavailableException); });
  it('different normalized motive or quantity cannot bind same key', () => { const f = fixture(); for (const payload of [{ ...f.context.payload, motivo: 'Different' }, { ...f.context.payload, delta: .5 }]) expect(() => bindInventoryOperationReceipt(f.receipt, { ...f.ledger, metadata: { payload } }, f.context)).toThrow(ServiceUnavailableException); });
  it('wrong stock or monetary fields, even altered in both RPC and snapshot, do not confirm', () => {
    for (const field of ['delta', 'cantidad', 'costo_unitario', 'valor', 'stock_nuevo']) { const f = fixture(); f.receipt[field] = field === 'stock_nuevo' ? -1 : 999; f.ledger.resultado[field] = f.receipt[field]; expect(() => bindInventoryOperationReceipt(f.receipt, f.ledger, f.context)).toThrow(ServiceUnavailableException); }
  });
  it('six-decimal canonical input follows original SQL half-up and preserves btrim semantics', () => {
    const f = fixture(); const c = prepareInventoryReceiptContext(ids[0], ids[1], ' original-key ', 'AJUSTE', { ...f.payload, delta: -.0000015, motivo: ' \tOriginal\t ' });
    expect(c.payload.delta).toBe(-.000002); expect(c.key).toBe('original-key'); expect(c.payload.motivo).toBe('\tOriginal\t');
  });
  it('known zero cost/value accepted without inventing a monetary journal', () => { const f = fixture(); f.receipt.costo_unitario = f.ledger.costo_unitario = 0; f.receipt.valor = 0; f.ledger.resultado = { ...f.receipt }; expect(bindInventoryOperationReceipt(f.receipt, f.ledger, f.context).valor).toBe(0); });
  it('negative adjustment requires its salida and exact original delta', () => { const f = fixture(); f.context = prepareInventoryReceiptContext(ids[0], ids[1], f.context.key, 'AJUSTE', { ...f.payload, delta: -.25 }); f.ledger.metadata.payload = f.context.payload; f.ledger.delta = -.25; f.ledger.movimiento_salida_id = ids[6]; f.ledger.movimiento_entrada_id = null; f.receipt.delta = -.25; f.receipt.tipo = 'FALTANTE'; f.ledger.resultado = { ...f.receipt }; expect(bindInventoryOperationReceipt(f.receipt, f.ledger, f.context).tipo).toBe('FALTANTE'); });
  it.each(['movimiento_salida_id', 'movimiento_entrada_id', 'almacen_origen_id', 'almacen_destino_id', 'cantidad', 'traslado_entre_establecimientos'])('transfer missing %s does not confirm', field => { const f = fixture('TRANSFERENCIA'); delete f.receipt[field]; expect(() => bindInventoryOperationReceipt(f.receipt, f.ledger, f.context)).toThrow(ServiceUnavailableException); });
  it('transfer cannot reuse same movement or invent GRE metadata', () => {
    for (const mutate of [(f: any) => { f.receipt.movimiento_entrada_id = f.receipt.movimiento_salida_id; }, (f: any) => { f.receipt.traslado_entre_establecimientos = {}; }]) { const f = fixture('TRANSFERENCIA'); mutate(f); f.ledger.resultado = { ...f.receipt }; expect(() => bindInventoryOperationReceipt(f.receipt, f.ledger, f.context)).toThrow(ServiceUnavailableException); }
  });
  it.each(['producto_id', 'almacen_id', 'delta', 'motivo'])('invalid original adjustment %s blocks before writer', field => { const f = fixture(); f.payload[field] = field === 'delta' ? 0 : ''; expect(() => prepareInventoryReceiptContext(ids[0], ids[1], f.context.key, 'AJUSTE', f.payload)).toThrow(BadRequestException); });
  it('unknown actor/key and invalid date reject before writer', () => { const f = fixture(); expect(() => prepareInventoryReceiptContext('', ids[1], f.context.key, 'AJUSTE', f.payload)).toThrow(BadRequestException); expect(() => prepareInventoryReceiptContext(ids[0], ids[1], '', 'AJUSTE', f.payload)).toThrow(BadRequestException); const t = fixture('TRANSFERENCIA'); expect(() => prepareInventoryReceiptContext(ids[0], ids[1], t.context.key, 'TRANSFERENCIA', { ...t.payload, fecha_expiracion: '2026-02-30' })).toThrow(BadRequestException); });
  it.each(['AJUSTE', 'TRANSFERENCIA'] as const)('service %s original RPC selection/body followed only by readonly scoped ledger lookup', async type => {
    const f = fixture(type), rpc = jest.fn().mockResolvedValue({ data: f.receipt, error: null }), client: any = { rpc };
    for (const key of ['from', 'select', 'eq']) client[key] = jest.fn().mockReturnValue(client); client.maybeSingle = jest.fn().mockResolvedValue({ data: f.ledger, error: null });
    const service = new InventarioService({ getClient: () => client } as any, {} as any, {} as any); const method = type === 'AJUSTE' ? 'registrarAjusteAtomico' : 'transferirStockAtomico';
    const r = await service[method](ids[0], ids[1], { ...f.payload, idempotency_key: f.context.key } as any); expect(r.operation_identity.actor_id).toBe(ids[1]);
    expect(rpc).toHaveBeenCalledTimes(1); expect(rpc).toHaveBeenCalledWith(type === 'AJUSTE' ? 'registrar_ajuste_inventario_tx' : 'transferir_inventario_tx', { p_tenant_id: ids[0], p_actor_id: ids[1], p_payload: f.payload, p_idempotency_key: f.context.key });
    expect(client.from).toHaveBeenCalledWith('operaciones_inventario'); expect(client.eq).toHaveBeenCalledWith('tenant_id', ids[0]); expect(client.eq).toHaveBeenCalledWith('actor_id', ids[1]); expect(client.eq).toHaveBeenCalledWith('idempotency_key', f.context.key); expect(client.maybeSingle).toHaveBeenCalledTimes(1);
  });
  it('ledger read failure or known absence keeps confirmation unknown with no writer retry', async () => {
    for (const outcome of [{ data: null, error: null }, { data: null, error: { message: 'Controlled readonly lookup unavailable' } }]) {
      const f = fixture(), client: any = { rpc: jest.fn().mockResolvedValue({ data: f.receipt, error: null }), maybeSingle: jest.fn().mockResolvedValue(outcome) };
      for (const key of ['from', 'select', 'eq']) client[key] = jest.fn().mockReturnValue(client); const service = new InventarioService({ getClient: () => client } as any, {} as any, {} as any);
      await expect(service.registrarAjusteAtomico(ids[0], ids[1], { ...f.payload, idempotency_key: f.context.key })).rejects.toThrow(ServiceUnavailableException); expect(client.rpc).toHaveBeenCalledTimes(1);
    }
  });
});
