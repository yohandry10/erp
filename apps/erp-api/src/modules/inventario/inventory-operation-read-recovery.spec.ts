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
import { RequestMethod } from '@nestjs/common';
import { HEADERS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { InventarioController } from './inventario.controller';
import { PERMISSION_KEY } from '../../common/decorators/require-permission.decorator';
import { RegistrarAjusteInventarioDto, TransferirInventarioDto } from './dto/operacion-inventario.dto';

function readService(ledger: any, error: any = null) {
  const client: any = { maybeSingle: jest.fn().mockResolvedValue({ data: ledger, error }) };
  for (const key of ['from', 'select', 'eq']) client[key] = jest.fn().mockReturnValue(client);
  for (const key of ['rpc', 'insert', 'update', 'delete', 'upsert']) client[key] = jest.fn(() => { throw new Error('A receipt read must never invoke a writer'); });
  return { client, service: new InventarioService({ getClient: () => client } as any, {} as any, {} as any) };
}
function expectReadOnly(client: any) {
  for (const key of ['rpc', 'insert', 'update', 'delete', 'upsert']) expect(client[key]).not.toHaveBeenCalled();
}
describe('Read-only original inventory receipt recovery independent of current catalog', () => {
  it.each(['AJUSTE', 'TRANSFERENCIA'] as const)('recovers complete original %s receipt with one scoped SELECT and no original RPC or catalog', async type => {
    const f = fixture(type), frozen = JSON.stringify(f.ledger), { client, service } = readService(f.ledger);
    const result = await service.recuperarReciboInventario(ids[0], ids[1], type, { ...f.payload, idempotency_key: f.context.key });
    expect(result).toEqual(bindInventoryOperationReceipt({ ...f.receipt, idempotent: true }, f.ledger, f.context));
    expect(result.idempotent).toBe(true); expect(JSON.stringify(f.ledger)).toBe(frozen);
    expect(client.from).toHaveBeenCalledTimes(1); expect(client.from).toHaveBeenCalledWith('operaciones_inventario');
    expect(client.eq.mock.calls).toEqual([['tenant_id', ids[0]], ['tipo', type], ['idempotency_key', f.context.key], ['actor_id', ids[1]]]);
    expect(client.maybeSingle).toHaveBeenCalledTimes(1); expectReadOnly(client);
  });
  for (const type of ['AJUSTE', 'TRANSFERENCIA'] as const) {
    it.each([null, undefined, {}, [], { resultado: { success: true } }].map(value => [value]))(type+' absence or partial ledger %s is unconfirmed, never abandonment', async value => {
      const f = fixture(type), { client, service } = readService(value);
      await expect(service.recuperarReciboInventario(ids[0], ids[1], type, { ...f.payload, idempotency_key: f.context.key })).rejects.toBeInstanceOf(ServiceUnavailableException);
      expectReadOnly(client);
    });
    it.each(['tenant_id', 'actor_id', 'idempotency_key', 'id', 'fingerprint', 'created_at'])(type+' foreign or invalid frozen %s cannot confirm', async field => {
      const f = fixture(type); f.ledger[field] = ids[9]; const { client, service } = readService(f.ledger);
      await expect(service.recuperarReciboInventario(ids[0], ids[1], type, { ...f.payload, idempotency_key: f.context.key })).rejects.toBeInstanceOf(ServiceUnavailableException); expectReadOnly(client);
    });
    it.each(['cached', 'queued', 'offline', 'pending', 'from_cache'])(type+' cached or pending immutable receipt %s cannot confirm', async flag => {
      const f = fixture(type); f.ledger.resultado[flag] = true; const { client, service } = readService(f.ledger);
      await expect(service.recuperarReciboInventario(ids[0], ids[1], type, { ...f.payload, idempotency_key: f.context.key })).rejects.toBeInstanceOf(ServiceUnavailableException); expectReadOnly(client);
    });
    it(type+' read failure does not retry or invoke original stock transaction', async () => {
      const f = fixture(type), { client, service } = readService(f.ledger, { code: '503' });
      await expect(service.recuperarReciboInventario(ids[0], ids[1], type, { ...f.payload, idempotency_key: f.context.key })).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(client.maybeSingle).toHaveBeenCalledTimes(1); expectReadOnly(client);
    });
    it(type+' different original body is not replaced by ledger or current source', async () => {
      const f = fixture(type), { client, service } = readService(f.ledger);
      await expect(service.recuperarReciboInventario(ids[0], ids[1], type, { ...f.payload, motivo: 'Different original', idempotency_key: f.context.key })).rejects.toBeInstanceOf(ServiceUnavailableException); expectReadOnly(client);
    });
    it(type+' unknown actor/key/body is rejected before ledger selection', async () => {
      const f = fixture(type), { client, service } = readService(f.ledger);
      await expect(service.recuperarReciboInventario(ids[0], '', type, { ...f.payload, idempotency_key: f.context.key })).rejects.toBeInstanceOf(BadRequestException);
      expect(client.from).not.toHaveBeenCalled(); expectReadOnly(client);
    });
  }
  it.each(['AJUSTE', 'TRANSFERENCIA'] as const)('validates original %s query number using existing DTO conversion', async type => {
    const f = fixture(type), quantity = type === 'AJUSTE' ? 'delta' : 'cantidad';
    const input = { ...f.payload, [quantity]: String(f.payload[quantity]), idempotency_key: f.context.key };
    const dto = type === 'AJUSTE' ? plainToInstance(RegistrarAjusteInventarioDto, input) : plainToInstance(TransferirInventarioDto, input);
    expect(await validate(dto)).toEqual([]); expect((dto as any)[quantity]).toBe(f.payload[quantity]);
    const { client, service } = readService(f.ledger); expect((await service.recuperarReciboInventario(ids[0], ids[1], type, dto)).idempotent).toBe(true); expectReadOnly(client);
  });
  it.each(['recuperarReciboAjuste', 'recuperarReciboTransferencia'] as const)('exposes %s only as authenticated permission-protected no-store GET', name => {
    const handler = InventarioController.prototype[name]; expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(name === 'recuperarReciboAjuste' ? 'movimientos/recibo' : 'transferencias/recibo');
    expect(Reflect.getMetadata(PERMISSION_KEY, handler).raw).toBe('inventario.movimientos.create');
    expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toEqual([{ name: 'Cache-Control', value: 'no-store' }]);
  });
  it.each(['AJUSTE', 'TRANSFERENCIA'] as const)('controller forwards original %s query and authenticated scope, missing actor fails before service', async type => {
    const f = fixture(type), controller: any = Object.create(InventarioController.prototype), original = { ...f.payload, idempotency_key: f.context.key }, read = jest.fn().mockResolvedValue(f.receipt);
    controller.inventarioService = { recuperarReciboInventario: read }; const method = type === 'AJUSTE' ? 'recuperarReciboAjuste' : 'recuperarReciboTransferencia';
    expect(await controller[method](ids[0], ids[1], original)).toEqual({ success: true, data: f.receipt }); expect(read).toHaveBeenCalledWith(ids[0], ids[1], type, original);
    read.mockClear(); await expect(controller[method](ids[0], '', original)).rejects.toBeInstanceOf(BadRequestException); expect(read).not.toHaveBeenCalled();
  });
});
