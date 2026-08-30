import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CpeDianEventsService } from './cpe-dian-events.service';

const TENANT = '11111111-1111-4111-8111-111111111111';
const ACTOR = '22222222-2222-4222-8222-222222222222';
const ANCHOR = '33333333-3333-4333-8333-333333333333';
const OPERATION = '44444444-4444-4444-8444-444444444444';
const CLAIM = '55555555-5555-4555-8555-555555555555';
const INVOICE_CUFE = 'A'.repeat(96);
const EVENT_CUDE = 'B'.repeat(96);
const SEALED_XML = `<ApplicationResponse><UUID>${EVENT_CUDE}</UUID><Signature /></ApplicationResponse>`;
const AUTHORITY_XML = `<ApplicationResponse><UUID>${'C'.repeat(96)}</UUID><ResponseCode>030</ResponseCode><DocumentReference><UUID>${INVOICE_CUFE}</UUID></DocumentReference></ApplicationResponse>`;

function operation(overrides: Record<string, unknown> = {}) {
  return {
    id: OPERATION,
    claim_token: CLAIM,
    state: 'CLAIMED',
    attempt: 1,
    request_summary: {
      event_id: 'AR123',
      issue_date: '2026-08-29',
      issue_time: '12:00:00-05:00',
      event_code: '030',
      event_description: 'Acuse de recibo',
      referenced_document_id: 'FV1',
      referenced_document_uuid: INVOICE_CUFE,
      sender: { type: '31', number: '900123456', name: 'Adquirente SAS' },
      receiver: { type: '31', number: '901234567', name: 'Proveedor SAS' },
      responsible_person: {
        identity_type: '13', identity_number: '10101010',
        first_name: 'Ana', family_name: 'Pérez', job_title: 'Compradora',
        organization_department: 'Compras',
      },
      dian_package_year: 2026,
      dian_package_sequence: 7,
      dian_provider_code: '000',
      ...overrides,
    },
  };
}

function dto(eventCode: '030' | '032' | '034' = '030'): any {
  return {
    eventCode,
    ...(eventCode === '030' || eventCode === '032' ? {
      responsiblePerson: {
        identityType: '13', identityNumber: '10101010',
        firstName: 'Ana', familyName: 'Pérez', jobTitle: 'Compradora',
        organizationDepartment: 'Compras',
      },
    } : {}),
    ...(eventCode === '034' ? { swornConfirmation: true } : {}),
  };
}

function authority(codes: Array<'030' | '031' | '032' | '033' | '034'> = []) {
  return {
    success: true,
    usable: true,
    invoiceCufe: INVOICE_CUFE,
    statusCode: '00',
    description: 'OK',
    events: codes.map((code, index) => ({
      code,
      cude: String(index + 1).repeat(96),
      referencedCufe: INVOICE_CUFE,
      fileName: 'GetStatusEvent.xml',
      xml: AUTHORITY_XML,
      xmlSha256: 'd'.repeat(64),
    })),
    eventCodes: codes,
    authorityDocumentKey: INVOICE_CUFE,
    authorityXml: AUTHORITY_XML,
    authorityXmlSha256: 'd'.repeat(64),
    explicitNoEvents: codes.length === 0,
    explicitNotFound: false,
    uncertain: false,
    authoritySignatureTrusted: true,
  };
}

describe('CpeDianEventsService', () => {
  let rpc: jest.Mock;
  let dian: Record<string, jest.Mock>;
  let service: CpeDianEventsService;

  beforeEach(() => {
    rpc = jest.fn();
    dian = {
      consultarEventosFacturaDian: jest.fn(),
      prepararEventoDian: jest.fn(),
      enviarEventoDianFirmado: jest.fn(),
      consultarFacturaRecibidaDian: jest.fn(),
      consultarEventoDian: jest.fn(),
    };
    service = new CpeDianEventsService(
      { getClient: () => ({ rpc }) } as any,
      dian as any,
    );
  });

  it('devuelve la reserva idempotente sin consultar ni reenviar a DIAN', async () => {
    rpc.mockResolvedValueOnce({
      data: { claimed: false, idempotent: true, reason: 'TERMINAL', operation: {
        ...operation(), state: 'COMPLETED', result_kind: 'ACCEPTED',
      } },
      error: null,
    });
    await expect(service.emitir(ANCHOR, dto(), TENANT, ACTOR, 'evento-idem-001'))
      .resolves.toEqual(expect.objectContaining({ success: true, idempotent: true }));
    expect(dian.consultarEventosFacturaDian).not.toHaveBeenCalled();
    expect(dian.prepararEventoDian).not.toHaveBeenCalled();
    expect(dian.enviarEventoDianFirmado).not.toHaveBeenCalled();
  });

  it('delega el aislamiento tenant/estado aceptado al RPC y no hace I/O si falla', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'DIAN_EVENT_ANCHOR_NOT_FOUND' } });
    await expect(service.emitir(ANCHOR, dto(), TENANT, ACTOR, 'evento-tenant-001'))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(rpc).toHaveBeenCalledWith('reservar_evento_dian_tx', expect.objectContaining({
      p_tenant_id: TENANT,
      p_actor_id: ACTOR,
      p_cpe_id: ANCHOR,
    }));
    expect(dian.consultarEventosFacturaDian).not.toHaveBeenCalled();
  });

  it('un reintento incierto falla cerrado si GetStatusEvent no es utilizable', async () => {
    rpc.mockResolvedValueOnce({
      data: { claimed: true, operation: operation({
        signed_application_response: SEALED_XML,
        event_cude: EVENT_CUDE,
        signed_xml_sha256: 'e'.repeat(64),
      }) }, error: null,
    });
    dian.consultarEventosFacturaDian.mockResolvedValue({
      ...authority(), success: false, usable: false, statusCode: 'DIAN_TRANSPORT_ERROR', uncertain: true,
    });
    rpc.mockResolvedValueOnce({ data: { operation: operation() }, error: null });
    await expect(service.emitir(ANCHOR, dto(), TENANT, ACTOR, 'evento-retry-001'))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(dian.enviarEventoDianFirmado).not.toHaveBeenCalled();
    expect(dian.prepararEventoDian).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenLastCalledWith('finalizar_evento_dian_tx', expect.objectContaining({
      p_tenant_id: TENANT,
      p_result_kind: 'TECHNICAL_ERROR',
      p_response_summary: expect.objectContaining({ uncertain: false, stage: 'SEALED' }),
    }));
  });

  it('reenvía exactamente los bytes sellados sólo cuando GetStatusEvent confirma ausencia', async () => {
    const sealedOperation = operation({
      event_code: '032',
      signed_application_response: SEALED_XML,
      event_cude: EVENT_CUDE,
      signed_xml_sha256: 'e'.repeat(64),
    });
    rpc.mockResolvedValueOnce({ data: { claimed: true, operation: sealedOperation }, error: null });
    dian.consultarEventosFacturaDian.mockResolvedValue(authority(['030']));
    dian.consultarEventoDian.mockResolvedValue({
      success: false,
      estado: 'NO_ENCONTRADO',
      explicitNotFound: true,
      authorityStatusCode: '90',
    });
    dian.enviarEventoDianFirmado.mockResolvedValue({
      success: true,
      statusCode: '00',
      statusDescription: 'Procesado',
      signatureVerified: true,
      authoritySignatureTrusted: true,
      cufe: EVENT_CUDE,
      xmlResponse: `<ApplicationResponse><UUID>${EVENT_CUDE}</UUID></ApplicationResponse>`,
      applicationResponseEvidence: {
        referencedDocumentKeys: [EVENT_CUDE], responseCodes: ['02'],
      },
      errors: [],
    });
    rpc.mockResolvedValueOnce({
      data: { operation: { ...sealedOperation, state: 'COMPLETED', result_kind: 'ACCEPTED' } },
      error: null,
    });
    await expect(service.emitir(ANCHOR, dto('032'), TENANT, ACTOR, 'evento-retry-032'))
      .resolves.toEqual(expect.objectContaining({ success: true }));
    expect(dian.prepararEventoDian).not.toHaveBeenCalled();
    expect(dian.enviarEventoDianFirmado).toHaveBeenCalledWith(
      SEALED_XML,
      EVENT_CUDE,
      TENANT,
      { packageYear: 2026, packageSequence: 7, providerCode: '000' },
    );
  });

  it('034 exige evidencia autoritativa 030+032 y nunca la simula localmente', async () => {
    rpc.mockResolvedValueOnce({ data: { claimed: true, operation: operation({ event_code: '034' }) }, error: null });
    dian.consultarEventosFacturaDian.mockResolvedValue(authority(['030']));
    rpc.mockResolvedValueOnce({ data: { operation: operation() }, error: null });
    await expect(service.emitir(ANCHOR, dto('034'), TENANT, ACTOR, 'evento-034-001'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(dian.prepararEventoDian).not.toHaveBeenCalled();
    expect(dian.enviarEventoDianFirmado).not.toHaveBeenCalled();
  });

  it('reconcilia un CUDE sellado sólo con GetStatus exacto y no inventa CUDE desde GetStatusEvent', async () => {
    const sealedOperation = operation({
      signed_application_response: SEALED_XML,
      event_cude: EVENT_CUDE,
      signed_xml_sha256: 'e'.repeat(64),
    });
    rpc.mockResolvedValueOnce({ data: { claimed: true, operation: sealedOperation }, error: null });
    dian.consultarEventosFacturaDian.mockResolvedValue(authority(['030']));
    const official = `<ApplicationResponse><UUID>${EVENT_CUDE}</UUID></ApplicationResponse>`;
    dian.consultarEventoDian.mockResolvedValue({
      success: true,
      estado: 'ACEPTADO',
      authorityStatusCode: '00',
      cufe: EVENT_CUDE,
      xmlResponse: official,
      explicitNotFound: false,
      authoritySignatureTrusted: true,
      applicationResponseEvidence: {
        referencedDocumentKeys: [EVENT_CUDE], responseCodes: ['02'],
      },
    });
    rpc.mockResolvedValueOnce({
      data: { operation: { ...sealedOperation, state: 'COMPLETED', result_kind: 'ACCEPTED' } },
      error: null,
    });
    await expect(service.emitir(ANCHOR, dto(), TENANT, ACTOR, 'evento-reconcile-001'))
      .resolves.toEqual(expect.objectContaining({ success: true }));
    expect(dian.enviarEventoDianFirmado).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenLastCalledWith('finalizar_evento_dian_tx', expect.objectContaining({
      p_result_kind: 'ACCEPTED',
      p_response_summary: expect.objectContaining({
        reconciliation: 'GET_STATUS_BY_EVENT_CUDE',
        authorityDocumentKey: EVENT_CUDE,
      }),
      p_authority_response: official,
    }));
  });

  it('clasifica un SOAP Fault como técnico e incierto, nunca como rechazo fiscal', async () => {
    rpc.mockResolvedValueOnce({ data: { claimed: true, operation: operation() }, error: null });
    dian.consultarEventosFacturaDian.mockResolvedValue(authority());
    dian.prepararEventoDian.mockResolvedValue({
      signedApplicationResponse: SEALED_XML,
      eventCude: EVENT_CUDE,
      xmlSha256: 'e'.repeat(64),
    });
    rpc.mockResolvedValueOnce({
      data: { operation: operation({
        signed_application_response: SEALED_XML,
        event_cude: EVENT_CUDE,
        signed_xml_sha256: 'e'.repeat(64),
      }) },
      error: null,
    });
    dian.enviarEventoDianFirmado.mockResolvedValue({
      success: false,
      authorityResponse: false,
      technical: true,
      uncertain: true,
      statusCode: 'a:InvalidSecurity',
      statusDescription: 'Firma SOAP inválida',
    });
    rpc.mockResolvedValueOnce({ data: { operation: operation() }, error: null });
    await expect(service.emitir(ANCHOR, dto(), TENANT, ACTOR, 'evento-fault-001'))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(rpc).toHaveBeenLastCalledWith('finalizar_evento_dian_tx', expect.objectContaining({
      p_result_kind: 'TECHNICAL_ERROR',
      p_response_summary: expect.objectContaining({ uncertain: false }),
    }));
  });

  it('importa una FEV recibida usando schemeName=31 como tipo y schemeID como DV', async () => {
    const cufe = '4'.repeat(96);
    const statusXml = `<ApplicationResponse xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><UUID>${cufe}</UUID><ds:Signature /></ApplicationResponse>`;
    const invoiceXml = `<Invoice xmlns:cbc="urn:test" xmlns:cac="urn:test" xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><cbc:UUID>${cufe}</cbc:UUID><cbc:InvoiceTypeCode>01</cbc:InvoiceTypeCode><cbc:ID>FV-9001</cbc:ID><cbc:IssueDate>2026-08-29</cbc:IssueDate><cbc:DocumentCurrencyCode>COP</cbc:DocumentCurrencyCode><cac:AccountingSupplierParty><cac:Party><cac:PartyTaxScheme><cbc:RegistrationName>DIAN proveedor</cbc:RegistrationName><cbc:CompanyID schemeName="31" schemeID="4">800197268</cbc:CompanyID></cac:PartyTaxScheme></cac:Party></cac:AccountingSupplierParty><cac:AccountingCustomerParty><cac:Party><cac:PartyTaxScheme><cbc:RegistrationName>Adquirente SAS</cbc:RegistrationName><cbc:CompanyID schemeName="31" schemeID="8">900123456</cbc:CompanyID></cac:PartyTaxScheme></cac:Party></cac:AccountingCustomerParty><cac:LegalMonetaryTotal><cbc:PayableAmount>119.00</cbc:PayableAmount></cac:LegalMonetaryTotal><ds:Signature /></Invoice>`;
    dian.consultarFacturaRecibidaDian.mockResolvedValue({
      status: {
        success: true,
        estado: 'ACEPTADO',
        authorityStatusCode: '00',
        cufe,
        descripcion: 'Aceptada',
        xmlResponse: statusXml,
        authoritySignatureTrusted: true,
      },
      document: {
        usable: true,
        documentKey: cufe,
        code: '100',
        message: 'OK',
        xml: invoiceXml,
        xmlSha256: 'f'.repeat(64),
      },
    });
    rpc.mockResolvedValueOnce({
      data: {
        created: true,
        invoice: {
          id: ANCHOR,
          cufe,
          document_id: 'FV-9001',
          state: 'ACCEPTED',
          proveedor_id: '66666666-6666-4666-8666-666666666666',
          invoice_xml_sha256: 'f'.repeat(64),
        },
      },
      error: null,
    });
    await expect(service.importarFacturaRecibida({
      cufe,
      proveedorId: '66666666-6666-4666-8666-666666666666',
    }, TENANT, ACTOR, 'import-fev-001')).resolves.toEqual(expect.objectContaining({
      success: true,
      cufe,
    }));
    expect(rpc).toHaveBeenCalledWith('registrar_fev_recibida_dian_tx', expect.objectContaining({
      p_tenant_id: TENANT,
      p_invoice_snapshot: expect.objectContaining({
        issuer: expect.objectContaining({ type: '31', number: '800197268', verificationDigit: '4' }),
        receiver: expect.objectContaining({ type: '31', number: '900123456', verificationDigit: '8' }),
      }),
      p_authority_status_snapshot: expect.objectContaining({ signatureVerified: true }),
      p_get_xml_snapshot: expect.objectContaining({ signatureVerified: true }),
    }));
  });

  it('lista por RPC tenant-safe y no consulta directamente la tabla protegida', async () => {
    rpc.mockResolvedValueOnce({
      data: [{ id: ANCHOR, cufe: INVOICE_CUFE, events: [] }],
      error: null,
    });
    await expect(service.listarFacturasRecibidas(TENANT, 500)).resolves.toEqual({
      success: true,
      data: [{ id: ANCHOR, cufe: INVOICE_CUFE, events: [] }],
    });
    expect(rpc).toHaveBeenCalledWith('listar_fev_recibidas_dian_tx', {
      p_tenant_id: TENANT,
      p_limit: 100,
    });
  });

  it('reintenta por operationId con la clave idempotente recuperada en servidor', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        operationId: OPERATION,
        anchorId: ANCHOR,
        anchorKind: 'RECEIVED_INVOICE',
        eventCode: '030',
        idempotencyKey: 'evento-original-030',
        canRetry: true,
        retryAt: '2026-08-29T12:00:00Z',
        request: {
          responsiblePerson: {
            identity_type: '13',
            identity_number: '10101010',
            first_name: 'Ana',
            family_name: 'Pérez',
            job_title: 'Compradora',
            organization_department: 'Compras',
          },
        },
      },
      error: null,
    });
    const retry = jest.spyOn(service, 'emitirSobreFacturaRecibida')
      .mockResolvedValue({ success: true } as any);

    await expect(service.reintentarEvento(
      OPERATION,
      TENANT,
      ACTOR,
      'RECEIVED_INVOICE',
    )).resolves.toEqual({ success: true });
    expect(rpc).toHaveBeenCalledWith('obtener_reintento_evento_dian_tx', {
      p_tenant_id: TENANT,
      p_actor_id: ACTOR,
      p_operation_id: OPERATION,
      p_expected_anchor_kind: 'RECEIVED_INVOICE',
    });
    expect(retry).toHaveBeenCalledWith(
      ANCHOR,
      expect.objectContaining({
        eventCode: '030',
        responsiblePerson: expect.objectContaining({ identityType: '13' }),
      }),
      TENANT,
      ACTOR,
      'evento-original-030',
    );
  });

  it('no reintenta antes de retryAt aunque el cliente pierda su estado local', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        operationId: OPERATION,
        anchorId: ANCHOR,
        anchorKind: 'RECEIVED_INVOICE',
        eventCode: '030',
        idempotencyKey: 'evento-original-030',
        canRetry: false,
        retryAt: '2026-08-29T12:05:00Z',
      },
      error: null,
    });
    await expect(service.reintentarEvento(
      OPERATION,
      TENANT,
      ACTOR,
      'RECEIVED_INVOICE',
    )).rejects.toBeInstanceOf(ConflictException);
    expect(dian.consultarEventosFacturaDian).not.toHaveBeenCalled();
  });

  it('sólo clasifica como rechazo terminal una respuesta fiscal firmada y con CUDE exacto', async () => {
    rpc.mockResolvedValueOnce({ data: { claimed: true, operation: operation() }, error: null });
    dian.consultarEventosFacturaDian.mockResolvedValue(authority());
    dian.prepararEventoDian.mockResolvedValue({
      signedApplicationResponse: SEALED_XML,
      eventCude: EVENT_CUDE,
      xmlSha256: 'e'.repeat(64),
    });
    rpc.mockResolvedValueOnce({
      data: { operation: operation({
        signed_application_response: SEALED_XML,
        event_cude: EVENT_CUDE,
        signed_xml_sha256: 'e'.repeat(64),
      }) },
      error: null,
    });
    dian.enviarEventoDianFirmado.mockResolvedValue({
      success: false,
      authorityResponse: true,
      technical: false,
      statusCode: '66',
      statusDescription: 'Error fiscal en el ApplicationResponse',
      cufe: EVENT_CUDE,
      xmlResponse: `<ApplicationResponse><UUID>${EVENT_CUDE}</UUID></ApplicationResponse>`,
      authoritySignatureTrusted: true,
      applicationResponseEvidence: {
        referencedDocumentKeys: [EVENT_CUDE], responseCodes: ['04'],
      },
    });
    rpc.mockResolvedValueOnce({ data: { operation: operation() }, error: null });
    await expect(service.emitir(ANCHOR, dto(), TENANT, ACTOR, 'evento-rejected-001'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(rpc).toHaveBeenLastCalledWith('finalizar_evento_dian_tx', expect.objectContaining({
      p_result_kind: 'REJECTED',
      p_response_code: '66',
    }));
  });
});
