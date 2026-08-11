import { AsientosGeneratorService, DetalleAsiento } from './asientos-generator.service';

describe('AsientosGeneratorService - notas referenciadas 472', () => {
  const cuenta = (codigo: string) => ({
    id: `cuenta-${codigo}`, tenant_id: 'tenant-472', codigo,
    nombre: codigo, tipo: 'ACTIVO', nivel: 1,
    acepta_movimiento: true, estado: 'ACTIVO',
  } as any);
  const plan = {
    obtenerCuentasPorCodigos: jest.fn(async (_tenant: string, codigos: string[]) =>
      new Map(codigos.map((codigo) => [codigo, cuenta(codigo)]))),
  };
  let service: AsientosGeneratorService;
  let generar: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AsientosGeneratorService({} as any, {} as any, plan as any);
    generar = jest.spyOn(service, 'generarAsiento').mockResolvedValue({ id: 'asiento-472' } as any);
  });

  const detalles = (): DetalleAsiento[] => generar.mock.calls[0][3];

  it('reconoce la ND como Dr12 / Cr70 + Cr40 sin inventario', async () => {
    await service.generarAsientoNotaDebito({
      tenant_id: 'tenant-472', fecha: '2026-08-10',
      base_imponible: 100, igv: 18, total: 118,
      referencia: 'FD01-00000001', event_id: 'evt-nd-472',
    });

    expect(detalles()).toEqual([
      expect.objectContaining({ cuenta_id: 'cuenta-12', debe: 118, haber: 0 }),
      expect.objectContaining({ cuenta_id: 'cuenta-70', debe: 0, haber: 100 }),
      expect.objectContaining({ cuenta_id: 'cuenta-40', debe: 0, haber: 18 }),
    ]);
    expect(detalles().some((d) => ['cuenta-20', 'cuenta-69'].includes(d.cuenta_id))).toBe(false);
  });

  it('falla cerrado si base e impuestos no cuadran con el total', async () => {
    await expect(service.generarAsientoNotaDebito({
      tenant_id: 'tenant-472', fecha: '2026-08-10',
      base_imponible: 100, igv: 18, total: 100,
    })).rejects.toThrow('Importes inválidos');
    expect(generar).not.toHaveBeenCalled();
  });
});
