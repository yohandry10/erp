import { Test, TestingModule } from '@nestjs/testing';
import { OutboxEventsService } from './outbox-events.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';

describe('OutboxEventsService', () => {
  let service: OutboxEventsService;
  let mockSupabaseClient: any;

  const createMockQueryBuilder = (result: any) => {
    const builder: any = {
      from: jest.fn(),
      select: jest.fn(),
      is: jest.fn(),
      eq: jest.fn(),
      or: jest.fn(),
      lt: jest.fn(),
      order: jest.fn(),
      limit: jest.fn(),
      single: jest.fn()
    };

    // Setup chaining
    builder.from.mockReturnValue(builder);
    builder.select.mockImplementation((...args: any[]) => {
      // If called with count options, return result with is() method
      if (args[1]?.count === 'exact') {
        return {
          is: jest.fn().mockResolvedValue(result)
        };
      }
      return builder;
    });
    builder.is.mockReturnValue(builder);
    builder.eq.mockReturnValue(builder);
    builder.or.mockReturnValue(builder);
    builder.lt.mockReturnValue(builder);
    builder.order.mockReturnValue(builder);
    builder.limit.mockResolvedValue(result);
    builder.single.mockResolvedValue(result);

    return builder;
  };

  const mockSupabaseService = {
    getClient: jest.fn()
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutboxEventsService,
        {
          provide: SupabaseService,
          useValue: mockSupabaseService
        }
      ]
    }).compile();

    service = module.get<OutboxEventsService>(OutboxEventsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('leerEventosPendientes', () => {
    it('should read pending events successfully', async () => {
      const mockEvents = [
        {
          id: '1',
          event_id: 'evt-1',
          event_data: { tenant_id: 'tenant-1', total: 100 },
          processed_at: null
        },
        {
          id: '2',
          event_id: 'evt-2',
          event_data: { tenant_id: 'tenant-1', total: 200 },
          processed_at: null
        }
      ];

      mockSupabaseClient = createMockQueryBuilder({
        data: mockEvents,
        error: null
      });
      mockSupabaseService.getClient.mockReturnValue(mockSupabaseClient);

      const result = await service.leerEventosPendientes();

      expect(result).toEqual(mockEvents);
      expect(result).toHaveLength(2);
    });

    it('should filter events by tenant_id when provided', async () => {
      const mockEvents = [
        {
          id: '1',
          event_id: 'evt-1',
          event_data: { tenant_id: 'tenant-1', total: 100 },
          processed_at: null
        },
        {
          id: '2',
          event_id: 'evt-2',
          event_data: { tenant_id: 'tenant-2', total: 200 },
          processed_at: null
        }
      ];

      mockSupabaseClient = createMockQueryBuilder({
        data: mockEvents,
        error: null
      });
      mockSupabaseService.getClient.mockReturnValue(mockSupabaseClient);

      const result = await service.leerEventosPendientes('tenant-1');

      expect(result).toHaveLength(1);
      expect(result[0].event_data.tenant_id).toBe('tenant-1');
    });

    it('should return empty array when no pending events', async () => {
      mockSupabaseClient = createMockQueryBuilder({
        data: [],
        error: null
      });
      mockSupabaseService.getClient.mockReturnValue(mockSupabaseClient);

      const result = await service.leerEventosPendientes();

      expect(result).toEqual([]);
    });

    it('should throw error when database query fails', async () => {
      mockSupabaseClient = createMockQueryBuilder({
        data: null,
        error: { message: 'Database error' }
      });
      mockSupabaseService.getClient.mockReturnValue(mockSupabaseClient);

      await expect(service.leerEventosPendientes()).rejects.toThrow(
        'Error leyendo eventos pendientes'
      );
    });
  });

  describe('leerEventosPendientesConReintentos', () => {
    it('should read pending events with retry limit', async () => {
      const mockEvents = [
        {
          id: '1',
          event_id: 'evt-1',
          processed_at: null,
          retry_count: 1
        }
      ];

      mockSupabaseClient = createMockQueryBuilder({
        data: mockEvents,
        error: null
      });
      mockSupabaseService.getClient.mockReturnValue(mockSupabaseClient);

      const result = await service.leerEventosPendientesConReintentos(3, 100);

      expect(result).toEqual(mockEvents);
      expect(result).toHaveLength(1);
    });
  });

  describe('leerEventosPendientesPorTipo', () => {
    it('should read pending events by event type', async () => {
      const mockEvents = [
        {
          id: '1',
          event_id: 'evt-1',
          event_type: 'VentaFacturada',
          processed_at: null
        }
      ];

      mockSupabaseClient = createMockQueryBuilder({
        data: mockEvents,
        error: null
      });
      mockSupabaseService.getClient.mockReturnValue(mockSupabaseClient);

      const result = await service.leerEventosPendientesPorTipo(
        'VentaFacturada'
      );

      expect(result).toEqual(mockEvents);
    });
  });

  describe('obtenerEventoPorId', () => {
    it('should get event by id successfully', async () => {
      const mockEvent = {
        id: '1',
        event_id: 'evt-1',
        event_type: 'VentaFacturada',
        processed_at: null
      };

      mockSupabaseClient = createMockQueryBuilder({
        data: mockEvent,
        error: null
      });
      mockSupabaseService.getClient.mockReturnValue(mockSupabaseClient);

      const result = await service.obtenerEventoPorId('evt-1');

      expect(result).toEqual(mockEvent);
    });

    it('should return null when event not found', async () => {
      mockSupabaseClient = createMockQueryBuilder({
        data: null,
        error: { code: 'PGRST116' }
      });
      mockSupabaseService.getClient.mockReturnValue(mockSupabaseClient);

      const result = await service.obtenerEventoPorId('evt-999');

      expect(result).toBeNull();
    });
  });

  describe('contarEventosPendientes', () => {
    it('should count pending events', async () => {
      mockSupabaseClient = createMockQueryBuilder({
        count: 5,
        error: null
      });
      mockSupabaseService.getClient.mockReturnValue(mockSupabaseClient);

      const result = await service.contarEventosPendientes();

      expect(result).toBe(5);
    });

    it('should return 0 when no pending events', async () => {
      mockSupabaseClient = createMockQueryBuilder({
        count: null,
        error: null
      });
      mockSupabaseService.getClient.mockReturnValue(mockSupabaseClient);

      const result = await service.contarEventosPendientes();

      expect(result).toBe(0);
    });
  });

  describe('obtenerEstadisticasEventos', () => {
    it('should return statistics with all event statuses', async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayISO = today.toISOString();
      
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayISO = yesterday.toISOString();

      const mockEvents = [
        { status: 'pending', processed_at: null },
        { status: 'pending', processed_at: null },
        { status: 'processed', processed_at: todayISO },
        { status: 'processed', processed_at: todayISO },
        { status: 'processed', processed_at: yesterdayISO },
        { status: 'failed', processed_at: null },
        { status: 'dead_letter', processed_at: null }
      ];

      mockSupabaseClient = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue({
          data: mockEvents,
          error: null
        })
      };
      mockSupabaseService.getClient.mockReturnValue(mockSupabaseClient);

      const result = await service.obtenerEstadisticasEventos();

      expect(result).toEqual({
        pending: 2,
        processed: 3,
        processed_today: 2,
        failed: 1,
        dead_letter: 1
      });
    });

    it('should return zero statistics when no events', async () => {
      mockSupabaseClient = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue({
          data: [],
          error: null
        })
      };
      mockSupabaseService.getClient.mockReturnValue(mockSupabaseClient);

      const result = await service.obtenerEstadisticasEventos();

      expect(result).toEqual({
        pending: 0,
        processed: 0,
        processed_today: 0,
        failed: 0,
        dead_letter: 0
      });
    });

    it('should throw error when database query fails', async () => {
      mockSupabaseClient = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database error' }
        })
      };
      mockSupabaseService.getClient.mockReturnValue(mockSupabaseClient);

      await expect(service.obtenerEstadisticasEventos()).rejects.toThrow(
        'Error obteniendo estadísticas'
      );
    });
  });
});
