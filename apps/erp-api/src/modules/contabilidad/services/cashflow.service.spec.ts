import { CashflowService } from './cashflow.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { EstadosFinancierosService } from './estados-financieros.service';

// Helper para simular el builder de Supabase
const createMockClient = (datasets: any[][]) => {
  let call = 0;
  return {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockImplementation(() => {
      const data = datasets[Math.min(call, datasets.length - 1)];
      call += 1;
      return Promise.resolve({ data, error: null });
    }),
  };
};

describe('CashflowService', () => {
  let service: CashflowService;
  let supabaseService: jest.Mocked<SupabaseService>;
  let estadosFinancieros: jest.Mocked<EstadosFinancierosService>;

  beforeEach(() => {
    supabaseService = {
      getClient: jest.fn(),
    } as any;

    estadosFinancieros = {
      getEstadoResultados: jest.fn(),
    } as any;

    service = new CashflowService(supabaseService as any, estadosFinancieros as any);
  });

  it('calcula cashflow indirecto con variaciones de capital de trabajo', async () => {
    const currentBalance = [
      { cuenta: '12', saldo_final: 120 },
      { cuenta: '20', saldo_final: 200 },
      { cuenta: '42', saldo_final: 80 },
      { cuenta: '33', saldo_final: 300 },
      { cuenta: '45', saldo_final: 400 },
    ];
    const prevBalance = [
      { cuenta: '12', saldo_final: 100 },
      { cuenta: '20', saldo_final: 150 },
      { cuenta: '42', saldo_final: 60 },
      { cuenta: '33', saldo_final: 250 },
      { cuenta: '45', saldo_final: 350 },
    ];

    const mockClient = createMockClient([currentBalance, prevBalance]);
    supabaseService.getClient.mockReturnValue(mockClient as any);

    estadosFinancieros.getEstadoResultados.mockResolvedValue({
      ingresos: { total_ingresos: 0 },
      costos: { costo_ventas: 0 },
      gastos: { total_gastos: 0 },
      utilidad_neta: 50,
    } as any);

    const result = await service.getCashFlow('tenant', 2025, 5);

    expect(result.detalle.utilidadNeta).toBe(50);
    expect(result.detalle.variacionCxc).toBe(20); // 120-100
    expect(result.detalle.variacionInventario).toBe(50); // 200-150
    expect(result.detalle.variacionCxp).toBe(20); // 80-60
    expect(result.detalle.variacionInversiones).toBe(50); // 300-250
    expect(result.detalle.variacionFinanciamiento).toBe(50); // 400-350
    // operativo = 50 - 20 - 50 + 20 = 0
    expect(result.operativo).toBe(0);
    expect(result.inversion).toBe(-50);
    expect(result.financiamiento).toBe(50);
    expect(result.neto).toBe(0);
  });

  it('calcula ratios financieros básicos', async () => {
    const balance = [
      { cuenta: '10', saldo_final: 100 },
      { cuenta: '12', saldo_final: 120 },
      { cuenta: '20', saldo_final: 200 },
      { cuenta: '40', saldo_final: 10 },
      { cuenta: '42', saldo_final: 80 },
    ];

    const mockClient = createMockClient([balance]);
    supabaseService.getClient.mockReturnValue(mockClient as any);

    estadosFinancieros.getEstadoResultados.mockResolvedValue({
      ingresos: { total_ingresos: 500 },
      costos: { costo_ventas: 300, utilidad_bruta: 200 },
      gastos: { total_gastos: 100 },
      utilidad_neta: 100,
    } as any);

    const result = await service.getRatios('tenant', 2025, 5);

    // activos corrientes = 10+12+20 = 420; pasivos corrientes = 40+42 = 90
    expect(result.liquidez).toBeCloseTo(420 / 90, 6);
    expect(result.pruebaAcida).toBeCloseTo((420 - 200) / 90, 6);
    // ebitda = ventas - costo - gastos = 500-300-100 = 100 => margin 0.2
    expect(result.ebitdaMargin).toBeCloseTo(0.2, 6);
    expect(result.dso).toBeCloseTo((120 / 500) * 30, 6);
    expect(result.dpo).toBeCloseTo((80 / 300) * 30, 6);
    expect(result.dio).toBeCloseTo((200 / 300) * 30, 6);
    expect(result.rotacionInventario).toBeCloseTo(300 / 200, 6);
  });
});
