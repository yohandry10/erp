import { AsientosGeneratorService } from './asientos-generator.service';

describe('Pago de proveedor en efectivo Perú', () => {
  const summary = { id: 'summary-10', codigo: '10', acepta_movimiento: true };
  const cash = { id: 'cash-10111', codigo: '10111', acepta_movimiento: true, estado: 'ACTIVO' };
  function setup(country: unknown = 'PE') {
    const query: any = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: { pais: country }, error: null }) };
    const from = jest.fn(() => query);
    const accounts = { obtenerCuentaPorCodigo: jest.fn().mockResolvedValue(cash),
      obtenerCuentasPorCodigos: jest.fn().mockResolvedValue(new Map<string, { id: string }>([
        ['42', { id: 'supplier-42' }], ['10', summary],
      ])) };
    const service = new AsientosGeneratorService({ getClient: () => ({ from }) } as any, {} as any, accounts as any);
    return { service, accounts, query, from };
  }
  it('acredita10111 y conserva un asiento balanceado, sin usar10 como caja', async () => {
    const { service, accounts, query } = setup();
    const create = jest.spyOn(service, 'generarAsiento').mockResolvedValue({ id: 'journal' } as any);
    await service.generarAsientoPago({ tenant_id: 'tenant-pe', fecha: '2026-10-16', monto: 40, metodo_pago: 'EFECTIVO' });
    const details = create.mock.calls[0][3];
    expect(details).toEqual([
      expect.objectContaining({ cuenta_id: 'supplier-42', debe: 40, haber: 0 }),
      expect.objectContaining({ cuenta_id: 'cash-10111', debe: 0, haber: 40, concepto: 'Caja' }),
    ]);
    expect(accounts.obtenerCuentaPorCodigo).toHaveBeenCalledWith('tenant-pe', '10111');
    expect(query.eq).toHaveBeenCalledWith('tenant_id', 'tenant-pe');
  });
  it.each([null, 'OTRO'])('rechaza país %s sin contabilizar en una cuenta inventada', async country => {
    const { service, accounts } = setup(country);
    const create = jest.spyOn(service, 'generarAsiento');
    await expect(service.generarAsientoPago({ tenant_id: 'tenant-pe', fecha: '2026-10-16', monto: 40, metodo_pago: 'EFECTIVO' }))
      .rejects.toThrow('país');
    expect(create).not.toHaveBeenCalled();
    expect(accounts.obtenerCuentaPorCodigo).not.toHaveBeenCalled();
  });
  it('no sustituye una cuenta operativa deshabilitada por la de resumen', async () => {
    const { service, accounts } = setup();
    accounts.obtenerCuentaPorCodigo.mockResolvedValue({ ...cash, estado: 'INACTIVO' });
    await expect((service as any).cuentaTesoreria('tenant-pe', { metodo_pago: 'EFECTIVO' }, summary))
      .rejects.toThrow('no está habilitada');
  });
  it('conserva el contrato de eventos históricos que no declararon medio de pago', async () => {
    const { service, from } = setup();
    expect(await (service as any).cuentaTesoreria('tenant-pe', {}, summary)).toBe(summary);
    expect(from).not.toHaveBeenCalled();
  });
});
