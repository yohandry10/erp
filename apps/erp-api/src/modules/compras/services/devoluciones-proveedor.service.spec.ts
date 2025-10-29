import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DevolucionesProveedorService } from './devoluciones-proveedor.service';
import { DevolucionesProveedorRepository } from '../repositories/devoluciones-proveedor.repository';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { InventarioService, TipoMovimiento } from '../../inventario/inventario.service';
import { EventBusService } from '../../../shared/events/event-bus.service';
import { CreateDevolucionProveedorDto } from '../dto/create-devolucion-proveedor.dto';

describe('DevolucionesProveedorService', () => {
  let service: DevolucionesProveedorService;
  let repository: jest.Mocked<DevolucionesProveedorRepository>;
  let supabaseService: jest.Mocked<SupabaseService>;
  let inventarioService: jest.Mocked<InventarioService>;
  let eventBusService: jest.Mocked<EventBusService>;

  const mockDevolucion = {
    id: 'devolucion-123',
    tenant_id: 'tenant-123',
    numero: 'DEV-2024-0001',
    recepcion_id: 'recepcion-123',
    orden_id: 'orden-123',
    proveedor_id: 'proveedor-123',
    fecha_devolucion: '2024-10-25',
    estado: 'PENDIENTE',
    motivo: 'Producto defectuoso',
    subtotal: 10000,
    igv: 1800,
    total: 11800,
    observaciones: 'Observaciones de prueba',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    items: [
      {
        id: 'item-1',
        devolucion_id: 'devolucion-123',
        recepcion_item_id: 'recepcion-item-1',
        producto_id: 'producto-1',
        descripcion: 'Producto Test',
        cantidad: 10,
        precio_unitario: 1000,
        subtotal: 10000,
        almacen_id: 'almacen-1',
        lote: 'LOTE-001',
        serie: null,
        motivo_detalle: 'Defecto de fábrica',
        producto: {
          id: 'producto-1',
          nombre: 'Producto Test',
          codigo: 'PROD-001'
        }
      }
    ]
  };

  const mockSupabaseClient = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis()
  };

  beforeEach(async () => {
    const mockRepository = {
      generarNumeroDevolucion: jest.fn(),
      crear: jest.fn(),
      crearItems: jest.fn(),
      obtenerPorId: jest.fn(),
      listar: jest.fn(),
      actualizarEstado: jest.fn()
    };

    const mockSupabaseService = {
      getClient: jest.fn().mockReturnValue(mockSupabaseClient)
    };

    const mockInventarioService = {
      crearMovimiento: jest.fn(),
      descontarStock: jest.fn()
    };

    const mockEventBusService = {
      emit: jest.fn()
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DevolucionesProveedorService,
        {
          provide: DevolucionesProveedorRepository,
          useValue: mockRepository
        },
        {
          provide: SupabaseService,
          useValue: mockSupabaseService
        },
        {
          provide: InventarioService,
          useValue: mockInventarioService
        },
        {
          provide: EventBusService,
          useValue: mockEventBusService
        }
      ]
    }).compile();

    service = module.get<DevolucionesProveedorService>(DevolucionesProveedorService);
    repository = module.get(DevolucionesProveedorRepository);
    supabaseService = module.get(SupabaseService);
    inventarioService = module.get(InventarioService);
    eventBusService = module.get(EventBusService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('crearDevolucion', () => {
    const validDto: CreateDevolucionProveedorDto = {
      recepcion_id: 'recepcion-123',
      orden_id: 'orden-123',
      proveedor_id: 'proveedor-123',
      motivo: 'Producto defectuoso',
      items: [
        {
          recepcion_item_id: 'recepcion-item-1',
          producto_id: 'producto-1',
          descripcion: 'Producto Test',
          cantidad: 10,
          precio_unitario: 1000,
          almacen_id: 'almacen-1',
          lote: 'LOTE-001',
          motivo_detalle: 'Defecto de fábrica'
        }
      ],
      observaciones: 'Observaciones de prueba'
    };

    it('should create a devolucion with valid data', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: {
          id: 'orden-123',
          numero: 'OC-2024-001',
          proveedor_id: 'proveedor-123',
          estado: 'RECIBIDA'
        },
        error: null
      });

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: {
          id: 'recepcion-123',
          orden_id: 'orden-123'
        },
        error: null
      });

      repository.generarNumeroDevolucion.mockResolvedValue('DEV-2024-0001');
      repository.crear.mockResolvedValue(mockDevolucion);
      repository.crearItems.mockResolvedValue(mockDevolucion.items);

      const result = await service.crearDevolucion('tenant-123', validDto, 'user-123');

      expect(result).toEqual({
        ...mockDevolucion,
        items: mockDevolucion.items
      });
      expect(repository.generarNumeroDevolucion).toHaveBeenCalledWith('tenant-123');
      expect(repository.crear).toHaveBeenCalled();
      expect(repository.crearItems).toHaveBeenCalled();
    });

    it('should throw NotFoundException when orden not found', async () => {
      mockSupabaseClient.single.mockResolvedValue({
        data: null,
        error: { message: 'Not found' }
      });

      await expect(service.crearDevolucion('tenant-123', validDto, 'user-123'))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when proveedor does not match orden', async () => {
      mockSupabaseClient.single.mockResolvedValue({
        data: {
          id: 'orden-123',
          numero: 'OC-2024-001',
          proveedor_id: 'different-proveedor',
          estado: 'RECIBIDA'
        },
        error: null
      });

      await expect(service.crearDevolucion('tenant-123', validDto, 'user-123'))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when recepcion not found', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: {
          id: 'orden-123',
          numero: 'OC-2024-001',
          proveedor_id: 'proveedor-123',
          estado: 'RECIBIDA'
        },
        error: null
      });

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Not found' }
      });

      await expect(service.crearDevolucion('tenant-123', validDto, 'user-123'))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when recepcion does not belong to orden', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: {
          id: 'orden-123',
          numero: 'OC-2024-001',
          proveedor_id: 'proveedor-123',
          estado: 'RECIBIDA'
        },
        error: null
      });

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: {
          id: 'recepcion-123',
          orden_id: 'different-orden'
        },
        error: null
      });

      await expect(service.crearDevolucion('tenant-123', validDto, 'user-123'))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when no items provided', async () => {
      const invalidDto = { ...validDto, items: [] };

      mockSupabaseClient.single.mockResolvedValue({
        data: {
          id: 'orden-123',
          numero: 'OC-2024-001',
          proveedor_id: 'proveedor-123',
          estado: 'RECIBIDA'
        },
        error: null
      });

      await expect(service.crearDevolucion('tenant-123', invalidDto, 'user-123'))
        .rejects.toThrow(BadRequestException);
    });

    it('should calculate totals correctly', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: {
          id: 'orden-123',
          numero: 'OC-2024-001',
          proveedor_id: 'proveedor-123',
          estado: 'RECIBIDA'
        },
        error: null
      });

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: {
          id: 'recepcion-123',
          orden_id: 'orden-123'
        },
        error: null
      });

      repository.generarNumeroDevolucion.mockResolvedValue('DEV-2024-0001');
      repository.crear.mockResolvedValue(mockDevolucion);
      repository.crearItems.mockResolvedValue(mockDevolucion.items);

      await service.crearDevolucion('tenant-123', validDto, 'user-123');

      expect(repository.crear).toHaveBeenCalledWith(
        'tenant-123',
        expect.objectContaining({
          subtotal: 10000,
          igv: 1800,
          total: 11800
        }),
        'user-123'
      );
    });

    it('should create devolucion without recepcion_id', async () => {
      const dtoWithoutRecepcion = { ...validDto };
      delete dtoWithoutRecepcion.recepcion_id;

      mockSupabaseClient.single.mockResolvedValue({
        data: {
          id: 'orden-123',
          numero: 'OC-2024-001',
          proveedor_id: 'proveedor-123',
          estado: 'RECIBIDA'
        },
        error: null
      });

      repository.generarNumeroDevolucion.mockResolvedValue('DEV-2024-0001');
      repository.crear.mockResolvedValue({ ...mockDevolucion, recepcion_id: null });
      repository.crearItems.mockResolvedValue(mockDevolucion.items);

      const result = await service.crearDevolucion('tenant-123', dtoWithoutRecepcion, 'user-123');

      expect(result).toBeDefined();
      expect(repository.crear).toHaveBeenCalledWith(
        'tenant-123',
        expect.objectContaining({
          recepcion_id: null
        }),
        'user-123'
      );
    });
  });

  describe('obtenerDevoluciones', () => {
    it('should return all devoluciones for a tenant', async () => {
      const mockDevoluciones = [mockDevolucion];
      repository.listar.mockResolvedValue(mockDevoluciones);

      const result = await service.obtenerDevoluciones('tenant-123');

      expect(result).toEqual(mockDevoluciones);
      expect(repository.listar).toHaveBeenCalledWith('tenant-123', undefined);
    });

    it('should apply filters when provided', async () => {
      const filters = { estado: 'EMITIDA', proveedor_id: 'proveedor-123' };
      repository.listar.mockResolvedValue([]);

      await service.obtenerDevoluciones('tenant-123', filters);

      expect(repository.listar).toHaveBeenCalledWith('tenant-123', filters);
    });
  });

  describe('obtenerDevolucionPorId', () => {
    it('should return a devolucion by id', async () => {
      repository.obtenerPorId.mockResolvedValue(mockDevolucion);

      const result = await service.obtenerDevolucionPorId('devolucion-123', 'tenant-123');

      expect(result).toEqual(mockDevolucion);
      expect(repository.obtenerPorId).toHaveBeenCalledWith('devolucion-123', 'tenant-123');
    });

    it('should throw NotFoundException when devolucion not found', async () => {
      repository.obtenerPorId.mockResolvedValue(null);

      await expect(service.obtenerDevolucionPorId('non-existent', 'tenant-123'))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('emitirDevolucion', () => {
    it('should emit a devolucion successfully', async () => {
      repository.obtenerPorId.mockResolvedValue(mockDevolucion);
      inventarioService.crearMovimiento.mockResolvedValue('movimiento-123');
      inventarioService.descontarStock.mockResolvedValue('movimiento-124');
      repository.actualizarEstado.mockResolvedValue({
        ...mockDevolucion,
        estado: 'EMITIDA'
      });

      const result = await service.emitirDevolucion('devolucion-123', 'tenant-123', 'user-123');

      expect(result.estado).toBe('EMITIDA');
      expect(inventarioService.crearMovimiento).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: 'tenant-123',
          producto_id: 'producto-1',
          tipo: TipoMovimiento.SALIDA,
          cantidad: 10,
          referencia_tipo: 'DEVOLUCION_PROVEEDOR',
          referencia_id: 'devolucion-123'
        })
      );
      expect(inventarioService.descontarStock).toHaveBeenCalledWith(
        'producto-1',
        10,
        'tenant-123',
        'DEVOLUCION_PROVEEDOR',
        'devolucion-123'
      );
      expect(repository.actualizarEstado).toHaveBeenCalledWith(
        'devolucion-123',
        'tenant-123',
        'EMITIDA',
        'user-123'
      );
      expect(eventBusService.emit).toHaveBeenCalledWith(
        'devolucion.proveedor.emitida',
        expect.objectContaining({
          devolucion_id: 'devolucion-123',
          numero: 'DEV-2024-0001',
          proveedor_id: 'proveedor-123',
          orden_id: 'orden-123',
          total: 11800
        }),
        'compras'
      );
    });

    it('should throw NotFoundException when devolucion not found', async () => {
      repository.obtenerPorId.mockResolvedValue(null);

      await expect(service.emitirDevolucion('non-existent', 'tenant-123', 'user-123'))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when devolucion is not PENDIENTE', async () => {
      repository.obtenerPorId.mockResolvedValue({
        ...mockDevolucion,
        estado: 'EMITIDA'
      });

      await expect(service.emitirDevolucion('devolucion-123', 'tenant-123', 'user-123'))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when devolucion has no items', async () => {
      repository.obtenerPorId.mockResolvedValue({
        ...mockDevolucion,
        items: []
      });

      await expect(service.emitirDevolucion('devolucion-123', 'tenant-123', 'user-123'))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when inventory operation fails', async () => {
      repository.obtenerPorId.mockResolvedValue(mockDevolucion);
      inventarioService.crearMovimiento.mockRejectedValue(
        new BadRequestException('Stock insuficiente')
      );

      await expect(service.emitirDevolucion('devolucion-123', 'tenant-123', 'user-123'))
        .rejects.toThrow(BadRequestException);
    });

    it('should process multiple items correctly', async () => {
      const devolucionMultipleItems = {
        ...mockDevolucion,
        items: [
          mockDevolucion.items[0],
          {
            ...mockDevolucion.items[0],
            id: 'item-2',
            producto_id: 'producto-2',
            cantidad: 5,
            producto: {
              id: 'producto-2',
              nombre: 'Producto Test 2',
              codigo: 'PROD-002'
            }
          }
        ]
      };

      repository.obtenerPorId.mockResolvedValue(devolucionMultipleItems);
      inventarioService.crearMovimiento.mockResolvedValue('movimiento-123');
      inventarioService.descontarStock.mockResolvedValue('movimiento-124');
      repository.actualizarEstado.mockResolvedValue({
        ...devolucionMultipleItems,
        estado: 'EMITIDA'
      });

      await service.emitirDevolucion('devolucion-123', 'tenant-123', 'user-123');

      expect(inventarioService.crearMovimiento).toHaveBeenCalledTimes(2);
      expect(inventarioService.descontarStock).toHaveBeenCalledTimes(2);
    });

    it('should not fail if event emission fails', async () => {
      repository.obtenerPorId.mockResolvedValue(mockDevolucion);
      inventarioService.crearMovimiento.mockResolvedValue('movimiento-123');
      inventarioService.descontarStock.mockResolvedValue('movimiento-124');
      repository.actualizarEstado.mockResolvedValue({
        ...mockDevolucion,
        estado: 'EMITIDA'
      });
      eventBusService.emit.mockImplementation(() => {
        throw new Error('Event bus error');
      });

      const result = await service.emitirDevolucion('devolucion-123', 'tenant-123', 'user-123');

      expect(result.estado).toBe('EMITIDA');
    });
  });
});
