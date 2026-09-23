import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';

// Generación y descarga locales. La empresa de prueba es demo y el transporte
// SUNAT debe permanecer inaccesible; las escrituras sólo usan la API efímera.
export async function testSire({ request, sql, uuid, results, tenantId, otherTenantToken }) {
  const period = sql(`SELECT left(app.hoy_tenant(${uuid(tenantId)})::text,7);`);
  for (const type of ['REGISTRO_VENTAS', 'REGISTRO_COMPRAS']) {
    const intent = { tipoReporte: type, periodo: period, formato: 'TXT' };
    const headers = { 'idempotency-key': randomUUID() };
    const created = await request('sire/generar-reporte', intent, 201, headers);
    assert.equal(created.success, true);
    assert.ok(created.data?.id);
    assert.equal(created.data.estado, 'GENERADO');
    const replay = await request('sire/generar-reporte', intent, 201, headers);
    assert.equal(replay.data.id, created.data.id);
    assert.equal(replay.data.idempotent, true);
    const report = await request(`sire/reportes/${created.data.id}/download`);
    assert.equal(report.success, true);
    assert.equal(report.filename, created.data.filename);
    assert.equal(createHash('sha256').update(report.data, 'utf8').digest('hex'), report.metadata.sha256);
    const listed = await request(`sire/reportes?periodo=${period}&tipoReporte=${type}`);
    assert.ok(listed.data.some(row => row.id === created.data.id));
    await request(`sire/reportes/${created.data.id}/download`, undefined, 404,
      { authorization: `Bearer ${otherTenantToken}` });
    await request(`sire/reportes/${created.data.id}/enviar-sunat`, {}, 400,
      { 'idempotency-key': randomUUID() });
    assert.equal(sql(`SELECT count(*) FROM sire_operaciones WHERE tenant_id=${uuid(tenantId)} AND reporte_id=${uuid(created.data.id)};`), '0');
    results.push({ scenario: `SIRE ${type}: instantánea local, hash, reintento, lista, aislamiento y envío demo bloqueado`, passed: true,
      report_id: created.data.id });
  }
  const stats = await request('sire/stats');
  assert.equal(stats.success, true);
  assert.ok(stats.data.reportesDelMes >= 2);
  await request('sire/generar-reporte', { tipoReporte: 'REGISTRO_VENTAS', periodo: '2026-13' }, 400,
    { 'idempotency-key': randomUUID() });
  results.push({ scenario: 'SIRE estadísticas y período inválido', passed: true });
}
