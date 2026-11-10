import { AsientosGeneratorService, DetalleAsiento } from './asientos-generator.service';

describe('AsientosGeneratorService - RMA 456', () => {
  const cuenta = (codigo: string) => ({
    id: `cuenta-${codigo}`, tenant_id: 'tenant-1', codigo,
    nombre: codigo, tipo: 'ACTIVO', nivel: 1,
    acepta_movimiento: true, estado: 'ACTIVO',
  } as any);
  const plan = {
    obtenerCuentasPorCodigos: jest.fn(async (_tenant: string, codigos: string[]) =>
      new Map(codigos.map((codigo) => [codigo, cuenta(codigo)]))),
    buscarCuentaPorCodigoONombre: jest.fn().mockResolvedValue(null),
  };
  let service: AsientosGeneratorService;
  let generar: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AsientosGeneratorService({} as any, {} as any, plan as any);
    generar = jest.spyOn(service, 'generarAsiento').mockResolvedValue({ id: 'asiento-1' } as any);
  });

  const detalles = (): DetalleAsiento[] => generar.mock.calls[0][3];

  it.each([
    { base: .02, tax: 0, cost: 0 },
    { base: 0, tax: .01, cost: 0 },
    { base: .02, tax: 0, cost: 4.5 },
    { base: 0, tax: .01, cost: 4.5 },
  ])('D26 contabiliza una NC de céntimos sin componentes cero: %p', async ({ base, tax, cost }) => {
    await service.generarAsientoNotaCredito({
      tenant_id: 'tenant-1', fecha: '2026-11-05', base_imponible: base,
      igv: tax, total: base + tax, monto_pendiente: base + tax,
      customerCreditBalance: 0, costo_ventas: cost,
    });
    expect(detalles().every(line => (line.debe > 0 && line.haber === 0)
      || (line.haber > 0 && line.debe === 0))).toBe(true);
    expect(Math.round(detalles().reduce((sum, line) => sum + line.debe, 0) * 100))
      .toBe(Math.round((base + tax + cost) * 100));
    expect(Math.round(detalles().reduce((sum, line) => sum + line.haber, 0) * 100))
      .toBe(Math.round((base + tax + cost) * 100));
    const requested = plan.obtenerCuentasPorCodigos.mock.calls[0][1];
    expect(requested.includes('40')).toBe(tax > 0);
    expect(requested.includes('70')).toBe(base > 0);
  });

  it('reparte la NC entre CxC y pasivo 122 sin duplicar el total', async () => {
    await service.generarAsientoNotaCredito({
      tenant_id: 'tenant-1', fecha: '2026-08-09', base_imponible: 100,
      igv: 18, total: 118, monto_pendiente: 40,
      customerCreditBalance: 78, costo_ventas: 30,
      referencia: 'FC01-00000001', event_id: 'evt-nc-1',
    });
    expect(detalles()).toEqual(expect.arrayContaining([
      expect.objectContaining({ cuenta_id: 'cuenta-12', haber: 40 }),
      expect.objectContaining({ cuenta_id: 'cuenta-122', haber: 78 }),
      expect.objectContaining({ cuenta_id: 'cuenta-20', debe: 30 }),
      expect.objectContaining({ cuenta_id: 'cuenta-69', haber: 30 }),
    ]));
  });

  it('no exige cuentas de saldo a favor ni inventario si la nota sólo reduce una CxC', async () => {
    plan.obtenerCuentasPorCodigos.mockImplementationOnce(async (_tenant, codigos) => {
      if (codigos.some(codigo => ['122', '69', '20'].includes(codigo))) throw new Error('Cuenta no utilizada');
      return new Map(codigos.map(codigo => [codigo, cuenta(codigo)]));
    });
    await service.generarAsientoNotaCredito({ tenant_id: 'tenant-1', fecha: '2026-09-12',
      base_imponible: 100, igv: 18, total: 118, monto_pendiente: 118, customerCreditBalance: 0 });
    expect(detalles()).toEqual(expect.arrayContaining([expect.objectContaining({ cuenta_id: 'cuenta-12', haber: 118 })]));
  });

  it('falla cerrado si Cr 12 + Cr 122 no suma la reversión financiera', async () => {
    await expect(service.generarAsientoNotaCredito({
      tenant_id: 'tenant-1', fecha: '2026-08-09', base_imponible: 100,
      igv: 18, total: 118, monto_pendiente: 40,
      customerCreditBalance: 70,
    })).rejects.toThrow('distribución de la nota de crédito no cuadra');
    expect(generar).not.toHaveBeenCalled();
  });

  it('aplica saldo Dr122/Cr12 y reconoce pérdida cambiaria', async () => {
    await service.generarAsientoAplicacionSaldoFavor({
      tenant_id: 'tenant-1', fecha: '2026-08-09', montoPasivo: 100,
      montoCxc: 105, diferenciaCambio: 5, referencia: 'SALDO-1', event_id: 'evt-apply',
    });
    expect(detalles()).toEqual(expect.arrayContaining([
      expect.objectContaining({ cuenta_id: 'cuenta-122', debe: 100 }),
      expect.objectContaining({ cuenta_id: 'cuenta-12', haber: 105 }),
      expect.objectContaining({ cuenta_id: 'cuenta-676', debe: 5 }),
    ]));
  });

  it('reembolsa Dr122/Cr10 y reconoce ganancia cambiaria', async () => {
    await service.generarAsientoReembolsoSaldoFavor({
      tenant_id: 'tenant-1', fecha: '2026-08-09', montoPasivo: 100,
      montoTesoreria: 95, diferenciaCambio: -5, medio: 'BANCO',
      referencia: 'SALDO-1', event_id: 'evt-refund',
    });
    expect(detalles()).toEqual(expect.arrayContaining([
      expect.objectContaining({ cuenta_id: 'cuenta-122', debe: 100 }),
      expect.objectContaining({ cuenta_id: 'cuenta-10', haber: 95 }),
      expect.objectContaining({ cuenta_id: 'cuenta-776', haber: 5 }),
    ]));
  });
});
