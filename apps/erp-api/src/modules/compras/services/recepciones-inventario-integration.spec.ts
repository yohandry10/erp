import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { RecepcionesService } from './recepciones.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { EventBusService } from '../../../shared/events/event-bus.service';
import { AuditService } from '../../audit/audit.service';
import { EventEmitterService } from '../../../shared/events/event-emitter.service';

/**
 * Integración Recepciones <-> Inventario.
 *
 * NOTA (refactor C-004, 2026-05-27): el cierre de recepción dejó de orquestar
 * el inventario con N escrituras secuenciales en JS y ahora delega TODO a la
 * RPC transaccional `cerrar_recepcion_tx` (migración 338), que en una sola
 * transacción: ingresa stock por item (reusando `registrar_movimiento_almacen`),
 * actualiza cantidad_recibida en los detalles, recalcula el estado de la OC y
 * cierra la recepción — con rollback total si algo falla.
 *
 * Por eso la verificación de stock/existencias real ya NO se hace con mocks
 * aquí (sería un mock probando un mock): se valida con smoke SQL contra una BD
 * real (ver `docs/CURRENT_STATE.md`). Estos tests
 * cubren el CONTRATO de integración del lado del backend: que la RPC se invoque
 * correctamente y que sus movimientos se propaguen a los eventos contables.
 */
describe('RecepcionesService - Inventario Integration (RPC cerrar_recepcion_tx)', () => {
  let recepcionesService: RecepcionesService;
  let eventBusService: jest.Mocked<EventBusService>;
  let testingModule: TestingModule;

  const mockTenantId = '00000000-0000-0000-0000-000000000001';
  const mockUserId = '00000000-0000-0000-0000-000000000002';
  const mockOrdenId = '00000000-0000-0000-0000-000000000003';
  const mockRecepcionId = '00000000-0000-0000-0000-000000000004';
  const mockProductoId = '00000000-0000-0000-0000-000000000005';
  const mockAlmacenId = '00000000-0000-0000-0000-000000000006';

  const mockClient: any = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: { id: mockOrdenId, proveedor: {} }, error: null }),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    insert: jest.fn().mockReturnThis(),
    rpc: jest.fn(),
  };

  const baseRecepcion = {
    id: mockRecepcionId,
    numero: 'REC-2025-0001',
    orden_id: mockOrdenId,
    estado: 'BORRADOR',
    orden: { id: mockOrdenId, numero: 'OC-2025-0001' },
    items: [
      {
        id: '1',
        detalle_id: '00000000-0000-0000-0000-000000000007',
        producto_id: mockProductoId,
        cantidad_recibida: 10,
        calidad: 'OK',
        almacen_id: mockAlmacenId,
      },
    ],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecepcionesService,
        { provide: SupabaseService, useValue: { getClient: jest.fn(() => mockClient) } },
        {
          provide: EventBusService,
          useValue: {
            emitRecepcionRegistrada: jest.fn(),
            emitCompraEntregada: jest.fn(),
            emitCompraRecibida: jest.fn(),
            emitMovimientoStock: jest.fn(),
          },
        },
        { provide: AuditService, useValue: { registrarCambio: jest.fn() } },
        { provide: EventEmitterService, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    const noopLogger = { log() {}, error() {}, warn() {}, debug() {}, verbose() {}, setContext() {} };
    module.useLogger(noopLogger as any);

    testingModule = module;
    recepcionesService = module.get<RecepcionesService>(RecepcionesService);
    eventBusService = module.get(EventBusService) as jest.Mocked<EventBusService>;

    jest.clearAllMocks();
    mockClient.single.mockResolvedValue({ data: { id: mockOrdenId, proveedor: {} }, error: null });
    mockClient.rpc.mockResolvedValue({ data: { movimientos: [] }, error: null });
    // Aislar la emisión del evento canónico de recepción (se prueba en el unit spec).
    jest.spyOn(recepcionesService as any, 'emitirEventoRecepcionRegistrada').mockResolvedValue(undefined);
  });

  afterEach(async () => {
    if (testingModule) {
      await testingModule.close();
    }
  });

  it('invoca cerrar_recepcion_tx de forma atómica con el contexto de la recepción', async () => {
    jest.spyOn(recepcionesService, 'obtenerRecepcionPorId').mockResolvedValue(baseRecepcion as any);

    await recepcionesService.cerrarRecepcion(mockRecepcionId, mockTenantId, { observaciones: 'Test' }, mockUserId);

    expect(mockClient.rpc).toHaveBeenCalledWith(
      'cerrar_recepcion_tx',
      expect.objectContaining({
        p_recepcion_id: mockRecepcionId,
        p_tenant_id: mockTenantId,
        p_user_id: mockUserId,
        p_observaciones: 'Test',
      }),
    );
  });

  it('propaga los movimientos creados por la RPC a MovimientoStockEvent (asiento de entrada)', async () => {
    jest.spyOn(recepcionesService, 'obtenerRecepcionPorId').mockResolvedValue(baseRecepcion as any);
    mockClient.rpc.mockResolvedValueOnce({
      data: {
        numero: 'REC-2025-0001',
        orden_id: mockOrdenId,
        orden_estado: 'RECIBIDA',
        movimientos: [
          { movimiento_id: 'mov-1', producto_id: mockProductoId, almacen_id: mockAlmacenId, cantidad: 10 },
        ],
      },
      error: null,
    });
    // orden (evento) + producto (cálculo del valor del movimiento)
    mockClient.single
      .mockResolvedValueOnce({ data: { id: mockOrdenId, numero: 'OC-2025-0001', proveedor: {} }, error: null })
      .mockResolvedValueOnce({ data: { stock_actual: 10, precio_compra: 8.5 }, error: null });

    await recepcionesService.cerrarRecepcion(mockRecepcionId, mockTenantId, {}, mockUserId);

    expect(eventBusService.emitMovimientoStock).toHaveBeenCalledTimes(1);
    expect(eventBusService.emitMovimientoStock).toHaveBeenCalledWith(
      expect.objectContaining({
        movimientoId: 'mov-1',
        productoId: mockProductoId,
        tipoMovimiento: 'ENTRADA',
        cantidad: 10,
        valor: 85,
      }),
      mockTenantId,
    );
  });

  it('no invoca la RPC si la recepción no está en BORRADOR', async () => {
    jest
      .spyOn(recepcionesService, 'obtenerRecepcionPorId')
      .mockResolvedValue({ ...baseRecepcion, estado: 'CERRADA' } as any);

    await expect(
      recepcionesService.cerrarRecepcion(mockRecepcionId, mockTenantId, {}, mockUserId),
    ).rejects.toThrow(BadRequestException);
    expect(mockClient.rpc).not.toHaveBeenCalled();
  });
});
