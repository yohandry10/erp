import { DashboardMetricsService } from './dashboard-metrics.service';

type TableData = Record<string, any[]>;

function createSupabaseMock(tables: TableData) {
  return {
    getClient: () => ({
      from: (table: string) => createQueryBuilder(tables[table] ?? []),
    }),
  };
}

function createQueryBuilder(rows: any[]) {
  const filters: Array<(row: any) => boolean> = [];
  let selected = '*';

  const builder: any = {
    select(columns: string) {
      selected = columns;
      return builder;
    },
    eq(column: string, value: any) {
      filters.push((row) => String(row[column]) === String(value));
      return builder;
    },
    neq(column: string, value: any) {
      filters.push((row) => String(row[column]) !== String(value));
      return builder;
    },
    gte(column: string, value: any) {
      filters.push((row) => new Date(row[column]).getTime() >= new Date(value).getTime());
      return builder;
    },
    lte(column: string, value: any) {
      filters.push((row) => new Date(row[column]).getTime() <= new Date(value).getTime());
      return builder;
    },
    order() {
      return builder;
    },
    limit() {
      return builder;
    },
    then(resolve: (value: any) => void) {
      const data = rows.filter((row) => filters.every((filter) => filter(row))).map((row) => project(row, selected));
      resolve({ data, error: null });
    },
  };

  return builder;
}

function project(row: any, selected: string) {
  if (selected === '*' || selected.includes('*')) return row;
  const columns = selected.split(',').map((column) => column.trim().split(' ')[0]);
  return columns.reduce((acc, column) => {
    acc[column] = row[column];
    return acc;
  }, {} as any);
}

describe('DashboardMetricsService', () => {
  const tenantId = 'tenant-dashboard';
  const otherTenantId = 'tenant-other';

  function createService(tables: TableData, cachedStats: any = null) {
    const cache = {
      get: jest.fn().mockResolvedValue(cachedStats),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
      delPattern: jest.fn().mockResolvedValue(0),
      cleanExpired: jest.fn(),
    };
    const service = new DashboardMetricsService(createSupabaseMock(tables) as any, cache as any);
    service.onModuleDestroy();
    return service;
  }

  it('calcula métricas reales por tenant y periodo con columnas runtime', async () => {
    const now = new Date();
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 10).toISOString();
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 10).toISOString();

    const service = createService({
      cpe: [
        { tenant_id: tenantId, total_venta: 118, total: 999, created_at: currentMonth },
        { tenant_id: tenantId, total: 59, created_at: currentMonth },
        { tenant_id: tenantId, total_venta: 777, total: 777, created_at: previousMonth },
        { tenant_id: otherTenantId, total_venta: 5000, created_at: currentMonth },
      ],
      gre_guias: [{ tenant_id: tenantId, created_at: currentMonth }, { tenant_id: otherTenantId, created_at: currentMonth }],
      productos: [
        { tenant_id: tenantId, precio_compra: 10, costo: 99, stock_actual: 3, stock_minimo: 5, activo: true },
        { tenant_id: tenantId, precio_compra: 0, costo: 20, stock_actual: 4, stock_minimo: 1, activo: true },
        { tenant_id: tenantId, precio_compra: 999, stock_actual: 999, stock_minimo: 1, activo: false },
        { tenant_id: otherTenantId, precio_compra: 999, stock_actual: 999, stock_minimo: 1, activo: true },
      ],
      ordenes_compra: [
        { tenant_id: tenantId, total: 200, estado: 'pendiente', created_at: currentMonth },
        { tenant_id: tenantId, total: 100, estado: 'APROBADA', created_at: currentMonth },
        { tenant_id: tenantId, total: 1000, estado: 'PENDIENTE', created_at: previousMonth },
      ],
      usuarios_sistema: [{ tenant_id: tenantId }, { tenant_id: otherTenantId }],
      cotizaciones: [
        { tenant_id: tenantId, estado: 'aceptada', created_at: currentMonth },
        { tenant_id: tenantId, estado: 'PENDIENTE', created_at: currentMonth },
      ],
      sire_files: [{ tenant_id: tenantId, created_at: currentMonth }, { tenant_id: otherTenantId, created_at: currentMonth }],
    });

    const stats = await service.getStats(tenantId);

    expect(stats.ventasMes).toBe(177);
    expect(stats.totalCpe).toBe(2);
    expect(stats.comprasMes).toBe(300);
    expect(stats.totalCompras).toBe(2);
    expect(stats.ordenesCompraPendientes).toBe(1);
    expect(stats.totalInventario).toBe(2);
    expect(stats.valorInventario).toBe(110);
    expect(stats.productosConStockBajo).toBe(1);
    expect(stats.totalGre).toBe(1);
    expect(stats.totalSire).toBe(1);
    expect(stats.totalUsers).toBe(1);
    expect(stats.tasaConversionCotizaciones).toBe(50);
  });

  it('superpone el inventario vivo al snapshot cacheado usando la misma valorización a costo', async () => {
    const cachedStats = {
      totalInventario: 0,
      valorInventario: 0,
      productosConStockBajo: 0,
      ultimaActualizacion: '2026-08-29T00:00:00.000Z',
    };
    const productos = [
      { tenant_id: tenantId, precio_compra: 18_000, stock_actual: 50, stock_minimo: 5, activo: true },
      { tenant_id: tenantId, precio_compra: 4_800, stock_actual: 120, stock_minimo: 5, activo: true },
      { tenant_id: tenantId, precio_compra: 5_500, stock_actual: 80, stock_minimo: 5, activo: true },
      { tenant_id: tenantId, precio_compra: 60_000, stock_actual: 15, stock_minimo: 5, activo: true },
      { tenant_id: tenantId, precio_compra: 10_000, stock_actual: 40, stock_minimo: 5, activo: true },
      { tenant_id: tenantId, precio_compra: 2_200, stock_actual: 200, stock_minimo: 5, activo: true },
    ];
    const service = createService({ productos }, cachedStats);

    const stats = await service.getStats(tenantId);

    expect(stats.totalInventario).toBe(6);
    expect(stats.valorInventario).toBe(3_656_000);
    expect(stats.productosConStockBajo).toBe(0);
    expect(stats.ultimaActualizacion).toBe(cachedStats.ultimaActualizacion);
  });

  it('no convierte un fallo de lectura de inventario en ceros cacheables', async () => {
    const queryError = { message: 'inventory read failed' };
    const builder: any = {
      select: jest.fn(() => builder),
      eq: jest.fn(() => builder),
      then: (resolve: (value: any) => void) => resolve({ data: null, error: queryError }),
    };
    const cache = {
      get: jest.fn().mockResolvedValue({ totalInventario: 0, valorInventario: 0 }),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
      delPattern: jest.fn().mockResolvedValue(0),
      cleanExpired: jest.fn(),
    };
    const service = new DashboardMetricsService({
      getClient: () => ({ from: jest.fn(() => builder) }),
    } as any, cache as any);
    service.onModuleDestroy();

    await expect(service.getStats(tenantId)).rejects.toBe(queryError);
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('nombra las actividades CPE según el tipo de documento SUNAT', async () => {
    const createdAt = new Date().toISOString();
    const service = createService({
      cpe: [
        {
          id: 'boleta-1',
          tenant_id: tenantId,
          tipo_documento: '03',
          serie: 'B001',
          numero: 12,
          total_venta: 25,
          estado: 'PENDIENTE',
          created_at: createdAt,
        },
        {
          id: 'factura-1',
          tenant_id: tenantId,
          tipo_documento: '01',
          serie: 'F001',
          numero: 7,
          total_venta: 118,
          estado: 'ACEPTADA',
          created_at: createdAt,
        },
      ],
    });

    const activities = await service.getActivities(tenantId);

    expect(activities.map((activity) => activity.description)).toEqual(
      expect.arrayContaining(['Boleta B001-00000012', 'Factura F001-00000007']),
    );
  });
});
