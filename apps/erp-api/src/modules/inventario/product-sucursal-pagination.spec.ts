import { InventarioController } from './inventario.controller';
import { readProductSucursalSources } from './product-sucursal-read';
const tenant = 'tenant-a', foreign = 'tenant-b';
const product = (n = 1) => ({ id: `product-${n}`, tenant_id: tenant, nombre: 'Producto', activo: true, es_servicio: false, controla_stock: true });
const price = (n = 1, p = 'product-1') => ({ id: `price-${n}`, tenant_id: tenant, producto_id: p, sucursal_id: `branch-${n}`, sucursal_scope: { id: `branch-${n}`, tenant_id: tenant }, activo: true, moneda: 'PEN', precio: 0 });
const stock = (n = 1, p = 'product-1') => ({ id: `stock-${n}`, tenant_id: tenant, producto_id: p, sucursal_id: `branch-${n}`, sucursal_scope: { id: `branch-${n}`, tenant_id: tenant }, almacen_id: `warehouse-${n}`, almacen_scope: { id: `warehouse-${n}`, tenant_id: tenant }, activo: true, stock: -0.25, stock_actual: -0.25, reservado: 0, minimo: 0 });
const tables = ['producto_precios_sucursal', 'producto_stock_sucursal'];
function harness(rows: Record<string, any[]> = {}, mutate?: (table: string, result: any, call: any) => any) {
  const calls: any[] = [], rpc = jest.fn(() => { throw new Error('Read cannot call RPC'); });
  const client = { rpc, from: (table: string) => {
    const c: any = { table, filters: [], range: [0, 999], orders: [] }; calls.push(c);
    const result = () => {
      const all = (rows[table] || []).filter(r => c.filters.every(([kind, key, value]) => kind === 'in' ? value.includes(r[key]) : r[key] === value));
      const v = { data: table === 'productos' && c.single ? all[0] ?? null : all.slice(c.range[0], c.range[1] + 1), error: null, count: all.length };
      return mutate ? mutate(table, v, c) : v;
    };
    const q: any = { select: (s, options) => { c.selection = s; c.options = options; return q; }, eq: (k, v) => { c.filters.push(['eq', k, v]); return q; }, in: (k, v) => { c.filters.push(['in', k, v]); return q; }, order: (k, v) => { c.orders.push([k, v]); return q; }, range: (a, b) => { c.range = [a, b]; return q; }, maybeSingle: () => { c.single = true; return Promise.resolve(result()); }, then: (resolve, reject) => Promise.resolve().then(result).then(resolve, reject) };
    return q;
  } };
  const controller = Object.assign(Object.create(InventarioController.prototype), { supabase: { getClient: () => client }, logger: { log: jest.fn(), error: jest.fn() } }) as InventarioController;
  return { client, controller, calls, rpc };
}
async function read(mode: string, h: ReturnType<typeof harness>) {
  return mode === 'list' ? h.controller.getProductos(tenant, { includeSucursal: true }) : h.controller.getProducto(tenant, 'product-1', { includeSucursal: true });
}
async function fails(mode: string, h: ReturnType<typeof harness>) {
  await expect(read(mode, h)).rejects.toMatchObject({ status: 503 });
  expect(h.rpc).not.toHaveBeenCalled();
}
describe.each(['list', 'detail'])('Catálogo enriquecido %s íntegro y scoped', mode => {
  it.each(tables)('%s incluye fila1001 sin writer, alcance y conteo en cada página', async table => {
    const factory = table === tables[0] ? price : stock, h = harness({ productos: [product()], [table]: Array.from({ length: 1001 }, (_, i) => factory(i + 1)) });
    const v: any = await read(mode, h), p = mode === 'list' ? v.data[0] : v.data;
    expect(v.complete).toBe(true); expect(v.tenant_id).toBe(tenant); expect(v.fuentes_sucursal.completas).toBe(true);
    expect(p[table === tables[0] ? 'precios_sucursal' : 'stock_sucursal']).toHaveLength(1001);
    const calls = h.calls.filter(c => c.table === table); expect(calls.map(c => c.range)).toEqual([[0, 999], [1000, 1999]]);
    for (const c of calls) { expect(c.filters).toContainEqual(['eq', 'tenant_id', tenant]); expect(c.filters).toContainEqual(['in', 'producto_id', ['product-1']]); expect(c.options.count).toBe('exact'); expect(c.orders).toContainEqual(['id', { ascending: true }]); }
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it('ausencia confirmada cuenta0, precios cero, negativos e inactivos se conservan', async () => {
    const h = harness({ productos: [product()], [tables[0]]: [{ ...price(), activo: false }], [tables[1]]: [stock()] });
    const v: any = await read(mode, h), p = mode === 'list' ? v.data[0] : v.data;
    expect(p.precios_sucursal[0].precio).toBe(0); expect(p.precios_sucursal[0].activo).toBe(false); expect(p.stock_sucursal[0].stock).toBe(-0.25);
    expect(p.stock_sucursal[0]).not.toHaveProperty('almacen_scope'); expect(p.precios_sucursal[0]).not.toHaveProperty('sucursal_scope');
    const empty: any = await read(mode, harness({ productos: [product()] })); expect(empty.fuentes_sucursal).toEqual({ completas: true, precios_total: 0, stock_total: 0 });
  });
  it('referencias NULL conocidas permitidas por esquema conservan fuente global', async () => {
    const h = harness({ productos: [product()], [tables[0]]: [{ ...price(), sucursal_id: null, sucursal_scope: null }], [tables[1]]: [{ ...stock(), sucursal_id: null, sucursal_scope: null, almacen_id: null, almacen_scope: null }] });
    const v: any = await read(mode, h); expect(v.complete).toBe(true); expect(v.fuentes_sucursal.precios_total).toBe(1);
  });
  it.each(tables)('%s fallo/truncado/count desconocido/duplicado no afirma éxito parcial', async table => {
    for (const bad of [null, { data: null, count: 0, error: null }, { data: [], count: null, error: null }, { data: [], count: 1, error: null }, { data: null, error: { message: 'private_database_detail' } }, new Error('private_transport_detail')]) {
      await fails(mode, harness({ productos: [product()] }, (t, r) => { if (t !== table) return r; if (bad instanceof Error) throw bad; return bad; }));
    }
    const factory = table === tables[0] ? price : stock;
    await fails(mode, harness({ productos: [product()], [table]: [factory(), factory()] }));
  });
  it.each(tables)('%s segunda página fallida o count cambiante retira parcial', async table => {
    const factory = table === tables[0] ? price : stock, rows = Array.from({ length: 1001 }, (_, i) => factory(i + 1));
    for (const kind of ['error', 'count']) await fails(mode, harness({ productos: [product()], [table]: rows }, (t, r, c) => t === table && c.range[0] > 0 ? kind === 'count' ? { ...r, count: 1002 } : { data: null, error: { message: 'private_late_page' } } : r));
  });
  it.each(tables)('%s scope de fila/sucursal desconocido/ajeno no se filtra silenciosamente', async table => {
    const original = table === tables[0] ? price() : stock();
    for (const bad of [{ ...original, tenant_id: foreign }, { ...original, producto_id: 'foreign-product' }, { ...original, sucursal_scope: null }, { ...original, sucursal_scope: { id: original.sucursal_id, tenant_id: foreign } }, { ...original, sucursal_scope: { id: 'wrong-id', tenant_id: tenant } }, { ...original, activo: null }]) {
      await fails(mode, harness({ productos: [product()] }, (t, r) => t === table ? { ...r, data: [bad], count: 1 } : r));
    }
  });
  it('precios desconocidos, fracciones fuera del esquema o duplicidad de clave no inventan importe', async () => {
    for (const field of [{ precio: null }, { precio: '1' }, { precio: NaN }, { precio: Infinity }, { precio: -1 }, { precio: 0.001 }, { precio: Number.MAX_SAFE_INTEGER }, { moneda: '' }, { moneda: null }]) await fails(mode, harness({ productos: [product()], [tables[0]]: [{ ...price(), ...field }] }));
    await fails(mode, harness({ productos: [product()], [tables[0]]: [price(), { ...price(), id: 'distinct-id' }] }));
  });
  it('stock/referencia almacén/reserva desconocidos no confirman existencias', async () => {
    for (const field of [{ stock: null }, { stock_actual: null }, { reservado: null }, { minimo: null }, { stock: '0' }, { stock: 0.001 }, { reservado: -1 }, { minimo: -1 }, { almacen_scope: null }, { almacen_scope: { id: stock().almacen_id, tenant_id: foreign } }]) await fails(mode, harness({ productos: [product()], [tables[1]]: [{ ...stock(), ...field }] }));
    await fails(mode, harness({ productos: [product()], [tables[1]]: [stock(), { ...stock(), id: 'distinct-id' }] }));
  });
});
describe('Lotes de IDs acotados sin perder fuentes', () => {
  it('101 productos distribuyen fuentes correctamente; URLs no incluyen1001 IDs', async () => {
    const products = Array.from({ length: 101 }, (_, i) => product(i + 1)), h = harness({ [tables[0]]: [price(1), price(2, 'product-101')], [tables[1]]: [stock(1), stock(2, 'product-101')] });
    const v = await readProductSucursalSources(h.client, tenant, products); expect(v.data).toHaveLength(101); expect(v.data[100].precios_sucursal).toHaveLength(1); expect(v.sources).toEqual({ completas: true, precios_total: 2, stock_total: 2 });
    for (const table of tables) expect(h.calls.filter(c => c.table === table).map(c => c.filters.find(f => f[0] === 'in')[2].length)).toEqual([100, 1]);
  });
  it('ID duplicado entre lotes aun con producto propio de lote no es completo', async () => {
    const products = Array.from({ length: 101 }, (_, i) => product(i + 1)), h = harness({ [tables[0]]: [price(), { ...price(2, 'product-101'), id: price().id }] });
    await expect(readProductSucursalSources(h.client, tenant, products)).rejects.toMatchObject({ status: 503 });
  });
  it('producto ajeno, tenant desconocido o IDs repetidos falla antes de consultar', async () => {
    const h = harness(); for (const [scope, products] of [[tenant, [product(), product()]], ['', [product()]], [tenant, [{ ...product(), tenant_id: foreign }]]]) await expect(readProductSucursalSources(h.client, scope as string, products as any[])).rejects.toMatchObject({ status: 503 }); expect(h.calls).toHaveLength(0);
  });
  it('catálogo padre vacío confirma ausencia relevante sin consultar hijos', async () => {
    const h = harness(); expect(await readProductSucursalSources(h.client, tenant, [])).toEqual({ data: [], sources: { completas: true, precios_total: 0, stock_total: 0 } }); expect(h.calls).toHaveLength(0);
  });
});
