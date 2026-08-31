import { PosService } from './pos.service';
import { DianXmlBuilderService } from '../fiscal/colombia/dian-xml-builder.service';
import {
  normalizePersistedFiscalItems,
  normalizePersistedFiscalTotals,
} from '../cpe/cpe-delivery.service';

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
  empresaConfig?: any;
} = {}) => {
  const inserts: Array<{ table: string; rows: any }> = [];
  const updates: Array<{ table: string; rows: any }> = [];
  const responseFor = (table: string) => {
    switch (table) {
      case 'empresa_config':
        return {
          data: fixtures.empresaConfig ?? {
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
  empresaConfig?: any;
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

  const empresaColombiaReal = {
    ruc: '9001234568', razon_social: 'EMPRESA CO S.A.S.', pais: 'CO', is_demo: false,
    moneda_defecto: 'COP', igv_porcentaje: 19, serie_factura: 'FE',
    dian_resolucion_prefijo: 'FE',
    direccion_fiscal: 'Carrera 7 # 72-41', ubigeo: '11001',
    departamento: 'Bogotá D.C.', provincia: 'Bogotá D.C.',
    dian_regimen_fiscal: 'O-13', dian_tipo_contribuyente: '1',
    dias_vencimiento_factura: 30,
  };

  it('atraviesa POS real -> CPE 01/31 -> XML DIAN con NIT y pago canónicos', async () => {
    const ctx = createService({ empresaConfig: empresaColombiaReal });
    const result = await ctx.service.procesarVenta({
      ...ventaBase,
      cliente_id: 'cliente-co-b2b',
      cliente_documento: '900123456-8',
      cliente_tipo_documento: 'NIT',
      cliente_nombre: 'CLIENTE CO S.A.S.',
      cliente_direccion: 'Calle 1 # 2-3',
      metodo_pago_id: 'mp-efectivo',
      emitir_cpe: true,
      comprobante: { tipo: '01', serie: 'HACK' },
      moneda: 'COP',
    }, user);

    expect(result.success).toBe(true);
    const rpc = ctx.rpcMock.mock.calls.find(([fn]) => fn === 'pos_registrar_venta_comercial_tx');
    const payload = rpc?.[1]?.p_payload;
    expect(payload).toMatchObject({
      cliente_tipo_documento: '31', cliente_documento: '9001234568',
      cpe_data: {
        tipo_documento: '01', serie: 'FE', ruc_emisor: '9001234568',
        tipo_documento_receptor: '31', documento_receptor: '9001234568',
        condicion_pago: 'CONTADO', medio_pago: '10',
      },
    });

    const cpe = payload.cpe_data;
    const metadata = cpe.metadata;
    const xml = await new DianXmlBuilderService().generarFacturaElectronica({
      id: 'from-pos', tipoDocumento: cpe.tipo_documento, serie: cpe.serie, numero: '1',
      fechaEmision: '2026-08-29T10:15:00-05:00', moneda: cpe.moneda,
      emisor: {
        tipoDocumento: '31', numeroDocumento: cpe.ruc_emisor,
        razonSocial: cpe.razon_social_emisor, direccion: metadata.dian_direccion_emisor,
        codigoUbigeo: metadata.dian_codigo_dane_emisor,
        ciudad: metadata.dian_municipio_emisor, departamento: metadata.dian_departamento_emisor,
        codigoDepartamento: String(metadata.dian_codigo_dane_emisor).slice(0, 2),
        regimenFiscal: metadata.dian_regimen_fiscal,
        tipoContribuyente: metadata.dian_tipo_contribuyente,
      },
      receptor: {
        tipoDocumento: cpe.tipo_documento_receptor,
        numeroDocumento: cpe.documento_receptor,
        razonSocial: cpe.razon_social_receptor,
        direccion: cpe.direccion_receptor,
        // La 526 fotografía este perfil desde el maestro enlazado antes de
        // persistir un CPE CO real; aquí reproducimos el shape persistido que
        // consume Delivery, no el payload previo al trigger.
        dianTaxProfile: {
          profile: 'ADQUIRIENTE_NIT_B2B', taxLevelCode: 'O-99',
          taxLevelListName: '04', taxSchemeId: '01', taxSchemeName: 'IVA',
        },
      },
      subtotal: cpe.total_gravadas, totalImpuestos: cpe.total_igv,
      importeTotal: cpe.total_venta, tasaImpuesto: 0.19,
      formaPago: cpe.condicion_pago, medioPago: cpe.medio_pago,
      dianContext: {
        environmentId: '2', software: { id: 'software-id', pin: 'software-pin' },
        authorization: {
          number: '18760000001', prefix: cpe.serie, rangeFrom: 1, rangeTo: 5000,
          validFrom: '2026-01-01', validTo: '2027-01-01', technicalKey: 'technical-key',
        },
        taxes: { iva: cpe.total_igv, inc: 0, ica: 0 },
      },
      items: payload.items.map((item: any) => ({
        descripcion: 'Prod 1', cantidad: item.cantidad, precioUnitario: item.precio_unitario,
        valorVenta: item.subtotal, igv: item.igv, tasaIgv: 0.19,
      })),
    });
    expect(xml).toContain('<cbc:InvoiceTypeCode>01</cbc:InvoiceTypeCode>');
    expect(xml).toContain('schemeID="8" schemeName="31" schemeAgencyID="195">900123456</cbc:ID>');
  });

  it('acepta una resolución DIAN sin prefijo y descarta la serie enviada por el navegador', async () => {
    const ctx = createService({
      empresaConfig: { ...empresaColombiaReal, dian_resolucion_prefijo: '' },
    });
    const result = await ctx.service.procesarVenta({
      ...ventaBase,
      cliente_id: 'cliente-co-sin-prefijo',
      cliente_documento: '900123456-8',
      cliente_tipo_documento: 'NIT',
      cliente_nombre: 'CLIENTE CO SIN PREFIJO S.A.S.',
      cliente_direccion: 'Calle 1 # 2-3',
      metodo_pago_id: 'mp-efectivo',
      emitir_cpe: true,
      comprobante: { tipo: '01', serie: 'HACK' },
      moneda: 'COP',
    }, user);

    expect(result.success).toBe(true);
    const rpc = ctx.rpcMock.mock.calls.find(([fn]) => fn === 'pos_registrar_venta_comercial_tx');
    expect(rpc?.[1]?.p_payload.cpe_data).toEqual(expect.objectContaining({
      serie: '',
      condicion_pago: 'CONTADO',
      medio_pago: '10',
      plazo_pago_dias: 0,
    }));
  });

  it('congela CREDITO en el snapshot DIAN cuando el pago POS es a crédito', async () => {
    const ctx = createService({
      empresaConfig: empresaColombiaReal,
      metodoPago: { id: 'mp-credito', codigo: 'credito', tipo: 'CREDITO' },
    });
    const result = await ctx.service.procesarVenta({
      ...ventaBase,
      cliente_id: 'cliente-co-credito',
      cliente_documento: '900123456-8',
      cliente_tipo_documento: 'NIT',
      cliente_nombre: 'CLIENTE CO CREDITO S.A.S.',
      cliente_direccion: 'Calle 1 # 2-3',
      emitir_cpe: true,
      comprobante: { tipo: '01', serie: 'IGNORADA' },
      moneda: 'COP',
      pagos: [{ metodo_pago_id: 'mp-credito', monto: 119 }],
    }, user);

    expect(result.success).toBe(true);
    const rpc = ctx.rpcMock.mock.calls.find(([fn]) => fn === 'pos_registrar_venta_comercial_tx');
    expect(rpc?.[1]?.p_payload.cpe_data).toEqual(expect.objectContaining({
      serie: 'FE',
      condicion_pago: 'CREDITO',
      medio_pago: '1',
      plazo_pago_dias: 30,
      metadata: expect.objectContaining({
        dian_forma_pago: 'CREDITO',
        plazo_pago_dias: 30,
      }),
    }));
  });

  it('usa ZZZ para pago mixto DIAN y congela el plazo de crédito solicitado', async () => {
    const ctx = createService({
      empresaConfig: empresaColombiaReal,
      metodoPago: { id: 'mp-credito', codigo: 'credito', tipo: 'CREDITO' },
    });
    const result = await ctx.service.procesarVenta({
      ...ventaBase,
      cliente_id: 'cliente-co-mixto',
      cliente_documento: '900123456-8',
      cliente_tipo_documento: 'NIT',
      cliente_nombre: 'CLIENTE CO MIXTO S.A.S.',
      cliente_direccion: 'Calle 1 # 2-3',
      emitir_cpe: true,
      comprobante: { tipo: '01', serie: 'IGNORADA' },
      moneda: 'COP',
      plazo_pago_dias: 45,
      pagos: [
        { metodo_pago_id: 'mp-credito', monto: 60, referencia: 'cuota-1' },
        { metodo_pago_id: 'mp-credito', monto: 59, referencia: 'cuota-2' },
      ],
    }, user);

    expect(result.success).toBe(true);
    const rpc = ctx.rpcMock.mock.calls.find(([fn]) => fn === 'pos_registrar_venta_comercial_tx');
    expect(rpc?.[1]?.p_payload.cpe_data).toEqual(expect.objectContaining({
      condicion_pago: 'CREDITO',
      medio_pago: 'ZZZ',
      plazo_pago_dias: 45,
      metadata: expect.objectContaining({
        dian_forma_pago: 'CREDITO',
        dian_medio_pago: 'ZZZ',
        plazo_pago_dias: 45,
      }),
    }));
  });

  it('preserva 10/20/30 desde catálogo autoritativo hasta el XML DIAN mixto', async () => {
    const productos = [
      { ...productoBase, id: 'prod-1', codigo: 'P10', nombre: 'Producto gravado', afectacion_igv: '10' },
      { ...productoBase, id: 'prod-exo', codigo: 'P20', nombre: 'Producto exento', afectacion_igv: '20' },
      { ...productoBase, id: 'prod-excl', codigo: 'P30', nombre: 'Producto excluido', afectacion_igv: '30' },
    ];
    const ctx = createService({ empresaConfig: empresaColombiaReal, productos });

    const result = await ctx.service.procesarVenta({
      ...ventaBase,
      cliente_id: 'cliente-co-consumidor',
      cliente_documento: '1020304050',
      cliente_tipo_documento: 'CC',
      cliente_nombre: 'CLIENTE CO',
      metodo_pago_id: 'mp-efectivo',
      emitir_cpe: true,
      comprobante: { tipo: '01', serie: 'FE' },
      moneda: 'COP',
      items: productos.map((producto) => ({
        producto_id: producto.id,
        cantidad: 1,
        precio_unitario: 100,
        // Simula un navegador manipulado: el backend debe ignorarlo y volver
        // a copiar el valor vigente del catálogo.
        afectacion_igv: '10',
      })),
    }, user);

    expect(result.success).toBe(true);
    const rpc = ctx.rpcMock.mock.calls.find(([fn]) => fn === 'pos_registrar_venta_comercial_tx');
    const payload = rpc?.[1]?.p_payload;
    expect(payload.items.map((item: any) => item.afectacion_igv)).toEqual(['10', '20', '30']);
    expect(payload.items.map((item: any) => item.igv)).toEqual([19, 0, 0]);
    expect(payload.cpe_data).toMatchObject({
      total_gravadas: 100,
      total_exoneradas: 100,
      total_inafectas: 100,
      total_igv: 19,
      total_venta: 319,
    });

    const productosPorId = new Map(productos.map((producto) => [producto.id, producto]));
    const persistedItems = payload.items.map((item: any) => ({
      descripcion: productosPorId.get(item.producto_id)?.nombre,
      cantidad: item.cantidad,
      precio_unitario: item.precio_unitario,
      valor_venta: item.subtotal,
      impuesto_igv: item.igv,
      tasa_igv: item.subtotal > 0 ? item.igv / item.subtotal : 0,
      unidad_medida: 'NIU',
      codigo_producto: productosPorId.get(item.producto_id)?.codigo,
      afectacion_igv: item.afectacion_igv,
    }));
    const normalizedItems = normalizePersistedFiscalItems(persistedItems, 0.19);
    const totals = normalizePersistedFiscalTotals(payload.cpe_data);
    expect(normalizedItems.map((item) => item.dianTaxCategory))
      .toEqual(['GRAVADO', 'EXENTO', 'EXCLUIDO']);
    expect(totals).toMatchObject({ subtotal: 300, totalImpuestos: 19, importeTotal: 319 });

    const metadata = payload.cpe_data.metadata;
    const xml = await new DianXmlBuilderService().generarFacturaElectronica({
      id: 'pos-mixto-co', tipoDocumento: '01', serie: 'FE', numero: '2',
      fechaEmision: '2026-08-29T10:15:00-05:00', moneda: 'COP',
      emisor: {
        tipoDocumento: '31', numeroDocumento: payload.cpe_data.ruc_emisor,
        razonSocial: payload.cpe_data.razon_social_emisor,
        direccion: metadata.dian_direccion_emisor,
        codigoUbigeo: metadata.dian_codigo_dane_emisor,
        ciudad: metadata.dian_municipio_emisor,
        departamento: metadata.dian_departamento_emisor,
        codigoDepartamento: String(metadata.dian_codigo_dane_emisor).slice(0, 2),
        regimenFiscal: metadata.dian_regimen_fiscal,
        tipoContribuyente: metadata.dian_tipo_contribuyente,
      },
      receptor: {
        tipoDocumento: payload.cpe_data.tipo_documento_receptor,
        numeroDocumento: payload.cpe_data.documento_receptor,
        razonSocial: payload.cpe_data.razon_social_receptor,
        dianTaxProfile: {
          profile: 'CONSUMIDOR_FINAL', taxLevelCode: 'R-99-PN',
          taxLevelListName: '49', taxSchemeId: 'ZY', taxSchemeName: 'No causa',
        },
      },
      subtotal: totals.subtotal,
      totalGravadas: payload.cpe_data.total_gravadas,
      totalExoneradas: payload.cpe_data.total_exoneradas,
      totalInafectas: payload.cpe_data.total_inafectas,
      totalImpuestos: totals.totalImpuestos,
      importeTotal: totals.importeTotal,
      tasaImpuesto: 0.19,
      formaPago: payload.cpe_data.condicion_pago,
      medioPago: payload.cpe_data.medio_pago,
      items: normalizedItems,
      dianContext: {
        environmentId: '2', software: { id: 'software-id', pin: 'software-pin' },
        authorization: {
          number: '18760000001', prefix: 'FE', rangeFrom: 1, rangeTo: 5000,
          validFrom: '2026-01-01', validTo: '2027-01-01', technicalKey: 'technical-key',
        },
        taxes: { iva: 19, inc: 0, ica: 0 },
      },
    });

    const lines = [...xml.matchAll(/<cac:InvoiceLine>([\s\S]*?)<\/cac:InvoiceLine>/g)]
      .map((match) => match[1]);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('<cbc:TaxAmount currencyID="COP">19.00</cbc:TaxAmount>');
    expect(lines[1]).toContain('<cbc:TaxAmount currencyID="COP">0.00</cbc:TaxAmount>');
    expect(lines[2]).not.toContain('<cac:TaxTotal>');
    const headerTax = /<cac:TaxTotal>([\s\S]*?)<\/cac:TaxTotal>/.exec(xml)?.[1] ?? '';
    expect(headerTax).not.toContain('<cbc:TaxableAmount currencyID="COP">300.00</cbc:TaxableAmount>');
    expect((headerTax.match(/<cbc:TaxableAmount currencyID="COP">100\.00<\/cbc:TaxableAmount>/g) || []))
      .toHaveLength(2);
    expect(xml).toContain('<cbc:LineExtensionAmount currencyID="COP">300.00</cbc:LineExtensionAmount>');
    expect(xml).toContain('<cbc:PayableAmount currencyID="COP">319.00</cbc:PayableAmount>');
  });

  it.each([
    ['03', 'NIT', '9001234568'],
    ['01', '0', '9001234568'],
  ])('rechaza en backend la combinación DIAN tipo %s / identidad %s', async (
    tipoComprobante, tipoIdentidad, numero,
  ) => {
    const ctx = createService({ empresaConfig: empresaColombiaReal });
    const result = await ctx.service.procesarVenta({
      ...ventaBase, cliente_documento: numero, cliente_tipo_documento: tipoIdentidad,
      metodo_pago_id: 'mp-efectivo', emitir_cpe: true,
      comprobante: { tipo: tipoComprobante, serie: 'FE' }, moneda: 'COP',
    }, user);
    expect(result.success).toBe(false);
    expect(ctx.rpcMock).not.toHaveBeenCalledWith('pos_registrar_venta_comercial_tx', expect.anything());
  });

  it('rechaza antes de cobrar un tenant real sin geografía ni responsabilidad DIAN', async () => {
    const ctx = createService({
      empresaConfig: { ...empresaColombiaReal, ubigeo: null, dian_regimen_fiscal: null },
    });
    const result = await ctx.service.procesarVenta({
      ...ventaBase, cliente_documento: '1020304050', cliente_tipo_documento: 'CC',
      metodo_pago_id: 'mp-efectivo', emitir_cpe: true,
      comprobante: { tipo: '01', serie: 'FE' }, moneda: 'COP',
    }, user);
    expect(result.success).toBe(false);
    expect(result.message).toContain('código DANE');
    expect(ctx.rpcMock).not.toHaveBeenCalledWith('pos_registrar_venta_comercial_tx', expect.anything());
  });

  it.each([
    ['CUIL', '86'],
    ['CDI', '87'],
  ])('preserva punto de venta AR 12 y receptor %s en el CPE atómico', async (
    clienteTipoDocumento,
    expectedIdentityCode,
  ) => {
    const ctx = createService({
      empresaConfig: {
        ruc: '30710158229',
        razon_social: 'EMPRESA ARGENTINA SA',
        pais: 'AR',
        moneda_defecto: 'ARS',
        igv_porcentaje: 21,
        arca_punto_venta: 12,
        arca_condicion_iva: 'RESPONSABLE_INSCRIPTO',
      },
    });

    const result = await ctx.service.procesarVenta({
      ...ventaBase,
      cliente_documento: '20123456786',
      cliente_tipo_documento: clienteTipoDocumento,
      cliente_condicion_iva: 'MONOTRIBUTO',
      emitir_cpe: true,
      comprobante: { tipo: '01', serie: 'F001' },
      moneda: 'ARS',
    }, user);

    expect(result.success).toBe(true);
    const rpc = ctx.rpcMock.mock.calls.find(([fn]) => fn === 'pos_registrar_venta_comercial_tx');
    expect(rpc?.[1]?.p_payload).toMatchObject({
      cliente_tipo_documento: expectedIdentityCode,
      cpe_data: {
        serie: '00012',
        tipo_documento_receptor: expectedIdentityCode,
        metadata: {
          arca_punto_venta: 12,
          arca_condicion_iva_emisor: 'RESPONSABLE_INSCRIPTO',
          arca_condicion_iva_receptor: 'MONOTRIBUTO',
        },
      },
    });
  });

  it('respeta IVA cero del emisor monotributista argentino hasta el CPE atómico', async () => {
    const ctx = createService({
      empresaConfig: {
        ruc: '30710158229',
        razon_social: 'EMISOR MONOTRIBUTO SRL',
        pais: 'AR',
        moneda_defecto: 'ARS',
        igv_porcentaje: 0,
        arca_punto_venta: 12,
        arca_condicion_iva: 'MONOTRIBUTO',
      },
    });

    const result = await ctx.service.procesarVenta({
      ...ventaBase,
      cliente_documento: '30123456',
      cliente_tipo_documento: 'DNI',
      cliente_condicion_iva: 'CONSUMIDOR_FINAL',
      emitir_cpe: true,
      comprobante: { tipo: '01', serie: 'F001' },
      moneda: 'ARS',
    }, user);
    expect(result).toMatchObject({ success: true, message: 'Venta confirmada atómicamente; CPE en cola durable' });

    const rpc = ctx.rpcMock.mock.calls.find(([fn]) => fn === 'pos_registrar_venta_comercial_tx');
    expect(rpc?.[1]?.p_payload).toMatchObject({
      items: [{ igv: 0 }],
      cpe_data: {
        total_gravadas: 100,
        total_igv: 0,
        total_venta: 100,
        metadata: {
          arca_condicion_iva_emisor: 'MONOTRIBUTO',
        },
      },
    });
  });

  it.each(['MONOTRIBUTO', 'EXENTO'])(
    'bloquea antes de cobrar un emisor argentino %s persistido con IVA 21',
    async (arcaCondicionIva) => {
      const ctx = createService({
        empresaConfig: {
          ruc: '30710158229',
          razon_social: 'EMISOR ARGENTINO INCONSISTENTE',
          pais: 'AR',
          moneda_defecto: 'ARS',
          igv_porcentaje: 21,
          arca_punto_venta: 12,
          arca_condicion_iva: arcaCondicionIva,
        },
      });

      const result = await ctx.service.procesarVenta({
        ...ventaBase,
        cliente_documento: '30123456',
        cliente_tipo_documento: 'DNI',
        cliente_condicion_iva: 'CONSUMIDOR_FINAL',
        emitir_cpe: true,
        comprobante: { tipo: '01', serie: 'F001' },
        moneda: 'ARS',
      }, user);

      expect(result).toMatchObject({ success: false });
      expect(result.message).toContain('no puede cobrar IVA');
      expect(ctx.rpcMock).not.toHaveBeenCalledWith(
        'resolver_precios_venta_tx',
        expect.anything(),
      );
      expect(ctx.rpcMock).not.toHaveBeenCalledWith(
        'pos_registrar_venta_comercial_tx',
        expect.anything(),
      );
    },
  );

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

  it('bloquea descuentos en POS CO real antes de cobrar, mover stock o reservar numeración', async () => {
    const ctx = createService({ empresaConfig: empresaColombiaReal });

    const result = await ctx.service.procesarVenta({
      ...ventaBase,
      cliente_id: 'cliente-co-descuento',
      cliente_documento: '900123456-8',
      cliente_tipo_documento: 'NIT',
      cliente_nombre: 'CLIENTE CO DESCUENTO S.A.S.',
      cliente_direccion: 'Calle 1 # 2-3',
      metodo_pago_id: 'mp-efectivo',
      emitir_cpe: true,
      comprobante: { tipo: '01' },
      moneda: 'COP',
      items: [{
        ...ventaBase.items[0],
        descuento_monto: 10,
      }],
    }, user);

    expect(result.success).toBe(false);
    expect(result.message).toContain('AllowanceCharge');
    expect(ctx.rpcMock).not.toHaveBeenCalledWith(
      'pos_registrar_venta_comercial_tx',
      expect.anything(),
    );
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
