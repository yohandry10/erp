import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { CpeService } from './cpe.service';

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ACTOR_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CLIENTE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CUFE = 'a'.repeat(96);

const NATIVE_DIAN_INVOICE = [
  '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"',
  ' xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"',
  ' xmlns:ds="http://www.w3.org/2000/09/xmldsig#">',
  '<cbc:ProfileID>DIAN 2.1: Factura Electrónica de Venta</cbc:ProfileID>',
  '<cbc:CustomizationID>10</cbc:CustomizationID>',
  `<cbc:UUID schemeName="CUFE-SHA384">${CUFE}</cbc:UUID>`,
  '<ds:Signature><ds:SignedInfo /></ds:Signature>',
  '</Invoice>',
].join('');

const VALID_RECEIVER = {
  id: CLIENTE_ID,
  documento_tipo: 'NIT',
  documento_numero: '9001234568',
  numero_documento: null,
  ruc: null,
  razon_social: 'CLIENTE MAESTRO CO SAS',
  nombre: null,
  direccion: 'Carrera 7 # 10-20, Bogotá',
  dian_perfil_fiscal: 'ADQUIRIENTE_NIT_B2B',
  dian_responsabilidad_fiscal: 'O-99',
  dian_responsabilidad_list_name: '04',
  dian_tributo_id: '01',
  dian_tributo_nombre: 'IVA',
};

const REAL_CO_ISSUER = {
  pais: 'CO',
  moneda: 'COP',
  igvPorcentaje: 19,
  ruc: '9001234568',
  razonSocial: 'EMISOR CO SAS',
  direccion: 'Calle 1 # 2-3, Bogotá',
  ciudad: 'Bogotá, D.C.',
  departamento: 'Bogotá, D.C.',
  codigoUbigeo: '11001',
  regimenFiscal: '48',
  tipoContribuyente: '1',
  dianResolucionNumero: '187640000001',
  dianResolucionPrefijo: 'FVCO',
  dianResolucionDesde: 1,
  dianResolucionHasta: 999999,
  dianResolucionFechaInicio: '2026-01-01',
  dianResolucionFechaFin: '2026-12-31',
  certificateSha256: 'c'.repeat(64),
  signingConfigSha256: 'd'.repeat(64),
  isDemo: false,
};

const VALID_RESERVATION_CONTEXT = {
  resolucion_numero: REAL_CO_ISSUER.dianResolucionNumero,
  rango_desde: REAL_CO_ISSUER.dianResolucionDesde,
  rango_hasta: REAL_CO_ISSUER.dianResolucionHasta,
  vigencia_desde: REAL_CO_ISSUER.dianResolucionFechaInicio,
  vigencia_hasta: REAL_CO_ISSUER.dianResolucionFechaFin,
};

const VALID_PREFLIGHT_CONTEXT = {
  environmentId: '2' as const,
  software: { id: 'software-id', pin: 'software-pin-secret' },
  authorization: {
    number: REAL_CO_ISSUER.dianResolucionNumero,
    prefix: REAL_CO_ISSUER.dianResolucionPrefijo,
    rangeFrom: REAL_CO_ISSUER.dianResolucionDesde,
    rangeTo: REAL_CO_ISSUER.dianResolucionHasta,
    validFrom: REAL_CO_ISSUER.dianResolucionFechaInicio,
    validTo: REAL_CO_ISSUER.dianResolucionFechaFin,
    technicalKey: 'technical-key-secret',
  },
  taxes: { iva: 19, inc: 0, ica: 0 },
};

function queryResult(result: { data: any; error: any }) {
  const query: any = {
    select: jest.fn(),
    eq: jest.fn(),
    maybeSingle: jest.fn(),
    single: jest.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.maybeSingle.mockResolvedValue(result);
  query.single.mockResolvedValue(result);
  return query;
}

function buildHarness(options: {
  receiver?: any;
  cpe?: any;
  country?: string;
  ventaPos?: any;
} = {}) {
  const receiverQuery = queryResult({
    data: options.receiver === undefined ? VALID_RECEIVER : options.receiver,
    error: null,
  });
  const cpeQuery = queryResult({ data: options.cpe ?? null, error: null });
  const countryQuery = queryResult({
    data: { pais_id: null, pais: options.country ?? 'CO' },
    error: null,
  });
  const ventaPosQuery = queryResult({ data: options.ventaPos ?? null, error: null });
  const client = {
    from: jest.fn((table: string) => {
      if (table === 'clientes') return receiverQuery;
      if (table === 'cpe') return cpeQuery;
      if (table === 'empresa_config') return countryQuery;
      if (table === 'ventas_pos') return ventaPosQuery;
      throw new Error(`Tabla no preparada en la prueba: ${table}`);
    }),
    rpc: jest.fn().mockResolvedValue({
      data: {
        prefijo: 'FVCO', correlativo: 7,
        fecha_emision: '2026-08-30', hora_emision: '14:23:45',
        ...VALID_RESERVATION_CONTEXT,
      },
      error: null,
    }),
  };
  const supabase = {
    getClient: jest.fn(() => client),
    update: jest.fn(),
  };
  const validation = {
    validateCertificate: jest.fn().mockResolvedValue({ isValid: true, warnings: [], errors: [] }),
    validateRucConfiguration: jest.fn().mockResolvedValue({ isValid: true, missingFields: [], errors: [] }),
    validateDocumentBeforeEmission: jest.fn().mockResolvedValue({ isValid: true, warnings: [], errors: [] }),
  };
  const fiscalAdapter = {
    obtenerCodigoPais: jest.fn().mockResolvedValue(options.country ?? 'CO'),
    prepararContextoDianFacturaAntesDeReserva: jest.fn()
      .mockResolvedValue(VALID_PREFLIGHT_CONTEXT),
    generarYFirmarDocumentoSinTransmitir: jest.fn(),
  };
  const eventBus = {
    emit: jest.fn(),
    emitComprobanteCreadoEvent: jest.fn(),
    emitFacturaEmitidaEvent: jest.fn(),
  };
  const audit = { registrarCambio: jest.fn().mockResolvedValue(undefined) };
  const cache = { onCpeCreated: jest.fn().mockResolvedValue(undefined) };
  const service = new CpeService(
    supabase as any,
    { get: jest.fn() } as any,
    eventBus as any,
    validation as any,
    audit as any,
    cache as any,
    {} as any,
    fiscalAdapter as any,
    { codigoEstablecimientoDeSerie: jest.fn().mockResolvedValue('0000') } as any,
  );
  return {
    service,
    client,
    receiverQuery,
    cpeQuery,
    countryQuery,
    ventaPosQuery,
    validation,
    fiscalAdapter,
  };
}

function uiPayload(overrides: Record<string, unknown> = {}) {
  return {
    tipoComprobante: '01',
    cliente_id: CLIENTE_ID,
    serie: 'BROWSER',
    numero: 999999,
    documento_receptor: '1111111111',
    tipo_documento_receptor: 'CC',
    razon_social_receptor: 'SNAPSHOT MANIPULADO',
    direccion_receptor: 'Dirección manipulada',
    fechaEmision: '2026-08-31',
    moneda: 'COP',
    items: [{
      codigo: 'SKU-CO-1',
      descripcion: 'Servicio gravado Colombia',
      cantidad: 1,
      precioUnitario: 100,
      valorVenta: 100,
      igv: 19,
      total: 119,
    }],
    totalGravadas: 100,
    totalIgv: 19,
    total: 119,
    condicionPago: 'CONTADO',
    medioPago: '10',
    idempotencyKey: 'cpe.co.ui:tenant:attempt-1',
    ...overrides,
  };
}

function creationDto(overrides: Record<string, unknown> = {}) {
  return {
    tipo_documento: '01',
    serie: 'FVCO',
    numero: 7,
    fecha_emision: '2026-08-30',
    fecha_vencimiento: '2026-08-30',
    moneda: 'COP',
    items: [{
      codigo: 'SKU-CO-1',
      descripcion: 'Servicio gravado Colombia',
      cantidad: 1,
      precio_unitario: 100,
      valor_venta: 100,
      igv: 19,
      precio_venta: 119,
      afectacion_igv: '10',
      tipo_afectacion_igv: '10',
    }],
    ruc_emisor: REAL_CO_ISSUER.ruc,
    razon_social_emisor: REAL_CO_ISSUER.razonSocial,
    direccion_emisor: REAL_CO_ISSUER.direccion,
    cliente_id: CLIENTE_ID,
    tipo_documento_receptor: 'NIT',
    documento_receptor: VALID_RECEIVER.documento_numero,
    razon_social_receptor: VALID_RECEIVER.razon_social,
    direccion_receptor: VALID_RECEIVER.direccion,
    total_gravadas: 100,
    total_igv: 19,
    total_venta: 119,
    condicion_pago: 'CONTADO',
    medio_pago: '10',
    plazo_pago_dias: 0,
    idempotency_key: 'cpe.co.real:7',
    ...overrides,
  } as any;
}

describe('CpeService · creación Colombia', () => {
  afterEach(() => jest.restoreAllMocks());

  it('hidrata el receptor desde el cliente del tenant e ignora el snapshot manipulable del navegador', async () => {
    const { service, receiverQuery } = buildHarness();
    jest.spyOn(service as any, 'getEmpresaEmisorInfoStrict').mockResolvedValue(REAL_CO_ISSUER);
    const createSpy = jest.spyOn(service, 'create').mockResolvedValue({ id: 'cpe-co-7' } as any);

    await service.createFromComprobantePayload(uiPayload(), TENANT_ID, ACTOR_ID);

    expect(receiverQuery.eq).toHaveBeenCalledWith('tenant_id', TENANT_ID);
    expect(receiverQuery.eq).toHaveBeenCalledWith('id', CLIENTE_ID);
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        serie: 'FVCO',
        cliente_id: CLIENTE_ID,
        tipo_documento_receptor: '31',
        documento_receptor: VALID_RECEIVER.documento_numero,
        razon_social_receptor: VALID_RECEIVER.razon_social,
        direccion_receptor: VALID_RECEIVER.direccion,
      }),
      TENANT_ID,
      ACTOR_ID,
    );
  });

  it('reconcilia un reintento por Idempotency-Key y delega una sola reserva al núcleo', async () => {
    const { service, client, cpeQuery } = buildHarness();
    jest.spyOn(service as any, 'getEmpresaEmisorInfoStrict').mockResolvedValue(REAL_CO_ISSUER);
    cpeQuery.maybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { serie: 'SETP', numero: 345 }, error: null });
    const createSpy = jest.spyOn(service, 'create')
      .mockResolvedValue({ id: 'same-cpe-intent' } as any);
    const payload = uiPayload({ idempotencyKey: undefined });

    const first = await service.createFromComprobantePayload(
      payload,
      TENANT_ID,
      ACTOR_ID,
      'cpe-ui-stable-header-345',
    );
    const retry = await service.createFromComprobantePayload(
      payload,
      TENANT_ID,
      ACTOR_ID,
      'cpe-ui-stable-header-345',
    );

    expect(first.id).toBe('same-cpe-intent');
    expect(retry.id).toBe('same-cpe-intent');
    expect(client.rpc).not.toHaveBeenCalled();
    expect(createSpy).toHaveBeenCalledTimes(2);
    expect(createSpy.mock.calls[0][0]).toEqual(expect.objectContaining({
      serie: 'FVCO',
      numero: 0,
      idempotency_key: 'cpe-ui-stable-header-345',
    }));
    expect(createSpy.mock.calls[1][0]).toEqual(expect.objectContaining({
      serie: 'SETP',
      numero: 345,
      idempotency_key: 'cpe-ui-stable-header-345',
    }));
  });

  it('rechaza una clave del header distinta de la intención del body', async () => {
    const { service, client } = buildHarness();
    jest.spyOn(service as any, 'getEmpresaEmisorInfoStrict').mockResolvedValue(REAL_CO_ISSUER);
    const createSpy = jest.spyOn(service, 'create');

    await expect(service.createFromComprobantePayload(
      uiPayload({ idempotencyKey: 'body-intent' }),
      TENANT_ID,
      ACTOR_ID,
      'header-intent',
    )).rejects.toThrow('Idempotency-Key no coincide');

    expect(client.rpc).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('rechaza un cliente que no existe dentro del tenant aunque el navegador envíe un snapshot completo', async () => {
    const { service, receiverQuery } = buildHarness({ receiver: null });
    jest.spyOn(service as any, 'getEmpresaEmisorInfoStrict').mockResolvedValue(REAL_CO_ISSUER);
    const createSpy = jest.spyOn(service, 'create');

    await expect(
      service.createFromComprobantePayload(uiPayload(), TENANT_ID, ACTOR_ID),
    ).rejects.toThrow('el cliente no existe dentro de esta empresa');

    expect(receiverQuery.eq).toHaveBeenCalledWith('tenant_id', TENANT_ID);
    expect(receiverQuery.eq).toHaveBeenCalledWith('id', CLIENTE_ID);
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('rechaza un perfil tributario maestro incompleto antes de crear el CPE', async () => {
    const { service } = buildHarness({
      receiver: { ...VALID_RECEIVER, dian_tributo_id: null },
    });
    jest.spyOn(service as any, 'getEmpresaEmisorInfoStrict').mockResolvedValue(REAL_CO_ISSUER);
    const createSpy = jest.spyOn(service, 'create');

    await expect(
      service.createFromComprobantePayload(uiPayload(), TENANT_ID, ACTOR_ID),
    ).rejects.toThrow('perfil tributario coherente');
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('rechaza en la frontera de persistencia un receptor que diverge del maestro tenant-scoped', async () => {
    const { service } = buildHarness();
    jest.spyOn(service as any, 'getEmpresaEmisorInfoStrict').mockResolvedValue(REAL_CO_ISSUER);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(service.create(creationDto({
      razon_social_receptor: 'OTRA RAZÓN SOCIAL INYECTADA',
    }), TENANT_ID, ACTOR_ID)).rejects.toThrow(
      'el receptor del comprobante no coincide con el cliente maestro del tenant',
    );
  });

  it('rechaza antes de firmar si el emisor cambió después del snapshot comercial', async () => {
    const { service, client } = buildHarness();
    jest.spyOn(service as any, 'getEmpresaEmisorInfoStrict').mockResolvedValue({
      ...REAL_CO_ISSUER,
      razonSocial: 'EMISOR ACTUALIZADO CO SAS',
    });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(service.create(
      creationDto(),
      TENANT_ID,
      ACTOR_ID,
    )).rejects.toThrow(
      'el emisor del comprobante no coincide con la configuración fiscal vigente del tenant',
    );

    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('rechaza antes de reservar si el perfil tributario congelado cambió en el maestro', async () => {
    const { service, client } = buildHarness();
    jest.spyOn(service as any, 'getEmpresaEmisorInfoStrict').mockResolvedValue(REAL_CO_ISSUER);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(service.create(creationDto({
      dian_receptor_tax_profile: {
        profile: 'CONSUMIDOR_FINAL',
        taxLevelCode: 'R-99-PN',
        taxLevelListName: '49',
        taxSchemeId: 'ZY',
        taxSchemeName: 'No causa',
      },
    }), TENANT_ID, ACTOR_ID)).rejects.toThrow(
      'el perfil tributario congelado del receptor no coincide con el cliente maestro',
    );

    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('no consume numeración DIAN cuando falla una validación previa', async () => {
    const { service, client, validation } = buildHarness();
    jest.spyOn(service as any, 'getEmpresaEmisorInfoStrict').mockResolvedValue(REAL_CO_ISSUER);
    validation.validateCertificate.mockResolvedValue({
      isValid: false,
      warnings: [],
      errors: ['Certificado de prueba inválido'],
    });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(service.create(
      creationDto(),
      TENANT_ID,
      ACTOR_ID,
    )).rejects.toThrow('Certificado digital inválido');

    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('no reserva correlativo cuando GetNumberingRange o TechnicalKey fallan en el preflight', async () => {
    const { service, client, fiscalAdapter } = buildHarness();
    jest.spyOn(service as any, 'loadDianCreationContext').mockResolvedValue({
      emisor: REAL_CO_ISSUER,
      receiver: {
        id: CLIENTE_ID,
        documentoTipo: 'NIT',
        documentoNumero: VALID_RECEIVER.documento_numero,
        razonSocial: VALID_RECEIVER.razon_social,
        direccion: VALID_RECEIVER.direccion,
        dianTaxProfile: {
          profile: 'ADQUIRIENTE_NIT_B2B', taxLevelCode: 'O-99',
          taxLevelListName: '04', taxSchemeId: '01', taxSchemeName: 'IVA',
        },
      },
    });
    fiscalAdapter.prepararContextoDianFacturaAntesDeReserva.mockRejectedValue(
      new Error('GetNumberingRange sin TechnicalKey'),
    );
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(service.create(
      creationDto({ idempotency_key: 'cpe.co.preflight:range-failure' }),
      TENANT_ID,
      ACTOR_ID,
    )).rejects.toThrow('no se pudo validar la autorización oficial antes de reservar');

    expect(client.rpc).not.toHaveBeenCalledWith(
      'reservar_numeracion_dian_ui_tx',
      expect.anything(),
    );
    expect(fiscalAdapter.generarYFirmarDocumentoSinTransmitir).not.toHaveBeenCalled();
  });

  it('retorna un CPE directo ya completado antes de releer maestros, DIAN o firmar', async () => {
    const { service, client, cpeQuery, fiscalAdapter } = buildHarness();
    const dto = creationDto({ idempotency_key: 'cpe.co.completed:retry-1' });
    const fingerprint = (service as any).buildDirectDianRequestFingerprint(dto, TENANT_ID);
    cpeQuery.maybeSingle.mockResolvedValue({
      data: {
        id: 'cpe-completed-1', tenant_id: TENANT_ID, tipo_documento: '01',
        serie: 'FVCO', numero: 77, ruc_emisor: REAL_CO_ISSUER.ruc,
        razon_social_emisor: REAL_CO_ISSUER.razonSocial,
        tipo_documento_receptor: '31', documento_receptor: VALID_RECEIVER.documento_numero,
        razon_social_receptor: VALID_RECEIVER.razon_social,
        direccion_receptor: VALID_RECEIVER.direccion, moneda: 'COP', items: dto.items,
        total_gravadas: 100, total_igv: 19, total_venta: 119, estado: 'FIRMADO',
        hash: 'e'.repeat(64), hash_firma: 'e'.repeat(64),
        xml_firmado: NATIVE_DIAN_INVOICE, cdr_sunat: null, error_message: null,
        created_by: ACTOR_ID,
        metadata: { pais: 'CO', dian_direct_request_fingerprint: fingerprint },
        documento_id: 'doc-completed-1',
        created_at: '2026-08-30T19:23:45.000Z', updated_at: '2026-08-30T19:23:45.000Z',
      },
      error: null,
    });
    const mastersSpy = jest.spyOn(service as any, 'loadDianCreationContext');

    const result = await service.create(dto, TENANT_ID, ACTOR_ID);

    expect(result.id).toBe('cpe-completed-1');
    expect(mastersSpy).not.toHaveBeenCalled();
    expect(fiscalAdapter.prepararContextoDianFacturaAntesDeReserva).not.toHaveBeenCalled();
    expect(fiscalAdapter.generarYFirmarDocumentoSinTransmitir).not.toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['otro actor', 'ffffffff-ffff-4fff-8fff-ffffffffffff', creationDto()],
    ['payload divergente', ACTOR_ID, creationDto({ total_venta: 120 })],
  ])('no usa la key completada como lookup lateral: %s', async (_scenario, owner, retryDto) => {
    const { service, client, cpeQuery } = buildHarness();
    const original = creationDto({ idempotency_key: 'cpe.co.completed:protected' });
    const fingerprint = (service as any).buildDirectDianRequestFingerprint(original, TENANT_ID);
    cpeQuery.maybeSingle.mockResolvedValue({
      data: {
        id: 'cpe-protected', tenant_id: TENANT_ID, tipo_documento: '01',
        serie: 'FVCO', numero: 78, hash: 'f'.repeat(64), hash_firma: 'f'.repeat(64),
        xml_firmado: NATIVE_DIAN_INVOICE, created_by: owner,
        metadata: { pais: 'CO', dian_direct_request_fingerprint: fingerprint },
      },
      error: null,
    });

    await expect(service.create({
      ...retryDto,
      idempotency_key: 'cpe.co.completed:protected',
    }, TENANT_ID, ACTOR_ID)).rejects.toThrow(
      'la intención idempotente ya pertenece a otro actor o a un payload distinto',
    );
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('un retry exacto tras fallo de firma reutiliza correlativo y hora sin contexto divergente', async () => {
    const { service, client, fiscalAdapter } = buildHarness();
    jest.spyOn(service as any, 'loadDianCreationContext').mockResolvedValue({
      emisor: REAL_CO_ISSUER,
      receiver: {
        id: CLIENTE_ID,
        documentoTipo: 'NIT',
        documentoNumero: VALID_RECEIVER.documento_numero,
        razonSocial: VALID_RECEIVER.razon_social,
        direccion: VALID_RECEIVER.direccion,
        dianTaxProfile: {
          profile: 'ADQUIRIENTE_NIT_B2B', taxLevelCode: 'O-99',
          taxLevelListName: '04', taxSchemeId: '01', taxSchemeName: 'IVA',
        },
      },
    });
    fiscalAdapter.generarYFirmarDocumentoSinTransmitir
      .mockRejectedValueOnce(new Error('firma temporalmente no disponible'))
      .mockResolvedValueOnce(NATIVE_DIAN_INVOICE);
    client.rpc.mockImplementation(async (name: string, args: any) => {
      if (name === 'reservar_numeracion_dian_ui_tx') {
        return {
          data: {
            prefijo: 'FVCO', correlativo: 91,
            fecha_emision: '2026-08-30', hora_emision: '14:23:45',
            ...VALID_RESERVATION_CONTEXT,
          },
          error: null,
        };
      }
      return {
        data: {
          cpe: { id: 'cpe-retry-91', ...args.p_cpe },
          documento_id: 'doc-retry-91', cxc_id: null,
        },
        error: null,
      };
    });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(service.create(creationDto({
      idempotency_key: 'cpe.co.signing:retry-91',
    }), TENANT_ID, ACTOR_ID)).rejects.toThrow('firma temporalmente no disponible');
    const result = await service.create(creationDto({
      idempotency_key: 'cpe.co.signing:retry-91',
    }), TENANT_ID, ACTOR_ID);

    expect(result.id).toBe('cpe-retry-91');
    const reservations = client.rpc.mock.calls.filter(
      ([name]: [string]) => name === 'reservar_numeracion_dian_ui_tx',
    );
    expect(reservations).toHaveLength(2);
    expect(reservations[0][1].p_intent_fingerprint)
      .toBe(reservations[1][1].p_intent_fingerprint);
    const generated = fiscalAdapter.generarYFirmarDocumentoSinTransmitir.mock.calls;
    expect(generated).toHaveLength(2);
    expect(generated[0][0].numero).toBe('91');
    expect(generated[1][0].numero).toBe('91');
    expect(generated[0][0].fechaEmision).toBe('2026-08-30T14:23:45-05:00');
    expect(generated[1][0].fechaEmision).toBe('2026-08-30T14:23:45-05:00');
    expect(generated[0][0].dianContext).toEqual(VALID_PREFLIGHT_CONTEXT);
    expect(generated[1][0].dianContext).toEqual(VALID_PREFLIGHT_CONTEXT);
  });

  it('el endpoint visual tampoco consume numeración cuando falla el certificado', async () => {
    const { service, client, validation } = buildHarness();
    jest.spyOn(service as any, 'getEmpresaEmisorInfoStrict').mockResolvedValue(REAL_CO_ISSUER);
    validation.validateCertificate.mockResolvedValue({
      isValid: false,
      warnings: [],
      errors: ['Certificado visual inválido'],
    });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(service.createFromComprobantePayload(
      uiPayload({ idempotencyKey: 'cpe.co.ui:invalid-cert' }),
      TENANT_ID,
      ACTOR_ID,
    )).rejects.toThrow('Certificado digital inválido');

    expect(client.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['snake_case', {
      condicion_pago: 'CREDITO', medio_pago: '2', plazo_pago_dias: 30,
      fecha_emision: '2026-08-31',
    }],
    ['camelCase', {
      condicionPago: 'CREDITO', medioPago: 'CREDITO', plazoPagoDias: 30,
      fechaEmision: '2026-08-31',
    }],
  ])('normaliza crédito genérico %s al catálogo DIAN y calcula el vencimiento', async (_label, creditFields) => {
    const { service } = buildHarness();
    jest.spyOn(service as any, 'getEmpresaEmisorInfoStrict').mockResolvedValue(REAL_CO_ISSUER);
    const createSpy = jest.spyOn(service, 'create').mockResolvedValue({ id: 'cpe-credit' } as any);

    await service.createFromComprobantePayload(
      uiPayload({
        condicionPago: undefined,
        medioPago: undefined,
        ...creditFields,
      }),
      TENANT_ID,
      ACTOR_ID,
    );

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        condicion_pago: 'CREDITO',
        medio_pago: '1',
        plazo_pago_dias: 30,
        fecha_emision: '2026-08-31',
        fecha_vencimiento: '2026-09-30',
      }),
      TENANT_ID,
      ACTOR_ID,
    );
  });

  it('preserva el medio DIAN explícito cuando el crédito sí trae instrumento definido', async () => {
    const { service } = buildHarness();
    jest.spyOn(service as any, 'getEmpresaEmisorInfoStrict').mockResolvedValue(REAL_CO_ISSUER);
    const createSpy = jest.spyOn(service, 'create').mockResolvedValue({ id: 'cpe-credit-42' } as any);

    await service.createFromComprobantePayload(
      uiPayload({
        condicionPago: 'CREDITO',
        medioPago: '42',
        plazoPagoDias: 30,
        fechaEmision: '2026-08-31',
        fechaVencimiento: '2026-09-30',
      }),
      TENANT_ID,
      ACTOR_ID,
    );

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        condicion_pago: 'CREDITO',
        medio_pago: '42',
        plazo_pago_dias: 30,
        fecha_vencimiento: '2026-09-30',
      }),
      TENANT_ID,
      ACTOR_ID,
    );
  });

  it('preserva en la entrada UI la afectación de cada línea y deriva las bases sin usar el total global', async () => {
    const { service } = buildHarness();
    jest.spyOn(service as any, 'getEmpresaEmisorInfoStrict').mockResolvedValue(REAL_CO_ISSUER);
    const createSpy = jest.spyOn(service, 'create').mockResolvedValue({ id: 'cpe-mixed-ui' } as any);

    await service.createFromComprobantePayload(uiPayload({
      items: [
        {
          codigo: 'GRAVADO', descripcion: 'Gravado', cantidad: 1,
          valorUnitario: 100, valorVenta: 100, igv: 19, total: 119,
          afectacion_igv: '10',
        },
        {
          codigo: 'EXENTO', descripcion: 'Exento', cantidad: 1,
          valorUnitario: 100, valorVenta: 100, igv: 0, total: 100,
          tipoAfectacionIgv: '20',
        },
        {
          codigo: 'EXCLUIDO', descripcion: 'Excluido', cantidad: 1,
          valorUnitario: 100, valorVenta: 100, igv: 0, total: 100,
          afectacionIgv: '30',
        },
      ],
      total: 319,
      totalIgv: 19,
    }), TENANT_ID, ACTOR_ID);

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        total_gravadas: 100,
        total_exoneradas: 100,
        total_inafectas: 100,
        total_igv: 19,
        total_venta: 319,
        items: [
          expect.objectContaining({ afectacion_igv: '10', tipo_afectacion_igv: '10' }),
          expect.objectContaining({ afectacion_igv: '20', tipo_afectacion_igv: '20' }),
          expect.objectContaining({ afectacion_igv: '30', tipo_afectacion_igv: '30' }),
        ],
      }),
      TENANT_ID,
      ACTOR_ID,
    );
  });

  it.each([
    ['anterior a la emisión', '2026-08-30', 30],
    ['distinto al plazo declarado', '2026-09-29', 30],
    ['sin plazo positivo', '2026-08-31', 0],
  ])('rechaza vencimiento %s', async (_scenario, dueDate, termDays) => {
    const { service } = buildHarness();
    jest.spyOn(service as any, 'getEmpresaEmisorInfoStrict').mockResolvedValue(REAL_CO_ISSUER);
    const createSpy = jest.spyOn(service, 'create');

    await expect(service.createFromComprobantePayload(uiPayload({
      condicionPago: 'CREDITO',
      medioPago: '42',
      plazoPagoDias: termDays,
      fechaEmision: '2026-08-31',
      fechaVencimiento: dueDate,
    }), TENANT_ID, ACTOR_ID)).rejects.toThrow(BadRequestException);
    expect(createSpy).not.toHaveBeenCalled();
  });

  it.each([
    ['intención idempotente', ACTOR_ID, undefined],
    ['actor autenticado', undefined, 'cpe.co.ui:tenant:attempt-actor-missing'],
  ])('una empresa CO real exige %s para emitir', async (
    _requirement,
    actorId,
    idempotencyKey,
  ) => {
    const { service, client } = buildHarness();
    jest.spyOn(service as any, 'getEmpresaEmisorInfoStrict').mockResolvedValue(REAL_CO_ISSUER);
    const createSpy = jest.spyOn(service, 'create');

    await expect(service.createFromComprobantePayload(uiPayload({
      idempotencyKey,
    }), TENANT_ID, actorId)).rejects.toThrow(
      'la emisión exige actor e intención idempotente autenticados',
    );

    expect(client.rpc).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('ignora serie y número del navegador y deja la reserva al núcleo después de validar', async () => {
    const { service, client } = buildHarness();
    jest.spyOn(service as any, 'getEmpresaEmisorInfoStrict').mockResolvedValue(REAL_CO_ISSUER);
    const fallbackNumberSpy = jest.spyOn(service as any, 'resolveNumeroCpe');
    const createSpy = jest.spyOn(service, 'create').mockResolvedValue({ id: 'cpe-reserved' } as any);
    await service.createFromComprobantePayload(uiPayload({
      serie: 'EVIL',
      numero: 99999999,
      idempotencyKey: 'cpe.co.ui:tenant:reservation-345',
    }), TENANT_ID, ACTOR_ID);

    expect(client.rpc).not.toHaveBeenCalled();
    expect(fallbackNumberSpy).not.toHaveBeenCalled();
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        serie: 'FVCO',
        numero: 0,
        idempotency_key: 'cpe.co.ui:tenant:reservation-345',
      }),
      TENANT_ID,
      ACTOR_ID,
    );
  });

  it('acepta una resolución DIAN sin prefijo y conserva sólo el consecutivo fiscal', async () => {
    const { service, client } = buildHarness();
    jest.spyOn(service as any, 'getEmpresaEmisorInfoStrict').mockResolvedValue({
      ...REAL_CO_ISSUER,
      dianResolucionPrefijo: '',
    });
    const createSpy = jest.spyOn(service, 'create').mockResolvedValue({ id: 'cpe-no-prefix' } as any);
    await service.createFromComprobantePayload(uiPayload({
      serie: 'EVIL',
      numero: 99999999,
      idempotencyKey: 'cpe.co.ui:no-prefix:345',
    }), TENANT_ID, ACTOR_ID);

    expect(() => (service as any).assertSerieCoherenteConTipo(
      { tipo_documento: '01', serie: '' },
      'CO',
    )).not.toThrow();
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        serie: '',
        numero: 0,
        idempotency_key: 'cpe.co.ui:no-prefix:345',
      }),
      TENANT_ID,
      ACTOR_ID,
    );
  });

  it('una demo CO no consume la reserva DIAN y conserva la numeración local simulada', async () => {
    const { service, client } = buildHarness();
    jest.spyOn(service as any, 'getEmpresaEmisorInfoStrict').mockResolvedValue({
      ...REAL_CO_ISSUER,
      isDemo: true,
    });
    const fallbackNumberSpy = jest.spyOn(service as any, 'resolveNumeroCpe').mockResolvedValue(44);
    const createSpy = jest.spyOn(service, 'create').mockResolvedValue({ id: 'cpe-demo-44' } as any);

    await service.createFromComprobantePayload(uiPayload({
      serie: 'HACK',
      numero: 123456,
      idempotencyKey: 'cpe.co.demo:44',
    }), TENANT_ID, ACTOR_ID);

    expect(client.rpc).not.toHaveBeenCalled();
    expect(fallbackNumberSpy).toHaveBeenCalledWith(TENANT_ID, '01', 'FVCO', 123456);
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ serie: 'FVCO', numero: 44 }),
      TENANT_ID,
      ACTOR_ID,
    );
  });

  it('persiste una representación demo CO sin certificado ni firma fiscal', async () => {
    const { service, client, validation, fiscalAdapter } = buildHarness();
    const demoIssuer = { ...REAL_CO_ISSUER, isDemo: true };
    jest.spyOn(service as any, 'loadDianCreationContext').mockResolvedValue({
      emisor: demoIssuer,
      receiver: {
        id: CLIENTE_ID,
        documentoTipo: 'NIT',
        documentoNumero: VALID_RECEIVER.documento_numero,
        razonSocial: VALID_RECEIVER.razon_social,
        direccion: VALID_RECEIVER.direccion,
        dianTaxProfile: {
          profile: 'ADQUIRIENTE_NIT_B2B', taxLevelCode: 'O-99',
          taxLevelListName: '04', taxSchemeId: '01', taxSchemeName: 'IVA',
        },
      },
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
            id: 'cpe-demo-co-local',
            ...args.p_cpe,
            simulated_origin: true,
            fiscal_authority_evidence: {
              contract_version: 525,
              status: 'SIMULATED',
              authority: 'DIAN',
              country_code: 'CO',
            },
          },
          documento_id: 'documento-demo-co-local',
          cxc_id: null,
        },
        error: null,
      };
    });

    const result = await service.create(
      creationDto({ idempotency_key: 'cpe.co.demo:local-artifact' }),
      TENANT_ID,
      ACTOR_ID,
    );

    expect(result.id).toBe('cpe-demo-co-local');
    expect(validation.validateCertificate).not.toHaveBeenCalled();
    expect(signerSpy).not.toHaveBeenCalled();
    expect(fiscalAdapter.generarYFirmarDocumentoSinTransmitir).not.toHaveBeenCalled();
    expect(persistedPayload.metadata).toEqual(expect.objectContaining({
      dian_is_demo: true,
      dian_simulado: true,
      dian_fixture_source: 'ERP_DEMO_LOCAL_REPRESENTATION_V1',
      demo_artifact_format: 'ERP_DEMO_CPE_V1',
      demo_artifact_signed: false,
      demo_artifact_integrity: 'SHA-256',
      fiscal_delivery_eligible: false,
    }));
    expect(persistedPayload.xml_firmado).toContain('<DemoCpe');
    expect(persistedPayload.xml_firmado).toContain('fiscalValidity="NONE"');
    expect(persistedPayload.xml_firmado).not.toContain('PE:SUNAT');
    expect(persistedPayload.xml_firmado).not.toContain('Signature');
    expect(persistedPayload.hash_firma).toBe(
      createHash('sha256').update(persistedPayload.xml_firmado, 'utf8').digest('hex'),
    );
    expect(client.rpc).not.toHaveBeenCalledWith(
      'reservar_numeracion_dian_ui_tx',
      expect.anything(),
    );
  });

  it.each([
    ['prefijo inválido', { prefijo: 'FV-*', correlativo: 1 }],
    ['correlativo nulo', { prefijo: 'FVCO', correlativo: null }],
    ['correlativo fraccionario', { prefijo: 'FVCO', correlativo: 1.5 }],
  ])('rechaza una reserva DIAN con %s', async (_scenario, reservation) => {
    const { service, client } = buildHarness();
    jest.spyOn(service as any, 'loadDianCreationContext').mockResolvedValue({
      emisor: REAL_CO_ISSUER,
      receiver: {
        id: CLIENTE_ID,
        documentoTipo: 'NIT',
        documentoNumero: VALID_RECEIVER.documento_numero,
        razonSocial: VALID_RECEIVER.razon_social,
        direccion: VALID_RECEIVER.direccion,
        dianTaxProfile: {
          profile: 'ADQUIRIENTE_NIT_B2B', taxLevelCode: 'O-99',
          taxLevelListName: '04', taxSchemeId: '01', taxSchemeName: 'IVA',
        },
      },
    });
    client.rpc.mockResolvedValueOnce({ data: reservation, error: null });

    await expect(service.create(creationDto({
      idempotency_key: `cpe.co.direct:invalid:${_scenario}`,
    }), TENANT_ID, ACTOR_ID)).rejects.toThrow(
      'la reserva devolvió una numeración inválida',
    );
  });

  it('persiste una Invoice UBL DIAN nativa en una factura CO real y no invoca el firmador SUNAT', async () => {
    const { service, client, fiscalAdapter } = buildHarness();
    jest.spyOn(service as any, 'loadDianCreationContext').mockResolvedValue({
      emisor: REAL_CO_ISSUER,
      receiver: {
        id: CLIENTE_ID,
        documentoTipo: 'NIT',
        documentoNumero: VALID_RECEIVER.documento_numero,
        razonSocial: VALID_RECEIVER.razon_social,
        direccion: VALID_RECEIVER.direccion,
        dianTaxProfile: {
          profile: 'ADQUIRIENTE_NIT_B2B',
          taxLevelCode: 'O-99',
          taxLevelListName: '04',
          taxSchemeId: '01',
          taxSchemeName: 'IVA',
        },
      },
    });
    const sunatSignerSpy = jest.spyOn(service as any, 'getXmlSigner');
    fiscalAdapter.generarYFirmarDocumentoSinTransmitir.mockResolvedValue(NATIVE_DIAN_INVOICE);
    client.rpc.mockImplementation(async (name: string, args: any) => {
      if (name === 'reservar_numeracion_dian_ui_tx') {
        return {
          data: {
            prefijo: 'FVCO', correlativo: 345,
            fecha_emision: '2026-08-30', hora_emision: '14:23:45',
            ...VALID_RESERVATION_CONTEXT,
          },
          error: null,
        };
      }
      return {
        data: {
          cpe: { id: 'cpe-co-real-345', ...args.p_cpe },
          documento_id: 'doc-co-real-345',
          cxc_id: null,
        },
        error: null,
      };
    });

    const result = await service.create(creationDto({
      serie: 'BROWSER',
      numero: 999999,
      idempotency_key: 'cpe.co.direct:345',
    }), TENANT_ID, ACTOR_ID);

    expect(result.id).toBe('cpe-co-real-345');
    expect(client.rpc).toHaveBeenCalledWith('reservar_numeracion_dian_ui_tx', {
      p_tenant_id: TENANT_ID,
      p_actor_id: ACTOR_ID,
      p_tipo_documento: '01',
      p_fecha_emision: '2026-08-30',
      p_idempotency_key: 'cpe.co.direct:345',
      p_intent_fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_pedido_id: null,
    });
    expect(fiscalAdapter.generarYFirmarDocumentoSinTransmitir).toHaveBeenCalledWith(
      expect.objectContaining({
        tipoDocumento: '01',
        serie: 'FVCO',
        numero: '345',
        fechaEmision: '2026-08-30T14:23:45-05:00',
        totalImpuestos: 19,
        fiscalContext: expect.objectContaining({
          dianIssuerIdentity: {
            contractVersion: 529,
            taxId: REAL_CO_ISSUER.ruc,
            certificateSha256: REAL_CO_ISSUER.certificateSha256,
            signingConfigSha256: REAL_CO_ISSUER.signingConfigSha256,
          },
        }),
        receptor: expect.objectContaining({
          numeroDocumento: VALID_RECEIVER.documento_numero,
          dianTaxProfile: expect.objectContaining({ profile: 'ADQUIRIENTE_NIT_B2B' }),
        }),
        dianContext: VALID_PREFLIGHT_CONTEXT,
      }),
      TENANT_ID,
      'CO',
    );
    expect(sunatSignerSpy).not.toHaveBeenCalled();
    expect(client.rpc).toHaveBeenCalledWith(
      'emitir_factura_cliente_tx',
      expect.objectContaining({
        p_cpe: expect.objectContaining({
          xml_firmado: NATIVE_DIAN_INVOICE,
          hash_firma: expect.stringMatching(/^[0-9a-f]{64}$/),
          metadata: expect.objectContaining({ hora_emision: '14:23:45' }),
        }),
      }),
    );
    const persistedPayload = (client.rpc.mock.calls.find(
      ([name]: [string]) => name === 'emitir_factura_cliente_tx',
    )?.[1] as any)?.p_cpe;
    expect(JSON.stringify(persistedPayload)).not.toContain('technical-key-secret');
    expect(JSON.stringify(persistedPayload)).not.toContain('software-pin-secret');
  });

  it('liga la reserva a una huella económica canónica y sensible a receptor, pago y líneas', () => {
    const { service } = buildHarness();
    const context = {
      emisor: REAL_CO_ISSUER,
      receiver: {
        id: CLIENTE_ID,
        documentoTipo: 'NIT',
        documentoNumero: VALID_RECEIVER.documento_numero,
        razonSocial: VALID_RECEIVER.razon_social,
        direccion: VALID_RECEIVER.direccion,
        dianTaxProfile: {
          profile: 'ADQUIRIENTE_NIT_B2B', taxLevelCode: 'O-99',
          taxLevelListName: '04', taxSchemeId: '01', taxSchemeName: 'IVA',
        },
      },
    };
    const dto = creationDto();
    const totals = (service as any).recalculateTotals(dto);
    const fingerprint = (candidate: any, candidateContext = context, candidateDueDate = '2026-08-30') =>
      (service as any).buildDianReservationIntentFingerprint(
        candidate,
        TENANT_ID,
        candidateContext,
        (service as any).recalculateTotals(candidate),
        '2026-08-30',
        candidateDueDate,
      );

    const base = fingerprint(dto);
    const numericEquivalent = creationDto({
      items: [{ ...dto.items[0], cantidad: '1.0', precio_unitario: '100.00' }],
    });
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprint(numericEquivalent)).toBe(base);
    expect(fingerprint(creationDto({
      items: [{ ...dto.items[0], descripcion: 'Servicio gravado Colombia modificado' }],
    }))).not.toBe(base);
    expect(fingerprint(creationDto({ medio_pago: '42' }))).not.toBe(base);
    expect(fingerprint(creationDto({
      items: [{ ...dto.items[0], tasa_igv: 5 }],
    }))).not.toBe(base);
    expect(fingerprint(dto, {
      ...context,
      receiver: { ...context.receiver, razonSocial: 'CLIENTE MAESTRO RENOMBRADO SAS' },
    })).not.toBe(base);
    expect(totals).toEqual(expect.objectContaining({ total: 119, totalIgv: 19 }));
  });

  it('rechaza antes de reservar cuando POST CPE intenta apropiarse de la key y pedido internos', async () => {
    const { service, client } = buildHarness();
    jest.spyOn(service as any, 'loadDianCreationContext').mockResolvedValue({
      emisor: REAL_CO_ISSUER,
      receiver: {
        id: CLIENTE_ID,
        documentoTipo: 'NIT',
        documentoNumero: VALID_RECEIVER.documento_numero,
        razonSocial: VALID_RECEIVER.razon_social,
        direccion: VALID_RECEIVER.direccion,
        dianTaxProfile: {
          profile: 'ADQUIRIENTE_NIT_B2B', taxLevelCode: 'O-99',
          taxLevelListName: '04', taxSchemeId: '01', taxSchemeName: 'IVA',
        },
      },
    });
    const pedidoId = '0d8bd124-b01e-4bcb-8159-2f90c84534df';

    await expect(service.create(creationDto({
      pedido_id: pedidoId,
      idempotency_key: `ventas.cpe.factura:${TENANT_ID}:${pedidoId}`,
    }), TENANT_ID, ACTOR_ID)).rejects.toThrow(
      'sólo puede emitirse desde el flujo interno de pedidos',
    );

    expect(client.rpc).not.toHaveBeenCalledWith(
      'reservar_numeracion_dian_ui_tx',
      expect.anything(),
    );
  });

  it('rechaza configuración profunda del emisor antes de consumir numeración DIAN', async () => {
    const { service, client } = buildHarness();
    jest.spyOn(service as any, 'getEmpresaEmisorInfoStrict').mockResolvedValue({
      ...REAL_CO_ISSUER,
      codigoUbigeo: '',
    });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(service.create(
      creationDto({ idempotency_key: 'cpe.co.invalid:issuer-deep-fields' }),
      TENANT_ID,
      ACTOR_ID,
    )).rejects.toThrow('identidad de firma completos');
    expect(client.rpc).not.toHaveBeenCalledWith(
      'reservar_numeracion_dian_ui_tx',
      expect.anything(),
    );
  });

  it('crea una factura real mixta 10+20+30 sin inferir categorías por IVA ni por totales globales', async () => {
    const { service, client, fiscalAdapter } = buildHarness();
    jest.spyOn(service as any, 'loadDianCreationContext').mockResolvedValue({
      emisor: REAL_CO_ISSUER,
      receiver: {
        id: CLIENTE_ID,
        documentoTipo: 'NIT',
        documentoNumero: VALID_RECEIVER.documento_numero,
        razonSocial: VALID_RECEIVER.razon_social,
        direccion: VALID_RECEIVER.direccion,
        dianTaxProfile: {
          profile: 'ADQUIRIENTE_NIT_B2B', taxLevelCode: 'O-99',
          taxLevelListName: '04', taxSchemeId: '01', taxSchemeName: 'IVA',
        },
      },
    });
    fiscalAdapter.generarYFirmarDocumentoSinTransmitir.mockResolvedValue(NATIVE_DIAN_INVOICE);
    client.rpc.mockImplementation(async (name: string, args: any) => {
      if (name === 'reservar_numeracion_dian_ui_tx') {
        return {
          data: {
            prefijo: 'FVCO', correlativo: 346,
            fecha_emision: '2026-08-30', hora_emision: '14:23:45',
            ...VALID_RESERVATION_CONTEXT,
          },
          error: null,
        };
      }
      return {
        data: {
          cpe: { id: 'cpe-co-mixed-346', ...args.p_cpe },
          documento_id: 'doc-co-mixed-346', cxc_id: null,
        },
        error: null,
      };
    });

    await service.create(creationDto({
      idempotency_key: 'cpe.co.mixed:346',
      items: [
        {
          codigo: 'G10', descripcion: 'Gravado', cantidad: 1, precio_unitario: 100,
          valor_venta: 100, igv: 19, precio_venta: 119,
          afectacion_igv: '10', tipo_afectacion_igv: '10',
        },
        {
          codigo: 'E20', descripcion: 'Exento', cantidad: 1, precio_unitario: 100,
          valor_venta: 100, igv: 0, precio_venta: 100,
          afectacion_igv: '20', tipo_afectacion_igv: '20',
        },
        {
          codigo: 'X30', descripcion: 'Excluido', cantidad: 1, precio_unitario: 100,
          valor_venta: 100, igv: 0, precio_venta: 100,
          afectacion_igv: '30', tipo_afectacion_igv: '30',
        },
      ],
      total_gravadas: 100,
      total_exoneradas: 100,
      total_inafectas: 100,
      total_igv: 19,
      total_venta: 319,
    }), TENANT_ID, ACTOR_ID);

    expect(fiscalAdapter.generarYFirmarDocumentoSinTransmitir).toHaveBeenCalledWith(
      expect.objectContaining({
        totalGravadas: 100,
        totalExoneradas: 100,
        totalInafectas: 100,
        items: [
          expect.objectContaining({ codigoProducto: 'G10', dianTaxCategory: 'GRAVADO' }),
          expect.objectContaining({ codigoProducto: 'E20', dianTaxCategory: 'EXENTO' }),
          expect.objectContaining({ codigoProducto: 'X30', dianTaxCategory: 'EXCLUIDO' }),
        ],
      }),
      TENANT_ID,
      'CO',
    );
    expect(client.rpc).toHaveBeenCalledWith(
      'emitir_factura_cliente_tx',
      expect.objectContaining({
        p_detalles: [
          expect.objectContaining({ codigo_producto: 'G10', afectacion_igv: '10' }),
          expect.objectContaining({ codigo_producto: 'E20', afectacion_igv: '20' }),
          expect.objectContaining({ codigo_producto: 'X30', afectacion_igv: '30' }),
        ],
      }),
    );
  });

  it('rechaza una línea CO exenta con IVA positivo aunque los totales globales parezcan válidos', async () => {
    const { service } = buildHarness();
    jest.spyOn(service as any, 'loadDianCreationContext').mockResolvedValue({
      emisor: REAL_CO_ISSUER,
      receiver: {
        id: CLIENTE_ID, documentoTipo: 'NIT',
        documentoNumero: VALID_RECEIVER.documento_numero,
        razonSocial: VALID_RECEIVER.razon_social,
        direccion: VALID_RECEIVER.direccion,
        dianTaxProfile: {},
      },
    });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(service.create(creationDto({
      items: [{
        codigo: 'BAD20', descripcion: 'Exento inválido', cantidad: 1,
        precio_unitario: 100, valor_venta: 100, igv: 19, precio_venta: 119,
        afectacion_igv: '20', tipo_afectacion_igv: '20',
      }],
      total_gravadas: 0,
      total_exoneradas: 100,
    }), TENANT_ID, ACTOR_ID)).rejects.toThrow('IVA 19.00 no corresponde');
  });

  it.each([
    [
      'base distinta de cantidad por precio neto',
      {
        items: [{
          codigo: 'BAD-BASE', descripcion: 'Base manipulada', cantidad: 2,
          precio_unitario: 100, valor_venta: 1, igv: 0, total: 1,
          precio_venta: 0.5, afectacion_igv: '10', tipo_afectacion_igv: '10',
        }],
        total_gravadas: 1, total_igv: 0, total_venta: 1,
      },
      'base de venta inconsistente',
    ],
    [
      'tasa distinta de la configurada por el contribuyente',
      {
        items: [{
          codigo: 'BAD-RATE', descripcion: 'Tasa manipulada', cantidad: 1,
          precio_unitario: 100, valor_venta: 100, igv: 7, tasa_igv: 7,
          total: 107, precio_venta: 107,
          afectacion_igv: '10', tipo_afectacion_igv: '10',
        }],
        total_gravadas: 100, total_igv: 7, total_venta: 107,
      },
      'no coincide con la configurada',
    ],
    [
      'total de linea contradictorio',
      {
        items: [{
          codigo: 'BAD-TOTAL', descripcion: 'Total manipulado', cantidad: 1,
          precio_unitario: 100, valor_venta: 100, igv: 19,
          total: 118, precio_venta: 119,
          afectacion_igv: '10', tipo_afectacion_igv: '10',
        }],
      },
      'total inconsistente',
    ],
    [
      'precio de venta unitario confundido con total de linea',
      {
        items: [{
          codigo: 'BAD-UNIT-GROSS', descripcion: 'Precio bruto manipulado', cantidad: 2,
          precio_unitario: 100, valor_venta: 200, igv: 38,
          total: 238, precio_venta: 238,
          afectacion_igv: '10', tipo_afectacion_igv: '10',
        }],
        total_gravadas: 200, total_igv: 38, total_venta: 238,
      },
      'precio de venta unitario con tributos inconsistente',
    ],
    [
      'afectacion que el builder DIAN no soporta',
      {
        items: [{
          codigo: 'BAD-40', descripcion: 'Exportacion no soportada', cantidad: 1,
          precio_unitario: 100, valor_venta: 100, igv: 0,
          total: 100, precio_venta: 100,
          afectacion_igv: '40', tipo_afectacion_igv: '40',
        }],
        total_gravadas: 0, total_exportacion: 100, total_igv: 0, total_venta: 100,
      },
      'afectacion tributaria 10, 20 o 30',
    ],
    [
      'descuento sin codigo y motivo DIAN',
      {
        items: [{
          codigo: 'BAD-DISCOUNT', descripcion: 'Descuento incompleto', cantidad: 1,
          precio_unitario: 100, descuento_unitario: 1,
          valor_venta: 99, igv: 18.81, total: 117.81, precio_venta: 117.81,
          afectacion_igv: '10', tipo_afectacion_igv: '10',
        }],
        total_gravadas: 99, total_igv: 18.81, total_venta: 117.81,
      },
      'descuento requiere codigo y motivo DIAN',
    ],
  ])('rechaza %s antes de reservar numeracion', async (_label, overrides, expected) => {
    const { service, client } = buildHarness();
    jest.spyOn(service as any, 'loadDianCreationContext').mockResolvedValue({
      emisor: REAL_CO_ISSUER,
      receiver: {
        id: CLIENTE_ID, documentoTipo: 'NIT',
        documentoNumero: VALID_RECEIVER.documento_numero,
        razonSocial: VALID_RECEIVER.razon_social,
        direccion: VALID_RECEIVER.direccion,
        dianTaxProfile: {},
      },
    });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(service.create(
      creationDto({ ...overrides, idempotency_key: `cpe.co.invalid:${_label}` }),
      TENANT_ID,
      ACTOR_ID,
    )).rejects.toThrow(expected as string);
    expect(client.rpc).not.toHaveBeenCalledWith(
      'reservar_numeracion_dian_ui_tx',
      expect.anything(),
    );
  });

  it('declara INC como tributo DIAN 04 en linea y cabecera sin ocultarlo en el pagadero', async () => {
    const { service, fiscalAdapter } = buildHarness();
    fiscalAdapter.generarYFirmarDocumentoSinTransmitir.mockResolvedValue(NATIVE_DIAN_INVOICE);
    const dto = creationDto({
      items: [{
        codigo: 'INC-01', descripcion: 'Producto con INC', cantidad: 1,
        precio_unitario: 100, valor_venta: 100,
        igv: 19, tasa_igv: 19, impuesto_isc: 8, tasa_isc: 8,
        total: 127, precio_venta: 127,
        afectacion_igv: '10', tipo_afectacion_igv: '10',
      }],
      total_gravadas: 100, total_igv: 19, total_isc: 8, total_venta: 127,
      hora_emision: '14:23:45',
    });
    (service as any).normalizeAndValidateDianLines(dto, 19);

    await (service as any).generateSignedDianInvoice(dto, TENANT_ID, {
      emisor: REAL_CO_ISSUER,
      receiver: {
        id: CLIENTE_ID, documentoTipo: 'NIT',
        documentoNumero: VALID_RECEIVER.documento_numero,
        razonSocial: VALID_RECEIVER.razon_social,
        direccion: VALID_RECEIVER.direccion,
        dianTaxProfile: {
          profile: 'ADQUIRIENTE_NIT_B2B', taxLevelCode: 'O-99',
          taxLevelListName: '04', taxSchemeId: '01', taxSchemeName: 'IVA',
        },
      },
    });

    expect(fiscalAdapter.generarYFirmarDocumentoSinTransmitir).toHaveBeenCalledWith(
      expect.objectContaining({
        totalImpuestos: 27,
        dianTaxes: expect.arrayContaining([
          expect.objectContaining({ id: '01', amount: 19, percent: 19 }),
          expect.objectContaining({ id: '04', name: 'INC', amount: 8, percent: 8 }),
        ]),
        items: [expect.objectContaining({
          dianTaxes: expect.arrayContaining([
            expect.objectContaining({ id: '04', amount: 8, percent: 8 }),
          ]),
        })],
      }),
      TENANT_ID,
      'CO',
    );
  });

  it('finaliza un POS DIAN con la hora reservada sin intentar reservar otra huella', async () => {
    const documentoId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const ventaPosId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const dto = creationDto({
      documento_id: documentoId,
      venta_pos_id: ventaPosId,
      hora_emision: '16:45:12',
      metadata: {
        dian_numbering_contract_version: 530,
        dian_number_reservation_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        dian_prefijo_autorizado: 'FVCO',
        numero_fiscal: 'FVCO7',
        dian_fecha_emision: '2026-08-30',
        dian_hora_emision: '16:45:12',
      },
      idempotency_key: `pos.cpe:${TENANT_ID}:sale-1`,
    });
    const { service, client, fiscalAdapter } = buildHarness({
      ventaPos: {
        id: ventaPosId,
        documento_id: documentoId,
        cpe_id: null,
        cpe_data: dto,
        total: 119,
        cliente_documento: VALID_RECEIVER.documento_numero,
        accounting_event_id: 'accounting-event-1',
        atomic_result: { venta_id: ventaPosId },
      },
    });
    jest.spyOn(service as any, 'loadDianCreationContext').mockResolvedValue({
      emisor: REAL_CO_ISSUER,
      receiver: {
        id: CLIENTE_ID, documentoTipo: 'NIT',
        documentoNumero: VALID_RECEIVER.documento_numero,
        razonSocial: VALID_RECEIVER.razon_social,
        direccion: VALID_RECEIVER.direccion,
        dianTaxProfile: {
          profile: 'ADQUIRIENTE_NIT_B2B', taxLevelCode: 'O-99',
          taxLevelListName: '04', taxSchemeId: '01', taxSchemeName: 'IVA',
        },
      },
    });
    fiscalAdapter.generarYFirmarDocumentoSinTransmitir.mockResolvedValue(NATIVE_DIAN_INVOICE);
    client.rpc.mockImplementation(async (name: string, args: any) => {
      if (name === 'reservar_numeracion_dian_ui_tx') {
        throw new Error('no debe reservar nuevamente');
      }
      if (name === 'finalizar_cpe_pos_tx') {
        return {
          data: {
            cpe: { id: 'cpe-pos-co-7', ...args.p_cpe },
            documento_id: documentoId,
            venta: { cpe_id: 'cpe-pos-co-7' },
          },
          error: null,
        };
      }
      throw new Error(`RPC no esperada: ${name}`);
    });

    const result = await service.create(
      dto,
      TENANT_ID,
      ACTOR_ID,
      { finalizarDocumentoPosReservado: true },
    );

    expect(result.id).toBe('cpe-pos-co-7');
    expect(client.rpc).not.toHaveBeenCalledWith(
      'reservar_numeracion_dian_ui_tx',
      expect.anything(),
    );
    expect(fiscalAdapter.generarYFirmarDocumentoSinTransmitir).toHaveBeenCalledWith(
      expect.objectContaining({ fechaEmision: '2026-08-30T16:45:12-05:00' }),
      TENANT_ID,
      'CO',
    );
  });

  it('preserva la afectación del detalle al crear un CPE desde documento sin inferirla por el importe de IVA', async () => {
    const { service } = buildHarness();
    const createSpy = jest.spyOn(service, 'create').mockResolvedValue({ id: 'cpe-doc-tax' } as any);

    await service.crearCPEDesdeDocumento({
      id: 'doc-tax', tenant_id: TENANT_ID, tipo_documento: '01', serie: 'FVCO', numero: '10',
      fecha_emision: '2026-08-31', fecha_vencimiento: '2026-08-31',
      subtotal: 200, impuesto_igv: 0, total: 200, moneda: 'COP',
      cliente_id: CLIENTE_ID, estado: 'BORRADOR',
      cliente: {
        id: CLIENTE_ID, documento_tipo: 'NIT', numero_documento: VALID_RECEIVER.documento_numero,
        razon_social: VALID_RECEIVER.razon_social, direccion: VALID_RECEIVER.direccion,
      },
      emisor: { ruc: REAL_CO_ISSUER.ruc, razon_social: REAL_CO_ISSUER.razonSocial, direccion: REAL_CO_ISSUER.direccion },
      detalles: [
        {
          descripcion: 'Exento', cantidad: 1, precio_unitario: 100,
          valor_venta: 100, impuesto_igv: 0, total_item: 100,
          tipo_afectacion_igv: '20',
        },
        {
          descripcion: 'Excluido', cantidad: 1, precio_unitario: 100,
          valor_venta: 100, impuesto_igv: 0, total_item: 100,
          metadata: { afectacion_igv: '30' },
        },
      ],
    }, TENANT_ID, ACTOR_ID);

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        total_gravadas: 0,
        total_exoneradas: 100,
        total_inafectas: 100,
        items: [
          expect.objectContaining({ afectacion_igv: '20', tipo_afectacion_igv: '20' }),
          expect.objectContaining({ afectacion_igv: '30', tipo_afectacion_igv: '30' }),
        ],
      }),
      TENANT_ID,
      ACTOR_ID,
    );
  });

  it('bloquea cualquier entrada CO real sin una intención idempotente explícita', async () => {
    const { service, client } = buildHarness();
    jest.spyOn(service as any, 'loadDianCreationContext').mockResolvedValue({
      emisor: REAL_CO_ISSUER,
      receiver: {
        id: CLIENTE_ID,
        documentoTipo: 'NIT',
        documentoNumero: VALID_RECEIVER.documento_numero,
        razonSocial: VALID_RECEIVER.razon_social,
        direccion: VALID_RECEIVER.direccion,
        dianTaxProfile: {},
      },
    });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(service.create(creationDto({ idempotency_key: undefined }), TENANT_ID, ACTOR_ID))
      .rejects.toThrow('la emisión real exige una intención idempotente explícita');
    expect(client.rpc).not.toHaveBeenCalled();
  });
});

describe('CpeService.getSignedXml · Colombia', () => {
  it('bloquea un Invoice PE:SUNAT almacenado bajo procedencia histórica CO', async () => {
    const provisionalSunatXml = [
      '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">',
      '<cbc:CustomizationID xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">PE:SUNAT</cbc:CustomizationID>',
      '</Invoice>',
    ].join('');
    const { service } = buildHarness({
      cpe: {
        id: 'cpe-co-provisional',
        tipo_documento: '01',
        issuer_snapshot: { country_code: 'CO' },
        pais: 'CO',
        xml_firmado: provisionalSunatXml,
      },
    });

    await expect(service.getSignedXml('cpe-co-provisional', TENANT_ID)).rejects.toThrow(
      'no se entrega XML SUNAT o provisional',
    );
  });

  it('entrega el UBL DIAN nativo con CUFE y una única firma XMLDSig', async () => {
    const { service } = buildHarness({
      cpe: {
        id: 'cpe-co-native',
        tipo_documento: '01',
        issuer_snapshot: { country_code: 'CO' },
        pais: 'CO',
        xml_firmado: NATIVE_DIAN_INVOICE,
      },
    });

    await expect(service.getSignedXml('cpe-co-native', TENANT_ID)).resolves.toBe(
      NATIVE_DIAN_INVOICE,
    );
  });
});
