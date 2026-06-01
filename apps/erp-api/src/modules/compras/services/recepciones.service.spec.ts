import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RecepcionesService } from './recepciones.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { EventBusService } from '../../../shared/events/event-bus.service';
import { AuditService } from '../../audit/audit.service';
import { EventEmitterService } from '../../../shared/events/event-emitter.service';
import { CreateRecepcionDto, CerrarRecepcionDto, CalidadRecepcion } from '../dto';

describe('RecepcionesService', () => {
  let service: RecepcionesService;
  let supabaseService: jest.Mocked<SupabaseService>;
  let eventBusService: jest.Mocked<EventBusService>;
  let eventEmitter: { emit: jest.Mock };
  let testingModule: TestingModule;

  const mockSupabaseClient = {
    from: jest.fn(),
    rpc: jest.fn(),
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
          provide: EventBusService,
          useValue: {
            emitRecepcionRegistrada: jest.fn(),
            emitCompraEntregada: jest.fn(),
            emitCompraRecibida: jest.fn(),
            emitMovimientoStock: jest.fn(),
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
    eventBusService = module.get(EventBusService) as jest.Mocked<EventBusService>;
    eventEmitter = module.get(EventEmitterService) as any;

    // Reset mocks
    jest.clearAllMocks();
    mockSupabaseClient.from.mockReturnValue(mockQueryBuilder);
    mockSupabaseClient.rpc.mockResolvedValue({ data: { movimientos: [] }, error: null });
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
      expect(mockQueryBuilder.select).toHaveBeenCalledWith(
        expect.stringContaining('orden:ordenes_compra!recepciones_orden_id_fkey_runtime'),
      );
      expect(mockQueryBuilder.select).toHaveBeenCalledWith(
        expect.stringContaining('proveedor:proveedores!fk_ordenes_compra_proveedor_id'),
      );
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
          calidad: 'OK',
          almacen_id: 'alm-1',
        },
      ],
    };

    it('cierra la recepción de forma atómica vía RPC y emite el evento de recepción', async () => {
      jest.spyOn(service, 'obtenerRecepcionPorId').mockResolvedValue(mockRecepcion as any);
      // Aislamos los eventos post-commit; se testean por separado más abajo.
      const emitMovs = jest
        .spyOn(service as any, 'emitirEventosMovimientoEntrada')
        .mockResolvedValue(undefined);
      const emitRecepcion = jest
        .spyOn(service as any, 'emitirEventoRecepcionRegistrada')
        .mockResolvedValue(undefined);

      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: {
          recepcion_id: 'rec-1',
          numero: 'REC-2025-0001',
          orden_id: 'orden-1',
          orden_estado: 'RECIBIDA',
          movimientos: [
            { movimiento_id: 'mov-1', producto_id: 'prod-1', almacen_id: 'alm-1', cantidad: 5 },
          ],
        },
        error: null,
      });
      // Orden para el evento canónico.
      mockQueryBuilder.single.mockResolvedValueOnce({
        data: { id: 'orden-1', numero: 'OC-2025-0001', proveedor: { id: 'prov-1' } },
        error: null,
      });

      const cerrarDto: CerrarRecepcionDto = { observaciones: 'Recepción completa' };
      const result = await service.cerrarRecepcion('rec-1', 'tenant-1', cerrarDto, 'user-1');

      expect(result).toBeDefined();
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
        'cerrar_recepcion_tx',
        expect.objectContaining({
          p_recepcion_id: 'rec-1',
          p_tenant_id: 'tenant-1',
          p_user_id: 'user-1',
        }),
      );
      expect(emitMovs).toHaveBeenCalled();
      expect(emitRecepcion).toHaveBeenCalled();
      expect(eventBusService.emitCompraEntregada).not.toHaveBeenCalled();
    });

    it('lanza BadRequestException si la recepción no está en BORRADOR (sin invocar la RPC)', async () => {
      jest.spyOn(service, 'obtenerRecepcionPorId').mockResolvedValue({ ...mockRecepcion, estado: 'CERRADA' } as any);

      await expect(
        service.cerrarRecepcion('rec-1', 'tenant-1', {}, 'user-1'),
      ).rejects.toThrow(BadRequestException);
      expect(mockSupabaseClient.rpc).not.toHaveBeenCalled();
    });

    it('lanza BadRequestException si la recepción no tiene items (sin invocar la RPC)', async () => {
      jest.spyOn(service, 'obtenerRecepcionPorId').mockResolvedValue({ ...mockRecepcion, items: [] } as any);

      await expect(
        service.cerrarRecepcion('rec-1', 'tenant-1', {}, 'user-1'),
      ).rejects.toThrow(BadRequestException);
      expect(mockSupabaseClient.rpc).not.toHaveBeenCalled();
    });

    it('propaga el error de la RPC como BadRequestException (p.ej. over-recepción o race)', async () => {
      jest.spyOn(service, 'obtenerRecepcionPorId').mockResolvedValue(mockRecepcion as any);
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'La cantidad recibida acumulada (13) excede la ordenada (10)' },
      });

      await expect(
        service.cerrarRecepcion('rec-1', 'tenant-1', {}, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('re-emite MovimientoStockEvent por cada movimiento devuelto por la RPC (preserva asiento de entrada)', async () => {
      jest.spyOn(service, 'obtenerRecepcionPorId').mockResolvedValue(mockRecepcion as any);
      jest.spyOn(service as any, 'emitirEventoRecepcionRegistrada').mockResolvedValue(undefined);

      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: {
          numero: 'REC-2025-0001',
          orden_id: 'orden-1',
          orden_estado: 'PARCIAL',
          movimientos: [
            { movimiento_id: 'mov-1', producto_id: 'prod-1', almacen_id: 'alm-1', cantidad: 5 },
          ],
        },
        error: null,
      });

      // from('ordenes_compra').single() (orden para evento) y luego
      // from('productos').single() (dentro de emitirEventosMovimientoEntrada).
      mockQueryBuilder.single
        .mockResolvedValueOnce({ data: { id: 'orden-1', numero: 'OC-2025-0001', proveedor: {} }, error: null })
        .mockResolvedValueOnce({ data: { stock_actual: 5, precio_compra: 10 }, error: null });

      await service.cerrarRecepcion('rec-1', 'tenant-1', {}, 'user-1');

      expect(eventBusService.emitMovimientoStock).toHaveBeenCalledTimes(1);
      expect(eventBusService.emitMovimientoStock).toHaveBeenCalledWith(
        expect.objectContaining({
          movimientoId: 'mov-1',
          productoId: 'prod-1',
          tipoMovimiento: 'ENTRADA',
          cantidad: 5,
          valor: 50,
        }),
        'tenant-1',
      );
    });

    it('no emite MovimientoStockEvent cuando la RPC no devuelve movimientos (todos rechazados/idempotente)', async () => {
      jest.spyOn(service, 'obtenerRecepcionPorId').mockResolvedValue(mockRecepcion as any);
      jest.spyOn(service as any, 'emitirEventoRecepcionRegistrada').mockResolvedValue(undefined);

      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: { numero: 'REC-2025-0001', orden_id: 'orden-1', orden_estado: 'APROBADA', movimientos: [] },
        error: null,
      });
      mockQueryBuilder.single.mockResolvedValueOnce({ data: { id: 'orden-1', proveedor: {} }, error: null });

      await service.cerrarRecepcion('rec-1', 'tenant-1', {}, 'user-1');

      expect(eventBusService.emitMovimientoStock).not.toHaveBeenCalled();
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
