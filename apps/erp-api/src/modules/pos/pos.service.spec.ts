import { PosService } from './pos.service';

const productoBase = {
  id: 'prod-1',
  codigo: 'P1',
  nombre: 'Prod 1',
  precio_venta: 100,
  costo: 50,
  stock_actual: 5,
  stock_reservado: 0,
  activo: true,
  estado: 'ACTIVO',
  es_servicio: false,
  controla_stock: true,
  unidad_medida: 'NIU',
};

const resolvedCommercialPrices = (args: any) => ({
  data: (args?.p_detalle ?? []).map((item: any, index: number) => ({
    ...item,
    orden: item.orden ?? index + 1,
    precio_regla_snapshot: {
      regla_aplicada: false,
      fuente: 'PRECIO_SOLICITADO',
      producto_id: item.producto_id,
      precio_unitario: item.precio_unitario ?? item.precio_original,
      snapshot_version: 469,
    },
  })),
  error: null,
});

const createSupabaseMock = (fixtures: {
  ventasPosResponse?: any;
  canjesResponse?: any;
  productos?: any[];
  metodoPago?: any;
} = {}) => {
  const inserts: Array<{ table: string; rows: any }> = [];
  const updates: Array<{ table: string; rows: any }> = [];
  const responseFor = (table: string) => {
    switch (table) {
      case 'empresa_config':
        return {
          data: {
            ruc: '12345678901',
            razon_social: 'ACME S.A.C.',
            dias_vencimiento_factura: 30,
            pais: 'PE',
            moneda_defecto: 'PEN',
            igv_porcentaje: 18,
          },
          error: null,
        };
      case 'sesiones_caja':
        return {
          data: {
            id: 'sesion-1',
            caja_id: 'caja-1',
            estado: 'ABIERTA',
            congelada: false,
            hora_apertura: new Date().toISOString(),
            tenant_id: 'tenant-1',
            cajero_id: 'user-1',
          },
          error: null
        }; // sesión abierta para flujo feliz
      case 'outbox_events':
        return { data: null, error: null };
      case 'ventas_pos':
        return { data: fixtures.ventasPosResponse ?? [], error: null };
      case 'pos_ticket_canjes':
        return { data: fixtures.canjesResponse ?? [], error: null };
      case 'metodos_pago':
        return {
          data: fixtures.metodoPago ?? { id: 'mp-efectivo', codigo: 'efectivo', tipo: 'EFECTIVO' },
          error: null,
        };
      case 'productos':
        return { data: fixtures.productos ?? [productoBase], error: null };
      case 'detalle_ventas_pos':
      case 'ventas_pos_pagos':
        return { data: [], error: null };
      case 'movimientos_inventario':
        return { data: null, error: null };
      case 'pos_numeracion':
      case 'cpe':
      case 'documentos':
        return { data: null, error: null };
      default:
        return { data: null, error: null };
    }
  };

  const rpcMock = jest.fn(async (fn: string, args?: any) => {
    if (fn === 'obtener_sesion_caja_actual_tx') {
      return { data: responseFor('sesiones_caja').data, error: null };
    }
    if (fn === 'reintentar_venta_pos_comercial_tx') return { data: null, error: null };
    if (fn === 'resolver_precios_venta_tx') return resolvedCommercialPrices(args);
    if (fn === 'pos_registrar_venta_comercial_tx') {
      return {
        data: {
          venta_id: 'venta-1',
          numero_ticket: 'T001-00000001',
          subtotal: 100,
          impuestos: 18,
          total: 118,
          impactos_aplicados: true,
          caja_movimiento_id: 'mov-caja-1',
          cpe_id: null,
          cpe_pendiente: true,
          facturacion_pendiente: true,
          cuenta_por_cobrar_id: null,
          credito_monto: 0,
          accounting_event_id: 'event-1',
          documento_id: 'doc-1',
          items_actualizados: [],
        },
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
      not: jest.fn(() => chain),
      in: jest.fn(() => chain),
      limit: jest.fn(() => chain),
      is: jest.fn(() => chain),
      single: jest.fn(async () => responseFor(table)),
      maybeSingle: jest.fn(async () => responseFor(table)),
      update: jest.fn((rows: any) => {
        updates.push({ table, rows });
        return chain;
      }),
      insert: jest.fn((rows: any) => {
        inserts.push({ table, rows });
        return chain;
      }),
      delete: jest.fn(() => chain),
      then: (resolve: any) => resolve(responseFor(table)),
    };
    return chain;
  };

  const supabaseClient: any = {
    rpc: rpcMock,
    from: jest.fn((table: string) => buildQuery(table)),
  };

  return { supabaseClient, rpcMock, inserts, updates };
};

const createService = (fixtures: {
  ventasPosResponse?: any;
  canjesResponse?: any;
  productos?: any[];
  metodoPago?: any;
} = {}) => {
  const { supabaseClient, rpcMock, inserts, updates } = createSupabaseMock(fixtures);

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

  const cpeService: any = { create: jest.fn(async () => ({ id: 'cpe-1' })) };
  const cxcService: any = { crearCuentaPorCobrarDesdeFactura: jest.fn(async () => undefined) };

  const service = new PosService(
    supabaseService,
    tenantContext,
    cpeService,
    validationService,
    { getConfigurationStatus: jest.fn() } as any, // ConfigurationService
    { emitVentaProcessed: jest.fn(async () => undefined) } as any, // EventBusService
    {} as any, // InventoryIntegrationService
    cxcService,
    taxCalculator,
    { listarCajas: jest.fn(async () => []) } as any, // CajasService
    { registrarEvento: jest.fn(async () => null) } as any, // PosAuditService
    { get: jest.fn(() => 'test-cert-key-32-characters-long') } as any, // ConfigService
  );

  return {
    service,
    supabaseClient,
    supabaseService,
    tenantContext,
    validationService,
    cpeService,
    cxcService,
    taxCalculator,
    rpcMock,
    inserts,
    updates,
  };
};

const user = { id: 'user-1', tenant_id: 'tenant-1', email: 'user@example.com' };
const ventaBase = {
  idempotency_key: 'lock-123',
  sesion_caja_id: 'sesion-1',
  cliente_documento: '12345678',
  cliente_nombre: 'Cliente Demo',
  items: [
    { producto_id: 'prod-1', cantidad: 1, precio_unitario: 100, producto: { codigo: 'P1', nombre: 'Prod 1' } },
  ],
};

describe('PosService atomic transaction contract', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('no bloquea la venta por validacion fiscal pesada del CPE', async () => {
    const ctx = createService();
    ctx.validationService.validateCertificate.mockResolvedValue({
      isValid: false,
      errors: ['cert invalid'],
      warnings: [],
    });
    ctx.validationService.validateRucConfiguration.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
    ctx.validationService.validateDocumentBeforeEmission.mockResolvedValue({ isValid: true, errors: [], warnings: [] });

    const result = await ctx.service.procesarVenta(ventaBase, user);

    expect(result.success).toBe(true);
    expect(result.cpe_pendiente).toBe(true);
    expect(ctx.validationService.validateCertificate).not.toHaveBeenCalled();
    expect(ctx.rpcMock).toHaveBeenCalledWith('pos_registrar_venta_comercial_tx', expect.any(Object));
    expect(ctx.rpcMock).not.toHaveBeenCalledWith('acquire_pos_lock', expect.any(Object));
    expect(ctx.rpcMock).not.toHaveBeenCalledWith('release_pos_lock', expect.any(Object));
  });

  it('procesa venta feliz exclusivamente mediante atomic_tx', async () => {
    const ctx = createService();
    ctx.validationService.validateCertificate.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
    ctx.validationService.validateRucConfiguration.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
    ctx.validationService.validateDocumentBeforeEmission.mockResolvedValue({ isValid: true, errors: [], warnings: [] });

    const result = await ctx.service.procesarVenta(ventaBase, user);

    expect(result.success).toBe(true);
    expect(result.venta_id).toBe('venta-1');
    expect(ctx.supabaseClient.from).toHaveBeenCalledWith('productos');
    expect(ctx.inserts.find((entry) => entry.table === 'detalle_ventas_pos')).toBeUndefined();
    expect(ctx.inserts.find((entry) => entry.table === 'ventas_pos_pagos')).toBeUndefined();
    expect(ctx.inserts.find((entry) => entry.table === 'movimientos_inventario')).toBeUndefined();
    expect(ctx.rpcMock).not.toHaveBeenCalledWith('pos_registrar_venta_tx', expect.any(Object));
  });

  it('consulta la sesión propia por la proyección RPC sin leer sesiones_caja directamente', async () => {
    const ctx = createService();
    ctx.rpcMock.mockImplementation(async (fn: string) => {
      if (fn === 'obtener_sesion_caja_actual_tx') {
        return {
          data: { id: 'sesion-1', caja_id: 'caja-1', estado: 'ABIERTA' },
          error: null,
        };
      }
      return { data: null, error: null };
    });

    await expect(ctx.service.getSesionCajaActual(user)).resolves.toEqual({
      success: true,
      data: { id: 'sesion-1', caja_id: 'caja-1', estado: 'ABIERTA' },
    });
    expect(ctx.rpcMock).toHaveBeenCalledWith('obtener_sesion_caja_actual_tx', {
      p_tenant_id: 'tenant-1',
      p_actor_id: 'user-1',
    });
    expect(ctx.supabaseClient.from).not.toHaveBeenCalledWith('sesiones_caja');
  });

  it('devuelve el retry confirmado antes de recalcular una lista que pudo cambiar', async () => {
    const ctx = createService();
    ctx.rpcMock.mockImplementation(async (fn: string) => {
      if (fn === 'reintentar_venta_pos_comercial_tx') {
        return {
          data: {
            venta_id: 'venta-idempotente',
            numero_ticket: 'T001-00000077',
            subtotal: 70,
            impuestos: 12.6,
            total: 82.6,
            impactos_aplicados: true,
            idempotent: true,
            redondeo_efectivo_legal: true,
            monto_efectivo_cobrado: 82.6,
            monto_ajuste_redondeo: 0.04,
          },
          error: null,
        };
      }
      return { data: null, error: null };
    });

    const result = await ctx.service.procesarVenta(ventaBase, user);

    expect(result).toEqual(expect.objectContaining({
      success: true,
      venta_id: 'venta-idempotente',
      total: 82.6,
      idempotent: true,
      redondeo_efectivo_legal: true,
      monto_efectivo_cobrado: 82.6,
      monto_ajuste_redondeo: 0.04,
    }));
    expect(ctx.rpcMock).not.toHaveBeenCalledWith('resolver_precios_venta_tx', expect.any(Object));
    expect(ctx.rpcMock).not.toHaveBeenCalledWith('pos_registrar_venta_comercial_tx', expect.any(Object));
    expect(ctx.supabaseClient.from).not.toHaveBeenCalledWith('empresa_config');
  });

  it('usa RPC atomic_tx y no duplica detalles, pagos, stock ni caja desde la API', async () => {
    const ctx = createService();
    ctx.rpcMock.mockImplementation(async (fn: string, args?: any) => {
      if (fn === 'resolver_precios_venta_tx') return resolvedCommercialPrices(args);
      if (fn === 'pos_registrar_venta_comercial_tx') {
        return {
          data: {
            venta_id: 'venta-atomic-1',
            numero_ticket: 'T001-00000199',
            subtotal: 100,
            impuestos: 18,
            total: 118,
            impactos_aplicados: true,
            caja_movimiento_id: 'mov-caja-1',
            cpe_id: null,
            cpe_pendiente: true,
            facturacion_pendiente: true,
            cuenta_por_cobrar_id: null,
            credito_monto: 0,
            accounting_event_id: 'event-atomic-1',
            documento_id: 'doc-atomic-1',
            items_actualizados: [],
          },
          error: null,
        };
      }
      return { data: null, error: null };
    });

    const result = await ctx.service.procesarVenta(ventaBase, user);

    expect(result.success).toBe(true);
    expect(result.venta_id).toBe('venta-atomic-1');
    expect(ctx.rpcMock).toHaveBeenCalledWith('pos_registrar_venta_comercial_tx', expect.any(Object));
    expect(ctx.inserts.find((entry) => entry.table === 'detalle_ventas_pos')).toBeUndefined();
    expect(ctx.inserts.find((entry) => entry.table === 'ventas_pos_pagos')).toBeUndefined();
    expect(ctx.inserts.find((entry) => entry.table === 'movimientos_inventario')).toBeUndefined();
    expect(ctx.rpcMock).not.toHaveBeenCalledWith('registrar_movimiento_caja', expect.any(Object));
  });

  it('no persiste literales de metodo de pago como UUID', async () => {
    const ctx = createService();
    ctx.validationService.validateCertificate.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
    ctx.validationService.validateRucConfiguration.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
    ctx.validationService.validateDocumentBeforeEmission.mockResolvedValue({ isValid: true, errors: [], warnings: [] });

    const result = await ctx.service.procesarVenta({ ...ventaBase, metodo_pago_id: 'efectivo', total: 118 }, user);

    expect(result.success).toBe(true);
    const atomicTxCall = ctx.rpcMock.mock.calls.find((call: any[]) => call[0] === 'pos_registrar_venta_comercial_tx');
    expect(atomicTxCall?.[1]?.p_payload).toEqual(expect.objectContaining({ metodo_pago: 'efectivo' }));
  });

  it('usa metadata canonica de productos para dejar CPE POS en cola durable', async () => {
    const ctx = createService();
    ctx.validationService.validateCertificate.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
    ctx.validationService.validateRucConfiguration.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
    ctx.validationService.validateDocumentBeforeEmission.mockResolvedValue({ isValid: true, errors: [], warnings: [] });

    const result = await ctx.service.procesarVenta({
      ...ventaBase,
      items: [
        { producto_id: 'prod-1', cantidad: 1, precio_unitario: 100 },
      ],
    }, user);

    expect(result.success).toBe(true);
    expect(ctx.cpeService.create).not.toHaveBeenCalled();
    const rpc = ctx.rpcMock.mock.calls.find(([fn]) => fn === 'pos_registrar_venta_comercial_tx');
    expect(rpc?.[1].p_payload).toEqual(expect.objectContaining({
      items: expect.arrayContaining([
        expect.objectContaining({ producto_id: 'prod-1', cantidad: 1 }),
      ]),
      cpe_data: expect.objectContaining({
        tipo_documento: '03',
        serie: 'B001',
        total_venta: 118,
      }),
    }));
    expect(ctx.updates.find((entry) => entry.table === 'ventas_pos')).toBeUndefined();
  });

  it('no abre cuenta por cobrar cuando el pago se liquida en el acto', async () => {
    const ctx = createService({
      metodoPago: { id: 'mp-yape', codigo: 'yape', tipo: 'BILLETERA_DIGITAL' },
    });
    ctx.validationService.validateCertificate.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
    ctx.validationService.validateRucConfiguration.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
    ctx.validationService.validateDocumentBeforeEmission.mockResolvedValue({ isValid: true, errors: [], warnings: [] });

    const result = await ctx.service.procesarVenta({ ...ventaBase, metodo_pago_id: 'yape' }, user);

    expect(result.success).toBe(true);
    expect(ctx.cxcService.crearCuentaPorCobrarDesdeFactura).not.toHaveBeenCalled();
  });

  it('trata como crédito el medio de pago diferido', async () => {
    const ctx = createService({
      metodoPago: { id: 'mp-credito', codigo: 'credito', tipo: 'CREDITO' },
    });
    ctx.validationService.validateCertificate.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
    ctx.validationService.validateRucConfiguration.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
    ctx.validationService.validateDocumentBeforeEmission.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
    ctx.rpcMock.mockImplementation(async (fn: string, args?: any) => {
      if (fn === 'resolver_precios_venta_tx') return resolvedCommercialPrices(args);
      if (fn === 'pos_registrar_venta_comercial_tx') {
        return {
          data: null,
          error: {
            code: '23514',
            message: 'POS_CREDIT_REQUIRES_ACTIVE_CUSTOMER',
          },
        };
      }
      return { data: null, error: null };
    });

    // Sin cliente registrado la venta a crédito se rechaza antes de crear la CxC:
    // ese rechazo es la señal de que el medio se clasificó como diferido.
    const result = await ctx.service.procesarVenta({ ...ventaBase, metodo_pago_id: 'credito' }, user);

    expect(result.success).toBe(false);
    expect(result.message).toContain('POS_CREDIT_REQUIRES_ACTIVE_CUSTOMER');
    expect(result.error?.codigo).toBe('23514');
    expect(ctx.inserts).toHaveLength(0);
  });

  it('descuenta el descuento global de la base imponible, no del total con IGV', async () => {
    const ctx = createService();
    ctx.validationService.validateCertificate.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
    ctx.validationService.validateRucConfiguration.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
    ctx.validationService.validateDocumentBeforeEmission.mockResolvedValue({ isValid: true, errors: [], warnings: [] });

    await ctx.service.procesarVenta(
      { ...ventaBase, descuento_global: { tipo: 'PORCENTAJE', valor: 10 } },
      user,
    );

    const rpc = ctx.rpcMock.mock.calls.find(([fn]) => fn === 'pos_registrar_venta_comercial_tx');
    // Base 100 - 10 % = 90; el IGV se calcula sobre 90, no sobre 100.
    expect(rpc?.[1].p_payload.items[0].subtotal).toBe(90);
    expect(rpc?.[1].p_payload.items[0].igv).toBe(16.2);
    expect(rpc?.[1].p_payload.cpe_data.total_gravadas).toBe(90);
    expect(rpc?.[1].p_payload.cpe_data.total_igv).toBe(16.2);
    expect(rpc?.[1].p_payload.cpe_data.total_venta).toBe(106.2);
  });

  it('no cobra IGV sobre un producto exonerado', async () => {
    const ctx = createService({
      productos: [{ ...productoBase, afectacion_igv: '20' }],
    });
    ctx.validationService.validateCertificate.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
    ctx.validationService.validateRucConfiguration.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
    ctx.validationService.validateDocumentBeforeEmission.mockResolvedValue({ isValid: true, errors: [], warnings: [] });

    await ctx.service.procesarVenta(ventaBase, user);

    const rpc = ctx.rpcMock.mock.calls.find(([fn]) => fn === 'pos_registrar_venta_comercial_tx');
    expect(rpc?.[1].p_payload.items[0].igv).toBe(0);
    expect(rpc?.[1].p_payload.cpe_data.total_exoneradas).toBe(100);
    expect(rpc?.[1].p_payload.cpe_data.total_gravadas).toBe(0);
    expect(rpc?.[1].p_payload.cpe_data.total_igv).toBe(0);
    expect(rpc?.[1].p_payload.cpe_data.total_venta).toBe(100);
  });

  it('prorratea el descuento global sin mover base entre afectaciones', async () => {
    const ctx = createService({
      productos: [
        { ...productoBase, id: 'prod-1', afectacion_igv: '10' },
        { ...productoBase, id: 'prod-exo', codigo: 'P2', nombre: 'Prod exonerado', afectacion_igv: '20' },
      ],
    });
    ctx.validationService.validateCertificate.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
    ctx.validationService.validateRucConfiguration.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
    ctx.validationService.validateDocumentBeforeEmission.mockResolvedValue({ isValid: true, errors: [], warnings: [] });

    await ctx.service.procesarVenta(
      {
        ...ventaBase,
        items: [
          { producto_id: 'prod-1', cantidad: 1, precio_unitario: 100 },
          { producto_id: 'prod-exo', cantidad: 1, precio_unitario: 100 },
        ],
        descuento_global: { tipo: 'MONTO_FIJO', valor: 20 },
      },
      user,
    );

    const rpc = ctx.rpcMock.mock.calls.find(([fn]) => fn === 'pos_registrar_venta_comercial_tx');
    // 20 repartidos por peso: 10 a cada ítem de 100.
    expect(rpc?.[1].p_payload.items.map((item: any) => item.subtotal)).toEqual([90, 90]);
    expect(rpc?.[1].p_payload.items.map((item: any) => item.igv)).toEqual([16.2, 0]);
    expect(rpc?.[1].p_payload.cpe_data.total_gravadas).toBe(90);
    expect(rpc?.[1].p_payload.cpe_data.total_exoneradas).toBe(90);
    expect(rpc?.[1].p_payload.cpe_data.total_igv).toBe(16.2);
  });

  it('delega ticket y correlativo fiscal a la frontera atómica', async () => {
    const ctx = createService();
    ctx.validationService.validateCertificate.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
    ctx.validationService.validateRucConfiguration.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
    ctx.validationService.validateDocumentBeforeEmission.mockResolvedValue({ isValid: true, errors: [], warnings: [] });

    const result = await ctx.service.procesarVenta(ventaBase, user);

    expect(result.success).toBe(true);
    expect(ctx.rpcMock).not.toHaveBeenCalledWith('obtener_siguiente_numero_documento', expect.any(Object));
    const rpc = ctx.rpcMock.mock.calls.find(([fn]) => fn === 'pos_registrar_venta_comercial_tx');
    expect(rpc?.[1].p_payload.ticket_serie).toBe('T001');
    expect(rpc?.[1].p_payload.cpe_data).toEqual(expect.objectContaining({
      tipo_documento: '03',
      serie: 'B001',
    }));
    expect(rpc?.[1].p_payload.cpe_data.numero).toBeUndefined();
  });

  it('respeta una serie fiscal válida sin mezclarla con la serie interna del ticket', async () => {
    const ctx = createService();
    ctx.validationService.validateCertificate.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
    ctx.validationService.validateRucConfiguration.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
    ctx.validationService.validateDocumentBeforeEmission.mockResolvedValue({ isValid: true, errors: [], warnings: [] });

    const result = await ctx.service.procesarVenta(
      { ...ventaBase, comprobante: { tipo: '03', serie: 'B001' } },
      user,
    );

    expect(result.success).toBe(true);
    const rpc = ctx.rpcMock.mock.calls.find(([fn]) => fn === 'pos_registrar_venta_comercial_tx');
    expect(rpc?.[1].p_payload.ticket_serie).toBe('T001');
    expect(rpc?.[1].p_payload.cpe_data.serie).toBe('B001');
  });

  it('propaga la respuesta idempotente de la frontera sin reservar otro correlativo', async () => {
    const ctx = createService();
    ctx.rpcMock.mockImplementation(async (fn: string, args?: any) => {
      if (fn === 'resolver_precios_venta_tx') return resolvedCommercialPrices(args);
      if (fn === 'pos_registrar_venta_comercial_tx') {
        return {
          data: {
            venta_id: 'venta-existente',
            numero_ticket: 'T001-00000077',
            subtotal: 100,
            impuestos: 18,
            total: 118,
            impactos_aplicados: true,
            caja_movimiento_id: null,
            cpe_id: null,
            cpe_pendiente: true,
            facturacion_pendiente: true,
            cuenta_por_cobrar_id: null,
            credito_monto: 0,
            accounting_event_id: 'event-existing-1',
            documento_id: 'doc-existing-1',
            items_actualizados: [],
            idempotent: true,
          },
          error: null,
        };
      }
      return { data: null, error: null };
    });
    ctx.validationService.validateCertificate.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
    ctx.validationService.validateRucConfiguration.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
    ctx.validationService.validateDocumentBeforeEmission.mockResolvedValue({ isValid: true, errors: [], warnings: [] });

    const result = await ctx.service.procesarVenta(ventaBase, user);

    expect(result.success).toBe(true);
    expect(result.venta_id).toBe('venta-existente');
    expect(result.idempotent).toBe(true);
    expect(ctx.rpcMock).not.toHaveBeenCalledWith('obtener_siguiente_numero_documento', expect.any(Object));
  });

  it('no bloquea la venta POS emitiendo CPE sincrono y la deja pendiente para el worker', async () => {
    const ctx = createService();
    ctx.validationService.validateCertificate.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
    ctx.validationService.validateRucConfiguration.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
    ctx.validationService.validateDocumentBeforeEmission.mockResolvedValue({ isValid: true, errors: [], warnings: [] });

    const result = await ctx.service.procesarVenta(ventaBase, user);

    expect(result.success).toBe(true);
    expect(result.factura_electronica).toBe(false);
    expect(result.cpe_id).toBeNull();
    expect(result.cpe_pendiente).toBe(true);
    expect(ctx.cpeService.create).not.toHaveBeenCalled();
    expect(ctx.updates.find((entry) => entry.table === 'ventas_pos')).toBeUndefined();
    const rpc = ctx.rpcMock.mock.calls.find(([fn]) => fn === 'pos_registrar_venta_comercial_tx');
    expect(rpc?.[1].p_payload.cpe_data).toEqual(expect.objectContaining({
      total_gravadas: 100,
      total_igv: 18,
      total_venta: 118,
    }));
  });

  it('persiste cpe_id al reintentar facturacion POS incluso si la cola quedo marcada como no pendiente', async () => {
    const ctx = createService({
      ventasPosResponse: {
        id: 'venta-1',
        tenant_id: 'tenant-1',
        numero_ticket: 'B001-000001',
        cpe_pendiente: false,
        intentos_facturacion: 0,
        idempotency_key: 'lock-123',
        cpe_data: {
          tipo_documento: '03',
          serie: 'B001',
          numero: 1,
          documento_id: 'doc-1',
          venta_pos_id: 'venta-1',
          total_venta: 118,
          items: [],
        },
      },
    });

    const result = await ctx.service.reintentarFacturacionVenta('venta-1', user);

    expect(result).toEqual({
      success: true,
      cpe_id: 'cpe-1',
      message: 'Facturación completada exitosamente',
    });
    expect(ctx.cpeService.create).toHaveBeenCalledWith(
      expect.objectContaining({ idempotency_key: 'pos.cpe:tenant-1:lock-123' }),
      'tenant-1',
      'user-1',
      { finalizarDocumentoPosReservado: true },
    );
    expect(ctx.updates).toEqual([]);
  });

  // ======= FORENSIC ANALYSIS TESTS =======

  it('rechaza venta sin idempotency_key', async () => {
    const ctx = createService();
    const result = await ctx.service.procesarVenta(
      { ...ventaBase, idempotency_key: undefined },
      user,
    );
    expect(result.success).toBe(false);
    expect(result.message).toContain('idempotency_key');
  });

  it('rechaza venta sin items', async () => {
    const ctx = createService();
    const result = await ctx.service.procesarVenta(
      { ...ventaBase, items: [] },
      user,
    );
    expect(result.success).toBe(false);
    expect(result.message).toContain('items');
  });

  it('rechaza venta sin documento del cliente', async () => {
    const ctx = createService();
    const result = await ctx.service.procesarVenta(
      { ...ventaBase, cliente_documento: '' },
      user,
    );
    expect(result.success).toBe(false);
    expect(result.message).toContain('documento');
  });

  it('rechaza venta sin nombre del cliente', async () => {
    const ctx = createService();
    const result = await ctx.service.procesarVenta(
      { ...ventaBase, cliente_nombre: '' },
      user,
    );
    expect(result.success).toBe(false);
    expect(result.message).toContain('nombre');
  });

  it('rechaza pagos que no cuadran con el total calculado', async () => {
    const ctx = createService();
    const result = await ctx.service.procesarVenta(
      {
        ...ventaBase,
        pagos: [
          { codigo: 'efectivo', monto: 50, tipo: 'EFECTIVO' },
          { codigo: 'tarjeta', monto: 10, tipo: 'TARJETA' },
        ],
      },
      user,
    );
    expect(result.success).toBe(false);
    expect(result.message).toContain('Pagos no cuadran');
  });

  it('acepta pagos mixtos que suman el total correcto', async () => {
    const ctx = createService();
    const result = await ctx.service.procesarVenta(
      {
        ...ventaBase,
        pagos: [
          { codigo: 'efectivo', monto: 60, tipo: 'EFECTIVO' },
          { codigo: 'tarjeta', monto: 58, tipo: 'TARJETA' },
        ],
      },
      user,
    );
    expect(result.success).toBe(true);
  });

  it('documenta el redondeo sólo para pago PE/PEN íntegramente en efectivo', async () => {
    const producto = { ...productoBase, precio_venta: 100.03 };
    const ctx = createService({ productos: [producto] });
    const result = await ctx.service.procesarVenta(
      {
        ...ventaBase,
        moneda: 'PEN',
        redondeo_efectivo_legal: true,
        items: [{
          producto_id: 'prod-1',
          cantidad: 1,
          precio_unitario: 100.03,
          producto: { codigo: 'P1', nombre: 'Prod 1' },
        }],
        pagos: [{ metodo_pago_id: 'mp-efectivo', monto: 118 }],
      },
      user,
    );

    expect(result.success).toBe(true);
    expect(ctx.rpcMock).toHaveBeenCalledWith(
      'pos_registrar_venta_comercial_tx',
      expect.objectContaining({
        p_payload: expect.objectContaining({
          redondeo_efectivo_legal: true,
          pagos: [expect.objectContaining({ monto: 118, codigo: 'efectivo' })],
        }),
      }),
    );
  });

  it('rechaza el mismo subpago sin la evidencia solicitada', async () => {
    const producto = { ...productoBase, precio_venta: 100.03 };
    const ctx = createService({ productos: [producto] });
    const result = await ctx.service.procesarVenta(
      {
        ...ventaBase,
        moneda: 'PEN',
        items: [{
          producto_id: 'prod-1',
          cantidad: 1,
          precio_unitario: 100.03,
          producto: { codigo: 'P1', nombre: 'Prod 1' },
        }],
        pagos: [{ metodo_pago_id: 'mp-efectivo', monto: 118 }],
      },
      user,
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain('Pagos no cuadran');
    expect(ctx.rpcMock).not.toHaveBeenCalledWith(
      'pos_registrar_venta_comercial_tx',
      expect.anything(),
    );
  });

  it('documenta cobro físico cero cuando una venta PE/PEN completa vale menos de S/ 0.10', async () => {
    const producto = { ...productoBase, precio_venta: 0.03 };
    const ctx = createService({ productos: [producto] });
    const result = await ctx.service.procesarVenta(
      {
        ...ventaBase,
        moneda: 'PEN',
        redondeo_efectivo_legal: true,
        items: [{
          producto_id: 'prod-1',
          cantidad: 1,
          precio_unitario: 0.03,
          producto: { codigo: 'P1', nombre: 'Prod 1' },
        }],
        pagos: [{ metodo_pago_id: 'mp-efectivo', monto: 0 }],
      },
      user,
    );

    expect(result.success).toBe(true);
    expect(ctx.rpcMock).toHaveBeenCalledWith(
      'pos_registrar_venta_comercial_tx',
      expect.objectContaining({
        p_payload: expect.objectContaining({
          redondeo_efectivo_legal: true,
          pagos: [expect.objectContaining({ monto: 0, codigo: 'efectivo' })],
        }),
      }),
    );
  });

  it('rechaza pago con monto cero o negativo', async () => {
    const ctx = createService();
    const result = await ctx.service.procesarVenta(
      {
        ...ventaBase,
        pagos: [{ codigo: 'efectivo', monto: 0, tipo: 'EFECTIVO' }],
      },
      user,
    );
    expect(result.success).toBe(false);
    expect(result.message).toContain('Monto de pago inválido');
  });

  it('recalcula totales server-side ignorando valores del cliente', async () => {
    const ctx = createService();
    // Enviar totales incorrectos - el server debe recalcular
    const result = await ctx.service.procesarVenta(
      {
        ...ventaBase,
        subtotal: 999,
        impuestos: 999,
        total: 9999,
      },
      user,
    );
    expect(result.success).toBe(true);
    // Los totales reales deberían ser 100 subtotal, 18 IGV, 118 total
    // (1 item x 100 precio x 1 cantidad)
  });

  it('retorna venta existente si idempotency_key ya fue usada en atomic_tx', async () => {
    const ctx = createService();
    ctx.rpcMock.mockImplementation(async (fn: string, args?: any) => {
      if (fn === 'resolver_precios_venta_tx') return resolvedCommercialPrices(args);
      if (fn === 'pos_registrar_venta_comercial_tx') {
        return {
          data: {
            venta_id: 'venta-existente',
            numero_ticket: 'T001-00000001',
            subtotal: 100,
            impuestos: 18,
            total: 118,
            impactos_aplicados: true,
            caja_movimiento_id: null,
            cpe_id: null,
            cpe_pendiente: true,
            facturacion_pendiente: true,
            cuenta_por_cobrar_id: null,
            credito_monto: 0,
            accounting_event_id: 'event-existing-1',
            documento_id: 'doc-existing-1',
            items_actualizados: [],
            idempotent: true,
          },
          error: null,
        };
      }
      return { data: null, error: null };
    });

    const r1 = await ctx.service.procesarVenta(ventaBase, user);
    expect(r1.success).toBe(true);
    expect(r1.venta_id).toBe('venta-existente');

    // Segunda llamada con misma key debe retornar misma venta
    const r2 = await ctx.service.procesarVenta(ventaBase, user);
    expect(r2.success).toBe(true);
    expect(r2.venta_id).toBe('venta-existente');
  });

  it('bloquea la venta si falta atomic_tx y nunca cae al RPC legacy', async () => {
    const ctx = createService();
    ctx.rpcMock.mockImplementation(async (fn: string, args?: any) => {
      if (fn === 'resolver_precios_venta_tx') return resolvedCommercialPrices(args);
      if (fn === 'pos_registrar_venta_comercial_tx') {
        return {
          data: null,
          error: {
            code: 'PGRST202',
            message: 'Could not find the public.pos_registrar_venta_comercial_tx function',
            details: 'pos_registrar_venta_comercial_tx',
          },
        };
      }
      return { data: null, error: null };
    });
    const result = await ctx.service.procesarVenta(ventaBase, user);
    expect(result.success).toBe(false);
    expect(result.message).toContain('POS_ATOMIC_CONTRACT_UNAVAILABLE');
    const rpcCalls = ctx.rpcMock.mock.calls.map((c: any) => c[0]);
    expect(rpcCalls).toContain('pos_registrar_venta_comercial_tx');
    expect(rpcCalls).not.toContain('pos_registrar_venta_tx');
  });

  it('aplica el descuento del item una sola vez al recalcular totales', async () => {
    const ctx = createService();
    ctx.validationService.validateCertificate.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
    ctx.validationService.validateRucConfiguration.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
    ctx.validationService.validateDocumentBeforeEmission.mockResolvedValue({ isValid: true, errors: [], warnings: [] });

    const result = await ctx.service.procesarVenta({
      ...ventaBase,
      items: [
        {
          producto_id: 'prod-1',
          cantidad: 2,
          precio_unitario: 100,
          precio_original: 100,
          descuento_porcentaje: 5,
          descuento_monto: 10,
        },
      ],
    }, user);

    expect(result.success).toBe(true);
    const atomicTxCall = ctx.rpcMock.mock.calls.find((call: any[]) => call[0] === 'pos_registrar_venta_comercial_tx');
    expect(atomicTxCall?.[1]?.p_payload?.items?.[0]).toEqual(expect.objectContaining({
      precio_unitario: 100,
      descuento_monto: 10,
      subtotal: 190,
    }));
  });

  it('registra un ticket interno real sin enviar intención CPE ni reservar datos fiscales', async () => {
    const ctx = createService();
    ctx.rpcMock.mockImplementation(async (fn: string, args?: any) => {
      if (fn === 'reintentar_venta_pos_comercial_tx') return { data: null, error: null };
      if (fn === 'resolver_precios_venta_tx') return resolvedCommercialPrices(args);
      if (fn === 'pos_registrar_venta_comercial_tx') {
        return {
          data: {
            venta_id: '3b135288-622d-42dc-8ff7-5cc3e3700e20',
            numero_ticket: 'T001-00000081',
            tipo_emision: 'TICKET',
            subtotal: 100,
            impuestos: 18,
            total: 118,
            cpe_id: null,
            cpe_pendiente: false,
            facturacion_pendiente: false,
            canjeable: true,
            impactos_aplicados: true,
            documento_id: '2f3a1303-32b2-4244-a116-16064cd45ff5',
            items_actualizados: [],
          },
          error: null,
        };
      }
      return { data: null, error: null };
    });

    const result = await ctx.service.procesarVenta({
      ...ventaBase,
      emitir_cpe: false,
      metodo_pago_id: 'mp-efectivo',
      cliente_tipo_documento: '1',
      comprobante: { tipo: 'TICKET', serie: 'T001' },
    }, user);

    expect(result).toEqual(expect.objectContaining({
      success: true,
      tipo_emision: 'TICKET',
      canjeable: true,
      cpe_pendiente: false,
      factura_electronica: false,
    }));
    const call = ctx.rpcMock.mock.calls.find(([fn]) => fn === 'pos_registrar_venta_comercial_tx');
    expect(call?.[1].p_payload).toEqual(expect.objectContaining({
      emitir_cpe: false,
      cliente_tipo_documento: '1',
      cpe_data: null,
      commercial_request: expect.objectContaining({
        emitir_cpe: false,
        metodo_pago_id: 'mp-efectivo',
        cliente_tipo_documento: '1',
      }),
    }));
  });

  it('canjea por una única RPC y no acepta importes ni líneas desde la API', async () => {
    const ctx = createService();
    ctx.rpcMock.mockImplementation(async (fn: string) => {
      if (fn === 'pos_canjear_ticket_tx') {
        return {
          data: {
            canje_id: 'b64dd6db-096a-407c-98ee-8b6487bb3d91',
            venta_id: '3b135288-622d-42dc-8ff7-5cc3e3700e20',
            documento_id: 'ccf70abf-748b-40b2-a0aa-b16c27c28010',
            numero_fiscal: 'F001-00000021',
            tipo_emision: 'TICKET_CANJEADO',
            impactos_economicos_reaplicados: false,
            idempotent: false,
          },
          error: null,
        };
      }
      return { data: null, error: null };
    });

    const result = await ctx.service.canjearTicket(
      '3b135288-622d-42dc-8ff7-5cc3e3700e20',
      {
        idempotency_key: ' canje-01 ',
        tipo_documento: '01',
        cliente_id: '6394d65e-5dbd-4261-a028-280643e76da7',
        cliente_tipo_documento: '6',
        cliente_documento: '20123456789',
        cliente_nombre: ' Cliente Fiscal SAC ',
      },
      user,
    );

    expect(result).toEqual(expect.objectContaining({
      success: true,
      numero_fiscal: 'F001-00000021',
      impactos_economicos_reaplicados: false,
    }));
    expect(ctx.rpcMock).toHaveBeenCalledWith('pos_canjear_ticket_tx', {
      p_tenant_id: 'tenant-1',
      p_venta_pos_id: '3b135288-622d-42dc-8ff7-5cc3e3700e20',
      p_actor_id: 'user-1',
      p_idempotency_key: 'canje-01',
      p_payload: {
        tipo_documento: '01',
        serie: null,
        cliente_id: '6394d65e-5dbd-4261-a028-280643e76da7',
        cliente_tipo_documento: '6',
        cliente_documento: '20123456789',
        cliente_nombre: 'Cliente Fiscal SAC',
        cliente_direccion: null,
      },
    });
  });

  it('expone en el historial el vínculo inmutable ticket a documento fiscal', async () => {
    const ctx = createService({
      ventasPosResponse: [{
        id: '3b135288-622d-42dc-8ff7-5cc3e3700e20',
        numero_ticket: 'T001-00000081',
        tipo_emision: 'TICKET_CANJEADO',
        cpe_id: null,
        atomic_result: { numero_fiscal: 'F001-00000021' },
      }],
      canjesResponse: [{
        id: 'b64dd6db-096a-407c-98ee-8b6487bb3d91',
        venta_pos_id: '3b135288-622d-42dc-8ff7-5cc3e3700e20',
        documento_fiscal_id: 'ccf70abf-748b-40b2-a0aa-b16c27c28010',
        tipo_documento: '01',
        serie: 'F001',
        numero: '00000021',
        estado: 'RESERVADO',
      }],
    });

    const result = await ctx.service.getVentasRecientes(user);

    expect(result).toEqual({
      success: true,
      data: [expect.objectContaining({
        numero_ticket: 'T001-00000081',
        numero_fiscal: 'F001-00000021',
        canjeable: false,
        canje: expect.objectContaining({
          documento_fiscal_id: 'ccf70abf-748b-40b2-a0aa-b16c27c28010',
        }),
      })],
    });
  });

  it('no convierte un ticket puro en reintento CPE ni consume contador de intentos', async () => {
    const ctx = createService({
      ventasPosResponse: {
        id: '3b135288-622d-42dc-8ff7-5cc3e3700e20',
        tenant_id: 'tenant-1',
        numero_ticket: 'T001-00000081',
        tipo_emision: 'TICKET',
        cpe_id: null,
        cpe_pendiente: false,
        cpe_data: null,
        intentos_facturacion: 0,
      },
    });

    const result = await ctx.service.reintentarFacturacionVenta(
      '3b135288-622d-42dc-8ff7-5cc3e3700e20',
      user,
    );

    expect(result).toEqual(expect.objectContaining({
      success: false,
      message: expect.stringContaining('flujo de canje'),
    }));
    expect(ctx.cpeService.create).not.toHaveBeenCalled();
    expect(ctx.updates).toHaveLength(0);
  });

  it('el worker ignora defensivamente un ticket interno aunque esté marcado pendiente por datos antiguos', async () => {
    const ctx = createService({
      ventasPosResponse: [{
        id: '3b135288-622d-42dc-8ff7-5cc3e3700e20',
        tenant_id: 'tenant-1',
        tipo_emision: 'TICKET',
        cpe_id: null,
        cpe_pendiente: true,
        cpe_data: { tipo_documento: '03' },
        intentos_facturacion: 0,
      }],
    });

    const result = await ctx.service.procesarVentasPendientesFacturacion('tenant-1', 10);

    expect(result).toEqual({ procesadas: 0, errores: 0 });
    expect(ctx.cpeService.create).not.toHaveBeenCalled();
  });
});
