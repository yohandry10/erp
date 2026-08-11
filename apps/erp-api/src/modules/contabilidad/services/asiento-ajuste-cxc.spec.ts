import { Test, TestingModule } from '@nestjs/testing';
import { AsientosGeneratorService } from './asientos-generator.service';
import { PlanCuentasService } from './plan-cuentas.service';
import { PeriodosService } from './periodos.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';

describe('AsientosGeneratorService — ajustes CxC sin tesorería', () => {
  let service: AsientosGeneratorService;
  let generarAsiento: jest.SpyInstance;
  let codigosPedidos: string[];

  beforeEach(async () => {
    codigosPedidos = [];
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AsientosGeneratorService,
        { provide: SupabaseService, useValue: { getClient: jest.fn(() => ({ from: jest.fn() })) } },
        {
          provide: PlanCuentasService,
          useValue: {
            obtenerCuentasPorCodigos: jest.fn(async (_tenant: string, codigos: string[]) => {
              codigosPedidos = codigos;
              return new Map(codigos.map((codigo) => [codigo, { id: `cuenta-${codigo}`, codigo }]));
            }),
          },
        },
        { provide: PeriodosService, useValue: { validarPeriodoAbierto: jest.fn() } },
      ],
    }).compile();

    service = module.get(AsientosGeneratorService);
    generarAsiento = jest.spyOn(service as any, 'generarAsiento').mockResolvedValue({ id: 'asiento-ajuste' });
  });

  const lineas = () => generarAsiento.mock.calls[0][3] as any[];
  const cuadra = (detalles: any[]) =>
    Math.round(detalles.reduce((sum, item) => sum + item.debe, 0) * 100) ===
    Math.round(detalles.reduce((sum, item) => sum + item.haber, 0) * 100);

  it.each([
    ['RETENCION', '40114'],
    ['DETRACCION', '1042'],
    ['ANTICIPO', '122'],
  ])('%s reduce clientes contra su cuenta específica, nunca caja', async (tipo, cuentaDebe) => {
    await service.generarAsientoAjusteCxc({
      tenant_id: 'tenant-1',
      fecha: '2026-08-09',
      tipoMovimiento: tipo,
      montoContabilizado: 25,
      referencia: 'F001-1',
    });

    expect(cuadra(lineas())).toBe(true);
    expect(lineas()).toEqual(expect.arrayContaining([
      expect.objectContaining({ cuenta_id: `cuenta-${cuentaDebe}`, debe: 25, haber: 0 }),
      expect.objectContaining({ cuenta_id: 'cuenta-12', debe: 0, haber: 25 }),
    ]));
    expect(codigosPedidos).not.toContain('10');
  });

  it('percepción aumenta clientes y reconoce el tributo por pagar', async () => {
    await service.generarAsientoAjusteCxc({
      tenant_id: 'tenant-1',
      fecha: '2026-08-09',
      tipoMovimiento: 'PERCEPCION',
      montoContabilizado: 9,
    });

    expect(cuadra(lineas())).toBe(true);
    expect(lineas()).toEqual([
      expect.objectContaining({ cuenta_id: 'cuenta-12', debe: 9, haber: 0 }),
      expect.objectContaining({ cuenta_id: 'cuenta-40113', debe: 0, haber: 9 }),
    ]);
    expect(codigosPedidos).not.toContain('10');
  });

  it('nota de crédito revierte base e IGV sin fingir un cobro', async () => {
    await service.generarAsientoAjusteCxc({
      tenant_id: 'tenant-1',
      fecha: '2026-08-09',
      tipoMovimiento: 'NOTA_CREDITO',
      montoContabilizado: 118,
      baseAjuste: 100,
      igvAjuste: 18,
    });

    expect(cuadra(lineas())).toBe(true);
    expect(lineas()).toEqual(expect.arrayContaining([
      expect.objectContaining({ cuenta_id: 'cuenta-70', debe: 100, haber: 0 }),
      expect.objectContaining({ cuenta_id: 'cuenta-40', debe: 18, haber: 0 }),
      expect.objectContaining({ cuenta_id: 'cuenta-12', debe: 0, haber: 118 }),
    ]));
    expect(codigosPedidos).not.toContain('10');
  });

  it('falla cerrado si una nota no cuadra', async () => {
    await expect(service.generarAsientoAjusteCxc({
      tenant_id: 'tenant-1',
      fecha: '2026-08-09',
      tipoMovimiento: 'NOTA_CREDITO',
      montoContabilizado: 118,
      baseAjuste: 90,
      igvAjuste: 18,
    })).rejects.toThrow('no cuadran');
    expect(generarAsiento).not.toHaveBeenCalled();
  });
});
