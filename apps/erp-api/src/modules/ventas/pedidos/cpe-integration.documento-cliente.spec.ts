import { BadRequestException } from '@nestjs/common';
import { TipoDocumento } from '@erp-suite/dtos';
import { createHash } from 'node:crypto';
import { CPEIntegrationService } from './cpe-integration.service';

describe('CPEIntegrationService documento de cliente', () => {
  const buildService = () => {
    const service = new CPEIntegrationService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { getTasaIgv: jest.fn().mockResolvedValue(0.18) } as any,
    );

    jest.spyOn(service as any, 'obtenerSerieYNumero').mockImplementation(
      async (_tenantId: string, tipoDocumento: TipoDocumento) => ({
        serie: tipoDocumento === TipoDocumento.BOLETA ? 'B001' : 'F001',
        numero: 151,
      }),
    );
    jest.spyOn(service as any, 'obtenerCostoPorProducto').mockResolvedValue(
      new Map([['58184a08-1dca-4c90-9fc8-4a1222b0fb85', 50]]),
    );
    jest.spyOn(service as any, 'obtenerAfectacionPorProducto').mockResolvedValue(
      new Map([['58184a08-1dca-4c90-9fc8-4a1222b0fb85', '10']]),
    );

    return service;
  };

  const pedido = {
    id: 'pedido-ruc-text',
    tenant_id: 'tenant-ruc-text',
    cliente_id: 'cliente-ruc-text',
    subtotal: 80,
    igv: 14.4,
    total: 94.4,
    detalle: [
      {
        producto_id: '58184a08-1dca-4c90-9fc8-4a1222b0fb85',
        cantidad: 1,
        precio_unitario: 80,
        subtotal: 80,
        descripcion: 'Producto con RUC textual',
      },
    ],
  } as any;

  const empresaConfig = {
    ruc: '20987654321',
    razon_social: 'Mi Empresa SAC',
    // Declarada a propósito: antes la suplía un respaldo a PEN dentro del
    // servicio, así que la prueba no decía en qué moneda emitía.
    moneda_defecto: 'PEN',
  };

  it('usa el RUC textual cuando numero_documento no puede almacenar 11 digitos', async () => {
    const service = buildService();

    const factura = await (service as any).mapearPedidoACPE(
      pedido,
      {
        documento_tipo: 'RUC',
        documento_numero: null,
        numero_documento: null,
        ruc: '20831627068',
        codigo: '20831627068',
        razon_social: 'Cliente RUC Textual SAC',
        direccion: 'Av. QA 123',
      },
      empresaConfig,
    );

    expect(factura).toEqual(
      expect.objectContaining({
        tipo_documento: TipoDocumento.FACTURA,
        tipo_documento_receptor: '6',
        documento_receptor: '20831627068',
        razon_social_receptor: 'Cliente RUC Textual SAC',
        total_venta: 94.4,
      }),
    );
  });

  it('rechaza el cliente sin documento tributario real', async () => {
    const service = buildService();

    const promesa = (service as any).mapearPedidoACPE(
      pedido,
      {
        documento_tipo: 'RUC',
        documento_numero: null,
        numero_documento: null,
        ruc: null,
        codigo: null,
        razon_social: 'Cliente Sin Documento SAC',
      },
      empresaConfig,
    );

    await expect(promesa).rejects.toBeInstanceOf(BadRequestException);
    await expect(promesa).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'CLIENTE_SIN_DOCUMENTO',
      }),
    });
  });

  it('emite boleta para un cliente con DNI y conserva la venta a crédito', async () => {
    const service = buildService();

    const boleta = await (service as any).mapearPedidoACPE(
      pedido,
      {
        documento_tipo: 'DNI',
        documento_numero: '45123456',
        razon_social: 'CLIENTE QA CONTABLE PERU',
        direccion: 'Lima',
      },
      empresaConfig,
    );

    expect(boleta).toEqual(
      expect.objectContaining({
        tipo_documento: TipoDocumento.BOLETA,
        serie: 'B001',
        tipo_documento_receptor: '1',
        documento_receptor: '45123456',
        condicion_pago: 'CREDITO',
        costo_ventas: 50,
      }),
    );
    expect(boleta).not.toHaveProperty('medio_pago');
    expect(boleta).not.toHaveProperty('plazo_pago_dias');
  });

  it('rechaza un cliente marcado como RUC con documento corto', async () => {
    const service = buildService();

    await expect(
      (service as any).mapearPedidoACPE(
        pedido,
        {
          documento_tipo: 'RUC',
          documento_numero: '12345678',
          razon_social: 'RUC inválido',
        },
        empresaConfig,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CLIENTE_RUC_INVALIDO' }),
    });
  });

  it('mapea un pedido CO a FEV con receptor DIAN y deja la numeración al servidor', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-01T02:30:00.000Z'));
    const service = buildService();
    const numberSpy = jest.spyOn(service as any, 'obtenerSerieYNumero');

    try {
      const factura = await (service as any).mapearPedidoACPE(
        pedido,
        {
          documento_tipo: 'NIT',
          documento_numero: '9001234568',
          razon_social: 'CLIENTE PEDIDO CO SAS',
          direccion: 'Carrera 7 # 10-20, Bogotá',
          dian_perfil_fiscal: 'ADQUIRIENTE_NIT_B2B',
          dian_responsabilidad_fiscal: 'O-99',
          dian_responsabilidad_list_name: '04',
          dian_tributo_id: '01',
          dian_tributo_nombre: 'IVA',
        },
        {
          ruc: '9012345671',
          razon_social: 'EMISOR PEDIDO CO SAS',
          moneda_defecto: 'COP',
          pais: 'CO',
          is_demo: false,
          dian_resolucion_prefijo: 'FV',
        },
      );

      expect(factura).toEqual(expect.objectContaining({
        tipo_documento: TipoDocumento.FACTURA,
        serie: 'FV',
        numero: 0,
        tipo_documento_receptor: '31',
        documento_receptor: '9001234568',
        moneda: 'COP',
        condicion_pago: 'CONTADO',
        medio_pago: '10',
        plazo_pago_dias: 0,
        dian_receptor_tax_profile: {
          profile: 'ADQUIRIENTE_NIT_B2B',
          taxLevelCode: 'O-99',
          taxLevelListName: '04',
          taxSchemeId: '01',
          taxSchemeName: 'IVA',
        },
        // A esa hora UTC ya es 1 de septiembre, pero en Colombia aún es 31.
        fecha_emision: '2026-08-31',
        fecha_vencimiento: '2026-08-31',
      }));
      expect(numberSpy).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('omite el certificado sólo para el pedido demo CO y conserva su snapshot local', async () => {
    const validateCertificate = jest.fn().mockResolvedValue({
      isValid: false,
      warnings: [],
      errors: ['No hay certificado'],
    });
    const create = jest.fn().mockResolvedValue({
      id: 'cpe-demo-co',
      estado: 'FIRMADO',
      pais: 'CO',
      simulated_origin: true,
      issuer_snapshot: { country_code: 'CO' },
      serie: 'FE',
      numero: 1,
      moneda: 'COP',
      fecha_emision: '2026-09-03',
      total_venta: 119,
      documento_id: 'documento-demo-co',
    });
    const service = new CPEIntegrationService(
      {} as any,
      { create } as any,
      { validateCertificate } as any,
      {} as any,
      { getTasaIgv: jest.fn().mockResolvedValue(0.19) } as any,
    );
    const demoConfig = {
      ruc: '9001234568',
      razon_social: 'Empresa Demo Colombia SAS',
      moneda_defecto: 'COP',
      pais: 'CO',
      is_demo: true,
      dian_resolucion_prefijo: 'FE',
    };
    jest.spyOn(service as any, 'obtenerEmpresaConfig').mockResolvedValue(demoConfig);
    jest.spyOn(service as any, 'congelarPagoDianPedido').mockResolvedValue({
      pedido,
      cliente: {
        documento_tipo: 'NIT',
        documento_numero: '9001234568',
        razon_social: 'Cliente Demo Colombia SAS',
      },
      empresaConfig: demoConfig,
    });
    jest.spyOn(service as any, 'mapearPedidoACPE').mockResolvedValue({
      tipo_documento: TipoDocumento.FACTURA,
      serie: 'FE',
      numero: 1,
      moneda: 'COP',
      total_venta: 119,
      fecha_emision: '2026-09-03',
      items: [],
    });
    jest.spyOn(service as any, 'obtenerCpePersistidoParaRespuesta').mockResolvedValue({
      id: 'cpe-demo-co',
      tenant_id: pedido.tenant_id,
      documento_id: 'documento-demo-co',
      estado: 'FIRMADO',
      pais: null,
      simulated_origin: true,
      issuer_snapshot: { country_code: 'CO' },
      serie: 'FE',
      numero: 1,
      moneda: 'COP',
      fecha_emision: '2026-09-03',
      total_venta: 119,
    });
    jest.spyOn(service as any, 'consumirSnapshotDianPedido').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'registrarExitoIntegracion').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'registrarErrorIntegracion').mockResolvedValue(undefined);
    const key = `ventas.cpe.factura:${pedido.tenant_id}:${pedido.id}`;

    await expect(
      service.generarFacturaDesdePedido(pedido, pedido.tenant_id, key, 'usuario-demo-co'),
    ).resolves.toEqual(expect.objectContaining({
      factura_id: 'cpe-demo-co',
      documento_id: 'documento-demo-co',
      moneda: 'COP',
      total: 119,
      warnings: [
        'Comprobante demo generado localmente: muestra sin transmisión ni validez DIAN',
      ],
      is_demo_representation: true,
    }));
    expect(validateCertificate).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ idempotency_key: key }),
      pedido.tenant_id,
      'usuario-demo-co',
      { pedidoFiscalOwnerId: pedido.id },
    );
  });

  it('usa la procedencia del CPE real si el tenant se convierte después de la lectura inicial demo', async () => {
    const validateCertificate = jest.fn().mockResolvedValue({
      isValid: false,
      warnings: [],
      errors: ['La lectura inicial todavía era demo'],
    });
    const create = jest.fn().mockResolvedValue({
      id: 'cpe-real-tras-conversion',
      estado: 'FIRMADO',
      pais: 'CO',
      simulated_origin: false,
      issuer_snapshot: { country_code: 'CO' },
      serie: 'FV',
      numero: 91,
      moneda: 'COP',
      fecha_emision: '2026-09-04',
      total_venta: 119,
      documento_id: 'documento-real-tras-conversion',
    });
    const service = new CPEIntegrationService(
      {} as any,
      { create } as any,
      { validateCertificate } as any,
      {} as any,
      { getTasaIgv: jest.fn().mockResolvedValue(0.19) } as any,
    );
    const configInicialDemo = {
      ruc: '9001234568',
      razon_social: 'Empresa Demo Colombia SAS',
      moneda_defecto: 'COP',
      pais: 'CO',
      is_demo: true,
      dian_resolucion_prefijo: 'FE',
    };
    const configCongeladaReal = {
      ...configInicialDemo,
      ruc: '9012345671',
      razon_social: 'Empresa Colombia Real SAS',
      is_demo: false,
      dian_resolucion_prefijo: 'FV',
    };
    jest.spyOn(service as any, 'obtenerEmpresaConfig').mockResolvedValue(configInicialDemo);
    jest.spyOn(service as any, 'congelarPagoDianPedido').mockResolvedValue({
      pedido,
      cliente: {
        documento_tipo: 'NIT',
        documento_numero: '9001234568',
        razon_social: 'Cliente Colombia SAS',
      },
      empresaConfig: configCongeladaReal,
    });
    jest.spyOn(service as any, 'mapearPedidoACPE').mockResolvedValue({
      tipo_documento: TipoDocumento.FACTURA,
      serie: 'FV',
      numero: 0,
      moneda: 'COP',
      total_venta: 119,
      fecha_emision: '2026-09-04',
      items: [],
    });
    jest.spyOn(service as any, 'obtenerCpePersistidoParaRespuesta').mockResolvedValue({
      id: 'cpe-real-tras-conversion',
      tenant_id: pedido.tenant_id,
      documento_id: 'documento-real-tras-conversion',
      estado: 'FIRMADO',
      pais: null,
      simulated_origin: false,
      issuer_snapshot: { country_code: 'CO' },
      serie: 'FV',
      numero: 91,
      moneda: 'COP',
      fecha_emision: '2026-09-04',
      total_venta: 119,
    });
    jest.spyOn(service as any, 'consumirSnapshotDianPedido').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'registrarExitoIntegracion').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'registrarErrorIntegracion').mockResolvedValue(undefined);

    await expect(
      service.generarFacturaDesdePedido(
        pedido,
        pedido.tenant_id,
        `ventas.cpe.factura:${pedido.tenant_id}:${pedido.id}`,
        'usuario-real-co',
      ),
    ).resolves.toEqual(expect.objectContaining({
      factura_id: 'cpe-real-tras-conversion',
      is_demo_representation: false,
      warnings: [
        'La factura fue firmada pero debe ser enviada manualmente a DIAN desde el módulo CPE',
      ],
    }));
    expect(validateCertificate).not.toHaveBeenCalled();
  });

  it('mantiene el certificado obligatorio para una empresa CO real', async () => {
    const validateCertificate = jest.fn().mockResolvedValue({
      isValid: false,
      warnings: [],
      errors: ['Certificado vencido'],
    });
    const create = jest.fn();
    const service = new CPEIntegrationService(
      {} as any,
      { create } as any,
      { validateCertificate } as any,
      {} as any,
      { getTasaIgv: jest.fn().mockResolvedValue(0.19) } as any,
    );
    jest.spyOn(service as any, 'obtenerEmpresaConfig').mockResolvedValue({
      ruc: '9012345671',
      razon_social: 'Empresa Colombia Real SAS',
      moneda_defecto: 'COP',
      pais: 'CO',
      is_demo: false,
      dian_resolucion_prefijo: 'FV',
    });
    jest.spyOn(service as any, 'registrarErrorIntegracion').mockResolvedValue(undefined);

    await expect(
      service.generarFacturaDesdePedido(pedido, pedido.tenant_id),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CERT_VALIDATION_FAILED' }),
    });
    expect(validateCertificate).toHaveBeenCalledWith(pedido.tenant_id);
    expect(create).not.toHaveBeenCalled();
  });

  it('conserva crédito, medio, plazo y fechas calendario del snapshot del pedido CO', async () => {
    const service = buildService();

    const factura = await (service as any).mapearPedidoACPE(
      {
        ...pedido,
        metadata: {
          dian_forma_pago: 'CREDITO',
          dian_medio_pago: '42',
          plazo_pago_dias: 30,
          fecha_emision: '2026-08-31',
          fecha_vencimiento: '2026-09-30',
        },
      },
      {
        documento_tipo: 'NIT',
        documento_numero: '9001234568',
        razon_social: 'CLIENTE PEDIDO CO SAS',
      },
      {
        ruc: '9012345671',
        razon_social: 'EMISOR PEDIDO CO SAS',
        moneda_defecto: 'COP',
        pais: 'CO',
        is_demo: false,
        dian_resolucion_prefijo: 'FV',
      },
    );

    expect(factura).toEqual(expect.objectContaining({
      condicion_pago: 'CREDITO',
      medio_pago: '42',
      plazo_pago_dias: 30,
      fecha_emision: '2026-08-31',
      fecha_vencimiento: '2026-09-30',
    }));
  });

  it('rechaza un pedido CO cuyo plazo contradice su vencimiento', async () => {
    const service = buildService();

    await expect((service as any).mapearPedidoACPE(
      {
        ...pedido,
        condicion_pago: 'CREDITO',
        medio_pago: '42',
        plazo_pago_dias: 15,
        fecha_emision: '2026-08-31',
        fecha_vencimiento: '2026-09-30',
      },
      {
        documento_tipo: 'NIT',
        documento_numero: '9001234568',
        razon_social: 'CLIENTE PEDIDO CO SAS',
      },
      {
        ruc: '9012345671',
        razon_social: 'EMISOR PEDIDO CO SAS',
        moneda_defecto: 'COP',
        pais: 'CO',
        is_demo: false,
        dian_resolucion_prefijo: 'FV',
      },
    )).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PEDIDO_DIAN_PAYMENT_INCONSISTENT' }),
    });
  });

  it('falla cerrado en CO real si no puede consultar la afectación tributaria', async () => {
    const query: any = {
      select: jest.fn(() => query),
      eq: jest.fn(() => query),
      in: jest.fn().mockResolvedValue({ data: null, error: { message: 'timeout' } }),
    };
    const service = new CPEIntegrationService(
      { getClient: () => ({ from: () => query }) } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect((service as any).obtenerAfectacionPorProducto(
      'tenant-co',
      ['producto-20'],
      true,
    )).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PEDIDO_DIAN_TAX_PROFILE_UNAVAILABLE' }),
    });
  });

  it('falla cerrado en CO real si falta un producto aun con perfiles 20 y 30 disponibles', async () => {
    const query: any = {
      select: jest.fn(() => query),
      eq: jest.fn(() => query),
      in: jest.fn().mockResolvedValue({
        data: [
          { id: 'producto-20', afectacion_igv: '20' },
          { id: 'producto-30', afectacion_igv: '30' },
        ],
        error: null,
      }),
    };
    const service = new CPEIntegrationService(
      { getClient: () => ({ from: () => query }) } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect((service as any).obtenerAfectacionPorProducto(
      'tenant-co',
      ['producto-20', 'producto-30', 'producto-faltante'],
      true,
    )).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'PEDIDO_DIAN_TAX_PROFILE_INCOMPLETE',
        details: { producto_ids: ['producto-faltante'] },
      }),
    });
  });

  it('reserva el correlativo en la secuencia fiscal compartida', async () => {
    const single = jest.fn().mockResolvedValue({
      data: { serie_factura: 'F001', serie_boleta: 'B001' },
      error: null,
    });
    const eq = jest.fn().mockReturnValue({ single });
    const select = jest.fn().mockReturnValue({ eq });
    const from = jest.fn().mockReturnValue({ select });
    const rpc = jest.fn().mockResolvedValue({ data: 2, error: null });
    const service = new CPEIntegrationService(
      { getClient: () => ({ from, rpc }) } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      (service as any).obtenerSerieYNumero('tenant-demo', TipoDocumento.BOLETA),
    ).resolves.toEqual({ serie: 'B001', numero: 2 });
    expect(rpc).toHaveBeenCalledWith('obtener_siguiente_numero_documento', {
      p_tenant_id: 'tenant-demo',
      p_tipo_documento: TipoDocumento.BOLETA,
      p_serie: 'B001',
    });
  });

  it('emite con el snapshot canónico cuando una actualización gana antes del freeze', async () => {
    const key = 'ventas.cpe.factura:tenant-ruc-text:pedido-ruc-text';
    const canonicalProductId = '58184a08-1dca-4c90-9fc8-4a1222b0fb85';
    const paymentSnapshot = {
      version: 1,
      idempotency_key: key,
      condicion_pago: 'CONTADO',
      medio_pago: '10',
      plazo_pago_dias: 0,
      fecha_emision: '2026-08-31',
      fecha_vencimiento: '2026-08-31',
    };
    const fiscalSnapshotPayload = {
      version: 1,
      pedido: {
        ...pedido,
        cliente_id: 'cliente-canonico',
        subtotal: 200,
        igv: 38,
        total: 238,
        moneda: 'COP',
        observaciones: 'ACTUALIZACION QUE GANO EL LOCK',
      },
      detalle: [{
        id: 'detalle-canonico',
        pedido_id: pedido.id,
        producto_id: canonicalProductId,
        descripcion: 'Producto canónico concurrente',
        cantidad: 2,
        precio_unitario: 100,
        subtotal: 200,
      }],
      cliente: {
        id: 'cliente-canonico',
        tenant_id: pedido.tenant_id,
        documento_tipo: 'NIT',
        documento_numero: '9001234568',
        razon_social: 'CLIENTE CANÓNICO DESPUÉS DEL UPDATE SAS',
        direccion: 'Carrera 10 # 20-30, Bogotá',
      },
      empresa: {
        ruc: '9012345671',
        razon_social: 'EMISOR CANÓNICO CO SAS',
        moneda_defecto: 'COP',
        pais: 'CO',
        is_demo: false,
        dian_resolucion_prefijo: 'FV',
      },
      productos: {
        [canonicalProductId]: {
          id: canonicalProductId,
          afectacion_igv: '10',
        },
      },
      tasa_impuesto: 0.19,
      payment_snapshot: paymentSnapshot,
      idempotency_key: key,
    };
    const fiscalSnapshotCanonical = JSON.stringify(fiscalSnapshotPayload);
    const fiscalSnapshot = {
      ...fiscalSnapshotPayload,
      sha256: createHash('sha256').update(fiscalSnapshotCanonical).digest('hex'),
    };
    const rpc = jest.fn(async (name: string) => {
      if (name === 'consumir_snapshot_dian_pedido_tx_531') {
        return { data: { state: 'CONSUMED', idempotent: false }, error: null };
      }
      return {
        data: {
          metadata: {
            dian_payment_snapshot: paymentSnapshot,
            dian_fiscal_snapshot: fiscalSnapshot,
          },
          fiscal_snapshot: fiscalSnapshot,
          fiscal_snapshot_canonical: fiscalSnapshotCanonical,
          idempotent: false,
        },
        error: null,
      };
    });
    const create = jest.fn().mockImplementation(async (dto: any) => ({
      id: 'cpe-canonico',
      estado: 'FIRMADO',
      pais: 'CO',
      simulated_origin: false,
      issuer_snapshot: { country_code: 'CO' },
      serie: 'FV',
      numero: 81,
      moneda: dto.moneda,
      fecha_emision: dto.fecha_emision,
      total_venta: dto.total_venta,
    }));
    const taxRate = jest.fn().mockResolvedValue(0.99);
    const service = new CPEIntegrationService(
      { getClient: () => ({ rpc }) } as any,
      { create } as any,
      { validateCertificate: jest.fn().mockResolvedValue({ isValid: true, errors: [], warnings: [] }) } as any,
      {} as any,
      { getTasaIgv: taxRate } as any,
    );
    const staleClient = jest.spyOn(service as any, 'obtenerCliente').mockResolvedValue({
      documento_tipo: 'NIT',
      documento_numero: '9000000001',
      razon_social: 'CLIENTE PRECARGADO OBSOLETO',
    });
    jest.spyOn(service as any, 'obtenerEmpresaConfig').mockResolvedValue({
      ruc: '9010000001',
      razon_social: 'EMISOR PRECARGADO OBSOLETO',
      moneda_defecto: 'COP',
      pais: 'CO',
      is_demo: false,
      dian_resolucion_prefijo: 'ZZ',
    });
    const liveTaxProfiles = jest.spyOn(service as any, 'obtenerAfectacionPorProducto');
    const liveCosts = jest.spyOn(service as any, 'obtenerCostoPorProducto');
    jest.spyOn(service as any, 'obtenerCpePersistidoParaRespuesta').mockResolvedValue({
      id: 'cpe-canonico',
      tenant_id: pedido.tenant_id,
      estado: 'FIRMADO',
      pais: null,
      simulated_origin: false,
      issuer_snapshot: { country_code: 'CO' },
      serie: 'FV',
      numero: 81,
      moneda: 'COP',
      fecha_emision: paymentSnapshot.fecha_emision,
      total_venta: 238,
    });
    jest.spyOn(service as any, 'registrarErrorIntegracion').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'registrarExitoIntegracion').mockResolvedValue(undefined);

    await expect(service.generarFacturaDesdePedido(pedido, pedido.tenant_id))
      .resolves.toEqual(expect.objectContaining({
        factura_id: 'cpe-canonico',
        total: 238,
        moneda: 'COP',
      }));

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      idempotency_key: key,
      ruc_emisor: '9012345671',
      razon_social_emisor: 'EMISOR CANÓNICO CO SAS',
      documento_receptor: '9001234568',
      razon_social_receptor: 'CLIENTE CANÓNICO DESPUÉS DEL UPDATE SAS',
      total_gravadas: 200,
      total_igv: 38,
      total_venta: 238,
      items: [expect.objectContaining({
        pedido_detalle_id: 'detalle-canonico',
        descripcion: 'Producto canónico concurrente',
        cantidad: 2,
        precio_unitario: 100,
      })],
    }), pedido.tenant_id, undefined, { pedidoFiscalOwnerId: pedido.id });
    expect(create.mock.calls[0][0]).not.toHaveProperty('costo_ventas');
    expect(staleClient).not.toHaveBeenCalled();
    expect(taxRate).not.toHaveBeenCalled();
    expect(liveTaxProfiles).not.toHaveBeenCalled();
    expect(liveCosts).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith('consumir_snapshot_dian_pedido_tx_531', {
      p_tenant_id: pedido.tenant_id,
      p_pedido_id: pedido.id,
      p_idempotency_key: key,
      p_cpe_id: 'cpe-canonico',
    });
  });

  it('rechaza un snapshot mezclado aunque conserve un SHA-256 con formato válido', async () => {
    const key = 'ventas.cpe.factura:tenant-ruc-text:pedido-ruc-text';
    const payload = {
      version: 1,
      pedido,
      detalle: pedido.detalle,
      cliente: { id: pedido.cliente_id, razon_social: 'CLIENTE ORIGINAL' },
      empresa: { pais: 'CO' },
      productos: {},
      tasa_impuesto: 0.19,
    };
    const canonical = JSON.stringify(payload);
    const snapshotAlterado = {
      ...payload,
      cliente: { id: pedido.cliente_id, razon_social: 'CLIENTE MEZCLADO' },
      sha256: createHash('sha256').update(canonical).digest('hex'),
    };
    const service = new CPEIntegrationService(
      {
        getClient: () => ({
          rpc: jest.fn().mockResolvedValue({
            data: {
              metadata: {},
              fiscal_snapshot: snapshotAlterado,
              fiscal_snapshot_canonical: canonical,
            },
            error: null,
          }),
        }),
      } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect((service as any).congelarPagoDianPedido(
      pedido,
      pedido.tenant_id,
      key,
    )).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PEDIDO_DIAN_FISCAL_SNAPSHOT_INVALID' }),
    });
  });

  it('rechaza términos de pago paralelos que difieren del snapshot fiscal firmado', async () => {
    const key = 'ventas.cpe.factura:tenant-ruc-text:pedido-ruc-text';
    const paymentSnapshot = {
      version: 1,
      idempotency_key: key,
      condicion_pago: 'CONTADO',
      medio_pago: '10',
      plazo_pago_dias: 0,
      fecha_emision: '2026-08-31',
      fecha_vencimiento: '2026-08-31',
    };
    const payload = {
      version: 1,
      pedido,
      detalle: pedido.detalle,
      cliente: { id: pedido.cliente_id, razon_social: 'CLIENTE HASH BOUND' },
      empresa: { pais: 'CO' },
      productos: {},
      tasa_impuesto: 0.19,
      payment_snapshot: paymentSnapshot,
    };
    const canonical = JSON.stringify(payload);
    const fiscalSnapshot = {
      ...payload,
      sha256: createHash('sha256').update(canonical).digest('hex'),
    };
    const service = new CPEIntegrationService(
      {
        getClient: () => ({
          rpc: jest.fn().mockResolvedValue({
            data: {
              metadata: {
                dian_payment_snapshot: { ...paymentSnapshot, medio_pago: '99' },
              },
              fiscal_snapshot: fiscalSnapshot,
              fiscal_snapshot_canonical: canonical,
            },
            error: null,
          }),
        }),
      } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect((service as any).congelarPagoDianPedido(
      pedido,
      pedido.tenant_id,
      key,
    )).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PEDIDO_DIAN_FISCAL_SNAPSHOT_INVALID' }),
    });
  });

  it('reutiliza fecha colombiana y consecutivo al reintentar después de medianoche', async () => {
    jest.useFakeTimers();
    let fiscalSnapshotCanonical = '';
    const row = {
      metadata: {
        dian_payment_intent: {
          condicion_pago: 'CREDITO',
          medio_pago: '42',
          plazo_pago_dias: 30,
          fecha_vencimiento: '2026-09-30',
        },
      } as Record<string, unknown>,
    };
    const freezeRpc = jest.fn(async (name: string, params: any) => {
      if (name === 'abortar_snapshot_dian_pedido_tx_531') {
        return {
          data: {
            state: 'PREPARED',
            released: false,
            reason: 'FISCAL_ARTIFACT_EXISTS',
          },
          error: null,
        };
      }
      if (name === 'consumir_snapshot_dian_pedido_tx_531') {
        return { data: { state: 'CONSUMED', idempotent: false }, error: null };
      }
      expect(name).toBe('congelar_pago_dian_pedido_tx_531');
      if (!row.metadata.dian_payment_snapshot) {
        row.metadata.dian_payment_snapshot = {
          version: 1,
          idempotency_key: params.p_idempotency_key,
          condicion_pago: 'CREDITO',
          medio_pago: '42',
          plazo_pago_dias: 30,
          fecha_emision: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }),
          fecha_vencimiento: '2026-09-30',
        };
        const fiscalSnapshotPayload = {
          version: 1,
          pedido,
          detalle: pedido.detalle,
          cliente: {
            id: pedido.cliente_id,
            tenant_id: pedido.tenant_id,
            documento_tipo: 'NIT',
            documento_numero: '9001234568',
            razon_social: 'CLIENTE PEDIDO CO SAS',
          },
          empresa: {
            ruc: '9012345671',
            razon_social: 'EMISOR PEDIDO CO SAS',
            moneda_defecto: 'COP',
            pais: 'CO',
            is_demo: false,
            dian_resolucion_prefijo: 'FV',
          },
          productos: {
            '58184a08-1dca-4c90-9fc8-4a1222b0fb85': {
              id: '58184a08-1dca-4c90-9fc8-4a1222b0fb85',
              afectacion_igv: '10',
            },
          },
          tasa_impuesto: 0.19,
          payment_snapshot: row.metadata.dian_payment_snapshot,
          idempotency_key: params.p_idempotency_key,
        };
        fiscalSnapshotCanonical = JSON.stringify(fiscalSnapshotPayload);
        row.metadata.dian_fiscal_snapshot = {
          ...fiscalSnapshotPayload,
          sha256: createHash('sha256').update(fiscalSnapshotCanonical).digest('hex'),
        };
      }
      return {
        data: {
          metadata: row.metadata,
          fiscal_snapshot: row.metadata.dian_fiscal_snapshot,
          fiscal_snapshot_canonical: fiscalSnapshotCanonical,
        },
        error: null,
      };
    });
    const supabase = { getClient: () => ({ rpc: freezeRpc }) } as any;
    const calls: Array<{ key: string; fecha: string }> = [];
    const reserved = new Map<string, number>();
    const create = jest.fn(async (dto: any) => {
      const key = dto.idempotency_key;
      const number = reserved.get(key) ?? 77;
      reserved.set(key, number);
      calls.push({ key, fecha: dto.fecha_emision });
      if (calls.length === 1) throw new Error('timeout después de reservar');
      return {
        id: 'cpe-co-retry',
        estado: 'FIRMADO',
        pais: 'CO',
        simulated_origin: false,
        issuer_snapshot: { country_code: 'CO' },
        serie: 'FV',
        numero: number,
        moneda: 'COP',
        fecha_emision: dto.fecha_emision,
        total_venta: dto.total_venta,
      };
    });
    const service = new CPEIntegrationService(
      supabase,
      { create } as any,
      { validateCertificate: jest.fn().mockResolvedValue({ isValid: true, errors: [], warnings: [] }) } as any,
      {} as any,
      { getTasaIgv: jest.fn().mockResolvedValue(0.19) } as any,
    );
    jest.spyOn(service as any, 'obtenerCliente').mockResolvedValue({
      documento_tipo: 'NIT',
      documento_numero: '9001234568',
      razon_social: 'CLIENTE PEDIDO CO SAS',
    });
    jest.spyOn(service as any, 'obtenerEmpresaConfig').mockResolvedValue({
      ruc: '9012345671',
      razon_social: 'EMISOR PEDIDO CO SAS',
      moneda_defecto: 'COP',
      pais: 'CO',
      is_demo: false,
      dian_resolucion_prefijo: 'FV',
    });
    jest.spyOn(service as any, 'obtenerAfectacionPorProducto').mockResolvedValue(new Map());
    jest.spyOn(service as any, 'obtenerCostoPorProducto').mockResolvedValue(new Map());
    jest.spyOn(service as any, 'obtenerCpePersistidoParaRespuesta').mockImplementation(
      async () => ({
        id: 'cpe-co-retry',
        tenant_id: pedido.tenant_id,
        estado: 'FIRMADO',
        pais: null,
        simulated_origin: false,
        issuer_snapshot: { country_code: 'CO' },
        serie: 'FV',
        numero: 77,
        moneda: 'COP',
        fecha_emision: calls.at(-1)?.fecha,
        total_venta: 119,
      }),
    );
    jest.spyOn(service as any, 'registrarErrorIntegracion').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'registrarExitoIntegracion').mockResolvedValue(undefined);
    const key = 'ventas.cpe.factura:tenant-ruc-text:pedido-ruc-text';

    try {
      // 23:59:59 en Bogotá.
      jest.setSystemTime(new Date('2026-09-01T04:59:59.000Z'));
      await expect(service.generarFacturaDesdePedido(pedido, pedido.tenant_id, key))
        .rejects.toThrow('timeout después de reservar');

      // El mismo retry ocurre ya en el siguiente día calendario colombiano.
      jest.setSystemTime(new Date('2026-09-01T05:00:01.000Z'));
      await expect(service.generarFacturaDesdePedido(pedido, pedido.tenant_id, key))
        .resolves.toEqual(expect.objectContaining({
          numero: 77,
          fecha_emision: '2026-08-31',
        }));

      expect(calls).toEqual([
        { key, fecha: '2026-08-31' },
        { key, fecha: '2026-08-31' },
      ]);
      expect(create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ idempotency_key: key, pedido_id: pedido.id }),
        pedido.tenant_id,
        undefined,
        { pedidoFiscalOwnerId: pedido.id },
      );
      expect(create).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ idempotency_key: key, pedido_id: pedido.id }),
        pedido.tenant_id,
        undefined,
        { pedidoFiscalOwnerId: pedido.id },
      );
      expect((row.metadata.dian_payment_snapshot as any)).toEqual(expect.objectContaining({
        idempotency_key: key,
        condicion_pago: 'CREDITO',
        fecha_emision: '2026-08-31',
        fecha_vencimiento: '2026-09-30',
      }));
      expect(freezeRpc).toHaveBeenCalledWith('abortar_snapshot_dian_pedido_tx_531', {
        p_tenant_id: pedido.tenant_id,
        p_pedido_id: pedido.id,
        p_idempotency_key: key,
        p_reason: 'API_CPE_CREATE_FAILED',
      });
      expect(freezeRpc).toHaveBeenCalledWith('consumir_snapshot_dian_pedido_tx_531', {
        p_tenant_id: pedido.tenant_id,
        p_pedido_id: pedido.id,
        p_idempotency_key: key,
        p_cpe_id: 'cpe-co-retry',
      });
    } finally {
      jest.useRealTimers();
    }
  });
});
