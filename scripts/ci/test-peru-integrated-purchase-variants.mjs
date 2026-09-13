import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

// Recorridos adicionales del mismo ensayo efímero: sólo HTTP muta datos de negocio.
export async function testPurchaseVariants({ request, sql, uuid, results, processAccounting,
  tenantId, setToken, primaryToken, approverToken, outputDir, provider, product,
  warehouseId, today, paidReceipt, paidOrder, paidInvoice }) {
  const pass = (scenario, evidence = {}) => results.push({ scenario, passed: true, ...evidence });
  const stock = async () => Number((await request('pos/productos')).data.find(row => row.id === product.id).stock_actual);
  const journal = (eventId, total) => {
    assert.equal(sql(`SELECT status FROM outbox_events WHERE event_id=${uuid(eventId)};`), 'completed');
    assert.equal(sql(`SELECT count(*) FROM asientos_contables WHERE tenant_id=${uuid(tenantId)} AND source_event_id=${uuid(eventId)} AND estado='CONFIRMADO' AND total_debe=total_haber AND total_debe=${Number(total)};`), '1');
  };
  const returnIntent = (orderId, receiptId, items) => ({
    idempotency_key: randomUUID(), orden_id: orderId, recepcion_id: receiptId,
    proveedor_id: provider.id, motivo: 'Devolución documentada en infraestructura local', items,
  });
  const physicalItem = (receiptItemId, quantity = 1) => ({ recepcion_item_id: receiptItemId,
    producto_id: product.id, descripcion: product.nombre, cantidad: quantity, precio_unitario: 5, almacen_id: warehouseId });

  // La devolución sobre una factura pagada falla después del intento de salida:
  // comprobar que PostgreSQL revierte también ese movimiento previo al rechazo.
  const paidStock = await stock();
  const blockedIntent = returnIntent(paidOrder.id, paidReceipt.id, [physicalItem(paidReceipt.items[0].id)]);
  const blocked = await request('compras/devoluciones', blockedIntent);
  assert.equal(blocked.estado, 'PENDIENTE');
  assert.equal((await request('compras/devoluciones', blockedIntent)).id, blocked.id);
  const denied = await request(`compras/devoluciones/${blocked.id}/emitir`, {}, 400);
  assert.match(denied.message, /SUPPLIER_CREDIT_EXCEEDS_OUTSTANDING/);
  assert.equal(await stock(), paidStock);
  assert.equal(Number((await request(`finanzas/cxp/${paidInvoice.id}`)).data.saldo), 0);
  assert.equal((await request(`compras/devoluciones/${blocked.id}`)).estado, 'PENDIENTE');
  assert.equal(sql(`SELECT count(*) FROM movimientos_inventario WHERE referencia_id=${uuid(blocked.items[0].id)};`), '0');
  assert.equal(sql(`SELECT count(*) FROM outbox_events WHERE aggregate_id=${uuid(blocked.id)}::text;`), '0');
  const cancel = await request(`compras/devoluciones/${blocked.id}/anular`, { motivo: 'Factura pagada requiere conciliación' }, 200);
  assert.equal(cancel.estado, 'ANULADA');
  assert.equal((await request(`compras/devoluciones/${blocked.id}/anular`, {}, 200)).idempotent, true);
  assert.equal(await stock(), paidStock);
  pass('devolución incompatible con factura pagada revierte stock y outbox; borrador anulable');

  const categoryIntent = { idempotency_key: randomUUID(), nombre: 'Servicios locales', codigo: 'SERV-LOCAL' };
  const category = (await request('inventario/categorias', categoryIntent)).data;
  assert.ok(category.id);
  assert.equal((await request('inventario/categorias', categoryIntent)).data.id, category.id);
  assert.ok((await request('inventario/categorias')).data.some(row => row.id === category.id));
  const serviceIntent = { idempotency_key: randomUUID(), codigo: 'SERV-LOCAL-INTEGRATED',
    nombre: 'Servicio de mantenimiento local', categoria: categoryIntent.nombre, unidad_medida: 'ZZ',
    precio_compra: 10, precio_venta: 20, es_servicio: true, controla_stock: false, afectacion_igv: '10' };
  const service = (await request('inventario/productos', serviceIntent)).data;
  assert.ok(service.id);
  const serviceDetail = (await request(`inventario/productos/${service.id}`)).data;
  assert.equal(serviceDetail.es_servicio, true);
  assert.equal(serviceDetail.controla_stock, false);
  assert.equal((await request('inventario/productos', serviceIntent)).data.id, service.id);
  pass('alta idempotente de servicio sin control de stock en el catálogo');

  const stockBefore = await stock();
  const mixedOrder = (await request('compras/ordenes', {
    idempotency_key: randomUUID(), numero: `OC-MIXTA-${Date.now()}`, proveedor_id: provider.id,
    condiciones_pago: 'CREDITO_30', dias_credito: 30, almacen_destino_id: warehouseId,
    detalles: [
      { producto_id: product.id, descripcion: product.nombre, cantidad: 4, precio_unitario: 5 },
      { producto_id: service.id, descripcion: serviceIntent.nombre, cantidad: 2, precio_unitario: 10 },
    ],
  })).data;
  assert.equal(Number(mixedOrder.total), 47.2);
  const orderDetails = (await request(`compras/ordenes/${mixedOrder.id}`)).data.detalles;
  const goodsDetail = orderDetails.find(row => row.producto_id === product.id);
  const serviceOrderDetail = orderDetails.find(row => row.producto_id === service.id);
  setToken(approverToken);
  await request(`compras/ordenes/${mixedOrder.id}/aprobar`, {}, 200);
  setToken(primaryToken);
  const receive = async items => {
    const receipt = await request(`compras/recepciones/ordenes/${mixedOrder.id}`, {
      orden_id: mixedOrder.id, idempotency_key: randomUUID(), almacen_id: warehouseId, items,
    });
    await request(`compras/recepciones/${receipt.id}/cerrar`, {}, 200);
    await request(`compras/recepciones/${receipt.id}/cerrar`, {}, 200);
    return receipt;
  };
  const first = await receive([
    { detalle_id: goodsDetail.id, cantidad_recibida: 2, calidad: 'OK' },
    { detalle_id: serviceOrderDetail.id, cantidad_recibida: 1, calidad: 'OK' },
  ]);
  assert.equal((await request(`compras/ordenes/${mixedOrder.id}`)).data.estado, 'PARCIAL');
  assert.equal(await stock(), stockBefore + 2);
  const second = await receive([
    { detalle_id: goodsDetail.id, cantidad_recibida: 2, calidad: 'RECHAZADO' },
    { detalle_id: serviceOrderDetail.id, cantidad_recibida: 1, calidad: 'OBSERVADO' },
  ]);
  const afterSecond = (await request(`compras/ordenes/${mixedOrder.id}`)).data;
  assert.equal(afterSecond.estado, 'PARCIAL');
  assert.equal(Number(afterSecond.detalles.find(row => row.producto_id === product.id).cantidad_recibida), 2);
  assert.equal(Number(afterSecond.detalles.find(row => row.producto_id === service.id).cantidad_recibida), 2);
  assert.equal(await stock(), stockBefore + 2);
  const excessive = await request(`compras/recepciones/ordenes/${mixedOrder.id}`, {
    orden_id: mixedOrder.id, idempotency_key: randomUUID(), almacen_id: warehouseId,
    items: [{ detalle_id: goodsDetail.id, cantidad_recibida: 3, calidad: 'OK' }],
  }, 400);
  assert.match(excessive.message, /excede/i);
  assert.equal(sql(`SELECT count(*) FROM recepciones WHERE orden_id=${uuid(mixedOrder.id)};`), '2');
  const third = await receive([{ detalle_id: goodsDetail.id, cantidad_recibida: 2, calidad: 'OK' }]);
  assert.equal((await request(`compras/ordenes/${mixedOrder.id}`)).data.estado, 'RECIBIDA');
  assert.equal(await stock(), stockBefore + 4);
  assert.equal(sql(`SELECT count(*) FROM movimientos_inventario WHERE producto_id=${uuid(service.id)};`), '0');
  assert.equal(sql(`SELECT count(*) FROM cuentas_por_pagar WHERE orden_id=${uuid(mixedOrder.id)};`), '0');
  pass('recepción parcial mixta: servicios cumplen la orden; rechazo no ingresa stock y exceso no crea cabecera');

  const receiptEvents = [first, second, third].map(receipt => sql(`SELECT event_id FROM outbox_events WHERE tenant_id=${uuid(tenantId)} AND aggregate_id=${uuid(receipt.id)}::text AND event_type='recepcion.registrada';`));
  processAccounting('accounting-purchase-partials');
  receiptEvents.forEach((id, index) => journal(id, [20, 10, 10][index]));
  const serviceExpense = Number(sql(`SELECT sum(d.debe) FROM detalle_asientos d JOIN asientos_contables a ON a.id=d.asiento_id JOIN plan_cuentas p ON p.id=d.cuenta_id WHERE a.source_event_id IN (${receiptEvents.map(uuid).join(',')}) AND p.codigo='63';`));
  assert.equal(serviceExpense, 20);
  assert.equal(sql(`SELECT count(*) FROM detalle_asientos d JOIN asientos_contables a ON a.id=d.asiento_id JOIN plan_cuentas p ON p.id=d.cuenta_id WHERE a.source_event_id IN (${receiptEvents.map(uuid).join(',')}) AND p.codigo LIKE '40%';`), '0');
  pass('recepciones parciales contabilizadas: mercadería y servicio separados, sin duplicados ni crédito fiscal');

  const firstGoods = first.items.find(row => row.producto_id === product.id);
  const firstService = first.items.find(row => row.producto_id === service.id);
  const preInvoiceIntent = returnIntent(mixedOrder.id, first.id, [physicalItem(firstGoods.id), {
    recepcion_item_id: firstService.id, producto_id: service.id, descripcion: serviceIntent.nombre,
    cantidad: 0.5, precio_unitario: 10,
  }]);
  const preInvoiceReturn = await request('compras/devoluciones', preInvoiceIntent);
  assert.equal(Number(preInvoiceReturn.total), 11.8);
  const beforeReturnStock = await stock();
  const returned = await request(`compras/devoluciones/${preInvoiceReturn.id}/emitir`, {}, 200);
  assert.equal(returned.estado, 'EMITIDA');
  await request(`compras/devoluciones/${preInvoiceReturn.id}/emitir`, {}, 200);
  assert.equal(await stock(), beforeReturnStock - 1);
  assert.equal(sql(`SELECT count(*) FROM movimientos_inventario WHERE producto_id=${uuid(service.id)};`), '0');
  assert.equal(sql(`SELECT count(*) FROM cuentas_por_pagar WHERE recepcion_id=${uuid(first.id)};`), '0');
  const returnedEvent = returned.emit_event_id;
  processAccounting('accounting-purchase-return-unbilled');
  journal(returnedEvent, 10);
  assert.equal(sql(`SELECT count(*) FROM detalle_asientos d JOIN asientos_contables a ON a.id=d.asiento_id JOIN plan_cuentas p ON p.id=d.cuenta_id WHERE a.source_event_id=${uuid(returnedEvent)} AND p.codigo='4699' AND d.debe=10;`), '1');
  const rejectedGoods = second.items.find(row => row.producto_id === product.id);
  const rejectedReturn = await request('compras/devoluciones', returnIntent(mixedOrder.id, second.id, [physicalItem(rejectedGoods.id)]), 400);
  assert.match(rejectedReturn.message, /RECHAZADO/);
  pass('devolución previa a factura revierte mercadería y servicio sin deuda ni IGV; rechazo original no es devolvible');

  const unpaid = (await request('finanzas/cxp', { proveedor_id: provider.id, orden_id: mixedOrder.id,
    recepcion_id: third.id, numero_documento: 'F001-00000003', serie: 'F001', tipo_documento: 'FACTURA',
    fecha_emision: today, condiciones_pago: 'CREDITO_30', subtotal: 10, igv: 1.8, total: 11.8,
    moneda: 'PEN', tipo_cambio: 1, destino_credito_fiscal: 'GRAVADAS' })).data;
  processAccounting('accounting-purchase-invoice-unpaid');
  journal(unpaid.event_id, 11.8);
  const invoicedReturn = await request('compras/devoluciones', returnIntent(mixedOrder.id, third.id, [physicalItem(third.items[0].id)]));
  const invoicedEmission = await request(`compras/devoluciones/${invoicedReturn.id}/emitir`, {}, 200);
  assert.equal(invoicedEmission.estado, 'EMITIDA');
  await request(`compras/devoluciones/${invoicedReturn.id}/emitir`, {}, 200);
  assert.equal(await stock(), beforeReturnStock - 2);
  assert.equal(Number((await request(`finanzas/cxp/${unpaid.id}`)).data.saldo), 5.9);
  assert.equal(sql(`SELECT count(*) FROM cxp_ajustes_proveedor WHERE devolucion_id=${uuid(invoicedReturn.id)};`), '1');
  processAccounting('accounting-purchase-return-invoiced');
  journal(invoicedEmission.emit_event_id, 5.9);
  pass('devolución de compra pendiente ajusta saldo, inventario y asiento una sola vez');
  const foreignIntent = { proveedor_id: provider.id, numero_documento: 'F001-00000004',
    serie: 'F001', tipo_documento: 'FACTURA', fecha_emision: today, condiciones_pago: 'CREDITO_30',
    subtotal: 100, igv: 18, total: 118, moneda: 'USD', tipo_cambio: 3.8, destino_credito_fiscal: 'GRAVADAS' };
  const foreignInvoice = (await request('finanzas/cxp', foreignIntent)).data;
  assert.equal(Number(foreignInvoice.saldo), 118);
  assert.equal(foreignInvoice.moneda, 'USD');
  assert.equal(Number(foreignInvoice.tipo_cambio_origen), 3.8);
  await request('finanzas/cxp', { ...foreignIntent, tipo_cambio: 3.9 }, 409);
  processAccounting('accounting-purchase-invoice-usd');
  journal(foreignInvoice.event_id, 448.4);
  assert.equal(sql(`SELECT count(*) FROM detalle_asientos d JOIN asientos_contables a ON a.id=d.asiento_id JOIN plan_cuentas p ON p.id=d.cuenta_id WHERE a.source_event_id=${uuid(foreignInvoice.event_id)} AND p.codigo='42' AND d.haber=448.4;`), '1');
  assert.equal(Number((await request(`finanzas/cxp/${foreignInvoice.id}`)).data.saldo), 118);
  pass('factura USD conserva deuda documental y contabiliza en soles con su cotización de origen');
  writeFileSync(path.join(outputDir, 'purchase-variants.json'), JSON.stringify({ tenant_id: tenantId,
    service_id: service.id, mixed_order_id: mixedOrder.id, receipt_ids: [first.id, second.id, third.id],
    receipt_event_ids: receiptEvents, cancelled_return_id: blocked.id, unbilled_return_id: returned.id,
    unbilled_return_event_id: returnedEvent, unpaid_invoice_id: unpaid.id,
    invoiced_return_id: invoicedReturn.id, invoiced_return_event_id: invoicedEmission.emit_event_id,
    usd_invoice_id: foreignInvoice.id, usd_invoice_event_id: foreignInvoice.event_id }, null, 2));
}
