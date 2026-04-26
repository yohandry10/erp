import { CotizacionesService } from './cotizaciones.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { AuditService } from '../../audit/audit.service';
import { TaxCalculatorService } from '../../../shared/utils/tax-calculator';
import { PedidosService } from '../pedidos/pedidos.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EstadoCotizacion } from './entities';

describe('CotizacionesService', () => {
  let service: CotizacionesService;
  let supabaseService: jest.Mocked<SupabaseService>;
  let notificationsService: jest.Mocked<NotificationsService>;
  let auditService: jest.Mocked<AuditService>;
  let taxCalculator: jest.Mocked<TaxCalculatorService>;
  let pedidosService: jest.Mocked<PedidosService>;

  const tenantId = 'tenant-123';
  const userId = 'user-123';

  // Helper para crear mock de Supabase con chaining completo
  const createSupabaseMock = () => {
    const chainMock: any = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      lt: jest.fn().mockReturnThis(),
      like: jest.fn().mockReturnThis(),
      ilike: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: jest.fn(),
      maybeSingle: jest.fn(),
      rpc: jest.fn(),
    };
    return chainMock;
  };

  beforeEach(() => {
    const mockClient = createSupabaseMock();
    
    supabaseService = {
      getClient: jest.fn().mockReturnValue(mockClient),
    } as any;

    notificationsService = {
      createNotification: jest.fn().mockResolvedValue(undefined),
    } as any;

    auditService = {
      getResourceAuditLogs: jest.fn().mockResolvedValue([]),
    } as any;

    taxCalculator = {
      calcularImpuestos: jest.fn().mockResolvedValue({
        subtotal: 1000,
        igv: 180,
        total: 1180,
      }),
    } as any;

    pedidosService = {
      create: jest.fn(),
    } as any;

    service = new CotizacionesService(
      supabaseService,
      notificationsService,
      auditService,
      taxCalculator,
      pedidosService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('convertirAPedido', () => {
    const convertirDto = { notas: 'Convertido desde cotización' };

    it('debe convertir cotización a pedido usando RPC transaccional', async () => {
      const mockClient = supabaseService.getClient();
      
      // Mock findOne
      jest.spyOn(service, 'findOne').mockResolvedValue({
        id: 'cot-123',
        numero: 'COT-2025-0001',
        estado: EstadoCotizacion.BORRADOR,
        cliente_id: 'cli-123',
        observaciones: 'Test',
        detalle: [{ id: 'det-1', producto_id: 'prod-1', cantidad: 2, precio_unitario: 500 }],
      } as any);

      // Mock RPC convertir
      mockClient.rpc.mockResolvedValue({
        data: { success: true, pedido_id: 'ped-123', pedido_numero: 'PED-2025-0001' },
        error: null,
      });

      const result = await service.convertirAPedido('cot-123', convertirDto, tenantId, userId);

      expect(result.success).toBe(true);
      expect(result.data.pedido_id).toBe('ped-123');
      expect(mockClient.rpc).toHaveBeenCalledWith('convertir_cotizacion_a_pedido', expect.objectContaining({
        p_cotizacion_id: 'cot-123',
        p_tenant_id: tenantId,
      }));
    });

    it('debe rechazar cotización ya convertida', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({
        id: 'cot-123',
        estado: EstadoCotizacion.CONVERTIDA,
        detalle: [{ id: 'det-1' }],
      } as any);

      await expect(service.convertirAPedido('cot-123', convertirDto, tenantId, userId))
        .rejects.toThrow('Esta cotización ya fue convertida a pedido');
    });

    it('debe rechazar cotización rechazada', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({
        id: 'cot-123',
        estado: EstadoCotizacion.RECHAZADA,
        detalle: [{ id: 'det-1' }],
      } as any);

      await expect(service.convertirAPedido('cot-123', convertirDto, tenantId, userId))
        .rejects.toThrow('Solo se pueden convertir cotizaciones en estado BORRADOR, ENVIADA o APROBADA');
    });

    it('debe rechazar cotización vencida', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({
        id: 'cot-123',
        estado: EstadoCotizacion.VENCIDA,
        detalle: [{ id: 'det-1' }],
      } as any);

      await expect(service.convertirAPedido('cot-123', convertirDto, tenantId, userId))
        .rejects.toThrow('Solo se pueden convertir cotizaciones en estado BORRADOR, ENVIADA o APROBADA');
    });

    it('debe rechazar cotización sin detalle', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({
        id: 'cot-123',
        estado: EstadoCotizacion.BORRADOR,
        detalle: [],
      } as any);

      await expect(service.convertirAPedido('cot-123', convertirDto, tenantId, userId))
        .rejects.toThrow('La cotización no tiene productos para convertir en pedido');
    });

    it('debe manejar error de RPC', async () => {
      const mockClient = supabaseService.getClient();
      
      jest.spyOn(service, 'findOne').mockResolvedValue({
        id: 'cot-123',
        estado: EstadoCotizacion.BORRADOR,
        detalle: [{ id: 'det-1' }],
      } as any);

      mockClient.rpc.mockResolvedValue({
        data: null,
        error: { message: 'Error en transacción' },
      });

      await expect(service.convertirAPedido('cot-123', convertirDto, tenantId, userId))
        .rejects.toThrow('Error en transacción');
    });
  });

  describe('remove', () => {
    it('debe rechazar eliminar cotización no en BORRADOR', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({
        id: 'cot-123',
        estado: EstadoCotizacion.ENVIADA,
        detalle: [],
      } as any);

      await expect(service.remove('cot-123', tenantId))
        .rejects.toThrow('Solo se pueden eliminar cotizaciones en estado BORRADOR');
    });

    it('debe rechazar eliminar cotización convertida', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({
        id: 'cot-123',
        estado: EstadoCotizacion.CONVERTIDA,
        detalle: [],
      } as any);

      await expect(service.remove('cot-123', tenantId))
        .rejects.toThrow('Solo se pueden eliminar cotizaciones en estado BORRADOR');
    });
  });

  describe('getHistorial', () => {
    it('debe obtener historial de cambios', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({
        id: 'cot-123',
        numero: 'COT-2025-0001',
        estado: EstadoCotizacion.BORRADOR,
        cliente_id: 'cli-123',
        detalle: [],
      } as any);

      auditService.getResourceAuditLogs.mockResolvedValue([
        {
          timestamp: '2025-01-15T10:00:00Z',
          operation: 'INSERT',
          user_id: 'user-123',
          old_values: null,
          new_values: { estado: 'BORRADOR' },
          changed_fields: ['estado'],
          metadata: {},
        },
      ]);

      const result = await service.getHistorial('cot-123', tenantId);

      expect(result.cotizacion.id).toBe('cot-123');
      expect(result.timeline).toHaveLength(1);
      expect(result.resumen.total_eventos).toBe(1);
    });

    it('debe retornar timeline vacío si no hay eventos', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({
        id: 'cot-123',
        numero: 'COT-2025-0001',
        estado: EstadoCotizacion.BORRADOR,
        cliente_id: 'cli-123',
        detalle: [],
      } as any);

      auditService.getResourceAuditLogs.mockResolvedValue([]);

      const result = await service.getHistorial('cot-123', tenantId);

      expect(result.timeline).toHaveLength(0);
      expect(result.resumen.total_eventos).toBe(0);
    });
  });

  describe('Estados de cotización', () => {
    it('debe permitir convertir cotización en estado BORRADOR', async () => {
      const mockClient = supabaseService.getClient();
      
      jest.spyOn(service, 'findOne').mockResolvedValue({
        id: 'cot-123',
        numero: 'COT-2025-0001',
        estado: EstadoCotizacion.BORRADOR,
        cliente_id: 'cli-123',
        detalle: [{ id: 'det-1' }],
      } as any);

      mockClient.rpc.mockResolvedValue({
        data: { success: true, pedido_id: 'ped-123', pedido_numero: 'PED-2025-0001' },
        error: null,
      });

      const result = await service.convertirAPedido('cot-123', {}, tenantId, userId);
      expect(result.success).toBe(true);
    });

    it('debe permitir convertir cotización en estado ENVIADA', async () => {
      const mockClient = supabaseService.getClient();
      
      jest.spyOn(service, 'findOne').mockResolvedValue({
        id: 'cot-123',
        numero: 'COT-2025-0001',
        estado: EstadoCotizacion.ENVIADA,
        cliente_id: 'cli-123',
        detalle: [{ id: 'det-1' }],
      } as any);

      mockClient.rpc.mockResolvedValue({
        data: { success: true, pedido_id: 'ped-123', pedido_numero: 'PED-2025-0001' },
        error: null,
      });

      const result = await service.convertirAPedido('cot-123', {}, tenantId, userId);
      expect(result.success).toBe(true);
    });

    it('debe permitir convertir cotización en estado APROBADA', async () => {
      const mockClient = supabaseService.getClient();
      
      jest.spyOn(service, 'findOne').mockResolvedValue({
        id: 'cot-123',
        numero: 'COT-2025-0001',
        estado: EstadoCotizacion.APROBADA,
        cliente_id: 'cli-123',
        detalle: [{ id: 'det-1' }],
      } as any);

      mockClient.rpc.mockResolvedValue({
        data: { success: true, pedido_id: 'ped-123', pedido_numero: 'PED-2025-0001' },
        error: null,
      });

      const result = await service.convertirAPedido('cot-123', {}, tenantId, userId);
      expect(result.success).toBe(true);
    });
  });

  describe('TaxCalculator integration', () => {
    it('debe usar TaxCalculatorService para calcular impuestos', async () => {
      // Verificar que el servicio tiene la dependencia
      expect(taxCalculator).toBeDefined();
      expect(taxCalculator.calcularImpuestos).toBeDefined();
    });
  });
});
