import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RecepcionesService } from './recepciones.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { EventBusService } from '../../../shared/events/event-bus.service';
import { AuditService } from '../../audit/audit.service';
import { CreateRecepcionDto, CerrarRecepcionDto, CalidadRecepcion } from '../dto';

describe('RecepcionesService', () => {
  let service: RecepcionesService;
  let supabaseService: jest.Mocked<SupabaseService>;
  let eventBusService: jest.Mocked<EventBusService>;
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
    // Reset mocks
    jest.clearAllMocks();
    mockSupabaseClient.from.mockReturnValue(mockQueryBuilder);
    mockSupabaseClient.rpc.mockResolvedValue({ data: { id: 'rec-1', movimientos: [] }, error: null });
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

      expect(result).toEqual({
        ...mockRecepcion,
        orden: null,
        almacenes: null,
        ubicaciones: null,
      });
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('recepciones');
    });

    it('normaliza el contrato de BD para el detalle consumido por la UI', async () => {
      const mockRecepcion = {
        id: 'rec-1',
        numero: 'REC-DEMO-001',
        tenant_id: 'tenant-1',
        orden: { id: 'oc-1', proveedor: { id: 'prov-1', razon_social: 'Proveedor Demo' } },
        items: [
          {
            id: 'item-1',
            cantidad_recibida: 10,
            calidad: 'CONFORME',
            producto: { id: 'prod-1', nombre: 'Detergente' },
            almacen: { id: 'alm-1', nombre: 'Principal' },
            ubicacion: null,
            metadata: { observaciones: 'Sin daños' },
          },
        ],
      };

      mockQueryBuilder.maybeSingle.mockResolvedValueOnce({ data: mockRecepcion, error: null });
      Object.assign(mockQueryBuilder, { data: [], error: null });

      const result = await service.obtenerRecepcionPorId('rec-1', 'tenant-1');

      expect(result).toEqual(
        expect.objectContaining({
          almacenes: mockRecepcion.items[0].almacen,
          orden: expect.objectContaining({ proveedores: mockRecepcion.orden.proveedor }),
          items: [
            expect.objectContaining({
              cantidad: 10,
              calidad: 'OK',
              productos: mockRecepcion.items[0].producto,
              observaciones: 'Sin daños',
              cantidad_disponible_devolucion: 10,
            }),
          ],
        }),
      );
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
      idempotency_key: 'recepcion:orden-1:intento-1',
      items: [
        {
          detalle_id: 'detalle-1',
          cantidad_recibida: 5,
          calidad: CalidadRecepcion.OK,
          almacen_id: 'alm-1',
        },
      ],
    };

    it('crea o reutiliza la recepción por RPC con actor, detalle e idempotencia explícitos', async () => {
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

      mockSupabaseClient.rpc.mockResolvedValueOnce({ data: mockRecepcion, error: null });
      jest.spyOn(service, 'obtenerRecepcionPorId').mockResolvedValue(mockRecepcionCompleta as any);

      const result = await service.crearRecepcion('tenant-1', createDto, 'user-1');

      expect(result).toBeDefined();
      expect(result.numero).toBe('REC-2025-0001');
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('crear_recepcion_tx', {
        p_tenant_id: 'tenant-1',
        p_orden_id: 'orden-1',
        p_items: [{
          detalle_id: 'detalle-1',
          cantidad_recibida: 5,
          calidad: CalidadRecepcion.OK,
          almacen_id: 'alm-1',
          ubicacion_id: null,
          lote: null,
          serie: null,
          fecha_expiracion: null,
          observaciones: null,
        }],
        p_observaciones: null,
        p_created_by: 'user-1',
        p_idempotency_key: 'recepcion:orden-1:intento-1',
      });
      expect(mockSupabaseClient.from).not.toHaveBeenCalledWith('ordenes_compra');
      expect(mockSupabaseClient.from).not.toHaveBeenCalledWith('recepciones');
      expect(mockSupabaseClient.from).not.toHaveBeenCalledWith('recepcion_items');
    });

    it('devuelve el resultado confirmado si falla la hidratación posterior al commit', async () => {
      const committed = {
        id: 'rec-commit-1',
        numero: 'REC-2025-0099',
        estado: 'BORRADOR',
        items: createDto.items,
        idempotent: false,
      };
      mockSupabaseClient.rpc.mockResolvedValueOnce({ data: committed, error: null });
      jest.spyOn(service, 'obtenerRecepcionPorId').mockRejectedValueOnce(
        new Error('join no disponible'),
      );

      await expect(
        service.crearRecepcion('tenant-1', createDto, 'user-1'),
      ).resolves.toEqual(expect.objectContaining({
        id: 'rec-commit-1',
        numero: 'REC-2025-0099',
        tenant_id: 'tenant-1',
      }));
    });

    it('propaga como BadRequestException que la orden no existe según la RPC', async () => {
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'Orden de compra no encontrada' },
      });

      await expect(service.crearRecepcion('tenant-1', createDto, 'user-1')).rejects.toThrow(
        'Orden de compra no encontrada',
      );
      expect(mockSupabaseClient.from).not.toHaveBeenCalledWith('ordenes_compra');
    });

    it('delega a la RPC la validación del estado de la orden', async () => {
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'La orden debe estar APROBADA o PARCIAL' },
      });

      await expect(service.crearRecepcion('tenant-1', createDto, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
        'crear_recepcion_tx',
        expect.objectContaining({ p_orden_id: 'orden-1' }),
      );
    });

    it('delega a la RPC la validación de sobre-recepción', async () => {
      const invalidDto: CreateRecepcionDto = {
        orden_id: 'orden-1',
        idempotency_key: 'recepcion:orden-1:sobre-recepcion',
        items: [
          {
            detalle_id: 'detalle-1',
            cantidad_recibida: 15, // Exceeds available 10
            calidad: CalidadRecepcion.OK,
            almacen_id: 'alm-1',
          },
        ],
      };
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'La cantidad recibida excede la cantidad pendiente' },
      });

      await expect(service.crearRecepcion('tenant-1', invalidDto, 'user-1')).rejects.toThrow(
        'excede la cantidad pendiente',
      );
    });

    it('delega a la RPC la pertenencia del detalle a la orden y al tenant', async () => {
      const invalidDto: CreateRecepcionDto = {
        orden_id: 'orden-1',
        idempotency_key: 'recepcion:orden-1:detalle-ajeno',
        items: [
          {
            detalle_id: 'invalid-detalle',
            cantidad_recibida: 5,
            calidad: CalidadRecepcion.OK,
            almacen_id: 'alm-1',
          },
        ],
      };
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'Detalle no encontrado en la orden o tenant' },
      });

      await expect(service.crearRecepcion('tenant-1', invalidDto, 'user-1')).rejects.toThrow(
        'Detalle no encontrado',
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

    it('cierra la recepción por RPC y no duplica fuera del commit el evento durable de 440', async () => {
      const recepcionCerrada = { ...mockRecepcion, estado: 'CERRADA' };
      jest.spyOn(service, 'obtenerRecepcionPorId')
        .mockResolvedValueOnce(recepcionCerrada as any);

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
      const cerrarDto: CerrarRecepcionDto = { observaciones: 'Recepción completa' };
      const result = await service.cerrarRecepcion('rec-1', 'tenant-1', cerrarDto, 'user-1');

      expect(result).toEqual(recepcionCerrada);
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
        'cerrar_recepcion_tx',
        {
          p_recepcion_id: 'rec-1',
          p_tenant_id: 'tenant-1',
          p_user_id: 'user-1',
          p_observaciones: 'Recepción completa',
        },
      );
      expect(eventBusService.emitRecepcionRegistrada).not.toHaveBeenCalled();
      expect(eventBusService.emitCompraEntregada).not.toHaveBeenCalled();
      expect(eventBusService.emitMovimientoStock).not.toHaveBeenCalled();
      expect(mockSupabaseClient.from).not.toHaveBeenCalledWith('productos');
      expect(mockSupabaseClient.from).not.toHaveBeenCalledWith('movimientos_almacen');
    });

    it('reintenta una recepción CERRADA en la RPC y devuelve el mismo cierre idempotente', async () => {
      const recepcionCerrada = { ...mockRecepcion, estado: 'CERRADA' };
      jest.spyOn(service, 'obtenerRecepcionPorId').mockResolvedValue(recepcionCerrada as any);
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: {
          id: 'rec-1',
          recepcion_id: 'rec-1',
          numero: 'REC-2025-0001',
          orden_id: 'orden-1',
          estado: 'CERRADA',
          idempotent: true,
          movimientos: [],
        },
        error: null,
      });

      await expect(
        service.cerrarRecepcion('rec-1', 'tenant-1', {}, 'user-1'),
      ).resolves.toEqual(recepcionCerrada);
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
        'cerrar_recepcion_tx',
        expect.objectContaining({ p_recepcion_id: 'rec-1', p_tenant_id: 'tenant-1' }),
      );
    });

    it('no informa fallo transaccional si sólo falla la hidratación posterior al cierre', async () => {
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: {
          id: 'rec-1',
          recepcion_id: 'rec-1',
          numero: 'REC-2025-0001',
          orden_id: 'orden-1',
          estado: 'CERRADA',
          idempotent: false,
          movimientos: [],
        },
        error: null,
      });
      jest.spyOn(service, 'obtenerRecepcionPorId').mockRejectedValueOnce(
        new Error('falló join de detalle'),
      );

      await expect(
        service.cerrarRecepcion('rec-1', 'tenant-1', {}, 'user-1'),
      ).resolves.toEqual(expect.objectContaining({
        id: 'rec-1',
        estado: 'CERRADA',
        tenant_id: 'tenant-1',
      }));
    });

    it('propaga el rechazo transaccional si la recepción no tiene items', async () => {
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'La recepción debe tener al menos un item' },
      });

      await expect(
        service.cerrarRecepcion('rec-1', 'tenant-1', {}, 'user-1'),
      ).rejects.toThrow(BadRequestException);
      expect(mockSupabaseClient.rpc).toHaveBeenCalled();
    });

    it('propaga el error de la RPC como BadRequestException (p.ej. over-recepción o race)', async () => {
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'La cantidad recibida acumulada (13) excede la ordenada (10)' },
      });

      await expect(
        service.cerrarRecepcion('rec-1', 'tenant-1', {}, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('no re-emite en caliente los movimientos ya persistidos por cerrar_recepcion_tx', async () => {
      jest.spyOn(service, 'obtenerRecepcionPorId')
        .mockResolvedValueOnce({ ...mockRecepcion, estado: 'CERRADA' } as any);
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

      await service.cerrarRecepcion('rec-1', 'tenant-1', {}, 'user-1');

      expect(eventBusService.emitMovimientoStock).not.toHaveBeenCalled();
      expect(eventBusService.emitRecepcionRegistrada).not.toHaveBeenCalled();
      expect(mockSupabaseClient.from).not.toHaveBeenCalledWith('productos');
      expect(mockSupabaseClient.from).not.toHaveBeenCalledWith('movimientos_almacen');
    });

    it('cierra sin movimientos cuando todos los items son rechazados y no toca inventario en JavaScript', async () => {
      const recepcionCerrada = { ...mockRecepcion, estado: 'CERRADA' };
      jest.spyOn(service, 'obtenerRecepcionPorId')
        .mockResolvedValueOnce(recepcionCerrada as any);
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: { numero: 'REC-2025-0001', orden_id: 'orden-1', orden_estado: 'APROBADA', movimientos: [] },
        error: null,
      });

      const result = await service.cerrarRecepcion('rec-1', 'tenant-1', {}, 'user-1');

      expect(result).toEqual(recepcionCerrada);
      expect(eventBusService.emitMovimientoStock).not.toHaveBeenCalled();
      expect(mockSupabaseClient.from).not.toHaveBeenCalledWith('productos');
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
      mockQueryBuilder.maybeSingle.mockResolvedValue({ data: { id: 'rec-1' }, error: null });

      const updateDto = { observaciones: 'Updated observations' };
      const result = await service.actualizarRecepcion('rec-1', 'tenant-1', updateDto, 'user-1');

      expect(result).toBeDefined();
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('recepciones');
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('estado', 'BORRADOR');
    });

    it('should fail safely when the reception closes during an update', async () => {
      jest.spyOn(service, 'obtenerRecepcionPorId').mockResolvedValue({
        id: 'rec-1',
        estado: 'BORRADOR',
      });
      mockQueryBuilder.maybeSingle.mockResolvedValue({ data: null, error: null });

      await expect(
        service.actualizarRecepcion(
          'rec-1',
          'tenant-1',
          { observaciones: 'No debe alcanzar una recepción cerrada' },
          'user-1',
        ),
      ).rejects.toThrow('dejó de estar en BORRADOR');
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
