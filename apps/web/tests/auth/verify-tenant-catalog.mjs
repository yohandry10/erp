import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../../lib/tenant-catalog.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
vm.runInNewContext(compiled, { module, exports: module.exports, Error, Map, Number });
const { loadTenantCatalog } = module.exports;
const rows = Array.from({ length: 73 }, (_, i) => ({ id: `empresa-${i}`, nombre: `Empresa ${i}` }));
const requests = [];
const all = await loadTenantCatalog(async endpoint => {
  requests.push(endpoint);
  const page = Number(new URL(endpoint, 'http://localhost').searchParams.get('page'));
  return { success: true, data: rows.slice((page - 1) * 50, page * 50), pagination: { page, total: 73, totalPages: 2 } };
});
assert.equal(all.length, 73);
assert.equal(all[72].id, 'empresa-72');
assert.equal(requests.length, 2);
await assert.rejects(loadTenantCatalog(async endpoint => endpoint.includes('page=1')
  ? { data: rows.slice(0, 50), pagination: { total: 73, totalPages: 2 } }
  : { success: false, message: 'Segunda página no disponible' }), /Segunda página no disponible/);
await assert.rejects(loadTenantCatalog(async () => ({ data: rows.slice(0, 50), pagination: { total: 73, totalPages: 2 } })), /cambió/);
await assert.rejects(loadTenantCatalog(async () => ({ data: rows.slice(0, 50), pagination: { total: 73, totalPages: 1 } })), /incompleto/);
assert.equal((await loadTenantCatalog(async () => ({ data: [], pagination: { total: 0, totalPages: 0 } }))).length, 0);
console.log('PASS: catálogo completo de 73 empresas, fallo parcial, duplicados, truncamiento y catálogo vacío');
