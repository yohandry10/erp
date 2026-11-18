import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Circuito encadenado en dólares sobre la base efímera del runner, nunca PROD:
// OC en USD -> recepción cerrada con tipo de cambio congelado (617) -> factura
// USD ligada a esa recepción -> pago total. Concilia stock, deuda, banco y mayor.
export async function testUsdPurchaseChain({ request, sql, uuid, results, processAccounting, tenantId, setToken, primaryToken, approverToken }) {
  const pass = (scenario, evidence = {}) => results.push({ scenario, passed: true, ...evidence });
  const tag = randomUUID().slice(0, 8);
  const base = '20' + String(Date.now()).slice(-8);
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const check = 11 - weights.reduce((sum, w, i) => sum + Number(base[i]) * w, 0) % 11;
  const provider = (await request('compras/proveedores', {
    ruc: base + String(check === 10 ? 0 : check === 11 ? 1 : check), razon_social: 'Proveedor USD ' + tag,
    email: 'usd-' + tag + '@example.test', direccion: 'Dirección sintética local', condiciones_pago: 'CREDITO_30', dias_credito: 30,
  })).data;
  const product = (await request('pos/productos')).data.find(row => row.codigo === 'DEMO-003');
  assert.ok(product);
  const warehouseId = sql(`SELECT id FROM almacenes WHERE tenant_id=${uuid(tenantId)} AND activo ORDER BY es_principal DESC, id LIMIT 1;`);
  const stockOf = async () => Number((await request('pos/productos')).data.find(row => row.id === product.id).stock_actual);
  const stockBefore = await stockOf();

  const order = (await request('compras/ordenes', {
    idempotency_key: randomUUID(), numero: 'OC-USD-' + tag, proveedor_id: provider.id, moneda: 'USD',
    condiciones_pago: 'CREDITO_30', dias_credito: 30, almacen_destino_id: warehouseId,
    detalles: [{ producto_id: product.id, descripcion: product.nombre, cantidad: 2, precio_unitario: 10 }],
  })).data;
  assert.equal(order.moneda, 'USD');
  assert.equal(Number(order.subtotal), 20);
  assert.equal(Number(order.total), 23.6);
  setToken(approverToken);
  try { assert.equal((await request(`compras/ordenes/${order.id}/aprobar`, { comentarios: 'Aprobación USD local' }, 200)).data.estado, 'APROBADA'); }
  finally { setToken(primaryToken); }
  const detail = (await request(`compras/ordenes/${order.id}`)).data;

  const receipt = await request(`compras/recepciones/ordenes/${order.id}`, {
    orden_id: order.id, idempotency_key: randomUUID(), almacen_id: warehouseId,
    items: [{ detalle_id: detail.detalles[0].id, cantidad_recibida: 2, calidad: 'OK' }],
  });
  const missingRate = await request(`compras/recepciones/${receipt.id}/cerrar`, {}, 400);
  assert.match(String(missingRate.message), /tipo de cambio/i);
  assert.equal(await stockOf(), stockBefore, 'Un cierre rechazado no mueve stock');
  const valuacion = { moneda: 'USD', moneda_base: 'PEN', tipo_cambio: '3.75', referencia: 'Tipo de cambio sintético local ' + tag };
  const closed = await request(`compras/recepciones/${receipt.id}/cerrar`, { valuacion }, 200);
  assert.equal(closed.estado, 'CERRADA');
  assert.equal(closed.valuacion_cierre?.tipo_cambio, '3.75');
  const replay = await request(`compras/recepciones/${receipt.id}/cerrar`, { valuacion }, 200);
  assert.equal(replay.id, receipt.id);
  assert.equal(await stockOf(), stockBefore + 2);
  const receiptEvent = sql(`SELECT event_id FROM outbox_events WHERE tenant_id=${uuid(tenantId)} AND aggregate_id=${uuid(receipt.id)}::text AND event_type='recepcion.registrada';`);
  processAccounting('accounting-usd-chain-receipt');
  assert.equal(sql(`SELECT count(*) FROM asientos_contables WHERE tenant_id=${uuid(tenantId)} AND source_event_id=${uuid(receiptEvent)} AND estado='CONFIRMADO' AND total_debe=total_haber AND total_debe=75;`), '1');
  pass('USD: recepción exige tipo de cambio, congela 3.75 y valoriza USD 20 en PEN 75.00 una sola vez', { receipt_id: receipt.id });

  const today = sql(`SELECT app.hoy_tenant(${uuid(tenantId)});`);
  const invoiceIntent = { proveedor_id: provider.id, orden_id: order.id, recepcion_id: receipt.id,
    numero_documento: 'F001-USD-' + tag, serie: 'F001', tipo_documento: 'FACTURA', fecha_emision: today,
    condiciones_pago: 'CREDITO_30', subtotal: 20, igv: 3.6, total: 23.6, moneda: 'USD', tipo_cambio: 3.8,
    destino_credito_fiscal: 'GRAVADAS' };
  const invoice = (await request('finanzas/cxp', invoiceIntent)).data;
  assert.equal(invoice.moneda, 'USD');
  assert.equal(Number(invoice.saldo), 23.6);
  assert.equal((await request('finanzas/cxp', invoiceIntent)).data.id, invoice.id);
  processAccounting('accounting-usd-chain-invoice');
  assert.equal(sql(`SELECT count(*) FROM asientos_contables WHERE tenant_id=${uuid(tenantId)} AND source_event_id=${uuid(invoice.event_id)} AND estado='CONFIRMADO' AND total_debe=total_haber AND total_debe=89.68;`), '1');
  pass('USD: factura ligada a la recepción genera deuda USD 23.60 y asiento PEN 89.68 con su propia cotización', { cxp_id: invoice.id });

  const accounts = (await request('contabilidad/plan-cuentas')).data;
  const account = code => { const row = accounts.find(item => item.codigo === code && item.activo); assert.ok(row, code); return row.id; };
  const bank = (await request('finanzas/bancos/cuentas', { nombre: 'Banco USD ' + tag, banco: 'BANCO LOCAL',
    numero_cuenta: 'USD-' + tag, moneda: 'USD', tipo_cuenta: 'CORRIENTE', cuenta_contable_id: account('1041'), saldo: 0 },
    201, { 'idempotency-key': randomUUID() })).data;
  assert.equal(bank.moneda, 'USD');
  // Fondos por movimiento con contrapartida y cotización: el saldo inicial directo no existe.
  await request('finanzas/bancos/movimientos', { cuenta_bancaria_id: bank.id, cuenta_contrapartida_id: account('70'), tipo: 'ABONO',
    monto: 100, moneda: 'USD', tipo_cambio: 3.8, fecha: today, descripcion: 'Fondos USD prueba local', referencia: 'USD-FUND-' + tag,
    categoria: 'OTRO_INGRESO', metodo_pago: 'TRANSFERENCIA', idempotency_key: randomUUID() });
  // El pago liquida con el tipo de cambio registrado del día; sin él se rechaza.
  await request('contabilidad/tipos-cambio', { moneda_origen: 'USD', moneda_destino: 'PEN', fecha: today, compra: 3.79, venta: 3.81, fuente: 'MANUAL' });
  const bankBefore = Number((await request(`finanzas/bancos/cuentas/${bank.id}`)).data.saldo);
  const paymentIntent = { monto: 23.6, fecha_pago: today, metodo_pago: 'TRANSFERENCIA', cuenta_bancaria_id: bank.id,
    referencia: 'PAGO-USD-' + tag, idempotency_key: randomUUID() };
  const payment = (await request(`finanzas/cxp/${invoice.id}/aplicar-pago`, paymentIntent)).data;
  assert.equal(payment.cxp.estado, 'PAGADA');
  assert.equal(Number(payment.cxp.saldo), 0);
  assert.equal((await request(`finanzas/cxp/${invoice.id}/aplicar-pago`, paymentIntent)).data.idempotent, true);
  const bankAfter = Number((await request(`finanzas/bancos/cuentas/${bank.id}`)).data.saldo);
  assert.equal(Math.round((bankBefore - bankAfter) * 100), 2360);
  const paymentEvent = sql(`SELECT event_id FROM outbox_events WHERE tenant_id=${uuid(tenantId)} AND idempotency_key=${uuid(paymentIntent.idempotency_key)}::text;`);
  processAccounting('accounting-usd-chain-payment');
  assert.equal(sql(`SELECT count(*) FROM asientos_contables WHERE tenant_id=${uuid(tenantId)} AND source_event_id=${uuid(paymentEvent)} AND estado='CONFIRMADO' AND total_debe=total_haber;`), '1');
  // La cuenta 42 del proveedor queda en cero en soles: lo abonado al facturar se
  // cancela con el pago (la diferencia de cambio va a su propia cuenta).
  const supplierBook = sql(`SELECT coalesce(sum(d.haber-d.debe),0)::numeric(14,2)::text FROM detalle_asientos d JOIN asientos_contables a ON a.id=d.asiento_id JOIN plan_cuentas p ON p.id=d.cuenta_id
    WHERE a.tenant_id=${uuid(tenantId)} AND a.estado='CONFIRMADO' AND a.source_event_id IN (${uuid(invoice.event_id)},${uuid(paymentEvent)}) AND p.codigo LIKE '42%';`);
  assert.equal(supplierBook, '0.00');
  pass('USD: pago total desde banco en dólares cancela deuda, descuenta USD 23.60 y deja la cuenta 42 en cero', { payment_event: paymentEvent });
}
