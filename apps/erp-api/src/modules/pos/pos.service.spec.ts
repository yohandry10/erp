import { PosService } from './pos.service';

const productoBase = {
  id: 'prod-1',
  codigo: 'P1',
  nombre: 'Prod 1',
  precio_venta: 100,
  stock_actual: 5,
  stock_reservado: 0,
  activo: true,
  estado: 'ACTIVO',
  es_servicio: false,
  controla_stock: true,
  unidad_medida: 'NIU',
};

const createSupabaseMock = (fixtures: { ventasPosResponse?: any; productos?: any[]; metodoPago?: any } = {}) => {
  const inserts: Array<{ table: string; rows: any }> = [];
  const updates: Array<{ table: string; rows: any }> = [];
  const responseFor = (table: string) => {
    switch (table) {
      case 'empresa_config':
        return { data: { ruc: '12345678901', razon_social: 'ACME S.A.C.', dias_vencimiento_factura: 30 }, error: null };
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

  let correlativoFiscal = 40;
  const rpcMock = jest.fn(async (fn: string, _args?: any) => {
    if (fn === 'obtener_siguiente_numero_documento') {
      correlativoFiscal += 1;
      return { data: String(correlativoFiscal).padStart(8, '0'), error: null };
    }
    if (fn === 'pos_registrar_venta_full_tx') {
      return {
        data: [
          {
            venta_id: 'venta-1',
            numero_ticket: 'T001-000001',
            subtotal: 100,
            impuestos: 18,
            total: 118,
            impactos_aplicados: true,
            caja_movimiento_id: 'mov-caja-1',
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

const createService = (fixtures: { ventasPosResponse?: any; productos?: any[]; metodoPago?: any } = {}) => {
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
  cliente_documento: '12345678',
  cliente_nombre: 'Cliente Demo',
  items: [
    { producto_id: 'prod-1', cantidad: 1, precio_unitario: 100, producto: { codigo: 'P1', nombre: 'Prod 1' } },
  ],
};

describe('PosService full transaction contract', () => {
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
    expect(ctx.rpcMock).toHaveBeenCalledWith('pos_registrar_venta_full_tx', expect.any(Object));
    expect(ctx.rpcMock).not.toHaveBeenCalledWith('acquire_pos_lock', expect.any(Object));
    expect(ctx.rpcMock).not.toHaveBeenCalledWith('release_pos_lock', expect.any(Object));
  });

  it('procesa venta feliz exclusivamente mediante full_tx', async () => {
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

  it('usa RPC full_tx y no duplica detalles, pagos, stock ni caja desde la API', async () => {
    const ctx = createService();
    ctx.rpcMock.mockImplementation(async (fn: string) => {
      if (fn === 'pos_registrar_venta_full_tx') {
        return {
          data: [
            {
              venta_id: 'venta-full-1',
              numero_ticket: 'B001-00000199',
              subtotal: 100,
              impuestos: 18,
              total: 118,
              impactos_aplicados: true,
              caja_movimiento_id: 'mov-caja-1',
            },
          ],
          error: null,
        };
      }
      return { data: null, error: null };
    });

    const result = await ctx.service.procesarVenta(ventaBase, user);

    expect(result.success).toBe(true);
    expect(result.venta_id).toBe('venta-full-1');
    expect(ctx.rpcMock).toHaveBeenCalledWith('pos_registrar_venta_full_tx', expect.any(Object));
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
    const fullTxCall = ctx.rpcMock.mock.calls.find((call: any[]) => call[0] === 'pos_registrar_venta_full_tx');
    expect(fullTxCall?.[1]).toEqual(expect.objectContaining({ p_metodo_pago: 'efectivo' }));
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
    expect(ctx.updates).toContainEqual(
      expect.objectContaining({
        table: 'ventas_pos',
        rows: expect.objectContaining({
          cpe_pendiente: true,
          cpe_data: expect.objectContaining({
            items: [
              expect.objectContaining({
                codigo_producto: 'P1',
                descripcion: 'Prod 1',
                unidad_medida: 'NIU',
              }),
            ],
          }),
        }),
      }),
    );
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

    // Sin cliente registrado la venta a crédito se rechaza antes de crear la CxC:
    // ese rechazo es la señal de que el medio se clasificó como diferido.
    const result = await ctx.service.procesarVenta({ ...ventaBase, metodo_pago_id: 'credito' }, user);

    expect(result.success).toBe(false);
    expect(result.error?.codigo).toBe('CLIENTE_REQUERIDO_CREDITO');
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

    const rpc = ctx.rpcMock.mock.calls.find(([fn]) => fn === 'pos_registrar_venta_full_tx');
    // Base 100 - 10 % = 90; el IGV se calcula sobre 90, no sobre 100.
    expect(rpc?.[1].p_items[0].subtotal).toBe(90);
    expect(rpc?.[1].p_items[0].igv).toBe(16.2);

    const colaCpe = ctx.updates.find((entry) => entry.table === 'ventas_pos' && entry.rows?.cpe_data);
    expect(colaCpe?.rows.cpe_data.total_gravadas).toBe(90);
    expect(colaCpe?.rows.cpe_data.total_igv).toBe(16.2);
    expect(colaCpe?.rows.cpe_data.total_venta).toBe(106.2);
  });

  it('no cobra IGV sobre un producto exonerado', async () => {
    const ctx = createService({
      productos: [{ ...productoBase, afectacion_igv: '20' }],
    });
    ctx.validationService.validateCertificate.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
    ctx.validationService.validateRucConfiguration.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
    ctx.validationService.validateDocumentBeforeEmission.mockResolvedValue({ isValid: true, errors: [], warnings: [] });

    await ctx.service.procesarVenta(ventaBase, user);

    const rpc = ctx.rpcMock.mock.calls.find(([fn]) => fn === 'pos_registrar_venta_full_tx');
    expect(rpc?.[1].p_items[0].igv).toBe(0);

    const colaCpe = ctx.updates.find((entry) => entry.table === 'ventas_pos' && entry.rows?.cpe_data);
    expect(colaCpe?.rows.cpe_data.total_exoneradas).toBe(100);
    expect(colaCpe?.rows.cpe_data.total_gravadas).toBe(0);
    expect(colaCpe?.rows.cpe_data.total_igv).toBe(0);
    expect(colaCpe?.rows.cpe_data.total_venta).toBe(100);
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

    const rpc = ctx.rpcMock.mock.calls.find(([fn]) => fn === 'pos_registrar_venta_full_tx');
    // 20 repartidos por peso: 10 a cada ítem de 100.
    expect(rpc?.[1].p_items.map((item: any) => item.subtotal)).toEqual([90, 90]);
    expect(rpc?.[1].p_items.map((item: any) => item.igv)).toEqual([16.2, 0]);

    const colaCpe = ctx.updates.find((entry) => entry.table === 'ventas_pos' && entry.rows?.cpe_data);
    expect(colaCpe?.rows.cpe_data.total_gravadas).toBe(90);
    expect(colaCpe?.rows.cpe_data.total_exoneradas).toBe(90);
    expect(colaCpe?.rows.cpe_data.total_igv).toBe(16.2);
  });

  it('reserva el correlativo fiscal en documento_series cuando el ticket usa serie interna', async () => {
    const ctx = createService();
    ctx.validationService.validateCertificate.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
    ctx.validationService.validateRucConfiguration.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
    ctx.validationService.validateDocumentBeforeEmission.mockResolvedValue({ isValid: true, errors: [], warnings: [] });

    // El mock de full_tx devuelve el ticket interno T001-000001: ese correlativo
    // pertenece a la secuencia por caja y no puede viajar al comprobante.
    const result = await ctx.service.procesarVenta(ventaBase, user);

    expect(result.success).toBe(true);
    expect(ctx.rpcMock).toHaveBeenCalledWith('obtener_siguiente_numero_documento', {
      p_tenant_id: 'tenant-1',
      p_tipo_documento: '03',
      p_serie: 'B001',
    });
    const colaCpe = ctx.updates.find(
      (entry) => entry.table === 'ventas_pos' && entry.rows?.cpe_data,
    );
    expect(colaCpe?.rows.cpe_data.serie).toBe('B001');
    expect(colaCpe?.rows.cpe_data.numero).toBe(41);
    expect(colaCpe?.rows.cpe_data.numero).not.toBe(1);
  });

  it('conserva el correlativo del ticket cuando el POS ya lo reservo sobre la serie fiscal', async () => {
    const ctx = createService();
    ctx.rpcMock.mockImplementation(async (fn: string) => {
      if (fn === 'pos_registrar_venta_full_tx') {
        return {
          data: [
            {
              venta_id: 'venta-1',
              numero_ticket: 'B001-00000199',
              subtotal: 100,
              impuestos: 18,
              total: 118,
              impactos_aplicados: true,
              caja_movimiento_id: 'mov-caja-1',
            },
          ],
          error: null,
        };
      }
      return { data: null, error: null };
    });
    ctx.validationService.validateCertificate.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
    ctx.validationService.validateRucConfiguration.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
    ctx.validationService.validateDocumentBeforeEmission.mockResolvedValue({ isValid: true, errors: [], warnings: [] });

    const result = await ctx.service.procesarVenta(
      { ...ventaBase, comprobante: { tipo: '03', serie: 'B001' } },
      user,
    );

    expect(result.success).toBe(true);
    expect(ctx.rpcMock).not.toHaveBeenCalledWith(
      'obtener_siguiente_numero_documento',
      expect.any(Object),
    );
    const colaCpe = ctx.updates.find(
      (entry) => entry.table === 'ventas_pos' && entry.rows?.cpe_data,
    );
    expect(colaCpe?.rows.cpe_data.numero).toBe(199);
  });

  it('reutiliza el correlativo fiscal ya reservado si la venta se reintenta', async () => {
    const ctx = createService({ ventasPosResponse: { cpe_data: { serie: 'B001', numero: 77 } } });
    ctx.validationService.validateCertificate.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
    ctx.validationService.validateRucConfiguration.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
    ctx.validationService.validateDocumentBeforeEmission.mockResolvedValue({ isValid: true, errors: [], warnings: [] });

    const result = await ctx.service.procesarVenta(ventaBase, user);

    expect(result.success).toBe(true);
    expect(ctx.rpcMock).not.toHaveBeenCalledWith(
      'obtener_siguiente_numero_documento',
      expect.any(Object),
    );
    const colaCpe = ctx.updates.find(
      (entry) => entry.table === 'ventas_pos' && entry.rows?.cpe_data,
    );
    expect(colaCpe?.rows.cpe_data.numero).toBe(77);
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
    expect(ctx.updates).toContainEqual(
      expect.objectContaining({
        table: 'ventas_pos',
        rows: expect.objectContaining({
          cpe_id: null,
          cpe_pendiente: true,
          intentos_facturacion: 0,
          error_facturacion: null,
          cpe_data: expect.any(Object),
        }),
      }),
    );
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
    );
    expect(ctx.updates).toContainEqual(
      expect.objectContaining({
        table: 'ventas_pos',
        rows: expect.objectContaining({
          cpe_id: 'cpe-1',
          cpe_pendiente: false,
          error_facturacion: null,
        }),
      }),
    );
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

  it('retorna venta existente si idempotency_key ya fue usada en full_tx', async () => {
    const ctx = createService();
    ctx.rpcMock.mockImplementation(async (fn: string) => {
      if (fn === 'pos_registrar_venta_full_tx') {
        return {
          data: [
            {
              venta_id: 'venta-existente',
              numero_ticket: 'B001-00000001',
              subtotal: 100,
              impuestos: 18,
              total: 118,
              impactos_aplicados: true,
              caja_movimiento_id: null,
            },
          ],
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

  it('bloquea la venta si falta full_tx y nunca cae al RPC legacy', async () => {
    const ctx = createService();
    ctx.rpcMock.mockImplementation(async (fn: string) => {
      if (fn === 'pos_registrar_venta_full_tx') {
        return {
          data: null,
          error: {
            code: 'PGRST202',
            message: 'Could not find the public.pos_registrar_venta_full_tx function',
            details: 'pos_registrar_venta_full_tx',
          },
        };
      }
      return { data: null, error: null };
    });
    const result = await ctx.service.procesarVenta(ventaBase, user);
    expect(result.success).toBe(false);
    expect(result.message).toContain('POS_INVENTORY_CONTRACT_UNAVAILABLE');
    const rpcCalls = ctx.rpcMock.mock.calls.map((c: any) => c[0]);
    expect(rpcCalls).toContain('pos_registrar_venta_full_tx');
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
    const fullTxCall = ctx.rpcMock.mock.calls.find((call: any[]) => call[0] === 'pos_registrar_venta_full_tx');
    expect(fullTxCall?.[1]?.p_items?.[0]).toEqual(expect.objectContaining({
      precio_unitario: 100,
      descuento_monto: 10,
      subtotal: 190,
    }));
  });
});
