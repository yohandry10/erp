import { Test, TestingModule } from '@nestjs/testing';
import { AsientosGeneratorService } from './asientos-generator.service';
import { PlanCuentasService } from './plan-cuentas.service';
import { PeriodosService } from './periodos.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';

describe('AsientosGeneratorService — cuenta contable del banco', () => {
  let service: AsientosGeneratorService;
  let generarAsiento: jest.SpyInstance;
  let cuentaDelBanco: any;
  let filtros: Array<[string, unknown]>;

  const cuentas = new Map<string, any>([
    ['10', { id: 'cuenta-10', codigo: '10', acepta_movimiento: false }],
    ['12', { id: 'cuenta-12', codigo: '12', acepta_movimiento: true }],
    ['42', { id: 'cuenta-42', codigo: '42', acepta_movimiento: true }],
    ['122', { id: 'cuenta-122', codigo: '122', acepta_movimiento: true }],
  ]);

  beforeEach(async () => {
    filtros = [];
    cuentaDelBanco = { id: 'cuenta-1041', codigo: '1041', acepta_movimiento: true };
    const query: any = {
      select: jest.fn(() => query),
      eq: jest.fn((columna: string, valor: unknown) => { filtros.push([columna, valor]); return query; }),
      maybeSingle: jest.fn(async () => ({ data: { cuenta_contable_id: 'pc-1041' }, error: null })),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AsientosGeneratorService,
        { provide: SupabaseService, useValue: { getClient: jest.fn(() => ({ from: jest.fn(() => query) })) } },
        {
          provide: PlanCuentasService,
          useValue: {
            obtenerCuentasPorCodigos: jest.fn(async () => cuentas),
            obtenerCuentaPorId: jest.fn(async () => cuentaDelBanco),
          },
        },
        { provide: PeriodosService, useValue: { validarPeriodoAbierto: jest.fn() } },
      ],
    }).compile();
    service = module.get(AsientosGeneratorService);
    generarAsiento = jest.spyOn(service as any, 'generarAsiento').mockResolvedValue({ id: 'asiento-1' });
  });

  const lineas = () => generarAsiento.mock.calls[0][3] as any[];

  it('debita la cuenta contable del banco del cobro y no la 10 de resumen', async () => {
    await service.generarAsientoCobro({
      tenant_id: 'tenant-1', fecha: '2026-10-05', monto: 1500, cuenta_bancaria_id: 'banco-1',
    });
    expect(lineas()).toEqual([
      expect.objectContaining({ cuenta_id: 'cuenta-1041', debe: 1500, haber: 0 }),
      expect.objectContaining({ cuenta_id: 'cuenta-12', debe: 0, haber: 1500 }),
    ]);
    expect(filtros).toEqual([['tenant_id', 'tenant-1'], ['id', 'banco-1']]);
  });

  it('acredita la cuenta contable del banco en el pago a proveedor', async () => {
    await service.generarAsientoPago({
      tenant_id: 'tenant-1', fecha: '2026-10-05', monto: 800, cuentaBancariaId: 'banco-1',
    });
    expect(lineas()).toEqual([
      expect.objectContaining({ cuenta_id: 'cuenta-42', debe: 800, haber: 0 }),
      expect.objectContaining({ cuenta_id: 'cuenta-1041', debe: 0, haber: 800 }),
    ]);
  });

  it('acredita la cuenta contable del banco en el reembolso de saldo a favor', async () => {
    await service.generarAsientoReembolsoSaldoFavor({
      tenant_id: 'tenant-1', fecha: '2026-10-05', monto: 200, cuenta_bancaria_id: 'banco-1',
    });
    expect(lineas()).toEqual(expect.arrayContaining([
      expect.objectContaining({ cuenta_id: 'cuenta-1041', debe: 0, haber: 200 }),
    ]));
  });

  it('rechaza una cuenta del banco que no acepta movimientos', async () => {
    cuentaDelBanco = { id: 'cuenta-104', codigo: '104', acepta_movimiento: false };
    await expect(service.generarAsientoCobro({
      tenant_id: 'tenant-1', fecha: '2026-10-05', monto: 10, cuenta_bancaria_id: 'banco-1',
    })).rejects.toThrow('no acepta movimientos');
  });
});
