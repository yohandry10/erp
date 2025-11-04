import { Test, TestingModule } from '@nestjs/testing';
import { CxpRecepcionListener } from './cxp-recepcion.listener';
import { CxpService } from './cxp.service';
import {
  EventBusService,
  RecepcionRegistradaEvent,
  ERPEvent,
} from '../../../shared/events/event-bus.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { EstadoComparacionCxp } from './dto';

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
        {
          provide: SupabaseService,
          useValue: {
            getClient: jest.fn(() => mockSupabaseClient),
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
      mockSupabaseClient.maybeSingle
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({
          data: {
            detalles: [
              {
                producto_id: 'prod-001',
                cantidad: 10,
                precio_unitario: 100,
              },
            ],
          },
          error: null,
        });

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
          items: [
            {
              productoId: 'prod-001',
              cantidadRecibida: 10,
              precioUnitario: 100,
              calidad: 'OK',
            },
          ],
          tenantId: 'tenant-123',
          eventId: 'evt-recepcion-001',
          idempotencyKey: 'recepcion:tenant-123:rec-001',
          emittedAt: '2025-10-25T05:00:00.000Z',
        } as RecepcionRegistradaEvent,
      };

      const mockCxpCreada = {
        id: 'cxp-001',
        numero_documento: 'REC-2025-001',
        total: 1180,
      };

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
          tipo_documento: 'RECEPCION',
          referencia_tipo: 'RECEPCION',
          referencia_id: 'rec-001',
          numero: 'REC-2025-001',
          idempotency_key: 'recepcion:tenant-123:rec-001',
          estado_comparacion: EstadoComparacionCxp.OK,
          discrepancias: [],
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
          eventId: 'evt-recepcion-001',
          idempotencyKey: 'recepcion:tenant-123:rec-001',
          emittedAt: '2025-10-25T05:00:00.000Z',
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
      mockSupabaseClient.maybeSingle
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({
          data: {
            detalles: [
              {
                producto_id: 'prod-001',
                cantidad: 5,
                precio_unitario: 80,
              },
            ],
          },
          error: null,
        });

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
          items: [
            {
              productoId: 'prod-001',
              cantidadRecibida: 5,
              precioUnitario: 80,
              calidad: 'OK',
            },
          ],
          tenantId: 'tenant-123',
          eventId: 'evt-recepcion-001',
          idempotencyKey: 'recepcion:tenant-123:rec-001',
          emittedAt: '2025-10-25T05:00:00.000Z',
        } as RecepcionRegistradaEvent,
      };

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
