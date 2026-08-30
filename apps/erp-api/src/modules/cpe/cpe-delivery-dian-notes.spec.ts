import { CpeDeliveryService } from './cpe-delivery.service';
import { DianFiscalService } from '../fiscal/dian-fiscal.service';
import { DianXmlBuilderService } from '../fiscal/colombia/dian-xml-builder.service';

jest.mock('../../shared/utils/fiscal-transport-guard', () => ({
  assertExternalFiscalTransportAllowed: jest.fn(async () => undefined),
}));

const TENANT_ID = '11111111-1111-4111-8111-111111111111';

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
      simulated_origin: false,
      fiscal_authority_evidence: {
        status: 'ACCEPTED', authority: 'DIAN', country_code: 'CO',
        code_kind: sourceIsInvoice ? 'CUFE' : 'CUDE', unique_code: sourceCode,
      },
    };
    const note = {
      id: `cpe-note-${noteType}`,
      tenant_id: TENANT_ID,
      documento_id: `document-note-${noteType}`,
      documento_referencia_id: source.documento_id,
      simulated_origin: false,
      pais: 'CO',
      issuer_snapshot: {
        contract_version: 525, country_code: 'CO', tax_id: '9001234568',
        legal_name: 'EMISOR CO SAS',
      },
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
      documento_referencia_serie: source.serie,
      documento_referencia_numero: String(source.numero).padStart(8, '0'),
      tipo_nota_credito: noteType === '91' ? '1' : null,
      tipo_nota_debito: noteType === '92' ? '2' : null,
      motivo_nota: noteType === '91' ? 'Devolución parcial' : 'Intereses por mora',
      metadata: {
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
        data: {
          ruc: '9001234568', razon_social: 'EMISOR CO SAS',
          direccion_fiscal: 'Carrera 7 # 10-20', provincia: 'Bogotá D.C.',
          departamento: 'Bogotá D.C.', ubigeo: '11001',
          dian_regimen_fiscal: 'O-13', dian_tipo_contribuyente: '1', is_demo: false,
        },
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
    jest.spyOn(dian as any, 'loadTenantConfig').mockResolvedValue({
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
      certificateBuffer: Buffer.from('pfx'), snapshot: { isDemo: false },
    });

    const fiscalAdapter = {
      obtenerCodigoPais: jest.fn(async () => 'CO'),
      obtenerNombreServicioFiscal: jest.fn(async () => 'DIAN'),
      obtenerConfiguracionFiscal: jest.fn(async () => ({ tasaImpuesto: 19 })),
      enviarDocumento: jest.fn((documento) => dian.enviarDocumento(documento)),
    };
    const delivery = new CpeDeliveryService(
      { getClient: () => client } as any,
      fiscalAdapter as any,
      {} as any,
      {} as any,
    );
    return { delivery, sourceChain, apiClient, rpc, source, note };
  }

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
