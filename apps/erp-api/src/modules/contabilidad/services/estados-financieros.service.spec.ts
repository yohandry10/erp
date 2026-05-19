import { Test, TestingModule } from '@nestjs/testing';
import { EstadosFinancierosService } from './estados-financieros.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';

describe('EstadosFinancierosService', () => {
  let service: EstadosFinancierosService;
  let supabaseService: SupabaseService;

  const mockSupabaseClient = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lt: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    neq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn(),
    range: jest.fn(),
    single: jest.fn(),
    rpc: jest.fn(),
  };

  const mockSupabaseService = {
    getClient: jest.fn(() => mockSupabaseClient),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EstadosFinancierosService,
        {
          provide: SupabaseService,
          useValue: mockSupabaseService,
        },
      ],
    }).compile();

    service = module.get<EstadosFinancierosService>(EstadosFinancierosService);
    supabaseService = module.get<SupabaseService>(SupabaseService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getBalanceComprobacion', () => {
    it('should calculate Balance de Comprobación correctly', async () => {
      const mockBalance = [
        {
          cuenta: '10',
          nombre_cuenta: 'Efectivo y Equivalentes',
          saldo_inicial: 5000,
          debe: 15000,
          haber: 10000,
          saldo_final: 10000,
          tenant_id: 'tenant-1',
          anio: 2024,
          mes: 1,
        },
        {
          cuenta: '12',
          nombre_cuenta: 'Cuentas por Cobrar',
          saldo_inicial: 8000,
          debe: 12000,
          haber: 5000,
          saldo_final: 15000,
          tenant_id: 'tenant-1',
          anio: 2024,
          mes: 1,
        },
      ];

      mockSupabaseClient.order.mockResolvedValueOnce({
        data: mockBalance,
        error: null,
      });

      const result = await service.getBalanceComprobacion('tenant-1', 2024, 1);

      expect(result).toBeDefined();
      expect(result).toHaveLength(2);
      expect(result[0].cuenta).toBe('10');
      expect(result[0].nombre).toBe('Efectivo y Equivalentes');
      expect(result[0].saldo_inicial).toBe(5000);
      expect(result[0].debe).toBe(15000);
      expect(result[0].haber).toBe(10000);
      expect(result[0].saldo_final).toBe(10000);
    });

    it('should handle empty balance', async () => {
      mockSupabaseClient.order.mockResolvedValueOnce({
        data: [],
        error: null,
      });
      mockSupabaseClient.range.mockResolvedValueOnce({
        data: [],
        error: null,
      });

      const result = await service.getBalanceComprobacion('tenant-1', 2024, 1);

      expect(result).toBeDefined();
      expect(result).toHaveLength(0);
    });

    it('should throw error when database query fails', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
      const dbError = { message: 'Database error' };
      mockSupabaseClient.order.mockResolvedValueOnce({
        data: null,
        error: dbError,
      });

      await expect(
        service.getBalanceComprobacion('tenant-1', 2024, 1)
      ).rejects.toEqual(dbError);

      consoleSpy.mockRestore();
    });

    it('should use cache on subsequent calls', async () => {
      // Crear una nueva instancia del servicio para este test
      const freshModule: TestingModule = await Test.createTestingModule({
        providers: [
          EstadosFinancierosService,
          {
            provide: SupabaseService,
            useValue: mockSupabaseService,
          },
        ],
      }).compile();

      const freshService = freshModule.get<EstadosFinancierosService>(EstadosFinancierosService);

      const mockBalance = [
        {
          cuenta: '10',
          nombre_cuenta: 'Efectivo',
          saldo_inicial: 5000,
          debe: 15000,
          haber: 10000,
          saldo_final: 10000,
          tenant_id: 'tenant-1',
          anio: 2024,
          mes: 2, // Usar mes diferente para evitar conflictos con otros tests
        },
      ];

      // Resetear el mock antes de este test
      jest.clearAllMocks();
      mockSupabaseClient.order.mockResolvedValueOnce({
        data: mockBalance,
        error: null,
      });

      // Primera llamada - debe consultar la BD
      const result1 = await freshService.getBalanceComprobacion('tenant-1', 2024, 2);
      expect(result1).toHaveLength(1);

      // Segunda llamada - debe usar cache (no llamar a BD de nuevo)
      const result2 = await freshService.getBalanceComprobacion('tenant-1', 2024, 2);
      expect(result2).toHaveLength(1);
      expect(result2).toEqual(result1);

      // Verificar que solo se llamó una vez a la BD
      expect(mockSupabaseClient.order).toHaveBeenCalledTimes(1);
    });
  });

  describe('getEstadoResultados', () => {
    it('should calculate Estado de Resultados correctly', async () => {
      const mockEstado = {
        tenant_id: 'tenant-1',
        anio: 2024,
        mes: 1,
        ventas: 10000,
        otros_ingresos: 500,
        costo_ventas: 6000,
        gastos_administrativos: 2000,
        gastos_ventas: 800,
        gastos_financieros: 200,
      };

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockEstado,
        error: null,
      });

      const result = await service.getEstadoResultados('tenant-1', 2024, 1);

      expect(result).toBeDefined();
      expect(result.ingresos.ventas).toBe(10000);
      expect(result.ingresos.otros_ingresos).toBe(500);
      expect(result.ingresos.total_ingresos).toBe(10500);
      expect(result.costos.costo_ventas).toBe(6000);
      expect(result.costos.utilidad_bruta).toBe(4500);
      expect(result.gastos.gastos_administrativos).toBe(2000);
      expect(result.gastos.gastos_ventas).toBe(800);
      expect(result.gastos.gastos_financieros).toBe(200);
      expect(result.gastos.total_gastos).toBe(3000);
      expect(result.utilidad_neta).toBe(1500);
    });

    it('should handle empty estado resultados', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      const result = await service.getEstadoResultados('tenant-1', 2024, 1);

      expect(result).toBeDefined();
      expect(result.ingresos.total_ingresos).toBe(0);
      expect(result.costos.costo_ventas).toBe(0);
      expect(result.utilidad_neta).toBe(0);
    });

    it('should throw error when database query fails', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
      const dbError = { message: 'Database error' };
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: dbError,
      });

      await expect(
        service.getEstadoResultados('tenant-1', 2024, 1)
      ).rejects.toEqual(dbError);

      consoleSpy.mockRestore();
    });

    it('should calculate negative utilidad_neta when gastos exceed ingresos', async () => {
      const mockEstado = {
        tenant_id: 'tenant-1',
        anio: 2024,
        mes: 1,
        ventas: 5000,
        otros_ingresos: 0,
        costo_ventas: 3000,
        gastos_administrativos: 2500,
        gastos_ventas: 800,
        gastos_financieros: 200,
      };

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockEstado,
        error: null,
      });

      const result = await service.getEstadoResultados('tenant-1', 2024, 1);

      expect(result.ingresos.total_ingresos).toBe(5000);
      expect(result.costos.utilidad_bruta).toBe(2000);
      expect(result.gastos.total_gastos).toBe(3500);
      expect(result.utilidad_neta).toBe(-1500); // Pérdida
    });
  });

  describe('getBalanceGeneral', () => {
    it('should calculate Balance General correctly', async () => {
      // Ajustar los números para que la ecuación contable cuadre:
      // Activos = Pasivos + Patrimonio
      // Total Activos: 92000
      // Total Pasivos: 43000
      // Total Patrimonio debe ser: 49000 (para que 43000 + 49000 = 92000)
      // Patrimonio = Capital (30000) + Resultados Acumulados (18000) + Resultado Ejercicio (1000) = 49000

      const mockBalance = {
        tenant_id: 'tenant-1',
        anio: 2024,
        mes: 1,
        efectivo: 10000,
        cuentas_por_cobrar: 15000,
        inventarios: 20000,
        otros_activos_corrientes: 2000,
        activos_fijos: 50000,
        depreciacion_acumulada: 10000,
        otros_activos_no_corrientes: 5000,
        cuentas_por_pagar: 12000,
        tributos_por_pagar: 3000,
        remuneraciones_por_pagar: 5000,
        otros_pasivos_corrientes: 1000,
        deudas_largo_plazo: 20000,
        otros_pasivos_no_corrientes: 2000,
        capital: 30000,
        resultados_acumulados: 18000, // Ajustado para que cuadre
      };

      const mockEstado = {
        tenant_id: 'tenant-1',
        anio: 2024,
        mes: 1,
        ventas: 10000,
        otros_ingresos: 0,
        costo_ventas: 6000,
        gastos_administrativos: 2000,
        gastos_ventas: 800,
        gastos_financieros: 200,
      };

      // Mock para Balance General
      mockSupabaseClient.single
        .mockResolvedValueOnce({
          data: mockBalance,
          error: null,
        })
        // Mock para Estado de Resultados (llamado internamente)
        .mockResolvedValueOnce({
          data: mockEstado,
          error: null,
        });

      const result = await service.getBalanceGeneral('tenant-1', 2024, 1);

      expect(result).toBeDefined();

      // Activos Corrientes
      expect(result.activos.corrientes.efectivo).toBe(10000);
      expect(result.activos.corrientes.cuentas_por_cobrar).toBe(15000);
      expect(result.activos.corrientes.inventarios).toBe(20000);
      expect(result.activos.corrientes.otros_activos).toBe(2000);
      expect(result.activos.corrientes.total_corrientes).toBe(47000);

      // Activos No Corrientes
      expect(result.activos.no_corrientes.activos_fijos).toBe(50000);
      expect(result.activos.no_corrientes.depreciacion_acumulada).toBe(10000);
      expect(result.activos.no_corrientes.activos_fijos_neto).toBe(40000);
      expect(result.activos.no_corrientes.otros_activos).toBe(5000);
      expect(result.activos.no_corrientes.total_no_corrientes).toBe(45000);

      // Total Activos
      expect(result.activos.total_activos).toBe(92000);

      // Pasivos Corrientes
      expect(result.pasivos.corrientes.cuentas_por_pagar).toBe(12000);
      expect(result.pasivos.corrientes.tributos_por_pagar).toBe(3000);
      expect(result.pasivos.corrientes.remuneraciones_por_pagar).toBe(5000);
      expect(result.pasivos.corrientes.otros_pasivos).toBe(1000);
      expect(result.pasivos.corrientes.total_corrientes).toBe(21000);

      // Pasivos No Corrientes
      expect(result.pasivos.no_corrientes.deudas_largo_plazo).toBe(20000);
      expect(result.pasivos.no_corrientes.otros_pasivos).toBe(2000);
      expect(result.pasivos.no_corrientes.total_no_corrientes).toBe(22000);

      // Total Pasivos
      expect(result.pasivos.total_pasivos).toBe(43000);

      // Patrimonio
      expect(result.patrimonio.capital).toBe(30000);
      expect(result.patrimonio.resultados_acumulados).toBe(18000);
      expect(result.patrimonio.resultado_ejercicio).toBe(1000); // De Estado de Resultados
      expect(result.patrimonio.total_patrimonio).toBe(49000);

      // Validar ecuación contable: Activos = Pasivos + Patrimonio
      const totalPasivosPatrimonio = result.pasivos.total_pasivos + result.patrimonio.total_patrimonio;
      expect(result.activos.total_activos).toBe(totalPasivosPatrimonio);
    });

    it('should handle empty balance general', async () => {
      mockSupabaseClient.single
        .mockResolvedValueOnce({
          data: null,
          error: null,
        })
        // Mock para Estado de Resultados
        .mockResolvedValueOnce({
          data: null,
          error: null,
        });

      const result = await service.getBalanceGeneral('tenant-1', 2024, 1);

      expect(result).toBeDefined();
      expect(result.activos.total_activos).toBe(0);
      expect(result.pasivos.total_pasivos).toBe(0);
      expect(result.patrimonio.total_patrimonio).toBe(0);
    });

    it('should throw error when database query fails', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
      const dbError = { message: 'Database error' };
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: dbError,
      });

      await expect(
        service.getBalanceGeneral('tenant-1', 2024, 1)
      ).rejects.toEqual(dbError);

      consoleSpy.mockRestore();
    });

    it('should validate accounting equation (Assets = Liabilities + Equity)', async () => {
      const mockBalance = {
        tenant_id: 'tenant-1',
        anio: 2024,
        mes: 1,
        efectivo: 50000,
        cuentas_por_cobrar: 30000,
        inventarios: 40000,
        otros_activos_corrientes: 5000,
        activos_fijos: 100000,
        depreciacion_acumulada: 20000,
        otros_activos_no_corrientes: 10000,
        cuentas_por_pagar: 25000,
        tributos_por_pagar: 8000,
        remuneraciones_por_pagar: 12000,
        otros_pasivos_corrientes: 5000,
        deudas_largo_plazo: 50000,
        otros_pasivos_no_corrientes: 10000,
        capital: 80000,
        resultados_acumulados: 20000,
      };

      const mockEstado = {
        tenant_id: 'tenant-1',
        anio: 2024,
        mes: 1,
        ventas: 50000,
        otros_ingresos: 5000,
        costo_ventas: 30000,
        gastos_administrativos: 10000,
        gastos_ventas: 5000,
        gastos_financieros: 5000,
      };

      mockSupabaseClient.single
        .mockResolvedValueOnce({
          data: mockBalance,
          error: null,
        })
        .mockResolvedValueOnce({
          data: mockEstado,
          error: null,
        });

      const result = await service.getBalanceGeneral('tenant-1', 2024, 1);

      // Calcular totales
      const totalActivos = result.activos.total_activos;
      const totalPasivos = result.pasivos.total_pasivos;
      const totalPatrimonio = result.patrimonio.total_patrimonio;

      // Validar ecuación contable con tolerancia de 1 centavo
      const diferencia = Math.abs(totalActivos - (totalPasivos + totalPatrimonio));
      expect(diferencia).toBeLessThan(0.01);
    });
  });

  describe('refrescarEstadosFinancieros', () => {
    it('should refresh materialized views and invalidate cache', async () => {
      const mockRpc = jest.fn().mockResolvedValueOnce({
        data: null,
        error: null,
      });

      mockSupabaseClient.rpc = mockRpc;

      await service.refrescarEstadosFinancieros('tenant-1', 2024, 1);

      expect(mockRpc).toHaveBeenCalledWith('refrescar_estados_financieros', {
        p_tenant_id: 'tenant-1',
        p_anio: 2024,
        p_mes: 1,
      });
    });

    it('should throw error when refresh fails', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
      const dbError = { message: 'Refresh failed' };
      const mockRpc = jest.fn().mockResolvedValueOnce({
        data: null,
        error: dbError,
      });

      mockSupabaseClient.rpc = mockRpc;

      await expect(
        service.refrescarEstadosFinancieros('tenant-1', 2024, 1)
      ).rejects.toEqual(dbError);

      consoleSpy.mockRestore();
    });
  });
});
