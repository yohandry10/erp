import { DianFiscalService } from './dian-fiscal.service';
import { DianXmlBuilderService } from './colombia/dian-xml-builder.service';

function realDocument() {
  return {
    id: 'cpe-real-co', tipoDocumento: '01', serie: 'FV', numero: '125',
    fechaEmision: '2026-08-29T10:15:30-05:00', moneda: 'COP',
    emisor: {
      tipoDocumento: '31', numeroDocumento: '9001234568', razonSocial: 'EMISOR CO SAS',
      direccion: 'Carrera 7', ciudad: 'Bogotá D.C.', departamento: 'Bogotá D.C.',
      codigoUbigeo: '11001', codigoDepartamento: '11', regimenFiscal: 'O-13',
      tipoContribuyente: '1',
    },
    receptor: {
      tipoDocumento: '13', numeroDocumento: '1020304050', razonSocial: 'Cliente CO',
      dianTaxProfile: {
        profile: 'CONSUMIDOR_FINAL', taxLevelCode: 'R-99-PN', taxLevelListName: '49',
        taxSchemeId: 'ZY', taxSchemeName: 'No causa',
      },
    },
    subtotal: 100, totalGravadas: 100, totalImpuestos: 19, importeTotal: 119,
    tasaImpuesto: 0.19, formaPago: 'CONTADO', medioPago: '10',
    fiscalContext: {
      isDemo: false, simulated: false,
      deliveryOperation: {
        tenantId: '11111111-1111-4111-8111-111111111111',
        operationId: '22222222-2222-4222-8222-222222222222',
        claimToken: '33333333-3333-4333-8333-333333333333',
      },
    },
    items: [{
      descripcion: 'Servicio', cantidad: 1, unidadMedida: 'NIU', precioUnitario: 100,
      valorVenta: 100, igv: 19, tasaIgv: 0.19,
    }],
  } as any;
}

function createService(options: {
  reserveError?: { message: string };
  sendResponse?: Record<string, unknown>;
  queryResponse?: Record<string, unknown>;
} = {}) {
  const rpc = jest.fn(async (name: string, _payload?: Record<string, any>) => {
    if (name === 'reservar_paquete_dian_tx') {
      return options.reserveError
        ? { data: null, error: options.reserveError }
        : { data: { package_year: 2026, package_sequence: 42, provider_code: '000' }, error: null };
    }
    if (name === 'sellar_envio_dian_tx') return { data: { sealed: true }, error: null };
    throw new Error(`RPC inesperada ${name}`);
  });
  const consultarRangosAutorizados = jest.fn().mockResolvedValue({
    rangos: [{
      prefijo: 'FV', desde: 1, hasta: 50000, resolucion: '18760000001',
      fechaInicio: new Date('2026-01-01T05:00:00Z'),
      fechaFin: new Date('2027-12-31T05:00:00Z'),
      claveTecnica: 'CLAVE-TECNICA-REAL-NO-PERSISTIR',
    }],
  });
  const enviarDocumento = jest.fn().mockResolvedValue(options.sendResponse || {
    success: false, pending: true, statusCode: 'DIAN_ASYNC_SUBMITTED',
    statusDescription: 'Enviado para validación', trackId: 'a'.repeat(96),
  });
  const apiClient = {
    configurar: jest.fn(), consultarRangosAutorizados, enviarDocumento,
    consultarEstado: jest.fn().mockResolvedValue(options.queryResponse || {
      success: false, estado: 'PENDIENTE', descripcion: 'Pendiente',
    }),
    consultarEstadoZip: jest.fn().mockResolvedValue(options.queryResponse || {
      success: false, estado: 'PENDIENTE', descripcion: 'Pendiente ZIP',
    }),
  };
  const signer = {
    firmarXML: jest.fn(async (xml: string) => xml.replace(
      '<ext:ExtensionContent/>',
      '<ext:ExtensionContent><ds:Signature Id="signature-real"/></ext:ExtensionContent>',
    )),
  };
  const supabase = { getClient: () => ({ rpc }) };
  const service = new DianFiscalService(
    { get: jest.fn(() => undefined) } as any,
    new DianXmlBuilderService(),
    signer as any,
    apiClient as any,
    supabase as any,
    { getTenantId: jest.fn(() => '11111111-1111-4111-8111-111111111111') } as any,
  );
  const tenantRuntime = {
    fiscalConfig: {
      url: 'https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc',
      usuario: 'usuario', password: 'password', empresaId: '9001234568',
      certificatePath: '/unused.p12', certificatePassword: 'cert-pass',
      environment: 'homologacion', pais: 'CO',
    },
    dianConfig: {
      url: 'https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc',
      environment: 'habilitacion', nit: '9001234568', softwareId: 'SOFTWARE-REAL',
      softwarePin: 'PIN-REAL-NO-PERSISTIR', testSetId: 'TEST-SET',
      certificatePfx: Buffer.from('pfx'), certificatePassword: 'cert-pass',
      authorityTrust: {
        caBundlePem: 'TEST-DIAN-CA-BUNDLE',
        allowedSpkiSha256: ['a'.repeat(64)],
      },
    },
    dianActive: true,
    externalApprovalValidated: false,
    certificateBuffer: Buffer.from('pfx'),
    snapshot: {
      isDemo: false,
      taxId: '9001234568',
      certificateSha256: 'c'.repeat(64),
      signingConfigSha256: 'd'.repeat(64),
      resolutionNumber: '18760000001', resolutionPrefix: 'FV',
      rangeFrom: 1, rangeTo: 50000,
      validFrom: '2026-01-01', validTo: '2027-12-31',
    },
  };
  const loadTenantConfig = jest.spyOn(service as any, 'loadTenantConfig')
    .mockResolvedValue(tenantRuntime);
  return {
    service, rpc, signer, apiClient, consultarRangosAutorizados, enviarDocumento,
    loadTenantConfig, tenantRuntime,
  };
}

describe('DianFiscalService · orquestación FEV 1.9', () => {
  it('prevalida una sola vez y firma con el snapshot oficial sin segundo GetNumberingRange', async () => {
    const ctx = createService();
    const issuerIdentity = {
      contractVersion: 529 as const,
      taxId: '9001234568',
      certificateSha256: 'c'.repeat(64),
      signingConfigSha256: 'd'.repeat(64),
    };
    const authorization = await ctx.service.prepararContextoFacturaAntesDeReserva({
      documentType: '01', series: 'FV', issueDate: '2026-08-29',
      issuerIdentity, taxes: { iva: 19, inc: 0, ica: 0 },
    }, '11111111-1111-4111-8111-111111111111');
    const document = realDocument();
    document.fiscalContext.dianIssuerIdentity = issuerIdentity;
    document.dianContext = authorization;

    const xml = await ctx.service.generarYFirmarDocumentoSinTransmitir(
      document,
      '11111111-1111-4111-8111-111111111111',
    );

    expect(xml).toContain('<ds:Signature Id="signature-real"/>');
    expect(ctx.consultarRangosAutorizados).toHaveBeenCalledTimes(1);
    expect(ctx.signer.firmarXML).toHaveBeenCalledTimes(1);
    expect(authorization.authorization).toEqual(expect.objectContaining({
      number: '18760000001', prefix: 'FV', rangeFrom: 1, rangeTo: 50000,
      technicalKey: 'CLAVE-TECNICA-REAL-NO-PERSISTIR',
    }));
  });

  it('rechaza divergencia del rango oficial antes de que el llamador pueda reservar', async () => {
    const ctx = createService();
    ctx.consultarRangosAutorizados.mockResolvedValue({
      rangos: [{
        prefijo: 'FV', desde: 1, hasta: 99999, resolucion: 'OTRA-RESOLUCION',
        fechaInicio: new Date('2026-01-01T05:00:00Z'),
        fechaFin: new Date('2027-12-31T05:00:00Z'),
        claveTecnica: 'CLAVE-DIVERGENTE',
      }],
    });

    await expect(ctx.service.prepararContextoFacturaAntesDeReserva({
      documentType: '01', series: 'FV', issueDate: '2026-08-29',
      issuerIdentity: {
        contractVersion: 529, taxId: '9001234568',
        certificateSha256: 'c'.repeat(64), signingConfigSha256: 'd'.repeat(64),
      },
      taxes: { iva: 19, inc: 0, ica: 0 },
    }, '11111111-1111-4111-8111-111111111111')).rejects.toThrow(
      'no coinciden con GetNumberingRange',
    );
    expect(ctx.signer.firmarXML).not.toHaveBeenCalled();
    expect(ctx.enviarDocumento).not.toHaveBeenCalled();
  });

  it('reserva paquete, obtiene TechnicalKey, firma, sella sin secreto y luego envía', async () => {
    const ctx = createService();
    const result = await ctx.service.enviarDocumento(realDocument());

    expect(result).toMatchObject({
      success: true, codigoRespuesta: 'DIAN_ASYNC_SUBMITTED',
      metadata: {
        pending: true, trackId: 'a'.repeat(96), uncertain: true,
        dianDeliveryStage: 'EXTERNAL_IO', dianSealed: true, dianIoAttempted: true,
      },
    });
    expect(ctx.rpc.mock.calls.map(([name]) => name)).toEqual([
      'reservar_paquete_dian_tx', 'sellar_envio_dian_tx',
    ]);
    expect(ctx.consultarRangosAutorizados).toHaveBeenCalledTimes(1);
    expect(ctx.enviarDocumento).toHaveBeenCalledWith(
      expect.stringContaining('<ds:Signature Id="signature-real"/>'),
      '',
      expect.objectContaining({
        packageYear: 2026, packageSequence: 42, providerCode: '000',
        certificatePfx: Buffer.from('pfx'), certificatePassword: 'cert-pass',
      }),
    );
    const reserveOrder = ctx.rpc.mock.invocationCallOrder[0];
    const rangeOrder = ctx.consultarRangosAutorizados.mock.invocationCallOrder[0];
    const sealOrder = ctx.rpc.mock.invocationCallOrder[1];
    const sendOrder = ctx.enviarDocumento.mock.invocationCallOrder[0];
    expect(reserveOrder).toBeLessThan(rangeOrder);
    expect(rangeOrder).toBeLessThan(sealOrder);
    expect(sealOrder).toBeLessThan(sendOrder);
    const sealPayload = ctx.rpc.mock.calls[1][1];
    expect(sealPayload.p_authorization).toMatchObject({
      source: 'DIAN_GET_NUMBERING_RANGE',
      technical_key_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(JSON.stringify(sealPayload)).not.toContain('CLAVE-TECNICA-REAL-NO-PERSISTIR');
    expect(JSON.stringify(sealPayload)).not.toContain('PIN-REAL-NO-PERSISTIR');
  });

  it('orquesta una factura de resolución sin prefijo con identidad fiscal no rellenada', async () => {
    const ctx = createService();
    const document = realDocument();
    document.serie = '';
    ctx.consultarRangosAutorizados.mockResolvedValue({
      rangos: [{
        prefijo: '', desde: 1, hasta: 50000, resolucion: '18760000001',
        fechaInicio: new Date('2026-01-01T05:00:00Z'),
        fechaFin: new Date('2027-12-31T05:00:00Z'),
        claveTecnica: 'CLAVE-TECNICA-REAL-NO-PERSISTIR',
      }],
    });
    ctx.loadTenantConfig.mockResolvedValue({
      ...ctx.tenantRuntime,
      snapshot: { ...ctx.tenantRuntime.snapshot, resolutionPrefix: '' },
    });

    const result = await ctx.service.enviarDocumento(document);

    expect(result.success).toBe(true);
    const unsigned = ctx.signer.firmarXML.mock.calls[0][0];
    expect(unsigned).toContain('<cbc:ID>125</cbc:ID>');
    expect(unsigned).not.toContain('<sts:Prefix');
    expect(ctx.enviarDocumento).toHaveBeenCalledTimes(1);
  });

  it('falla antes de rango, firma y transporte si no puede reservar el paquete', async () => {
    const ctx = createService({ reserveError: { message: 'DIAN_OPERATION_CLAIM_INVALID' } });
    const result = await ctx.service.enviarDocumento(realDocument());

    expect(result.success).toBe(false);
    expect(result.descripcionRespuesta).toContain('DIAN_OPERATION_CLAIM_INVALID');
    expect(result.metadata).toMatchObject({
      dianDeliveryStage: 'PREFLIGHT', dianSealed: false, dianIoAttempted: false,
    });
    expect(ctx.consultarRangosAutorizados).not.toHaveBeenCalled();
    expect(ctx.signer.firmarXML).not.toHaveBeenCalled();
    expect(ctx.enviarDocumento).not.toHaveBeenCalled();
  });

  it('falla antes de reservar o transmitir si falta el trust store DIAN o sus pins', async () => {
    const ctx = createService();
    ctx.loadTenantConfig.mockResolvedValue({
      ...ctx.tenantRuntime,
      dianConfig: { ...ctx.tenantRuntime.dianConfig, authorityTrust: undefined },
    });

    const result = await ctx.service.enviarDocumento(realDocument());

    expect(result).toMatchObject({
      success: false,
      descripcionRespuesta: expect.stringContaining('authority_trust_bundle'),
      metadata: {
        dianDeliveryStage: 'PREFLIGHT',
        dianSealed: false,
        dianIoAttempted: false,
        technical: true,
      },
    });
    expect(result.descripcionRespuesta).toContain('authority_trust_spki_pins');
    expect(ctx.rpc).not.toHaveBeenCalled();
    expect(ctx.signer.firmarXML).not.toHaveBeenCalled();
    expect(ctx.enviarDocumento).not.toHaveBeenCalled();
  });

  it('conserva ApplicationResponse real dentro del AttachedDocument aceptado', async () => {
    const response = `<?xml version="1.0" encoding="UTF-8"?>
      <ApplicationResponse xmlns="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2"
        xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
        xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
        <cbc:ID>DIAN-VALIDATOR</cbc:ID><cbc:IssueDate>2026-08-29</cbc:IssueDate>
        <cbc:IssueTime>11:00:00-05:00</cbc:IssueTime><cbc:CompanyID>800197268</cbc:CompanyID>
        <cbc:ResponseCode>00</cbc:ResponseCode><ds:Signature Id="dian-signature"/>
      </ApplicationResponse>`;
    const ctx = createService();
    ctx.enviarDocumento.mockImplementation(async (xml: string) => {
      const cufe = /<cbc:UUID[^>]*>([^<]+)<\/cbc:UUID>/u.exec(xml)?.[1] ?? '';
      return {
        success: true,
        statusCode: '00',
        statusDescription: 'Aceptado',
        cufe,
        xmlResponse: response,
        authoritySignatureTrusted: true,
        applicationResponseEvidence: {
          rootNamespace: 'urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2',
          signatureCount: 1,
          referencedDocumentKeys: [cufe.toUpperCase()],
          responseCodes: ['02'],
        },
      };
    });
    const result = await ctx.service.enviarDocumento(realDocument());

    expect(result.success).toBe(true);
    expect(result.cdr).toContain('<AttachedDocument');
    expect(result.cdr).toContain('<![CDATA[');
    expect(ctx.signer.firmarXML).toHaveBeenCalledTimes(2);
    const attachedBeforeSigning = ctx.signer.firmarXML.mock.calls[1][0];
    expect(attachedBeforeSigning).toContain('<AttachedDocument');
    expect(attachedBeforeSigning).toMatch(
      /<cac:SenderParty>[\s\S]*?<cbc:CompanyID[^>]*schemeID="8"[^>]*>900123456<\/cbc:CompanyID>[\s\S]*?<\/cac:SenderParty>/u,
    );
    expect(attachedBeforeSigning).toMatch(
      /<cac:ReceiverParty>[\s\S]*?<cbc:CompanyID[^>]*>1020304050<\/cbc:CompanyID>[\s\S]*?<\/cac:ReceiverParty>/u,
    );
    expect(attachedBeforeSigning.match(/<ds:Signature Id="signature-real"\/>/g)).toHaveLength(1);
    expect(result.cdr?.match(/<ds:Signature Id="signature-real"\/>/g)).toHaveLength(2);
    expect(result.cdr).toContain('<ds:Signature Id="dian-signature"/>');
    expect(result.metadata.applicationResponse).toContain('<ApplicationResponse');
    expect(result.metadata.attachedDocument).toBe(result.cdr);
  });

  it('propaga un rechazo terminal sólo con ApplicationResponse DIAN confiable y CUFE exacto', async () => {
    const ctx = createService();
    ctx.enviarDocumento.mockImplementation(async (xml: string) => {
      const cufe = /<cbc:UUID[^>]*>([^<]+)<\/cbc:UUID>/u.exec(xml)?.[1] ?? '';
      const applicationResponse = `<ApplicationResponse xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><UUID>${cufe}</UUID><ds:Signature /></ApplicationResponse>`;
      return {
        success: false,
        authorityResponse: true,
        technical: false,
        uncertain: false,
        authoritySignatureTrusted: true,
        statusCode: '66',
        statusDescription: 'Regla DIAN incumplida',
        cufe,
        xmlResponse: applicationResponse,
        applicationResponseEvidence: {
          rootNamespace: 'urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2',
          signatureCount: 1,
          referencedDocumentKeys: [cufe.toUpperCase()],
          responseCodes: ['04'],
        },
        errors: ['Regla DIAN incumplida'],
      };
    });

    const result = await ctx.service.enviarDocumento(realDocument());

    expect(result).toMatchObject({
      success: false,
      codigoRespuesta: '66',
      cdr: expect.stringContaining('<ApplicationResponse'),
      metadata: {
        authorityResponse: true,
        technical: false,
        uncertain: false,
        authoritySignatureTrusted: true,
        applicationResponse: expect.stringContaining('<ApplicationResponse'),
      },
    });
  });

  it('degrada una negativa sin evidencia DIAN completa a resultado técnico incierto', async () => {
    const ctx = createService({
      sendResponse: {
        success: false,
        authorityResponse: false,
        technical: true,
        uncertain: true,
        authoritySignatureTrusted: false,
        statusCode: '66',
        statusDescription: 'Respuesta incompleta',
        errors: ['Respuesta incompleta'],
      },
    });

    await expect(ctx.service.enviarDocumento(realDocument())).resolves.toMatchObject({
      success: false,
      codigoRespuesta: 'DIAN_REJECTION_EVIDENCE_INVALID',
      metadata: {
        authorityResponse: false,
        technical: true,
        uncertain: true,
      },
    });
  });

  it('propaga el ApplicationResponse de GetStatus como CDR terminal', async () => {
    const applicationResponse = '<ApplicationResponse><ResponseCode>00</ResponseCode></ApplicationResponse>';
    const ctx = createService({
      queryResponse: {
        success: true, estado: 'ACEPTADO', descripcion: 'Validado',
        cufe: 'c'.repeat(96), xmlResponse: applicationResponse,
        authorityStatusCode: '00', explicitNotFound: false,
        authorityResponse: true, technical: false,
        authoritySignatureTrusted: true,
        applicationResponseEvidence: {
          rootNamespace: 'urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2',
          signatureCount: 1,
          referencedDocumentKeys: ['c'.repeat(96)],
          responseCodes: ['02'],
        },
      },
    });
    const result = await ctx.service.consultarEstado({
      empresaId: '', tipoDocumento: '01', serie: 'FV', numero: '125', hash: 'c'.repeat(96),
    });
    expect(result).toMatchObject({
      success: true, codigoRespuesta: '00', cdr: applicationResponse,
      metadata: { estado: 'ACEPTADO', authorityStatusCode: '00' },
    });
  });

  it.each([
    ['RECHAZADO', 'DIAN_REJECTED'],
    ['PENDIENTE', 'DIAN_PENDING'],
  ] as const)('conserva el estado autoritativo %s sin degradarlo a error técnico', async (estado, codigoRespuesta) => {
    const ctx = createService({
      queryResponse: {
        success: false,
        estado,
        descripcion: estado === 'RECHAZADO' ? 'Regla DIAN incumplida' : 'Validación en curso',
        authorityStatusCode: estado === 'RECHAZADO' ? '99' : undefined,
        explicitNotFound: false,
      },
    });

    await expect(ctx.service.consultarEstado({
      empresaId: '', tipoDocumento: '01', serie: 'FV', numero: '125', hash: 'c'.repeat(96),
    })).resolves.toMatchObject({
      success: false,
      codigoRespuesta,
      metadata: { estado },
    });
  });

  it('consulta una ZipKey de habilitación exclusivamente con GetStatusZip', async () => {
    const ctx = createService();
    const zipKey = 'd'.repeat(96);
    const result = await ctx.service.consultarEstado({
      empresaId: '', tipoDocumento: '01', serie: 'FV', numero: '125',
      hash: zipKey, dianQueryKind: 'ZIP_TRACK_ID',
    });

    expect(ctx.apiClient.consultarEstadoZip).toHaveBeenCalledWith(
      zipKey,
      expect.objectContaining({ softwareId: 'SOFTWARE-REAL' }),
    );
    expect(ctx.apiClient.consultarEstado).not.toHaveBeenCalled();
    expect(result.metadata).toMatchObject({
      dianQueryKind: 'ZIP_TRACK_ID',
      dianQueryKey: zipKey,
    });
  });

  it('falla cerrado sin reservar, firmar ni consultar cuando DIAN está desactivado', async () => {
    const ctx = createService();
    ctx.loadTenantConfig.mockResolvedValue({ ...ctx.tenantRuntime, dianActive: false });

    const send = await ctx.service.enviarDocumento(realDocument());
    const query = await ctx.service.consultarEstado({
      empresaId: '', tipoDocumento: '01', serie: 'FV', numero: '125', hash: 'e'.repeat(96),
    });

    expect(send).toMatchObject({ success: false, descripcionRespuesta: expect.stringContaining('DIAN_DISABLED') });
    expect(query).toMatchObject({ success: false, descripcionRespuesta: expect.stringContaining('DIAN_DISABLED') });
    expect(ctx.rpc).not.toHaveBeenCalled();
    expect(ctx.signer.firmarXML).not.toHaveBeenCalled();
    expect(ctx.apiClient.consultarEstado).not.toHaveBeenCalled();
    expect(ctx.apiClient.consultarEstadoZip).not.toHaveBeenCalled();
  });

  it('no transmite a producción sólo por cambiar el selector sin evidencia TestSet aceptada', async () => {
    const ctx = createService();
    ctx.loadTenantConfig.mockResolvedValue({
      ...ctx.tenantRuntime,
      dianConfig: { ...ctx.tenantRuntime.dianConfig, environment: 'produccion' },
      dianActive: true,
      externalApprovalValidated: false,
    });

    const result = await ctx.service.enviarDocumento(realDocument());

    expect(result).toMatchObject({
      success: false,
      descripcionRespuesta: expect.stringContaining('DIAN_TEST_SET_APPROVAL_EVIDENCE_REQUIRED'),
    });
    expect(ctx.rpc).not.toHaveBeenCalled();
    expect(ctx.enviarDocumento).not.toHaveBeenCalled();
  });

  it('mantiene NIT, software y certificado aislados entre dos tenants concurrentes', async () => {
    const ctx = createService();
    const runtimeA = {
      ...ctx.tenantRuntime,
      dianConfig: {
        ...ctx.tenantRuntime.dianConfig,
        nit: '9001234568', softwareId: 'SOFTWARE-A', softwarePin: 'PIN-A',
        certificatePfx: Buffer.from('pfx-a'),
      },
      certificateBuffer: Buffer.from('pfx-a'),
    };
    const runtimeB = {
      ...ctx.tenantRuntime,
      dianConfig: {
        ...ctx.tenantRuntime.dianConfig,
        nit: '9001082813', softwareId: 'SOFTWARE-B', softwarePin: 'PIN-B',
        certificatePfx: Buffer.from('pfx-b'),
      },
      certificateBuffer: Buffer.from('pfx-b'),
    };
    ctx.loadTenantConfig.mockReset()
      .mockResolvedValueOnce(runtimeA)
      .mockResolvedValueOnce(runtimeB);

    let releaseA!: () => void;
    let notifyAAtReserve!: () => void;
    const aCanContinue = new Promise<void>((resolve) => { releaseA = resolve; });
    const aAtReserve = new Promise<void>((resolve) => { notifyAAtReserve = resolve; });
    const tenantA = '11111111-1111-4111-8111-111111111111';
    ctx.rpc.mockImplementation(async (name: string, payload: Record<string, any>) => {
      if (name === 'reservar_paquete_dian_tx') {
        if (payload.p_tenant_id === tenantA) {
          notifyAAtReserve();
          await aCanContinue;
        }
        return { data: { package_year: 2026, package_sequence: 42, provider_code: '000' }, error: null };
      }
      if (name === 'sellar_envio_dian_tx') return { data: { sealed: true }, error: null };
      throw new Error(`RPC inesperada ${name}`);
    });

    const documentA = realDocument();
    const documentB = realDocument();
    documentA.emisor.numeroDocumento = '9001234568';
    documentB.id = 'cpe-real-co-b';
    documentB.numero = '126';
    documentB.emisor.numeroDocumento = '9001082813';
    documentB.fiscalContext.deliveryOperation = {
      tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      operationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      claimToken: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    };

    const pendingA = ctx.service.enviarDocumento(documentA);
    await aAtReserve;
    const pendingB = ctx.service.enviarDocumento(documentB);
    await pendingB;
    releaseA();
    await pendingA;

    const callA = ctx.enviarDocumento.mock.calls.find(([xml]) => xml.includes('<cbc:ID>FV125</cbc:ID>'));
    const callB = ctx.enviarDocumento.mock.calls.find(([xml]) => xml.includes('<cbc:ID>FV126</cbc:ID>'));
    expect(callA?.[2]).toMatchObject({
      nit: '9001234568', softwareId: 'SOFTWARE-A', softwarePin: 'PIN-A',
      certificatePfx: Buffer.from('pfx-a'), packageSequence: 42,
    });
    expect(callB?.[2]).toMatchObject({
      nit: '9001082813', softwareId: 'SOFTWARE-B', softwarePin: 'PIN-B',
      certificatePfx: Buffer.from('pfx-b'), packageSequence: 42,
    });
    expect(ctx.tenantRuntime.dianConfig).not.toHaveProperty('packageSequence');
  });
});
