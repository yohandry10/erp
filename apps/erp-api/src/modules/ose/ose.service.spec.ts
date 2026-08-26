import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { createHash } from 'crypto';
import { OseService } from './ose.service';

describe('OseService certificate path resolution', () => {
  const config = {
    OSE_URL: 'https://ose-demo.local',
    OSE_USUARIO: 'demo',
    OSE_PASSWORD: 'demo',
    EMPRESA_RUC: '20704264904',
    CERTIFICATE_PATH: 'certs/demo.pfx',
    CERTIFICATE_PASSWORD: '12345678910',
    SUNAT_ENVIRONMENT: 'homologacion',
    REQUIRE_REAL_FISCAL_CERTIFICATE: 'false',
  };

  const createConfigService = (overrides: Record<string, string | undefined> = {}) => {
    const values = { ...config, ...overrides };
    return {
      get: jest.fn((key: string) => values[key as keyof typeof values]),
    };
  };

  const circuitBreaker = {
    registerCircuit: jest.fn(),
    execute: jest.fn(),
    getStats: jest.fn(),
    forceClose: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const createTenantSupabase = (response: { data: any; error: any }) => ({
    getClient: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => response,
          }),
        }),
      }),
    }),
  });

  const buildSunatCdrZipBase64 = (xml: string, fileName = 'R-20100066603-01-F001-1.xml') => {
    const name = Buffer.from(fileName, 'utf8');
    const compressed = zlib.deflateRawSync(Buffer.from(xml, 'utf8'));
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(8, 8);
    header.writeUInt32LE(0, 10);
    header.writeUInt32LE(0, 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(Buffer.byteLength(xml), 22);
    header.writeUInt16LE(name.length, 26);
    header.writeUInt16LE(0, 28);

    return Buffer.concat([header, name, compressed]).toString('base64');
  };

  it('carga el certificado real relativo al workspace aunque la API ejecute desde apps/erp-api', async () => {
    const workspaceRoot = path.resolve(process.cwd(), '..', '..');
    expect(fs.existsSync(path.join(workspaceRoot, 'certs', 'demo.pfx'))).toBe(true);

    const configService = createConfigService();
    const service = new OseService(configService as any, circuitBreaker as any);

    await expect(service.verificarConfiguracion()).resolves.toEqual({
      valid: true,
      errors: [],
    });
    expect(service.getConfiguracion()).toMatchObject({
      certificateExists: true,
    });
    expect((service as any).xmlSigner.getCertificateInfo()).toMatchObject({
      demoMode: false,
    });
  });

  it('resuelve el PFX sintético sólo para el runtime de una demo PE en homologación', async () => {
    const supabase = createTenantSupabase({
      data: {
        ruc: '20123456786',
        pais: 'PE',
        is_demo: true,
        certificado_pfx: null,
        certificado_password: null,
        sunat_environment: 'homologacion',
      },
      error: null,
    });
    const service = new OseService(
      createConfigService() as any,
      circuitBreaker as any,
      supabase as any,
    );

    const runtime = await (service as any).resolveRuntime({ tenantId: 'tenant-demo' });

    expect(runtime.signer.getCertificateInfo()).toMatchObject({ demoMode: false });
  });

  it('falla cerrado sin tenant en todas las operaciones que podrían abrir red fiscal', async () => {
    const service = new OseService(
      createConfigService() as any,
      circuitBreaker as any,
    );

    const responses = await Promise.all([
      service.enviarCpe('<Invoice/>', '20123456786-01-F001-1'),
      service.enviarGre('<DespatchAdvice/>', '20123456786-09-T001-1'),
      service.enviarResumen('<VoidedDocuments/>', '20123456786-RA-20260825-1'),
      service.consultarEstadoCpe('20123456786', '01', 'F001', '1'),
      service.consultarTicket('ticket-ra-1'),
      service.consultarTicketGre('ticket-gre-1'),
    ]);

    for (const response of responses) {
      expect(response).toEqual(
        expect.objectContaining({
          success: false,
          descripcionRespuesta: expect.stringMatching(/tenantId es obligatorio/i),
        }),
      );
    }
    expect(circuitBreaker.execute).not.toHaveBeenCalled();
  });

  it('no sustituye empresa_config por credenciales globales si falta acceso tenant-scoped', async () => {
    const service = new OseService(
      createConfigService({
        SUNAT_USERNAME: '20123456786GLOBAL',
        SUNAT_PASSWORD: 'global-no-usar',
      }) as any,
      circuitBreaker as any,
    );

    const response = await service.enviarCpe(
      '<Invoice/>',
      '20123456786-01-F001-1',
      { tenantId: 'tenant-sin-db' },
    );

    expect(response).toEqual(
      expect.objectContaining({
        success: false,
        descripcionRespuesta: expect.stringMatching(/empresa_config no está disponible/i),
      }),
    );
    expect(circuitBreaker.execute).not.toHaveBeenCalled();
  });

  it('acota la lectura del runtime exactamente al tenant solicitado', async () => {
    const eq = jest.fn((_column: string, _tenantId: string) => ({
      maybeSingle: async () => ({
        data: {
          ruc: '20123456786',
          pais: 'PE',
          is_demo: true,
          certificado_pfx: null,
          certificado_password: null,
          sunat_environment: 'homologacion',
        },
        error: null,
      }),
    }));
    const supabase = {
      getClient: () => ({
        from: () => ({
          select: () => ({ eq }),
        }),
      }),
    };
    const service = new OseService(
      createConfigService() as any,
      circuitBreaker as any,
      supabase as any,
    );

    await (service as any).resolveTransportRuntime({ tenantId: 'tenant-a' });

    expect(eq).toHaveBeenCalledTimes(1);
    expect(eq).toHaveBeenCalledWith('tenant_id', 'tenant-a');
  });

  it('expone readiness OSE por tenant y declara la conectividad como no probada', async () => {
    const supabase = createTenantSupabase({
      data: {
        ruc: '20123456786',
        pais: 'PE',
        is_demo: true,
        certificado_pfx: null,
        certificado_password: null,
        sunat_environment: 'homologacion',
        sunat_username: '20123456786MODDATOS',
        sunat_password: 'MODDATOS',
        sunat_cpe_url: null,
      },
      error: null,
    });
    const service = new OseService(
      createConfigService({ OSE_URL: 'https://global-no-usar.example' }) as any,
      circuitBreaker as any,
      supabase as any,
    );

    const status = await service.getTenantConfigurationStatus('tenant-demo');

    expect(status).toEqual({
      configuracion: expect.objectContaining({
        applicable: true,
        ruc: '20123456786',
        certificateExists: true,
        isDemoTenant: true,
        connectivityStatus: 'NO_PROBADO',
        transportStatus: 'BLOQUEADO_DEMO',
      }),
      verificacion: {
        valid: true,
        errors: [],
        connectivityStatus: 'NO_PROBADO',
      },
    });
    expect(status.configuracion.url).not.toBe('https://global-no-usar.example');
  });

  it('permite firmar en demo, pero bloquea CPE, GRE y RA/RC sin fabricar CDR o ticket', async () => {
    const supabase = createTenantSupabase({
      data: {
        ruc: '20123456786',
        pais: 'PE',
        is_demo: true,
        certificado_pfx: null,
        certificado_password: null,
        sunat_environment: 'homologacion',
      },
      error: null,
    });
    const service = new OseService(
      createConfigService() as any,
      circuitBreaker as any,
      supabase as any,
    );
    jest.spyOn(service as any, 'prepareXmlForSend').mockReturnValue({
      xmlSigned: '<Invoice>signed</Invoice>',
      hash: 'a'.repeat(64),
    });

    const cpe = await service.enviarCpe('<Invoice/>', '20123456786-01-F001-1', {
      tenantId: 'tenant-demo',
    });
    const gre = await service.enviarGre('<DespatchAdvice/>', '20123456786-09-T001-1', {
      tenantId: 'tenant-demo',
    });
    const summary = await service.enviarResumen(
      '<VoidedDocuments/>',
      '20123456786-RA-20260825-1',
      { tenantId: 'tenant-demo' },
    );
    const estado = await service.consultarEstadoCpe('20123456786', '01', 'F001', '1', {
      tenantId: 'tenant-demo',
    });

    for (const response of [cpe, gre, summary, estado]) {
      expect(response).toEqual(expect.objectContaining({
        success: false,
        codigoRespuesta: 'DEMO_EXTERNAL_TRANSPORT_BLOCKED',
      }));
      expect(response.cdr).toBeUndefined();
      expect(response.ticket).toBeUndefined();
    }
    expect(circuitBreaker.execute).not.toHaveBeenCalled();
  });

  it.each([
    [{ pais: 'CO', sunat_environment: 'homologacion' }, /pais PE/i],
    [{ pais: 'PE', sunat_environment: null }, /Ambiente SUNAT inválido/i],
    [{ pais: 'PE', sunat_environment: 'sandbox' }, /Ambiente SUNAT inválido/i],
    [{ pais: 'PE', sunat_environment: 'produccion' }, /sólo puede simular SUNAT/i],
  ])('una demo con contexto fiscal inválido falla cerrado: %j', async (override, message) => {
    const supabase = createTenantSupabase({
      data: {
        ruc: '20123456786',
        pais: 'PE',
        is_demo: true,
        certificado_pfx: null,
        certificado_password: null,
        sunat_environment: 'homologacion',
        ...override,
      },
      error: null,
    });
    const service = new OseService(
      createConfigService() as any,
      circuitBreaker as any,
      supabase as any,
    );

    await expect(
      (service as any).resolveRuntime({ tenantId: 'tenant-demo-invalido' }),
    ).rejects.toThrow(message as RegExp);
    expect(circuitBreaker.execute).not.toHaveBeenCalled();
  });

  it('un tenant real con PFX propio y sin credenciales SOL no hereda las globales ni abre circuito', async () => {
    const workspaceRoot = path.resolve(process.cwd(), '..', '..');
    const pfx = fs.readFileSync(path.join(workspaceRoot, 'certs', 'demo.pfx'));
    const supabase = createTenantSupabase({
      data: {
        ruc: '20123456789',
        pais: 'PE',
        is_demo: false,
        certificado_pfx: pfx,
        certificado_password: '12345678910',
        sunat_environment: 'homologacion',
        sunat_username: null,
        sunat_password: null,
      },
      error: null,
    });
    const service = new OseService(
      createConfigService({ CERT_ENCRYPTION_KEY: 'x'.repeat(32) }) as any,
      circuitBreaker as any,
      supabase as any,
    );
    jest.spyOn(service as any, 'prepareXmlForSend').mockReturnValue({
      xmlSigned: '<Invoice>signed</Invoice>',
      hash: 'a'.repeat(64),
    });

    const response = await service.enviarCpe('<Invoice/>', '20123456789-01-F001-1', {
      tenantId: 'tenant-real-sin-sol',
    });

    expect(response).toEqual(expect.objectContaining({
      success: false,
      codigoRespuesta: '99',
      descripcionRespuesta: expect.stringMatching(/Usuario SUNAT\/OSE no configurado/i),
    }));
    expect(circuitBreaker.execute).not.toHaveBeenCalled();
  });

  it('no hereda el PFX global en una cuenta real sin certificado', async () => {
    const supabase = createTenantSupabase({
      data: {
        ruc: '20123456789',
        pais: 'PE',
        is_demo: false,
        certificado_pfx: null,
        certificado_password: null,
        sunat_environment: 'homologacion',
      },
      error: null,
    });
    const service = new OseService(
      createConfigService() as any,
      circuitBreaker as any,
      supabase as any,
    );

    await expect(
      (service as any).resolveRuntime({ tenantId: 'tenant-real' }),
    ).rejects.toThrow(/Certificado digital no configurado/);
  });

  it('un error al leer empresa_config nunca activa el fixture demo', async () => {
    const supabase = createTenantSupabase({
      data: null,
      error: { message: 'database unavailable' },
    });
    const service = new OseService(
      createConfigService() as any,
      circuitBreaker as any,
      supabase as any,
    );

    await expect(
      (service as any).resolveRuntime({ tenantId: 'tenant-error' }),
    ).rejects.toThrow(/database unavailable/);
  });

  it('resuelve endpoints SUNAT beta por operacion sin reutilizar otros CPE para GRE', () => {
    const service = new OseService(createConfigService({ OSE_URL: undefined }) as any, circuitBreaker as any);

    const cpe = (service as any).resolveSunatEndpoint('cpe');
    const gre = (service as any).resolveSunatEndpoint('gre');
    const summary = (service as any).resolveSunatEndpoint('summary');

    expect(cpe).toMatchObject({
      hostname: 'e-beta.sunat.gob.pe',
      path: '/ol-ti-itcpfegem-beta/billService',
    });
    expect(gre).toMatchObject({
      hostname: 'e-beta.sunat.gob.pe',
      path: '/ol-ti-itemision-guia-gem-beta/billService',
    });
    expect(gre.path).not.toContain('otroscpe');
    expect(summary.path).toBe('/ol-ti-itcpfegem-beta/billService');
  });

  it('mantiene GRE SOAP por defecto y habilita REST solo de forma explicita', () => {
    const soapService = new OseService(createConfigService() as any, circuitBreaker as any);
    const restService = new OseService(createConfigService({ SUNAT_GRE_TRANSPORT: 'rest' }) as any, circuitBreaker as any);

    expect((soapService as any).oseConfig.greTransport).toBe('soap');
    expect((restService as any).oseConfig.greTransport).toBe('rest');
    expect((restService as any).oseConfig.greRestBaseUrl).toBe('https://api-cpe.sunat.gob.pe/v1');
  });

  it('resuelve consulta CDR productiva al servicio oficial de consulta', () => {
    const service = new OseService(
      createConfigService({
        SUNAT_ENVIRONMENT: 'produccion',
        CERTIFICATE_PATH: 'certs/demo.pfx',
        CERTIFICATE_PASSWORD: '12345678910',
        REQUIRE_REAL_FISCAL_CERTIFICATE: 'false',
        SUNAT_CERT_RUC_MISMATCH_CONFIRMED: 'true',
        SUNAT_CERT_RUC_MISMATCH_REASON: 'test fixture uses demo certificate',
        OSE_URL: undefined,
      }) as any,
      circuitBreaker as any,
    );

    const query = (service as any).resolveSunatEndpoint('query');

    expect(query).toMatchObject({
      hostname: 'e-factura.sunat.gob.pe',
      path: '/ol-it-wsconscpegem/billConsultService',
    });
  });

  it('usa solo WS-Security para hosts SUNAT y reserva HTTP Basic para OSE externo', () => {
    const service = new OseService(createConfigService() as any, circuitBreaker as any);

    expect((service as any).shouldUseHttpBasicAuth('e-factura.sunat.gob.pe')).toBe(false);
    expect((service as any).shouldUseHttpBasicAuth('e-beta.sunat.gob.pe')).toBe(false);
    expect((service as any).shouldUseHttpBasicAuth('ose-demo.local')).toBe(true);
  });

  it('prefiere credenciales SUNAT explicitas sobre aliases OSE legacy', () => {
    const service = new OseService(
      createConfigService({
        SUNAT_USERNAME: '20123456789ERPFE001',
        SUNAT_PASSWORD: 'sunat-secret',
        OSE_USUARIO: 'legacy-user',
        OSE_PASSWORD: 'legacy-secret',
      }) as any,
      circuitBreaker as any,
    );

    expect((service as any).oseConfig.usuario).toBe('20123456789ERPFE001');
    expect((service as any).oseConfig.password).toBe('sunat-secret');
  });

  it('reporta el modo real del certificado al firmar XML offline', async () => {
    const service = new OseService(createConfigService() as any, circuitBreaker as any);
    jest.spyOn(service as any, 'resolveRuntime').mockResolvedValue({
      signer: {
        signXml: jest.fn(() => '<Invoice>signed</Invoice>'),
        generateHash: jest.fn(() => 'HASH'),
        validateSignature: jest.fn(() => true),
        getCertificateInfo: jest.fn(() => ({ demoMode: false })),
      },
    });
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    try {
      await service.signXmlOnly('<Invoice/>');
      expect(logSpy).toHaveBeenCalledWith('📜 [OSE] Info certificado: modo=real');
    } finally {
      logSpy.mockRestore();
    }
  });

  it('construye sendSummary para RA/RC y parsea ticket real de SUNAT', () => {
    const service = new OseService(createConfigService() as any, circuitBreaker as any);

    const request = (service as any).buildZipSoapRequest(Buffer.from('zip'), 'RA-20260616-001', 'sendSummary');
    const response = (service as any).parseSunatResponse(`
      <soapenv:Envelope>
        <soapenv:Body>
          <ns2:sendSummaryResponse>
            <ticket>1234567890123</ticket>
          </ns2:sendSummaryResponse>
        </soapenv:Body>
      </soapenv:Envelope>
    `);

    expect(request).toContain('<ser:sendSummary>');
    expect(request).not.toContain('<ser:sendBill>');
    expect(response).toMatchObject({
      success: true,
      codigoRespuesta: '0',
      ticket: '1234567890123',
    });
  });

  it('preserva codigos SUNAT numericos en fault SOAP', () => {
    const service = new OseService(createConfigService() as any, circuitBreaker as any);

    const response = (service as any).parseSunatResponse(`
      <soap-env:Envelope>
        <soap-env:Body>
          <soap-env:Fault>
            <faultcode>soap-env:Client</faultcode>
            <faultstring>2112</faultstring>
          </soap-env:Fault>
        </soap-env:Body>
      </soap-env:Envelope>
    `);

    expect(response).toMatchObject({
      success: false,
      codigoRespuesta: '2112',
      descripcionRespuesta: '2112',
    });
  });

  it('expone HTTP 401 no SOAP sin degradarlo a respuesta no reconocida', () => {
    const service = new OseService(createConfigService() as any, circuitBreaker as any);

    const response = (service as any).parseSunatResponse(`
      <html>
        <head><title>401 Authorization Required</title></head>
        <body><h1>401 Authorization Required</h1></body>
      </html>
    `, 401);

    expect(response).toMatchObject({
      success: false,
      codigoRespuesta: '401',
      descripcionRespuesta: '401 Authorization Required',
    });
  });

  it('parsea estado con CDR desde getStatus/getStatusCdr', () => {
    const service = new OseService(createConfigService() as any, circuitBreaker as any);

    const response = (service as any).parseSunatResponse(`
      <S:Envelope>
        <S:Body>
          <ns2:getStatusResponse>
            <status>
              <statusCode>0</statusCode>
              <statusMessage>Aceptado</statusMessage>
              <content>Q0RSX0JBU0U2NA==</content>
            </status>
          </ns2:getStatusResponse>
        </S:Body>
      </S:Envelope>
    `);

    expect(response).toMatchObject({
      success: true,
      codigoRespuesta: '0',
      descripcionRespuesta: 'Aceptado',
      cdr: 'Q0RSX0JBU0U2NA==',
    });
  });

  it('parsea responseCode, descripcion y notas desde el ZIP CDR SUNAT', () => {
    const service = new OseService(createConfigService() as any, circuitBreaker as any);
    const cdr = buildSunatCdrZipBase64(`
      <ApplicationResponse xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
        <cbc:ResponseCode>0</cbc:ResponseCode>
        <cbc:Description>La Factura numero F001-1, ha sido aceptada</cbc:Description>
        <cbc:Note>Observacion controlada</cbc:Note>
      </ApplicationResponse>
    `);

    const response = (service as any).parseSunatResponse(`
      <S:Envelope>
        <S:Body>
          <ns2:getStatusResponse>
            <status>
              <content>${cdr}</content>
            </status>
          </ns2:getStatusResponse>
        </S:Body>
      </S:Envelope>
    `);

    expect(response).toMatchObject({
      success: true,
      codigoRespuesta: '0',
      descripcionRespuesta: 'La Factura numero F001-1, ha sido aceptada',
      cdr,
      observaciones: ['Observacion controlada'],
    });
  });

  it('no trata contenido textual de getStatus como CDR aceptado', () => {
    const service = new OseService(createConfigService() as any, circuitBreaker as any);

    const response = (service as any).parseSunatResponse(`
      <S:Envelope>
        <S:Body>
          <ns2:getStatusResponse>
            <status>
              <content>El ticket no existe</content>
              <statusCode>0127</statusCode>
            </status>
          </ns2:getStatusResponse>
        </S:Body>
      </S:Envelope>
    `);

    expect(response).toMatchObject({
      success: false,
      codigoRespuesta: '0127',
      descripcionRespuesta: 'El ticket no existe',
    });
    expect(response.cdr).toBeUndefined();
  });

  it('parsea envio REST GRE como ticket pendiente, no como CDR aceptado', () => {
    const service = new OseService(createConfigService({ SUNAT_GRE_TRANSPORT: 'rest' }) as any, circuitBreaker as any);

    expect((service as any).parseGreFileName('20100066603-09-T001-12345678')).toEqual({
      ruc: '20100066603',
      tipo: '09',
      serie: 'T001',
      numero: '12345678',
    });

    expect((service as any).parseGreRestSendResponse({
      numTicket: '550e8400-e29b-41d4-a716-446655440026',
      fecRecepcion: '2026-06-17T00:00:00',
    })).toMatchObject({
      success: true,
      codigoRespuesta: '98',
      ticket: '550e8400-e29b-41d4-a716-446655440026',
    });
  });

  it('parsea errores funcionales REST GRE 422', () => {
    const service = new OseService(createConfigService({ SUNAT_GRE_TRANSPORT: 'rest' }) as any, circuitBreaker as any);

    const response = (service as any).parseGreRestSendResponse({
      cod: '422',
      msg: 'Unprocessable Entity',
      errors: [{ codError: '504', desError: 'El campo nomArchivo no cumple con el formato establecido' }],
    });

    expect(response).toMatchObject({
      success: false,
      codigoRespuesta: '422',
      descripcionRespuesta: 'Unprocessable Entity',
      observaciones: ['504: El campo nomArchivo no cumple con el formato establecido'],
    });
  });

  it('construye envío REST GRE con URL, bearer y payload oficial SUNAT', async () => {
    const service = new OseService(createConfigService({
      SUNAT_GRE_TRANSPORT: 'rest',
      SUNAT_GRE_CLIENT_ID: 'client-id',
      SUNAT_GRE_CLIENT_SECRET: 'client-secret',
      SUNAT_USERNAME: '20100066603ERPFE001',
      SUNAT_PASSWORD: 'clave-sol',
    }) as any, circuitBreaker as any);
    const zipBuffer = Buffer.from('zip-gre');
    const ticket = '550e8400-e29b-41d4-a716-446655440026';
    const postJson = jest.spyOn(service as any, 'postJson').mockResolvedValue({ numTicket: ticket });
    jest.spyOn(service as any, 'getGreRestAccessToken').mockResolvedValue('access-token');

    const response = await (service as any).sendGreToSunatRest(
      zipBuffer,
      '20100066603-09-T001-12345678',
      (service as any).oseConfig,
    );

    expect(postJson).toHaveBeenCalledWith(
      'https://api-cpe.sunat.gob.pe/v1/contribuyente/gem/comprobantes/20100066603-09-T001-12345678',
      {
        archivo: {
          nomArchivo: '20100066603-09-T001-12345678.zip',
          arcGreZip: zipBuffer.toString('base64'),
          hashZip: createHash('sha256').update(zipBuffer).digest('hex').toUpperCase(),
        },
      },
      { Authorization: 'Bearer access-token' },
    );
    expect(response).toMatchObject({
      success: true,
      codigoRespuesta: '98',
      ticket,
    });
  });
});
