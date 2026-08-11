import { Test, TestingModule } from '@nestjs/testing';
import { AsientosGeneratorService } from './asientos-generator.service';
import { PlanCuentasService } from './plan-cuentas.service';
import { PeriodosService } from './periodos.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';

describe('AsientosGeneratorService — asiento de cobro', () => {
  let service: AsientosGeneratorService;
  let generarAsiento: jest.SpyInstance;
  let codigosPedidos: string[];

  const cuentas = new Map<string, any>([
    ['10', { id: 'cuenta-10', codigo: '10' }],
    ['12', { id: 'cuenta-12', codigo: '12' }],
    ['676', { id: 'cuenta-676', codigo: '676' }],
    ['776', { id: 'cuenta-776', codigo: '776' }],
  ]);

  beforeEach(async () => {
    codigosPedidos = [];
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AsientosGeneratorService,
        {
          provide: SupabaseService,
          useValue: { getClient: jest.fn(() => ({ from: jest.fn() })) },
        },
        {
          provide: PlanCuentasService,
          useValue: {
            obtenerCuentasPorCodigos: jest.fn(async (_tenant: string, codigos: string[]) => {
              codigosPedidos = codigos;
              return cuentas;
            }),
          },
        },
        { provide: PeriodosService, useValue: { validarPeriodoAbierto: jest.fn() } },
      ],
    }).compile();

    service = module.get(AsientosGeneratorService);
    generarAsiento = jest
      .spyOn(service as any, 'generarAsiento')
      .mockResolvedValue({ id: 'asiento-cobro-1' });
  });

  const lineas = () => generarAsiento.mock.calls[0][3] as any[];
  const cuadra = (detalles: any[]) =>
    Math.round(detalles.reduce((sum, item) => sum + item.debe, 0) * 100) ===
    Math.round(detalles.reduce((sum, item) => sum + item.haber, 0) * 100);

  it('mantiene el cobro local Dr 10 / Cr 12 sin cuentas de diferencia', async () => {
    await service.generarAsientoCobro({
      tenant_id: 'tenant-1',
      fecha: '2026-08-09',
      monto: 500,
    });

    expect(lineas()).toEqual([
      expect.objectContaining({ cuenta_id: 'cuenta-10', debe: 500, haber: 0 }),
      expect.objectContaining({ cuenta_id: 'cuenta-12', debe: 0, haber: 500 }),
    ]);
    expect(codigosPedidos).toEqual(['10', '12']);
  });

  it('reconoce ganancia cuando la liquidación supera el valor de la CxC', async () => {
    await service.generarAsientoCobro({
      tenant_id: 'tenant-1',
      fecha: '2026-08-09',
      monto: 1000,
      montoContabilizado: 3700,
      montoLiquidacion: 3800,
      diferenciaCambio: 100,
    });

    expect(cuadra(lineas())).toBe(true);
    expect(lineas()).toEqual(expect.arrayContaining([
      expect.objectContaining({ cuenta_id: 'cuenta-10', debe: 3800, haber: 0 }),
      expect.objectContaining({ cuenta_id: 'cuenta-12', debe: 0, haber: 3700 }),
      expect.objectContaining({ cuenta_id: 'cuenta-776', debe: 0, haber: 100 }),
    ]));
  });

  it('reconoce pérdida cuando la liquidación queda por debajo del valor de la CxC', async () => {
    await service.generarAsientoCobro({
      tenant_id: 'tenant-1',
      fecha: '2026-08-09',
      monto: 1000,
      montoContabilizado: 3700,
      montoLiquidacion: 3600,
      diferenciaCambio: -100,
    });

    expect(cuadra(lineas())).toBe(true);
    expect(lineas()).toEqual(expect.arrayContaining([
      expect.objectContaining({ cuenta_id: 'cuenta-10', debe: 3600, haber: 0 }),
      expect.objectContaining({ cuenta_id: 'cuenta-12', debe: 0, haber: 3700 }),
      expect.objectContaining({ cuenta_id: 'cuenta-676', debe: 100, haber: 0 }),
    ]));
  });

  it('falla cerrado si los importes FX no forman la diferencia informada', async () => {
    await expect(service.generarAsientoCobro({
      tenant_id: 'tenant-1',
      fecha: '2026-08-09',
      monto: 1000,
      montoContabilizado: 3700,
      montoLiquidacion: 3800,
      diferenciaCambio: -100,
    })).rejects.toThrow('Valuación de cobro inconsistente');
    expect(generarAsiento).not.toHaveBeenCalled();
  });
});
