import { Test, TestingModule } from '@nestjs/testing';
import { AsientosGeneratorService } from './asientos-generator.service';
import { PlanCuentasService } from './plan-cuentas.service';
import { PeriodosService } from './periodos.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';

/**
 * Asiento de pago a proveedor con diferencia de cambio realizada.
 *
 * El pasivo se cancela por su valor contabilizado y el banco se acredita por lo
 * efectivamente desembolsado. La brecha entre ambos va a resultados.
 */
describe('AsientosGeneratorService — asiento de pago', () => {
  let service: AsientosGeneratorService;
  let generarAsiento: jest.SpyInstance;

  const TENANT = 'tenant-1';

  const cuentas = new Map<string, any>([
    ['42', { id: 'cuenta-42', codigo: '42' }],
    ['10', { id: 'cuenta-10', codigo: '10' }],
    ['676', { id: 'cuenta-676', codigo: '676' }],
    ['776', { id: 'cuenta-776', codigo: '776' }]
  ]);

  let codigosPedidos: string[] = [];

  beforeEach(async () => {
    codigosPedidos = [];

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AsientosGeneratorService,
        {
          provide: SupabaseService,
          useValue: { getClient: jest.fn(() => ({ from: jest.fn() })) }
        },
        {
          provide: PlanCuentasService,
          useValue: {
            obtenerCuentasPorCodigos: jest.fn(async (_tenant: string, codigos: string[]) => {
              codigosPedidos = codigos;
              return cuentas;
            })
          }
        },
        { provide: PeriodosService, useValue: { validarPeriodoAbierto: jest.fn() } }
      ]
    }).compile();

    service = module.get<AsientosGeneratorService>(AsientosGeneratorService);
    generarAsiento = jest
      .spyOn(service as any, 'generarAsiento')
      .mockResolvedValue({ id: 'asiento-1' });
  });

  afterEach(() => jest.clearAllMocks());

  const lineasDe = () => generarAsiento.mock.calls[0][3] as any[];
  const cuadra = (lineas: any[]) =>
    Math.round(lineas.reduce((s, l) => s + l.debe, 0) * 100) ===
    Math.round(lineas.reduce((s, l) => s + l.haber, 0) * 100);

  it('un pago en moneda local conserva el comportamiento anterior', async () => {
    await service.generarAsientoPago({
      tenant_id: TENANT,
      fecha: '2026-09-15',
      monto: 1000
    });

    const lineas = lineasDe();
    expect(lineas).toHaveLength(2);
    expect(lineas[0]).toMatchObject({ cuenta_id: 'cuenta-42', debe: 1000 });
    expect(lineas[1]).toMatchObject({ cuenta_id: 'cuenta-10', haber: 1000 });
    // No se piden las cuentas de resultado si no hay diferencia: pedirlas las
    // crearía en tenants que nunca operan en divisa.
    expect(codigosPedidos).toEqual(['42', '10']);
  });

  it('una pérdida por diferencia de cambio se carga a 676 y el asiento cuadra', async () => {
    await service.generarAsientoPago({
      tenant_id: TENANT,
      fecha: '2026-09-15',
      monto: 1000,
      montoContabilizado: 3700,
      montoLiquidacion: 3800,
      diferenciaCambio: -100
    });

    const lineas = lineasDe();
    expect(cuadra(lineas)).toBe(true);
    expect(lineas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cuenta_id: 'cuenta-42', debe: 3700, haber: 0 }),
        expect.objectContaining({ cuenta_id: 'cuenta-10', debe: 0, haber: 3800 }),
        expect.objectContaining({ cuenta_id: 'cuenta-676', debe: 100, haber: 0 })
      ])
    );
  });

  it('una ganancia por diferencia de cambio se abona a 776 y el asiento cuadra', async () => {
    await service.generarAsientoPago({
      tenant_id: TENANT,
      fecha: '2026-09-15',
      monto: 1000,
      montoContabilizado: 3700,
      montoLiquidacion: 3600,
      diferenciaCambio: 100
    });

    const lineas = lineasDe();
    expect(cuadra(lineas)).toBe(true);
    expect(lineas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cuenta_id: 'cuenta-42', debe: 3700, haber: 0 }),
        expect.objectContaining({ cuenta_id: 'cuenta-10', debe: 0, haber: 3600 }),
        expect.objectContaining({ cuenta_id: 'cuenta-776', debe: 0, haber: 100 })
      ])
    );
  });

  it('un evento sin valuación cae en el monto del documento sin romperse', async () => {
    // Eventos emitidos antes de la Fase 2 siguen llegando desde el outbox.
    await service.generarAsientoPago({
      tenant_id: TENANT,
      fecha: '2026-09-15',
      monto: 500,
      diferenciaCambio: undefined
    });

    const lineas = lineasDe();
    expect(cuadra(lineas)).toBe(true);
    expect(lineas).toHaveLength(2);
  });
});
