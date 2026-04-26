import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { OrdenesCompraService } from './ordenes-compra.service';
import { OrdenesCompraRepository } from '../repositories/ordenes-compra.repository';
import { CotizacionesCompraRepository } from '../repositories/cotizaciones-compra.repository';
import { OcAprobacionesRepository } from '../repositories/oc-aprobaciones.repository';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { EventBusService } from '../../../shared/events/event-bus.service';
import { CreateOrdenCompraDto } from '../dto/create-orden-compra.dto';
import { UpdateOrdenCompraDto } from '../dto/update-orden-compra.dto';
import { AprobarOrdenCompraDto } from '../dto/aprobar-orden-compra.dto';
import { RechazarOrdenCompraDto } from '../dto/rechazar-orden-compra.dto';
import { CancelarOrdenCompraDto } from '../dto/cancelar-orden-compra.dto';
import { AuditService } from '../../audit/audit.service';
import { CacheInvalidationService } from '../../../shared/cache/cache-invalidation.service';
import { TaxCalculatorService } from '../../../shared/utils/tax-calculator';
import { DevolucionesProveedorService } from './devoluciones-proveedor.service';

describe('OrdenesCompraService', () => {
  let service: OrdenesCompraService;
  let ordenesRepository: jest.Mocked<OrdenesCompraRepository>;
  let cotizacionesRepository: jest.Mocked<CotizacionesCompraRepository>;
  let ocAprobacionesRepository: jest.Mocked<OcAprobacionesRepository>;
  let supabaseService: jest.Mocked<SupabaseService>;
  let notificationsService: jest.Mocked<NotificationsService>;
  let eventBusService: jest.Mocked<EventBusService>;
  let auditService: jest.Mocked<AuditService>;
  let cacheInvalidationService: jest.Mocked<CacheInvalidationService>;
  let taxCalculatorService: jest.Mocked<TaxCalculatorService>;
  let devolucionesProveedorService: { crearDevolucion: jest.Mock; emitirDevolucion: jest.Mock };

  const mockOrdenCompra = {
    id: 'orden-123',
    tenant_id: 'tenant-123',
    numero: 'OC-2024-001',
    proveedor_id: 'proveedor-123',
    fecha_orden: '2024-10-24',
    fecha_entrega_esperada: '2024-11-24',
    estado: 'PENDIENTE',
    subtotal: 10000,
    igv: 1800,
    total: 11800,
    dias_credito: 30,
    condiciones_pago: 'CREDITO_30',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    detalles: [
      {
        id: 'detalle-1',
        orden_id: 'orden-123',
        producto_id: 'producto-1',
        descripcion: 'Producto Test',
        cantidad: 10,
        precio_unitario: 1000,
        subtotal: 10000,
        cantidad_recibida: 0,
        cantidad_pendiente: 10
      }
    ]
  };

  const mockSupabaseClient = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn(),
    in: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis()
  };

  beforeEach(async () => {
    const mockOrdenesRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByNumero: jest.fn(),
      findAll: jest.fn(),
      update: jest.fn(),
      updateEstado: jest.fn(),
      findRecepcionesByOrdenId: jest.fn()
    };

    const mockCotizacionesRepository = {
      marcarComoConvertida: jest.fn()
    };

    const mockOcAprobacionesRepository = {
      create: jest.fn(),
      findByOrdenId: jest.fn(),
      countPendingByOrdenId: jest.fn(),
      hasRejectedApprovals: jest.fn(),
      updateEstado: jest.fn()
    };

    const mockSupabaseService = {
      getClient: jest.fn().mockReturnValue(mockSupabaseClient)
    };

    const mockNotificationsService = {
      createNotification: jest.fn()
    };

    const mockEventBusService = {
      emitOrdenCompraAprobada: jest.fn().mockResolvedValue(undefined)
    };

    const mockAuditService = {
      registrarCambio: jest.fn().mockResolvedValue(undefined)
    };

    const mockCacheInvalidationService = {
      onOrdenCompraCreated: jest.fn().mockResolvedValue(undefined)
    };

    const mockTaxCalculatorService = {
      calcularImpuestos: jest.fn().mockResolvedValue({
        subtotal: 10000,
        igv: 1800,
        total: 11800
      })
    };

    const mockDevolucionesProveedorService = {
      crearDevolucion: jest.fn(),
      emitirDevolucion: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdenesCompraService,
        {
          provide: OrdenesCompraRepository,
          useValue: mockOrdenesRepository
        },
        {
          provide: CotizacionesCompraRepository,
          useValue: mockCotizacionesRepository
        },
        {
          provide: OcAprobacionesRepository,
          useValue: mockOcAprobacionesRepository
        },
        {
          provide: SupabaseService,
          useValue: mockSupabaseService
        },
        {
          provide: NotificationsService,
          useValue: mockNotificationsService
        },
        {
          provide: EventBusService,
          useValue: mockEventBusService
        },
        {
          provide: AuditService,
          useValue: mockAuditService
        },
        {
          provide: CacheInvalidationService,
          useValue: mockCacheInvalidationService
        },
        {
          provide: TaxCalculatorService,
          useValue: mockTaxCalculatorService
        },
        {
          provide: DevolucionesProveedorService,
          useValue: mockDevolucionesProveedorService
        }
      ]
    }).compile();

    service = module.get<OrdenesCompraService>(OrdenesCompraService);
    ordenesRepository = module.get(OrdenesCompraRepository);
    cotizacionesRepository = module.get(CotizacionesCompraRepository);
    ocAprobacionesRepository = module.get(OcAprobacionesRepository);
    supabaseService = module.get(SupabaseService);
    notificationsService = module.get(NotificationsService);
    eventBusService = module.get(EventBusService);
    auditService = module.get(AuditService);
    cacheInvalidationService = module.get(CacheInvalidationService);
    taxCalculatorService = module.get(TaxCalculatorService);
    devolucionesProveedorService = module.get(DevolucionesProveedorService) as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    const validDto: CreateOrdenCompraDto = {
      numero: 'OC-2024-001',
      proveedor_id: 'proveedor-123',
      fecha_orden: new Date('2024-10-24'),
      fecha_entrega_esperada: new Date('2024-11-24'),
      dias_credito: 30,
      detalles: [
        {
          producto_id: 'producto-1',
          descripcion: 'Producto Test',
          cantidad: 10,
          precio_unitario: 1000
        }
      ]
    };

    it('should create an orden de compra with valid data', async () => {
      ordenesRepository.findByNumero.mockResolvedValue(null);
      ordenesRepository.create.mockResolvedValue(mockOrdenCompra);
      mockSupabaseClient.single.mockResolvedValue({ data: null, error: null });

      const result = await service.create(validDto, 'tenant-123');

      expect(result).toEqual(mockOrdenCompra);
      expect(ordenesRepository.findByNumero).toHaveBeenCalledWith('OC-2024-001', 'tenant-123');
      expect(ordenesRepository.create).toHaveBeenCalled();
    });

    it('should throw ConflictException when numero already exists', async () => {
      ordenesRepository.findByNumero.mockResolvedValue(mockOrdenCompra);

      await expect(service.create(validDto, 'tenant-123'))
        .rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException when no detalles provided', async () => {
      const invalidDto = { ...validDto, detalles: [] };

      await expect(service.create(invalidDto, 'tenant-123'))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid cantidad', async () => {
      const invalidDto = {
        ...validDto,
        detalles: [{ ...validDto.detalles[0], cantidad: 0 }]
      };

      await expect(service.create(invalidDto, 'tenant-123'))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for negative precio_unitario', async () => {
      const invalidDto = {
        ...validDto,
        detalles: [{ ...validDto.detalles[0], precio_unitario: -100 }]
      };

      await expect(service.create(invalidDto, 'tenant-123'))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for negative dias_credito', async () => {
      const invalidDto = { ...validDto, dias_credito: -5 };

      await expect(service.create(invalidDto, 'tenant-123'))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when fecha_entrega is before fecha_orden', async () => {
      const invalidDto = {
        ...validDto,
        fecha_orden: new Date('2024-11-24'),
        fecha_entrega_esperada: new Date('2024-10-24')
      };

      await expect(service.create(invalidDto, 'tenant-123'))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when cantidad_recibida exceeds cantidad', async () => {
      const invalidDto = {
        ...validDto,
        detalles: [{
          ...validDto.detalles[0],
          cantidad: 10,
          cantidad_recibida: 15
        }]
      };

      await expect(service.create(invalidDto, 'tenant-123'))
        .rejects.toThrow(BadRequestException);
    });

    it('should mark cotizacion as converted when cotizacion_id is provided', async () => {
      const dtoWithCotizacion = { ...validDto, cotizacion_id: 'cotizacion-123' };
      ordenesRepository.findByNumero.mockResolvedValue(null);
      ordenesRepository.create.mockResolvedValue({ ...mockOrdenCompra, cotizacion_id: 'cotizacion-123' });
      cotizacionesRepository.marcarComoConvertida.mockResolvedValue({} as any);
      mockSupabaseClient.single.mockResolvedValue({ data: null, error: null });

      await service.create(dtoWithCotizacion, 'tenant-123');

      expect(cotizacionesRepository.marcarComoConvertida).toHaveBeenCalledWith(
        'cotizacion-123',
        'orden-123',
        'tenant-123'
      );
    });

    it('should set estado to APROBACION when approval is required', async () => {
      ordenesRepository.findByNumero.mockResolvedValue(null);
      ordenesRepository.create.mockResolvedValue({ ...mockOrdenCompra, estado: 'APROBACION' });
      mockSupabaseClient.single.mockResolvedValue({
        data: { monto_aprobacion_compras: 5000 },
        error: null
      });
      ocAprobacionesRepository.create.mockResolvedValue({} as any);

      await service.create(validDto, 'tenant-123');

      expect(ordenesRepository.create).toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('should return an orden de compra by id', async () => {
      ordenesRepository.findById.mockResolvedValue(mockOrdenCompra);

      const result = await service.findById('orden-123', 'tenant-123');

      expect(result).toEqual(mockOrdenCompra);
      expect(ordenesRepository.findById).toHaveBeenCalledWith('orden-123', 'tenant-123');
    });

    it('should throw NotFoundException when orden not found', async () => {
      ordenesRepository.findById.mockResolvedValue(null);

      await expect(service.findById('non-existent', 'tenant-123'))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('should return all ordenes for a tenant', async () => {
      const mockResult = { data: [mockOrdenCompra], count: 1 };
      ordenesRepository.findAll.mockResolvedValue(mockResult);

      const result = await service.findAll('tenant-123');

      expect(result).toEqual(mockResult);
      expect(ordenesRepository.findAll).toHaveBeenCalledWith('tenant-123', undefined);
    });

    it('should apply filters when provided', async () => {
      const filters = { estado: 'APROBADA', proveedor_id: 'proveedor-123' };
      ordenesRepository.findAll.mockResolvedValue({ data: [], count: 0 });

      await service.findAll('tenant-123', filters);

      expect(ordenesRepository.findAll).toHaveBeenCalledWith('tenant-123', filters);
    });
  });

  describe('update', () => {
    const updateDto: UpdateOrdenCompraDto = {
      observaciones: 'Updated observations'
    };

    it('should update an orden in PENDIENTE state', async () => {
      ordenesRepository.findById.mockResolvedValue(mockOrdenCompra);
      ordenesRepository.update.mockResolvedValue({ ...mockOrdenCompra, ...updateDto });

      const result = await service.update('orden-123', updateDto, 'tenant-123');

      expect(result.observaciones).toBe(updateDto.observaciones);
      expect(ordenesRepository.update).toHaveBeenCalled();
    });

    it('should throw NotFoundException when orden not found', async () => {
      ordenesRepository.findById.mockResolvedValue(null);

      await expect(service.update('non-existent', updateDto, 'tenant-123'))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when updating non-editable state', async () => {
      ordenesRepository.findById.mockResolvedValue({ ...mockOrdenCompra, estado: 'APROBADA' });

      await expect(service.update('orden-123', updateDto, 'tenant-123'))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException when updating to existing numero', async () => {
      const dtoWithNumero = { numero: 'OC-2024-002' };
      ordenesRepository.findById.mockResolvedValue(mockOrdenCompra);
      ordenesRepository.findByNumero.mockResolvedValue({ ...mockOrdenCompra, id: 'different-id' });

      await expect(service.update('orden-123', dtoWithNumero, 'tenant-123'))
        .rejects.toThrow(ConflictException);
    });

    it('should allow updating to same numero', async () => {
      const dtoWithSameNumero = { numero: 'OC-2024-001' };
      ordenesRepository.findById.mockResolvedValue(mockOrdenCompra);
      ordenesRepository.findByNumero.mockResolvedValue(mockOrdenCompra);
      ordenesRepository.update.mockResolvedValue(mockOrdenCompra);

      await service.update('orden-123', dtoWithSameNumero, 'tenant-123');

      expect(ordenesRepository.update).toHaveBeenCalled();
    });

    it('should throw BadRequestException when updating with empty detalles', async () => {
      const invalidDto = { detalles: [] };
      ordenesRepository.findById.mockResolvedValue(mockOrdenCompra);

      await expect(service.update('orden-123', invalidDto, 'tenant-123'))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid cantidad in update', async () => {
      const invalidDto = {
        detalles: [{
          producto_id: 'producto-1',
          descripcion: 'Test',
          cantidad: 0,
          precio_unitario: 100
        }]
      };
      ordenesRepository.findById.mockResolvedValue(mockOrdenCompra);

      await expect(service.update('orden-123', invalidDto, 'tenant-123'))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when fecha_entrega is before fecha_orden in update', async () => {
      const invalidDto = {
        fecha_orden: new Date('2024-11-24'),
        fecha_entrega_esperada: new Date('2024-10-24')
      };
      ordenesRepository.findById.mockResolvedValue(mockOrdenCompra);

      await expect(service.update('orden-123', invalidDto, 'tenant-123'))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('aprobar', () => {
    const aprobarDto: AprobarOrdenCompraDto = {
      aprobador_id: 'user-123',
      aprobador_nombre: 'Juan Perez',
      comentarios: 'Aprobado'
    };

    it('should approve an orden in APROBACION state', async () => {
      const ordenEnAprobacion = { ...mockOrdenCompra, estado: 'APROBACION' };
      ordenesRepository.findById.mockResolvedValue(ordenEnAprobacion);
      ocAprobacionesRepository.findByOrdenId.mockResolvedValue([]);
      ocAprobacionesRepository.create.mockResolvedValue({} as any);
      ocAprobacionesRepository.countPendingByOrdenId.mockResolvedValue(0);
      ocAprobacionesRepository.hasRejectedApprovals.mockResolvedValue(false);
      ordenesRepository.updateEstado.mockResolvedValue({ ...ordenEnAprobacion, estado: 'APROBADA' });
      mockSupabaseClient.single.mockResolvedValue({
        data: { razon_social: 'Proveedor Test' },
        error: null
      });


      const result = await service.aprobar('orden-123', aprobarDto, 'tenant-123');

      expect(result.estado).toBe('APROBADA');
      expect(ocAprobacionesRepository.create).toHaveBeenCalled();
      expect(eventBusService.emitOrdenCompraAprobada).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-123',
          ordenId: 'orden-123',
          idempotencyKey: 'compras.oc.aprobada:tenant-123:orden-123',
          eventId: expect.any(String),
        }),
      );
    });

    it('should throw NotFoundException when orden not found', async () => {
      ordenesRepository.findById.mockResolvedValue(null);

      await expect(service.aprobar('non-existent', aprobarDto, 'tenant-123'))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when orden is not in approvable state', async () => {
      ordenesRepository.findById.mockResolvedValue({ ...mockOrdenCompra, estado: 'RECIBIDA' });

      await expect(service.aprobar('orden-123', aprobarDto, 'tenant-123'))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when already approved by same user', async () => {
      ordenesRepository.findById.mockResolvedValue({ ...mockOrdenCompra, estado: 'APROBACION' });
      ocAprobacionesRepository.findByOrdenId.mockResolvedValue([
        {
          id: 'aprobacion-1',
          aprobador_id: 'user-123',
          estado: 'APROBADA',
          nivel: 1
        }
      ] as any);

      await expect(service.aprobar('orden-123', aprobarDto, 'tenant-123'))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when there are rejected approvals', async () => {
      ordenesRepository.findById.mockResolvedValue({ ...mockOrdenCompra, estado: 'APROBACION' });
      ocAprobacionesRepository.findByOrdenId.mockResolvedValue([]);
      ocAprobacionesRepository.create.mockResolvedValue({} as any);
      ocAprobacionesRepository.countPendingByOrdenId.mockResolvedValue(0);
      ocAprobacionesRepository.hasRejectedApprovals.mockResolvedValue(true);

      await expect(service.aprobar('orden-123', aprobarDto, 'tenant-123'))
        .rejects.toThrow(BadRequestException);
    });

    it('should keep estado as APROBACION when there are pending approvals', async () => {
      ordenesRepository.findById.mockResolvedValue({ ...mockOrdenCompra, estado: 'APROBACION' });
      ocAprobacionesRepository.findByOrdenId.mockResolvedValue([]);
      ocAprobacionesRepository.create.mockResolvedValue({} as any);
      ocAprobacionesRepository.countPendingByOrdenId.mockResolvedValue(2);
      ocAprobacionesRepository.hasRejectedApprovals.mockResolvedValue(false);
      ordenesRepository.updateEstado.mockResolvedValue({ ...mockOrdenCompra, estado: 'APROBACION' });

      const result = await service.aprobar('orden-123', aprobarDto, 'tenant-123');

      expect(result.estado).toBe('APROBACION');
      expect(eventBusService.emitOrdenCompraAprobada).not.toHaveBeenCalled();
    });
  });

  describe('rechazar', () => {
    const rechazarDto: RechazarOrdenCompraDto = {
      rechazado_por_id: 'user-123',
      motivo_rechazo: 'Precio muy alto'
    };

    it('should reject an orden in APROBACION state', async () => {
      ordenesRepository.findById.mockResolvedValue({ ...mockOrdenCompra, estado: 'APROBACION' });
      ocAprobacionesRepository.create.mockResolvedValue({} as any);
      ordenesRepository.updateEstado.mockResolvedValue({ ...mockOrdenCompra, estado: 'ANULADA' });
      mockSupabaseClient.single.mockResolvedValue({
        data: { nombre: 'Juan', apellido: 'Perez' },
        error: null
      });

      const result = await service.rechazar('orden-123', rechazarDto, 'tenant-123');

      expect(result.estado).toBe('ANULADA');
      expect(ocAprobacionesRepository.create).toHaveBeenCalled();
    });

    it('should throw NotFoundException when orden not found', async () => {
      ordenesRepository.findById.mockResolvedValue(null);

      await expect(service.rechazar('non-existent', rechazarDto, 'tenant-123'))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when orden is not in rejectable state', async () => {
      ordenesRepository.findById.mockResolvedValue({ ...mockOrdenCompra, estado: 'RECIBIDA' });

      await expect(service.rechazar('orden-123', rechazarDto, 'tenant-123'))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('cancelar', () => {
    const cancelarDto: CancelarOrdenCompraDto = {
      cancelado_por_id: 'user-123',
      motivo_cancelacion: 'Ya no se necesita'
    };

    it('should cancel an orden in APROBADA state', async () => {
      ordenesRepository.findById.mockResolvedValue({ ...mockOrdenCompra, estado: 'APROBADA' });
      ordenesRepository.updateEstado.mockResolvedValue({ ...mockOrdenCompra, estado: 'ANULADA' });

      const result = await service.cancelar('orden-123', cancelarDto, 'tenant-123');

      expect(result.estado).toBe('ANULADA');
      expect(ordenesRepository.updateEstado).toHaveBeenCalledWith(
        'orden-123',
        'ANULADA',
        'tenant-123',
        undefined,
        expect.objectContaining({
          cancelado_at: expect.any(String),
          motivo_cancelacion: 'Ya no se necesita'
        })
      );
    });

    it('should throw NotFoundException when orden not found', async () => {
      ordenesRepository.findById.mockResolvedValue(null);

      await expect(service.cancelar('non-existent', cancelarDto, 'tenant-123'))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when orden is not in cancelable state', async () => {
      ordenesRepository.findById.mockResolvedValue({ ...mockOrdenCompra, estado: 'RECIBIDA' });

      await expect(service.cancelar('orden-123', cancelarDto, 'tenant-123'))
        .rejects.toThrow(BadRequestException);
    });

    it('should allow canceling orden in PARCIAL state', async () => {
      ordenesRepository.findById.mockResolvedValue({ ...mockOrdenCompra, estado: 'PARCIAL' });
      ordenesRepository.updateEstado.mockResolvedValue({ ...mockOrdenCompra, estado: 'ANULADA' });

      const result = await service.cancelar('orden-123', cancelarDto, 'tenant-123');

      expect(result.estado).toBe('ANULADA');
    });

    it('should block cancel when recepciones activas exist and override flag is not set', async () => {
      ordenesRepository.findById.mockResolvedValue({ ...mockOrdenCompra, estado: 'APROBADA' });

      const recepcionesQuery: any = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        then: (resolve: any) => resolve({ data: [{ id: 'r1', estado: 'BORRADOR' }], error: null }),
      };
      mockSupabaseClient.from.mockReturnValueOnce(recepcionesQuery);

      await expect(service.cancelar('orden-123', cancelarDto, 'tenant-123')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should allow cancel when recepciones activas exist and override flag is set', async () => {
      ordenesRepository.findById.mockResolvedValue({ ...mockOrdenCompra, estado: 'APROBADA' });
      ordenesRepository.updateEstado.mockResolvedValue({ ...mockOrdenCompra, estado: 'ANULADA' });

      const recepcionesQuery: any = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        then: (resolve: any) => resolve({ data: [{ id: 'r1', estado: 'BORRADOR' }], error: null }),
      };
      mockSupabaseClient.from.mockReturnValueOnce(recepcionesQuery);

      const result = await service.cancelar(
        'orden-123',
        { ...cancelarDto, permitir_cancelar_con_recepciones_activas: true },
        'tenant-123',
      );

      expect(result.estado).toBe('ANULADA');
    });

    it('should block cancel when recepciones cerradas exist and override flag is not set', async () => {
      ordenesRepository.findById.mockResolvedValue({ ...mockOrdenCompra, estado: 'APROBADA' });

      const recepcionesQuery: any = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        then: (resolve: any) => resolve({ data: [{ id: 'r1', estado: 'CERRADA' }], error: null }),
      };
      mockSupabaseClient.from.mockReturnValueOnce(recepcionesQuery);

      await expect(service.cancelar('orden-123', cancelarDto, 'tenant-123')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should allow cancel when recepciones cerradas exist and override flag is set', async () => {
      ordenesRepository.findById.mockResolvedValue({ ...mockOrdenCompra, estado: 'APROBADA' });
      ordenesRepository.updateEstado.mockResolvedValue({ ...mockOrdenCompra, estado: 'ANULADA' });

      const recepcionesQuery: any = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        then: (resolve: any) => resolve({ data: [{ id: 'r1', estado: 'CERRADA' }], error: null }),
      };
      const recepcionesDetalleQuery: any = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        then: (resolve: any) =>
          resolve({
            data: [
              {
                id: 'r1',
                numero: 'REC-0001',
                estado: 'CERRADA',
                items: [
                  {
                    id: 'ri-1',
                    detalle_id: 'detalle-1',
                    producto_id: 'producto-1',
                    cantidad_recibida: 1,
                    almacen_id: 'alm-1',
                    detalle: { id: 'detalle-1', descripcion: 'Producto Test', precio_unitario: 1000 },
                  },
                ],
              },
            ],
            error: null,
          }),
      };

      const devolucionExistenteQuery: any = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      };

      mockSupabaseClient.from
        .mockReturnValueOnce(recepcionesQuery)
        .mockReturnValueOnce(recepcionesDetalleQuery)
        .mockReturnValueOnce(devolucionExistenteQuery);

      devolucionesProveedorService.crearDevolucion.mockResolvedValue({ id: 'dev-1' });
      devolucionesProveedorService.emitirDevolucion.mockResolvedValue({ id: 'dev-1', estado: 'EMITIDA' });

      const result = await service.cancelar(
        'orden-123',
        { ...cancelarDto, permitir_cancelar_con_recepciones_cerradas: true },
        'tenant-123',
      );

      expect(result.estado).toBe('ANULADA');
      expect(devolucionesProveedorService.crearDevolucion).toHaveBeenCalled();
      expect(devolucionesProveedorService.emitirDevolucion).toHaveBeenCalled();
    });
  });

  describe('findRecepcionesByOrdenId', () => {
    it('should return recepciones for an orden', async () => {
      const mockRecepciones = [
        {
          id: 'recepcion-1',
          orden_id: 'orden-123',
          fecha_recepcion: '2024-10-25',
          estado: 'CERRADA'
        }
      ];
      ordenesRepository.findById.mockResolvedValue(mockOrdenCompra);
      ordenesRepository.findRecepcionesByOrdenId.mockResolvedValue(mockRecepciones);

      const result = await service.findRecepcionesByOrdenId('orden-123', 'tenant-123');

      expect(result).toEqual(mockRecepciones);
      expect(ordenesRepository.findRecepcionesByOrdenId).toHaveBeenCalledWith('orden-123', 'tenant-123');
    });

    it('should throw NotFoundException when orden not found', async () => {
      ordenesRepository.findById.mockResolvedValue(null);

      await expect(service.findRecepcionesByOrdenId('non-existent', 'tenant-123'))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('findAprobacionesByOrdenId', () => {
    it('should return aprobaciones for an orden', async () => {
      const mockAprobaciones = [
        {
          id: 'aprobacion-1',
          orden_id: 'orden-123',
          aprobador_id: 'user-123',
          estado: 'APROBADA'
        }
      ];
      ordenesRepository.findById.mockResolvedValue(mockOrdenCompra);
      ocAprobacionesRepository.findByOrdenId.mockResolvedValue(mockAprobaciones as any);

      const result = await service.findAprobacionesByOrdenId('orden-123', 'tenant-123');

      expect(result).toEqual(mockAprobaciones);
      expect(ocAprobacionesRepository.findByOrdenId).toHaveBeenCalledWith('orden-123');
    });

    it('should throw NotFoundException when orden not found', async () => {
      ordenesRepository.findById.mockResolvedValue(null);

      await expect(service.findAprobacionesByOrdenId('non-existent', 'tenant-123'))
        .rejects.toThrow(NotFoundException);
    });
  });
});
