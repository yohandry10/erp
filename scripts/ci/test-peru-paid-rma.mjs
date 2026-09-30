import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Operaciones HTTP y ledger reales; ejecutar sólo desde el harness local.
export async function testPeruPaidRma({ request, sql, uuid, results, tenantId,
  otherTenantToken, approverToken, client, product, warehouseId, processAccounting }) {
  const row = response => response.data ?? response;
  const cents = amount => Math.round(Number(amount) * 100);
  const key = () => ({ 'idempotency-key': randomUUID() });
  const stock = () => Number(sql(`SELECT stock_actual FROM producto_existencias
    WHERE tenant_id=${uuid(tenantId)} AND producto_id=${uuid(product.id)} AND almacen_id=${uuid(warehouseId)};`));
  const makeOrder = async label => {
    const quote = row(await request('ventas/cotizaciones', { cliente_id: client.id, notas: label,
      detalle: [{ producto_id: product.id, descripcion: product.nombre, cantidad: 1, precio_unitario: 20 }] }));
    await request(`ventas/cotizaciones/${quote.id}/enviar`, {});
    await request(`ventas/cotizaciones/${quote.id}/aprobar`, { motivo: label }, 201,
      { authorization: `Bearer ${approverToken}` });
    const orderId = row(await request(`ventas/cotizaciones/${quote.id}/convertir-pedido`, {})).pedido_id;
    const order = row(await request(`ventas/pedidos/${orderId}`));
    const detailId = order.detalle[0].id;
    await request(`ventas/pedidos/${orderId}/confirmar`, {});
    await request(`inventario/logistica/${orderId}/preparar`, { idempotency_key: randomUUID(),
      responsable: 'Operador RMA local', ubicacion: 'LOCAL', items_preparados: [detailId] }, 200);
    await request(`inventario/logistica/${orderId}/marcar-listo`, { idempotency_key: randomUUID() }, 200);
    await request(`inventario/logistica/${orderId}/confirmar-despacho`, { idempotency_key: randomUUID(),
      almacen_id: warehouseId, items_despachados: [{ detalle_id: detailId, cantidad: 1, almacen_id: warehouseId }],
      transportista: 'Transportista local', placa: 'ABC-546', conductor: 'Conductor local', bultos: 1, peso_total: 1 }, 200);
    const document = await request(`ventas/pedidos/${orderId}/generar-documento`, { tipo_documento: '01' });
    assert.ok(document.documento?.id && document.cxc?.id && document.cpe?.id);
    return { orderId, detailId, document, cxc: row(await request(`finanzas/cxc/${document.cxc.id}`)) };
  };
  const origin = await makeOrder('Devolución local de factura pagada');
  const due = Number(origin.cxc.saldo);
  assert.ok(due > 10);
  const bank = row(await request('finanzas/bancos/cuentas')).find(account => account.moneda === 'PEN' && account.activo);
  assert.ok(bank?.id);
  const payment = { monto: due, fecha_pago: sql(`SELECT app.hoy_tenant(${uuid(tenantId)});`), moneda: 'PEN',
    metodo_pago: 'TRANSFERENCIA', cuenta_bancaria_id: bank.id, referencia: 'RMA-PAGADA-LOCAL', idempotency_key: randomUUID() };
  await request(`finanzas/cxc/${origin.document.cxc.id}/pagos`, payment);
  await request(`finanzas/cxc/${origin.document.cxc.id}/pagos`, payment);
  assert.equal(Number(row(await request(`finanzas/cxc/${origin.document.cxc.id}`)).saldo), 0);
  processAccounting('accounting-paid-rma-origin');
  const createKey = key();
  const payload = { pedido_id: origin.orderId, documento_origen_id: origin.document.documento.id,
    motivo_general: 'Devolución pagada local', almacen_retorno_id: warehouseId,
    items: [{ detalle_id: origin.detailId, producto_id: product.id, cantidad: 1 }] };
  const rma = await request('ventas/rma', payload, 201, createKey);
  const rmaId = rma.rma_id;
  assert.ok(rmaId);
  assert.equal((await request('ventas/rma', payload, 201, createKey)).rma_id, rmaId);
  const approvalKey = { ...key(), authorization: `Bearer ${approverToken}` };
  await request(`ventas/rma/${rmaId}/aprobar`, { aprobar: true }, 201, approvalKey);
  const detail = row(await request(`ventas/rma/${rmaId}`));
  const half = { almacen_id: warehouseId, items: [{ rma_item_id: detail.items[0].id, cantidad_recibida: 0.5 }] };
  const before = stock();
  const firstHalfKey = key();
  await request(`ventas/rma/${rmaId}/recepcionar`, half, 201, firstHalfKey);
  await request(`ventas/rma/${rmaId}/recepcionar`, half, 201, firstHalfKey);
  assert.equal(stock(), before + 0.5);
  assert.equal(row(await request(`ventas/rma/${rmaId}`)).estado, 'PARCIAL');
  await request(`ventas/rma/${rmaId}/nota-credito`, { motivo: 'Recepción todavía parcial' }, 400, key());
  assert.equal(stock(), before + 0.5);
  const reverseReceiptKey = key();
  const reverseReceipt = { motivo: 'Corregir recepción local' };
  await request(`ventas/rma/${rmaId}/revertir-recepcion`, reverseReceipt, 201, reverseReceiptKey);
  await request(`ventas/rma/${rmaId}/revertir-recepcion`, reverseReceipt, 201, reverseReceiptKey);
  assert.equal(stock(), before);
  const secondHalfKey = key();
  await request(`ventas/rma/${rmaId}/recepcionar`, half, 201, secondHalfKey);
  await request(`ventas/rma/${rmaId}/recepcionar`, half, 201, secondHalfKey);
  const remainingKey = key();
  await request(`ventas/rma/${rmaId}/recepcionar`, half, 201, remainingKey);
  await request(`ventas/rma/${rmaId}/recepcionar`, half, 201, remainingKey);
  assert.equal(stock(), before + 1);
  assert.equal(row(await request(`ventas/rma/${rmaId}`)).estado, 'RECIBIDA');
  results.push({ scenario: 'RMA pagada: recepción parcial bloquea nota, reversa restaura stock y dos recepciones/replays completan una unidad', passed: true });
  const creditKey = key();
  const credit = await request(`ventas/rma/${rmaId}/nota-credito`, { motivo: 'Devolución pagada local completa' }, 201, creditKey);
  assert.equal((await request(`ventas/rma/${rmaId}/nota-credito`, { motivo: 'Devolución pagada local completa' }, 201, creditKey)).saldo_favor_id, credit.saldo_favor_id);
  assert.equal(credit.estado, 'CERRADA');
  assert.equal(cents(credit.saldo_favor), cents(due));
  const saldoId = credit.saldo_favor_id;
  const balance = async () => Number(row(await request(`ventas/rma/saldos-favor/${saldoId}`)).monto_disponible);
  assert.equal(cents(await balance()), cents(due));
  await request(`ventas/rma/saldos-favor/${saldoId}`, undefined, 404, { authorization: `Bearer ${otherTenantToken}` });
  await request(`ventas/rma/${rmaId}/revertir-recepcion`, reverseReceipt, 400, key());
  assert.equal(stock(), before + 1);
  const bankBalance = async () => Number(row(await request(`finanzas/bancos/cuentas/${bank.id}`)).saldo);
  const bankBefore = await bankBalance();
  const refundPayload = { monto: 10, medio: 'BANCO', cuenta_bancaria_id: bank.id, referencia: 'RMA-REEMBOLSO-LOCAL' };
  const readerPermission = sql(`SELECT id FROM permisos WHERE tenant_id=${uuid(tenantId)} AND codigo='ventas.rma.ver' AND activo;`);
  assert.ok(readerPermission);
  const readerSuffix = randomUUID().slice(0, 8);
  const readerRole = row(await request('roles', { nombre: `LECTOR_RMA_${readerSuffix}`,
    permission_ids: [readerPermission], idempotency_key: randomUUID() }));
  const readerEmail = `lector-rma-${readerSuffix}@example.test`;
  await request('users', { nombre: 'Lector local de devoluciones', email: readerEmail,
    password: 'Lectura-RMA-2026!', roles: [readerRole.id], idempotency_key: randomUUID() });
  const readerLogin = await request('auth/login', { email: readerEmail, password: 'Lectura-RMA-2026!' });
  const readerHeaders = { authorization: `Bearer ${readerLogin.access_token}`, ...key() };
  await request(`ventas/rma/saldos-favor/${saldoId}`, undefined, 200, readerHeaders);
  await request(`ventas/rma/saldos-favor/${saldoId}/reembolsar`, refundPayload, 403, readerHeaders);
  await request(`ventas/rma/${rmaId}/revertir-recepcion`, reverseReceipt, 403, readerHeaders);
  const foreignRefund = await request(`ventas/rma/saldos-favor/${saldoId}/reembolsar`, refundPayload, 400,
    { authorization: `Bearer ${otherTenantToken}`, ...key() });
  const unknownRefund = await request(`ventas/rma/saldos-favor/${randomUUID()}/reembolsar`, refundPayload, 400, key());
  assert.equal(foreignRefund.message, unknownRefund.message);
  assert.equal(cents(await balance()), cents(due));
  assert.equal(cents(await bankBalance()), cents(bankBefore));
  assert.equal(stock(), before + 1);
  results.push({ scenario: 'RMA pagada: lector no reembolsa ni revierte; saldo ajeno oculta lectura/escritura y conserva crédito, banco y stock', passed: true });
  await request(`ventas/rma/saldos-favor/${saldoId}/reembolsar`, { ...refundPayload, monto: due + 1 }, 400, key());
  assert.equal(cents(await bankBalance()), cents(bankBefore));
  const bankKey = key();
  const refunded = await request(`ventas/rma/saldos-favor/${saldoId}/reembolsar`, refundPayload, 201, bankKey);
  assert.equal((await request(`ventas/rma/saldos-favor/${saldoId}/reembolsar`, refundPayload, 201, bankKey)).movimiento_id, refunded.movimiento_id);
  assert.equal(cents(await bankBalance()), cents(bankBefore - 10));
  assert.equal(cents(await balance()), cents(due - 10));
  const bankReverseKey = key();
  const reversePayload = { motivo: 'Reversión de reembolso local' };
  const bankReversed = await request(`ventas/rma/saldos-favor/${saldoId}/reembolsos/${refunded.movimiento_id}/revertir`, reversePayload, 201, bankReverseKey);
  await request(`ventas/rma/saldos-favor/${saldoId}/reembolsos/${refunded.movimiento_id}/revertir`, reversePayload, 201, bankReverseKey);
  assert.equal(cents(await bankBalance()), cents(bankBefore));
  assert.equal(cents(await balance()), cents(due));
  results.push({ scenario: 'RMA pagada: nota genera saldo a favor completo; reembolso bancario parcial/reversa/replays conservan crédito y banco, exceso no muta', passed: true });
  const cashBox = row(await request('cajas'))[0];
  const cashSession = row(await request('pos/caja/abrir', { monto_inicial: 100, caja_id: cashBox.id,
    moneda: 'PEN', dispositivo: 'rma-refund-local' }));
  const cashKey = key();
  const cashPayload = { monto: 5, medio: 'CAJA', sesion_caja_id: cashSession.id };
  const cashRefunded = await request(`ventas/rma/saldos-favor/${saldoId}/reembolsar`, cashPayload, 201, cashKey);
  await request(`ventas/rma/saldos-favor/${saldoId}/reembolsar`, cashPayload, 201, cashKey);
  assert.equal(Number(row(await request(`cajas/saldo-esperado/${cashSession.id}`)).saldo), 95);
  const cashReverseKey = key();
  const cashReversePayload = { ...reversePayload, sesion_caja_id: cashSession.id };
  const cashReversed = await request(`ventas/rma/saldos-favor/${saldoId}/reembolsos/${cashRefunded.movimiento_id}/revertir`, cashReversePayload, 201, cashReverseKey);
  await request(`ventas/rma/saldos-favor/${saldoId}/reembolsos/${cashRefunded.movimiento_id}/revertir`, cashReversePayload, 201, cashReverseKey);
  assert.equal(Number(row(await request(`cajas/saldo-esperado/${cashSession.id}`)).saldo), 100);
  assert.equal(cents(await balance()), cents(due));
  await request('pos/caja/cerrar', { sesion_id: cashSession.id, caja_id: cashBox.id, monto_contado: 100,
    notas: 'Cierre tras reembolso y reversión local' });
  results.push({ scenario: 'RMA pagada: reembolso en caja y reversa/replays producen salida/entrada únicas, saldo esperado correcto y cierre', passed: true });
  const future = await makeOrder('Aplicación local de crédito a pedido futuro');
  const applyPayload = { cxc_id: future.document.cxc.id, monto: 7 };
  await request(`ventas/rma/saldos-favor/${saldoId}/aplicar`, applyPayload, 403, readerHeaders);
  assert.equal(cents(row(await request(`finanzas/cxc/${future.document.cxc.id}`)).saldo), cents(future.cxc.saldo));
  const applyKey = key();
  const applied = await request(`ventas/rma/saldos-favor/${saldoId}/aplicar`, applyPayload, 201, applyKey);
  await request(`ventas/rma/saldos-favor/${saldoId}/aplicar`, applyPayload, 201, applyKey);
  assert.equal(cents(row(await request(`finanzas/cxc/${future.document.cxc.id}`)).saldo), cents(Number(future.cxc.saldo) - 7));
  assert.equal(cents(await balance()), cents(due - 7));
  assert.equal(sql(`SELECT count(*) FROM cxc_pagos WHERE cuenta_id=${uuid(future.document.cxc.id)};`), '0');
  assert.equal(cents(await bankBalance()), cents(bankBefore));
  processAccounting('accounting-paid-rma-complete');
  const events = [credit, refunded, bankReversed, cashRefunded, cashReversed, applied].map(event => event.event_id);
  assert.ok(events.every(Boolean));
  const countEntries = () => sql(`SELECT count(*) FROM asientos_contables WHERE tenant_id=${uuid(tenantId)}
    AND source_event_id IN (${events.map(uuid).join(',')}) AND estado='CONFIRMADO' AND total_debe=total_haber;`);
  assert.equal(Number(countEntries()), events.length);
  const creditAccountNet = event => Number(sql(`SELECT COALESCE(sum(da.haber-da.debe),0) FROM detalle_asientos da
    JOIN plan_cuentas pc ON pc.id=da.cuenta_id JOIN asientos_contables ac ON ac.id=da.asiento_id
    WHERE ac.tenant_id=${uuid(tenantId)} AND ac.source_event_id=${uuid(event.event_id)} AND pc.codigo='122';`));
  assert.equal(cents(creditAccountNet(credit)), cents(due));
  for (const [event, expected] of [[refunded, -10], [bankReversed, 10], [cashRefunded, -5], [cashReversed, 5], [applied, -7]]) {
    assert.equal(cents(creditAccountNet(event)), cents(expected));
  }
  processAccounting('accounting-paid-rma-replay');
  assert.equal(Number(countEntries()), events.length);
  results.push({ scenario: 'RMA pagada: saldo se aplica parcialmente a CxC futura sin fabricar cobro; nota, reembolsos, reversas y aplicación generan asientos únicos/cuadrados',
    passed: true, rma_id: rmaId, rma_number: detail.numero, saldo_favor_id: saldoId, saldo_disponible: due - 7,
    banco_id: bank.id, cxc_futura_id: future.document.cxc.id });
}
