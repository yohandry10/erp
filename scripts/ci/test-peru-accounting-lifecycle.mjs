import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// El primer ADMIN opera el API real. SQL sólo contrasta agregados locales.
export async function testPeruAccountingLifecycle({ request, sql, uuid, results,
  tenantId, otherTenantToken, platformAdminToken, processAccounting }) {
  const row = response => response.data ?? response;
  const key = () => ({ 'idempotency-key': randomUUID() });
  const cents = amount => Math.round(Number(amount) * 100);
  const account = code => {
    const id = sql(`SELECT id FROM plan_cuentas WHERE tenant_id=${uuid(tenantId)} AND codigo='${code}' AND activo AND acepta_movimiento;`);
    assert.ok(id, `Cuenta operativa ${code}`);
    return id;
  };
  const date = sql(`SELECT app.hoy_tenant(${uuid(tenantId)});`);
  const suffix = randomUUID().slice(0, 8);
  const permissions = JSON.parse(sql(`SELECT json_agg(id) FROM permisos WHERE tenant_id=${uuid(tenantId)}
    AND codigo IN ('contabilidad.asientos.read','contabilidad.activos.read','contabilidad.diferidos.read','contabilidad.periodos.read') AND activo;`));
  assert.equal(permissions.length, 4);
  const role = row(await request('roles', { nombre: `LECTOR_CONTABLE_${suffix}`, permission_ids: permissions, idempotency_key: randomUUID() }));
  const email = `lector-contable-${suffix}@example.test`;
  await request('users', { nombre: 'Lector contable local', email, password: 'Lectura-Contable-2026!', roles: [role.id], idempotency_key: randomUUID() });
  const login = await request('auth/login', { email, password: 'Lectura-Contable-2026!' });
  const readerHeaders = { authorization: `Bearer ${login.access_token}` };
  // Fechas por tenant, sin depender del reloj del navegador ni de un mes fijo.
  const periods = JSON.parse(sql(`SELECT json_agg(json_build_object('fecha', to_char(d,'YYYY-MM-DD'),
    'anio',extract(year from d)::int,'mes',extract(month from d)::int) ORDER BY d)
    FROM generate_series(date_trunc('month',app.hoy_tenant(${uuid(tenantId)}))-interval '2 months',
      date_trunc('month',app.hoy_tenant(${uuid(tenantId)})),interval '1 month') d;`));
  const existingPeriods = row(await request('contabilidad/periodos'));
  for (const { anio, mes } of periods) if (!existingPeriods.some(period => Number(period.anio)===anio && Number(period.mes)===mes)) {
    const periodKey = key();
    const period = row(await request('contabilidad/periodos', { anio, mes }, 201, periodKey));
    assert.equal(row(await request('contabilidad/periodos', { anio, mes }, 201, periodKey)).id, period.id);
  }
  const lines = amount => [
    { cuenta_id: account('63'), debe: amount, haber: 0, concepto: 'Gasto local' },
    { cuenta_id: account('1041'), debe: 0, haber: amount, concepto: 'Contrapartida local' },
  ];
  const body = { fecha: date, concepto: 'Asiento manual del primer cliente', referencia: 'MANUAL-LOCAL',
    estado: 'BORRADOR', detalles: lines(10) };
  const beforeEntries = Number(sql(`SELECT count(*) FROM asientos_contables WHERE tenant_id=${uuid(tenantId)};`));
  await request('contabilidad/asiento-contable', { ...body, detalles: lines(0) }, 400, key());
  await request('contabilidad/asiento-contable', { ...body, detalles: [lines(10)[0], lines(9)[1]] }, 400, key());
  const foreignAccount = sql(`SELECT id FROM plan_cuentas WHERE tenant_id<>${uuid(tenantId)} AND codigo='63' AND activo ORDER BY id LIMIT 1;`);
  await request('contabilidad/asiento-contable', { ...body, detalles: [{ ...lines(10)[0], cuenta_id: foreignAccount }, lines(10)[1]] }, 400, key());
  await request('contabilidad/asiento-contable', body, 403, { ...key(), ...readerHeaders });
  assert.equal(Number(sql(`SELECT count(*) FROM asientos_contables WHERE tenant_id=${uuid(tenantId)};`)), beforeEntries);
  const manualKey = key();
  const manual = row(await request('contabilidad/asiento-contable', body, 201, manualKey));
  assert.ok(manual.id);
  assert.equal(row(await request('contabilidad/asiento-contable', body, 201, manualKey)).id, manual.id,
    'La misma intención de asiento manual debe devolver el agregado original');
  await request('contabilidad/asiento-contable', { ...body, detalles: lines(11) }, 400, manualKey);
  assert.equal(Number(sql(`SELECT count(*) FROM asientos_contables WHERE tenant_id=${uuid(tenantId)};`)), beforeEntries + 1);
  await request(`contabilidad/asientos/${manual.id}`, undefined, 200, readerHeaders);
  await request(`contabilidad/asientos/${manual.id}`, { ...body, detalles: lines(14) }, 403, readerHeaders, 'PUT');
  await request(`contabilidad/asientos/${manual.id}/confirmar`, {}, 403, readerHeaders);
  await request(`contabilidad/asientos/${manual.id}/anular`, { motivo: 'Sin permiso' }, 403, readerHeaders);
  await request(`contabilidad/asientos/${manual.id}/reversar`, { fecha: date, motivo: 'Sin permiso' }, 403, readerHeaders);
  await request(`contabilidad/asientos/${manual.id}`, undefined, 403, readerHeaders, 'DELETE');
  const updated = { ...body, concepto: 'Asiento corregido antes de confirmar', detalles: lines(12) };
  delete updated.estado;
  await request(`contabilidad/asientos/${manual.id}`, updated, 200, {}, 'PUT');
  assert.equal(cents(row(await request(`contabilidad/asientos/${manual.id}`)).total_debe), 1200);
  await request(`contabilidad/asientos/${manual.id}/confirmar`, {}, 201);
  await request(`contabilidad/asientos/${manual.id}`, { ...updated, detalles: lines(13) }, 400, {}, 'PUT');
  await request(`contabilidad/asientos/${manual.id}/anular`, { motivo: 'No reescribir el libro' }, 400);
  await request(`contabilidad/asientos/${manual.id}`, undefined, 400, {}, 'DELETE');
  const reversal = row(await request(`contabilidad/asientos/${manual.id}/reversar`, { fecha: date, motivo: 'Corrección local' }));
  assert.equal(reversal.reversion_de_asiento_id, manual.id);
  await request(`contabilidad/asientos/${manual.id}/reversar`, { fecha: date, motivo: 'Corrección local' }, 400);
  assert.equal(sql(`SELECT count(*) FROM asientos_contables WHERE reversion_de_asiento_id=${uuid(manual.id)};`), '1');
  await request(`contabilidad/asientos/${manual.id}`, undefined, 404, { authorization: `Bearer ${otherTenantToken}` });
  results.push({ scenario: 'contabilidad primer cliente: asiento manual validado, replay sin duplicar, borrador editado, confirmado inmutable y reversado una vez', passed: true });

  const assetPayload = { codigo: `AF-${suffix}`, nombre: 'Activo lineal local', fecha_adquisicion: periods[0].fecha,
    valor_adquisicion: 1001, valor_residual: 1, vida_util_meses: 3 };
  const assetKey = key();
  const asset = row(await request('contabilidad/activos-fijos', assetPayload, 201, assetKey));
  assert.equal(row(await request('contabilidad/activos-fijos', assetPayload, 201, assetKey)).id, asset.id);
  await request('contabilidad/asiento-contable', { fecha: periods[0].fecha, concepto: 'Adquisición contable del activo local',
    referencia: assetPayload.codigo, detalles: [
      { cuenta_id: account('33'), debe: 1001, haber: 0, concepto: 'Costo de adquisición' },
      { cuenta_id: account('1041'), debe: 0, haber: 1001, concepto: 'Contrapartida de adquisición' },
    ] }, 201, key());
  await request('contabilidad/activos-fijos', { ...assetPayload, valor_residual: 1002 }, 400, key());
  await request('contabilidad/activos-fijos', assetPayload, 403, { ...key(), ...readerHeaders });
  await request(`contabilidad/activos-fijos/${asset.id}`, undefined, 200, readerHeaders);
  await request(`contabilidad/activos-fijos/${asset.id}`, { nombre: 'Cambio sin permiso' }, 403, readerHeaders, 'PUT');
  await request(`contabilidad/activos-fijos/${asset.id}`, { nombre: 'Activo lineal editado' }, 200, key(), 'PUT');
  assert.equal(row(await request(`contabilidad/activos-fijos/${asset.id}`)).nombre, 'Activo lineal editado');
  const schedule = row(await request(`contabilidad/activos-fijos/${asset.id}/cronograma`));
  assert.deepEqual(schedule.map(item => cents(item.cuota)), [33333, 33333, 33334]);
  for (const [index, period] of periods.entries()) {
    const { anio, mes } = period;
    const depreciation = row(await request('contabilidad/activos-fijos/depreciar', { anio, mes }));
    assert.equal(depreciation.activos_depreciados, 1);
    assert.equal(cents(depreciation.total_depreciado), index === 2 ? 33334 : 33333);
    assert.equal(row(await request('contabilidad/activos-fijos/depreciar', { anio, mes })).activos_depreciados, 0);
  }
  processAccounting('accounting-first-client-assets');
  const depreciated = row(await request(`contabilidad/activos-fijos/${asset.id}`));
  assert.equal(cents(depreciated.depreciacion_acumulada), 100000);
  assert.equal(cents(depreciated.valor_neto), 100);
  assert.equal(depreciated.situacion, 'DEPRECIADO');
  const disposal = row(await request(`contabilidad/activos-fijos/${asset.id}/baja`, { fecha: date, tipo: 'BAJA', motivo: 'Retiro local' }));
  assert.equal(disposal.situacion, 'BAJA');
  await request(`contabilidad/activos-fijos/${asset.id}/baja`, { fecha: date, tipo: 'BAJA' }, 400);
  await request(`contabilidad/activos-fijos/${asset.id}`, undefined, 404, { authorization: `Bearer ${otherTenantToken}` });
  assert.equal(sql(`SELECT count(*) FROM depreciaciones WHERE activo_id=${uuid(asset.id)} AND tenant_id=${uuid(tenantId)};`), '3');
  assert.equal(sql(`SELECT count(*) FROM asientos_contables WHERE tenant_id=${uuid(tenantId)} AND origen='BAJA_ACTIVO_FIJO' AND estado='CONFIRMADO' AND total_debe=total_haber;`), '1');
  results.push({ scenario: 'contabilidad primer cliente: activo editado, cronograma con residuo, tres depreciaciones/replays y baja producen saldos y asientos cuadrados', passed: true, activo_id: asset.id });

  const deferredPayload = { codigo: `DIF-${suffix}`, nombre: 'Seguro local', tipo: 'GASTO', cuenta_diferido_id: account('18'),
    cuenta_resultado_id: account('63'), monto_total: 100, periodos: 3, fecha_inicio: periods[0].fecha };
  const deferredKey = key();
  const deferred = row(await request('contabilidad/diferidos', deferredPayload, 201, deferredKey));
  assert.equal(row(await request('contabilidad/diferidos', deferredPayload, 201, deferredKey)).id, deferred.id);
  await request('contabilidad/asiento-contable', { fecha: periods[0].fecha, concepto: 'Registro inicial del seguro local',
    referencia: deferredPayload.codigo, detalles: [
      { cuenta_id: account('18'), debe: 100, haber: 0, concepto: 'Seguro anticipado' },
      { cuenta_id: account('1041'), debe: 0, haber: 100, concepto: 'Contrapartida del seguro' },
    ] }, 201, key());
  await request('contabilidad/diferidos', { ...deferredPayload, cuenta_resultado_id: account('18') }, 400, key());
  await request('contabilidad/diferidos', { ...deferredPayload, cuenta_resultado_id: foreignAccount }, 400, key());
  await request('contabilidad/diferidos', deferredPayload, 403, { ...key(), ...readerHeaders });
  await request(`contabilidad/diferidos/${deferred.id}`, undefined, 200, readerHeaders);
  await request(`contabilidad/diferidos/${deferred.id}`, undefined, 403, readerHeaders, 'DELETE');
  const deferredSchedule = row(await request(`contabilidad/diferidos/${deferred.id}`)).cronograma;
  assert.deepEqual(deferredSchedule.map(item => cents(item.monto)), [3333, 3333, 3334]);
  for (const [index, period] of periods.entries()) {
    const { anio, mes } = period;
    const accrual = row(await request('contabilidad/diferidos/devengar', { anio, mes }));
    assert.equal(accrual.diferidos_devengados, 1);
    assert.equal(cents(accrual.total_devengado), index === 2 ? 3334 : 3333);
    if (index < 2) await request('contabilidad/diferidos/devengar', { anio, mes }, 400);
    else assert.equal(row(await request('contabilidad/diferidos/devengar', { anio, mes })).diferidos_devengados, 0);
  }
  const accrued = row(await request(`contabilidad/diferidos/${deferred.id}`));
  assert.equal(cents(accrued.monto_devengado), 10000);
  assert.equal(cents(accrued.monto_pendiente), 0);
  assert.equal(accrued.estado, 'DEVENGADO');
  const canceled = row(await request('contabilidad/diferidos', { ...deferredPayload, codigo: `CANCEL-${suffix}`, fecha_inicio: date }, 201, key()));
  const cancelKey = key();
  assert.equal(row(await request(`contabilidad/diferidos/${canceled.id}`, undefined, 200, cancelKey, 'DELETE')).estado, 'CANCELADO');
  assert.equal(row(await request(`contabilidad/diferidos/${canceled.id}`, undefined, 200, cancelKey, 'DELETE')).estado, 'CANCELADO');
  await request(`contabilidad/diferidos/${deferred.id}`, undefined, 404, { authorization: `Bearer ${otherTenantToken}` });
  assert.equal(sql(`SELECT count(*) FROM asientos_contables WHERE tenant_id=${uuid(tenantId)} AND origen='DEVENGO_DIFERIDOS' AND estado='CONFIRMADO' AND total_debe=total_haber;`), '3');
  results.push({ scenario: 'contabilidad primer cliente: diferido con residuo se devenga en tres períodos sin duplicar; cancelación/replay y aislamiento conservan el ledger', passed: true, diferido_id: deferred.id });

  // Cierre verdadero por API: no se usa el bypass del fixture SQL de la 557.
  const period = row(await request('contabilidad/periodos')).find(item =>
    Number(item.anio) === periods[0].anio && Number(item.mes) === periods[0].mes);
  assert.ok(period?.id);
  await request(`contabilidad/periodos/${period.id}`, undefined, 200, readerHeaders);
  const foreignHeaders = { authorization: `Bearer ${otherTenantToken}` };
  await request(`contabilidad/periodos/${period.id}`, undefined, 404, foreignHeaders);
  await request(`contabilidad/periodos/${period.id}/validar-cierre`, undefined, 404, foreignHeaders);
  await request(`contabilidad/periodos/${period.id}/cerrar`, {}, 404, foreignHeaders);
  await request(`contabilidad/periodos/${period.id}/bloquear`, {}, 404, foreignHeaders);
  await request('contabilidad/periodos', { anio: periods[0].anio, mes: 13 }, 400, key());
  await request(`contabilidad/periodos/${period.id}/cerrar`, {}, 403, readerHeaders);
  await request(`contabilidad/periodos/${period.id}/bloquear`, {}, 403, readerHeaders);
  await request(`contabilidad/periodos/${period.id}/reabrir`, {}, 403); // ADMIN cliente, sin privilegio global.
  const periodBody = { ...body, fecha: periods[0].fecha, concepto: 'Borrador que impide el cierre' };
  const periodDraft = row(await request('contabilidad/asiento-contable', periodBody, 201, key()));
  await request(`contabilidad/periodos/${period.id}/cerrar`, {}, 400);
  assert.equal(row(await request(`contabilidad/periodos/${period.id}`)).estado, 'ABIERTO');
  await request(`contabilidad/asientos/${periodDraft.id}/anular`, { motivo: 'Descartar borrador local' });
  assert.equal(row(await request(`contabilidad/asientos/${periodDraft.id}`)).estado, 'ANULADO');
  await request(`contabilidad/asientos/${periodDraft.id}/confirmar`, {}, 400);
  const deleteDraft = row(await request('contabilidad/asiento-contable', { ...periodBody, concepto: 'Borrador eliminable' }, 201, key()));
  await request(`contabilidad/asientos/${deleteDraft.id}`, undefined, 200, {}, 'DELETE');
  await request(`contabilidad/asientos/${deleteDraft.id}`, undefined, 404);
  const validation = await request(`contabilidad/periodos/${period.id}/validar-cierre`);
  assert.equal(validation.asientos.valido, true);
  const closed = row(await request(`contabilidad/periodos/${period.id}/cerrar`, {}));
  assert.equal(closed.estado, 'CERRADO');
  assert.equal(row(await request(`contabilidad/periodos/${period.id}/cerrar`, {})).id, period.id);
  const beforeClosed = Number(sql(`SELECT count(*) FROM asientos_contables WHERE tenant_id=${uuid(tenantId)};`));
  await request('contabilidad/asiento-contable', { ...periodBody, estado: 'CONFIRMADO' }, 400, key());
  assert.equal(Number(sql(`SELECT count(*) FROM asientos_contables WHERE tenant_id=${uuid(tenantId)};`)), beforeClosed);
  await request(`contabilidad/periodos/${period.id}/reabrir`, {}, 403);
  assert.equal(row(await request(`contabilidad/periodos/${period.id}`)).estado, 'CERRADO');
  // El privilegio de plataforma es un fixture local; el cambio de contexto y
  // la reapertura sí atraviesan autenticación, guards y RPC reales.
  const switched = await request('auth/switch-tenant', { targetTenantId: tenantId }, 201,
    { authorization: `Bearer ${platformAdminToken}` });
  const platformHeaders = { authorization: `Bearer ${switched.access_token}` };
  const foreignPeriodId = sql(`SELECT id FROM periodos_contables WHERE tenant_id<>${uuid(tenantId)} ORDER BY id LIMIT 1;`);
  const foreignPeriodBefore = sql(`SELECT to_jsonb(p)::text FROM periodos_contables p WHERE id=${uuid(foreignPeriodId)};`);
  await request(`contabilidad/periodos/${foreignPeriodId}/reabrir`, {}, 404, platformHeaders);
  assert.equal(sql(`SELECT to_jsonb(p)::text FROM periodos_contables p WHERE id=${uuid(foreignPeriodId)};`), foreignPeriodBefore);
  assert.equal(row(await request(`contabilidad/periodos/${period.id}/reabrir`, {}, 201, platformHeaders)).estado, 'ABIERTO');
  assert.equal(row(await request(`contabilidad/periodos/${period.id}/reabrir`, {}, 201, platformHeaders)).id, period.id);
  assert.equal(row(await request(`contabilidad/periodos/${period.id}/cerrar`, {})).estado, 'CERRADO');
  await request(`contabilidad/periodos/${period.id}/bloquear`, {}, 400);
  const blockPeriod = row(await request('contabilidad/periodos')).find(item =>
    Number(item.anio) === periods[1].anio && Number(item.mes) === periods[1].mes);
  const blocked = row(await request(`contabilidad/periodos/${blockPeriod.id}/bloquear`, {}));
  assert.equal(blocked.estado, 'BLOQUEADO');
  assert.equal(row(await request(`contabilidad/periodos/${blockPeriod.id}/bloquear`, {})).id, blockPeriod.id);
  await request('contabilidad/asiento-contable', { ...periodBody, fecha: periods[1].fecha, estado: 'CONFIRMADO' }, 400, key());
  assert.equal(row(await request(`contabilidad/periodos/${blockPeriod.id}/reabrir`, {}, 201, platformHeaders)).estado, 'ABIERTO');
  results.push({ scenario: 'contabilidad primer cliente: borradores anulados/eliminados; cierre, bloqueo y reapertura por API, replays, permisos y tenant preservan períodos y libro', passed: true });
}
