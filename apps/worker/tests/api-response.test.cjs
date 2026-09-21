const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseWorkerBatchResult } = require('../dist/api-response.js');

test('conserva conteos explícitos, incluido lote vacío válido y errores parciales', () => {
  for (const result of [{ procesadas: 0, errores: 0 }, { procesadas: 4, errores: 2 }]) {
    assert.deepEqual(parseWorkerBatchResult(result), result);
  }
});
test('no convierte respuestas ausentes, fallidas o conteos inválidos en éxito vacío', () => {
  for (const value of [null, undefined, {}, [], 'OK', { success: false, procesadas: 0, errores: 0 },
    { procesadas: '3', errores: 0 }, { procesadas: 1, errores: -1 }, { procesadas: 0.5, errores: 0 },
    { procesadas: Infinity, errores: 0 }, { procesadas: 0 }, { procesadas: 0, errores: NaN }]) {
    assert.throws(() => parseWorkerBatchResult(value), /Respuesta inválida del lote POS/);
  }
});

const { parseCpeDeliveryResult, cpeWorkerIdentity } = require('../dist/api-response.js');
test('distingue aceptación, pendiente y rechazo fiscal del éxito técnico de la API', () => {
  for (const resultKind of ['ACCEPTED', 'PENDING', 'REJECTED']) {
    assert.equal(parseCpeDeliveryResult({ success: true, operationId: 'operation', resultKind }), resultKind);
  }
});
test('un error técnico, operación en vuelo o respuesta vacía nunca completa el job fiscal', () => {
  for (const value of [null, {}, { success: true },
    { success: true, operationId: 'op', resultKind: 'TECHNICAL_ERROR' },
    { success: true, operationId: 'op', resultKind: 'NOT_FOUND' },
    { success: true, operationId: 'op', resultKind: 'PENDING', reason: 'IN_FLIGHT' },
    { success: true, operationId: 'op', resultKind: 'PENDING', reason: 'RETRY_LATER' }]) {
    assert.throws(() => parseCpeDeliveryResult(value));
  }
});
test('el worker atestigua el actor de origen UUID; rechaza principal técnico, ausente u objeto', () => {
  const tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const created_by = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  assert.deepEqual(cpeWorkerIdentity({ tenant_id, created_by }), { tenantId: tenant_id, actorId: created_by });
  for (const value of [null, undefined, 'worker-service', { id: created_by }]) {
    assert.throws(() => cpeWorkerIdentity({ tenant_id, created_by: value }));
  }
});

const { parseGreDeliveryResult } = require('../dist/api-response.js');
test('GRE exige el contrato de su operación; enviar y aceptar son estados diferentes', () => {
  for (const estado of ['ENVIADO', 'ACEPTADO']) {
    assert.equal(parseGreDeliveryResult({ operation: { estado: 'TERMINADO' }, gre: { estado } }), estado);
  }
  assert.equal(parseGreDeliveryResult({ reason: 'ALREADY_ACCEPTED', gre: { estado: 'ACEPTADO' } }), 'ACEPTADO');
});
test('GRE no completa con operación en vuelo, error, rechazo ni cuerpo genérico exitoso', () => {
  for (const value of [{}, null, { success: true }, { operation: { estado: 'PROCESANDO' } },
    { operation: { estado: 'ERROR' }, gre: { estado: 'ERROR' } },
    { operation: { estado: 'TERMINADO' }, gre: { estado: 'RECHAZADO' } }]) {
    assert.throws(() => parseGreDeliveryResult(value));
  }
});
