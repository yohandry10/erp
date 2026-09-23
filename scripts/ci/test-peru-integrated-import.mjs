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
    await request(`migration/runs/${imported.runId}`, undefined, 404,
      { authorization: `Bearer ${otherTenantToken}` });
    results.push({ scenario: `${kind}: previsualización, dry-run, importación parcial, bitácora, reintento y aislamiento`, passed: true,
      run_id: imported.runId });
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
  await request('migration/preview', { runType: 'clientes', fileBase64: 'base64-malformado' }, 400);
  results.push({ scenario: 'importación rechaza base64 inválido antes de crear registros', passed: true });
}
