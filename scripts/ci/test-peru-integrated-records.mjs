import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Registros reales creados por HTTP en la infraestructura efímera del runner.
// Alimentan las pantallas con identificador sin inventar estados por SQL.
export async function testRecordFlows({ request, sql, uuid, results, tenantId, processAccounting, approverToken }) {
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

}
