import { CpeReportingService } from './cpe-reporting.service';
jest.mock('../../shared/utils/fecha-tenant.util', () => ({ paisDelTenant: async () => 'PE', rangoDelDiaDelTenant: async () => ({ desde: '2026-10-09T05:00:00Z', hasta: '2026-10-10T05:00:00Z' }) }));
const complete = { id: 'cpe-1', tipo_documento: '01', serie: 'F001', numero: '00000001', fecha_emision: '2026-10-09', created_at: '2026-10-09T12:00:00Z', total_venta: '1.18', moneda: 'PEN', estado: 'FIRMADO' };
const historical = { ...complete, estado: 'MIGRADO', activo: false,
  idempotency_key: 'migracion_historica:HIST-LOCAL-1',
  metadata: { origen: 'migracion_historica', external_id: 'HIST-LOCAL-1', run_id: '11111111-1111-4111-8111-111111111111', no_sunat: true, no_evento_factura: true, solo_lectura: true } };
function service(responses: Record<string, any[]>) {
  const from = jest.fn((table: string) => {
    const value = responses[table]?.shift();
    if (!value) throw new Error(`Lectura inesperada de ${table}`);
    const chain: any = {};
    for (const method of ['select','order','range','eq','gte','lt','in','ilike']) chain[method] = jest.fn(() => chain);
    chain.then = (resolve: any) => Promise.resolve({ error: null, ...value }).then(resolve);
    return chain;
  });
  return new CpeReportingService({ getClient: () => ({ from }) } as any);
}
describe('CPE reporting · integridad de las fuentes', () => {
  it('publica la historia importada canónica sin convertirla en aceptación fiscal', async () => {
    await expect(service({ cpe: [{ data: [historical], count: 1 }] }).getComprobantesFromDatabase({}, 'tenant-1'))
      .resolves.toMatchObject({ success: true, data: [{ estado: 'MIGRADO', estadoSunat: 'NO_VERIFICADO', isHistoricalImport: true, isDemoRepresentation: false, requiereVincularCobro: false }] });
  });
  it('conserva la lectura de un firmado ordinario sin clasificarlo como historia importada', async () => {
    const result = await service({ cpe: [{ data: [complete], count: 1 }] }).getComprobantesFromDatabase({}, 'tenant-1');
    expect(result.data[0]).toMatchObject({ estado: 'FIRMADO', total: 1.18 });
    expect(result.data[0]).not.toMatchObject({ isHistoricalImport: true });
  });
  it.each([
    { metadata: undefined },
    { metadata: { ...historical.metadata, origen: 'desconocido' } },
    { metadata: { ...historical.metadata, external_id: '' } },
    { metadata: { ...historical.metadata, run_id: 'no-uuid' } },
    { metadata: { ...historical.metadata, no_sunat: false } },
    { metadata: { ...historical.metadata, no_evento_factura: false } },
    { metadata: { ...historical.metadata, solo_lectura: false } },
    { idempotency_key: 'otra-intencion' },
    { activo: true },
  ])('rechaza MIGRADO sin procedencia íntegra del importador %#', async (change) => {
    await expect(service({ cpe: [{ data: [{ ...historical, ...change }], count: 1 }] }).getComprobantesFromDatabase({}, 'tenant-1'))
      .rejects.toMatchObject({ status: 503 });
  });
  it.each([
    { data: null, count: 0 }, { data: [], count: null }, { data: [complete], count: 2 },
    { data: [complete, complete], count: 2 }, { data: [{ ...complete, total_venta: null }], count: 1 },
  ])('no publica un listado parcial como resultado completo %#', async (response) => {
    await expect(service({ cpe: [response] }).getComprobantesFromDatabase({}, 'tenant-1')).rejects.toMatchObject({ status: 503 });
  });
  it.each([{ data: null, count: 0 }, { data: [], count: 1 }])('no anuncia un CPE sin CxC si la consulta de cobro está incompleta %#', async (response) => {
    await expect(service({ cpe: [{ data: [{ ...complete, documento_id: 'doc-1' }], count: 1 }], cuentas_por_cobrar: [response] }).getComprobantesFromDatabase({}, 'tenant-1')).rejects.toMatchObject({ status: 503 });
  });
  it('conserva un cero confirmado con consulta vacía y conteo exacto', async () => {
    await expect(service({ cpe: [{ data: [], count: 0 }] }).getComprobantesFromDatabase({}, 'tenant-1')).resolves.toMatchObject({ success: true, data: [], meta: { total: 0 } });
  });
  it('suma todos los 1001 comprobantes mensuales con decimal y paginación', async () => {
    const rows = Array.from({ length: 1001 }, (_, index) => ({ id: `cpe-${index}`, total_venta: '0.10' }));
    const pages = Array.from({ length: 6 }, (_, index) => ({ data: rows.slice(index * 200, index * 200 + 200), count: 1001 }));
    await expect(service({ cpe: [{ count: 1 }, { count: 1001 }, ...pages, { count: 0 }] }).getStatsFromDatabase('tenant-1')).resolves.toMatchObject({ data: { cpeEmitidosHoy: 1, cpeDelMes: 1001, montoFacturado: 100.10, rechazados: 0 } });
  });
  it('resta las notas de crédito y excluye rechazados y anulados del monto facturado', async () => {
    const rows = [
      { id: 'f1', tipo_documento: 'FACTURA', estado: 'ACEPTADO', total_venta: '179.80' },
      { id: 'f2', tipo_documento: '01', estado: 'FIRMADO', total_venta: '212.16' },
      { id: 'nc', tipo_documento: '07', estado: 'FIRMADO', total_venta: '106.08' },
      { id: 'rx', tipo_documento: '01', estado: 'RECHAZADO', total_venta: '50.00' },
      { id: 'an', tipo_documento: '03', estado: 'ANULADO', total_venta: '20.00' },
    ];
    await expect(service({ cpe: [{ count: 0 }, { count: 5 }, { data: rows, count: 5 }, { count: 1 }] }).getStatsFromDatabase('tenant-1'))
      .resolves.toMatchObject({ data: { cpeDelMes: 5, montoFacturado: 285.88, rechazados: 1 } });
  });
  it.each([
    [{ count: null }], [{ count: 0 }, { count: null }],
    [{ count: 0 }, { count: 1 }, { data: null, count: 1 }],
    [{ count: 0 }, { count: 1 }, { data: [], count: 1 }],
    [{ count: 0 }, { count: 1 }, { data: [{ id: 'cpe-1', total_venta: null }], count: 1 }],
    [{ count: 0 }, { count: 1 }, { data: [{ id: 'cpe-1', total_venta: 'NaN' }], count: 1 }],
  ])('rechaza indicadores sin fuente completa %#', async (...responses) => {
    await expect(service({ cpe: responses }).getStatsFromDatabase('tenant-1')).rejects.toMatchObject({ status: 503 });
  });
  it('rechaza una exportación cuando el conteo cambia entre páginas', async () => {
    const reporter = new CpeReportingService({} as any);
    jest.spyOn(reporter, 'getComprobantesFromDatabase').mockResolvedValueOnce({ success: true, data: [{ id: 'a' }], meta: { total: 2 } } as any).mockResolvedValueOnce({ success: true, data: [{ id: 'b' }], meta: { total: 3 } } as any);
    await expect(reporter.exportComprobantesCsv({},'tenant-1')).rejects.toMatchObject({ status: 503 });
  });
});
