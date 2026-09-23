import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Registros reales creados por HTTP en la infraestructura efímera del runner.
// Alimentan las pantallas con identificador sin inventar estados por SQL.
export async function testRecordFlows({ request, sql, uuid, results, tenantId, processAccounting, approverToken, otherTenantToken }) {
  const product = (await request('pos/productos')).data.find(row => row.codigo === 'DEMO-003');
  assert.ok(product);
  const provider = (await request('compras/proveedores')).data[0];
  assert.ok(provider?.id);
  const quoteIntent = {
    idempotency_key: randomUUID(), numero: 'COT-LOCAL-545', proveedor_id: provider.id,
    detalles: [{ producto_id: product.id, descripcion: product.nombre, cantidad: 1, precio_unitario: 5 }],
  };
  const quote = (await request('compras/cotizaciones', quoteIntent)).data;
  assert.ok(quote?.id);
  assert.equal((await request('compras/cotizaciones', quoteIntent)).data.id, quote.id);
  assert.equal((await request(`compras/cotizaciones/${quote.id}`)).data.detalles.length, 1);
  results.push({ scenario: 'cotización de compra creada, consultada y reintentada sin duplicar', passed: true });

  const bank = (await request('finanzas/bancos/cuentas')).data.find(row => row.moneda === 'PEN' && row.activo);
  assert.ok(bank);
  const reconIntent = { cuenta_bancaria_id: bank.id, periodo: '2026-02', fecha_desde: '2026-02-01', fecha_hasta: '2026-02-28', idempotency_key: randomUUID() };
  const recon = await request('finanzas/conciliacion', reconIntent);
  assert.equal(recon.success, true);
  const reconId = recon.data?.conciliacion?.id;
  assert.ok(reconId);
  await request(`finanzas/conciliacion/${reconId}`);
  const reconReplay = await request('finanzas/conciliacion', reconIntent);
  assert.equal(reconReplay.data?.conciliacion?.id, reconId);
  results.push({ scenario: 'conciliación creada y consultada con reintento idempotente', passed: true });

  const client = (await request('pos/clientes')).data[0];
  assert.ok(client?.id);
  const warehouseId = sql(`SELECT id FROM almacenes WHERE tenant_id=${uuid(tenantId)} AND activo ORDER BY es_principal DESC, id LIMIT 1;`);
  const salesQuote = (await request('ventas/cotizaciones', {
    cliente_id: client.id, notas: 'Cotización local para recorrido RMA',
    detalle: [{ producto_id: product.id, descripcion: product.nombre, cantidad: 1, precio_unitario: 20 }],
  })).data;
  assert.ok(salesQuote?.id);
  const quoteDetail = (await request(`ventas/cotizaciones/${salesQuote.id}`)).data;
  assert.equal(quoteDetail.detalle.length, 1);
  assert.equal(quoteDetail.detalle[0].producto_id, product.id);
  assert.equal((await request(`ventas/cotizaciones/${salesQuote.id}/enviar`, {})).data.estado, 'ENVIADA');
  const approvedQuote = await request(`ventas/cotizaciones/${salesQuote.id}/aprobar`, { motivo: 'Aprobación comercial local por segundo actor' }, 201,
    { authorization: `Bearer ${approverToken}` });
  assert.equal(approvedQuote.data.estado, 'APROBADA');
  results.push({ scenario: 'cotización de venta creada con líneas y aprobada por otro actor', passed: true });
  const conversion = await request(`ventas/cotizaciones/${salesQuote.id}/convertir-pedido`, {});
  assert.ok(conversion.data?.pedido_id);
  const order = (await request(`ventas/pedidos/${conversion.data.pedido_id}`)).data;
  assert.equal(Number(order.total), Number(quoteDetail.total));
  assert.equal(order.detalle.length, 1);
  assert.equal(order.detalle[0].producto_id, product.id);
  assert.equal((await request(`ventas/cotizaciones/${salesQuote.id}`)).data.estado, 'CONVERTIDA');
  await request(`ventas/cotizaciones/${salesQuote.id}/convertir-pedido`, {}, 400);
  assert.equal(sql(`SELECT count(*) FROM pedidos_venta WHERE tenant_id=${uuid(tenantId)} AND cotizacion_id=${uuid(salesQuote.id)};`), '1');
  results.push({ scenario: 'conversión conserva total y producto; una segunda solicitud no duplica pedido', passed: true });
  assert.ok(order?.id);
  const detailId = order.detalle?.[0]?.id ?? order.pedidos_venta_detalle?.[0]?.id;
  assert.ok(detailId);
  await request(`ventas/pedidos/${order.id}/confirmar`, {});
  const picking = { idempotency_key: randomUUID(), responsable: 'Operador local', ubicacion: 'LOCAL', items_preparados: [detailId] };
  await request(`inventario/logistica/${order.id}/preparar`, picking, 200);
  await request(`inventario/logistica/${order.id}/preparar`, picking, 200);
  assert.equal(sql(`SELECT count(*) FROM logistica_eventos WHERE tenant_id=${uuid(tenantId)} AND idempotency_key='${picking.idempotency_key}';`), '1');
  const pending = await request('inventario/logistica/ordenes-pendientes');
  assert.ok((pending.data ?? pending).some(row => row.id === order.id && row.estado === 'EN_PREPARACION'), 'La preparación interrumpida debe poder retomarse');
  await request(`inventario/logistica/${order.id}/marcar-listo`, { idempotency_key: randomUUID() }, 200);
  const dispatchIntent = { idempotency_key: randomUUID(), almacen_id: warehouseId,
    items_despachados: [{ detalle_id: detailId, cantidad: 1, almacen_id: warehouseId }],
    transportista: 'Transporte local', placa: 'ABC-545', conductor: 'Conductor local', bultos: 1, peso_total: 1 };
  await request(`inventario/logistica/${order.id}/confirmar-despacho`, dispatchIntent, 200);
  await request(`inventario/logistica/${order.id}/confirmar-despacho`, dispatchIntent, 200);
  assert.equal(Number(sql(`SELECT cantidad_despachada FROM pedidos_venta_detalle WHERE id=${uuid(detailId)} AND tenant_id=${uuid(tenantId)};`)), 1);
  results.push({ scenario: 'pedido preparado y despachado por logística sin duplicar cantidad al reintentar', passed: true });

  // Generación local: el harness bloquea todo transporte externo y la empresa
  // es demo. RMA exige un documento y CPE origen; no se fabrica por SQL.
  const document = await request(`ventas/pedidos/${order.id}/generar-documento`, { tipo_documento: '01' });
  assert.ok(document.documento?.id);
  assert.ok(document.cpe?.id);
  const intent = { pedido_id: order.id, documento_origen_id: document.documento.id,
    motivo_general: 'Inspección local de devolución', almacen_retorno_id: warehouseId,
    items: [{ detalle_id: detailId, producto_id: product.id, cantidad: 1 }] };
  const headers = { 'idempotency-key': randomUUID() };
  const rma = await request('ventas/rma', intent, 201, headers);
  assert.equal(rma.success, true);
  const rmaId = rma.rma_id ?? rma.data?.id ?? rma.id;
  assert.ok(rmaId);
  const replay = await request('ventas/rma', intent, 201, headers);
  assert.equal(replay.rma_id ?? replay.data?.id ?? replay.id, rmaId);
  const detail = await request(`ventas/rma/${rmaId}`);
  const rmaDetail = detail.data ?? detail;
  assert.equal(rmaDetail.items.length, 1);
  results.push({ scenario: 'RMA de pedido despachado creada y consultada sin duplicar al reintentar', passed: true });
  const receipt = { almacen_id: warehouseId, items: [{ rma_item_id: rmaDetail.items[0].id, cantidad_recibida: 1 }] };
  const receiptHeaders = { 'idempotency-key': randomUUID() };
  const early = await request(`ventas/rma/${rmaId}/recepcionar`, receipt, 400, receiptHeaders);
  assert.match(early.message, /RMA_RECEIPT_REQUIRES_APPROVED/);
  const self = await request(`ventas/rma/${rmaId}/aprobar`, { aprobar: true }, 403, { 'idempotency-key': randomUUID() });
  assert.match(self.message, /RMA_SELF_APPROVAL_FORBIDDEN/);
  assert.ok(approverToken);
  const approvalHeaders = { authorization: `Bearer ${approverToken}`, 'idempotency-key': randomUUID() };
  const approval = await request(`ventas/rma/${rmaId}/aprobar`, { aprobar: true }, 201, approvalHeaders);
  assert.equal(approval.success, true);
  assert.equal((await request(`ventas/rma/${rmaId}/aprobar`, { aprobar: true }, 201, approvalHeaders)).idempotent, true);
  results.push({ scenario: 'RMA rechaza recepción anticipada y autoaprobación; otro actor aprueba sin duplicar', passed: true });

  const stockBefore = Number(sql(`SELECT stock_actual FROM producto_existencias WHERE tenant_id=${uuid(tenantId)} AND producto_id=${uuid(product.id)} AND almacen_id=${uuid(warehouseId)};`));
  const received = await request(`ventas/rma/${rmaId}/recepcionar`, receipt, 201, receiptHeaders);
  assert.equal(received.success, true);
  assert.equal((await request(`ventas/rma/${rmaId}/recepcionar`, receipt, 201, receiptHeaders)).idempotent, true);
  assert.equal(Number(sql(`SELECT stock_actual FROM producto_existencias WHERE tenant_id=${uuid(tenantId)} AND producto_id=${uuid(product.id)} AND almacen_id=${uuid(warehouseId)};`)), stockBefore + 1);
  results.push({ scenario: 'recepción RMA restaura una sola unidad física al reintentar', passed: true });

  processAccounting('accounting-rma-origin');
  const creditHeaders = { 'idempotency-key': randomUUID() };
  const credit = await request(`ventas/rma/${rmaId}/nota-credito`, { motivo: 'Devolución local verificada' }, 201, creditHeaders);
  assert.equal(credit.success, true);
  assert.equal(credit.estado, 'CERRADA');
  const creditedAgain = await request(`ventas/rma/${rmaId}/nota-credito`, { motivo: 'Devolución local verificada' }, 201, creditHeaders);
  assert.equal(creditedAgain.nota_credito_cpe_id, credit.nota_credito_cpe_id);
  assert.equal(creditedAgain.idempotent, true);
  const closedRma = await request(`ventas/rma/${rmaId}`);
  assert.equal(closedRma.estado, 'CERRADA');
  assert.equal(Number(sql(`SELECT saldo FROM cuentas_por_cobrar WHERE id=${uuid(rmaDetail.cxc_origen_id)} AND tenant_id=${uuid(tenantId)};`)), 0);
  results.push({ scenario: 'nota de crédito RMA cierra devolución y CxC sin duplicar documento ni CPE', passed: true });

  processAccounting('accounting-rma-credit');
  const creditEvent = sql(`SELECT event_id FROM outbox_events WHERE tenant_id=${uuid(tenantId)} AND event_type='nota_credito.emitida' AND aggregate_id=${uuid(credit.nota_credito_documento_id)}::text;`);
  assert.equal(sql(`SELECT count(*) FROM asientos_contables WHERE tenant_id=${uuid(tenantId)} AND source_event_id=${uuid(creditEvent)} AND estado='CONFIRMADO' AND total_debe=total_haber;`), '1');
  assert.equal(Number(sql(`SELECT stock_actual FROM producto_existencias WHERE tenant_id=${uuid(tenantId)} AND producto_id=${uuid(product.id)} AND almacen_id=${uuid(warehouseId)};`)), stockBefore + 1);
  results.push({ scenario: 'nota RMA contabilizada una vez sin duplicar retorno físico', passed: true });

  const emissionDate = sql(`SELECT fecha_emision::date FROM cpe WHERE id=(SELECT factura_id FROM pedidos_venta WHERE id=${uuid(order.id)} AND tenant_id=${uuid(tenantId)}) AND tenant_id=${uuid(tenantId)};`);
  assert.match(emissionDate, /^\d{4}-\d{2}-\d{2}$/);
  const leadTime = (await request(`ventas/reportes/lead-time?fechaDesde=${emissionDate}&fechaHasta=${emissionDate}`)).data;
  assert.ok(leadTime.total_conversiones >= 1);
  assert.ok(leadTime.tendencia.some(item => item.periodo === emissionDate.slice(0, 7)));
  assert.ok(Number.isFinite(leadTime.mediana_dias) && leadTime.mediana_dias >= 0);
  const futureLeadTime = (await request('ventas/reportes/lead-time?fechaDesde=2099-01-01&fechaHasta=2099-01-31')).data;
  assert.equal(futureLeadTime.total_conversiones, 0);
  assert.deepEqual(futureLeadTime.tendencia, []);
  await request('ventas/reportes/lead-time?fechaDesde=2026-02-30', undefined, 400);
  await request('ventas/reportes/lead-time?fechaDesde=2026-09-30&fechaHasta=2026-09-01', undefined, 400);
  results.push({ scenario: 'plazo comercial consulta el CPE canónico, genera tendencia y filtra por emisión', passed: true });
  const productReport = (await request('ventas/reportes/productos-mas-vendidos')).data;
  assert.ok(productReport.some(item => item.producto_id === product.id && item.producto_codigo === 'DEMO-003' && item.moneda === 'PEN'));
  for (const endpoint of ['ventas-por-cliente', 'pedidos-por-estado', 'top-clientes']) {
    const report = (await request(`ventas/reportes/${endpoint}`)).data;
    assert.ok(report.length > 0 && report.every(item => item.moneda === 'PEN'), `${endpoint} conserva la moneda del registro`);
  }
  for (const endpoint of ['pedidos-por-estado', 'productos-mas-vendidos']) {
    const filtered = (await request(`ventas/reportes/${endpoint}?cliente=cliente-inexistente-${randomUUID()}`)).data;
    assert.deepEqual(filtered, [], `${endpoint} debe respetar el filtro de cliente`);
  }
  results.push({ scenario: 'reportes comerciales respetan cliente y muestran el código real del producto', passed: true });

  // Circuito separado del RMA: factura de pedido, cobros parciales y totales.
  // La demo local nunca transmite este CPE a SUNAT.
  const collectionQuote = (await request('ventas/cotizaciones', {
    cliente_id: client.id, notas: 'Cobranza parcial local',
    detalle: [{ producto_id: product.id, descripcion: product.nombre, cantidad: 1, precio_unitario: 20 }],
  })).data;
  await request(`ventas/cotizaciones/${collectionQuote.id}/enviar`, {});
  await request(`ventas/cotizaciones/${collectionQuote.id}/aprobar`, { motivo: 'Circuito de cobranza local' }, 201,
    { authorization: `Bearer ${approverToken}` });
  const collectionOrderId = (await request(`ventas/cotizaciones/${collectionQuote.id}/convertir-pedido`, {})).data.pedido_id;
  const collectionOrder = (await request(`ventas/pedidos/${collectionOrderId}`)).data;
  const collectionDetailId = collectionOrder.detalle[0].id;
  await request(`ventas/pedidos/${collectionOrderId}/confirmar`, {});
  await request(`inventario/logistica/${collectionOrderId}/preparar`, {
    idempotency_key: randomUUID(), responsable: 'Operador local', ubicacion: 'LOCAL', items_preparados: [collectionDetailId],
  }, 200);
  await request(`inventario/logistica/${collectionOrderId}/marcar-listo`, { idempotency_key: randomUUID() }, 200);
  await request(`inventario/logistica/${collectionOrderId}/confirmar-despacho`, {
    idempotency_key: randomUUID(), almacen_id: warehouseId,
    items_despachados: [{ detalle_id: collectionDetailId, cantidad: 1, almacen_id: warehouseId }],
    transportista: 'Transporte local', placa: 'ABC-545', conductor: 'Conductor local', bultos: 1, peso_total: 1,
  }, 200);
  const collectionDocument = await request(`ventas/pedidos/${collectionOrderId}/generar-documento`, { tipo_documento: '01' });
  assert.ok(collectionDocument.documento?.id && collectionDocument.cpe?.id && collectionDocument.cxc?.id);
  const cxcId = collectionDocument.cxc.id;
  const cxcBeforeResponse = await request(`finanzas/cxc/${cxcId}`);
  const cxcBefore = cxcBeforeResponse.data ?? cxcBeforeResponse;
  const due = Number(cxcBefore.saldo);
  assert.ok(due > 0);
  const collectionBank = (await request('finanzas/bancos/cuentas')).data.find(row => row.moneda === 'PEN' && row.activo);
  assert.ok(collectionBank?.id);
  const bankBeforeCollection = Number(collectionBank.saldo);
  const today = sql(`SELECT app.hoy_tenant(${uuid(tenantId)});`);
  const partial = Math.round(due * 40) / 100;
  const firstPayment = { monto: partial, fecha_pago: today, moneda: 'PEN', metodo_pago: 'TRANSFERENCIA',
    cuenta_bancaria_id: collectionBank.id, referencia: 'COBRO-PARCIAL-LOCAL', idempotency_key: randomUUID() };
  const first = await request(`finanzas/cxc/${cxcId}/pagos`, firstPayment);
  assert.equal(first.success, true);
  assert.equal((await request(`finanzas/cxc/${cxcId}/pagos`, firstPayment)).data.idempotent_replay, true);
  const cxcPartialResponse = await request(`finanzas/cxc/${cxcId}`);
  const cxcPartial = cxcPartialResponse.data ?? cxcPartialResponse;
  assert.equal(Math.round(Number(cxcPartial.saldo) * 100), Math.round((due - partial) * 100));
  const finalPayment = { ...firstPayment, monto: Number(cxcPartial.saldo), referencia: 'COBRO-FINAL-LOCAL', idempotency_key: randomUUID() };
  await request(`finanzas/cxc/${cxcId}/pagos`, finalPayment);
  assert.equal((await request(`finanzas/cxc/${cxcId}/pagos`, finalPayment)).data.idempotent_replay, true);
  const cxcPaidResponse = await request(`finanzas/cxc/${cxcId}`);
  const cxcPaid = cxcPaidResponse.data ?? cxcPaidResponse;
  assert.equal(Number(cxcPaid.saldo), 0);
  const byNumber = await request(`finanzas/cxc?search=${encodeURIComponent(String(cxcPaid.numero))}`);
  assert.ok(byNumber.data.some(row => row.id === cxcId));
  const byCustomer = await request(`finanzas/cxc?search=${encodeURIComponent(cxcPaid.clientes.razon_social)}`);
  assert.ok(byCustomer.data.some(row => row.id === cxcId));
  assert.deepEqual((await request('finanzas/cxc?search=CLIENTE-INEXISTENTE-LOCAL')).data, []);
  await request(`finanzas/cxc?search=${encodeURIComponent(String(cxcPaid.numero))}`, undefined, 401, { authorization: '' });
  const isolatedSearch = await request(`finanzas/cxc?search=${encodeURIComponent(String(cxcPaid.numero))}`, undefined, 200,
    { authorization: `Bearer ${otherTenantToken}` });
  assert.ok(isolatedSearch.data.every(row => row.id !== cxcId));
  assert.equal(sql(`SELECT count(*) FROM cxc_pagos WHERE cuenta_id=${uuid(cxcId)};`), '2');
  const bankAfterCollection = (await request(`finanzas/bancos/cuentas/${collectionBank.id}`)).data;
  assert.equal(Math.round((Number(bankAfterCollection.saldo) - bankBeforeCollection) * 100), Math.round(due * 100));
  processAccounting('accounting-sales-collection');
  assert.equal(sql(`SELECT count(*) FROM asientos_contables a JOIN outbox_events e ON e.event_id=a.source_event_id WHERE e.tenant_id=${uuid(tenantId)} AND e.idempotency_key IN (${uuid(firstPayment.idempotency_key)}::text,${uuid(finalPayment.idempotency_key)}::text) AND a.estado='CONFIRMADO' AND a.total_debe=a.total_haber;`), '2');
  results.push({ scenario: 'pedido despachado genera CPE/CxC; cobros parcial y total aumentan banco y crean asientos únicos al reintentar', passed: true,
    pedido_id: collectionOrderId, cxc_id: cxcId });

}
