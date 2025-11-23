import { Test, TestingModule } from '@nestjs/testing';
import { CxcService } from './cxc.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { EventBusService, FacturaEmitidaEvent } from '../../../shared/events/event-bus.service';
import { AuditService } from '../../audit/audit.service';
import { RetencionesValidationService } from '../shared/retenciones-validation.service';

const createDefaultQuery = () => {
  const query: any = {};
  query.select = jest.fn().mockReturnValue(query);
  query.eq = jest.fn().mockReturnValue(query);
  query.in = jest.fn().mockReturnValue(query);
  query.limit = jest.fn().mockReturnValue(query);
  query.order = jest.fn().mockReturnValue(query);
  query.single = jest.fn().mockResolvedValue({ data: null, error: null });
  query.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
  query.insert = jest.fn().mockReturnValue(query);
  query.update = jest.fn().mockReturnValue(query);
  return query;
};

describe('CxcService - FacturaEmitidaEvent', () => {
  let service: CxcService;
  let supabaseService: SupabaseService;
  let eventBusService: EventBusService;
  let mockSupabaseClient: any;
  let auditMock: any;
  let retencionesMock: any;

  beforeEach(async () => {
    const defaultQuery = createDefaultQuery();

    mockSupabaseClient = { from: jest.fn(() => defaultQuery) };
    auditMock = { registrarCambio: jest.fn(), logIntegration: jest.fn() };
    retencionesMock = {
      validarCalculoAjustes: jest.fn().mockResolvedValue({ valido: true, errores: [] }),
      validarMontoPendiente: jest.fn().mockReturnValue({ valido: true, montoEsperado: 1180 }),
    };

    mockSupabaseClient.from.mockImplementation(() => createDefaultQuery());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CxcService,
        {
          provide: SupabaseService,
          useValue: {
            getClient: jest.fn(() => mockSupabaseClient),
          },
        },
        {
          provide: EventBusService,
          useValue: {
            emitCuentaPorCobrarCreadaEvent: jest.fn(),
          },
        },
        {
          provide: AuditService,
          useValue: auditMock,
        },
        {
          provide: RetencionesValidationService,
          useValue: retencionesMock,
        },
      ],
    }).compile();

    service = module.get<CxcService>(CxcService);
    supabaseService = module.get<SupabaseService>(SupabaseService);
    eventBusService = module.get<EventBusService>(EventBusService);

    (service as any).logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('crea CxC y emite evento cuando no existe registro previo', async () => {
    const tenantId = 'tenant-001';
    const facturaEvent: FacturaEmitidaEvent = {
      eventId: 'evt-001',
      tenantId,
      pedidoId: 'pedido-123',
      cpeId: 'cpe-456',
      facturaId: 'documento-456',
      serie: 'F001',
      numero: '12',
      clienteId: 'cliente-789',
      subtotal: 1000,
      impuestos: 180,
      total: 1180,
      moneda: 'PEN',
      fechaEmision: '2025-01-10',
      fechaVencimiento: '2025-02-09',
      idempotencyKey: `factura:${tenantId}:documento-456`,
      source: 'ventas',
      ajustes: { retencion: 0, percepcion: 0, detraccion: 0, anticipo: 0 },
    };

    const idempotencyQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: [], error: null }),
    };

    const existenciaQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: [], error: null }),
    };

    const configQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { dias_vencimiento_factura: 30, detraccion_codigo: '104' },
        error: null,
      }),
    };

    const clienteLookupQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { id: facturaEvent.clienteId },
        error: null,
      }),
    };

    const clienteQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { sujeto_retencion: false, sujeto_percepcion: false, sujeto_detraccion: false },
        error: null,
      }),
    };

    const insertCuentaQuery = {
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: 'cxc-999' }, error: null }),
    };

    const integrationLogQuery = {
      insert: jest.fn().mockResolvedValue({ error: null }),
    };

    mockSupabaseClient.from
      .mockImplementationOnce(() => idempotencyQuery)
      .mockImplementationOnce(() => existenciaQuery)
      .mockImplementationOnce(() => clienteLookupQuery)
      .mockImplementationOnce(() => configQuery)
      .mockImplementationOnce(() => clienteQuery)
      .mockImplementationOnce(() => insertCuentaQuery)
      .mockImplementationOnce(() => integrationLogQuery);

    await service.crearCuentaPorCobrarDesdeFactura(facturaEvent);

    expect(insertCuentaQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      tenant_id: tenantId,
      documento_id: facturaEvent.facturaId,
      cliente_id: facturaEvent.clienteId,
      event_id: facturaEvent.eventId,
      idempotency_key: facturaEvent.idempotencyKey,
      event_source: facturaEvent.source,
    }));

    expect(eventBusService.emitCuentaPorCobrarCreadaEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventId: facturaEvent.eventId,
      tenantId,
      cxcId: 'cxc-999',
      cuentaId: 'cxc-999',
      facturaId: facturaEvent.facturaId,
      cpeId: facturaEvent.cpeId,
      idempotencyKey: facturaEvent.idempotencyKey,
    }));

    expect(integrationLogQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      tenant_id: tenantId,
      operacion: 'cxc.crear_desde_factura',
      status: 'SUCCESS',
    }));
  });

  it('no crea CxC cuando el evento ya fue procesado (idempotencia)', async () => {
    const tenantId = 'tenant-001';
    const facturaEvent: FacturaEmitidaEvent = {
      eventId: 'evt-dup',
      tenantId,
      pedidoId: 'pedido-123',
      cpeId: 'cpe-456',
      facturaId: 'documento-456',
      serie: 'F001',
      numero: '12',
      clienteId: 'cliente-789',
      subtotal: 1000,
      impuestos: 180,
      total: 1180,
      moneda: 'PEN',
      fechaEmision: '2025-01-10',
      fechaVencimiento: '2025-02-09',
      idempotencyKey: `factura:${tenantId}:documento-456`,
      source: 'ventas',
      ajustes: { retencion: 0, percepcion: 0, detraccion: 0, anticipo: 0 },
    };

    const idempotencyQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: [{ id: 'existing' }], error: null }),
    };

    const integrationLogQuery = {
      insert: jest.fn().mockResolvedValue({ error: null }),
    };

    mockSupabaseClient.from
      .mockImplementationOnce(() => idempotencyQuery)
      .mockImplementationOnce(() => integrationLogQuery);

    await service.crearCuentaPorCobrarDesdeFactura(facturaEvent);

    expect(eventBusService.emitCuentaPorCobrarCreadaEvent).not.toHaveBeenCalled();
    expect(integrationLogQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      tenant_id: tenantId,
      status: 'SUCCESS',
      response_summary: expect.objectContaining({ skipped: true }),
    }));
  });
});
