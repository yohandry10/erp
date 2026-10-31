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
  const missingCap = await request(`rrhh/planillas/${supported.id}/calcular`, {}, 400);
  assert.match(missingCap.message, /remuneración máxima asegurable AFP de 2026-02/);
  assert.equal(sql(`SELECT estado FROM planillas WHERE id=${uuid(supported.id)};`), 'borrador');
  assert.equal(sql(`SELECT count(*) FROM empleado_planilla WHERE planilla_id=${uuid(supported.id)};`), '0');
  results.push({scenario:'AFP sin máximo asegurable bloquea antes de persistir cálculo',passed:true});
  const globalNormativeHash = () => sql(`SELECT md5(coalesce(string_agg(to_jsonb(n)::text,'' ORDER BY n.id),'')) FROM normativa_peru_periodos n WHERE tenant_id IS NULL;`);
  const globalBefore = globalNormativeHash();
  const normative = (await request('rrhh/configuracion-laboral/peru/normativa?periodo=2026-02')).data.normativa;
  assert.ok(normative && normative.afp_remuneracion_max_asegurable == null);
  const fields=['uit','rmv','asignacion_familiar','afp_aporte','afp_prima_seguro','afp_comision_flujo_default',
    'onp_aporte','essalud_aporte','quinta_deduccion_uit','bancarizacion_pen_min','bancarizacion_usd_min','igv_tasa'];
  assert.ok(fields.every(field=>normative[field]!==null&&normative[field]!==undefined&&Number.isFinite(Number(normative[field]))),'Normativa base conocida sin inventar ceros');
  const ownNormative = {periodo:'2026-02',...Object.fromEntries(fields.map(field=>[field,Number(normative[field])])),
    afp_remuneracion_max_asegurable:99999.99,
    referencia:'PARAMETRO SINTETICO LOCAL: prueba integrada efímera; no es sustento SBS ni normativa productiva'};
  const normativeAdmin = await request('auth/login',{email:'peru-integrated-normative-admin-1@example.test',password:'Local-Peru-2026-Only!'});
  setToken(normativeAdmin.access_token);
  try {
    await request('rrhh/configuracion-laboral/peru/normativa',ownNormative,200,{'idempotency-key':randomUUID()},'PUT');
  } finally { setToken(primaryToken); }
  assert.equal(globalNormativeHash(),globalBefore,'Configurar la empresa no modifica normas globales');
  results.push({scenario:'AFP: precondición sintética explícita por API sólo para empresa efímera, globales intactos',passed:true,synthetic_cap:99999.99,externalNormativeAcceptance:false});
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
