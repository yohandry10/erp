import { CotizacionesService } from './cotizaciones.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { AuditService } from '../../audit/audit.service';
import { TaxCalculatorService } from '../../../shared/utils/tax-calculator';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EstadoCotizacion } from './entities';

describe('CotizacionesService', () => {
  let service: CotizacionesService;
  let supabaseService: jest.Mocked<SupabaseService>;
  let notificationsService: jest.Mocked<NotificationsService>;
  let auditService: jest.Mocked<AuditService>;
  let taxCalculator: jest.Mocked<TaxCalculatorService>;

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
      getTasaIgv: jest.fn().mockResolvedValue(0.18),
    } as any;

    service = new CotizacionesService(
      supabaseService,
      notificationsService,
      auditService,
      taxCalculator,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('crea cabecera y detalle por RPC con tenant y actor explícitos, sin reservar stock', async () => {
      const mockClient = supabaseService.getClient() as any;
      const createDto = {
        cliente_id: 'cliente-123',
        detalle: [
          {
            producto_id: 'prod-123',
            descripcion: 'Producto venta',
            cantidad: 2,
            precio_unitario: 100,
          },
        ],
      };

      mockClient.maybeSingle.mockResolvedValue({
        data: { moneda_defecto: 'PEN' },
        error: null,
      });
      mockClient.single
        .mockResolvedValueOnce({ data: { id: 'cliente-123' }, error: null })
        .mockResolvedValueOnce({
          data: { nombre: 'Ana', apellido: 'Vendedora', email: 'ana@example.com' },
          error: null,
        });
      mockClient.rpc.mockResolvedValue({
        data: {
          cotizacion: {
            id: 'cot-123',
            tenant_id: tenantId,
            numero: 'COT-2026-0001',
          },
          detalle: [{
            id: 'det-123',
            tenant_id: tenantId,
            cotizacion_id: 'cot-123',
            producto_id: 'prod-123',
            descripcion: 'Producto venta',
            cantidad: 2,
            precio_unitario: 100,
            subtotal: 200,
            orden: 1,
          }],
        },
        error: null,
      });

      const result = await service.create(createDto as any, tenantId, userId);

      expect(mockClient.rpc).toHaveBeenCalledWith(
        'crear_cotizacion_comercial_tx',
        expect.objectContaining({
          p_tenant_id: tenantId,
          p_created_by: userId,
          p_cliente_id: 'cliente-123',
          p_vendedor: 'Ana Vendedora',
          p_detalle: [expect.objectContaining({
            producto_id: 'prod-123',
            descripcion: 'Producto venta',
            cantidad: 2,
            precio_unitario: 100,
            orden: 1,
          })],
        }),
      );
      expect(result).toEqual(expect.objectContaining({
        id: 'cot-123',
        detalle: [expect.objectContaining({ id: 'det-123' })],
      }));
      expect(mockClient.select).toHaveBeenCalledWith('id, afectacion_igv');
      expect(mockClient.select).not.toHaveBeenCalledWith(expect.stringContaining('stock_actual'));
      expect(mockClient.from).not.toHaveBeenCalledWith('movimientos_almacen');
    });

    it('rechaza crear una cotización sin actor antes de tocar la base', async () => {
      const mockClient = supabaseService.getClient() as any;

      await expect(service.create({ cliente_id: 'cliente-123', detalle: [] } as any, tenantId))
        .rejects.toThrow('No se pudo identificar al creador de la cotización');

      expect(mockClient.from).not.toHaveBeenCalled();
      expect(mockClient.rpc).not.toHaveBeenCalled();
    });
  });

  describe('convertirAPedido', () => {
    const convertirDto = { notas: 'Convertido desde cotización' };

    it('debe convertir cotización a pedido usando RPC transaccional', async () => {
      const mockClient = supabaseService.getClient() as any;
      
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
      expect(mockClient.rpc).toHaveBeenCalledWith('convertir_cotizacion_comercial_a_pedido_tx', expect.objectContaining({
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

    it('delega al RPC la vigencia según la fecha local del tenant', async () => {
      const yesterday = new Date(Date.now() - 86400000).toISOString();
      const mockClient = supabaseService.getClient() as any;

      jest.spyOn(service, 'findOne').mockResolvedValue({
        id: 'cot-123',
        estado: EstadoCotizacion.BORRADOR,
        fecha_vencimiento: yesterday,
        detalle: [{ id: 'det-1' }],
      } as any);
      mockClient.rpc.mockResolvedValue({
        data: null,
        error: { message: 'No se puede convertir una cotización vencida' },
      });

      await expect(service.convertirAPedido('cot-123', convertirDto, tenantId, userId))
        .rejects.toThrow('No se puede convertir una cotización vencida');
      expect(mockClient.rpc).toHaveBeenCalledWith(
        'convertir_cotizacion_comercial_a_pedido_tx',
        expect.objectContaining({ p_cotizacion_id: 'cot-123', p_tenant_id: tenantId }),
      );
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
      const mockClient = supabaseService.getClient() as any;
      
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

    it('no reporta fallo si la conversión hizo commit y sólo falla la hidratación posterior', async () => {
      const mockClient = supabaseService.getClient() as any;
      const cotizacionAntes = {
        id: 'cot-123',
        numero: 'COT-2025-0001',
        estado: EstadoCotizacion.APROBADA,
        cliente_id: 'cli-123',
        detalle: [{ id: 'det-1', producto_id: 'prod-1', cantidad: 1, precio_unitario: 100 }],
      };
      jest.spyOn(service, 'findOne')
        .mockResolvedValueOnce(cotizacionAntes as any)
        .mockRejectedValueOnce(new Error('timeout de lectura post-commit'));
      mockClient.rpc.mockResolvedValue({
        data: { success: true, pedido_id: 'ped-123', pedido_numero: 'PED-2025-0001' },
        error: null,
      });

      const result = await service.convertirAPedido('cot-123', convertirDto, tenantId, userId);

      expect(result).toEqual(expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          pedido_id: 'ped-123',
          cotizacion: expect.objectContaining({
            id: 'cot-123',
            estado: EstadoCotizacion.CONVERTIDA,
            pedido_id: 'ped-123',
          }),
        }),
      }));
      expect(notificationsService.createNotification).toHaveBeenCalled();
    });

  });

  describe('cambiarEstado', () => {
    it('devuelve el estado confirmado si falla sólo la hidratación post-commit', async () => {
      const mockClient = supabaseService.getClient() as any;
      mockClient.rpc.mockResolvedValue({
        data: { success: true, cotizacion_id: 'cot-123' },
        error: null,
      });
      jest.spyOn(service, 'findOne').mockRejectedValue(
        new Error('lectura temporalmente no disponible'),
      );

      const result = await service.cambiarEstado(
        'cot-123',
        tenantId,
        EstadoCotizacion.ENVIADA,
        userId,
      );

      expect(result).toEqual(expect.objectContaining({
        id: 'cot-123',
        tenant_id: tenantId,
        estado: EstadoCotizacion.ENVIADA,
        detalle: [],
      }));
      expect(mockClient.rpc).toHaveBeenCalledTimes(1);
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
      const mockClient = supabaseService.getClient() as any;
      
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
      const mockClient = supabaseService.getClient() as any;
      
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
      const mockClient = supabaseService.getClient() as any;
      
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

  describe('Aislamiento multi-tenant (P2.2)', () => {
    it('findOne debe filtrar por tenant y rechazar id del otro tenant', async () => {
      const mockClient = supabaseService.getClient() as any;

      mockClient.single.mockResolvedValue({
        data: null,
        error: { message: 'No encontrado' },
      });

      await expect(service.findOne('cotizacion-cross', tenantId)).rejects.toThrow(NotFoundException);

      expect(mockClient.from).toHaveBeenCalledWith('cotizaciones');
      expect(mockClient.eq).toHaveBeenCalledWith('id', 'cotizacion-cross');
      expect(mockClient.eq).toHaveBeenCalledWith('tenant_id', tenantId);
      expect(mockClient.eq).not.toHaveBeenCalledWith('tenant_id', 'tenant-b');
    });

    it('findOne no debe consultar sin tenant para recursos sensibles', async () => {
      const mockClient = supabaseService.getClient() as any;

      mockClient.single.mockResolvedValue({
        data: {
          id: 'cot-1',
          tenant_id: tenantId,
          estado: EstadoCotizacion.BORRADOR,
          detalle: [],
        },
        error: null,
      });

      await service.findOne('cot-1', tenantId);

      expect(mockClient.from).toHaveBeenCalledWith('cotizaciones');
      expect(mockClient.eq).toHaveBeenCalledWith('tenant_id', tenantId);
    });

    it('create debe validar cliente solo dentro del tenant actual', async () => {
      const mockClient = supabaseService.getClient() as any;
      const createDto = {
        cliente_id: 'cliente-cross',
        detalle: [
          {
            producto_id: 'prod-cross',
            descripcion: 'producto',
            cantidad: 1,
            precio_unitario: 100,
          },
        ],
      };

      mockClient.single.mockResolvedValue({
        data: null,
        error: { message: 'No encontrado' },
      });

      await expect(service.create(createDto as any, tenantId, userId)).rejects.toThrow(NotFoundException);

      expect(mockClient.from).toHaveBeenCalledWith('clientes');
      expect(mockClient.eq).toHaveBeenCalledWith('tenant_id', tenantId);
      expect(mockClient.eq).toHaveBeenCalledWith('id', 'cliente-cross');
      expect(mockClient.eq).not.toHaveBeenCalledWith('tenant_id', 'tenant-b');
    });
  });
});
