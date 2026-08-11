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
