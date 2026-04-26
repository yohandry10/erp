import { Test, TestingModule } from '@nestjs/testing';
import { RecepcionesService } from './recepciones.service';
import { InventarioService } from '../../inventario/inventario.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { EventBusService } from '../../../shared/events/event-bus.service';
import { AuditService } from '../../audit/audit.service';
import { CalidadRecepcion } from '../dto';
import { EventEmitterService } from '../../../shared/events/event-emitter.service';

const createSupabaseClientMock = () => {
  const queuedThenResponses: any[] = [];
  const client: any = {
    _lastTable: undefined,
    _lastOp: undefined,
    from: jest.fn((tableName: string) => {
      client._lastTable = tableName;
      return client;
    }),
    select: jest.fn(() => {
      client._lastOp = 'select';
      return client;
    }),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
    update: jest.fn(() => {
      client._lastOp = 'update';
      return client;
    }),
    insert: jest.fn(() => {
      client._lastOp = 'insert';
      return client;
    }),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
  };

  client.then = (resolve: any, reject: any) => {
    if (client._lastTable === 'movimientos_inventario' && client._lastOp === 'select') {
      return Promise.resolve({ data: [], error: null }).then(resolve, reject);
    }

    const response = queuedThenResponses.shift() ?? { data: null, error: null };
    return Promise.resolve(response).then(resolve, reject);
  };

  client.queueEqBuilder = () => client.eq.mockImplementationOnce(() => client);
  client.queueEqPromise = (response: any) => {
    client.eq.mockImplementationOnce(() => client);
    queuedThenResponses.push(response);
  };
  client.queueSingle = (response: any) =>
    client.single.mockResolvedValueOnce(response);

  return client;
};

/**
 * Integration tests for Recepciones <-> Inventario
 * 
 * Verifies that when a reception is closed:
 * 1. Inventory movements are created correctly
 * 2. Stock levels are updated in producto_existencias
 * 3. Order details are updated with received quantities
 * 4. Order status is updated correctly (PARCIAL/RECIBIDA)
 */
describe('RecepcionesService - Inventario Integration', () => {
  let recepcionesService: RecepcionesService;
  let inventarioService: InventarioService;
  let supabaseService: SupabaseService;
  let eventBusService: EventBusService;
  let testingModule: TestingModule;

  const mockTenantId = '00000000-0000-0000-0000-000000000001';
  const mockUserId = '00000000-0000-0000-0000-000000000002';
  const mockOrdenId = '00000000-0000-0000-0000-000000000003';
  const mockRecepcionId = '00000000-0000-0000-0000-000000000004';
  const mockProductoId = '00000000-0000-0000-0000-000000000005';
  const mockAlmacenId = '00000000-0000-0000-0000-000000000006';
  const mockDetalleId = '00000000-0000-0000-0000-000000000007';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecepcionesService,
        {
          provide: InventarioService,
          useValue: {
            registrarMovimientoAlmacen: jest.fn(),
            registrarEntradaStockAtomico: jest.fn().mockResolvedValue('mov-1'),
          },
        },
        {
          provide: SupabaseService,
          useValue: {
            getClient: jest.fn(),
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
          provide: AuditService,
          useValue: { registrarCambio: jest.fn() },
        },
        {
          provide: EventEmitterService,
          useValue: { emit: jest.fn() },
        },
      ],
    }).compile();

    testingModule = module;
    recepcionesService = module.get<RecepcionesService>(RecepcionesService);
    inventarioService = module.get<InventarioService>(InventarioService);
    supabaseService = module.get<SupabaseService>(SupabaseService);
    eventBusService = module.get<EventBusService>(EventBusService);
  });

  afterEach(async () => {
    if (testingModule) {
      await testingModule.close();
    }
  });

  describe('cerrarRecepcion - Inventory Integration', () => {
    it('should create inventory movement for items with calidad OK', async () => {
      // Arrange
      const mockRecepcion = {
        id: mockRecepcionId,
        numero: 'REC-2025-0001',
        orden_id: mockOrdenId,
        estado: 'BORRADOR',
        items: [
          {
            id: '1',
            detalle_id: mockDetalleId,
            producto_id: mockProductoId,
            cantidad_recibida: 10,
            calidad: CalidadRecepcion.OK,
            almacen_id: mockAlmacenId,
            ubicacion_id: null,
            lote: 'LOTE-001',
            fecha_expiracion: '2026-12-31',
          },
        ],
        orden: {
          id: mockOrdenId,
          numero: 'OC-2025-0001',
        },
      };

      const mockDetalle = {
        id: mockDetalleId,
        cantidad: 10,
        cantidad_recibida: 0,
      };

      const mockDetalles = [mockDetalle];

      // Mock Supabase calls
      const mockSupabaseClient = createSupabaseClientMock();
      (supabaseService.getClient as jest.Mock).mockReturnValue(mockSupabaseClient);

      // Mock obtenerRecepcionPorId
      jest.spyOn(recepcionesService as any, 'obtenerRecepcionPorId').mockResolvedValue(mockRecepcion);

      // Mock detalle query
      mockSupabaseClient.queueEqBuilder();
      mockSupabaseClient.queueSingle({
        data: mockDetalle,
        error: null,
      });

      // Mock update detalle
      mockSupabaseClient.queueEqPromise({ error: null });

      // Mock detalles query for actualizarEstadoOrden
      mockSupabaseClient.queueEqPromise({
        data: mockDetalles,
        error: null,
      });

      // Mock update orden
      mockSupabaseClient.queueEqBuilder();
      mockSupabaseClient.queueEqPromise({ error: null });

      // Mock orden query for evento
      mockSupabaseClient.queueEqBuilder(); // eq tenant_id
      mockSupabaseClient.queueEqBuilder(); // eq id
      mockSupabaseClient.queueSingle({
        data: {
          id: mockOrdenId,
          numero: 'OC-2025-0001',
          subtotal: 1000,
          igv: 180,
          total: 1180,
          moneda: 'PEN',
          proveedor: {
            id: 'prov-1',
            razon_social: 'Proveedor Test',
            ruc: '20123456789',
            condiciones_pago: 'CREDITO_30',
            dias_credito: 30,
          },
        },
        error: null,
      });

      // Mock cerrar recepcion
      mockSupabaseClient.queueEqBuilder();
      mockSupabaseClient.queueEqPromise({ error: null });

      // Act
      await recepcionesService.cerrarRecepcion(
        mockRecepcionId,
        mockTenantId,
        { observaciones: 'Test' },
        mockUserId
      );

      // Assert
      expect(inventarioService.registrarEntradaStockAtomico).toHaveBeenCalledWith({
        tenantId: mockTenantId,
        productoId: mockProductoId,
        almacenId: mockAlmacenId,
        tipo: 'ENTRADA',
        cantidad: 10,
        referenciaTipo: 'RECEPCION',
        referenciaId: mockRecepcionId,
        notas: `Recepción ${mockRecepcion.numero} - OC ${mockRecepcion.orden.numero}`,
        ubicacionId: null,
        lote: 'LOTE-001',
        fechaExpiracion: '2026-12-31',
      });
    });

    it('should create inventory movement for items with calidad OBSERVADO', async () => {
      // Arrange
      const mockRecepcion = {
        id: mockRecepcionId,
        numero: 'REC-2025-0002',
        orden_id: mockOrdenId,
        estado: 'BORRADOR',
        items: [
          {
            id: '1',
            detalle_id: mockDetalleId,
            producto_id: mockProductoId,
            cantidad_recibida: 5,
            calidad: CalidadRecepcion.OBSERVADO,
            almacen_id: mockAlmacenId,
            ubicacion_id: 'UB-001',
            lote: 'LOTE-002',
            fecha_expiracion: null,
          },
        ],
        orden: {
          id: mockOrdenId,
          numero: 'OC-2025-0002',
        },
      };

      const mockDetalle = {
        id: mockDetalleId,
        cantidad: 10,
        cantidad_recibida: 0,
      };

      const mockDetalles = [mockDetalle];

      const mockSupabaseClient = createSupabaseClientMock();
      (supabaseService.getClient as jest.Mock).mockReturnValue(mockSupabaseClient);

      jest.spyOn(recepcionesService as any, 'obtenerRecepcionPorId').mockResolvedValue(mockRecepcion);

      mockSupabaseClient.queueEqBuilder();
      mockSupabaseClient.queueSingle({
        data: mockDetalle,
        error: null,
      });

      mockSupabaseClient.queueEqPromise({ error: null });

      mockSupabaseClient.queueEqPromise({
        data: mockDetalles,
        error: null,
      });

      mockSupabaseClient.queueEqBuilder();
      mockSupabaseClient.queueEqPromise({ error: null });

      mockSupabaseClient.queueEqBuilder();
      mockSupabaseClient.queueEqBuilder();
      mockSupabaseClient.queueSingle({
        data: {
          id: mockOrdenId,
          numero: 'OC-2025-0002',
          subtotal: 500,
          igv: 90,
          total: 590,
          moneda: 'PEN',
          proveedor: {
            id: 'prov-1',
            razon_social: 'Proveedor Test',
            ruc: '20123456789',
            condiciones_pago: 'CONTADO',
            dias_credito: 0,
          },
        },
        error: null,
      });

      mockSupabaseClient.queueEqBuilder();
      mockSupabaseClient.queueEqPromise({ error: null });

      // Act
      await recepcionesService.cerrarRecepcion(
        mockRecepcionId,
        mockTenantId,
        { observaciones: 'Test observado' },
        mockUserId
      );

      // Assert
      expect(inventarioService.registrarEntradaStockAtomico).toHaveBeenCalledWith({
        tenantId: mockTenantId,
        productoId: mockProductoId,
        almacenId: mockAlmacenId,
        tipo: 'ENTRADA',
        cantidad: 5,
        referenciaTipo: 'RECEPCION',
        referenciaId: mockRecepcionId,
        notas: `Recepción ${mockRecepcion.numero} - OC ${mockRecepcion.orden.numero}`,
        ubicacionId: 'UB-001',
        lote: 'LOTE-002',
        fechaExpiracion: null,
      });
    });

    it('should NOT create inventory movement for items with calidad RECHAZADO', async () => {
      // Arrange
      const mockRecepcion = {
        id: mockRecepcionId,
        numero: 'REC-2025-0003',
        orden_id: mockOrdenId,
        estado: 'BORRADOR',
        items: [
          {
            id: '1',
            detalle_id: mockDetalleId,
            producto_id: mockProductoId,
            cantidad_recibida: 3,
            calidad: CalidadRecepcion.RECHAZADO,
            almacen_id: mockAlmacenId,
            ubicacion_id: null,
            lote: null,
            fecha_expiracion: null,
          },
        ],
        orden: {
          id: mockOrdenId,
          numero: 'OC-2025-0003',
        },
      };

      const mockDetalle = {
        id: mockDetalleId,
        cantidad: 10,
        cantidad_recibida: 0,
      };

      const mockDetalles = [mockDetalle];

      const mockSupabaseClient = createSupabaseClientMock();
      (supabaseService.getClient as jest.Mock).mockReturnValue(mockSupabaseClient);

      jest.spyOn(recepcionesService as any, 'obtenerRecepcionPorId').mockResolvedValue(mockRecepcion);

      mockSupabaseClient.queueEqBuilder();
      mockSupabaseClient.queueSingle({
        data: mockDetalle,
        error: null,
      });

      mockSupabaseClient.queueEqPromise({ error: null });

      mockSupabaseClient.queueEqPromise({
        data: mockDetalles,
        error: null,
      });

      mockSupabaseClient.queueEqBuilder();
      mockSupabaseClient.queueEqPromise({ error: null });

      mockSupabaseClient.queueEqBuilder();
      mockSupabaseClient.queueEqBuilder();
      mockSupabaseClient.queueSingle({
        data: {
          id: mockOrdenId,
          numero: 'OC-2025-0003',
          subtotal: 300,
          igv: 54,
          total: 354,
          moneda: 'PEN',
          proveedor: {
            id: 'prov-1',
            razon_social: 'Proveedor Test',
            ruc: '20123456789',
            condiciones_pago: 'CONTADO',
            dias_credito: 0,
          },
        },
        error: null,
      });

      mockSupabaseClient.queueEqBuilder();
      mockSupabaseClient.queueEqPromise({ error: null });

      // Act
      await recepcionesService.cerrarRecepcion(
        mockRecepcionId,
        mockTenantId,
        { observaciones: 'Test rechazado' },
        mockUserId
      );

      // Assert
      expect(inventarioService.registrarMovimientoAlmacen).not.toHaveBeenCalled();
    });

    it('should update cantidad_recibida in orden_compra_detalles', async () => {
      // Arrange
      const mockRecepcion = {
        id: mockRecepcionId,
        numero: 'REC-2025-0004',
        orden_id: mockOrdenId,
        estado: 'BORRADOR',
        items: [
          {
            id: '1',
            detalle_id: mockDetalleId,
            producto_id: mockProductoId,
            cantidad_recibida: 7,
            calidad: CalidadRecepcion.OK,
            almacen_id: mockAlmacenId,
            ubicacion_id: null,
            lote: null,
            fecha_expiracion: null,
          },
        ],
        orden: {
          id: mockOrdenId,
          numero: 'OC-2025-0004',
        },
      };

      const mockDetalle = {
        id: mockDetalleId,
        cantidad: 10,
        cantidad_recibida: 3, // Already received 3
      };

      const mockDetalles = [
        {
          cantidad: 10,
          cantidad_recibida: 10, // After this reception: 3 + 7 = 10
        },
      ];

      const mockSupabaseClient = createSupabaseClientMock();
      (supabaseService.getClient as jest.Mock).mockReturnValue(mockSupabaseClient);

      jest.spyOn(recepcionesService as any, 'obtenerRecepcionPorId').mockResolvedValue(mockRecepcion);

      mockSupabaseClient.queueEqBuilder();
      mockSupabaseClient.queueSingle({
        data: mockDetalle,
        error: null,
      });

      mockSupabaseClient.queueEqPromise({ error: null });

      mockSupabaseClient.queueEqPromise({
        data: mockDetalles,
        error: null,
      });

      mockSupabaseClient.queueEqBuilder();
      mockSupabaseClient.queueEqPromise({ error: null });

      mockSupabaseClient.queueEqBuilder();
      mockSupabaseClient.queueEqBuilder();
      mockSupabaseClient.queueSingle({
        data: {
          id: mockOrdenId,
          numero: 'OC-2025-0004',
          subtotal: 700,
          igv: 126,
          total: 826,
          moneda: 'PEN',
          proveedor: {
            id: 'prov-1',
            razon_social: 'Proveedor Test',
            ruc: '20123456789',
            condiciones_pago: 'CONTADO',
            dias_credito: 0,
          },
        },
        error: null,
      });

      mockSupabaseClient.queueEqBuilder();
      mockSupabaseClient.queueEqPromise({ error: null });

      // Act
      await recepcionesService.cerrarRecepcion(
        mockRecepcionId,
        mockTenantId,
        { observaciones: 'Test update cantidad' },
        mockUserId
      );

      // Assert - verify cantidad_recibida was updated to 10 (3 + 7)
      expect(mockSupabaseClient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          cantidad_recibida: 10,
        })
      );
    });

    it('should update orden status to RECIBIDA when all items are fully received', async () => {
      // Arrange
      const mockRecepcion = {
        id: mockRecepcionId,
        numero: 'REC-2025-0005',
        orden_id: mockOrdenId,
        estado: 'BORRADOR',
        items: [
          {
            id: '1',
            detalle_id: mockDetalleId,
            producto_id: mockProductoId,
            cantidad_recibida: 10,
            calidad: CalidadRecepcion.OK,
            almacen_id: mockAlmacenId,
            ubicacion_id: null,
            lote: null,
            fecha_expiracion: null,
          },
        ],
        orden: {
          id: mockOrdenId,
          numero: 'OC-2025-0005',
        },
      };

      const mockDetalle = {
        id: mockDetalleId,
        cantidad: 10,
        cantidad_recibida: 0,
      };

      const mockDetalles = [
        {
          cantidad: 10,
          cantidad_recibida: 10, // Fully received
        },
      ];

      const mockSupabaseClient = createSupabaseClientMock();
      (supabaseService.getClient as jest.Mock).mockReturnValue(mockSupabaseClient);

      jest.spyOn(recepcionesService as any, 'obtenerRecepcionPorId').mockResolvedValue(mockRecepcion);

      mockSupabaseClient.queueEqBuilder();
      mockSupabaseClient.queueSingle({
        data: mockDetalle,
        error: null,
      });

      mockSupabaseClient.queueEqPromise({ error: null });

      mockSupabaseClient.queueEqPromise({
        data: mockDetalles,
        error: null,
      });

      mockSupabaseClient.queueEqBuilder();
      mockSupabaseClient.queueEqPromise({ error: null });

      mockSupabaseClient.queueEqBuilder();
      mockSupabaseClient.queueEqBuilder();
      mockSupabaseClient.queueSingle({
        data: {
          id: mockOrdenId,
          numero: 'OC-2025-0005',
          subtotal: 1000,
          igv: 180,
          total: 1180,
          moneda: 'PEN',
          proveedor: {
            id: 'prov-1',
            razon_social: 'Proveedor Test',
            ruc: '20123456789',
            condiciones_pago: 'CONTADO',
            dias_credito: 0,
          },
        },
        error: null,
      });

      mockSupabaseClient.queueEqBuilder();
      mockSupabaseClient.queueEqPromise({ error: null });

      // Act
      await recepcionesService.cerrarRecepcion(
        mockRecepcionId,
        mockTenantId,
        { observaciones: 'Test estado RECIBIDA' },
        mockUserId
      );

      // Assert - verify orden status was updated to RECIBIDA
      expect(mockSupabaseClient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          estado: 'RECIBIDA',
        })
      );
    });

    it('should update orden status to PARCIAL when items are partially received', async () => {
      // Arrange
      const mockRecepcion = {
        id: mockRecepcionId,
        numero: 'REC-2025-0006',
        orden_id: mockOrdenId,
        estado: 'BORRADOR',
        items: [
          {
            id: '1',
            detalle_id: mockDetalleId,
            producto_id: mockProductoId,
            cantidad_recibida: 5,
            calidad: CalidadRecepcion.OK,
            almacen_id: mockAlmacenId,
            ubicacion_id: null,
            lote: null,
            fecha_expiracion: null,
          },
        ],
        orden: {
          id: mockOrdenId,
          numero: 'OC-2025-0006',
        },
      };

      const mockDetalle = {
        id: mockDetalleId,
        cantidad: 10,
        cantidad_recibida: 0,
      };

      const mockDetalles = [
        {
          cantidad: 10,
          cantidad_recibida: 5, // Partially received
        },
      ];

      const mockSupabaseClient = createSupabaseClientMock();
      (supabaseService.getClient as jest.Mock).mockReturnValue(mockSupabaseClient);

      jest.spyOn(recepcionesService as any, 'obtenerRecepcionPorId').mockResolvedValue(mockRecepcion);

      mockSupabaseClient.queueEqBuilder();
      mockSupabaseClient.queueSingle({
        data: mockDetalle,
        error: null,
      });

      mockSupabaseClient.queueEqPromise({ error: null });

      mockSupabaseClient.queueEqPromise({
        data: mockDetalles,
        error: null,
      });

      mockSupabaseClient.queueEqBuilder();
      mockSupabaseClient.queueEqPromise({ error: null });

      mockSupabaseClient.queueEqBuilder();
      mockSupabaseClient.queueEqBuilder();
      mockSupabaseClient.queueSingle({
        data: {
          id: mockOrdenId,
          numero: 'OC-2025-0006',
          subtotal: 500,
          igv: 90,
          total: 590,
          moneda: 'PEN',
          proveedor: {
            id: 'prov-1',
            razon_social: 'Proveedor Test',
            ruc: '20123456789',
            condiciones_pago: 'CONTADO',
            dias_credito: 0,
          },
        },
        error: null,
      });

      mockSupabaseClient.queueEqBuilder();
      mockSupabaseClient.queueEqPromise({ error: null });

      // Act
      await recepcionesService.cerrarRecepcion(
        mockRecepcionId,
        mockTenantId,
        { observaciones: 'Test estado PARCIAL' },
        mockUserId
      );

      // Assert - verify orden status was updated to PARCIAL
      expect(mockSupabaseClient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          estado: 'PARCIAL',
        })
      );
    });

    it('should emit RecepcionRegistrada event after closing reception', async () => {
      // Arrange
      const mockRecepcion = {
        id: mockRecepcionId,
        numero: 'REC-2025-0007',
        orden_id: mockOrdenId,
        estado: 'BORRADOR',
        fecha_recepcion: '2025-01-15',
        items: [
          {
            id: '1',
            detalle_id: mockDetalleId,
            producto_id: mockProductoId,
            cantidad_recibida: 10,
            calidad: CalidadRecepcion.OK,
            almacen_id: mockAlmacenId,
            ubicacion_id: null,
            lote: 'LOTE-007',
            serie: null,
            producto: {
              nombre: 'Producto Test',
            },
          },
        ],
        orden: {
          id: mockOrdenId,
          numero: 'OC-2025-0007',
        },
      };

      const mockDetalle = {
        id: mockDetalleId,
        cantidad: 10,
        cantidad_recibida: 0,
      };

      const mockDetalles = [mockDetalle];

      const mockOrden = {
        id: mockOrdenId,
        numero: 'OC-2025-0007',
        subtotal: 1000,
        igv: 180,
        total: 1180,
        moneda: 'PEN',
        proveedor: {
          id: 'prov-1',
          razon_social: 'Proveedor Test S.A.C.',
          ruc: '20123456789',
          condiciones_pago: 'CREDITO_30',
          dias_credito: 30,
        },
      };

      const mockSupabaseClient = createSupabaseClientMock();
      (supabaseService.getClient as jest.Mock).mockReturnValue(mockSupabaseClient);

      jest.spyOn(recepcionesService as any, 'obtenerRecepcionPorId').mockResolvedValue(mockRecepcion);

      mockSupabaseClient.queueEqBuilder();
      mockSupabaseClient.queueSingle({ data: mockDetalle, error: null });

      mockSupabaseClient.queueEqPromise({ error: null });
      mockSupabaseClient.queueEqPromise({ data: mockDetalles, error: null });
      mockSupabaseClient.queueEqBuilder();
      mockSupabaseClient.queueEqPromise({ error: null });
      mockSupabaseClient.queueEqBuilder();
      mockSupabaseClient.queueEqBuilder();
      mockSupabaseClient.queueSingle({ data: mockOrden, error: null });
      mockSupabaseClient.queueEqBuilder();
      mockSupabaseClient.queueEqPromise({ error: null });

      // Mock queries for events
      mockSupabaseClient.in.mockImplementationOnce(() => Promise.resolve({
        data: [{ id: mockDetalleId, descripcion: 'Test Prod', precio_unitario: 100 }],
        error: null,
      }));

      mockSupabaseClient.queueEqBuilder();
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({
        data: { descripcion: 'Test Prod', precio_unitario: 100 },
        error: null,
      });

      // Act
      await recepcionesService.cerrarRecepcion(
        mockRecepcionId,
        mockTenantId,
        { observaciones: 'Test evento' },
        mockUserId
      );

      // Assert
      expect(eventBusService.emitRecepcionRegistrada).toHaveBeenCalledWith(
        expect.objectContaining({
          recepcionId: mockRecepcionId,
          numeroRecepcion: 'REC-2025-0007',
          ordenId: mockOrdenId,
          numeroOrden: 'OC-2025-0007',
          proveedorId: 'prov-1',
          proveedorNombre: 'Proveedor Test S.A.C.',
          proveedorRuc: '20123456789',
          tenantId: mockTenantId,
        })
      );
    });
  });
});
