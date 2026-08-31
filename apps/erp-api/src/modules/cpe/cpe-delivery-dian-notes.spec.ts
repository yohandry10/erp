import { CpeDeliveryService } from './cpe-delivery.service';
import { DianFiscalService } from '../fiscal/dian-fiscal.service';
import { DianXmlBuilderService } from '../fiscal/colombia/dian-xml-builder.service';
import { createHash } from 'crypto';

jest.mock('../../shared/utils/fiscal-transport-guard', () => ({
  assertExternalFiscalTransportAllowed: jest.fn(async () => undefined),
}));

const TENANT_ID = '11111111-1111-4111-8111-111111111111';

function certificateSha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function signingConfigSha256(config: Record<string, any>): string {
  const certificateHash = certificateSha256(config.certificado_pfx);
  return createHash('sha256').update([
    certificateHash,
    config.dian_activo === true ? 'true' : 'false',
    String(config.dian_url ?? '').trim(),
    String(config.dian_software_id ?? '').trim(),
    String(config.dian_test_set_id ?? '').trim(),
    String(config.dian_environment ?? '').trim().toUpperCase(),
    String(config.dian_resolucion_numero ?? '').trim(),
    String(config.dian_resolucion_prefijo ?? '').trim().toUpperCase(),
    config.dian_resolucion_desde == null ? '' : String(config.dian_resolucion_desde),
    config.dian_resolucion_hasta == null ? '' : String(config.dian_resolucion_hasta),
    String(config.dian_resolucion_fecha_inicio ?? '').trim(),
    String(config.dian_resolucion_fecha_fin ?? '').trim(),
    String(config.dian_habilitacion_estado ?? '').trim().toUpperCase(),
  ].join('\u001f'), 'utf8').digest('hex');
}

describe('CpeDeliveryService → DianFiscalService · notas referenciadas 91/92', () => {
  function setup(noteType: '91' | '92') {
    const sourceIsInvoice = noteType === '91';
    const sourceCode = sourceIsInvoice ? 'A'.repeat(96) : 'B'.repeat(96);
    const source = {
      id: 'cpe-source',
      documento_id: '44444444-4444-4444-8444-444444444444',
      tipo_documento: sourceIsInvoice ? '01' : '91',
      serie: sourceIsInvoice ? 'FV01' : 'NC01',
      numero: sourceIsInvoice ? '125' : '10',
      fecha_emision: '2026-08-20T10:00:00-05:00',
      metadata: {
        dian_numbering_contract_version: 530,
        dian_prefijo_autorizado: sourceIsInvoice ? 'FV01' : 'NC01',
        numero_fiscal: sourceIsInvoice ? 'FV01125' : 'NC0110',
      },
      simulated_origin: false,
      fiscal_authority_evidence: {
        status: 'ACCEPTED', authority: 'DIAN', country_code: 'CO',
        code_kind: sourceIsInvoice ? 'CUFE' : 'CUDE', unique_code: sourceCode,
      },
    };
    const companyConfig: Record<string, any> = {
      ruc: '9001234568', razon_social: 'EMISOR CO SAS',
      direccion_fiscal: 'Carrera 7 # 10-20', provincia: 'Bogotá D.C.',
      departamento: 'Bogotá D.C.', ubigeo: '11001',
      dian_regimen_fiscal: 'O-13', dian_tipo_contribuyente: '1',
      certificado_pfx: Buffer.from('pfx'), certificado_password: 'cert-pass',
      dian_activo: true,
      dian_url: 'https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc',
      dian_software_id: 'SOFTWARE-ID', dian_software_pin: 'SOFTWARE-PIN',
      dian_test_set_id: 'TEST-SET', dian_environment: 'HOMOLOGACION',
      dian_resolucion_numero: '187640529', dian_resolucion_prefijo: 'FV01',
      dian_resolucion_desde: 1, dian_resolucion_hasta: 999999,
      dian_resolucion_fecha_inicio: '2026-01-01',
      dian_resolucion_fecha_fin: '2027-12-31',
      dian_habilitacion_estado: 'HABILITADO', is_demo: false,
    };
    const issuerSnapshot = {
      contract_version: 525,
      source: 'DIAN_REFERENCED_NOTE_529',
      dian_note_issuer_contract_version: 529,
      config_identity_contract_version: 529,
      country_code: 'CO', tax_id: '9001234568', legal_name: 'EMISOR CO SAS',
      address: 'Carrera 7 # 10-20', municipality: 'Bogotá D.C.',
      department: 'Bogotá D.C.', municipality_code: '11001', department_code: '11',
      tax_regime: 'O-13', contributor_type: '1', currency_code: 'COP',
      certificate_sha256: certificateSha256(companyConfig.certificado_pfx),
      signing_config_sha256: signingConfigSha256(companyConfig),
    };
    const note = {
      id: `cpe-note-${noteType}`,
      tenant_id: TENANT_ID,
      documento_id: `document-note-${noteType}`,
      documento_referencia_id: source.documento_id,
      simulated_origin: false,
      pais: 'CO',
      issuer_snapshot: issuerSnapshot,
      tipo_documento: noteType,
      serie: noteType === '91' ? 'NC01' : 'ND01',
      numero: noteType === '91' ? 7 : 8,
      fecha_emision: '2026-08-29T10:15:30-05:00',
      fecha_vencimiento: '2026-08-29T10:15:30-05:00',
      ruc_emisor: '9001234568',
      razon_social_emisor: 'EMISOR CO SAS',
      direccion_emisor: 'Carrera 7 # 10-20',
      tipo_documento_receptor: '13',
      documento_receptor: '1020304050',
      razon_social_receptor: 'CLIENTE CO',
      moneda: 'COP',
      total_gravadas: '100.00', total_exoneradas: '0', total_inafectas: '0',
      total_igv: '19.00', total_venta: '119.00',
      items: [{
        descripcion: 'Ajuste fiscal', cantidad: 1, precio_unitario: 100,
        valor_venta: 100, impuesto_igv: 19, precio_venta: 119,
        tasa_igv: 19, unidad_medida: 'NIU', codigo_producto: 'AJUSTE-01',
      }],
      documento_referencia_tipo: source.tipo_documento,
      documento_referencia_serie: source.metadata.dian_prefijo_autorizado,
      documento_referencia_numero: source.metadata.numero_fiscal,
      tipo_nota_credito: noteType === '91' ? '1' : null,
      tipo_nota_debito: noteType === '92' ? '2' : null,
      motivo_nota: noteType === '91' ? 'Devolución parcial' : 'Intereses por mora',
      metadata: {
        issuer_snapshot: issuerSnapshot,
        dian_note_issuer_contract_version: 529,
        codigo_motivo: noteType === '91' ? '1' : '2',
        dian_direccion_emisor: 'Carrera 7 # 10-20',
        dian_municipio_emisor: 'Bogotá D.C.',
        dian_departamento_emisor: 'Bogotá D.C.',
        dian_codigo_dane_emisor: '11001',
        dian_codigo_departamento_emisor: '11',
        dian_regimen_fiscal: 'O-13',
        dian_tipo_contribuyente: '1',
        dian_forma_pago: 'CONTADO', dian_medio_pago: '10',
        dian_receptor_tax_profile: {
          profile: 'CONSUMIDOR_FINAL', taxLevelCode: 'R-99-PN',
          taxLevelListName: '49', taxSchemeId: 'ZY', taxSchemeName: 'No causa',
        },
      },
    };

    const sourceChain: any = {
      select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: source, error: null }),
    };
    const companyChain: any = {
      select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: companyConfig,
        error: null,
      }),
    };
    const rpc = jest.fn(async (name: string, _args?: any) => {
      if (name === 'reservar_envio_cpe_tx') {
        return {
          data: {
            claimed: true, cpe: note,
            operation: {
              id: '22222222-2222-4222-8222-222222222222',
              claim_token: '33333333-3333-4333-8333-333333333333',
            },
          },
          error: null,
        };
      }
      if (name === 'reservar_paquete_dian_tx') {
        return {
          data: { package_year: 2026, package_sequence: noteType === '91' ? 71 : 72, provider_code: '000' },
          error: null,
        };
      }
      if (name === 'sellar_envio_dian_tx') return { data: { sealed: true }, error: null };
      if (name === 'finalizar_envio_cpe_tx') {
        return {
          data: {
            claimed: true, cpe: { ...note, estado: 'ACEPTADO' },
            operation: { id: '22222222-2222-4222-8222-222222222222', result_kind: 'ACCEPTED' },
          },
          error: null,
        };
      }
      throw new Error(`RPC inesperada ${name}`);
    });
    let sealedDocumentKey = '';
    const operationChain: any = {
      select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn(async () => ({
        data: { request_summary: { dian_unique_code: sealedDocumentKey } },
        error: null,
      })),
    };
    const client = {
      rpc,
      from: jest.fn((table: string) => table === 'empresa_config'
        ? companyChain
        : table === 'cpe_operaciones' ? operationChain : sourceChain),
    };

    const apiClient = {
      enviarDocumento: jest.fn(async (xml: string) => {
        const documentKey = /<cbc:UUID[^>]*>([^<]+)<\/cbc:UUID>/u.exec(xml)?.[1]
          ?.trim().toUpperCase() ?? '';
        sealedDocumentKey = documentKey;
        const applicationResponse = `<ApplicationResponse xmlns="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><cbc:ID>DIAN-VALIDATOR</cbc:ID><cbc:IssueDate>2026-08-29</cbc:IssueDate><cbc:IssueTime>11:00:00-05:00</cbc:IssueTime><cbc:CompanyID>8001972684</cbc:CompanyID><cac:DocumentResponse><cac:Response><cbc:ResponseCode>02</cbc:ResponseCode></cac:Response><cac:DocumentReference><cbc:UUID>${documentKey}</cbc:UUID></cac:DocumentReference></cac:DocumentResponse><ds:Signature /></ApplicationResponse>`;
        return {
          success: true, pending: false, statusCode: '00', statusDescription: 'Aceptado',
          authorityResponse: true, technical: false, uncertain: false,
          signatureVerified: true, authoritySignatureTrusted: true,
          cufe: documentKey, xmlResponse: applicationResponse,
          applicationResponseEvidence: {
            rootNamespace: 'urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2',
            signatureCount: 1,
            referencedDocumentKeys: [documentKey],
            responseCodes: ['02'],
          },
        };
      }),
    };
    const dian = new DianFiscalService(
      { get: jest.fn(() => undefined) } as any,
      new DianXmlBuilderService(),
      {
        firmarXML: jest.fn(async (xml: string) => xml.replace(
          '<ext:ExtensionContent/>',
          '<ext:ExtensionContent><ds:Signature Id="signature-real"/></ext:ExtensionContent>',
        )),
      } as any,
      apiClient as any,
      { getClient: () => client } as any,
      { getTenantId: jest.fn(() => TENANT_ID) } as any,
    );
    const dianRuntime = {
      fiscalConfig: {
        url: 'https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc',
        usuario: 'user', password: 'pass', empresaId: '9001234568',
        certificatePath: '/unused.p12', certificatePassword: 'cert-pass',
        environment: 'homologacion', pais: 'CO',
      },
      dianConfig: {
        url: 'https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc',
        environment: 'habilitacion', nit: '9001234568', softwareId: 'SOFTWARE-ID',
        softwarePin: 'SOFTWARE-PIN', testSetId: 'TEST-SET',
        certificatePfx: Buffer.from('pfx'), certificatePassword: 'cert-pass',
        authorityTrust: {
          caBundlePem: 'TEST-DIAN-CA-BUNDLE',
          allowedSpkiSha256: ['a'.repeat(64)],
        },
      },
      dianActive: true, externalApprovalValidated: false,
      certificateBuffer: Buffer.from('pfx'),
      snapshot: {
        isDemo: false,
        taxId: issuerSnapshot.tax_id,
        certificateSha256: issuerSnapshot.certificate_sha256,
        signingConfigSha256: issuerSnapshot.signing_config_sha256,
      },
    };
    jest.spyOn(dian as any, 'loadTenantConfig').mockResolvedValue(dianRuntime);

    const fiscalAdapter = {
      obtenerCodigoPais: jest.fn(async () => 'CO'),
      obtenerNombreServicioFiscal: jest.fn(async () => 'DIAN'),
      obtenerConfiguracionFiscal: jest.fn(async () => ({ tasaImpuesto: 19 })),
      generarYFirmarDocumentoSinTransmitir: jest.fn(async (documento) => {
        const xml = await dian.generarXML(documento);
        return dian.firmarXML(xml);
      }),
      enviarDocumento: jest.fn((documento) => dian.enviarDocumento(documento)),
    };
    const delivery = new CpeDeliveryService(
      { getClient: () => client } as any,
      fiscalAdapter as any,
      {} as any,
      {} as any,
    );
    return {
      delivery, fiscalAdapter, sourceChain, apiClient, rpc, source, note,
      companyConfig, issuerSnapshot, dianRuntime,
    };
  }

  it.each([
    ['91', 'CreditNote', 'CUFE-SHA384'],
    ['92', 'DebitNote', 'CUDE-SHA384'],
  ] as const)(
    'firma localmente el UBL DIAN %s correcto sin reservar SEND ni transmitir',
    async (noteType, root, uuidScheme) => {
      const ctx = setup(noteType);

      const signedXml = await ctx.delivery.firmarNotaDianReferenciada(
        ctx.note,
        TENANT_ID,
      );

      expect(signedXml).toContain(`<${root}`);
      expect(signedXml).toContain('<ds:Signature Id="signature-real"');
      expect(signedXml).toContain(`schemeName="${uuidScheme}"`);
      expect(signedXml).toContain(ctx.source.fiscal_authority_evidence.unique_code);
      expect(signedXml).toContain(
        `<cbc:ReferenceID>${ctx.source.metadata.numero_fiscal}</cbc:ReferenceID>`,
      );
      expect(signedXml).toContain(`<cbc:ID>${ctx.source.metadata.numero_fiscal}</cbc:ID>`);
      expect(ctx.fiscalAdapter.generarYFirmarDocumentoSinTransmitir)
        .toHaveBeenCalledWith(expect.objectContaining({
          tipoDocumento: noteType,
          moneda: 'COP',
          documentoReferencia: expect.objectContaining({
            uuid: ctx.source.fiscal_authority_evidence.unique_code,
            uuidSchemeName: uuidScheme,
          }),
          fiscalContext: expect.objectContaining({
            dianIssuerIdentity: {
              contractVersion: 529,
              taxId: ctx.issuerSnapshot.tax_id,
              certificateSha256: ctx.issuerSnapshot.certificate_sha256,
              signingConfigSha256: ctx.issuerSnapshot.signing_config_sha256,
            },
          }),
        }), TENANT_ID, 'CO');
      expect(ctx.apiClient.enviarDocumento).not.toHaveBeenCalled();
      expect(ctx.rpc).not.toHaveBeenCalledWith(
        'reservar_envio_cpe_tx',
        expect.anything(),
      );
    },
  );

  it.each([
    ['91', 'CUFE-SHA384', '1', 'Devolución parcial'],
    ['92', 'CUDE-SHA384', '2', 'Intereses por mora'],
  ] as const)(
    'resuelve origen aceptado y transmite nota %s con UUID y discrepancia DIAN',
    async (noteType, uuidScheme, responseCode, description) => {
      const ctx = setup(noteType);

      await expect(ctx.delivery.sendToOse(ctx.note.id, TENANT_ID)).resolves.toMatchObject({
        resultKind: 'ACCEPTED',
      });

      expect(ctx.sourceChain.eq).toHaveBeenCalledWith('tenant_id', TENANT_ID);
      expect(ctx.sourceChain.eq).toHaveBeenCalledWith('documento_id', ctx.source.documento_id);
      const signedXml = ctx.apiClient.enviarDocumento.mock.calls[0][0] as string;
      expect(signedXml).toContain('<cac:DiscrepancyResponse>');
      expect(signedXml).toContain(`<cbc:ResponseCode>${responseCode}</cbc:ResponseCode>`);
      expect(signedXml).toContain(`<cbc:Description>${description}</cbc:Description>`);
      expect(signedXml).toContain(`schemeName="${uuidScheme}"`);
      expect(signedXml).toContain(ctx.source.fiscal_authority_evidence.unique_code);
    },
  );

  it('conserva una identidad DIAN exacta cuando la resolución no tiene prefijo', async () => {
    const ctx = setup('91');
    ctx.source.serie = '';
    ctx.source.numero = '00000125';
    ctx.source.metadata.dian_prefijo_autorizado = '';
    ctx.source.metadata.numero_fiscal = '125';
    ctx.note.documento_referencia_serie = '';
    ctx.note.documento_referencia_numero = '125';

    const signedXml = await ctx.delivery.firmarNotaDianReferenciada(
      ctx.note,
      TENANT_ID,
    );

    expect(signedXml).toContain('<cbc:ReferenceID>125</cbc:ReferenceID>');
    expect(signedXml).toContain('<cbc:ID>125</cbc:ID>');
    expect(signedXml).not.toContain('00000125');
  });

  it.each([
    ['padding operativo', 'FV01', '00000125'],
    ['alias interno', 'DABC', 'DABC125'],
  ])('rechaza %s como sustituto de la identidad fiscal exacta', async (_case, serie, numero) => {
    const ctx = setup('91');
    ctx.note.documento_referencia_serie = serie;
    ctx.note.documento_referencia_numero = numero;

    await expect(ctx.delivery.firmarNotaDianReferenciada(
      ctx.note,
      TENANT_ID,
    )).rejects.toThrow(/referencia fiscal.*no coincide/i);
    expect(ctx.fiscalAdapter.generarYFirmarDocumentoSinTransmitir).not.toHaveBeenCalled();
  });

  it('falla cerrado si el origen aceptado no conserva metadata.numero_fiscal', async () => {
    const ctx = setup('91');
    delete (ctx.source.metadata as any).numero_fiscal;

    await expect(ctx.delivery.firmarNotaDianReferenciada(
      ctx.note,
      TENANT_ID,
    )).rejects.toThrow(/no conserva su identidad fiscal exacta/i);
    expect(ctx.fiscalAdapter.generarYFirmarDocumentoSinTransmitir).not.toHaveBeenCalled();
  });

  it.each([
    ['NIT', 'ruc', '9009999999'],
    ['municipio', 'provincia', 'Medellín'],
    ['régimen', 'dian_regimen_fiscal', 'O-99'],
  ])('falla cerrado si cambia %s del emisor después de crear la nota', async (
    _label,
    field,
    changedValue,
  ) => {
    const ctx = setup('91');
    ctx.companyConfig[field] = changedValue;

    await expect(ctx.delivery.firmarNotaDianReferenciada(
      ctx.note,
      TENANT_ID,
    )).rejects.toThrow(/configuración vigente del emisor DIAN diverge/i);
    expect(ctx.fiscalAdapter.generarYFirmarDocumentoSinTransmitir).not.toHaveBeenCalled();
    expect(ctx.apiClient.enviarDocumento).not.toHaveBeenCalled();
  });

  it('falla cerrado si cambia el certificado después de crear la nota', async () => {
    const ctx = setup('91');
    ctx.companyConfig.certificado_pfx = Buffer.from('pfx-renovado');

    await expect(ctx.delivery.firmarNotaDianReferenciada(
      ctx.note,
      TENANT_ID,
    )).rejects.toThrow(/certificado DIAN vigente diverge/i);
    expect(ctx.fiscalAdapter.generarYFirmarDocumentoSinTransmitir).not.toHaveBeenCalled();
  });

  it('no transmite si la configuración de firma cambió después del snapshot', async () => {
    const ctx = setup('92');
    ctx.companyConfig.dian_software_id = 'SOFTWARE-ID-ROTADO';

    await expect(ctx.delivery.sendToOse(ctx.note.id, TENANT_ID)).rejects.toThrow(
      /configuración de firma DIAN vigente diverge/i,
    );
    expect(ctx.apiClient.enviarDocumento).not.toHaveBeenCalled();
    expect(ctx.rpc).toHaveBeenCalledWith(
      'finalizar_envio_cpe_tx',
      expect.objectContaining({ p_result_kind: 'TECHNICAL_ERROR' }),
    );
  });

  it('vuelve a comprobar la identidad dentro del runtime que genera y firma', async () => {
    const ctx = setup('91');
    ctx.dianRuntime.snapshot.signingConfigSha256 = 'f'.repeat(64);

    await expect(ctx.delivery.firmarNotaDianReferenciada(
      ctx.note,
      TENANT_ID,
    )).rejects.toThrow(/DIAN_NOTE_ISSUER_RUNTIME_IDENTITY_MISMATCH/);
    expect(ctx.fiscalAdapter.generarYFirmarDocumentoSinTransmitir).toHaveBeenCalledTimes(1);
    expect(ctx.apiClient.enviarDocumento).not.toHaveBeenCalled();
  });

  it('no usa metadata ni configuración actual como fallback de un snapshot incompleto', async () => {
    const ctx = setup('91');
    delete (ctx.note.issuer_snapshot as any).certificate_sha256;

    await expect(ctx.delivery.firmarNotaDianReferenciada(
      ctx.note,
      TENANT_ID,
    )).rejects.toThrow(/snapshot inmutable.*incompleto/i);
    expect(ctx.fiscalAdapter.generarYFirmarDocumentoSinTransmitir).not.toHaveBeenCalled();
  });

  it('falla antes de DianFiscal cuando el origen no tiene evidencia aceptada', async () => {
    const ctx = setup('91');
    ctx.source.fiscal_authority_evidence.status = 'PENDING';

    await expect(ctx.delivery.sendToOse(ctx.note.id, TENANT_ID)).rejects.toThrow(
      /no tiene CUFE\/CUDE aceptado/i,
    );
    expect(ctx.apiClient.enviarDocumento).not.toHaveBeenCalled();
    const finalize = ctx.rpc.mock.calls.find(([name]) => name === 'finalizar_envio_cpe_tx');
    expect(finalize?.[1]).toMatchObject({
      p_result_kind: 'TECHNICAL_ERROR',
      p_response_summary: {
        retryDisposition: 'RETRY_SEND',
        dianDeliveryStage: 'PREFLIGHT',
        dianSealed: false,
        dianIoAttempted: false,
        dianQueryKind: null,
        dianQueryKey: null,
      },
    });
  });
});
