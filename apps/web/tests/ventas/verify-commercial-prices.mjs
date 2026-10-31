import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(relative, dependencies = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(new URL(relative, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports, require: name => {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`); return dependencies[name];
  } });
  return module.exports;
}
const money = load('../../lib/format-utils.ts');
const { reviewCommercialPrices } = load('../../lib/ventas/commercial-prices.ts', { '@/lib/format-utils': money });
const lines = [{ producto_id: 'p1', cantidad: 2, precio_unitario: 40, subtotal: 80 }];
const response = { data: [{ producto_id: 'p1', cantidad: 2, precio_unitario: '31.000000' }] };
const review = reviewCommercialPrices(lines, response);
assert.equal(review.changed, true); assert.equal(review.lines[0].subtotal, 62);
assert.equal(lines[0].precio_unitario, 40, 'El formulario original se conserva hasta aplicar la revisión');
assert.equal(reviewCommercialPrices(review.lines, response).changed, false);
for (const broken of [null, [], { data: null }, { data: [{}] }, [{ producto_id: 'p1', cantidad: 2, precio_unitario: Infinity }],
  [{ producto_id: 'p2', cantidad: 2, precio_unitario: 31 }], [{ producto_id: 'p1', cantidad: 1, precio_unitario: 31 }],
  [{ producto_id: 'p1', cantidad: 2, precio_unitario: null }]]) {
  assert.throws(() => reviewCommercialPrices(lines, broken));
}
assert.throws(() => reviewCommercialPrices([...lines, ...lines], [...response.data, ...response.data]));
console.log('PASS: precio vigente, revisión previa, importes y respuesta incompleta/ajena/duplicada');
