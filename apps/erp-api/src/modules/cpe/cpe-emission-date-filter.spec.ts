import { CpeReportingService } from './cpe-reporting.service';
import { fechaDeDocumentoEnPais } from '../../shared/utils/fecha-peru.util';
jest.mock('../../shared/utils/fecha-tenant.util', () => ({ paisDelTenant: async () => 'PE' }));

describe('D-15 · filtros coinciden con la fecha visible y CSV', () => {
  const dates = ['2026-11-03T00:00:00Z', '2026-11-03T04:59:59.999Z', '2026-11-03T05:00:00Z',
    '2026-11-04T00:00:00Z', '2026-11-04T04:31:42.468Z', '2026-11-04T04:59:59.999Z', '2026-11-04T05:00:00Z',
    '2026-11-05T00:00:00Z', '2026-11-05T04:59:59.999Z', '2026-11-05T05:00:00Z'];
  function reporter() {
    const predicates: ((date: string) => boolean)[] = [];
    const compare = (op: string, operand: string) => (date: string) => {
      const a = Date.parse(date), b = Date.parse(operand);
      return op === 'gte' ? a >= b : op === 'lt' ? a < b : op === 'neq' ? a !== b : a === b;
    };
    const chain: any = {};
    for (const method of ['select', 'order', 'range', 'eq']) chain[method] = () => chain;
    for (const method of ['gte', 'lt', 'neq']) chain[method] = (_column: string, operand: string) => { predicates.push(compare(method, operand)); return chain; };
    chain.or = (expression: string) => {
      const conditions = expression.split(',').map(condition => {
        const [, , op, operand] = /^(\w+)\.(\w+)\.(.+)$/.exec(condition)!;
        return compare(op, operand);
      });
      predicates.push(date => conditions.some(condition => condition(date))); return chain;
    };
    chain.then = (resolve: any) => {
      const data = dates.filter(date => predicates.every(predicate => predicate(date))).map((date, i) => ({
        id: `cpe-${i}`, tipo_documento: '01', numero: 1, serie: 'F001', fecha_emision: date, created_at: date,
        total_venta: 179.80, moneda: 'PEN', estado: 'FIRMADO', simulated_origin: true,
      }));
      return Promise.resolve({ data, error: null, count: data.length }).then(resolve);
    };
    return new CpeReportingService({ getClient: () => ({ from: () => chain }) } as any);
  }
  it.each([
    { fechaDesde: '2026-11-03', fechaHasta: '2026-11-03' },
    { fechaDesde: '2026-11-04', fechaHasta: '2026-11-04' },
    { fechaDesde: '2026-11-03', fechaHasta: '2026-11-04' },
    { fechaDesde: '2026-11-04' }, { fechaHasta: '2026-11-03' },
  ])('conserva todas las filas del rango civil %j', async filters => {
    const expected = dates.map(date => fechaDeDocumentoEnPais(date, 'America/Lima'))
      .filter(date => (!filters.fechaDesde || date >= filters.fechaDesde) && (!filters.fechaHasta || date <= filters.fechaHasta));
    const result = await reporter().getComprobantesFromDatabase(filters, 'tenant-1');
    expect(result.data.map(row => row.fechaEmision).sort()).toEqual(expected.sort());
  });
  it('exporta exactamente las fechas civiles del mismo rango', async () => {
    const filters = { fechaDesde: '2026-11-03', fechaHasta: '2026-11-03' };
    const csv = await reporter().exportComprobantesCsv(filters, 'tenant-1');
    const lines = csv.content.split('\r\n');
    expect(lines[0].split(',')[3]).toBe('fechaEmision');
    expect(lines.slice(1)).toHaveLength(4);
    expect(lines.slice(1).every(line => line.split(',')[3] === '2026-11-03')).toBe(true);
  });
});
