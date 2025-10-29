import { Test, TestingModule } from '@nestjs/testing';
import { CxpRecepcionListener } from './cxp-recepcion.listener';
import { CxpService } from './cxp.service';
import { EventBusService, RecepcionRegistradaEvent, ERPEvent } from '../../../shared/events/event-bus.service';

describe('CxpRecepcionListener', () => {
  let listener: CxpRecepcionListener;
  let cxpService: CxpService;
  let eventBusService: EventBusService;

  const mockSupabaseClient = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CxpRecepcionListener,
        {
          provide: CxpService,
          useValue: {
            crearCuentaPorPagar: jest.fn(),
            supabase: {
              getClient: jest.fn(() => mockSupabaseClient),
            },
          },
        },
        {
          provide: EventBusService,
          useValue: {
            onRecepcionRegistrada: jest.fn(),
          },
        },
      ],
    }).compile();

    listener = module.get<CxpRecepcionListener>(CxpRecepcionListener);
    cxpService = module.get<CxpService>(CxpService);
    eventBusService = module.get<EventBusService>(EventBusService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('onModuleInit', () => {
    it('should register listener for recepcion.registrada event', () => {
      listener.onModuleInit();

      expect(eventBusService.onRecepcionRegistrada).toHaveBeenCalledTimes(1);
      expect(eventBusService.onRecepcionRegistrada).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  describe('handleRecepcionRegistrada', () => {
    it('should create CxP from RecepcionRegistrada event', async () => {
      const mockRecepcionEvent: ERPEvent = {
        type: 'recepcion.registrada',
        module: 'compras',
        timestamp: new Date(),
        data: {
          recepcionId: 'rec-001',
          numeroRecepcion: 'REC-2025-001',
          ordenId: 'orden-001',
          numeroOrden: 'OC-2025-001',
          proveedorId: 'prov-001',
          proveedorNombre: 'Proveedor Test',
          proveedorRuc: '12345678901',
          almacenId: 'alm-001',
          fechaRecepcion: '2025-10-25',
          subtotal: 1000,
          igv: 180,
          total: 1180,
          moneda: 'PEN',
          diasCredito: 30,
          condicionesPago: 'CREDITO_30',
          items: [],
          tenantId: 'tenant-123',
        } as RecepcionRegistradaEvent,
      };

      const mockCxpCreada = {
        id: 'cxp-001',
        numero_documento: 'REC-2025-001',
        total: 1180,
      };

      // Mock: No existe CxP previa
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

      // Mock: Creación exitosa
      (cxpService.crearCuentaPorPagar as jest.Mock).mockResolvedValueOnce({
        success: true,
        data: mockCxpCreada,
      });

      // Ejecutar el listener manualmente
      await listener['handleRecepcionRegistrada'](mockRecepcionEvent);

      // Verificar que se intentó crear la CxP
      expect(cxpService.crearCuentaPorPagar).toHaveBeenCalledTimes(1);
      expect(cxpService.crearCuentaPorPagar).toHaveBeenCalledWith(
        'tenant-123',
        expect.objectContaining({
          proveedor_id: 'prov-001',
          orden_id: 'orden-001',
          recepcion_id: 'rec-001',
          numero_documento: 'REC-2025-001',
          fecha_emision: '2025-10-25',
          subtotal: 1000,
          igv: 180,
          total: 1180,
          moneda: 'PEN',
          condiciones_pago: 'CREDITO_30',
          dias_credito: 30,
        }),
        undefined,
      );
    });

    it('should skip creation if CxP already exists for recepcion', async () => {
      const mockRecepcionEvent: ERPEvent = {
        type: 'recepcion.registrada',
        module: 'compras',
        timestamp: new Date(),
        data: {
          recepcionId: 'rec-001',
          numeroRecepcion: 'REC-2025-001',
          ordenId: 'orden-001',
          numeroOrden: 'OC-2025-001',
          proveedorId: 'prov-001',
          proveedorNombre: 'Proveedor Test',
          proveedorRuc: '12345678901',
          almacenId: 'alm-001',
          fechaRecepcion: '2025-10-25',
          subtotal: 1000,
          igv: 180,
          total: 1180,
          moneda: 'PEN',
          items: [],
          tenantId: 'tenant-123',
        } as RecepcionRegistradaEvent,
      };

      // Mock: Ya existe CxP para esta recepción
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({ 
        data: { id: 'cxp-existing' }, 
        error: null 
      });

      await listener['handleRecepcionRegistrada'](mockRecepcionEvent);

      // Verificar que NO se intentó crear la CxP
      expect(cxpService.crearCuentaPorPagar).not.toHaveBeenCalled();
    });

    it('should not throw error if CxP creation fails', async () => {
      const mockRecepcionEvent: ERPEvent = {
        type: 'recepcion.registrada',
        module: 'compras',
        timestamp: new Date(),
        data: {
          recepcionId: 'rec-001',
          numeroRecepcion: 'REC-2025-001',
          ordenId: 'orden-001',
          numeroOrden: 'OC-2025-001',
          proveedorId: 'prov-001',
          proveedorNombre: 'Proveedor Test',
          proveedorRuc: '12345678901',
          almacenId: 'alm-001',
          fechaRecepcion: '2025-10-25',
          subtotal: 1000,
          igv: 180,
          total: 1180,
          moneda: 'PEN',
          items: [],
          tenantId: 'tenant-123',
        } as RecepcionRegistradaEvent,
      };

      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
      (cxpService.crearCuentaPorPagar as jest.Mock).mockRejectedValueOnce(
        new Error('Database error')
      );

      // No debe lanzar error
      await expect(
        listener['handleRecepcionRegistrada'](mockRecepcionEvent)
      ).resolves.not.toThrow();
    });
  });
});
