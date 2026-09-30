import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Todas las mutaciones usan el API real; SQL sólo contrasta el ledger local.
export async function testPeruInventoryLifecycle({ request, sql, uuid, results, tenantId, otherTenantToken, processAccounting }) {
  const suffix = randomUUID().slice(0, 8);
  const intent = payload => ({ ...payload, idempotency_key: randomUUID() });
  const create = async (endpoint, payload) => {
    const body = intent(payload);
    const row = (await request(`inventario/${endpoint}`, body)).data;
    assert.ok(row.id);
    assert.equal((await request(`inventario/${endpoint}`, body)).data.id, row.id);
    return row;
  };
  const categoryName = `INVENTARIO CICLO ${suffix}`.toUpperCase();
  const category = await create('categorias', { codigo: `IC-${suffix}`, nombre: categoryName });
  const origin = await create('almacenes', { codigo: `OR-${suffix}`, nombre: `Origen ${suffix}` });
  const destination = await create('almacenes', { codigo: `DE-${suffix}`, nombre: `Destino ${suffix}` });
  const productBody = intent({ codigo: `IC-${suffix}`, nombre: `Producto ciclo ${suffix}`, categoria: categoryName,
    unidad_medida: 'NIU', precio_compra: 8, precio_venta: 12, controla_stock: true,
    almacen_id: origin.id, stock_inicial: 10, marca: 'Marca inicial' });
  const product = (await request('inventario/productos', productBody)).data;
  assert.ok(product.id);
  assert.equal((await request('inventario/productos', productBody)).data.id, product.id);
  const stock = id => Number(sql(`SELECT COALESCE(stock_actual,0) FROM producto_existencias
    WHERE tenant_id=${uuid(tenantId)} AND producto_id=${uuid(product.id)} AND almacen_id=${uuid(id)};`) || 0);
  const ledgerCount = () => Number(sql(`SELECT count(*) FROM movimientos_inventario WHERE tenant_id=${uuid(tenantId)} AND producto_id=${uuid(product.id)};`));
  assert.equal(stock(origin.id), 10);
  const countBefore = ledgerCount();
  await request('inventario/productos', intent({ ...productBody, codigo: productBody.codigo.toLowerCase() }), 400);
  await request(`inventario/productos/${product.id}`, intent({ precio_venta: -1 }), 400, {}, 'PUT');
  await request(`inventario/productos/${product.id}`, intent({ marca: 'Marca editada', precio_venta: 15 }), 200, {}, 'PUT');
  assert.equal((await request(`inventario/productos/${product.id}`)).data.marca, 'Marca editada');
  const renamed = `${categoryName} EDITADA`;
  await request(`inventario/categorias/${category.id}`, intent({ nombre: renamed }), 200, {}, 'PUT');
  assert.equal((await request(`inventario/productos/${product.id}`)).data.categoria, renamed);
  const filtered = await request(`inventario/productos?categoria=${encodeURIComponent(renamed)}`);
  assert.ok(filtered.data.some(row => row.id === product.id));
  assert.ok(filtered.data.every(row => row.tenant_id === tenantId && row.categoria === renamed));
  results.push({ scenario: 'inventario: altas repetidas conservan ID; producto editado y categoría renombrada persisten y filtran por tenant',
    passed: true, producto_id: product.id, almacen_origen_id: origin.id, almacen_destino_id: destination.id });

  const adjustment = intent({ producto_id: product.id, almacen_id: origin.id, delta: 2.25, motivo: 'Conteo físico local' });
  await request('inventario/movimientos', { ...adjustment, delta: 0 }, 400);
  await request('inventario/movimientos', intent({ ...adjustment, delta: -11 }), 400);
  assert.equal(stock(origin.id), 10);
  assert.equal(ledgerCount(), countBefore);
  const applied = (await request('inventario/movimientos', adjustment)).data;
  await request('inventario/movimientos', adjustment);
  assert.equal(stock(origin.id), 12.25);
  assert.equal(ledgerCount(), countBefore + 1);
  await request('inventario/movimientos', { ...adjustment, delta: 3 }, 400);
  assert.equal(stock(origin.id), 12.25);
  const transfer = intent({ producto_id: product.id, almacen_origen_id: origin.id, almacen_destino_id: destination.id,
    cantidad: 4.5, motivo: 'Traslado local de existencias' });
  await request('inventario/transferencias', intent({ ...transfer, almacen_destino_id: origin.id }), 400);
  await request('inventario/transferencias', intent({ ...transfer, cantidad: 50 }), 400);
  assert.equal(stock(origin.id), 12.25);
  assert.equal(stock(destination.id), 0);
  await request('inventario/transferencias', transfer);
  await request('inventario/transferencias', transfer);
  assert.equal(stock(origin.id), 7.75);
  assert.equal(stock(destination.id), 4.5);
  assert.equal(ledgerCount(), countBefore + 3);
  await request('inventario/transferencias', { ...transfer, cantidad: 3 }, 400);
  assert.equal(stock(origin.id) + stock(destination.id), 12.25);
  const kardex = await request(`inventario/kardex?productoId=${product.id}`);
  assert.equal(kardex.success, true);
  assert.equal(Number(kardex.resumen.saldoCantidad), 12.25);
  assert.ok(kardex.data.length >= 4);
  assert.ok(kardex.data.every(row => row.producto?.id === product.id));
  const destinationKardex = await request(`inventario/kardex?productoId=${product.id}&almacenId=${destination.id}`);
  assert.equal(Number(destinationKardex.resumen.saldoCantidad), 4.5);
  const foreignKardex = await request(`inventario/kardex?productoId=${product.id}`, undefined, 200,
    { authorization: `Bearer ${otherTenantToken}` });
  assert.deepEqual(foreignKardex.data, []);
  results.push({ scenario: 'inventario: ajuste decimal y transferencia real/replay conservan saldo, ledger y kardex; insuficiencia y clave reutilizada no mutan', passed: true });

  const deleteHeaders = () => ({ 'idempotency-key': randomUUID() });
  for (const endpoint of [`productos/${product.id}`, `categorias/${category.id}`, `almacenes/${origin.id}`, `almacenes/${destination.id}`]) {
    await request(`inventario/${endpoint}`, undefined, 400, deleteHeaders(), 'DELETE');
  }
  const emptyProduct = await create('productos', { codigo: `VAC-${suffix}`, nombre: `Producto vacío ${suffix}`,
    categoria: renamed, unidad_medida: 'NIU', controla_stock: true, precio_compra: 8, precio_venta: 12 });
  const deleteKey = deleteHeaders();
  await request(`inventario/productos/${emptyProduct.id}`, undefined, 200, deleteKey, 'DELETE');
  await request(`inventario/productos/${emptyProduct.id}`, undefined, 200, deleteKey, 'DELETE');
  assert.equal((await request(`inventario/productos/${emptyProduct.id}`)).data.activo, false);
  const inactive = await request('inventario/productos?estado=INACTIVO');
  assert.ok(inactive.data.some(row => row.id === emptyProduct.id));
  const emptyWarehouse = await create('almacenes', { codigo: `VAC-${suffix}`, nombre: `Almacén vacío ${suffix}` });
  const location = await create(`almacenes/${emptyWarehouse.id}/ubicaciones`, { codigo: 'BIN-1', nombre: 'Ubicación local', tipo: 'BIN' });
  await request(`inventario/almacenes/${emptyWarehouse.id}`, undefined, 400, deleteHeaders(), 'DELETE');
  await request(`inventario/almacenes/${emptyWarehouse.id}/ubicaciones/${location.id}`, undefined, 200, deleteHeaders(), 'DELETE');
  await request(`inventario/almacenes/${emptyWarehouse.id}`, undefined, 200, deleteHeaders(), 'DELETE');
  await request(`inventario/almacenes/${emptyWarehouse.id}`, intent({ activo: true, nombre: `Reactivado ${suffix}` }), 200, {}, 'PUT');
  assert.ok((await request('inventario/almacenes')).data.some(row => row.id === emptyWarehouse.id));
  assert.equal(stock(origin.id) + stock(destination.id), 12.25);
  results.push({ scenario: 'inventario: bajas con saldo/dependencias rechazan; producto vacío se desactiva con replay y almacén/ubicación permiten baja y reactivación', passed: true });
  const permissions = JSON.parse(sql(`SELECT jsonb_agg(id) FROM permisos WHERE tenant_id=${uuid(tenantId)} AND activo
    AND codigo IN ('inventario.productos.read','inventario.almacenes.read','inventario.kardex.read');`));
  assert.equal(permissions.length, 3);
  const role = await request('roles', intent({ nombre: `LECTURA_INVENTARIO_${suffix}`, permission_ids: permissions }));
  const email = `lector-inventario-${suffix}@example.test`;
  await request('users', intent({ nombre: 'Lector de inventario local', email, password: 'Lectura-Local-2026!', roles: [role.id] }));
  const login = await request('auth/login', { email, password: 'Lectura-Local-2026!' });
  const readHeaders = { authorization: `Bearer ${login.access_token}` };
  assert.equal((await request(`inventario/productos/${product.id}`, undefined, 200, readHeaders)).data.id, product.id);
  await request('inventario/movimientos', intent({ ...adjustment, delta: 1 }), 403, readHeaders);
  await request('inventario/transferencias', intent({ ...transfer, cantidad: 1 }), 403, readHeaders);
  await request(`inventario/productos/${product.id}`, intent({ nombre: 'NO AUTORIZADO' }), 403, readHeaders, 'PUT');
  await request(`inventario/productos/${product.id}`, undefined, 403, { ...readHeaders, ...deleteHeaders() }, 'DELETE');
  await request(`inventario/productos/${product.id}`, intent({ nombre: 'TENANT AJENO' }), 404,
    { authorization: `Bearer ${otherTenantToken}` }, 'PUT');
  await request('inventario/transferencias', intent({ ...transfer, cantidad: 1 }), 400,
    { authorization: `Bearer ${otherTenantToken}` });
  assert.equal(stock(origin.id) + stock(destination.id), 12.25);
  assert.equal(ledgerCount(), countBefore + 3);
  results.push({ scenario: 'inventario: rol de lectura no ajusta/transfiere/edita/desactiva; referencias ajenas rechazan sin mutar existencias', passed: true });
  assert.ok(applied.event_id);
  const shortageProduct = await create('productos', { codigo: `FAL-${suffix}`, nombre: `Faltante local ${suffix}`,
    categoria: renamed, unidad_medida: 'NIU', controla_stock: true, precio_compra: 8, precio_venta: 12,
    almacen_id: origin.id, stock_inicial: 5 });
  const shortageIntent = intent({ producto_id: shortageProduct.id, almacen_id: origin.id,
    delta: -1, motivo: 'Faltante de conteo local' });
  const shortage = (await request('inventario/movimientos', shortageIntent)).data;
  await request('inventario/movimientos', shortageIntent);
  assert.equal(Number(sql(`SELECT stock_actual FROM producto_existencias WHERE tenant_id=${uuid(tenantId)}
    AND producto_id=${uuid(shortageProduct.id)} AND almacen_id=${uuid(origin.id)};`)), 4);
  assert.equal(sql(`SELECT count(*) FROM outbox_events WHERE tenant_id=${uuid(tenantId)}
    AND event_id=${uuid(applied.event_id)} AND event_type='ajuste.inventario.aplicado';`), '1');
  processAccounting('accounting-inventory-adjustment');
  const entryQuery = `SELECT count(*) FROM asientos_contables WHERE tenant_id=${uuid(tenantId)}
    AND source_event_id=${uuid(applied.event_id)} AND estado='CONFIRMADO' AND total_debe=total_haber
    AND total_debe=18;`;
  assert.equal(sql(entryQuery), '1');
  const shortageQuery = `SELECT count(*) FROM asientos_contables WHERE tenant_id=${uuid(tenantId)}
    AND source_event_id=${uuid(shortage.event_id)} AND estado='CONFIRMADO' AND total_debe=total_haber AND total_debe=8;`;
  assert.equal(sql(shortageQuery), '1');
  const details = JSON.parse(sql(`SELECT jsonb_agg(jsonb_build_object('codigo',pc.codigo,'debe',da.debe,'haber',da.haber) ORDER BY pc.codigo)
    FROM detalle_asientos da JOIN plan_cuentas pc ON pc.id=da.cuenta_id
    JOIN asientos_contables ac ON ac.id=da.asiento_id WHERE ac.tenant_id=${uuid(tenantId)} AND ac.source_event_id=${uuid(shortage.event_id)};`));
  assert.deepEqual(details, [{ codigo: '20', debe: 0, haber: 8 }, { codigo: '68', debe: 8, haber: 0 }]);
  processAccounting('accounting-inventory-adjustment-replay');
  assert.equal(sql(entryQuery), '1');
  assert.equal(sql(shortageQuery), '1');
  results.push({ scenario: 'inventario: ajuste publica un evento y consume contabilidad real con un asiento cuadrado; reprocesar no duplica', passed: true });
  results.push({ scenario: 'inventario: faltante físico y replay conservan stock; cuenta 68 contra 20 produce un único asiento cuadrado', passed: true });
}
