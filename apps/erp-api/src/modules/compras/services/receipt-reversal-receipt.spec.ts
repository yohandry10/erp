import fs from 'node:fs';
import path from 'node:path';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { bindReceiptReversalReceipt, bindReceiptReversalResolution, prepareReceiptReversalContext } from './receipt-reversal-receipt';

// Actual SQL616 captures from a rolled-back, synthetic local transaction.
const vectors = JSON.parse(fs.readFileSync(path.join(__dirname, 'receipt-reversal.fixture.json'), 'utf8'));
const clone = (x: any) => JSON.parse(JSON.stringify(x));
const context = (v: any) => prepareReceiptReversalContext(v.context.tenantId, v.context.actorId, v.context.receiptId, v.context.key, v.context.body);
const physical = () => clone(vectors.find(v => v.name === 'physical'));

describe('Recibo de anulación de recepción ligado a SQL616', () => {
  it.each(vectors.filter(v => v.receipt))('confirma $name sin afirmar contabilidad procesada', v => {
    const ctx = context(v), receipt = bindReceiptReversalReceipt(v.receipt, v.detail, ctx);
    expect(receipt.operation_identity).toMatchObject({ source_operation_id: v.context.receiptId, tenant_id: v.context.tenantId,
      actor_id: v.context.actorId, request_fingerprint: v.receipt.request_fingerprint });
    expect(receipt.contabilidad.estado).toBe('PENDIENTE');
    expect(bindReceiptReversalResolution(v.resolution, ctx)).toEqual({ status: 'COMMITTED', receipt: { ...receipt, idempotent: true } });
  });
  it('cierra únicamente la clave original mediante prueba durable de abandono', () => {
    const v = vectors.find(v => v.name === 'abandon');
    expect(bindReceiptReversalResolution(v.resolution, context(v))).toEqual(v.resolution);
  });
  it.each([
    ['ACK vacío', v => { v.receipt = {}; }],
    ['ACK de caché', v => { v.receipt.cached = true; }],
    ['lectura ausente', v => { v.detail = null; }],
    ['lectura de caché', v => { v.detail.from_cache = true; }],
    ['ledger ausente', v => { delete v.detail.reversa; }],
    ['ledger de otro actor', v => { v.detail.reversa.actor_id = v.context.receiptId; }],
    ['ledger de otra empresa', v => { v.detail.reversa.tenant_id = v.context.receiptId; }],
    ['clave distinta', v => { v.detail.reversa.idempotency_key += '-other'; }],
    ['huella distinta', v => { v.detail.reversa.fingerprint = '0'.repeat(64); }],
    ['origen distinto', v => { v.detail.reversa.fuente_id = v.context.actorId; }],
    ['fecha distinta', v => { v.detail.reversa.payload.fecha_contable = '2020-01-01'; }],
    ['ACK parcial', v => { delete v.receipt.movimientos; }],
    ['contabilidad adelantada', v => { v.receipt.contabilidad.estado = v.detail.reversa.resultado.contabilidad.estado = 'CONFIRMADA'; }],
    ['recepción aún cerrada', v => { v.detail.recepcion.estado = 'CERRADA'; }],
    ['metadato de anulación ajeno', v => { v.detail.recepcion.anulado_por = v.context.receiptId; }],
    ['snapshot ajeno', v => { v.detail.reversa.fuente_snapshot.recepcion.id = v.context.actorId; }],
    ['evento original ajeno', v => { v.detail.reversa.fuente_snapshot.evento_origen.event_id = v.context.actorId; }],
    ['sin ítems', v => { v.detail.items = []; }],
    ['ítem duplicado', v => { v.detail.items[1] = v.detail.items[0]; }],
    ['clasificación ausente', v => { delete v.detail.items[0].metadata.controla_stock; }],
    ['clasificación distinta del snapshot', v => { v.detail.items[0].metadata.es_servicio = true; }],
    ['snapshot de ítems ausente', v => { delete v.detail.items_origen; }],
    ['ítem de otro origen', v => { v.detail.items[0].recepcion_id = v.context.actorId; }],
    ['cantidad de ítem numérica', v => { v.detail.items[0].cantidad_recibida = 0.75; }],
    ['cantidad física alterada', v => { v.detail.items[0].cantidad_recibida = '0.76'; }],
    ['movimiento original ausente', v => { v.detail.movimientos_origen.pop(); }],
    ['movimiento original duplicado', v => { v.detail.movimientos_origen[1] = v.detail.movimientos_origen[0]; }],
    ['movimiento opuesto ausente', v => { v.detail.movimientos_reversa.pop(); }],
    ['movimiento opuesto duplicado', v => { v.detail.movimientos_reversa[1] = v.detail.movimientos_reversa[0]; }],
    ['movimiento adicional', v => { v.detail.movimientos_reversa.push({ ...v.detail.movimientos_reversa[0], id: v.context.actorId }); }],
    ['enlace de origen alterado', v => { v.detail.movimientos_reversa[0].referencia_id = v.context.actorId; }],
    ['tipo físico equivocado', v => { v.detail.movimientos_reversa[0].tipo = 'ENTRADA'; }],
    ['valuación pendiente', v => { v.detail.movimientos_origen[0].valuacion_estado = 'PENDIENTE_TIPO_CAMBIO'; }],
    ['costo actual sustituye congelado', v => { v.detail.movimientos_reversa[0].costo_unitario = '999.000000'; }],
    ['centavo alterado', v => { v.detail.movimientos_reversa[0].valor_total = '3.11'; }],
    ['ubicación alterada', v => { v.detail.movimientos_reversa[0].ubicacion_id = v.context.actorId; }],
    ['lote alterado', v => { v.detail.movimientos_reversa[0].lote = 'OTRO'; }],
    ['resumen parcial en ambos ACK', v => { v.receipt.movimientos.pop(); v.detail.reversa.resultado.movimientos.pop(); }],
  ] as Array<[string, (v: any) => void]>)('no confirma %s', (_name, mutate) => {
    const v = physical(); mutate(v);
    expect(() => bindReceiptReversalReceipt(v.receipt, v.detail, context(v))).toThrow(ServiceUnavailableException);
  });
  it.each([null, {}, { status: 'ABANDONED' }, { status: 'PENDING' }])('una respuesta parcial no prueba abandono: %#', resolution => {
    expect(() => bindReceiptReversalResolution(resolution, context(physical()))).toThrow(ServiceUnavailableException);
  });
  it('no confunde abandono ajeno ni un resultado mixto con resolución', () => {
    const v = clone(vectors.find(v => v.name === 'abandon'));
    v.resolution.resolution.source_operation_id = v.context.actorId;
    expect(() => bindReceiptReversalResolution(v.resolution, context(v))).toThrow(ServiceUnavailableException);
    const c = physical(); c.resolution.resolution = {};
    expect(() => bindReceiptReversalResolution(c.resolution, context(c))).toThrow(ServiceUnavailableException);
  });
  it('la huella PostgreSQL conserva fecha, Unicode y mayúsculas de UUID normalizadas', () => {
    const v = physical(), c = context(v);
    expect(c.fingerprint).toBe(v.receipt.request_fingerprint);
    expect(prepareReceiptReversalContext(v.context.tenantId.toUpperCase(), v.context.actorId.toUpperCase(), v.context.receiptId.toUpperCase(), '  '+v.context.key+'  ', v.context.body)).toEqual(c);
    expect(prepareReceiptReversalContext(v.context.tenantId, v.context.actorId, v.context.receiptId, '😀'.repeat(8), v.context.body).key).toBe('😀'.repeat(8));
  });
  it.each([
    ['fecha inexistente', { fecha_contable: '2026-02-30' }], ['fecha con hora', { fecha_contable: '2026-11-08T00:00:00Z' }],
    ['año fuera de rango', { fecha_contable: '1900-01-01' }], ['motivo vacío', { motivo: '     ' }],
    ['motivo NUL', { motivo: 'texto\0invalido' }], ['UTF16 incompleto', { motivo: 'texto\ud800' }], ['campo adicional', { cantidad: 1 }],
  ])('rechaza %s antes del writer', (_name, change) => {
    const v = physical();
    expect(() => prepareReceiptReversalContext(v.context.tenantId, v.context.actorId, v.context.receiptId, v.context.key, { ...v.context.body, ...change })).toThrow(BadRequestException);
  });
});
