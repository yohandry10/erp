import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const ts = createRequire(import.meta.url)('typescript');
const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../../lib/analytics-native-view.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module, exports: module.exports });
const { readAnalyticsPayload, selectAnalyticsCurrency, analyticsCsv, analyticsCurrencies } = module.exports;
const payload = porMoneda => ({ version: 2, base: 'IMPORTES_ORIGINALES_SIN_CONVERSION', porMoneda });
const ok = data => ({ status: 'fulfilled', value: { success: true, data } });
const sales = (moneda, total) => ({ moneda, labels: ['2026-11-06'], datasets: [{ data: [total] }], totales: { ventasActuales: total, ventasAnterior: 0, crecimiento: 'SIN DATOS' } });
const debt = (moneda, total) => ({ moneda, graficoEdadSaldos: { labels: ['Por vencer'], data: [total] }, totales: { totalPorCobrar: total, totalPorPagar: total, vencido: 0, porcentajeVencido: 0 } });
const data = {
  ventasTiempo: readAnalyticsPayload(ok(payload([sales('PEN', 179.8), sales('USD', 0.07)])), 'ventasTiempo'),
  deudasClientes: readAnalyticsPayload(ok(payload([debt('PEN', 20)])), 'deudasClientes'),
  deudasProveedores: readAnalyticsPayload(ok(payload([debt('USD', 0.07)])), 'deudasProveedores'),
  ventasCategoria: readAnalyticsPayload(ok(payload([{ moneda: 'USD', graficoPie: { labels: ['Servicio'], data: [0.07] } }])), 'ventasCategoria'),
  kpisVisuales: readAnalyticsPayload(ok({ version: 2, moneda: 'PEN', disponible: false, motivo: 'Requiere valuación común.' }), 'kpisVisuales'),
};
assert.equal(analyticsCurrencies(data).join(','), 'PEN,USD');
assert.equal(selectAnalyticsCurrency(data, 'PEN').ventasTiempo.totales.ventasActuales, 179.8);
assert.equal(selectAnalyticsCurrency(data, 'USD').ventasTiempo.totales.ventasActuales, 0.07);
assert.equal(selectAnalyticsCurrency(data, 'USD').deudasClientes.totales.totalPorCobrar, 0);
assert.equal(selectAnalyticsCurrency(data, 'PEN').deudasProveedores.totales.totalPorPagar, 0);
const usd = analyticsCsv(data, 'USD'), pen = analyticsCsv(data, 'PEN');
assert.ok(usd.includes('"ventas_actuales","0.07","USD"'));
assert.ok(pen.includes('"ventas_actuales","179.8","PEN"'));
assert.ok(!usd.includes('179.87') && !usd.includes('179.8'));
assert.ok(usd.includes('"liquidez","","USD","NO_DISPONIBLE"'));
assert.throws(() => analyticsCsv(data, 'EUR'));
assert.throws(() => analyticsCsv({ ...data, deudasClientes: null }, 'USD'));
for (const result of [{ status: 'rejected', reason: Error('offline') }, { status: 'fulfilled', value: { success: false, data: payload([]) } }, ok({ porMoneda: [] })]) {
  assert.throws(() => readAnalyticsPayload(result, 'ventasTiempo'));
}
for (const groups of [[sales('PEN', 1), sales('PEN', 2)], [sales('usd', 1)], [{ ...sales('PEN', 1), totales: {} }], [{ ...sales('PEN', 1), datasets: [{ data: [NaN] }] }]]) {
  assert.throws(() => readAnalyticsPayload(ok(payload(groups)), 'ventasTiempo'));
}
const unavailable = readAnalyticsPayload({ status: 'rejected', reason: Error('403') }, 'kpisVisuales');
assert.equal(unavailable.disponible, false);
assert.equal(unavailable.moneda, null);
assert.ok(analyticsCsv({ ...data, kpisVisuales: unavailable }, 'USD').includes('NO_DISPONIBLE'));
console.log('PASS Analytics nativo: monedas separadas, CSV con unidad, ausencia confirmada y fallo sin ceros fabricados.');
