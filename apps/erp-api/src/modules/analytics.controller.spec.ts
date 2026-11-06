import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';

const tenant = 'tenant-analytics';
const row = (id: string, fields: any = {}) => ({ id, tenant_id: tenant, moneda: 'PEN', ...fields });
const doc = (id: string, total: number, moneda = 'PEN', fecha_emision = '2026-11-06') => row(id, { total, moneda, fecha_emision, tipo_documento: 'FACTURA', estado: 'EMITIDO' });
const range = { fecha_desde: '2026-11-01', fecha_hasta: '2026-11-06' };

function setup(tables: Record<string, any[]> = {}, faults: { noCount?: boolean; errorTable?: string; bypassScope?: boolean } = {}) {
  const calls: any[] = [];
  const data = { empresa_config: [row('config', { pais: 'PE' })], ...tables };
  const service = { getClient: () => ({ from: (table: string) => {
    let records = [...(data[table] ?? [])];
    const call = { table, columns: '', filters: [] as any[], page: [] as number[] }; calls.push(call);
    const query: any = {
      select(columns: string) { call.columns = columns; return query; },
      eq(field: string, value: any) { call.filters.push(['eq', field, value]); if (!(faults.bypassScope && field === 'tenant_id')) records = records.filter(record => record[field] === value); return query; },
      in(field: string, values: any[]) { records = records.filter(record => values.includes(record[field])); return query; },
      not(field: string, _: string, value: string) { const excluded = JSON.parse(`[${value.slice(1, -1)}]`); records = records.filter(record => !excluded.includes(record[field])); return query; },
      gte(field: string, value: string) { call.filters.push(['gte', field, value]); records = records.filter(record => String(record[field]).slice(0, 10) >= value.slice(0, 10)); return query; },
      lte(field: string, value: string) { call.filters.push(['lte', field, value]); records = records.filter(record => String(record[field]).slice(0, 10) <= value.slice(0, 10)); return query; },
      order(field: string, { ascending }: any) { records.sort((a, b) => String(a[field]).localeCompare(String(b[field])) * (ascending ? 1 : -1)); return query; },
      range(from: number, to: number) { call.page = [from, to]; return Promise.resolve({ data: records.slice(from, to + 1), count: faults.noCount ? null : records.length, error: faults.errorTable === table ? { message: 'read failed' } : null }); },
    };
    return query;
  } }) };
  return { controller: new AnalyticsController(service as any, {} as any), calls };
}

describe('Analytics — lectura nativa completa por moneda', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date('2026-11-06T12:00:00Z')); });
  afterEach(() => jest.useRealTimers());

  it('separa PEN179.80 y USD0.07 sin publicar el falso total179.87', async () => {
    const response = await setup({ documentos: [doc('pen', 179.8), doc('usd', 0.07, 'USD')] }).controller.getVentasTiempo(tenant, range);
    expect(response.data.porMoneda.map((item: any) => [item.moneda, item.totales.ventasActuales])).toEqual([['PEN', 179.8], ['USD', 0.07]]);
    expect(response.data.totales).toBeUndefined();
  });
  it('conserva ventas simples, tenant y rango y excluye borradores y otras empresas', async () => {
    const { controller, calls } = setup({ documentos: [doc('a', 120), doc('b', 30), { ...doc('draft', 999), estado: 'BORRADOR' }, { ...doc('foreign', 999), tenant_id: 'other' }] });
    const response = await controller.getVentasTiempo(tenant, range);
    expect(response.data.totales.ventasActuales).toBe(150); expect(response.data.moneda).toBe('PEN');
    expect(calls[0].filters).toEqual(expect.arrayContaining([['eq', 'tenant_id', tenant], ['gte', 'fecha_emision', '2026-11-01T00:00:00.000Z'], ['lte', 'fecha_emision', '2026-11-06T23:59:59.999Z']]));
  });
  it('compara el crecimiento sólo en la misma moneda', async () => {
    const response = await setup({ documentos: [doc('a', 20), doc('b', 10, 'PEN', '2026-10-29'), doc('c', 5, 'USD', '2026-10-29')] }).controller.getVentasTiempo(tenant, range);
    expect(response.data.porMoneda[0].totales).toMatchObject({ ventasActuales: 20, ventasAnterior: 10, crecimiento: '100.0%' });
    expect(response.data.porMoneda[1].totales).toMatchObject({ ventasActuales: 0, ventasAnterior: 5, crecimiento: '-100.0%' });
  });
  it('lee1001ventas en dos páginas y suma los centavos exactamente', async () => {
    const { controller, calls } = setup({ documentos: Array.from({ length: 1001 }, (_, i) => doc(`d${String(i).padStart(4, '0')}`, 0.01)) });
    expect((await controller.getVentasTiempo(tenant, range)).data.totales.ventasActuales).toBe(10.01);
    expect(calls.some(call => call.page[0] === 1000)).toBe(true);
  });
  it.each([null, '', 'usd'])('rechaza moneda desconocida %s sin fabricar cero', async moneda => {
    await expect(setup({ documentos: [{ ...doc('a', 1), moneda }] }).controller.getVentasTiempo(tenant, range)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it.each([null, 'NaN', '', 0.001])('rechaza importe no verificable %s', async total => {
    await expect(setup({ documentos: [{ ...doc('a', 1), total }] }).controller.getVentasTiempo(tenant, range)).rejects.toThrow();
  });
  it.each([{ noCount: true }, { errorTable: 'documentos' }, { bypassScope: true }])('rechaza lecturas incompletas o ajenas %j', async faults => {
    await expect(setup({ documentos: [{ ...doc('other', 1), tenant_id: 'other' }] }, faults).controller.getVentasTiempo(tenant, range)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('rechaza IDs repetidos', async () => {
    await expect(setup({ documentos: [doc('same', 1), doc('same', 1)] }).controller.getVentasTiempo(tenant, range)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it.each([{ fecha_desde: '2026-02-30', fecha_hasta: '2026-03-02' }, { fecha_desde: '2026-11-01' }, { periodo: 'decorativo' }])('rechaza fechas y períodos inválidos %j', async filters => {
    await expect(setup().controller.getVentasTiempo(tenant, filters)).rejects.toBeInstanceOf(BadRequestException);
  });
  it.each([false, true])('aging conserva vigentes y cada tramo, sin sumar divisas (CxP=%s)', async payable => {
    const dates = ['2026-11-20', '2026-10-27', '2026-09-22', '2026-08-23', '2026-07-09'];
    const { controller } = setup({ [payable ? 'cuentas_por_pagar' : 'cuentas_por_cobrar']: [...dates.map((date, index) => row(String(index), { saldo: (index + 1) * 100, fecha_vencimiento: date })), row('usd', { saldo: 7, moneda: 'USD', fecha_vencimiento: '2026-10-27' })] });
    const response = payable ? await controller.getDeudasProveedores(tenant, {}) : await controller.getDeudasClientes(tenant, {});
    const pen = response.data.porMoneda[0], usd = response.data.porMoneda[1];
    expect(pen.graficoEdadSaldos.data).toEqual([100, 200, 300, 400, 500]); expect(pen.graficoEdadSaldos.backgroundColor).toHaveLength(5);
    expect(pen.totales[payable ? 'totalPorPagar' : 'totalPorCobrar']).toBe(1500); expect(pen.totales.vencido).toBe(1400);
    expect(usd.graficoEdadSaldos.data).toEqual([0, 7, 0, 0, 0]);
  });
  it('no presenta como cartera vacía un fallo de CxP', async () => {
    await expect(setup({}, { errorTable: 'cuentas_por_pagar' }).controller.getDeudasProveedores(tenant, {})).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('las categorías usan importes de líneas, moneda del documento y período', async () => {
    const { controller } = setup({ documentos: [doc('pen1', 141.6), doc('pen2', 59), doc('usd', 0.07, 'USD'), doc('old', 999, 'USD', '2025-01-01')],
      documento_detalles: [row('l1', { documento_id: 'pen1', producto_id: 'p1', total_item: 141.6 }), row('l2', { documento_id: 'pen2', producto_id: 'p2', total_item: 59 }), row('l3', { documento_id: 'usd', producto_id: null, total_item: 0.07 }), row('old-line', { documento_id: 'old', total_item: 999 })], productos: [row('p1', { categoria: 'Alimentos' }), row('p2', { categoria: 'Oficina' })] });
    const result = (await controller.getVentasCategoria(tenant, range)).data.porMoneda;
    expect(result[0].graficoPie).toMatchObject({ labels: ['Alimentos', 'Oficina'], data: [141.6, 59] }); expect(result[1].graficoPie).toMatchObject({ labels: ['Sin categoría'], data: [0.07] });
  });
  it('no calcula ratios nominales entre divisas ni usa inventarioPEN comoUSD', async () => {
    expect((await setup({ documentos: [doc('a', 100), doc('b', 0.07, 'USD')] }).controller.getKpisVisuales(tenant)).data).toMatchObject({ moneda: 'PEN', disponible: false, liquidez: null, rentabilidad: null });
  });
  it('usa saldo bancario real y conserva razón corriente y margen aproximado en una moneda', async () => {
    const { controller, calls } = setup({ documentos: [doc('d', 1000)], gastos: [row('g', { monto: 100, fecha: '2026-11-01' })], cuentas_por_cobrar: [row('ar', { saldo: 400 })], cuentas_por_pagar: [row('ap', { saldo: 500 })], cuentas_bancarias: [row('bank', { saldo: 600, activo: true })], productos: [row('p', { costo: 300, stock_actual: 10, activo: true })], documento_detalles: [row('l', { documento_id: 'd', producto_id: 'p', cantidad: 2 })] });
    const response = await controller.getKpisVisuales(tenant);
    expect(response.data.liquidez.valor).toBe(8); expect(response.data.rentabilidad.valor).toBe(30);
    expect(calls.find(call => call.table === 'cuentas_bancarias').columns).toContain('saldo,moneda');
  });
  it('sin costo ni gastos confirmados cero conserva el margen100%', async () => {
    expect((await setup({ documentos: [doc('a', 500)], documento_detalles: [row('line', { documento_id: 'a', producto_id: 'p', cantidad: 1 })], productos: [row('p', { costo: 0, stock_actual: 0, activo: true })] }).controller.getKpisVisuales(tenant)).data.rentabilidad.valor).toBe(100);
  });
  it('un documento sin costo comprobado no fabrica margen100%', async () => {
    expect((await setup({ documentos: [doc('a', 500)] }).controller.getKpisVisuales(tenant)).data.rentabilidad.valor).toBeNull();
  });
  it('no inventa razón999 ni rentabilidad0 sin base de cálculo', async () => {
    const result = (await setup().controller.getKpisVisuales(tenant)).data;
    expect(result.liquidez.valor).toBeNull(); expect(result.rentabilidad.valor).toBeNull();
  });
  it('no publica KPI0 cuando falla la fuente', async () => {
    await expect(setup({}, { errorTable: 'gastos' }).controller.getKpisVisuales(tenant)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
