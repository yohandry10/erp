import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function testPayroll({ request, sql, uuid, results, tenantId, setToken, primaryToken, processAccounting, approverToken }) {
  // La base y los empleados son los fixtures efímeros del runner. Nunca PROD.
  const unsupported = await request('rrhh/planillas', { periodo: '2031-01', idempotency_key: randomUUID() });
  assert.equal(unsupported.success, true);
  const blocked = await request(`rrhh/planillas/${unsupported.id}/calcular`, {}, 400);
  assert.match(String(blocked.message), /normativa peruana vigente para 2031-01/);
  assert.equal(sql(`SELECT estado FROM planillas WHERE id=${uuid(unsupported.id)} AND tenant_id=${uuid(tenantId)};`), 'borrador');
  assert.equal(sql(`SELECT count(*) FROM empleado_planilla WHERE planilla_id=${uuid(unsupported.id)};`), '0');
  results.push({ scenario: 'planilla sin normativa bloqueada antes de persistir cálculo', passed: true });

  const supported = await request('rrhh/planillas', { periodo: '2026-02', idempotency_key: randomUUID() });
  assert.equal(supported.success, true);
  const calculated = await request(`rrhh/planillas/${supported.id}/calcular`, {});
  assert.equal(calculated.success, true);
  assert.ok(calculated.totalEmpleados > 0);
  assert.ok(calculated.totalIngresos > calculated.totalDescuentos);
  assert.equal(sql(`SELECT estado FROM planillas WHERE id=${uuid(supported.id)} AND tenant_id=${uuid(tenantId)};`), 'calculada');
  results.push({ scenario: 'planilla peruana calculada con normativa efectiva y contratos locales', passed: true });

  const denied = await request(`rrhh/planillas/${supported.id}/aprobar`, {}, 403);
  assert.match(denied.message, /calculó.*no puede aprobarla/);
  assert.ok(approverToken, 'Sesión del aprobador autenticado en el recorrido de compras');
  setToken(approverToken);
  try {
    const approved = (await request(`rrhh/planillas/${supported.id}/aprobar`, {})).data;
    assert.equal(approved.success, true);
    const replay = (await request(`rrhh/planillas/${supported.id}/aprobar`, {})).data;
    assert.equal(replay.eventId, approved.eventId);
    assert.equal(replay.idempotent, true);
    processAccounting('accounting-payroll-accrual');
    assert.equal(sql(`SELECT count(*) FROM asientos_contables WHERE source_event_id=${uuid(approved.eventId)}
      AND tenant_id=${uuid(tenantId)} AND estado='CONFIRMADO' AND total_debe=total_haber;`), '1');
    results.push({ scenario: 'planilla aprobada por otro actor y devengo contable único al reintentar', passed: true });
  } finally { setToken(primaryToken); }
  const banks = (await request('finanzas/bancos/cuentas')).data;
  const bank = banks.find(b => b.moneda === 'PEN' && b.activo && Number(b.saldo) >= calculated.totalNeto);
  assert.ok(bank, 'El fixture necesita saldo bancario para pagar la planilla');
  const paymentIntent = { metodo_pago: 'transferencia', cuenta_bancaria_id: bank.id,
    referencia: 'PLANILLA-LOCAL-544', idempotency_key: randomUUID() };
  const paid = (await request(`rrhh/planillas/${supported.id}/pagar`, paymentIntent)).data;
  assert.equal(paid.success, true);
  const paidAgain = (await request(`rrhh/planillas/${supported.id}/pagar`, paymentIntent)).data;
  assert.equal(paidAgain.idempotent, true);
  assert.equal(sql(`SELECT estado FROM planillas WHERE id=${uuid(supported.id)};`), 'pagada');
  const bankAfter = (await request(`finanzas/bancos/cuentas/${bank.id}`)).data;
  assert.equal(Math.round((Number(bank.saldo)-Number(bankAfter.saldo))*100), Math.round(calculated.totalNeto*100));
  processAccounting('accounting-payroll-payment');
  const paymentEvent = sql(`SELECT event_id FROM outbox_events WHERE tenant_id=${uuid(tenantId)}
    AND aggregate_id=${uuid(supported.id)}::text AND event_type='planilla.pagada';`);
  assert.equal(sql(`SELECT count(*) FROM asientos_contables WHERE source_event_id=${uuid(paymentEvent)}
    AND tenant_id=${uuid(tenantId)} AND estado='CONFIRMADO' AND total_debe=total_haber;`), '1');
  results.push({ scenario: 'pago de planilla, cargo bancario y asiento únicos al reintentar', passed: true });
}
