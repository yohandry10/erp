import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { CpeService } from './cpe.service';

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ACTOR_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CLIENTE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const ARGENTINA_ISSUER = {
  pais: 'AR',
  moneda: 'ARS',
  ruc: '30710158229',
  razonSocial: 'EMISOR ARGENTINA S.A.',
  arcaPuntoVenta: 12,
  arcaCondicionIva: 'RESPONSABLE_INSCRIPTO',
  isDemo: false,
};

const ARGENTINA_RECEIVER = {
  id: CLIENTE_ID,
  documento_tipo: 'CUIT',
  documento_numero: null,
  numero_documento: null,
  ruc: '30712345671',
  codigo: '30712345671',
  razon_social: 'CLIENTE PAMPA S.A.',
  nombre: null,
  direccion: 'Av. Córdoba 123, CABA',
  arca_condicion_iva: 'MONOTRIBUTO',
};

function queryResult(result: { data: any; error: any }) {
  const query: any = {
    select: jest.fn(),
    eq: jest.fn(),
    maybeSingle: jest.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.maybeSingle.mockResolvedValue(result);
  return query;
}

function buildHarness(receiver = ARGENTINA_RECEIVER) {
  const receiverQuery = queryResult({ data: receiver, error: null });
  const cpeQuery = queryResult({ data: null, error: null });
  const client = {
    from: jest.fn((table: string) => {
      if (table === 'clientes') return receiverQuery;
      if (table === 'cpe') return cpeQuery;
      throw new Error(`Tabla no preparada en la prueba: ${table}`);
    }),
    rpc: jest.fn().mockResolvedValue({ data: 7, error: null }),
  };
  const fiscalAdapter = {
    obtenerCodigoPais: jest.fn().mockResolvedValue('AR'),
    obtenerCotizacionOficialArca: jest.fn().mockResolvedValue({
      monedaArca: 'DOL',
      cotizacion: 1325.75,
      fecha: '20260904',
    }),
    generarYFirmarDocumentoSinTransmitir: jest.fn(),
  };
  const validation = {
    validateCertificate: jest.fn().mockResolvedValue({ isValid: true, warnings: [], errors: [] }),
    validateRucConfiguration: jest.fn().mockResolvedValue({ isValid: true, missingFields: [], errors: [] }),
    validateDocumentBeforeEmission: jest.fn().mockResolvedValue({ isValid: true, warnings: [], errors: [] }),
  };
  const audit = { registrarCambio: jest.fn().mockResolvedValue(undefined) };
  const cache = { onCpeCreated: jest.fn().mockResolvedValue(undefined) };
  const service = new CpeService(
    { getClient: jest.fn(() => client), update: jest.fn() } as any,
    { get: jest.fn() } as any,
    { emit: jest.fn() } as any,
    validation as any,
    audit as any,
    cache as any,
    {} as any,
    fiscalAdapter as any,
    {} as any,
  );
  jest.spyOn(service as any, 'getEmpresaEmisorInfoStrict').mockResolvedValue(ARGENTINA_ISSUER);
  return { service, receiverQuery, client, fiscalAdapter, validation };
}

function uiPayload(overrides: Record<string, unknown> = {}) {
  return {
    tipoComprobante: '01',
    cliente_id: CLIENTE_ID,
    serie: '99999',
    numero: 999999,
    documento_receptor: '00000000000',
    tipo_documento_receptor: 'DNI',
    razon_social_receptor: 'SNAPSHOT MANIPULADO',
    fechaEmision: '2026-09-04',
    moneda: 'ARS',
    items: [{
      codigo: 'SERV-AR-1',
      descripcion: 'Servicio gravado Argentina',
      cantidad: 1,
      precioUnitario: 100,
      valorVenta: 100,
      igv: 21,
      total: 121,
    }],
    totalIgv: 21,
    total: 121,
    idempotencyKey: 'cpe.ar.ui:attempt-1',
    ...overrides,
  };
}

describe('CpeService · creación Argentina desde UI', () => {
  afterEach(() => jest.restoreAllMocks());

  it('toma punto de venta, identidad y condición IVA de maestros tenant-scoped', async () => {
    const { service, receiverQuery, client } = buildHarness();
    const createSpy = jest.spyOn(service, 'create').mockResolvedValue({ id: 'cpe-ar-7' } as any);

    await service.createFromComprobantePayload(uiPayload(), TENANT_ID, ACTOR_ID);

    expect(receiverQuery.eq).toHaveBeenCalledWith('tenant_id', TENANT_ID);
    expect(receiverQuery.eq).toHaveBeenCalledWith('id', CLIENTE_ID);
    expect(client.rpc).toHaveBeenCalledWith('obtener_siguiente_numero_documento', {
      p_tenant_id: TENANT_ID,
      p_tipo_documento: '01',
      p_serie: '00012',
    });
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        serie: '00012',
        numero: 7,
        cliente_id: CLIENTE_ID,
        tipo_documento_receptor: '80',
        documento_receptor: ARGENTINA_RECEIVER.ruc,
        razon_social_receptor: ARGENTINA_RECEIVER.razon_social,
        arca_condicion_iva_emisor: 'RESPONSABLE_INSCRIPTO',
        arca_condicion_iva_receptor: 'MONOTRIBUTO',
      }),
      TENANT_ID,
      ACTOR_ID,
    );
  });

  it('falla cerrado si el cliente maestro no declara condición IVA', async () => {
    const { service } = buildHarness({ ...ARGENTINA_RECEIVER, arca_condicion_iva: null });
    const createSpy = jest.spyOn(service, 'create');

    await expect(
      service.createFromComprobantePayload(uiPayload(), TENANT_ID, ACTOR_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('falla cerrado si el emisor no tiene un punto de venta ARCA válido', async () => {
    const { service } = buildHarness();
    jest.spyOn(service as any, 'getEmpresaEmisorInfoStrict').mockResolvedValue({
      ...ARGENTINA_ISSUER,
      arcaPuntoVenta: 99999,
    });

    await expect(
      service.createFromComprobantePayload(uiPayload(), TENANT_ID, ACTOR_ID),
    ).rejects.toThrow(/punto de venta válido/i);
  });

  it('exige identificar al consumidor final desde el umbral vigente de ARCA', () => {
    const { service } = buildHarness();
    expect(() => (service as any).assertReceptorValido({
      tipo_documento: '01',
      tipo_documento_receptor: '99',
      documento_receptor: '0',
      razon_social_receptor: 'CONSUMIDOR FINAL',
      arca_condicion_iva_receptor: 'CONSUMIDOR_FINAL',
      total_venta: 10_000_000,
    }, 'AR')).toThrow(/exige identificar/i);
  });

  it('admite consumidor final sin identificar sólo debajo del umbral', () => {
    const { service } = buildHarness();
    expect(() => (service as any).assertReceptorValido({
      tipo_documento: '01',
      tipo_documento_receptor: '99',
      documento_receptor: '0',
      razon_social_receptor: 'CONSUMIDOR FINAL',
      arca_condicion_iva_receptor: 'CONSUMIDOR_FINAL',
      total_venta: 9_999_999.99,
    }, 'AR')).not.toThrow();
  });

  it('convierte USD a ARS antes de aplicar el umbral de identificación', () => {
    const { service } = buildHarness();
    expect(() => (service as any).assertReceptorValido({
      tipo_documento: '01',
      tipo_documento_receptor: '99',
      documento_receptor: '0',
      razon_social_receptor: 'CONSUMIDOR FINAL',
      arca_condicion_iva_receptor: 'CONSUMIDOR_FINAL',
      moneda: 'USD',
      tipo_cambio: 1325.75,
      total_venta: 8_000,
    }, 'AR')).toThrow(/exige identificar/i);
  });

  it('normaliza servicios y calcula otros tributos sin confiar en el total del navegador', async () => {
    const { service } = buildHarness();
    const createSpy = jest.spyOn(service, 'create').mockResolvedValue({ id: 'cpe-ar-service' } as any);

    await service.createFromComprobantePayload(uiPayload({
      arcaConcepto: 2,
      arcaFechaServicioDesde: '2026-08-01',
      arcaFechaServicioHasta: '2026-08-31',
      arcaFechaVencimientoPago: '2026-09-10',
      arcaTributos: [{
        id: 2,
        descripcion: 'Percepción provincial',
        base_imponible: 100,
        alicuota: 3,
        importe: 3,
      }],
      total: 124,
    }), TENANT_ID, ACTOR_ID);

    expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({
      arca_concepto: 2,
      arca_fecha_servicio_desde: '2026-08-01',
      arca_fecha_servicio_hasta: '2026-08-31',
      arca_fecha_vencimiento_pago: '2026-09-10',
      total_isc: 3,
      total_venta: 124,
      arca_tributos: [{
        id: 2,
        descripcion: 'Percepción provincial',
        base_imponible: 100,
        alicuota: 3,
        importe: 3,
      }],
    }), TENANT_ID, ACTOR_ID);
  });

  it('rechaza un importe de tributo declarado que no coincide con base por alícuota', async () => {
    const { service } = buildHarness();
    const createSpy = jest.spyOn(service, 'create');

    await expect(service.createFromComprobantePayload(uiPayload({
      arcaTributos: [{
        id: 99,
        descripcion: 'Otro',
        base_imponible: 100,
        alicuota: 3,
        importe: 90,
      }],
    }), TENANT_ID, ACTOR_ID)).rejects.toThrow(/base × alícuota/i);
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('consulta y congela la cotización ARCA sin aceptar un valor del navegador', async () => {
    const { service, fiscalAdapter } = buildHarness();
    const dto = {
      moneda: 'USD',
      tipo_cambio: 1,
      arca_pago_misma_moneda: 'S',
    } as any;

    await (service as any).prepareArgentinaCurrency(dto, TENANT_ID, '2026-09-04');

    expect(fiscalAdapter.obtenerCotizacionOficialArca).toHaveBeenCalledWith(
      'USD',
      '2026-09-04',
      TENANT_ID,
    );
    expect(dto.tipo_cambio).toBe(1325.75);
    expect(dto.arca_pago_misma_moneda).toBe('S');
  });

  it('persiste una muestra Argentina local sin certificado, firma, CAE ni contacto ARCA', async () => {
    const { service, client, fiscalAdapter, validation } = buildHarness();
    jest.spyOn(service as any, 'getEmpresaEmisorInfoStrict').mockResolvedValue({
      ...ARGENTINA_ISSUER,
      isDemo: true,
    });
    validation.validateCertificate.mockResolvedValue({
      isValid: false,
      warnings: [],
      errors: ['No hay certificado'],
    });
    const signerSpy = jest.spyOn(service as any, 'getXmlSigner');
    let persistedPayload: any;
    client.rpc.mockImplementation(async (name: string, args: any) => {
      if (name !== 'emitir_factura_cliente_tx') {
        throw new Error(`RPC no esperada: ${name}`);
      }
      persistedPayload = args.p_cpe;
      return {
        data: {
          cpe: {
            id: 'cpe-demo-ar-local',
            ...args.p_cpe,
            simulated_origin: true,
            issuer_snapshot: { country_code: 'AR' },
            fiscal_authority_evidence: {
              contract_version: 525,
              status: 'SIMULATED',
              authority: 'ARCA',
              country_code: 'AR',
            },
          },
          documento_id: 'documento-demo-ar-local',
          cxc_id: null,
        },
        error: null,
      };
    });

    const result = await service.create({
      tipo_documento: '01',
      serie: '00012',
      numero: 7,
      fecha_emision: '2026-09-04',
      moneda: 'ARS',
      items: [{
        codigo: 'SERV-AR-1',
        descripcion: 'Producto demostración Argentina',
        cantidad: 1,
        precio_unitario: 1000,
        valor_venta: 1000,
        igv: 210,
        afectacion_igv: '10',
      }],
      ruc_emisor: ARGENTINA_ISSUER.ruc,
      razon_social_emisor: ARGENTINA_ISSUER.razonSocial,
      cliente_id: CLIENTE_ID,
      tipo_documento_receptor: '80',
      documento_receptor: ARGENTINA_RECEIVER.ruc,
      razon_social_receptor: ARGENTINA_RECEIVER.razon_social,
      direccion_receptor: ARGENTINA_RECEIVER.direccion,
      total_gravadas: 1000,
      total_igv: 210,
      total_venta: 1210,
      arca_concepto: 1,
      arca_condicion_iva_emisor: 'RESPONSABLE_INSCRIPTO',
      arca_condicion_iva_receptor: 'MONOTRIBUTO',
      idempotency_key: 'cpe.ar.demo:local-artifact',
    } as any, TENANT_ID, ACTOR_ID);

    expect(result.id).toBe('cpe-demo-ar-local');
    expect(validation.validateCertificate).not.toHaveBeenCalled();
    expect(signerSpy).not.toHaveBeenCalled();
    expect(fiscalAdapter.generarYFirmarDocumentoSinTransmitir).not.toHaveBeenCalled();
    expect(fiscalAdapter.obtenerCotizacionOficialArca).not.toHaveBeenCalled();
    expect(persistedPayload.metadata).toEqual(expect.objectContaining({
      pais: 'AR',
      arca_is_demo: true,
      arca_simulado: true,
      arca_fixture_source: 'ERP_DEMO_LOCAL_REPRESENTATION_V1',
      demo_artifact_format: 'ERP_DEMO_CPE_V1',
      demo_artifact_signed: false,
      demo_artifact_integrity: 'SHA-256',
      fiscal_delivery_eligible: false,
    }));
    expect(persistedPayload.xml_firmado).toContain(
      'country="AR" authority="ARCA" fiscalValidity="NONE"',
    );
    expect(persistedPayload.xml_firmado).toContain(
      '<Notice>MUESTRA DEMO SIN TRANSMISION NI VALIDEZ ARCA</Notice>',
    );
    expect(persistedPayload.xml_firmado).not.toContain('Signature');
    expect(persistedPayload.metadata).not.toHaveProperty('arca_cae');
    expect(persistedPayload.hash_firma).toBe(
      createHash('sha256').update(persistedPayload.xml_firmado, 'utf8').digest('hex'),
    );
  });

  it('rechaza USD en una demo Argentina sin consultar la cotización oficial', async () => {
    const { service, fiscalAdapter } = buildHarness();
    jest.spyOn(service as any, 'getEmpresaEmisorInfoStrict').mockResolvedValue({
      ...ARGENTINA_ISSUER,
      isDemo: true,
    });

    await expect(service.create({
      tipo_documento: '01', serie: '00012', numero: 8,
      fecha_emision: '2026-09-04', moneda: 'USD',
      items: [{ cantidad: 1, precio_unitario: 100, valor_venta: 100, igv: 21 }],
      ruc_emisor: ARGENTINA_ISSUER.ruc,
      razon_social_emisor: ARGENTINA_ISSUER.razonSocial,
      tipo_documento_receptor: '80', documento_receptor: ARGENTINA_RECEIVER.ruc,
      razon_social_receptor: ARGENTINA_RECEIVER.razon_social,
      total_gravadas: 100, total_igv: 21, total_venta: 121,
      arca_concepto: 1,
      arca_pago_misma_moneda: 'S',
      arca_condicion_iva_emisor: 'RESPONSABLE_INSCRIPTO',
      arca_condicion_iva_receptor: 'MONOTRIBUTO',
    } as any, TENANT_ID, ACTOR_ID)).rejects.toThrow(/demo sólo admite ARS/i);

    expect(fiscalAdapter.obtenerCotizacionOficialArca).not.toHaveBeenCalled();
  });
});
