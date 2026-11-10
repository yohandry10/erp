import { ComprasController } from './compras.controller';
import { limpiarCachePaisTenant } from '../shared/utils/fecha-tenant.util';

const tenant = 'tenant-d57';
const order = (id: number, extra: Record<string, unknown> = {}) => ({
  id: 'order-' + id, tenant_id: tenant, numero: 'OC-' + id, moneda: 'PEN', total: '10.00',
  estado: 'BORRADOR', fecha_orden: '2026-11-04T15:00:00Z', fecha_entrega: '2099-01-01', ...extra,
});
type Page = { data: any[] | null; count: number | null; error: any };
function fixture(orders: any[] = [], change?: (table: string, offset: number, response: Page) => Page, country = 'PE') {
  const rows = { ordenes_compra: orders, proveedores: [{ id: 'provider', tenant_id: tenant, activo: true }], empresa_config: [{ id: 'config', tenant_id: tenant, pais: country }] };
  const queries: Record<string, any> = {};
  const from = jest.fn((table: string) => {
    const values = rows[table] || [];
    const response = (offset = 0, end = values.length - 1) => {
      const page = { data: values.slice(offset, end + 1), count: values.length, error: null };
      return Promise.resolve(change ? change(table, offset, page) : page);
    };
    const query: any = {
      select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), order: jest.fn().mockReturnThis(),
      range: jest.fn((offset: number, end: number) => response(offset, end)),
      maybeSingle: jest.fn().mockResolvedValue({ data: rows.empresa_config[0], error: null }),
      then: (resolve: any, reject: any) => response().then(resolve, reject),
    };
    (queries[table] ||= []).push(query);
    return query;
  });
  return { controller: new ComprasController({ getClient: () => ({ from }) } as any, { getTenantId: () => tenant } as any), queries };
}

describe('ComprasController · resumen nativo completo', () => {
  beforeEach(() => {
    limpiarCachePaisTenant();
    jest.useFakeTimers({ now: new Date('2026-11-04T18:00:00Z'), doNotFake: ['nextTick', 'setImmediate'] });
  });
  afterEach(() => jest.useRealTimers());

  it('incluye aprobadas y parciales entre activas y conserva el tenant en cada lectura', async () => {
    const { controller, queries } = fixture(['BORRADOR', 'APROBACION', 'APROBADA', 'PARCIAL', 'RECIBIDA', 'ANULADA', 'RECHAZADA'].map((estado, id) => order(id, { estado })));
    const result = await controller.getStats({ tenant_id: 'another-company' });
    expect(result.data.ordenesActivas).toBe(4);
    for (const table of ['ordenes_compra', 'proveedores', 'empresa_config']) {
      expect(queries[table][0].eq).toHaveBeenCalledWith('tenant_id', tenant);
    }
  });

  it('separa PEN/USD sin sumar nominales y mantiene mes civil y estados excluidos', async () => {
    const { controller } = fixture([
      order(1, { total: '17.70' }), order(2, { estado: 'PARCIAL', total: '354.00', fecha_orden: '2026-11-01T06:00:00Z' }),
      order(3, { estado: 'RECIBIDA', total: '118.00', fecha_orden: '2026-11-01T03:00:00Z' }),
      order(4, { estado: 'ANULADA', total: '500.00' }), order(5, { estado: 'RECHAZADA', total: '600.00' }),
      order(6, { moneda: 'USD', total: '24.37' }), order(7, { moneda: 'USD', total: '24.37' }), order(8, { moneda: 'USD', total: '24.37' }),
    ]);
    const result = await controller.getStats({});
    expect(result.data).toMatchObject({ version: 2, base: 'IMPORTES_ORIGINALES_SIN_CONVERSION', comprasDelMes: 5,
      porMoneda: [
        { moneda: 'PEN', totalCompras: '1589.70', montoTotalMes: '371.70', comprasDelMes: 2 },
        { moneda: 'USD', totalCompras: '73.11', montoTotalMes: '73.11', comprasDelMes: 3 },
      ] });
    expect(result.data).not.toHaveProperty('montoTotalMes');
    expect(result.data).not.toHaveProperty('totalCompras');
  });

  it('lee la segunda página y suma centavos decimales exactos', async () => {
    const { controller, queries } = fixture(Array.from({ length: 1001 }, (_, id) => order(id, { moneda: 'USD', total: '0.01' })));
    const result = await controller.getStats({});
    expect(result.data.porMoneda).toEqual([{ moneda: 'USD', totalCompras: '10.01', montoTotalMes: '10.01', comprasDelMes: 1001 }]);
    expect(queries.ordenes_compra).toHaveLength(2);
    expect(queries.ordenes_compra[1].range).toHaveBeenCalledWith(1000, 1999);
    expect(queries.ordenes_compra[0].select).toHaveBeenCalledWith(expect.any(String), { count: 'exact' });
  });

  it('también cuenta proveedores después de la primera página', async () => {
    const { controller } = fixture([], (table, offset, response) => table === 'proveedores'
      ? { ...response, count: 1001, data: Array.from({ length: offset === 0 ? 1000 : 1 }, (_, id) => ({ id: 'p-' + (offset + id), tenant_id: tenant, activo: true })) } : response);
    expect((await controller.getStats({})).data.proveedoresActivos).toBe(1001);
  });

  it('una lectura realmente vacía conserva los conteos cero sin inventar moneda', async () => {
    const result = await fixture([]).controller.getStats({});
    expect(result.data).toMatchObject({ comprasDelMes: 0, ordenesActivas: 0, ordenesVencidas: 0, porMoneda: [] });
  });

  it('conserva una orden de importe cero con su moneda original', async () => {
    const result = await fixture([order(1, { moneda: 'USD', total: 0 })]).controller.getStats({});
    expect(result.data.porMoneda).toEqual([{ moneda: 'USD', totalCompras: '0.00', montoTotalMes: '0.00', comprasDelMes: 1 }]);
  });

  it.each([['PE', '0.10'], ['CO', '0.10'], ['AR', '0.20']])('usa el mes civil de %s al cruzar noviembreUTC', async (country, expected) => {
    jest.setSystemTime(new Date('2026-11-01T04:30:00Z'));
    const result = await fixture([
      order(1, { total: '0.10', fecha_orden: '2026-10-31T15:00:00Z' }),
      order(2, { total: '0.20', fecha_orden: '2026-11-01T06:00:00Z' }),
    ], undefined, country).controller.getStats({});
    expect(result.data.porMoneda[0]).toMatchObject({ totalCompras: '0.30', montoTotalMes: expected, comprasDelMes: 1 });
  });

  it('un error en la segunda página no publica el acumulado parcial', async () => {
    const rows = Array.from({ length: 1001 }, (_, id) => order(id));
    await expect(fixture(rows, (table, offset, response) => table === 'ordenes_compra' && offset === 1000
      ? { ...response, data: null, error: { code: 'PGRST000' } } : response).controller.getStats({})).rejects.toMatchObject({ status: 503 });
  });

  it.each([
    ['falla de proveedores', (table: string, _offset: number, r: Page) => table === 'proveedores' ? { ...r, data: null, error: { code: 'PGRST000' } } : r],
    ['página truncada', (table: string, _offset: number, r: Page) => table === 'ordenes_compra' ? { ...r, count: 1001 } : r],
    ['conteo ausente', (table: string, _offset: number, r: Page) => table === 'ordenes_compra' ? { ...r, count: null } : r],
    ['otra empresa', (table: string, _offset: number, r: Page) => table === 'ordenes_compra' ? { ...r, data: r.data!.map(row => ({ ...row, tenant_id: 'other' })) } : r],
    ['configuración no disponible', (table: string, _offset: number, r: Page) => table === 'empresa_config' ? { ...r, data: null, error: { code: 'PGRST000' } } : r],
  ])('%s es indisponibilidad y no un KPI cero', async (_label, change) => {
    await expect(fixture([order(1)], change).controller.getStats({})).rejects.toMatchObject({ status: 503 });
  });

  it.each([
    { moneda: null }, { moneda: '' }, { moneda: 'usd' }, { total: null }, { total: '' }, { total: 'NaN' },
    { total: '-1.00' }, { total: '0.001' }, { fecha_orden: null, created_at: null },
  ])('rechaza el origen monetario incompleto %j', async extra => {
    await expect(fixture([order(1, extra)]).controller.getStats({})).rejects.toMatchObject({ status: 503 });
  });
});
