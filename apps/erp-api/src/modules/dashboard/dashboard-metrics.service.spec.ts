import { ServiceUnavailableException } from '@nestjs/common';
import { DashboardMetricsService } from './dashboard-metrics.service';

type TableData = Record<string, any[]>;

function createSupabaseMock(tables: TableData, failures: Record<string, string> = {}) {
  return {
    getClient: () => ({
      from: (table: string) => {
        const builder = createQueryBuilder(tables[table] ?? []);
        if (failures[table]) builder.then = (resolve: (value: any) => void, reject: (error: Error) => void) => {
          if (failures[table] === 'rejected') reject(new Error('Lectura indisponible'));
          else resolve({ data: null, error: failures[table] === 'error' ? { code: 'UAT_READ_FAILED' } : null });
        };
        return builder;
      },
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
    in(column: string, values: any[]) {
      filters.push((row) => values.map(String).includes(String(row[column])));
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
    async maybeSingle() {
      return { data: rows.filter(row => filters.every(filter => filter(row))).map(row => project(row, selected))[0], error: null };
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

  function createService(tables: TableData, cachedStats: any = null, failures: Record<string, string> = {}) {
    const cache = {
      get: jest.fn().mockResolvedValue(cachedStats),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
      delPattern: jest.fn().mockResolvedValue(0),
      cleanExpired: jest.fn(),
    };
    // Explicit defaults in older fixtures; the production reader rejects missing money/currency.
    const fixtures = Object.fromEntries(Object.entries(tables).map(([table, rows]) => [table, rows.map((row,index) => ['cpe','ordenes_compra','cotizaciones','ventas_pos'].includes(table) ? { id:`fixture-${table}-${index}`, numero:index+1, serie:'F001', moneda:'PEN', estado:table==='ventas_pos'?'PAGADA':'FIRMADO', ...(table==='cpe' ? { tipo_documento:'01' } : {}), ...row } : row)]));
    const service = new DashboardMetricsService(createSupabaseMock({ empresa_config: [{ tenant_id: tenantId, pais: 'PE', moneda:'PEN' }], ...fixtures }, failures) as any, cache as any);
    service.onModuleDestroy();
    return service;
  }

  it.each(['cpe', 'gre_guias', 'ordenes_compra', 'usuarios_sistema', 'cotizaciones', 'sire_files', 'ventas_pos'])(
    'no publica ni cachea métricas cuando falla %s', async (table) => {
      for (const mode of ['error', 'rejected', 'incomplete']) {
        const service = createService({}, null, { [table]: mode });
        await expect(service.getStats(tenantId)).rejects.toMatchObject({ status: 503 });
        expect((service as any).cacheService.set).not.toHaveBeenCalled();
      }
    },
  );

  it.each(['cpe', 'gre_guias', 'ordenes_compra', 'cotizaciones'])(
    'no publica ni cachea actividades parciales cuando falla %s', async (table) => {
      for (const mode of ['error', 'rejected', 'incomplete']) {
        const service = createService({}, null, { [table]: mode });
        await expect(service.getActivities(tenantId)).rejects.toMatchObject({ status: 503 });
        expect((service as any).cacheService.set).not.toHaveBeenCalled();
      }
    },
  );

  it('calcula métricas reales por tenant y periodo con columnas runtime', async () => {
    // El servicio calcula el mes en la hora del país (Lima, UTC-5), no en la del servidor:
    // las primeras horas de cada mes en UTC todavía son el mes anterior allí.
    const lima = new Date(Date.now() - 5 * 60 * 60 * 1000);
    const currentMonth = new Date(Date.UTC(lima.getUTCFullYear(), lima.getUTCMonth(), 10, 12)).toISOString();
    const previousMonth = new Date(Date.UTC(lima.getUTCFullYear(), lima.getUTCMonth() - 1, 10, 12)).toISOString();

    const service = createService({
      cpe: [
        { tenant_id: tenantId, total_venta: 118, total: 999, created_at: currentMonth },
        { tenant_id: tenantId, total: 59, created_at: currentMonth },
        { tenant_id: tenantId, total_venta: 777, total: 777, created_at: previousMonth },
        { tenant_id: otherTenantId, total_venta: 5000, created_at: currentMonth },
      ],
      gre_guias: [{ tenant_id: tenantId, created_at: currentMonth }, { tenant_id: otherTenantId, created_at: currentMonth }],
      productos: [
        { tenant_id: tenantId, precio_compra: 10, costo: 99, costo_promedio_base: 99, stock_actual: 3, stock_minimo: 5, activo: true },
        { tenant_id: tenantId, precio_compra: 0, costo: 20, costo_promedio_base: 20, stock_actual: 4, stock_minimo: 1, activo: true },
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
        { tenant_id: tenantId, estado: 'CONVERTIDA', created_at: currentMonth },
        { tenant_id: tenantId, estado: 'ENVIADA', created_at: currentMonth },
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
    expect(stats.valorInventario).toBe(377);
    expect(stats.productosConStockBajo).toBe(1);
    expect(stats.totalGre).toBe(1);
    expect(stats.totalSire).toBe(1);
    expect(stats.totalUsers).toBe(1);
    expect(stats.tasaConversionCotizaciones).toBe(50);
    expect(stats.cotizacionesPendientes).toBe(1);
  });

  it('descuenta notas de crédito y no cuenta comprobantes anulados o rechazados', async () => {
    const currentMonth = new Date().toISOString();
    const service = createService({
      cpe: [
        { tenant_id: tenantId, tipo_documento: '01', estado: 'ACEPTADO', total_venta: 118, created_at: currentMonth },
        { tenant_id: tenantId, tipo_documento: '07', estado: 'ACEPTADO', total_venta: 18, created_at: currentMonth },
        { tenant_id: tenantId, tipo_documento: '01', estado: 'ANULADO', total_venta: 1180, created_at: currentMonth },
        { tenant_id: tenantId, tipo_documento: '03', estado: 'RECHAZADO', total_venta: 59, created_at: currentMonth },
      ],
      productos: [],
    });

    const stats = await service.getStats(tenantId);

    expect(stats.ventasMes).toBe(100);
    expect(stats.totalCpe).toBe(2);
  });

  it('una lectura caída responde 503 y no informa ventas en cero', async () => {
    const supabase = createSupabaseMock({ productos: [] }) as any;
    const original = supabase.getClient();
    const client = {
      ...original,
      from: (table: string) => table === 'cpe'
        ? { select: () => ({ eq: () => ({ gte: () => ({ lte: () => ({ order: () => Promise.resolve({ data: null, error: { code: '42501' } }) }), then: (resolve: any) => resolve({ data: null, error: { code: '42501' } }) }) }) }) }
        : original.from(table),
    };
    supabase.getClient = () => client;
    const cache = { get: jest.fn().mockResolvedValue(null), set: jest.fn(), del: jest.fn(), delPattern: jest.fn(), cleanExpired: jest.fn() };
    const service = new DashboardMetricsService(supabase, cache as any);
    service.onModuleDestroy();

    await expect(service.getStats(tenantId)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('superpone el inventario vivo al snapshot cacheado usando la misma valorización a costo', async () => {
    const cachedStats = {
      monedaBase: 'PEN',
      importesPorMoneda: [{ moneda:'PEN', ventasMes:0, ventasHoy:0, comprasMes:0 }],
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
    const service = createService({ productos: productos.map(p => ({ ...p, costo: p.precio_compra, costo_promedio_base: p.precio_compra })) }, cachedStats);

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
      maybeSingle: jest.fn().mockResolvedValue({ data:{moneda:'PEN'}, error:null }),
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
  it('separa monedas, resta notas de crédito, excluye anuladas y evita duplicar POS con CPE', async () => {
    const created_at = new Date().toISOString();
    const service = createService({
      cpe: [
        {tenant_id:tenantId,total_venta:100,moneda:'PEN',tipo_documento:'01',created_at},
        {tenant_id:tenantId,total_venta:20,moneda:'PEN',tipo_documento:'07',created_at},
        {tenant_id:tenantId,total_venta:5,moneda:'PEN',tipo_documento:'08',created_at},
        {tenant_id:tenantId,total_venta:999,moneda:'PEN',estado:'ANULADO',created_at},
        {tenant_id:tenantId,total_venta:999,moneda:'PEN',estado:'BORRADOR',created_at},
        {tenant_id:tenantId,total_venta:3,moneda:'USD',created_at},
      ],
      ventas_pos:[{tenant_id:tenantId,total:1,moneda:'PEN',cpe_id:null,created_at},{tenant_id:tenantId,total:100,cpe_id:'already-counted',created_at}],
      ordenes_compra:[{tenant_id:tenantId,total:7,estado:'RECIBIDA',created_at},{tenant_id:tenantId,total:30,estado:'ANULADA',created_at},{tenant_id:tenantId,total:40,estado:'RECHAZADA',created_at},{tenant_id:tenantId,total:4,estado:'APROBADA',moneda:'USD',created_at}],
      cotizaciones:[{tenant_id:tenantId,estado:'CONVERTIDA',total:0,created_at}],
    });
    const stats=await service.getStats(tenantId);
    expect(stats).toMatchObject({monedaBase:'PEN',ventasMes:86,comprasMes:7,tasaConversionCotizaciones:100});
    expect(stats.importesPorMoneda).toEqual([{moneda:'PEN',ventasMes:86,ventasHoy:86,comprasMes:7},{moneda:'USD',ventasMes:3,ventasHoy:3,comprasMes:4}]);
    const activities=await service.getActivities(tenantId);
    expect(activities).toEqual(expect.arrayContaining([expect.objectContaining({type:'CPE',amount:-20,moneda:'PEN'}),expect.objectContaining({type:'CPE',amount:3,moneda:'USD'}),expect.objectContaining({type:'COMPRA',amount:4,moneda:'USD'})]));
  });

  it.each([null, '', 'usd', 'US', 123])('rechaza moneda incompleta %p sin cachear ceros', async moneda => {
    const service=createService({ordenes_compra:[{tenant_id:tenantId,total:1,moneda,estado:'RECIBIDA',created_at:new Date().toISOString()}]});
    await expect(service.getStats(tenantId)).rejects.toMatchObject({status:503});
    expect((service as any).cacheService.set).not.toHaveBeenCalled();
  });

  it.each([
    ['FACTURA', 100, 'Factura'], ['BOLETA', 100, 'Boleta'],
    ['NOTA_CREDITO', -100, 'Nota de crédito'], ['NOTA_DEBITO', 100, 'Nota de débito'],
  ])('lee el tipo persistido %s en métricas y actividades sin cambiar el importe', async (tipo_documento, expected, label) => {
    const service = createService({ cpe: [{ tenant_id: tenantId, tipo_documento,
      total_venta: 100, estado: 'ACEPTADO', created_at: new Date().toISOString() }] });
    expect(await service.getStats(tenantId)).toMatchObject({ ventasMes: expected, ventasHoy: expected });
    expect(await service.getActivities(tenantId)).toEqual([
      expect.objectContaining({ amount: expected, description: `${label} F001-00000001` }),
    ]);
  });

  it.each([null, '', 'FACTURA_INVALIDA', '99', 1])('rechaza tipo de CPE desconocido %p sin cachear', async tipo_documento => {
    const service = createService({ cpe: [{ tenant_id: tenantId, tipo_documento,
      total_venta: 100, created_at: new Date().toISOString() }] });
    await expect(service.getStats(tenantId)).rejects.toMatchObject({ status: 503 });
    await expect(service.getActivities(tenantId)).rejects.toMatchObject({ status: 503 });
    expect((service as any).cacheService.set).not.toHaveBeenCalled();
  });

  it.each([null,'',-1,'NaN','Infinity','0.001'])('rechaza importe incompleto %p sin cachear', async total => {
    const service=createService({ordenes_compra:[{tenant_id:tenantId,total,estado:'RECIBIDA',created_at:new Date().toISOString()}]});
    await expect(service.getStats(tenantId)).rejects.toMatchObject({status:503});
    expect((service as any).cacheService.set).not.toHaveBeenCalled();
  });

  it.each([['RECIBIDA','success'],['CONVERTIDA','success'],['ANULADA','error'],['RECHAZADO','error'],['ANULADO','error']])('actividad %s conserva el estado comercial %s', async (estado,status) => {
    const service=createService({ordenes_compra:[{tenant_id:tenantId,total:2,estado,created_at:new Date().toISOString()}]});
    expect(await service.getActivities(tenantId)).toEqual([expect.objectContaining({type:'COMPRA',status,amount:2,moneda:'PEN'})]);
  });

});
