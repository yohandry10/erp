import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { testPurchaseVariants } from './test-peru-integrated-purchase-variants.mjs';

// Este módulo se invoca desde el ejecutor que valida API, base y fixture locales.
// Las mutaciones pasan por HTTP; SQL sólo contrasta la evidencia persistida.
export async function testPurchases({ request, sql, uuid, results, processAccounting, tenantId, setToken, primaryToken, outputDir }) {
  const pass = (scenario, evidence = {}) => results.push({ scenario, passed: true, ...evidence });
  const provider = (await request('compras/proveedores', {
    ruc: '20123456786', razon_social: 'Proveedor integración local SAC',
    email: 'supplier-integrated@example.test', direccion: 'Dirección sintética local',
    condiciones_pago: 'CREDITO_30', dias_credito: 30,
  })).data;
  assert.ok(provider.id);
  assert.equal((await request(`compras/proveedores/${provider.id}`)).data.razon_social, provider.razon_social);
  pass('alta y consulta real de proveedor peruano');

  const products = (await request('pos/productos')).data;
  const product = products.find(row => row.codigo === 'DEMO-003');
  assert.ok(product);
  const warehouseId = sql(`SELECT id FROM almacenes WHERE tenant_id=${uuid(tenantId)} AND activo ORDER BY es_principal DESC, id LIMIT 1;`);
  const orderIntent = {
    idempotency_key: randomUUID(), numero: `OC-LOCAL-${Date.now()}`, proveedor_id: provider.id,
    condiciones_pago: 'CREDITO_30', dias_credito: 30, almacen_destino_id: warehouseId,
    detalles: [{ producto_id: product.id, descripcion: product.nombre, cantidad: 3, precio_unitario: 5 }],
  };
  const order = (await request('compras/ordenes', orderIntent)).data;
  assert.equal(order.estado, 'BORRADOR');
  assert.equal(Number(order.subtotal), 15);
  assert.equal(Number(order.igv), 2.7);
  assert.equal(Number(order.total), 17.7);
  const orderReplay = (await request('compras/ordenes', orderIntent)).data;
  assert.equal(orderReplay.id, order.id);
  assert.equal(orderReplay.idempotent, true);
  const orderDetail = (await request(`compras/ordenes/${order.id}`)).data;
  assert.equal(orderDetail.detalles.length, 1);
  pass('orden de compra calculada en PostgreSQL y reintento idempotente', { order_id: order.id });

  const ownApproval = await request(`compras/ordenes/${order.id}/aprobar`, { comentarios: 'Debe impedir autoaprobación de OC' }, 400);
  assert.match(ownApproval.message, /actor distinto/i);
  const approver = await request('auth/login', { email: 'peru-integrated-approver-1@example.test', password: 'Local-Peru-2026-Only!' });
  assert.equal(approver.user.tenant_id, tenantId);
  setToken(approver.access_token);
  const approved = (await request(`compras/ordenes/${order.id}/aprobar`, { comentarios: 'Aprobación segregada en prueba local' }, 200)).data;
  assert.equal(approved.estado, 'APROBADA');
  const approvalReplay = (await request(`compras/ordenes/${order.id}/aprobar`, {}, 200)).data;
  assert.equal(approvalReplay.idempotent, true);
  const approvals = (await request(`compras/ordenes/${order.id}/aprobaciones`)).data;
  assert.equal(approvals.length, 1);
  assert.equal(approvals[0].aprobador_id, approver.user.id);
  setToken(primaryToken);
  pass('aprobación por otro usuario y una sola decisión persistida');

  const receiptIntent = {
    orden_id: order.id, idempotency_key: randomUUID(), almacen_id: warehouseId,
    items: [{ detalle_id: orderDetail.detalles[0].id, cantidad_recibida: 3, calidad: 'OK' }],
  };
  const receipt = await request(`compras/recepciones/ordenes/${order.id}`, receiptIntent);
  assert.equal(receipt.estado, 'BORRADOR');
  assert.equal(receipt.items.length, 1);
  const receiptReplay = await request(`compras/recepciones/ordenes/${order.id}`, receiptIntent);
  assert.equal(receiptReplay.id, receipt.id);
  assert.equal(sql(`SELECT count(*) FROM recepciones WHERE orden_id=${uuid(order.id)};`), '1');
  const closed = await request(`compras/recepciones/${receipt.id}/cerrar`, {}, 200);
  assert.equal(closed.estado, 'CERRADA');
  const closedAgain = await request(`compras/recepciones/${receipt.id}/cerrar`, {}, 200);
  assert.equal(closedAgain.id, receipt.id);
  const orderAfter = (await request(`compras/ordenes/${order.id}`)).data;
  assert.equal(orderAfter.estado, 'RECIBIDA');
  assert.equal(Number(orderAfter.detalles[0].cantidad_recibida), 3);
  const stockAfter = (await request('pos/productos')).data.find(row => row.id === product.id);
  assert.equal(Number(stockAfter.stock_actual), Number(product.stock_actual) + 3);
  assert.equal((await request(`compras/ordenes/${order.id}/recepciones`)).data.length, 1);
  assert.equal(sql(`SELECT count(*) FROM cuentas_por_pagar WHERE recepcion_id=${uuid(receipt.id)};`), '0');
  const receiptEventId = sql(`SELECT event_id FROM outbox_events WHERE tenant_id=${uuid(tenantId)} AND aggregate_id=${uuid(receipt.id)}::text AND event_type='recepcion.registrada';`);
  uuid(receiptEventId);
  processAccounting('accounting-purchase-receipt');
  writeFileSync(path.join(outputDir, 'purchase-receipt-outbox.json'), sql(`SELECT to_jsonb(e)-'payload'-'event_data' FROM outbox_events e WHERE event_id=${uuid(receiptEventId)};`));
  const receiptPosting = JSON.parse(sql(`SELECT jsonb_build_object('count',count(*),'total',sum(total_debe),'balanced',bool_and(total_debe=total_haber),'confirmed',bool_and(estado='CONFIRMADO')) FROM asientos_contables WHERE tenant_id=${uuid(tenantId)} AND source_event_id=${uuid(receiptEventId)};`));
  assert.deepEqual(receiptPosting, { count: 1, total: 15, balanced: true, confirmed: true });
  assert.equal(sql(`SELECT count(*) FROM detalle_asientos d JOIN asientos_contables a ON a.id=d.asiento_id JOIN plan_cuentas p ON p.id=d.cuenta_id WHERE a.source_event_id=${uuid(receiptEventId)} AND p.codigo LIKE '40%';`), '0');
  pass('recepción cerrada: stock único, orden recibida y costo sin deuda ni crédito fiscal', { receipt_id: receipt.id, event_id: receiptEventId });

  const today = sql(`SELECT app.hoy_tenant(${uuid(tenantId)});`);
  const invoiceIntent = {
    proveedor_id: provider.id, orden_id: order.id, recepcion_id: receipt.id,
    numero_documento: 'F001-00000001', serie: 'F001', tipo_documento: 'FACTURA',
    fecha_emision: today, condiciones_pago: 'CREDITO_30',
    subtotal: 15, igv: 2.7, total: 17.7, moneda: 'PEN', tipo_cambio: 1,
    destino_credito_fiscal: 'GRAVADAS',
  };
  const invoice = (await request('finanzas/cxp', invoiceIntent)).data;
  assert.ok(invoice.id);
  const invoiceDetail = (await request(`finanzas/cxp/${invoice.id}`)).data;
  assert.equal(Number(invoiceDetail.saldo), 17.7);
  assert.equal(invoiceDetail.estado, 'PENDIENTE');
  assert.equal(invoiceDetail.recepcion_id, receipt.id);
  pass('factura del proveedor genera deuda real en PEN y conserva la recepción', { cxp_id: invoice.id });
  const invoiceReplay = (await request('finanzas/cxp', invoiceIntent)).data;
  assert.equal(invoiceReplay.id, invoice.id);
  assert.equal(invoiceReplay.idempotent, true);
  await request('finanzas/cxp', { ...invoiceIntent, subtotal: 20, igv: 3.6, total: 23.6 }, 409);
  assert.equal(sql(`SELECT count(*) FROM cuentas_por_pagar WHERE recepcion_id=${uuid(receipt.id)};`), '1');
  processAccounting('accounting-purchase-invoice');
  assert.equal(sql(`SELECT count(*) FROM asientos_contables WHERE source_event_id=${uuid(invoice.event_id)} AND tenant_id=${uuid(tenantId)} AND estado='CONFIRMADO' AND total_debe=total_haber AND total_debe=17.7;`), '1');
  assert.equal(sql(`SELECT status FROM outbox_events WHERE event_id=${uuid(invoice.event_id)};`), 'completed');
  pass('factura y asiento únicos al reintentar el registro');

  const bank = (await request('finanzas/bancos/cuentas')).data.find(row => row.moneda === 'PEN' && row.activo);
  assert.ok(bank?.id);
  const bankBefore = Number(bank.saldo);
  const paymentIntent = {
    monto: 17.7, fecha_pago: today, metodo_pago: 'TRANSFERENCIA',
    cuenta_bancaria_id: bank.id, referencia: 'OPERACION-LOCAL-COMPRA', idempotency_key: randomUUID(),
  };
  const payment = (await request(`finanzas/cxp/${invoice.id}/aplicar-pago`, paymentIntent)).data;
  assert.equal(payment.cxp.estado, 'PAGADA');
  assert.equal(Number(payment.cxp.saldo), 0);
  const paymentReplay = (await request(`finanzas/cxp/${invoice.id}/aplicar-pago`, paymentIntent)).data;
  assert.equal(paymentReplay.idempotent, true);
  assert.equal(paymentReplay.pago.id, payment.pago.id);
  const paidBank = (await request(`finanzas/bancos/cuentas/${bank.id}`)).data;
  assert.equal(Math.round((bankBefore - Number(paidBank.saldo)) * 100), 1770);
  const paymentEventId = sql(`SELECT event_id FROM outbox_events WHERE tenant_id=${uuid(tenantId)} AND idempotency_key=${uuid(paymentIntent.idempotency_key)}::text;`);
  processAccounting('accounting-purchase-payment');
  assert.equal(sql(`SELECT count(*) FROM asientos_contables WHERE source_event_id=${uuid(paymentEventId)} AND tenant_id=${uuid(tenantId)} AND estado='CONFIRMADO' AND total_debe=total_haber AND total_debe=17.7;`), '1');
  assert.equal(sql(`SELECT status FROM outbox_events WHERE event_id=${uuid(paymentEventId)};`), 'completed');
  pass('pago de compra: deuda cancelada, cargo bancario y asiento únicos al reintentar', { payment_id: payment.pago.id, event_id: paymentEventId });

  const otherCompany = await request('auth/login', { email: 'peru-integrated-2@example.test', password: 'Local-Peru-2026-Only!' });
  setToken(otherCompany.access_token);
  await request(`compras/ordenes/${order.id}`, undefined, 404);
  await request(`compras/recepciones/${receipt.id}`, undefined, 404);
  await request(`finanzas/cxp/${invoice.id}`, undefined, 404);
  setToken(primaryToken);
  pass('orden, recepción y factura de compra invisibles desde otra empresa');

  const classifiedIntent = { ...invoiceIntent, orden_id: undefined, recepcion_id: undefined,
    numero_documento: 'F001-00000002', destino_credito_fiscal: 'COMUN', codigo_detraccion: '019' };
  const classified = (await request('finanzas/cxp', classifiedIntent)).data;
  const classifiedSaved = (await request(`finanzas/cxp/${classified.id}`)).data;
  assert.equal(classifiedSaved.destino_credito_fiscal, 'COMUN', 'Debe conservar el destino elegido para la prorrata');
  assert.equal(classifiedSaved.codigo_detraccion, '019');
  assert.equal(Number(classifiedSaved.tipo_cambio_origen), 1);
  assert.equal((await request('finanzas/cxp', classifiedIntent)).data.id, classified.id);
  await request('finanzas/cxp', { ...classifiedIntent, destino_credito_fiscal: 'NO_GRAVADAS' }, 409);
  pass('factura conserva destino del crédito fiscal, código SPOT y tipo de cambio de origen');
  writeFileSync(path.join(outputDir, 'purchase.json'), JSON.stringify({ tenant_id: tenantId, provider_id: provider.id, order_id: order.id, receipt_id: receipt.id, invoice_id: invoice.id, receipt_event_id: receiptEventId, invoice_event_id: invoice.event_id, payment_id: payment.pago.id, payment_event_id: paymentEventId }, null, 2));
  await testPurchaseVariants({ request, sql, uuid, results, processAccounting, tenantId,
    setToken, primaryToken, approverToken: approver.access_token, outputDir,
    provider, product, warehouseId, today, paidReceipt: receipt, paidOrder: order, paidInvoice: invoice });
  return { approverToken: approver.access_token };
}
