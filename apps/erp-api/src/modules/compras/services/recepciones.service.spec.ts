import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RecepcionesService } from './recepciones.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { InventarioService } from '../../inventario/inventario.service';
import { EventBusService } from '../../../shared/events/event-bus.service';
import { AuditService } from '../../audit/audit.service';
import { EventEmitterService } from '../../../shared/events/event-emitter.service';
import { CreateRecepcionDto, CerrarRecepcionDto, CalidadRecepcion } from '../dto';

describe('RecepcionesService', () => {
  let service: RecepcionesService;
  let supabaseService: jest.Mocked<SupabaseService>;
  let inventarioService: jest.Mocked<InventarioService>;
  let eventBusService: jest.Mocked<EventBusService>;
  let eventEmitter: { emit: jest.Mock };
  let testingModule: TestingModule;

  const mockSupabaseClient = {
    from: jest.fn(),
  };

  const mockQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    like: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    single: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecepcionesService,
        {
          provide: SupabaseService,
          useValue: {
            getClient: jest.fn(() => mockSupabaseClient),
          },
        },
        {
          provide: InventarioService,
          useValue: {
            registrarMovimientoAlmacen: jest.fn(),
            registrarEntradaStockAtomico: jest.fn().mockResolvedValue('mov-1'),
          },
        },
        {
          provide: EventBusService,
          useValue: {
            emitRecepcionRegistrada: jest.fn(),
            emitCompraEntregada: jest.fn(),
            emitCompraRecibida: jest.fn(),
          },
        },
        {
          provide: EventEmitterService,
          useValue: {
            emit: jest.fn(),
          },
        },
        {
          provide: AuditService,
          useValue: {
            registrarCambio: jest.fn(),
          },
        },
      ],
    }).compile();

    const noopLogger = {
      log: () => { },
      error: () => { },
      warn: () => { },
      debug: () => { },
      verbose: () => { },
      setContext: () => { },
    };
    module.useLogger(noopLogger as any);

    testingModule = module;
    service = module.get<RecepcionesService>(RecepcionesService);
    supabaseService = module.get(SupabaseService) as jest.Mocked<SupabaseService>;
    inventarioService = module.get(InventarioService) as jest.Mocked<InventarioService>;
    eventBusService = module.get(EventBusService) as jest.Mocked<EventBusService>;
    eventEmitter = module.get(EventEmitterService) as any;

    // Reset mocks
    jest.clearAllMocks();
    mockSupabaseClient.from.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.maybeSingle.mockResolvedValue({ data: null, error: null });
    mockQueryBuilder.single.mockResolvedValue({ data: null, error: null });
  });

  afterEach(async () => {
    if (testingModule) {
      await testingModule.close();
    }
  });

  describe('obtenerRecepciones', () => {
    it('should return all recepciones for a tenant', async () => {
      const mockRecepciones = [
        {
          id: '1',
          numero: 'REC-2025-0001',
          estado: 'CERRADA',
          tenant_id: 'tenant-1',
        },
      ];

      // Mock the query chain - note: obtenerRecepciones doesn't use .single()
      Object.assign(mockQueryBuilder, { data: mockRecepciones, error: null });

      const result = await service.obtenerRecepciones('tenant-1');

      expect(result).toEqual(mockRecepciones);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('recepciones');
    });

    it('should filter recepciones by estado', async () => {
      const mockRecepciones = [
        {
          id: '1',
          numero: 'REC-2025-0001',
          estado: 'BORRADOR',
          tenant_id: 'tenant-1',
        },
      ];

      Object.assign(mockQueryBuilder, { data: mockRecepciones, error: null });

      await service.obtenerRecepciones('tenant-1', { estado: 'BORRADOR' });

      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('estado', 'BORRADOR');
    });

    it('should throw BadRequestException on database error', async () => {
      Object.assign(mockQueryBuilder, {
        data: null,
        error: { message: 'Database error' },
      });

      await expect(service.obtenerRecepciones('tenant-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('obtenerRecepcionPorId', () => {
    it('should return a recepcion by id', async () => {
      const mockRecepcion = {
        id: 'rec-1',
        numero: 'REC-2025-0001',
        estado: 'CERRADA',
        tenant_id: 'tenant-1',
        items: [],
      };

      mockQueryBuilder.maybeSingle.mockResolvedValue({ data: mockRecepcion, error: null });

      const result = await service.obtenerRecepcionPorId('rec-1', 'tenant-1');

      expect(result).toEqual(mockRecepcion);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('recepciones');
    });

    it('should throw NotFoundException when recepcion not found', async () => {
      mockQueryBuilder.maybeSingle.mockResolvedValue({
        data: null,
        error: { message: 'Not found' },
      });

      await expect(service.obtenerRecepcionPorId('invalid-id', 'tenant-1')).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('crearRecepcion', () => {
    const mockOrden = {
      id: 'orden-1',
      numero: 'OC-2025-0001',
      estado: 'APROBADA',
      tenant_id: 'tenant-1',
      detalles: [
        {
          id: 'detalle-1',
          producto_id: 'prod-1',
          cantidad: 10,
          cantidad_recibida: 0,
          descripcion: 'Producto Test',
        },
      ],
    };

    const createDto: CreateRecepcionDto = {
      orden_id: 'orden-1',
      items: [
        {
          detalle_id: 'detalle-1',
          cantidad_recibida: 5,
          calidad: CalidadRecepcion.OK,
          almacen_id: 'alm-1',
        },
      ],
    };

    it('should create a recepcion successfully', async () => {
      const mockRecepcion = {
        id: 'rec-1',
        numero: 'REC-2025-0001',
        estado: 'BORRADOR',
      };

      const mockRecepcionCompleta = {
        ...mockRecepcion,
        items: createDto.items,
        orden: mockOrden,
      };

      // Secuencia de mocks en orden de ejecución:
      // 1. Query de orden de compra
      mockQueryBuilder.single.mockResolvedValueOnce({ data: mockOrden, error: null });

      // 2. Query para generar número (busca últimas recepciones)
      Object.assign(mockQueryBuilder, { data: [], error: null });

      // 3. Insert de recepción
      mockQueryBuilder.single.mockResolvedValueOnce({ data: mockRecepcion, error: null });

      // 4. Insert de items (no usa .single(), solo retorna error)
      Object.assign(mockQueryBuilder, { data: null, error: null });

      // 5. Query final para obtener recepción completa (usa maybeSingle, no single)
      mockQueryBuilder.maybeSingle.mockResolvedValueOnce({ data: mockRecepcionCompleta, error: null });

      const result = await service.crearRecepcion('tenant-1', createDto, 'user-1');

      expect(result).toBeDefined();
      expect(result.numero).toBe('REC-2025-0001');
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('ordenes_compra');
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('recepciones');
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('recepcion_items');
    });

    it('should throw NotFoundException when orden not found', async () => {
      // Reset mocks para este test
      jest.clearAllMocks();
      mockSupabaseClient.from.mockReturnValue(mockQueryBuilder);

      // Solo mock la primera llamada (query de orden)
      mockQueryBuilder.single.mockResolvedValueOnce({ data: null, error: { message: 'Not found' } });

      await expect(service.crearRecepcion('tenant-1', createDto, 'user-1')).rejects.toThrow(
        NotFoundException
      );
    });

    it('should throw BadRequestException when orden is not in valid state', async () => {
      // Reset mocks para este test
      jest.clearAllMocks();
      mockSupabaseClient.from.mockReturnValue(mockQueryBuilder);

      const invalidOrden = { ...mockOrden, estado: 'BORRADOR' };
      // Solo mock la primera llamada (query de orden)
      mockQueryBuilder.single.mockResolvedValueOnce({ data: invalidOrden, error: null });

      await expect(service.crearRecepcion('tenant-1', createDto, 'user-1')).rejects.toThrow(
        BadRequestException
      );
    });

    it('should throw BadRequestException when cantidad exceeds pendiente', async () => {
      mockQueryBuilder.single.mockResolvedValueOnce({ data: mockOrden, error: null });

      const invalidDto: CreateRecepcionDto = {
        orden_id: 'orden-1',
        items: [
          {
            detalle_id: 'detalle-1',
            cantidad_recibida: 15, // Exceeds available 10
            calidad: CalidadRecepcion.OK,
            almacen_id: 'alm-1',
          },
        ],
      };

      await expect(service.crearRecepcion('tenant-1', invalidDto, 'user-1')).rejects.toThrow(
        BadRequestException
      );
    });

    it('should throw BadRequestException when detalle not found in orden', async () => {
      mockQueryBuilder.single.mockResolvedValueOnce({ data: mockOrden, error: null });

      const invalidDto: CreateRecepcionDto = {
        orden_id: 'orden-1',
        items: [
          {
            detalle_id: 'invalid-detalle',
            cantidad_recibida: 5,
            calidad: CalidadRecepcion.OK,
            almacen_id: 'alm-1',
          },
        ],
      };

      await expect(service.crearRecepcion('tenant-1', invalidDto, 'user-1')).rejects.toThrow(
        BadRequestException
      );
    });
  });

  describe('cerrarRecepcion', () => {
    const mockRecepcion = {
      id: 'rec-1',
      numero: 'REC-2025-0001',
      estado: 'BORRADOR',
      orden_id: 'orden-1',
      orden: {
        id: 'orden-1',
        numero: 'OC-2025-0001',
      },
      items: [
        {
          id: 'item-1',
          detalle_id: 'detalle-1',
          producto_id: 'prod-1',
          cantidad_recibida: 5,
          calidad: CalidadRecepcion.OK,
          almacen_id: 'alm-1',
        },
      ],
    };

    it('should close a recepcion successfully and emit outbox', async () => {
      const mockRecepcionCompleta = {
        ...mockRecepcion,
        items: [
          {
            ...mockRecepcion.items[0],
            producto: { id: 'prod-1', nombre: 'Producto Test' },
          },
        ],
      };

      // Spy en obtenerRecepcionPorId - se llamará 3 veces:
      // 1. Al inicio de cerrarRecepcion
      // 2. Dentro de emitirEventoRecepcionRegistrada
      // 3. Al final de cerrarRecepcion
      const obtenerSpy = jest
        .spyOn(service, 'obtenerRecepcionPorId')
        .mockResolvedValueOnce(mockRecepcionCompleta) // Primera llamada
        .mockResolvedValueOnce(mockRecepcionCompleta) // Segunda llamada (evento)
        .mockResolvedValueOnce(mockRecepcionCompleta); // Tercera llamada (final)

      // Mock detalle query (para actualizar cantidad_recibida)
      mockQueryBuilder.single.mockResolvedValueOnce({
        data: { cantidad: 10, cantidad_recibida: 0 },
        error: null,
      });

      // Mock detalle update
      mockQueryBuilder.single.mockResolvedValueOnce({ data: null, error: null });

      // Mock orden detalles query for estado update
      Object.assign(mockQueryBuilder, {
        data: [{ cantidad: 10, cantidad_recibida: 5 }],
        error: null,
      });

      // Mock orden update
      mockQueryBuilder.single.mockResolvedValueOnce({ data: null, error: null });

      // Mock recepcion update (cerrar)
      mockQueryBuilder.single.mockResolvedValueOnce({ data: null, error: null });

      // Mock orden query for event
      mockQueryBuilder.single.mockResolvedValueOnce({
        data: {
          id: 'orden-1',
          numero: 'OC-2025-0001',
          subtotal: 100,
          igv: 18,
          total: 118,
          proveedor: {
            id: 'prov-1',
            razon_social: 'Proveedor Test',
            ruc: '20123456789',
            dias_credito: 30,
          },
        },
        error: null,
      });

      const movimientosQuery: any = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        then: (resolve: any) => resolve({ data: [], error: null }),
      };
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'movimientos_inventario') {
          return movimientosQuery;
        }
        return mockQueryBuilder;
      });

      const cerrarDto: CerrarRecepcionDto = { observaciones: 'Recepción completa' };
      const result = await service.cerrarRecepcion('rec-1', 'tenant-1', cerrarDto, 'user-1');

      expect(result).toBeDefined();
      expect(result.numero).toBe('REC-2025-0001');
      expect(inventarioService.registrarEntradaStockAtomico).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(expect.objectContaining({
        eventType: 'recepcion.registrada',
        aggregateType: 'recepcion',
      }));
    });

    it('should throw BadRequestException when recepcion is not BORRADOR', async () => {
      const closedRecepcion = { ...mockRecepcion, estado: 'CERRADA' };
      jest.spyOn(service, 'obtenerRecepcionPorId').mockResolvedValue(closedRecepcion);

      const cerrarDto: CerrarRecepcionDto = {};
      await expect(
        service.cerrarRecepcion('rec-1', 'tenant-1', cerrarDto, 'user-1')
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when recepcion has no items', async () => {
      const emptyRecepcion = { ...mockRecepcion, items: [] };
      jest.spyOn(service, 'obtenerRecepcionPorId').mockResolvedValue(emptyRecepcion);

      const cerrarDto: CerrarRecepcionDto = {};
      await expect(
        service.cerrarRecepcion('rec-1', 'tenant-1', cerrarDto, 'user-1')
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when cerrarRecepcion causes over-recepción por detalle', async () => {
      const mockRecepcionCompleta = {
        ...mockRecepcion,
        items: [
          {
            ...mockRecepcion.items[0],
            producto: { id: 'prod-1', nombre: 'Producto Test' },
            cantidad_recibida: 5,
          },
        ],
      };

      mockQueryBuilder.single.mockReset();

      jest
        .spyOn(service, 'obtenerRecepcionPorId')
        .mockResolvedValueOnce(mockRecepcionCompleta)
        .mockResolvedValueOnce(mockRecepcionCompleta)
        .mockResolvedValueOnce(mockRecepcionCompleta);

      // detalle.cantidad=10, cantidad_recibida=8 -> nueva=13 (excede)
      mockQueryBuilder.single.mockResolvedValueOnce({
        data: { cantidad: 10, cantidad_recibida: 8 },
        error: null,
      });

      const movimientosQuery: any = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        then: (resolve: any) => resolve({ data: [], error: null }),
      };
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'movimientos_inventario') {
          return movimientosQuery;
        }
        return mockQueryBuilder;
      });

      const cerrarDto: CerrarRecepcionDto = {};

      await expect(
        service.cerrarRecepcion('rec-1', 'tenant-1', cerrarDto, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should not create inventory movement for RECHAZADO items', async () => {
      const recepcionWithRechazado = {
        ...mockRecepcion,
        items: [
          {
            ...mockRecepcion.items[0],
            calidad: CalidadRecepcion.RECHAZADO,
            producto: { id: 'prod-1', nombre: 'Producto Test' },
          },
        ],
      };

      // Resetear mocks para este test
      jest.clearAllMocks();
      mockSupabaseClient.from.mockReturnValue(mockQueryBuilder);

      // Resetear el mock de single completamente
      mockQueryBuilder.single.mockReset();

      // Spy en obtenerRecepcionPorId - se llamará 3 veces igual que el test anterior
      const obtenerSpy = jest
        .spyOn(service, 'obtenerRecepcionPorId')
        .mockResolvedValueOnce(recepcionWithRechazado) // Primera llamada
        .mockResolvedValueOnce(recepcionWithRechazado) // Segunda llamada (evento)
        .mockResolvedValueOnce(recepcionWithRechazado); // Tercera llamada (final)

      // Mock detalle query (para actualizar cantidad_recibida) - IMPORTANTE: debe retornar data, no null
      mockQueryBuilder.single.mockResolvedValueOnce({
        data: { cantidad: 10, cantidad_recibida: 0 },
        error: null,
      });

      // Mock detalle update
      mockQueryBuilder.single.mockResolvedValueOnce({ data: null, error: null });

      // Mock orden detalles query
      Object.assign(mockQueryBuilder, {
        data: [{ cantidad: 10, cantidad_recibida: 5 }],
        error: null,
      });

      // Mock orden update
      mockQueryBuilder.single.mockResolvedValueOnce({ data: null, error: null });

      // Mock recepcion update
      mockQueryBuilder.single.mockResolvedValueOnce({ data: null, error: null });

      // Mock orden query for event
      mockQueryBuilder.single.mockResolvedValueOnce({
        data: {
          id: 'orden-1',
          numero: 'OC-2025-0001',
          subtotal: 100,
          igv: 18,
          total: 118,
          proveedor: {
            id: 'prov-1',
            razon_social: 'Proveedor Test',
            ruc: '20123456789',
            dias_credito: 30,
          },
        },
        error: null,
      });

      const cerrarDto: CerrarRecepcionDto = {};
      await service.cerrarRecepcion('rec-1', 'tenant-1', cerrarDto, 'user-1');

      // Verificar que NO se llamó al servicio de inventario porque el item es RECHAZADO
      expect(inventarioService.registrarEntradaStockAtomico).not.toHaveBeenCalled();
    });

    it('should be idempotent when inventory movement already exists for the recepcion item', async () => {
      const mockRecepcionCompleta = {
        ...mockRecepcion,
        items: [
          {
            ...mockRecepcion.items[0],
            producto: { id: 'prod-1', nombre: 'Producto Test' },
          },
        ],
      };

      jest
        .spyOn(service, 'obtenerRecepcionPorId')
        .mockResolvedValueOnce(mockRecepcionCompleta)
        .mockResolvedValueOnce(mockRecepcionCompleta)
        .mockResolvedValueOnce(mockRecepcionCompleta);

      jest.spyOn(service as any, 'actualizarEstadoOrden').mockResolvedValue(undefined);
      jest.spyOn(service as any, 'emitirEventoRecepcionRegistrada').mockResolvedValue(undefined);
      jest.spyOn(service as any, 'emitirEventoCompraEntregada').mockResolvedValue(undefined);

      const movimientosQuery: any = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        then: (resolve: any) => resolve({ data: [{ id: 'mov-1' }], error: null }),
      };

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'movimientos_inventario') {
          return movimientosQuery;
        }
        return mockQueryBuilder;
      });

      mockQueryBuilder.single.mockResolvedValueOnce({ data: null, error: null }); // recepciones.update

      const cerrarDto: CerrarRecepcionDto = { observaciones: 'Retry close' };
      const result = await service.cerrarRecepcion('rec-1', 'tenant-1', cerrarDto, 'user-1');

      expect(result).toBeDefined();
      expect(inventarioService.registrarEntradaStockAtomico).not.toHaveBeenCalled();
    });
  });

  describe('actualizarRecepcion', () => {
    it('should update a recepcion in BORRADOR state', async () => {
      const mockRecepcion = {
        id: 'rec-1',
        numero: 'REC-2025-0001',
        estado: 'BORRADOR',
      };

      jest.spyOn(service, 'obtenerRecepcionPorId').mockResolvedValue(mockRecepcion);
      mockQueryBuilder.single.mockResolvedValue({ data: null, error: null });

      const updateDto = { observaciones: 'Updated observations' };
      const result = await service.actualizarRecepcion('rec-1', 'tenant-1', updateDto, 'user-1');

      expect(result).toBeDefined();
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('recepciones');
    });

    it('should throw BadRequestException when updating non-BORRADOR recepcion', async () => {
      const closedRecepcion = {
        id: 'rec-1',
        numero: 'REC-2025-0001',
        estado: 'CERRADA',
      };

      jest.spyOn(service, 'obtenerRecepcionPorId').mockResolvedValue(closedRecepcion);

      const updateDto = { observaciones: 'Updated observations' };
      await expect(
        service.actualizarRecepcion('rec-1', 'tenant-1', updateDto, 'user-1')
      ).rejects.toThrow(BadRequestException);
    });
  });
});
