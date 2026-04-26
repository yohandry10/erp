import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PeriodosService, EstadoPeriodo } from './periodos.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';

describe('PeriodosService', () => {
  let service: PeriodosService;
  let supabaseService: jest.Mocked<SupabaseService>;

  const mockSupabaseClient = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    single: jest.fn(),
    maybeSingle: jest.fn(),
    rpc: jest.fn()
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PeriodosService,
        {
          provide: SupabaseService,
          useValue: {
            getClient: jest.fn(() => mockSupabaseClient)
          }
        },
        {
          provide: 'EstadosFinancierosService',
          useValue: {
            refrescarEstadosFinancieros: jest.fn()
          }
        }
      ]
    }).compile();

    service = module.get<PeriodosService>(PeriodosService);
    supabaseService = module.get(SupabaseService) as jest.Mocked<SupabaseService>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('crearPeriodo', () => {
    it('should create a new period successfully', async () => {
      const tenantId = 'tenant-123';
      const anio = 2024;
      const mes = 1;

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116' }
      });

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: {
          id: 'periodo-123',
          tenant_id: tenantId,
          anio,
          mes,
          estado: EstadoPeriodo.ABIERTO,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        error: null
      });

      const result = await service.crearPeriodo(tenantId, anio, mes);

      expect(result).toBeDefined();
      expect(result.anio).toBe(anio);
      expect(result.mes).toBe(mes);
      expect(result.estado).toBe(EstadoPeriodo.ABIERTO);
    });

    it('should throw error if period already exists', async () => {
      const tenantId = 'tenant-123';
      const anio = 2024;
      const mes = 1;

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: {
          id: 'periodo-123',
          tenant_id: tenantId,
          anio,
          mes,
          estado: EstadoPeriodo.ABIERTO
        },
        error: null
      });

      await expect(service.crearPeriodo(tenantId, anio, mes)).rejects.toThrow(BadRequestException);
    });

    it('should throw error for invalid month', async () => {
      const tenantId = 'tenant-123';
      const anio = 2024;
      const mes = 13;

      await expect(service.crearPeriodo(tenantId, anio, mes)).rejects.toThrow(BadRequestException);
    });
  });

  describe('validarPeriodoAbierto', () => {
    it('should allow operations when period is open', async () => {
      const tenantId = 'tenant-123';
      const fecha = new Date(2024, 0, 15);

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: {
          id: 'periodo-123',
          tenant_id: tenantId,
          anio: 2024,
          mes: 1,
          estado: EstadoPeriodo.ABIERTO
        },
        error: null
      });

      await expect(service.validarPeriodoAbierto(tenantId, fecha)).resolves.not.toThrow();
    });

    it('should throw error when period is closed', async () => {
      const tenantId = 'tenant-123';
      const fecha = new Date(2024, 0, 15);

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: {
          id: 'periodo-123',
          tenant_id: tenantId,
          anio: 2024,
          mes: 1,
          estado: EstadoPeriodo.CERRADO
        },
        error: null
      });

      await expect(service.validarPeriodoAbierto(tenantId, fecha)).rejects.toThrow(BadRequestException);
    });

    it('should throw error when period is blocked', async () => {
      const tenantId = 'tenant-123';
      const fecha = new Date(2024, 0, 15);

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: {
          id: 'periodo-123',
          tenant_id: tenantId,
          anio: 2024,
          mes: 1,
          estado: EstadoPeriodo.BLOQUEADO
        },
        error: null
      });

      await expect(service.validarPeriodoAbierto(tenantId, fecha)).rejects.toThrow(BadRequestException);
    });

    it('should allow operations when period does not exist', async () => {
      const tenantId = 'tenant-123';
      const fecha = new Date(2024, 0, 15);

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116' }
      });

      await expect(service.validarPeriodoAbierto(tenantId, fecha)).resolves.not.toThrow();
    });
  });

  describe('cerrarPeriodo', () => {
    it('should close period when all validations pass', async () => {
      const tenantId = 'tenant-123';
      const anio = 2024;
      const mes = 1;
      const usuarioId = 'user-123';

      // Mock obtenerPeriodo - need to setup the full chain
      const mockObtenerPeriodoChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValueOnce({
          data: {
            id: 'periodo-123',
            tenant_id: tenantId,
            anio,
            mes,
            estado: EstadoPeriodo.ABIERTO
          },
          error: null
        })
      };
      mockSupabaseClient.from.mockReturnValueOnce(mockObtenerPeriodoChain as any);

      // Mock validarAsientosCuadran - query for asientos
      const mockAsientosChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockResolvedValueOnce({
          data: [],
          error: null
        })
      };
      mockSupabaseClient.from.mockReturnValueOnce(mockAsientosChain as any);

      // Mock validarEventosPendientes - query for eventos
      const mockEventosChain = {
        select: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockResolvedValueOnce({
          count: 0,
          error: null
        })
      };
      mockSupabaseClient.from.mockReturnValueOnce(mockEventosChain as any);

      // Mock update period
      const mockUpdateChain = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValueOnce({
          data: {
            id: 'periodo-123',
            tenant_id: tenantId,
            anio,
            mes,
            estado: EstadoPeriodo.CERRADO,
            fecha_cierre: new Date().toISOString(),
            cerrado_por: usuarioId
          },
          error: null
        })
      };
      mockSupabaseClient.from.mockReturnValueOnce(mockUpdateChain as any);

      const result = await service.cerrarPeriodo(tenantId, anio, mes, usuarioId);

      expect(result).toBeDefined();
      expect(result.estado).toBe(EstadoPeriodo.CERRADO);
      expect(result.cerrado_por).toBe(usuarioId);
    });

    it('should throw error if period does not exist', async () => {
      const tenantId = 'tenant-123';
      const anio = 2024;
      const mes = 1;
      const usuarioId = 'user-123';

      const mockObtenerPeriodoChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValueOnce({
          data: null,
          error: { code: 'PGRST116' }
        })
      };
      mockSupabaseClient.from.mockReturnValueOnce(mockObtenerPeriodoChain as any);

      await expect(service.cerrarPeriodo(tenantId, anio, mes, usuarioId)).rejects.toThrow(BadRequestException);
    });

    it('should throw error if period is already closed', async () => {
      const tenantId = 'tenant-123';
      const anio = 2024;
      const mes = 1;
      const usuarioId = 'user-123';

      const mockObtenerPeriodoChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValueOnce({
          data: {
            id: 'periodo-123',
            tenant_id: tenantId,
            anio,
            mes,
            estado: EstadoPeriodo.CERRADO
          },
          error: null
        })
      };
      mockSupabaseClient.from.mockReturnValueOnce(mockObtenerPeriodoChain as any);

      await expect(service.cerrarPeriodo(tenantId, anio, mes, usuarioId)).rejects.toThrow(BadRequestException);
    });
  });

  describe('reabrirPeriodo', () => {
    it('should reopen a closed period', async () => {
      const tenantId = 'tenant-123';
      const anio = 2024;
      const mes = 1;

      // Mock obtenerPeriodo
      const mockObtenerPeriodoChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValueOnce({
          data: {
            id: 'periodo-123',
            tenant_id: tenantId,
            anio,
            mes,
            estado: EstadoPeriodo.CERRADO
          },
          error: null
        })
      };
      mockSupabaseClient.from.mockReturnValueOnce(mockObtenerPeriodoChain as any);

      // Mock update period
      const mockUpdateChain = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValueOnce({
          data: {
            id: 'periodo-123',
            tenant_id: tenantId,
            anio,
            mes,
            estado: EstadoPeriodo.ABIERTO,
            fecha_cierre: null,
            cerrado_por: null
          },
          error: null
        })
      };
      mockSupabaseClient.from.mockReturnValueOnce(mockUpdateChain as any);

      const result = await service.reabrirPeriodo(tenantId, anio, mes);

      expect(result).toBeDefined();
      expect(result.estado).toBe(EstadoPeriodo.ABIERTO);
      expect(result.fecha_cierre).toBeNull();
    });

    it('should throw error if period is already open', async () => {
      const tenantId = 'tenant-123';
      const anio = 2024;
      const mes = 1;

      const mockObtenerPeriodoChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValueOnce({
          data: {
            id: 'periodo-123',
            tenant_id: tenantId,
            anio,
            mes,
            estado: EstadoPeriodo.ABIERTO
          },
          error: null
        })
      };
      mockSupabaseClient.from.mockReturnValueOnce(mockObtenerPeriodoChain as any);

      await expect(service.reabrirPeriodo(tenantId, anio, mes)).rejects.toThrow(BadRequestException);
    });
  });

  describe('bloquearPeriodo', () => {
    it('should block a period', async () => {
      const tenantId = 'tenant-123';
      const anio = 2024;
      const mes = 1;

      // Mock obtenerPeriodo
      const mockObtenerPeriodoChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValueOnce({
          data: {
            id: 'periodo-123',
            tenant_id: tenantId,
            anio,
            mes,
            estado: EstadoPeriodo.ABIERTO
          },
          error: null
        })
      };
      mockSupabaseClient.from.mockReturnValueOnce(mockObtenerPeriodoChain as any);

      // Mock update period
      const mockUpdateChain = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValueOnce({
          data: {
            id: 'periodo-123',
            tenant_id: tenantId,
            anio,
            mes,
            estado: EstadoPeriodo.BLOQUEADO
          },
          error: null
        })
      };
      mockSupabaseClient.from.mockReturnValueOnce(mockUpdateChain as any);

      const result = await service.bloquearPeriodo(tenantId, anio, mes);

      expect(result).toBeDefined();
      expect(result.estado).toBe(EstadoPeriodo.BLOQUEADO);
    });
  });
});
