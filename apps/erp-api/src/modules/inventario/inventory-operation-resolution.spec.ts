import { BadRequestException, ConflictException, ForbiddenException, RequestMethod, ServiceUnavailableException } from '@nestjs/common';
import { HEADERS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { PERMISSION_KEY } from '../../common/decorators/require-permission.decorator';
import { InventarioController } from './inventario.controller';
import { InventarioService } from './inventario.service';
import { prepareInventoryReceiptContext } from './inventory-operation-receipt';
import { bindInventoryResolution, inventoryResolutionKind } from './inventory-operation-resolution';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { readOriginalInventoryResolutionRequest, ResolverAjusteOriginalDto, ResolverTransferenciaOriginalDto } from './dto/resolver-operacion-inventario.dto';

const ids = Array.from({ length: 10 }, (_, i) => '81000000-0000-4000-8000-' + String(i + 1).padStart(12, '0'));
function fixture(type: 'AJUSTE' | 'TRANSFERENCIA' = 'AJUSTE') {
  const payload: any = type === 'AJUSTE' ? { producto_id: ids[2], almacen_id: ids[3], delta: .25, motivo: ' Original adjustment ' }
    : { producto_id: ids[2], almacen_origen_id: ids[3], almacen_destino_id: ids[4], cantidad: .125, motivo: ' Original transfer ', guia_remision_id: ids[9] };
  const context = prepareInventoryReceiptContext(ids[0], ids[1], 'original-inventory-resolution-key', type, payload);
  const receipt: any = type === 'AJUSTE' ? { success: true, operacion_id: ids[5], movimiento_id: ids[6], event_id: ids[8], producto_id: ids[2], almacen_id: ids[3], delta: .25, cantidad: .25, tipo: 'SOBRANTE', costo_unitario: 1.051643192488263, valor: .26, stock_nuevo: 2.38, idempotent: false }
    : { success: true, operacion_id: ids[5], movimiento_salida_id: ids[6], movimiento_entrada_id: ids[7], producto_id: ids[2], almacen_origen_id: ids[3], almacen_destino_id: ids[4], cantidad: .125,
      traslado_entre_establecimientos: { requiere_gre: true, sucursal_origen_id: ids[6], sucursal_destino_id: ids[7], establecimiento_origen: '0000', establecimiento_destino: '0001', motivo_traslado_sunat: '04', guia_remision_id: ids[9] }, idempotent: false };
  const ledger: any = { id: ids[5], tenant_id: ids[0], actor_id: ids[1], tipo: type, idempotency_key: context.key, fingerprint: 'f'.repeat(64), producto_id: ids[2], almacen_origen_id: ids[3], almacen_destino_id: type === 'AJUSTE' ? null : ids[4], ubicacion_origen_id: null, ubicacion_destino_id: null,
    cantidad: type === 'AJUSTE' ? .25 : .125, delta: type === 'AJUSTE' ? .25 : null, costo_unitario: type === 'AJUSTE' ? '1.051643' : null, motivo: context.payload.motivo, movimiento_salida_id: type === 'AJUSTE' ? null : ids[6], movimiento_entrada_id: type === 'AJUSTE' ? ids[6] : ids[7], event_id: type === 'AJUSTE' ? ids[8] : null, resultado: receipt, metadata: { payload: context.payload }, created_at: '2026-10-14T12:00:00.000Z' };
  const committed: any = { success: true, resolution: 'COMMITTED', receipt: { ...receipt, idempotent: true } };
  const abandoned: any = { success: true, resolution: 'ABANDONED', idempotent: false, operation_identity: { version: 1, action: 'ABANDON_INVENTORY', operation_id: ids[5], type, tenant_id: ids[0], actor_id: ids[1], idempotency_key: context.key, request_payload: context.payload, request_fingerprint: 'e'.repeat(64), confirmed_at: ledger.created_at } };
  return { payload, context, ledger, committed, abandoned };
}
function serviceWith(data: any, ledger: any, error: any = null) {
  const client: any = { rpc: jest.fn().mockResolvedValue({ data, error }), maybeSingle: jest.fn().mockResolvedValue({ data: ledger, error: null }) };
  for (const name of ['from', 'select', 'eq']) client[name] = jest.fn().mockReturnValue(client);
  return { client, service: new InventarioService({ getClient: () => client } as any, {} as any, {} as any) };
}
describe('Explicit inventory commit-or-abandon resolution bound to original intention', () => {
  for (const type of ['AJUSTE', 'TRANSFERENCIA'] as const) {
    it(type + ' binds immutable committed full receipt including weighted cost or GRE, without mutation', () => {
      const f = fixture(type), before = JSON.stringify(f.committed), r = bindInventoryResolution(f.committed, f.context, f.ledger);
      expect(r.resolution).toBe('COMMITTED'); expect(r.receipt.operation_identity.request_payload).toEqual(f.context.payload);
      expect(r.receipt.idempotent).toBe(true); expect(JSON.stringify(f.committed)).toBe(before);
      if (type === 'AJUSTE') { expect(r.receipt.costo_unitario).toBe(1.051643192488263); expect(r.receipt.valor).toBe(.26); }
      else expect(r.receipt.traslado_entre_establecimientos.guia_remision_id).toBe(ids[9]);
    });
    it(type + ' preserves full initial and repeated abandonment with exact actor/key/canonical original body', () => {
      const f = fixture(type); expect(bindInventoryResolution(f.abandoned, f.context)).toBe(f.abandoned);
      const replay = { ...f.abandoned, idempotent: true }; expect(bindInventoryResolution(replay, f.context)).toBe(replay);
      expect(f.abandoned.operation_identity.request_payload).toEqual(f.context.payload);
    });
    it.each(['version', 'action', 'operation_id', 'type', 'tenant_id', 'actor_id', 'idempotency_key', 'request_payload', 'request_fingerprint', 'confirmed_at'])(type + ' incomplete abandonment identity %s stays unknown', field => {
      const f = fixture(type); delete f.abandoned.operation_identity[field]; expect(() => bindInventoryResolution(f.abandoned, f.context)).toThrow(ServiceUnavailableException);
    });
    it.each(['tenant_id', 'actor_id', 'idempotency_key', 'type'])(type + ' foreign abandonment identity %s stays unknown', field => {
      const f = fixture(type); f.abandoned.operation_identity[field] = ids[9]; expect(() => bindInventoryResolution(f.abandoned, f.context)).toThrow(ServiceUnavailableException);
    });
    it(type + ' different original body, fake action, malformed fingerprint/time, extra stock fields never confirm abandonment', () => {
      const mutations: ((r: any) => void)[] = [r => { r.operation_identity.request_payload = { ...r.operation_identity.request_payload, motivo: 'Different original' }; }, r => { r.operation_identity.action = 'COMMIT'; }, r => { r.operation_identity.request_fingerprint = 'f'.repeat(63); }, r => { r.operation_identity.confirmed_at = 'Invalid date'; }, r => { r.stock_nuevo = 999; }, r => { r.operation_identity.movimiento_id = ids[9]; }];
      for (const mutate of mutations) { const f = fixture(type); mutate(f.abandoned); expect(() => bindInventoryResolution(f.abandoned, f.context)).toThrow(ServiceUnavailableException); }
    });
    it.each(['cached', 'queued', 'offline', 'pending', 'from_cache'])(type + ' %s result/identity/committed receipt cannot acknowledge', flag => {
      for (const level of ['abandonRoot', 'identity', 'commitRoot', 'receipt']) {
        const f = fixture(type); (level === 'abandonRoot' ? f.abandoned : level === 'identity' ? f.abandoned.operation_identity : level === 'commitRoot' ? f.committed : f.committed.receipt)[flag] = true;
        expect(() => bindInventoryResolution(level === 'abandonRoot' || level === 'identity' ? f.abandoned : f.committed, f.context, f.ledger)).toThrow(ServiceUnavailableException);
      }
    });
    it(type + ' partial or foreign committed receipt never confirms or falls back to abandonment', () => {
      for (const level of ['receipt', 'ledger']) { const f = fixture(type); (level === 'receipt' ? f.committed.receipt : f.ledger).producto_id = ids[9]; expect(() => bindInventoryResolution(f.committed, f.context, f.ledger)).toThrow(ServiceUnavailableException); }
      const f = fixture(type); delete f.committed.receipt.operacion_id; expect(() => bindInventoryResolution(f.committed, f.context, f.ledger)).toThrow(ServiceUnavailableException);
      expect(() => bindInventoryResolution(f.committed, f.context, null)).toThrow(ServiceUnavailableException);
    });
    it.each(['COMMITTED', 'ABANDONED'] as const)(type + ' service one original resolver RPC for %s; no stock RPC/current catalog', async state => {
      const f = fixture(type), { client, service } = serviceWith(state === 'COMMITTED' ? f.committed : f.abandoned, f.ledger);
      const r = await service.resolverOperacionInventario(ids[0], ids[1], type, { ...f.payload, idempotency_key: f.context.key });
      expect(r.resolution).toBe(state); expect(client.rpc).toHaveBeenCalledTimes(1);
      expect(client.rpc).toHaveBeenCalledWith('resolver_operacion_inventario_tx_570', { p_tenant_id: ids[0], p_actor_id: ids[1], p_type: type, p_idempotency_key: f.context.key, p_payload: f.payload });
      if (state === 'ABANDONED') { expect(client.from).not.toHaveBeenCalled(); expect(client.maybeSingle).not.toHaveBeenCalled(); }
      else { expect(client.from).toHaveBeenCalledTimes(1); expect(client.from).toHaveBeenCalledWith('operaciones_inventario'); for (const pair of [['tenant_id', ids[0]], ['actor_id', ids[1]], ['tipo', type], ['idempotency_key', f.context.key]]) expect(client.eq).toHaveBeenCalledWith(...pair); }
    });
    it(type + ' read failure after resolver keeps unknown with one resolver and no stock writer fallback', async () => {
      const f = fixture(type), { client, service } = serviceWith(f.committed, f.ledger); client.maybeSingle.mockResolvedValue({ data: null, error: { code: '503' } });
      await expect(service.resolverOperacionInventario(ids[0], ids[1], type, { ...f.payload, idempotency_key: f.context.key })).rejects.toThrow(ServiceUnavailableException); expect(client.rpc).toHaveBeenCalledTimes(1);
    });
    it(type + ' invalid original identity is rejected before any resolver or read', async () => {
      const f = fixture(type), { client, service } = serviceWith(f.abandoned, null);
      await expect(service.resolverOperacionInventario(ids[0], '', type, { ...f.payload, idempotency_key: f.context.key })).rejects.toThrow(BadRequestException); expect(client.rpc).not.toHaveBeenCalled(); expect(client.from).not.toHaveBeenCalled();
    });
    it(type + ' transport exception makes no second RPC and preserves unknown', async () => {
      const f = fixture(type), { client, service } = serviceWith(null, null); client.rpc.mockRejectedValue(new Error('Controlled transport failure'));
      await expect(service.resolverOperacionInventario(ids[0], ids[1], type, { ...f.payload, idempotency_key: f.context.key })).rejects.toThrow(ServiceUnavailableException); expect(client.rpc).toHaveBeenCalledTimes(1); expect(client.from).not.toHaveBeenCalled();
    });
    it.each([['42501', ForbiddenException], ['40001', ConflictException], ['23505', ConflictException], ['22023', BadRequestException], ['23514', ServiceUnavailableException], ['42883', ServiceUnavailableException]])(type + ' SQL%s denies or preserves original; no writer/read fallback', async (code, expected: any) => {
      const f = fixture(type), { client, service } = serviceWith(null, null, { code, message: 'Controlled original resolver error' });
      await expect(service.resolverOperacionInventario(ids[0], ids[1], type, { ...f.payload, idempotency_key: f.context.key })).rejects.toThrow(expected); expect(client.rpc).toHaveBeenCalledTimes(1); expect(client.from).not.toHaveBeenCalled();
    });
  }
  it.each([null, [], {}, { success: true, resolution: 'MISSING' }, { success: true, resolution: 'COMMITTED', receipt: { idempotent: false } }, { success: true, resolution: 'ABANDONED', idempotent: null, operation_identity: {} }])('unknown protocol does not infer absence or abandonment', value => {
    expect(() => inventoryResolutionKind(value)).toThrow(ServiceUnavailableException);
  });
  it.each(['AJUSTE', 'TRANSFERENCIA'] as const)('late %s stock writer gets409 for durable abandonment without ledger lookup/retry', async type => {
    const f = fixture(type), { client, service } = serviceWith(null, null, { code: '40001', message: 'INVENTORY_RESOLUTION570_ABANDONED' });
    const method = type === 'AJUSTE' ? 'registrarAjusteAtomico' : 'transferirStockAtomico';
    await expect(service[method](ids[0], ids[1], { ...f.payload, idempotency_key: f.context.key } as any)).rejects.toThrow(ConflictException); expect(client.rpc).toHaveBeenCalledTimes(1); expect(client.from).not.toHaveBeenCalled();
  });
  it.each(['resolverAjusteOriginal', 'resolverTransferenciaOriginal'] as const)('%s authenticated permission-protected no-store POST', name => {
    const h = InventarioController.prototype[name]; expect(Reflect.getMetadata(METHOD_METADATA, h)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(PATH_METADATA, h)).toBe(name === 'resolverAjusteOriginal' ? 'movimientos/resolver' : 'transferencias/resolver');
    expect(Reflect.getMetadata(PERMISSION_KEY, h).raw).toBe('inventario.movimientos.create'); expect(Reflect.getMetadata(HEADERS_METADATA, h)).toEqual([{ name: 'Cache-Control', value: 'no-store' }]);
  });
  it.each(['AJUSTE', 'TRANSFERENCIA'] as const)('controller passes authenticated %s identity and unchanged original body; no anonymous resolver', async type => {
    const f = fixture(type), c: any = Object.create(InventarioController.prototype), original = { ...f.payload, idempotency_key: f.context.key }, resolve = jest.fn().mockResolvedValue(f.abandoned);
    c.inventarioService = { resolverOperacionInventario: resolve }; const name = type === 'AJUSTE' ? 'resolverAjusteOriginal' : 'resolverTransferenciaOriginal';
    const request = { expected_scope: { tenant_id: ids[0], actor_id: ids[1] }, original };
    expect(await c[name](ids[0], ids[1], request)).toEqual({ success: true, data: f.abandoned }); expect(resolve).toHaveBeenCalledWith(ids[0], ids[1], type, original);
    resolve.mockClear(); await expect(c[name](ids[0], '', request)).rejects.toThrow(BadRequestException); expect(resolve).not.toHaveBeenCalled();
  });
  it.each(['AJUSTE', 'TRANSFERENCIA'] as const)('another authorized %s actor/company cannot fence the captured original owner request', async type => {
    const f = fixture(type), c: any = Object.create(InventarioController.prototype), resolve = jest.fn(), name = type === 'AJUSTE' ? 'resolverAjusteOriginal' : 'resolverTransferenciaOriginal';
    const original = { ...f.payload, idempotency_key: f.context.key }, request = { expected_scope: { tenant_id: ids[0], actor_id: ids[1] }, original }; c.inventarioService = { resolverOperacionInventario: resolve };
    const before = JSON.stringify(request);
    await expect(c[name](ids[0], ids[9], request)).rejects.toThrow(ConflictException);
    await expect(c[name](ids[9], ids[1], request)).rejects.toThrow(ConflictException);
    expect(resolve).not.toHaveBeenCalled(); expect(JSON.stringify(request)).toBe(before);
  });
  it.each(['AJUSTE', 'TRANSFERENCIA'] as const)('nested %s DTO keeps the original key/quantity/body and requires original scope', async type => {
    const f = fixture(type), original = { ...f.payload, idempotency_key: f.context.key }, dtoType: any = type === 'AJUSTE' ? ResolverAjusteOriginalDto : ResolverTransferenciaOriginalDto;
    const request = plainToInstance(dtoType, { expected_scope: { tenant_id: ids[0], actor_id: ids[1] }, original }) as any;
    expect(await validate(request)).toEqual([]); expect(request.original).toEqual(original);
    expect(readOriginalInventoryResolutionRequest(request, ids[0], ids[1])).toBe(request.original);
    for (const value of [{ original }, { expected_scope: {}, original }, { expected_scope: { tenant_id: ids[0], actor_id: 'bad' }, original }, { expected_scope: { tenant_id: ids[0], actor_id: ids[1] }, original: [] }, { expected_scope: { tenant_id: ids[0], actor_id: ids[1] }, original: null }]) {
      const invalid = plainToInstance(dtoType, value) as any; expect((await validate(invalid)).length).toBeGreaterThan(0);
      expect(() => readOriginalInventoryResolutionRequest(invalid, ids[0], ids[1])).toThrow(BadRequestException);
    }
  });
});
