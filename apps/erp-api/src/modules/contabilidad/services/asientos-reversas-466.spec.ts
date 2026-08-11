import { AsientosGeneratorService, DetalleAsiento } from './asientos-generator.service';

describe('AsientosGeneratorService - reversas de cobros 466', () => {
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
    generar = jest.spyOn(service, 'generarAsiento').mockResolvedValue({ id: 'asiento-466' } as any);
  });

  const detalles = (): DetalleAsiento[] => generar.mock.calls[0][3];
  const balance = (items: DetalleAsiento[]) => ({
    debe: items.reduce((sum, item) => sum + Number(item.debe), 0),
    haber: items.reduce((sum, item) => sum + Number(item.haber), 0),
  });

  it('revierte cobro con ganancia: Dr12 + Dr776 / Cr10', async () => {
    await service.generarAsientoReversaCobro({
      tenant_id: 'tenant-1', fecha: '2026-08-10', monto: 100,
      montoContabilizado: 370, montoLiquidacion: 380,
      diferenciaCambio: 10, referencia: 'F001-1', event_id: 'evt-466-cobro-1',
    });
    expect(detalles()).toEqual(expect.arrayContaining([
      expect.objectContaining({ cuenta_id: 'cuenta-12', debe: 370, haber: 0 }),
      expect.objectContaining({ cuenta_id: 'cuenta-10', debe: 0, haber: 380 }),
      expect.objectContaining({ cuenta_id: 'cuenta-776', debe: 10, haber: 0 }),
    ]));
    expect(balance(detalles())).toEqual({ debe: 380, haber: 380 });
  });

  it('revierte cobro con pérdida: Dr12 / Cr10 + Cr676', async () => {
    await service.generarAsientoReversaCobro({
      tenant_id: 'tenant-1', fecha: '2026-08-10', monto: 100,
      montoContabilizado: 370, montoLiquidacion: 360,
      diferenciaCambio: -10, referencia: 'F001-2', event_id: 'evt-466-cobro-2',
    });
    expect(detalles()).toEqual(expect.arrayContaining([
      expect.objectContaining({ cuenta_id: 'cuenta-12', debe: 370, haber: 0 }),
      expect.objectContaining({ cuenta_id: 'cuenta-10', debe: 0, haber: 360 }),
      expect.objectContaining({ cuenta_id: 'cuenta-676', debe: 0, haber: 10 }),
    ]));
    expect(balance(detalles())).toEqual({ debe: 370, haber: 370 });
  });

  it('revierte reembolso RMA y opone la pérdida cambiaria original', async () => {
    await service.generarAsientoReversaReembolsoSaldoFavor({
      tenant_id: 'tenant-1', fecha: '2026-08-10', monto: 20,
      montoPasivo: 74, montoTesoreria: 76, diferenciaCambio: 2,
      medio: 'CAJA', referencia: 'REV-SALDO-1', event_id: 'evt-466-rma-1',
    });
    expect(detalles()).toEqual(expect.arrayContaining([
      expect.objectContaining({ cuenta_id: 'cuenta-10', debe: 76, haber: 0 }),
      expect.objectContaining({ cuenta_id: 'cuenta-122', debe: 0, haber: 74 }),
      expect.objectContaining({ cuenta_id: 'cuenta-676', debe: 0, haber: 2 }),
    ]));
    expect(balance(detalles())).toEqual({ debe: 76, haber: 76 });
  });

  it('falla cerrado cuando la valuación no reproduce la diferencia original', async () => {
    await expect(service.generarAsientoReversaCobro({
      tenant_id: 'tenant-1', fecha: '2026-08-10', monto: 100,
      montoContabilizado: 370, montoLiquidacion: 380,
      diferenciaCambio: -10, event_id: 'evt-466-invalid',
    })).rejects.toThrow('Valuación de reversa de cobro inconsistente');
    expect(generar).not.toHaveBeenCalled();
  });

  it.each([
    ['RETENCION', '12', '40114'],
    ['DETRACCION', '12', '1042'],
    ['ANTICIPO', '12', '122'],
    ['PERCEPCION', '40113', '12'],
  ])('revierte %s con el debe/haber exactamente opuesto', async (tipo, debe, haber) => {
    await service.generarAsientoReversaAjusteCxc({
      tenant_id: 'tenant-1', fecha: '2026-08-10', tipoMovimiento: tipo,
      montoContabilizado: 18, referencia: 'F001-1', event_id: `evt-466-${tipo}`,
    });
    expect(detalles()).toEqual([
      expect.objectContaining({ cuenta_id: `cuenta-${debe}`, debe: 18, haber: 0 }),
      expect.objectContaining({ cuenta_id: `cuenta-${haber}`, debe: 0, haber: 18 }),
    ]);
  });
});
