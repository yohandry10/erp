import { InventarioController } from './inventario.controller';

describe('Lectura individual de producto', () => {
  const product = { id: 'product-a', tenant_id: 'tenant-a', nombre: 'Servicio' };
  type Result = { data: unknown; error: unknown; count?: number };
  function harness(overrides: Record<string, Result> = {}, extras = true) {
    const rows: Record<string, unknown[]> = {
      producto_precios_sucursal: extras ? [
        { id: 'price-a', producto_id: product.id, tenant_id: 'tenant-a', sucursal_id: null, sucursal_scope: null, moneda: 'PEN', precio: 3, activo: true },
        { id: 'price-b', producto_id: product.id, tenant_id: 'tenant-b', sucursal_id: null, sucursal_scope: null, moneda: 'PEN', precio: 99, activo: true },
      ] : [],
      producto_stock_sucursal: extras ? [
        { id: 'stock-a', producto_id: product.id, tenant_id: 'tenant-a', sucursal_id: null, sucursal_scope: null, almacen_id: null, almacen_scope: null, stock: 0, stock_actual: 0, reservado: 0, minimo: 0, activo: true },
        { id: 'stock-b', producto_id: product.id, tenant_id: 'tenant-b', sucursal_id: null, sucursal_scope: null, almacen_id: null, almacen_scope: null, stock: 99, stock_actual: 99, reservado: 0, minimo: 0, activo: true },
      ] : [],
    };
    const client = { from: (table: string) => {
      const filters: Record<string, unknown> = {};
      const result = (): Result => {
        if (overrides[table]) return overrides[table];
        if (table === 'productos') {
          return { data: filters.tenant_id === product.tenant_id && filters.id === product.id ? product : null, error: null };
        }
        const data = rows[table].filter((row: any) => Object.entries(filters).every(([key, value]) => Array.isArray(value) ? value.includes(row[key]) : row[key] === value));
        return { data, count: data.length, error: null };
      };
      const query: any = {
        select: () => query,
        eq: (key: string, value: unknown) => { filters[key] = value; return query; },
        in: (key: string, value: unknown) => { filters[key] = value; return query; },
        order: () => query,
        range: () => query,
        maybeSingle: async () => result(),
        then: (resolve: (value: Result) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject),
      };
      return query;
    } };
    return Object.assign(Object.create(InventarioController.prototype), {
      supabase: { getClient: () => client },
      logger: { log: jest.fn(), error: jest.fn() },
    }) as InventarioController;
  }

  it('devuelve el producto propio sin pedir fuentes opcionales', async () => {
    await expect(harness().getProducto('tenant-a', product.id, {})).resolves.toEqual({ success: true, data: product });
  });
  it('un ID ajeno es404, sin respuesta200 de error ni datos de otra empresa', async () => {
    await expect(harness().getProducto('tenant-b', product.id, {})).rejects.toMatchObject({ status: 404 });
  });
  it('una fuente principal fallida es503', async () => {
    await expect(harness({ productos: { data: null, error: { message: 'connection unavailable' } } }).getProducto('tenant-a', product.id, {})).rejects.toMatchObject({ status: 503 });
  });
  it('precios y existencias de sucursal incluyen sólo la empresa actual', async () => {
    const response: any = await harness().getProducto('tenant-a', product.id, { includeSucursal: true });
    expect(response.complete).toBe(true);
    expect(response.fuentes_sucursal).toEqual({ completas: true, precios_total: 1, stock_total: 1 });
    expect(response.data.precios_sucursal).toEqual([{ id: 'price-a', producto_id: product.id, tenant_id: 'tenant-a', sucursal_id: null, moneda: 'PEN', precio: 3, activo: true }]);
    expect(response.data.stock_sucursal).toEqual([{ id: 'stock-a', producto_id: product.id, tenant_id: 'tenant-a', sucursal_id: null, almacen_id: null, stock: 0, stock_actual: 0, reservado: 0, minimo: 0, activo: true }]);
  });
  it('listas de sucursal vacías confirmadas siguen siendo válidas', async () => {
    const response: any = await harness({}, false).getProducto('tenant-a', product.id, { includeSucursal: true });
    expect(response.data.precios_sucursal).toEqual([]);
    expect(response.data.stock_sucursal).toEqual([]);
  });
  for (const table of ['producto_precios_sucursal', 'producto_stock_sucursal']) {
    it(`${table} con fallo impide afirmar una lectura completa`, async () => {
      await expect(harness({ [table]: { data: [], error: { message: 'read failed' } } }).getProducto('tenant-a', product.id, { includeSucursal: true })).rejects.toMatchObject({ status: 503 });
    });
    it(`${table} con null no se convierte en vacío`, async () => {
      await expect(harness({ [table]: { data: null, error: null } }).getProducto('tenant-a', product.id, { includeSucursal: true })).rejects.toMatchObject({ status: 503 });
    });
  }
});
