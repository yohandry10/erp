import assert from 'node:assert/strict';

// Exportación tributaria desde los asientos y documentos del ensayo efímero.
// PVS SUNAT es una validación externa distinta que este recorrido no acredita.
export async function testPle({ request, sql, uuid, results, tenantId, otherTenantToken }) {
  const period = sql(`SELECT left(app.hoy_tenant(${uuid(tenantId)})::text,7);`);
  const [anio, mes] = period.split('-');
  const ruc = sql(`SELECT ruc FROM empresa_config WHERE tenant_id=${uuid(tenantId)};`);
  assert.match(ruc, /^\d{11}$/);
  const query = `anio=${anio}&mes=${Number(mes)}`;
  const all = await request(`contabilidad/ple/todos?${query}`);
  assert.equal(all.success, true, all.message);
  assert.equal(all.data.length, 5);
  const books = ['registro-ventas', 'registro-compras', 'libro-diario', 'libro-mayor', 'balance-comprobacion'];
  for (let index = 0; index < books.length; index++) {
    const response = await request(`contabilidad/ple/${books[index]}?${query}`);
    assert.equal(response.success, true, response.message);
    assert.equal(response.data.length, 1);
    const file = response.data[0];
    assert.match(file.filename, /^LE\d{11}/);
    assert.ok(file.filename.includes(ruc));
    assert.equal(file.content, all.data[index].content);
    if (books[index] === 'libro-diario') {
      const lines = file.content.split(/\r?\n/).filter(Boolean);
      assert.ok(lines.length > 0, 'Los asientos del ensayo deben entrar en el Diario');
      assert.ok(lines.every(line => line.split('|').length - 1 === 21));
      const debit = lines.reduce((sum, line) => sum + Number(line.split('|')[17]), 0);
      const credit = lines.reduce((sum, line) => sum + Number(line.split('|')[18]), 0);
      assert.equal(Math.round(debit * 100), Math.round(credit * 100));
    }
  }
  const other = await request(`contabilidad/ple/libro-diario?${query}`, undefined, 200,
    { authorization: `Bearer ${otherTenantToken}` });
  assert.equal(other.success, true, other.message);
  // Las demos pueden compartir RUC sintético; el contenido debe permanecer
  // segregado, pues sólo el primer tenant realizó estas operaciones.
  assert.notEqual(other.data[0].content, all.data[2].content);
  const invalid = await request('contabilidad/ple/libro-diario?anio=2026&mes=13');
  assert.equal(invalid.success, false);
  results.push({ scenario: 'PLE: cinco libros exportados, Diario cuadrado, aislamiento y período inválido', passed: true });
}
