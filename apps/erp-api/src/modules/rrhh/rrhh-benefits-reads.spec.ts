import { ServiceUnavailableException } from '@nestjs/common';
import { RrhhService } from './rrhh.service';

function harness(results: Record<string, any>) {
  const queries: Record<string, any> = {};
  const from = jest.fn((table: string) => {
    const q: any = { select: jest.fn(() => q), eq: jest.fn(() => q), in: jest.fn(() => q), order: jest.fn(() => q), range: jest.fn(() => ({ ...results[table], count: Array.isArray(results[table]?.data) ? results[table].data.length : null })),
      then: (resolve: any) => Promise.resolve(results[table]).then(resolve) };
    queries[table] = q;
    return q;
  });
  const service = new RrhhService({ getClient: () => ({ from }) } as any);
  return { service, queries, from };
}
const readers = [
  ['getEmpleados', 'empleados'], ['getLiquidaciones', 'liquidaciones'],
  ['getDestinosBancariosLaborales', 'cuentas_bancarias'], ['getDepositosCts', 'depositos_cts'],
] as const;

describe('Lecturas de beneficios: fuentes completas y ámbito de empresa', () => {
  describe.each(readers)('%s', (method, table) => {
    it.each([null, undefined, {}])('rechaza fuente incompleta %s sin presentar ausencia', async data => {
      const h = harness({ [table]: { data, error: null } });
      await expect(h.service[method]('tenant')).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
    it('clasifica el fallo de fuente como 503', async () => {
      const h = harness({ [table]: { data: [], error: { code: '08006' } } });
      await expect(h.service[method]('tenant')).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
    it('acepta ausencia confirmada y mantiene el filtro de empresa', async () => {
      const h = harness({ [table]: { data: [], error: null } });
      await expect(h.service[method]('tenant')).resolves.toEqual(method === 'getEmpleados'
        ? { success: true, data: [], tenant_id: 'tenant', total: 0, fuentes_empleados: { complete: true, total: 0, page_size: 1000 } }
        : { success: true, data: [] });
      expect(h.queries[table].eq).toHaveBeenCalledWith('tenant_id', 'tenant');
      if (table === 'cuentas_bancarias') {
        expect(h.queries[table].eq).toHaveBeenCalledWith('activa', true);
        expect(h.queries[table].eq).toHaveBeenCalledWith('activo', true);
      }
    });
  });
  it.each([null, {}, { id: 'other' }])('rechaza liquidación con empleado ausente o distinto %s', async empleados => {
    const h = harness({ liquidaciones: { data: [{ id: 'liq', id_empleado: 'employee', empleados }], error: null } });
    await expect(h.service.getLiquidaciones('tenant')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it.each([null, {}, []])('rechaza CTS sin empleados corroborados %s', async data => {
    const h = harness({ depositos_cts: { data: [{ id: 'cts', empleado_id: 'employee' }], error: null }, empleados: { data, error: null } });
    await expect(h.service.getDepositosCts('tenant')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('corrobora cada trabajador CTS en la misma empresa y conserva período y datos', async () => {
    const employee = { id: 'employee', nombres: 'Diana', apellidos: 'Paz', numero_documento: '74638577' };
    const deposit = { id: 'cts', empleado_id: 'employee', periodo: '2026-11', monto: 975, estado: 'DEPOSITADO' };
    const h = harness({ depositos_cts: { data: [deposit], error: null }, empleados: { data: [employee], error: null } });
    await expect(h.service.getDepositosCts('tenant', '2026-11')).resolves.toEqual({ success: true, data: [{ ...deposit, empleados: employee }] });
    expect(h.queries.depositos_cts.eq).toHaveBeenCalledWith('periodo', '2026-11');
    expect(h.queries.empleados.eq).toHaveBeenCalledWith('tenant_id', 'tenant');
    expect(h.queries.empleados.in).toHaveBeenCalledWith('id', ['employee']);
  });
});
