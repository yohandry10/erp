import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { RecepcionesService } from '../src/modules/compras/services/recepciones.service';
import { DevolucionesProveedorService } from '../src/modules/compras/services/devoluciones-proveedor.service';
import { SupabaseService } from '../src/shared/supabase/supabase.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { DevolucionesProveedorRepository } from '../src/modules/compras/repositories/devoluciones-proveedor.repository';

// Estos tests son de integración ligera (mock de supabase + servicios internos) para validar que
// una recepción usa sus fronteras SQL y una devolución coordina sus efectos.

describe('Compras E2E - recepciones y devoluciones (mock Supabase)', () => {
  let app: INestApplication;
  let recepcionesService: RecepcionesService;
  let devolucionesService: DevolucionesProveedorService;
  const tenantId = 'tenant-test';

  // Mocks básicos de supabase
  const mockInsert = jest.fn();
  const mockUpdate = jest.fn();
  const mockSelect = jest.fn().mockReturnThis();
  const mockEq = jest.fn().mockReturnThis();
  const mockMaybeSingle = jest.fn();
  const mockSingle = jest.fn();
  const mockOrder = jest.fn().mockReturnThis();
  const mockLimit = jest.fn().mockReturnThis();
  const mockRpc = jest.fn();
  const mockIn = jest.fn();

  const mockSupabaseClient = {
    rpc: mockRpc,
    from: jest.fn(() => ({
      insert: mockInsert,
      update: mockUpdate,
      select: mockSelect,
      eq: mockEq,
      maybeSingle: mockMaybeSingle,
      single: mockSingle,
      order: mockOrder,
      limit: mockLimit,
      in: mockIn,
    })),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    [
      mockInsert,
      mockUpdate,
      mockSelect,
      mockEq,
      mockMaybeSingle,
      mockSingle,
      mockOrder,
      mockLimit,
      mockRpc,
      mockIn,
    ].forEach((mock) => mock.mockReset());
    const queryBuilder: any = {
      insert: mockInsert,
      update: mockUpdate,
      select: mockSelect,
      eq: mockEq,
      maybeSingle: mockMaybeSingle,
      single: mockSingle,
      order: mockOrder,
      limit: mockLimit,
      like: jest.fn().mockReturnThis(),
      in: mockIn,
    };
    mockSupabaseClient.from.mockReturnValue(queryBuilder);
    mockInsert.mockReturnValue(queryBuilder);
    mockUpdate.mockReturnValue(queryBuilder);
    mockSelect.mockReturnValue(queryBuilder);
    mockEq.mockReturnValue(queryBuilder);
    mockOrder.mockReturnValue(queryBuilder);
    mockLimit.mockResolvedValue({ data: [], error: null });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      providers: [
        RecepcionesService,
        DevolucionesProveedorService,
        {
          provide: DevolucionesProveedorRepository,
          useValue: {
            obtenerPorId: jest.fn(),
            listar: jest.fn(),
          },
        },
        { provide: SupabaseService, useValue: { getClient: () => mockSupabaseClient } },
        {
          provide: AuditService,
          useValue: {
            registrarCambio: jest.fn(),
            logAction: jest.fn(),
            logBusinessEvent: jest.fn(),
          },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    recepcionesService = moduleFixture.get(RecepcionesService);
    devolucionesService = moduleFixture.get(DevolucionesProveedorService);
    jest.spyOn(recepcionesService, 'obtenerRecepcionPorId').mockResolvedValue({
      id: 'rec-1',
      numero: 'REC-001',
      fecha_recepcion: new Date().toISOString(),
      items: [],
    });
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('debería delegar la creación completa a crear_recepcion_tx sin escrituras parciales', async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        id: 'rec-1',
        numero: 'REC-001',
        estado: 'BORRADOR',
        items: [],
        idempotent: false,
      },
      error: null,
    });

    const dto: any = {
      orden_id: 'ord-1',
      idempotency_key: 'recepcion:ord-1:intento-1',
      items: [
        { detalle_id: 'det-1', cantidad_recibida: 1, calidad: 'OK', almacen_id: 'alm-1' },
      ],
    };

    const result = await recepcionesService.crearRecepcion(tenantId, dto, 'user-1');

    expect(result).toBeDefined();
    expect(mockRpc).toHaveBeenCalledWith('crear_recepcion_tx', expect.objectContaining({
      p_tenant_id: tenantId,
      p_orden_id: 'ord-1',
      p_created_by: 'user-1',
      p_idempotency_key: 'recepcion:ord-1:intento-1',
    }));
    expect(mockSupabaseClient.from).not.toHaveBeenCalledWith('recepciones');
    expect(mockSupabaseClient.from).not.toHaveBeenCalledWith('recepcion_items');
    // La atomicidad y el evento durable de cierre se validan en PostgreSQL (444).
  });

  it('delega creación y emisión de devolución a las RPC atómicas 450', async () => {
    const repoMock = (devolucionesService as any).devolucionesRepository;
    repoMock.obtenerPorId = jest.fn().mockResolvedValue({
      id: 'dev-1', numero: 'DEV-001', estado: 'EMITIDA', items: [],
    });
    mockRpc
      .mockResolvedValueOnce({ data: { id: 'dev-1', estado: 'PENDIENTE', items: [] }, error: null })
      .mockResolvedValueOnce({
        data: { id: 'dev-1', estado: 'EMITIDA', movimientos: [{ movimiento_id: 'mov-1' }] },
        error: null,
      });

    const dto: any = {
      idempotency_key: 'return:rec-1:attempt-1',
      orden_id: 'ord-1',
      proveedor_id: 'prov-1',
      recepcion_id: 'rec-1',
      motivo: 'Producto defectuoso',
      items: [{ recepcion_item_id: 'rec-item-1', producto_id: 'prod-1', cantidad: 1, precio_unitario: 10 }],
    };

    const creada = await devolucionesService.crearDevolucion(tenantId, dto, 'user-1');
    expect(creada).toBeDefined();
    const emitida = await devolucionesService.emitirDevolucion('dev-1', tenantId, 'user-1');
    expect(emitida.estado).toBe('EMITIDA');
    expect(mockRpc).toHaveBeenNthCalledWith(1, 'crear_devolucion_proveedor_tx', expect.any(Object));
    expect(mockRpc).toHaveBeenNthCalledWith(2, 'emitir_devolucion_proveedor_tx', expect.any(Object));
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
