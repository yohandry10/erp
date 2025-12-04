import { PosService } from './pos.service';

const createSupabaseMock = () => {
  const responseFor = (table: string) => {
    switch (table) {
      case 'empresa_config':
        return { data: { ruc: '12345678901', razon_social: 'ACME S.A.C.', dias_vencimiento_factura: 30 }, error: null };
      case 'sesiones_caja':
        return {
          data: [{
            id: 'sesion-1',
            estado: 'ABIERTA',
            congelada: false,
            hora_apertura: new Date().toISOString(),
            tenant_id: 'tenant-1',
            cajero_id: 'user-1',
          }],
          error: null
        }; // sesión abierta para flujo feliz
      case 'outbox_events':
        return { data: null, error: null };
      case 'ventas_pos':
        return { data: null, error: { code: 'PGRST116' } };
      case 'metodos_pago':
        return { data: { id: 'mp-efectivo', codigo: 'efectivo', tipo: 'EFECTIVO' }, error: null };
      default:
        return { data: null, error: null };
    }
  };

  const rpcMock = jest.fn(async (fn: string, _args?: any) => {
    if (fn === 'pos_registrar_venta_tx') {
      return {
        data: [
          {
            venta_id: 'venta-1',
            numero_ticket: 'T001-000001',
            subtotal: 100,
            impuestos: 18,
            total: 118,
          },
        ],
        error: null,
      };
    }
    return { data: null, error: null };
  });

  const buildQuery = (table: string) => {
    const chain: any = {
      select: jest.fn(() => chain),
      eq: jest.fn(() => chain),
      neq: jest.fn(() => chain),
      or: jest.fn(() => chain),
      order: jest.fn(() => chain),
      gte: jest.fn(() => chain),
      lte: jest.fn(() => chain),
      lt: jest.fn(() => chain),
      limit: jest.fn(() => chain),
      is: jest.fn(() => chain),
      single: jest.fn(async () => responseFor(table)),
      maybeSingle: jest.fn(async () => responseFor(table)),
      update: jest.fn(async () => ({ data: null, error: null })),
      insert: jest.fn(async () => ({ data: null, error: null })),
      delete: jest.fn(async () => ({ data: null, error: null })),
      then: (resolve: any) => resolve(responseFor(table)),
    };
    return chain;
  };

  const supabaseClient: any = {
    rpc: rpcMock,
    from: jest.fn((table: string) => buildQuery(table)),
  };

  return { supabaseClient, rpcMock };
};

const createService = (overrides: Partial<ReturnType<typeof createSupabaseMock>> = {}) => {
  const { supabaseClient, rpcMock } = createSupabaseMock();

  const supabaseService: any = {
    getClient: jest.fn(() => supabaseClient),
    prepareTenantContext: jest.fn(async () => undefined),
  };

  const tenantContext: any = {
    getContext: jest.fn(() => null),
    run: (_ctx: any, cb: any) => cb(),
  };

  const validationService: any = {
    validateCertificate: jest.fn(),
    validateRucConfiguration: jest.fn(),
    validateDocumentBeforeEmission: jest.fn(),
  };

  const taxCalculator: any = {
    getTasaIgv: jest.fn(async () => 0.18),
  };

  const service = new PosService(
    supabaseService,
    tenantContext,
    { create: jest.fn(async () => ({ id: 'cpe-1' })) } as any, // CpeService
    validationService,
    { getConfigurationStatus: jest.fn() } as any, // ConfigurationService
    {} as any, // EventBusService
    {} as any, // InventoryIntegrationService
    { crearCuentaPorCobrarDesdeFactura: jest.fn() } as any, // CxcService
    taxCalculator,
  );

  return {
    service,
    supabaseClient,
    supabaseService,
    tenantContext,
    validationService,
    taxCalculator,
    rpcMock,
    ...overrides,
  };
};

const user = { id: 'user-1', tenant_id: 'tenant-1', email: 'user@example.com' };
const ventaBase = {
  idempotency_key: 'lock-123',
  cliente_documento: '12345678',
  cliente_nombre: 'Cliente Demo',
  items: [
    { producto_id: 'prod-1', cantidad: 1, precio_unitario: 100, producto: { codigo: 'P1', nombre: 'Prod 1' } },
  ],
};

describe('PosService locks', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('libera los locks aunque falle la validación de certificado', async () => {
    const ctx = createService();
    ctx.validationService.validateCertificate.mockResolvedValue({
      isValid: false,
      errors: ['cert invalid'],
      warnings: [],
    });
    ctx.validationService.validateRucConfiguration.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
    ctx.validationService.validateDocumentBeforeEmission.mockResolvedValue({ isValid: true, errors: [], warnings: [] });

    const result = await ctx.service.procesarVenta(ventaBase, user);

    expect(result.success).toBe(false);
    expect(ctx.rpcMock).toHaveBeenCalledWith(
      'acquire_pos_lock',
      expect.objectContaining({ p_lock_key: expect.stringContaining('lock-123') }),
    );
    expect(ctx.rpcMock).toHaveBeenCalledWith(
      'release_pos_lock',
      expect.objectContaining({ p_lock_key: 'product:prod-1' }),
    );
  });

  it('procesa venta feliz y libera locks al finalizar', async () => {
    const ctx = createService();
    ctx.validationService.validateCertificate.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
    ctx.validationService.validateRucConfiguration.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
    ctx.validationService.validateDocumentBeforeEmission.mockResolvedValue({ isValid: true, errors: [], warnings: [] });

    const result = await ctx.service.procesarVenta(ventaBase, user);

    expect(result.success).toBe(true);
    expect(result.venta_id).toBe('venta-1');
    expect(ctx.rpcMock).toHaveBeenCalledWith(
      'acquire_pos_lock',
      expect.objectContaining({ p_lock_key: expect.stringContaining('lock-123') }),
    );
    expect(ctx.rpcMock).toHaveBeenCalledWith(
      'release_pos_lock',
      expect.objectContaining({ p_lock_key: 'product:prod-1' }),
    );
  });
});
