import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Importación de maestros por la API local; incluye filas válidas e inválidas.
// El runner exige una base efímera y bloquea destinos remotos.
export async function testMigrationImport({ request, sql, uuid, results, tenantId, otherTenantToken }) {
  const suffix = randomUUID().slice(0, 8);
  const masterExternalIds = {};
  for (const kind of ['clientes', 'proveedores']) {
    const externalId = `LOCAL-${kind}-${suffix}`;
    masterExternalIds[kind] = externalId;
    const document = kind === 'clientes' ? '76543210' : '20123456786';
    const documentType = kind === 'clientes' ? 'DNI' : 'RUC';
    const header = 'external_id,tipo,tipo_documento,numero_documento,razon_social,email';
    const name = `MAESTRO LOCAL ${kind.toUpperCase()} ${suffix}`;
    const valid = `${externalId},EMPRESA,${documentType},${document},${name},import-local@example.test`;
    const invalid = `INVALID-${suffix},EMPRESA,${documentType},${document},FILA ERRONEA,no-es-email`;
    const csv = `${header}\n${valid}\n${invalid}\n`;
    const fileBase64 = Buffer.from(csv, 'utf8').toString('base64');
    const table = kind;
    const before = sql(`SELECT count(*) FROM ${table} WHERE tenant_id=${uuid(tenantId)} AND razon_social='${name}';`);
    const preview = await request('migration/preview', { runType: kind, fileBase64 });
    assert.equal(preview.success, false);
    assert.ok(preview.errors.some(error => error.rowIndex === 3 && error.field === 'email'));
    const dry = await request(`migration/${kind}/import`, { fileBase64, dryRun: true });
    assert.equal(dry.status, 'dry_run');
    assert.equal(dry.runId, null);
    assert.equal(dry.result.okRows, 1);
    assert.equal(dry.result.errorRows, 1);
    assert.equal(sql(`SELECT count(*) FROM ${table} WHERE tenant_id=${uuid(tenantId)} AND razon_social='${name}';`), before);
    const imported = await request(`migration/${kind}/import`, { fileBase64, filename: `${kind}-local.csv` });
    assert.equal(imported.status, 'partial');
    assert.equal(imported.result.created, 1);
    assert.equal(imported.result.errorRows, 1);
    assert.ok(imported.runId);
    assert.equal(Number(sql(`SELECT count(*) FROM ${table} WHERE tenant_id=${uuid(tenantId)} AND razon_social='${name}';`)), Number(before) + 1);
    const detail = await request(`migration/runs/${imported.runId}`);
    assert.equal(detail.run.id, imported.runId);
    assert.equal(detail.run.status, 'partial');
    assert.ok(detail.rows.some(row => row.external_id === externalId && row.status === 'ok'));
    assert.ok(detail.rows.some(row => row.row_index === 3 && row.status === 'error'));
    const listed = await request(`migration/runs?runType=${kind}`);
    assert.ok(listed.some(row => row.id === imported.runId));
    const replay = await request(`migration/${kind}/import`, { fileBase64, filename: `${kind}-retry.csv` });
    assert.equal(replay.result.created, 0);
    assert.equal(replay.result.skippedRows, 1);
    assert.equal(sql(`SELECT count(*) FROM ${table} WHERE tenant_id=${uuid(tenantId)} AND razon_social='${name}';`), String(Number(before) + 1));
    const masterId = sql(`SELECT id FROM ${table} WHERE tenant_id=${uuid(tenantId)} AND external_id='${externalId}';`);
    uuid(masterId);
    const masterPath = kind === 'clientes' ? 'ventas/clientes' : 'compras/proveedores';
    const newName = `${name} EDITADO`;
    const priorResponse = await request(`${masterPath}/${masterId}`);
    assert.equal((priorResponse.data ?? priorResponse).razon_social, name);
    await request(`${masterPath}/${masterId}`, { razon_social: newName, email: 'invalido' }, 400, {}, 'PUT');
    assert.equal(sql(`SELECT razon_social FROM ${table} WHERE id=${uuid(masterId)} AND tenant_id=${uuid(tenantId)};`), name);
    const updatedResponse = await request(`${masterPath}/${masterId}`, {
      razon_social: newName, email: `editado-${suffix}@example.test`,
    }, 200, {}, 'PUT');
    assert.equal((updatedResponse.data ?? updatedResponse).razon_social, newName);
    assert.equal(sql(`SELECT razon_social FROM ${table} WHERE id=${uuid(masterId)} AND tenant_id=${uuid(tenantId)};`), newName);
    const searchResponse = await request(`${masterPath}?search=${encodeURIComponent(newName)}`);
    assert.ok(searchResponse.data.some(row => row.id === masterId));
    await request(`${masterPath}/${masterId}`, undefined, 404,
      { authorization: `Bearer ${otherTenantToken}` });
    await request(`${masterPath}/${masterId}`, { razon_social: 'CAMBIO AJENO' }, 404,
      { authorization: `Bearer ${otherTenantToken}` }, 'PUT');
    assert.equal(sql(`SELECT razon_social FROM ${table} WHERE id=${uuid(masterId)} AND tenant_id=${uuid(tenantId)};`), newName);
    await request(`migration/runs/${imported.runId}`, undefined, 404,
      { authorization: `Bearer ${otherTenantToken}` });
    results.push({ scenario: `${kind}: previsualización, dry-run, importación parcial, bitácora, reintento y aislamiento`, passed: true,
      run_id: imported.runId });
    results.push({ scenario: `${kind}: edición validada y persistida, búsqueda por nombre nuevo y lectura/escritura ajenas rechazadas`,
      passed: true, master_id: masterId });
  }
  const fechaCorte = sql(`SELECT app.hoy_tenant(${uuid(tenantId)})::text;`);
  for (const item of [
    { kind: 'cxc', runType: 'cxc_abiertas', table: 'cuentas_por_cobrar', master: 'clientes', reference: 'external_id_cliente' },
    { kind: 'cxp', runType: 'cxp_abiertas', table: 'cuentas_por_pagar', master: 'proveedores', reference: 'external_id_proveedor' },
  ]) {
    const externalId = `APERTURA-${item.kind}-${suffix}`;
    const header = `external_id,${item.reference},tipo_documento,serie,numero,fecha_emision,fecha_vencimiento,moneda,monto_total,saldo_pendiente`;
    const line = (id, reference) => `${id},${reference},FACTURA,F001,${suffix},2025-01-01,2025-02-01,PEN,118.00,59.00`;
    const csv = `${header}\n${line(externalId, masterExternalIds[item.master])}\n${line(`AUSENTE-${suffix}`, `NO-EXISTE-${suffix}`)}\n`;
    const fileBase64 = Buffer.from(csv).toString('base64');
    const before = sql(`SELECT count(*) FROM ${item.table} WHERE tenant_id=${uuid(tenantId)} AND external_id='${externalId}';`);
    const dry = await request(`migration/${item.kind}/import`, { fileBase64, fechaCorte, dryRun: true });
    assert.equal(dry.status, 'dry_run');
    assert.equal(dry.result.okRows, 1);
    assert.equal(dry.result.errorRows, 1);
    assert.equal(sql(`SELECT count(*) FROM ${item.table} WHERE tenant_id=${uuid(tenantId)} AND external_id='${externalId}';`), before);
    const imported = await request(`migration/${item.kind}/import`, { fileBase64, fechaCorte, totalDeclarado: 59 });
    assert.equal(imported.status, 'partial');
    assert.equal(imported.result.created, 1);
    assert.equal(imported.result.errorRows, 1);
    assert.equal(sql(`SELECT count(*) FROM ${item.table} WHERE tenant_id=${uuid(tenantId)} AND external_id='${externalId}';`), String(Number(before) + 1));
    assert.equal(Number(sql(`SELECT saldo_pendiente FROM ${item.table} WHERE tenant_id=${uuid(tenantId)} AND external_id='${externalId}';`)), 59);
    const detail = await request(`migration/runs/${imported.runId}`);
    assert.equal(detail.run.status, 'partial');
    assert.equal(Number(detail.run.metadata.total_declarado), 59);
    assert.equal(Number(detail.run.metadata.total_real_importado), 59);
    assert.ok(detail.rows.some(row => row.external_id === externalId && row.status === 'ok'));
    assert.ok(detail.rows.some(row => row.external_id === `AUSENTE-${suffix}` && row.status === 'error'));
    const replay = await request(`migration/${item.kind}/import`, { fileBase64, fechaCorte });
    assert.equal(replay.result.created, 0);
    assert.equal(replay.result.skippedRows, 1);
    const changedBase64 = Buffer.from(csv.replace('PEN,118.00,59.00', 'PEN,118.00,60.00')).toString('base64');
    const collision = await request(`migration/${item.kind}/import`, { fileBase64: changedBase64, fechaCorte });
    assert.equal(collision.status, 'failed');
    assert.equal(collision.result.created, 0);
    assert.ok(collision.result.errors.some(error => /IDEMPOTENCY_COLLISION/.test(error.message)));
    assert.equal(Number(sql(`SELECT saldo_pendiente FROM ${item.table} WHERE tenant_id=${uuid(tenantId)} AND external_id='${externalId}';`)), 59);
    await request(`migration/runs/${imported.runId}`, undefined, 404,
      { authorization: `Bearer ${otherTenantToken}` });
    results.push({ scenario: `${item.runType}: dry-run detecta referencia ajena, saldo parcial persiste, bitácora y reintento aislados`,
      passed: true, run_id: imported.runId });
  }
  const sucursal = (await request('sucursales', { nombre: `Sucursal apertura ${suffix}`,
    codigo: `AP-${suffix}`, direccion: 'Av. Local 123', ubigeo: '150101' })).data;
  const almacen = (await request('inventario/almacenes', { idempotency_key: randomUUID(),
    codigo: `AL-${suffix}`, nombre: `Almacén apertura ${suffix}`, es_principal: true })).data;
  const sucursalId = sucursal.id;
  const almacenId = almacen.id;
  assert.ok(sucursalId && almacenId, 'primer cliente puede crear sucursal y almacén para stock inicial');
  const categoryName = `Categoría apertura ${suffix}`;
  await request('inventario/categorias', { idempotency_key: randomUUID(), codigo: `AP-${suffix}`,
    nombre: categoryName });
  const productCode = `APERTURA-${suffix}`.toUpperCase();
  const product = (await request('inventario/productos', { idempotency_key: randomUUID(), codigo: productCode,
    nombre: `Producto apertura ${suffix}`, categoria: categoryName, unidad_medida: 'NIU',
    precio_compra: 8, precio_venta: 12, controla_stock: true })).data;
  assert.ok(product.id);
  assert.equal(sql(`SELECT external_id IS NULL FROM productos WHERE id=${uuid(product.id)} AND tenant_id=${uuid(tenantId)};`), 't');
  const stockHeader = 'external_id_producto,sucursal_id,almacen_id,cantidad,costo_unitario';
  const stockCsv = `${stockHeader}\n${productCode},${sucursalId},${almacenId},7,8.50\nAJENO-${suffix},${sucursalId},${almacenId},3,8.50\n`;
  const stockBase64 = Buffer.from(stockCsv).toString('base64');
  const beforeStock = Number(sql(`SELECT COALESCE(stock_actual,0) FROM producto_existencias WHERE tenant_id=${uuid(tenantId)} AND producto_id=${uuid(product.id)} AND almacen_id=${uuid(almacenId)};`) || 0);
  const dryStock = await request('migration/stock-inicial/import', { fileBase64: stockBase64, fechaCorte, dryRun: true });
  assert.equal(dryStock.result.okRows, 1);
  assert.equal(dryStock.result.errorRows, 1);
  assert.equal(dryStock.result.errors[0].externalId, `AJENO-${suffix}`);
  assert.equal(Number(sql(`SELECT COALESCE(stock_actual,0) FROM producto_existencias WHERE tenant_id=${uuid(tenantId)} AND producto_id=${uuid(product.id)} AND almacen_id=${uuid(almacenId)};`) || 0), beforeStock);
  const stockImport = await request('migration/stock-inicial/import', { fileBase64: stockBase64, fechaCorte });
  assert.equal(stockImport.status, 'partial');
  assert.equal(stockImport.result.created, 1);
  assert.equal(Number(sql(`SELECT stock_actual FROM producto_existencias WHERE tenant_id=${uuid(tenantId)} AND producto_id=${uuid(product.id)} AND almacen_id=${uuid(almacenId)};`)), beforeStock + 7);
  const stockReplay = await request('migration/stock-inicial/import', { fileBase64: stockBase64, fechaCorte });
  assert.equal(stockReplay.result.skippedRows, 1);
  assert.equal(Number(sql(`SELECT stock_actual FROM producto_existencias WHERE tenant_id=${uuid(tenantId)} AND producto_id=${uuid(product.id)} AND almacen_id=${uuid(almacenId)};`)), beforeStock + 7);
  await request(`migration/runs/${stockImport.runId}`, undefined, 404,
    { authorization: `Bearer ${otherTenantToken}` });
  results.push({ scenario: 'stock inicial acepta código del producto creado por UI/API, dry-run detecta ajeno y reintento no duplica',
    passed: true, run_id: stockImport.runId });
  const accountCodes = sql(`SELECT string_agg(codigo,',' ORDER BY codigo) FROM (SELECT codigo FROM plan_cuentas WHERE tenant_id=${uuid(tenantId)} AND activo AND acepta_movimiento ORDER BY codigo LIMIT 2) accounts;`).split(',');
  assert.equal(accountCodes.length, 2, 'primer cliente debe tener dos cuentas de movimiento');
  const balanceCsv = `cuenta_contable_codigo,debe,haber,descripcion\n${accountCodes[0]},100,0,Apertura local\n${accountCodes[1]},0,100,Contrapartida local\n`;
  const balanceBase64 = Buffer.from(balanceCsv).toString('base64');
  const unbalanced = await request('migration/balance-apertura/import', {
    fileBase64: Buffer.from(balanceCsv.replace(',0,100,', ',0,99,')).toString('base64'), fechaCorte, dryRun: true });
  assert.equal(unbalanced.result.okRows, 0);
  assert.ok(unbalanced.result.errors.some(error => /no cuadra/.test(error.message)));
  const dryBalance = await request('migration/balance-apertura/import', { fileBase64: balanceBase64, fechaCorte, dryRun: true });
  assert.equal(dryBalance.result.okRows, 2);
  const beforeBalance = sql(`SELECT count(*) FROM asientos_contables WHERE tenant_id=${uuid(tenantId)} AND external_id='APERTURA-${fechaCorte}';`);
  assert.equal(beforeBalance, '0');
  const balance = await request('migration/balance-apertura/import', { fileBase64: balanceBase64, fechaCorte });
  assert.equal(balance.status, 'completed');
  assert.equal(balance.result.created, 1);
  assert.equal(sql(`SELECT count(*) FROM asientos_contables WHERE tenant_id=${uuid(tenantId)} AND external_id='APERTURA-${fechaCorte}' AND total_debe=total_haber AND total_debe=100;`), '1');
  const balanceReplay = await request('migration/balance-apertura/import', { fileBase64: balanceBase64, fechaCorte });
  assert.equal(balanceReplay.result.skippedRows, 2);
  const openingChecks = await request(`migration/validar-apertura?fechaCorte=${fechaCorte}`);
  assert.equal(openingChecks.checks.find(check => check.check_name === 'CHK_001_balance_apertura_cuadrado')?.status, 'OK');
  await request(`migration/runs/${balance.runId}`, undefined, 404,
    { authorization: `Bearer ${otherTenantToken}` });
  results.push({ scenario: 'balance de apertura valida cuadre, persiste asiento cuadrado y reintenta sin duplicar',
    passed: true, run_id: balance.runId });
  const cpeExternalId = `HIST-CPE-${suffix}`;
  const fiscalNumber = String(Number.parseInt(suffix, 16) % 100_000_000 || 1);
  const cpeHeader = 'external_id,tipo_documento,serie,numero,fecha_emision,external_id_cliente,moneda,subtotal,igv,total';
  const cpeLine = (externalId, clientExternalId) => `${externalId},FACTURA,F001,${fiscalNumber},2025-01-01,${clientExternalId},PEN,100,18,118`;
  const cpeCsv = `${cpeHeader}\n${cpeLine(cpeExternalId, masterExternalIds.clientes)}\n${cpeLine(`AJENO-${suffix}`, `NO-CLIENTE-${suffix}`)}\n`;
  const cpeBase64 = Buffer.from(cpeCsv).toString('base64');
  const dryCpe = await request('migration/comprobantes/import', { fileBase64: cpeBase64, dryRun: true });
  assert.equal(dryCpe.result.okRows, 1);
  assert.equal(dryCpe.result.errorRows, 1);
  assert.equal(sql(`SELECT count(*) FROM cpe WHERE tenant_id=${uuid(tenantId)} AND metadata->>'external_id'='${cpeExternalId}';`), '0');
  const historical = await request('migration/comprobantes/import', { fileBase64: cpeBase64 });
  assert.equal(historical.status, 'partial');
  assert.equal(historical.result.created, 1);
  assert.equal(sql(`SELECT count(*) FROM cpe WHERE tenant_id=${uuid(tenantId)} AND metadata->>'external_id'='${cpeExternalId}' AND estado='MIGRADO' AND metadata->>'no_sunat'='true';`), '1');
  assert.equal(sql(`SELECT count(*) FROM outbox_events WHERE tenant_id=${uuid(tenantId)} AND event_type='factura.emitida' AND aggregate_id IN (SELECT id::text FROM cpe WHERE tenant_id=${uuid(tenantId)} AND metadata->>'external_id'='${cpeExternalId}');`), '0');
  const historicalReplay = await request('migration/comprobantes/import', { fileBase64: cpeBase64 });
  assert.equal(historicalReplay.result.skippedRows, 1);
  await request(`migration/runs/${historical.runId}`, undefined, 404,
    { authorization: `Bearer ${otherTenantToken}` });
  results.push({ scenario: 'CPE histórico local valida cliente, persiste sólo lectura sin SUNAT/outbox y reintenta aislado',
    passed: true, run_id: historical.runId });
  await request('migration/preview', { runType: 'clientes', fileBase64: 'base64-malformado' }, 400);
  results.push({ scenario: 'importación rechaza base64 inválido antes de crear registros', passed: true });
}
