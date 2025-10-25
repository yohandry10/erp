import { Test, TestingModule } from '@nestjs/testing';
import { ComprasCxpIntegrationService } from './compras-cxp-integration.service';
import { EventBusService, RecepcionRegistradaEvent } from '../../../shared/events/event-bus.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';

describe('ComprasCxpIntegrationService', () => {
  let service: ComprasCxpIntegrationService;
  let eventBus: EventBusService;
  let supabase: SupabaseService;

  const mockSupabaseClient = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    like: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    single: jest.fn(),
  };

  const mockEventBus = {
    onRecepcionRegistrada: jest.fn(),
    emit: jest.fn(),
  };

  const mockSupabaseService = {
    getClient: jest.fn(() => mockSupabaseClient),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComprasCxpIntegrationService,
        {
          provide: EventBusService,
          useValue: mockEventBus,
        },
        {
          provide: SupabaseService,
          useValue: mockSupabaseService,
        },
      ],
    }).compile();

    service = module.get<ComprasCxpIntegrationService>(ComprasCxpIntegrationService);
    eventBus = module.get<EventBusService>(EventBusService);
    supabase = module.get<SupabaseService>(SupabaseService);

    // Clear all mocks
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should register listener for RecepcionRegistrada event', () => {
      service.onModuleInit();
      expect(mockEventBus.onRecepcionRegistrada).toHaveBeenCalled();
    });
  });

  describe('handleRecepcionRegistrada', () => {
    const mockRecepcionEvent: RecepcionRegistradaEvent = {
      recepcionId: 'rec-123',
      numeroRecepcion: 'REC-2025-0001',
      ordenId: 'orden-123',
      numeroOrden: 'OC-2025-0001',
      proveedorId: 'prov-123',
      proveedorNombre: 'Proveedor Test',
      proveedorRuc: '20123456789',
      almacenId: 'alm-123',
      fechaRecepcion: '2025-01-15',
      subtotal: 1000,
      igv: 180,
      total: 1180,
      moneda: 'PEN',
      diasCredito: 30,
      condicionesPago: '30 días',
      items: [],
      tenantId: 'tenant-123',
    };

    it('should skip CxP creation if configuration is not RECEPCION', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { generar_cxp_en: 'APROBACION_OC' },
        error: null,
      });

      const event = {
        type: 'recepcion.registrada',
        data: mockRecepcionEvent,
        timestamp: new Date(),
        module: 'compras',
      };

      await service['handleRecepcionRegistrada'](event);

      // Should not attempt to create CxP
      expect(mockSupabaseClient.insert).not.toHaveBeenCalled();
    });

    it('should skip CxP creation if CxP already exists', async () => {
      // Mock configuration check
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { generar_cxp_en: 'RECEPCION' },
        error: null,
      });

      // Mock existing CxP check
      mockSupabaseClient.limit.mockResolvedValueOnce({
        data: [{ id: 'cxp-existing' }],
        error: null,
      });

      const event = {
        type: 'recepcion.registrada',
        data: mockRecepcionEvent,
        timestamp: new Date(),
        module: 'compras',
      };

      await service['handleRecepcionRegistrada'](event);

      // Should not attempt to create CxP
      expect(mockSupabaseClient.insert).not.toHaveBeenCalled();
    });

    it('should create CxP successfully when conditions are met', async () => {
      // Mock configuration check
      mockSupabaseClient.single
        .mockResolvedValueOnce({
          data: { generar_cxp_en: 'RECEPCION' },
          error: null,
        })
        // Mock proveedor data
        .mockResolvedValueOnce({
          data: {
            condiciones_pago: '30 días',
            dias_credito: 30,
          },
          error: null,
        })
        // Mock CxP creation
        .mockResolvedValueOnce({
          data: {
            id: 'cxp-new',
            numero: 'CXP-2025-0001',
            total: 1180,
          },
          error: null,
        });

      // Mock existing CxP check (no existing)
      mockSupabaseClient.limit.mockResolvedValueOnce({
        data: [],
        error: null,
      });

      // Mock numero generation query
      mockSupabaseClient.limit.mockResolvedValueOnce({
        data: [],
        error: null,
      });

      const event = {
        type: 'recepcion.registrada',
        data: mockRecepcionEvent,
        timestamp: new Date(),
        module: 'compras',
      };

      await service['handleRecepcionRegistrada'](event);

      // Should attempt to create CxP
      expect(mockSupabaseClient.insert).toHaveBeenCalled();
    });
  });

  describe('calcularFechaVencimiento', () => {
    it('should calculate due date correctly with 30 days credit', () => {
      const fechaEmision = '2025-01-15';
      const diasCredito = 30;

      const result = service['calcularFechaVencimiento'](fechaEmision, diasCredito);

      expect(result).toBe('2025-02-14');
    });

    it('should calculate due date correctly with 0 days credit', () => {
      const fechaEmision = '2025-01-15';
      const diasCredito = 0;

      const result = service['calcularFechaVencimiento'](fechaEmision, diasCredito);

      expect(result).toBe('2025-01-15');
    });

    it('should calculate due date correctly with 60 days credit', () => {
      const fechaEmision = '2025-01-15';
      const diasCredito = 60;

      const result = service['calcularFechaVencimiento'](fechaEmision, diasCredito);

      expect(result).toBe('2025-03-16');
    });
  });

  describe('calcularFechaVencimientoSegunCondiciones', () => {
    describe('CONTADO payment terms', () => {
      it('should return same date for CONTADO', () => {
        const fechaEmision = '2025-01-15';
        const result = service['calcularFechaVencimientoSegunCondiciones'](fechaEmision, 'CONTADO', 30);
        expect(result).toBe('2025-01-15');
      });

      it('should return same date for CASH', () => {
        const fechaEmision = '2025-01-15';
        const result = service['calcularFechaVencimientoSegunCondiciones'](fechaEmision, 'CASH', 30);
        expect(result).toBe('2025-01-15');
      });

      it('should handle lowercase contado', () => {
        const fechaEmision = '2025-01-15';
        const result = service['calcularFechaVencimientoSegunCondiciones'](fechaEmision, 'contado', 30);
        expect(result).toBe('2025-01-15');
      });
    });

    describe('CREDITO_XX format', () => {
      it('should parse CREDITO_30', () => {
        const fechaEmision = '2025-01-15';
        const result = service['calcularFechaVencimientoSegunCondiciones'](fechaEmision, 'CREDITO_30', 0);
        expect(result).toBe('2025-02-14');
      });

      it('should parse CREDITO 45 (with space)', () => {
        const fechaEmision = '2025-01-15';
        const result = service['calcularFechaVencimientoSegunCondiciones'](fechaEmision, 'CREDITO 45', 0);
        expect(result).toBe('2025-03-01');
      });

      it('should parse lowercase credito_60', () => {
        const fechaEmision = '2025-01-15';
        const result = service['calcularFechaVencimientoSegunCondiciones'](fechaEmision, 'credito_60', 0);
        expect(result).toBe('2025-03-16');
      });
    });

    describe('XX días format', () => {
      it('should parse "30 días"', () => {
        const fechaEmision = '2025-01-15';
        const result = service['calcularFechaVencimientoSegunCondiciones'](fechaEmision, '30 días', 0);
        expect(result).toBe('2025-02-14');
      });

      it('should parse "45 dias" (without accent)', () => {
        const fechaEmision = '2025-01-15';
        const result = service['calcularFechaVencimientoSegunCondiciones'](fechaEmision, '45 dias', 0);
        expect(result).toBe('2025-03-01');
      });

      it('should parse "60 día" (singular)', () => {
        const fechaEmision = '2025-01-15';
        const result = service['calcularFechaVencimientoSegunCondiciones'](fechaEmision, '60 día', 0);
        expect(result).toBe('2025-03-16');
      });

      it('should parse "15días" (no space)', () => {
        const fechaEmision = '2025-01-15';
        const result = service['calcularFechaVencimientoSegunCondiciones'](fechaEmision, '15días', 0);
        expect(result).toBe('2025-01-30');
      });
    });

    describe('Fin de mes format', () => {
      it('should calculate end of month for "Fin de mes"', () => {
        const fechaEmision = '2025-01-15';
        const result = service['calcularFechaVencimientoSegunCondiciones'](fechaEmision, 'Fin de mes', 0);
        expect(result).toBe('2025-01-31');
      });

      it('should calculate end of month + days for "Fin de mes + 30"', () => {
        const fechaEmision = '2025-01-15';
        const result = service['calcularFechaVencimientoSegunCondiciones'](fechaEmision, 'Fin de mes + 30', 0);
        expect(result).toBe('2025-03-03');
      });

      it('should handle "Fin mes + 15"', () => {
        const fechaEmision = '2025-01-15';
        const result = service['calcularFechaVencimientoSegunCondiciones'](fechaEmision, 'Fin mes + 15', 0);
        expect(result).toBe('2025-02-15');
      });

      it('should handle February end of month correctly', () => {
        const fechaEmision = '2025-02-15';
        const result = service['calcularFechaVencimientoSegunCondiciones'](fechaEmision, 'Fin de mes', 0);
        expect(result).toBe('2025-02-28');
      });

      it('should handle December end of month + days', () => {
        const fechaEmision = '2025-12-15';
        const result = service['calcularFechaVencimientoSegunCondiciones'](fechaEmision, 'Fin de mes + 30', 0);
        expect(result).toBe('2026-01-30');
      });
    });

    describe('Multiple installments format', () => {
      it('should use first installment for "15/30/45"', () => {
        const fechaEmision = '2025-01-15';
        const result = service['calcularFechaVencimientoSegunCondiciones'](fechaEmision, '15/30/45', 0);
        expect(result).toBe('2025-01-30');
      });

      it('should use first installment for "30/60/90"', () => {
        const fechaEmision = '2025-01-15';
        const result = service['calcularFechaVencimientoSegunCondiciones'](fechaEmision, '30/60/90', 0);
        expect(result).toBe('2025-02-14');
      });

      it('should handle dash separator "15-30-45"', () => {
        const fechaEmision = '2025-01-15';
        const result = service['calcularFechaVencimientoSegunCondiciones'](fechaEmision, '15-30-45', 0);
        expect(result).toBe('2025-01-30');
      });
    });

    describe('Fallback scenarios', () => {
      it('should use fallback days when condiciones is null', () => {
        const fechaEmision = '2025-01-15';
        const result = service['calcularFechaVencimientoSegunCondiciones'](fechaEmision, null, 30);
        expect(result).toBe('2025-02-14');
      });

      it('should use fallback days when condiciones is undefined', () => {
        const fechaEmision = '2025-01-15';
        const result = service['calcularFechaVencimientoSegunCondiciones'](fechaEmision, undefined, 45);
        expect(result).toBe('2025-03-01');
      });

      it('should use fallback days when condiciones is empty string', () => {
        const fechaEmision = '2025-01-15';
        const result = service['calcularFechaVencimientoSegunCondiciones'](fechaEmision, '', 60);
        expect(result).toBe('2025-03-16');
      });

      it('should use fallback days when condiciones cannot be parsed', () => {
        const fechaEmision = '2025-01-15';
        const result = service['calcularFechaVencimientoSegunCondiciones'](fechaEmision, 'Invalid format', 30);
        expect(result).toBe('2025-02-14');
      });

      it('should use 0 days when no fallback provided and condiciones is invalid', () => {
        const fechaEmision = '2025-01-15';
        const result = service['calcularFechaVencimientoSegunCondiciones'](fechaEmision, 'Unknown');
        expect(result).toBe('2025-01-15');
      });
    });
  });

  describe('generarNumeroCxp', () => {
    it('should generate first CxP number when no previous exists', async () => {
      mockSupabaseClient.limit.mockResolvedValueOnce({
        data: [],
        error: null,
      });

      const result = await service['generarNumeroCxp']('tenant-123');

      const year = new Date().getFullYear();
      expect(result).toBe(`CXP-${year}-0001`);
    });

    it('should increment CxP number based on last number', async () => {
      const year = new Date().getFullYear();
      mockSupabaseClient.limit.mockResolvedValueOnce({
        data: [{ numero: `CXP-${year}-0005` }],
        error: null,
      });

      const result = await service['generarNumeroCxp']('tenant-123');

      expect(result).toBe(`CXP-${year}-0006`);
    });

    it('should handle errors gracefully and return fallback number', async () => {
      mockSupabaseClient.limit.mockRejectedValueOnce(new Error('Database error'));

      const result = await service['generarNumeroCxp']('tenant-123');

      const year = new Date().getFullYear();
      expect(result).toContain(`CXP-${year}-`);
    });
  });

  describe('obtenerConfiguracionEmpresa', () => {
    it('should return configuration when found', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { generar_cxp_en: 'RECEPCION' },
        error: null,
      });

      const result = await service['obtenerConfiguracionEmpresa']('tenant-123');

      expect(result).toEqual({ generar_cxp_en: 'RECEPCION' });
    });

    it('should return default configuration when not found', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Not found' },
      });

      const result = await service['obtenerConfiguracionEmpresa']('tenant-123');

      expect(result).toEqual({ generar_cxp_en: 'RECEPCION' });
    });

    it('should return default configuration on error', async () => {
      mockSupabaseClient.single.mockRejectedValueOnce(new Error('Database error'));

      const result = await service['obtenerConfiguracionEmpresa']('tenant-123');

      expect(result).toEqual({ generar_cxp_en: 'RECEPCION' });
    });
  });

  describe('verificarCxpExistente', () => {
    it('should return true when CxP exists', async () => {
      mockSupabaseClient.limit.mockResolvedValueOnce({
        data: [{ id: 'cxp-123' }],
        error: null,
      });

      const result = await service['verificarCxpExistente']('rec-123', 'tenant-123');

      expect(result).toBe(true);
    });

    it('should return false when CxP does not exist', async () => {
      mockSupabaseClient.limit.mockResolvedValueOnce({
        data: [],
        error: null,
      });

      const result = await service['verificarCxpExistente']('rec-123', 'tenant-123');

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      mockSupabaseClient.limit.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database error' },
      });

      const result = await service['verificarCxpExistente']('rec-123', 'tenant-123');

      expect(result).toBe(false);
    });
  });

  describe('calcularMontoRecepcionParcial', () => {
    it('should calculate amount correctly for partial reception', async () => {
      const mockRecepcionEvent: RecepcionRegistradaEvent = {
        recepcionId: 'rec-123',
        numeroRecepcion: 'REC-2025-0001',
        ordenId: 'orden-123',
        numeroOrden: 'OC-2025-0001',
        proveedorId: 'prov-123',
        proveedorNombre: 'Proveedor Test',
        proveedorRuc: '20123456789',
        almacenId: 'alm-123',
        fechaRecepcion: '2025-01-15',
        subtotal: 1000,
        igv: 180,
        total: 1180,
        moneda: 'PEN',
        items: [],
        tenantId: 'tenant-123',
      };

      // Mock orden_compra_detalles
      mockSupabaseClient.select.mockResolvedValueOnce({
        data: [
          { id: 'det-1', producto_id: 'prod-1', precio_unitario: 100, cantidad: 10 },
          { id: 'det-2', producto_id: 'prod-2', precio_unitario: 50, cantidad: 20 },
        ],
        error: null,
      });

      // Mock recepcion_items (partial reception: only 5 units of prod-1 and 10 units of prod-2)
      mockSupabaseClient.select.mockResolvedValueOnce({
        data: [
          { producto_id: 'prod-1', cantidad_recibida: 5, detalle_id: 'det-1', calidad: 'OK' },
          { producto_id: 'prod-2', cantidad_recibida: 10, detalle_id: 'det-2', calidad: 'OK' },
        ],
        error: null,
      });

      const result = await service['calcularMontoRecepcionParcial'](mockRecepcionEvent);

      // Expected: (5 * 100) + (10 * 50) = 500 + 500 = 1000
      // IGV: 1000 * 0.18 = 180
      // Total: 1000 + 180 = 1180
      expect(result.subtotal).toBe(1000);
      expect(result.igv).toBe(180);
      expect(result.total).toBe(1180);
    });

    it('should exclude rejected items from calculation', async () => {
      const mockRecepcionEvent: RecepcionRegistradaEvent = {
        recepcionId: 'rec-123',
        numeroRecepcion: 'REC-2025-0001',
        ordenId: 'orden-123',
        numeroOrden: 'OC-2025-0001',
        proveedorId: 'prov-123',
        proveedorNombre: 'Proveedor Test',
        proveedorRuc: '20123456789',
        almacenId: 'alm-123',
        fechaRecepcion: '2025-01-15',
        subtotal: 1000,
        igv: 180,
        total: 1180,
        moneda: 'PEN',
        items: [],
        tenantId: 'tenant-123',
      };

      // Mock orden_compra_detalles
      mockSupabaseClient.select.mockResolvedValueOnce({
        data: [
          { id: 'det-1', producto_id: 'prod-1', precio_unitario: 100, cantidad: 10 },
          { id: 'det-2', producto_id: 'prod-2', precio_unitario: 50, cantidad: 20 },
        ],
        error: null,
      });

      // Mock recepcion_items (one item rejected)
      mockSupabaseClient.select.mockResolvedValueOnce({
        data: [
          { producto_id: 'prod-1', cantidad_recibida: 5, detalle_id: 'det-1', calidad: 'OK' },
          { producto_id: 'prod-2', cantidad_recibida: 10, detalle_id: 'det-2', calidad: 'RECHAZADO' },
        ],
        error: null,
      });

      const result = await service['calcularMontoRecepcionParcial'](mockRecepcionEvent);

      // Expected: only prod-1 (5 * 100) = 500
      // IGV: 500 * 0.18 = 90
      // Total: 500 + 90 = 590
      expect(result.subtotal).toBe(500);
      expect(result.igv).toBe(90);
      expect(result.total).toBe(590);
    });

    it('should use fallback values on error', async () => {
      const mockRecepcionEvent: RecepcionRegistradaEvent = {
        recepcionId: 'rec-123',
        numeroRecepcion: 'REC-2025-0001',
        ordenId: 'orden-123',
        numeroOrden: 'OC-2025-0001',
        proveedorId: 'prov-123',
        proveedorNombre: 'Proveedor Test',
        proveedorRuc: '20123456789',
        almacenId: 'alm-123',
        fechaRecepcion: '2025-01-15',
        subtotal: 1000,
        igv: 180,
        total: 1180,
        moneda: 'PEN',
        items: [],
        tenantId: 'tenant-123',
      };

      // Mock error in orden_compra_detalles query
      mockSupabaseClient.select.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database error' },
      });

      const result = await service['calcularMontoRecepcionParcial'](mockRecepcionEvent);

      // Should use fallback values from event
      expect(result.subtotal).toBe(1000);
      expect(result.igv).toBe(180);
      expect(result.total).toBe(1180);
    });
  });

  describe('esRecepcionParcial', () => {
    it('should return true when there are multiple receptions', async () => {
      // Mock recepciones query (2 receptions)
      mockSupabaseClient.select.mockResolvedValueOnce({
        data: [{ id: 'rec-1' }, { id: 'rec-2' }],
        error: null,
      });

      const result = await service['esRecepcionParcial']('orden-123', 'tenant-123');

      expect(result).toBe(true);
    });

    it('should return true when order is in PARCIAL state', async () => {
      // Mock recepciones query (only 1 reception)
      mockSupabaseClient.select.mockResolvedValueOnce({
        data: [{ id: 'rec-1' }],
        error: null,
      });

      // Mock orden query
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { estado: 'PARCIAL' },
        error: null,
      });

      const result = await service['esRecepcionParcial']('orden-123', 'tenant-123');

      expect(result).toBe(true);
    });

    it('should return false when order is fully received', async () => {
      // Mock recepciones query (only 1 reception)
      mockSupabaseClient.select.mockResolvedValueOnce({
        data: [{ id: 'rec-1' }],
        error: null,
      });

      // Mock orden query
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { estado: 'RECIBIDA' },
        error: null,
      });

      const result = await service['esRecepcionParcial']('orden-123', 'tenant-123');

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      // Mock error in recepciones query
      mockSupabaseClient.select.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database error' },
      });

      const result = await service['esRecepcionParcial']('orden-123', 'tenant-123');

      expect(result).toBe(false);
    });
  });
});
