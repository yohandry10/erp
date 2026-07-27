import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PresupuestosService } from './presupuestos.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { CreatePresupuestoDto, UpdatePresupuestoDto, EstadoPresupuesto } from '@erp-suite/dtos';

describe('PresupuestosService', () => {
  let service: PresupuestosService;
  let supabaseService: jest.Mocked<SupabaseService>;

  const mockSupabaseClient = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn(),
    single: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PresupuestosService,
        {
          provide: SupabaseService,
          useValue: {
            getClient: jest.fn(() => mockSupabaseClient),
          },
        },
      ],
    }).compile();

    service = module.get<PresupuestosService>(PresupuestosService);
    supabaseService = module.get(SupabaseService) as jest.Mocked<SupabaseService>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('crearPresupuesto', () => {
    const tenantId = '55555555-5555-5555-5555-555555555555';
    const userId = 'user-123';
    const createDto: CreatePresupuestoDto = {
      centro_costo_id: 'centro-123',
      cuenta_id: 'cuenta-123',
      periodo_contable_id: 'periodo-123',
      monto_presupuestado: 10000,
      notas: 'Test presupuesto',
      estado: EstadoPresupuesto.ACTIVO,
    };

    it('debe rechazar presupuesto con monto negativo o cero', async () => {
      const invalidDto = { ...createDto, monto_presupuestado: 0 };

      await expect(service.crearPresupuesto(tenantId, invalidDto, userId)).rejects.toThrow(
        BadRequestException
      );
      await expect(service.crearPresupuesto(tenantId, invalidDto, userId)).rejects.toThrow(
        'El monto presupuestado debe ser mayor a cero'
      );
    });

    it('debe rechazar presupuesto duplicado (mismo centro + cuenta + período)', async () => {
      // Mock: verificar duplicado - encontrar presupuesto existente
      mockSupabaseClient.maybeSingle.mockResolvedValue({
        data: { id: 'presupuesto-existente-123' },
        error: null,
      });

      await expect(service.crearPresupuesto(tenantId, createDto, userId)).rejects.toThrow(
        BadRequestException
      );
      await expect(service.crearPresupuesto(tenantId, createDto, userId)).rejects.toThrow(
        'Ya existe un presupuesto para este centro de costo, cuenta y período'
      );

      // Verificar que se llamó la consulta de duplicados
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('presupuestos');
      expect(mockSupabaseClient.select).toHaveBeenCalledWith('id');
    });

  });

  describe('obtenerAlertasSobregiro', () => {
    const tenantId = '55555555-5555-5555-5555-555555555555';
    const periodoId = 'periodo-123';

    it('debe retornar alertas de sobregiro para presupuestos excedidos (>100%)', async () => {
      // Mock: obtener presupuestos activos
      const mockPresupuestos = [
        {
          id: 'presupuesto-1',
          tenant_id: tenantId,
          centro_costo_id: 'centro-1',
          cuenta_id: 'cuenta-1',
          periodo_contable_id: periodoId,
          monto_presupuestado: 10000,
          monto_comprometido: 0,
          estado: EstadoPresupuesto.ACTIVO,
          centros_costo: { id: 'centro-1', codigo: 'CC001', nombre: 'Administración' },
          plan_cuentas: { id: 'cuenta-1', codigo: '94', nombre: 'Gastos Administrativos' },
          periodos_contables: { id: periodoId, anio: 2025, mes: 10, estado: 'ABIERTO' },
        },
      ];

      // Mock the chain for obtaining presupuestos
      const mockChain = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({ data: mockPresupuestos, error: null }),
      };

      supabaseService.getClient = jest.fn(() => mockChain as any);

      // Mock calcularMontoEjecutado para retornar 12000 (120% del presupuesto)
      jest.spyOn(service, 'calcularMontoEjecutado').mockResolvedValue(12000);

      const alertas = await service.obtenerAlertasSobregiro(tenantId, periodoId);

      expect(alertas).toHaveLength(1);
      expect(alertas[0].nivel_alerta).toBe('SOBREGIRO');
      expect(alertas[0].severidad).toBe('CRITICO');
      expect(alertas[0].porcentaje_ejecutado).toBe(120);
      expect(alertas[0].excedente).toBe(2000);
      expect(alertas[0].mensaje).toContain('SOBREGIRO');
    });

    it('debe retornar alertas de advertencia para presupuestos entre 90% y 100%', async () => {
      const mockPresupuestos = [
        {
          id: 'presupuesto-2',
          tenant_id: tenantId,
          centro_costo_id: 'centro-2',
          cuenta_id: 'cuenta-2',
          periodo_contable_id: periodoId,
          monto_presupuestado: 10000,
          monto_comprometido: 0,
          estado: EstadoPresupuesto.ACTIVO,
          centros_costo: { id: 'centro-2', codigo: 'CC002', nombre: 'Ventas' },
          plan_cuentas: { id: 'cuenta-2', codigo: '95', nombre: 'Gastos de Ventas' },
          periodos_contables: { id: periodoId, anio: 2025, mes: 10, estado: 'ABIERTO' },
        },
      ];

      const mockChain = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({ data: mockPresupuestos, error: null }),
      };

      supabaseService.getClient = jest.fn(() => mockChain as any);

      // Mock calcularMontoEjecutado para retornar 9500 (95% del presupuesto)
      jest.spyOn(service, 'calcularMontoEjecutado').mockResolvedValue(9500);

      const alertas = await service.obtenerAlertasSobregiro(tenantId, periodoId);

      expect(alertas).toHaveLength(1);
      expect(alertas[0].nivel_alerta).toBe('ADVERTENCIA');
      expect(alertas[0].severidad).toBe('ALTO');
      expect(alertas[0].porcentaje_ejecutado).toBe(95);
      expect(alertas[0].monto_disponible).toBe(500);
      expect(alertas[0].mensaje).toContain('ADVERTENCIA');
    });

    it('debe retornar array vacío si no hay presupuestos con alertas (<90%)', async () => {
      const mockPresupuestos = [
        {
          id: 'presupuesto-3',
          tenant_id: tenantId,
          centro_costo_id: 'centro-3',
          cuenta_id: 'cuenta-3',
          periodo_contable_id: periodoId,
          monto_presupuestado: 10000,
          monto_comprometido: 0,
          estado: EstadoPresupuesto.ACTIVO,
          centros_costo: { id: 'centro-3', codigo: 'CC003', nombre: 'Producción' },
          plan_cuentas: { id: 'cuenta-3', codigo: '60', nombre: 'Compras' },
          periodos_contables: { id: periodoId, anio: 2025, mes: 10, estado: 'ABIERTO' },
        },
      ];

      const mockChain = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({ data: mockPresupuestos, error: null }),
      };

      supabaseService.getClient = jest.fn(() => mockChain as any);

      // Mock calcularMontoEjecutado para retornar 5000 (50% del presupuesto)
      jest.spyOn(service, 'calcularMontoEjecutado').mockResolvedValue(5000);

      const alertas = await service.obtenerAlertasSobregiro(tenantId, periodoId);

      expect(alertas).toHaveLength(0);
    });

    it('debe ordenar alertas por severidad (CRITICO primero)', async () => {
      const mockPresupuestos = [
        {
          id: 'presupuesto-4',
          tenant_id: tenantId,
          centro_costo_id: 'centro-4',
          cuenta_id: 'cuenta-4',
          periodo_contable_id: periodoId,
          monto_presupuestado: 10000,
          monto_comprometido: 0,
          estado: EstadoPresupuesto.ACTIVO,
          centros_costo: { id: 'centro-4', codigo: 'CC004', nombre: 'Centro A' },
          plan_cuentas: { id: 'cuenta-4', codigo: '94', nombre: 'Gastos A' },
          periodos_contables: { id: periodoId, anio: 2025, mes: 10, estado: 'ABIERTO' },
        },
        {
          id: 'presupuesto-5',
          tenant_id: tenantId,
          centro_costo_id: 'centro-5',
          cuenta_id: 'cuenta-5',
          periodo_contable_id: periodoId,
          monto_presupuestado: 10000,
          monto_comprometido: 0,
          estado: EstadoPresupuesto.ACTIVO,
          centros_costo: { id: 'centro-5', codigo: 'CC005', nombre: 'Centro B' },
          plan_cuentas: { id: 'cuenta-5', codigo: '95', nombre: 'Gastos B' },
          periodos_contables: { id: periodoId, anio: 2025, mes: 10, estado: 'ABIERTO' },
        },
      ];

      const mockChain = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({ data: mockPresupuestos, error: null }),
      };

      supabaseService.getClient = jest.fn(() => mockChain as any);

      // Mock calcularMontoEjecutado: primero 95% (advertencia), luego 110% (sobregiro)
      const calcularMock = jest.spyOn(service, 'calcularMontoEjecutado');
      calcularMock.mockResolvedValueOnce(9500); // 95% - advertencia
      calcularMock.mockResolvedValueOnce(11000); // 110% - sobregiro

      const alertas = await service.obtenerAlertasSobregiro(tenantId, periodoId);

      expect(alertas).toHaveLength(2);
      // El sobregiro debe estar primero
      expect(alertas[0].nivel_alerta).toBe('SOBREGIRO');
      expect(alertas[0].severidad).toBe('CRITICO');
      expect(alertas[1].nivel_alerta).toBe('ADVERTENCIA');
      expect(alertas[1].severidad).toBe('ALTO');
    });
  });

  describe('obtenerComparacionPresupuestoVsReal', () => {
    const tenantId = '55555555-5555-5555-5555-555555555555';
    const periodoId = 'periodo-123';

    it('debe consultar presupuestos sin order embebido invalido y retornar shape completo sin datos', async () => {
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({
        data: { id: periodoId, anio: 2026, mes: 5, estado: 'ABIERTO' },
        error: null,
      });
      mockSupabaseClient.order.mockResolvedValueOnce({ data: [], error: null });

      const comparacion = await service.obtenerComparacionPresupuestoVsReal(tenantId, periodoId);

      expect(mockSupabaseClient.order).toHaveBeenCalledWith('centro_costo_id', { ascending: true });
      expect(mockSupabaseClient.order).not.toHaveBeenCalledWith('plan_cuentas.codigo', expect.anything());
      expect(comparacion.resumen_global).toEqual({
        total_presupuestado: 0,
        total_ejecutado: 0,
        total_comprometido: 0,
        total_disponible: 0,
        total_variacion: 0,
        porcentaje_ejecucion: 0,
        variacion_porcentaje: 0,
        total_centros: 0,
        total_cuentas: 0,
        alertas: {
          sobregiros: 0,
          advertencias: 0,
          normales: 0,
        },
      });
    });
  });

  describe('obtenerResumenAlertas', () => {
    const tenantId = '55555555-5555-5555-5555-555555555555';
    const periodoId = 'periodo-123';

    it('debe generar resumen con contadores de sobregiros y advertencias', async () => {
      const mockAlertas = [
        {
          nivel_alerta: 'SOBREGIRO',
          excedente: 2000,
          monto_presupuestado: 10000,
        },
        {
          nivel_alerta: 'SOBREGIRO',
          excedente: 1500,
          monto_presupuestado: 8000,
        },
        {
          nivel_alerta: 'ADVERTENCIA',
          excedente: -500,
          monto_presupuestado: 12000,
        },
      ];

      jest.spyOn(service, 'obtenerAlertasSobregiro').mockResolvedValue(mockAlertas as any);

      const resumen = await service.obtenerResumenAlertas(tenantId, periodoId);

      expect(resumen.total_alertas).toBe(3);
      expect(resumen.sobregiros.cantidad).toBe(2);
      expect(resumen.sobregiros.total_excedente).toBe(3500);
      expect(resumen.advertencias.cantidad).toBe(1);
      expect(resumen.advertencias.total_en_riesgo).toBe(12000);
      expect(resumen.fecha_generacion).toBeDefined();
    });

    it('debe retornar resumen vacío si no hay alertas', async () => {
      jest.spyOn(service, 'obtenerAlertasSobregiro').mockResolvedValue([]);

      const resumen = await service.obtenerResumenAlertas(tenantId, periodoId);

      expect(resumen.total_alertas).toBe(0);
      expect(resumen.sobregiros.cantidad).toBe(0);
      expect(resumen.sobregiros.total_excedente).toBe(0);
      expect(resumen.advertencias.cantidad).toBe(0);
      expect(resumen.advertencias.total_en_riesgo).toBe(0);
    });
  });
});
