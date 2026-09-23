import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Importación de maestros por la API local; incluye filas válidas e inválidas.
// El runner exige una base efímera y bloquea destinos remotos.
export async function testMigrationImport({ request, sql, uuid, results, tenantId, otherTenantToken }) {
  const suffix = randomUUID().slice(0, 8);
  for (const kind of ['clientes', 'proveedores']) {
    const externalId = `LOCAL-${kind}-${suffix}`;
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
  await request('migration/preview', { runType: 'clientes', fileBase64: 'base64-malformado' }, 400);
  results.push({ scenario: 'importación rechaza base64 inválido antes de crear registros', passed: true });
}
