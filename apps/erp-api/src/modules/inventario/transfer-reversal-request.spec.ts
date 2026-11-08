import { BadRequestException, ConflictException, ValidationPipe } from '@nestjs/common';
import { TransferReversalRequestDto, readTransferReversalRequest } from './dto/transfer-reversal.dto';

const tenant = '613abcde-0000-4000-8000-000000000001';
const actor = '613abcde-0000-4000-8000-000000000002';
const source = '613abcde-0000-4000-8000-000000000003';
const other = '613abcde-0000-4000-8000-000000000004';
const request = (): TransferReversalRequestDto => ({
  expected_scope: { tenant_id: tenant, actor_id: actor, source_operation_id: source },
  original: { motivo: 'Anulación original 😀', idempotency_key: '613-original-key' },
});
const read = (body: any) => readTransferReversalRequest(body, tenant, actor, source);

describe('Intención capturada de anulación de transferencia', () => {
  it('conserva el cuerpo original sin recalcularlo al consultar o resolver', () => {
    const body = request();
    expect(read(body)).toBe(body.original);
  });
  it('acepta identidad UUID en mayúsculas sin cambiar la intención', () => {
    const body = request();
    body.expected_scope = { tenant_id: tenant.toUpperCase(), actor_id: actor.toUpperCase(), source_operation_id: source.toUpperCase() };
    expect(read(body)).toBe(body.original);
  });
  it.each(['tenant_id', 'actor_id', 'source_operation_id'] as const)('rechaza cambio de %s con conflicto antes de la RPC', key => {
    const body = request(); body.expected_scope[key] = other;
    expect(() => read(body)).toThrow(ConflictException);
  });
  it.each([
    null, [], {}, { original: request().original },
    { ...request(), cached: true }, { ...request(), expected_scope: { ...request().expected_scope, ajeno: true } },
    { ...request(), expected_scope: { tenant_id: tenant, actor_id: actor } },
    { ...request(), expected_scope: Object.create(request().expected_scope) },
    { ...request(), original: Object.create(request().original) },
    { ...request(), original: { ...request().original, producto_id: other } },
    { ...request(), original: { ...request().original, idempotency_key: '😀'.repeat(4) } },
    { ...request(), original: { ...request().original, motivo: ' ' } },
  ])('rechaza el sobre incompleto, heredado o alterado %#', body => {
    expect(() => read(body)).toThrow(BadRequestException);
  });
  it('el pipeline HTTP conserva los tres campos de identidad y una clave Unicode de 180 caracteres', async () => {
    const body = request(); body.original.idempotency_key = '😀'.repeat(180);
    const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
    const parsed = await pipe.transform(body, { type: 'body', metatype: TransferReversalRequestDto });
    expect(read(parsed)).toEqual(body.original);
    await expect(pipe.transform({ ...body, extra: true }, { type: 'body', metatype: TransferReversalRequestDto })).rejects.toBeInstanceOf(BadRequestException);
  });
});
