import fs from 'node:fs';
import path from 'node:path';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { bindTransferDetail, bindTransferReversalReceipt, bindTransferReversalResolution, prepareTransferReversalContext } from './transfer-reversal-receipt';

// Captured from verify613 against our isolated SQL transaction, then rolled back.
// The fixture contains synthetic identities and local GRE state only.
const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, 'transfer-reversal.fixture.json'), 'utf8'));
const resolutions = JSON.parse(fs.readFileSync(path.join(__dirname, 'transfer-reversal-resolution.fixture.json'), 'utf8'));
const clone = (v: any) => JSON.parse(JSON.stringify(v));
const other = '61300000-0000-4000-8000-000000000001';
const context = (f: any) => prepareTransferReversalContext(f.context.tenantId, f.context.actorId, f.context.operationId, f.context.key, f.context.body);

describe('Recibo enlazado de reversa de transferencia', () => {
  it.each(fixtures)('valida el recibo SQL real de $name sin convertir decimales a float', (f: any) => {
    const ctx = context(f);
    const result = bindTransferReversalReceipt(f.rpc, f.detail, ctx);
    expect(ctx.fingerprint).toBe(f.detail.reversa.fingerprint);
    expect(result).toMatchObject({ ...f.rpc, operation_identity: { type: 'TRANSFERENCIA_REVERSA', tenant_id: ctx.tenantId,
      actor_id: ctx.actorId, source_operation_id: ctx.operationId, idempotency_key: ctx.key, request_payload: ctx.payload, request_fingerprint: ctx.fingerprint } });
    expect(typeof result.cantidad).toBe('string');
    expect(bindTransferDetail(f.detail, ctx.tenantId, ctx.operationId)).toEqual(f.detail);
  });

  const badReads: [string, (f: any) => void][] = [
    ['empresa distinta', f => { f.detail.tenant_id = other; }],
    ['actor del ledger distinto', f => { f.detail.reversa.actor_id = other; }],
    ['clave de otra intención', f => { f.detail.reversa.idempotency_key = 'different-key613'; }],
    ['cantidad original distinta', f => { f.detail.cantidad = '0.500001'; }],
    ['origen equivocado de la salida', f => { f.detail.reversa.movimiento_salida.referencia_id = f.detail.movimiento_salida.id; }],
    ['costo actual en vez del congelado', f => { f.detail.reversa.movimiento_entrada.costo_unitario = '999.000000'; }],
    ['valor parcial con otro redondeo', f => { f.detail.reversa.movimiento_salida.valor_total = '0.001'; }],
    ['movimiento cacheado', f => { f.detail.reversa.movimiento_salida.cached = true; }],
    ['ledger en cola', f => { f.detail.reversa.queued = true; }],
    ['RPC cacheada', f => { f.rpc.from_cache = true; }],
    ['fingerprint falso concordante en RPC y ledger', f => { f.rpc.request_fingerprint = 'a'.repeat(64); f.detail.reversa.fingerprint = 'a'.repeat(64); f.detail.reversa.resultado.request_fingerprint = 'a'.repeat(64); }],
    ['payload extra concordante', f => { f.rpc.payload.ajeno = 'extra'; f.detail.reversa.payload.ajeno = 'extra'; f.detail.reversa.resultado.payload.ajeno = 'extra'; }],
    ['motivo persistido inválido', f => { f.detail.reversa.motivo = ''; }],
    ['ubicación NULL sustituida', f => { f.detail.reversa.movimiento_salida.ubicacion_id = other; }],
    ['sin el segundo movimiento', f => { f.detail.reversa.movimiento_entrada = null; }],
    ['confirmación de otro documento', f => { f.rpc.operacion_origen_id = other; }],
  ];
  it.each(badReads)('conserva la incertidumbre503 ante %s', (_name, mutate) => {
    const f = clone(fixtures[0]), ctx = context(f);
    mutate(f);
    expect(() => bindTransferReversalReceipt(f.rpc, f.detail, ctx)).toThrow(ServiceUnavailableException);
  });

  it('un replay comprobado cambia sólo idempotent', () => {
    const f = fixtures[0];
    expect(bindTransferReversalReceipt({ ...f.rpc, idempotent: true }, f.detail, context(f)).idempotent).toBe(true);
  });
  it('la ausencia de recibo propio no prueba abandono ni confirma la anulación', () => {
    const f = fixtures[0];
    expect(() => bindTransferReversalReceipt(f.rpc, null, context(f))).toThrow(ServiceUnavailableException);
  });
  it.each([{}, { motivo: '    ' }, { motivo: 12345 }, { motivo: 'Motivo válido', cantidad: 2 },
    { motivo: 'Motivo válido', guia_remision_id: 'bad-id' }, { motivo: 'Motivo\0inválido' }, { motivo: '\ud800abcde' }])(
    'rechaza la intención inválida antes de escribir', body => {
      const f = fixtures[0];
      expect(() => prepareTransferReversalContext(f.context.tenantId, f.context.actorId, f.context.operationId, f.context.key, body)).toThrow(BadRequestException);
    });
  it('no acepta un motivo heredado del prototipo', () => {
    const f = fixtures[0];
    expect(() => prepareTransferReversalContext(f.context.tenantId, f.context.actorId, f.context.operationId, f.context.key,
      Object.create({ motivo: 'Motivo heredado' }))).toThrow(BadRequestException);
  });
  it.each([['😀'.repeat(8), true], ['😀'.repeat(180), true], ['😀'.repeat(4), false],
    ['😀'.repeat(181), false], ['1234567', false], ['1234567\0', false], ['1234567\ud800', false]])(
    'cuenta caracteres PostgreSQL y rechaza claves sin representación UTF8: %s', (key, accepted) => {
      const f = fixtures[0];
      const prepare = () => prepareTransferReversalContext(f.context.tenantId, f.context.actorId, f.context.operationId, key as string, f.context.body);
      if (accepted) expect(prepare().key).toBe(key);
      else expect(prepare).toThrow(BadRequestException);
    });
  it.each(resolutions)('valida la resolución SQL real $name', (f: any) => {
    expect(bindTransferReversalResolution(f.resolution, context(f)).status).toBe(f.resolution.status);
  });
  it('no interpreta una respuesta parcial o contradictoria como abandono', () => {
    const f = resolutions.find((r: any) => r.name === 'abandoned'), ctx = context(f);
    for (const modify of [
      (v: any) => { v.receipt = {}; },
      (v: any) => { v.detail = {}; },
      (v: any) => { v.resolution.actor_id = other; },
      (v: any) => { v.resolution.request_fingerprint = 'a'.repeat(64); },
      (v: any) => { v.resolution.request_payload.motivo = 'Otro motivo'; },
      (v: any) => { v.resolution.cached = true; },
      (v: any) => { delete v.resolution.confirmed_at; },
    ]) {
      const value = clone(f.resolution); modify(value);
      expect(() => bindTransferReversalResolution(value, ctx)).toThrow(ServiceUnavailableException);
    }
  });
});
