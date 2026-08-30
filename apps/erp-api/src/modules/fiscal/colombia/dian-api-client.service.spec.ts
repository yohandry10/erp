import * as forge from 'node-forge';
import AdmZip = require('adm-zip');
import {
  DIAN_OFFICIAL_ENDPOINTS,
  DianApiClientService,
  type DianConfig,
  resolveOfficialDianEndpoint,
} from './dian-api-client.service';

const NIT = '8001972684';

function testPfx(): Buffer {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 60_000);
  cert.validity.notAfter = new Date(Date.now() + 86_400_000);
  const attrs = [{ name: 'commonName', value: `NIT ${NIT}` }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], 'secret', {
    algorithm: '3des',
  });
  return Buffer.from(forge.asn1.toDer(asn1).getBytes(), 'binary');
}

function config(environment: 'habilitacion' | 'produccion' = 'habilitacion'): DianConfig {
  return {
    url: DIAN_OFFICIAL_ENDPOINTS[environment],
    environment,
    nit: NIT,
    softwareId: 'software-id',
    softwarePin: 'pin',
    testSetId: '4de36cb4-9973-4ea4-a156-34e909aa24dc',
    certificatePfx: testPfx(),
    certificatePassword: 'secret',
    packageSequence: 11,
    packageYear: 2026,
    authorityTrust: {
      caBundlePem: 'TEST-CA-BUNDLE',
      allowedSpkiSha256: ['a'.repeat(64)],
    },
  };
}

const SIGNED_INVOICE_CUFE = 'A'.repeat(96);
const signedInvoice = `<Invoice><cbc:ID xmlns:cbc="urn:test">FV001</cbc:ID><cbc:UUID xmlns:cbc="urn:test">${SIGNED_INVOICE_CUFE}</cbc:UUID><cbc:IssueDate xmlns:cbc="urn:test">2026-08-29</cbc:IssueDate><ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" /></Invoice>`;
const SOAP_NAMESPACE = 'http://www.w3.org/2003/05/soap-envelope';
const WCF_NAMESPACE = 'http://wcf.dian.colombia';
const DIAN_RESPONSE_NAMESPACE = 'http://schemas.datacontract.org/2004/07/DianResponse';

function statusSoap(
  operation: 'GetStatus' | 'GetStatusZip',
  fields: string,
): string {
  const response = operation === 'GetStatusZip'
    ? `<d:DianResponse>${fields}</d:DianResponse>`
    : fields;
  return `<s:Envelope xmlns:s="${SOAP_NAMESPACE}" xmlns:w="${WCF_NAMESPACE}" xmlns:d="${DIAN_RESPONSE_NAMESPACE}"><s:Body><w:${operation}Response><w:${operation}Result>${response}</w:${operation}Result></w:${operation}Response></s:Body></s:Envelope>`;
}

function officialAuthorityResponse(
  referencedDocumentKey: string,
  responseCode = '02',
): string {
  return `<ApplicationResponse xmlns="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><cbc:UUID>${referencedDocumentKey}</cbc:UUID><cac:DocumentResponse><cac:Response><cbc:ResponseCode>${responseCode}</cbc:ResponseCode></cac:Response><cac:DocumentReference><cbc:UUID>${referencedDocumentKey}</cbc:UUID></cac:DocumentReference></cac:DocumentResponse><ds:Signature /></ApplicationResponse>`;
}

function clientWithSignature(valid = true): {
  service: DianApiClientService;
  verificarFirma: jest.Mock;
  verificarFirmaAutoridad: jest.Mock;
} {
  const verificarFirma = jest.fn().mockResolvedValue(valid);
  const verificarFirmaAutoridad = jest.fn().mockResolvedValue(valid);
  return {
    service: new DianApiClientService({ verificarFirma, verificarFirmaAutoridad } as any),
    verificarFirma,
    verificarFirmaAutoridad,
  };
}

describe('DianApiClientService SOAP 1.2', () => {
  it('sólo declara conectividad si detecta el WSDL SOAP 1.2 DIAN', async () => {
    const service = new DianApiClientService();
    jest.spyOn((service as any).axiosInstance, 'get').mockResolvedValue({
      status: 200,
      data: '<wsdl:definitions>WcfDianCustomerServices soap12:binding SendBillSync</wsdl:definitions>',
    });
    await expect(service.probarConectividad(config())).resolves.toEqual(expect.objectContaining({
      reachable: true,
      serviceDetected: true,
    }));
  });

  it('no confunde HTML ni un WSDL incompleto con el contrato oficial', async () => {
    const service = new DianApiClientService();
    jest.spyOn((service as any).axiosInstance, 'get').mockResolvedValue({ status: 200, data: '<html>ok</html>' });
    await expect(service.probarConectividad(config())).resolves.toEqual(expect.objectContaining({
      reachable: false,
      serviceDetected: false,
    }));
  });

  it('sólo permite el endpoint exacto del ambiente y no sigue redirecciones', async () => {
    expect(resolveOfficialDianEndpoint({ environment: 'habilitacion', url: '' }))
      .toBe(DIAN_OFFICIAL_ENDPOINTS.habilitacion);
    expect(() => resolveOfficialDianEndpoint({
      environment: 'habilitacion',
      url: 'http://127.0.0.1:3000/admin',
    })).toThrow('Endpoint DIAN no permitido');
    expect(() => resolveOfficialDianEndpoint({
      environment: 'produccion',
      url: DIAN_OFFICIAL_ENDPOINTS.habilitacion,
    })).toThrow('Endpoint DIAN no permitido');
  });

  it('falla cerrado antes de red si falta el certificado de transporte', async () => {
    const service = new DianApiClientService();
    const post = jest.spyOn((service as any).axiosInstance, 'post');
    const withoutCertificate = { ...config('produccion'), certificatePfx: undefined };
    await expect(service.enviarDocumento(signedInvoice, '', withoutCertificate)).resolves.toEqual(
      expect.objectContaining({ success: false, statusCode: 'DIAN_TRANSPORT_CERT_REQUIRED' }),
    );
    expect(post).not.toHaveBeenCalled();
  });

  it('usa SendBillSync en producción y sólo acepta IsValid=true', async () => {
    const { service } = clientWithSignature();
    const authorityXml = officialAuthorityResponse(SIGNED_INVOICE_CUFE);
    const post = jest.spyOn((service as any).axiosInstance, 'post').mockResolvedValue({
      status: 200,
      data: `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><SendBillSyncResponse><SendBillSyncResult><IsValid>true</IsValid><StatusCode>00</StatusCode><StatusDescription>Procesado Correctamente.</StatusDescription><XmlDocumentKey>${SIGNED_INVOICE_CUFE}</XmlDocumentKey><XmlBase64Bytes>${Buffer.from(authorityXml).toString('base64')}</XmlBase64Bytes></SendBillSyncResult></SendBillSyncResponse></s:Body></s:Envelope>`,
    });
    const result = await service.enviarDocumento(signedInvoice, '', config('produccion'));
    expect(result).toEqual(expect.objectContaining({
      success: true,
      statusCode: '00',
      cufe: SIGNED_INVOICE_CUFE,
      authoritySignatureTrusted: true,
    }));
    const [url, envelope, request] = post.mock.calls[0];
    expect(url).toBe(DIAN_OFFICIAL_ENDPOINTS.produccion);
    expect(envelope).toContain('<wcf:SendBillSync>');
    expect(envelope).toContain('<wcf:fileName>z0800197268000260000000B.zip</wcf:fileName>');
    expect(envelope).toContain('<wsse:BinarySecurityToken');
    expect(envelope).toContain('<ds:Signature');
    expect(envelope).not.toContain('software-id');
    expect(request).toEqual(expect.objectContaining({
      maxRedirects: 0,
      headers: expect.objectContaining({
        'Content-Type': expect.stringContaining('/SendBillSync'),
      }),
    }));
  });

  it('SendBillSync falla cerrado si CUFE, ApplicationResponse o trust DIAN no coinciden', async () => {
    const { service } = clientWithSignature();
    const wrongCufe = 'B'.repeat(96);
    const authorityXml = officialAuthorityResponse(wrongCufe);
    const post = jest.spyOn((service as any).axiosInstance, 'post');
    post.mockResolvedValueOnce({
      status: 200,
      data: `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><SendBillSyncResult><IsValid>true</IsValid><StatusCode>00</StatusCode><XmlDocumentKey>${wrongCufe}</XmlDocumentKey><XmlBase64Bytes>${Buffer.from(authorityXml).toString('base64')}</XmlBase64Bytes></SendBillSyncResult></s:Body></s:Envelope>`,
    });
    await expect(service.enviarDocumento(signedInvoice, '', config('produccion')))
      .resolves.toEqual(expect.objectContaining({
        success: false,
        statusCode: 'DIAN_SYNC_ACCEPTANCE_EVIDENCE_INVALID',
        uncertain: true,
      }));

    const withoutTrust = { ...config('produccion'), authorityTrust: undefined };
    const matchingAuthorityXml = officialAuthorityResponse(SIGNED_INVOICE_CUFE);
    post.mockResolvedValueOnce({
      status: 200,
      data: `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><SendBillSyncResult><IsValid>true</IsValid><StatusCode>00</StatusCode><XmlDocumentKey>${SIGNED_INVOICE_CUFE}</XmlDocumentKey><XmlBase64Bytes>${Buffer.from(matchingAuthorityXml).toString('base64')}</XmlBase64Bytes></SendBillSyncResult></s:Body></s:Envelope>`,
    });
    await expect(service.enviarDocumento(signedInvoice, '', withoutTrust))
      .resolves.toEqual(expect.objectContaining({
        success: false,
        authoritySignatureTrusted: false,
        statusCode: 'DIAN_SYNC_ACCEPTANCE_EVIDENCE_INVALID',
      }));
  });

  it('nombra el ZIP con el año calendario reservado, no con IssueDate', async () => {
    const service = new DianApiClientService();
    const post = jest.spyOn((service as any).axiosInstance, 'post').mockResolvedValue({
      status: 200,
      data: '<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><SendBillSyncResponse><SendBillSyncResult><IsValid>true</IsValid><StatusCode>00</StatusCode></SendBillSyncResult></SendBillSyncResponse></s:Body></s:Envelope>',
    });
    await service.enviarDocumento(signedInvoice, '', { ...config('produccion'), packageYear: 2027 });
    expect(post.mock.calls[0][1]).toContain('<wcf:fileName>z0800197268000270000000B.zip</wcf:fileName>');
  });

  it('usa SendTestSetAsync en habilitación y no confunde recepción del ZIP con aceptación', async () => {
    const service = new DianApiClientService();
    const post = jest.spyOn((service as any).axiosInstance, 'post').mockResolvedValue({
      status: 200,
      data: `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><SendTestSetAsyncResponse><SendTestSetAsyncResult><ZipKey>${'b'.repeat(96)}</ZipKey></SendTestSetAsyncResult></SendTestSetAsyncResponse></s:Body></s:Envelope>`,
    });
    const result = await service.enviarDocumento(signedInvoice, '', config());
    expect(result).toEqual(expect.objectContaining({
      success: false,
      pending: true,
      statusCode: 'DIAN_ASYNC_SUBMITTED',
      trackId: 'b'.repeat(96),
    }));
    expect(post.mock.calls[0][1]).toContain('<wcf:SendTestSetAsync>');
    expect(post.mock.calls[0][1]).toContain('<wcf:testSetId>4de36cb4-9973-4ea4-a156-34e909aa24dc</wcf:testSetId>');
  });

  it('rechaza el ZIP cuando la respuesta asíncrona trae errores iniciales aunque incluya ZipKey', async () => {
    const service = new DianApiClientService();
    jest.spyOn((service as any).axiosInstance, 'post').mockResolvedValue({
      status: 200,
      data: `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><SendTestSetAsyncResponse><SendTestSetAsyncResult><ErrorMessageList><XmlParamsResponseTrackId><ProcessedMessage>Archivo UBL inválido</ProcessedMessage><Success>false</Success><SenderCode>DIAN-UBL</SenderCode></XmlParamsResponseTrackId></ErrorMessageList><ZipKey>${'b'.repeat(96)}</ZipKey></SendTestSetAsyncResult></SendTestSetAsyncResponse></s:Body></s:Envelope>`,
    });
    await expect(service.enviarDocumento(signedInvoice, '', config())).resolves.toEqual(expect.objectContaining({
      success: false,
      statusCode: 'DIAN_ASYNC_REJECTED',
      errors: expect.arrayContaining(['Archivo UBL inválido']),
    }));
  });

  it('rechaza un ApplicationResponse anidado o mencionado en comentarios', async () => {
    const { service } = clientWithSignature();
    const nested = `<Wrapper><!-- <ApplicationResponse>engaño</ApplicationResponse> -->${officialAuthorityResponse(SIGNED_INVOICE_CUFE)}</Wrapper>`;
    jest.spyOn((service as any).axiosInstance, 'post').mockResolvedValue({
      status: 200,
      data: `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><SendBillSyncResult><IsValid>true</IsValid><StatusCode>00</StatusCode><XmlDocumentKey>${SIGNED_INVOICE_CUFE}</XmlDocumentKey><XmlBase64Bytes>${Buffer.from(nested).toString('base64')}</XmlBase64Bytes></SendBillSyncResult></s:Body></s:Envelope>`,
    });

    await expect(service.enviarDocumento(signedInvoice, '', config('produccion')))
      .resolves.toEqual(expect.objectContaining({
        success: false,
        statusCode: 'DIAN_SYNC_ACCEPTANCE_EVIDENCE_INVALID',
        technical: true,
        uncertain: true,
      }));
  });

  it('rechaza AR sin Response, con Response duplicado o con código UBL divergente', async () => {
    const { service } = clientWithSignature();
    const valid = officialAuthorityResponse(SIGNED_INVOICE_CUFE);
    const withoutResponse = valid.replace(
      /<cac:Response>.*?<\/cac:Response>/u,
      '',
    );
    const duplicatedResponse = valid.replace(
      /(<cac:Response>.*?<\/cac:Response>)/u,
      '$1$1',
    );
    const divergentCode = officialAuthorityResponse(SIGNED_INVOICE_CUFE, '04');
    const post = jest.spyOn((service as any).axiosInstance, 'post');
    for (const authorityXml of [withoutResponse, duplicatedResponse, divergentCode]) {
      post.mockResolvedValueOnce({
        status: 200,
        data: `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><SendBillSyncResult><IsValid>true</IsValid><StatusCode>00</StatusCode><XmlDocumentKey>${SIGNED_INVOICE_CUFE}</XmlDocumentKey><XmlBase64Bytes>${Buffer.from(authorityXml).toString('base64')}</XmlBase64Bytes></SendBillSyncResult></s:Body></s:Envelope>`,
      });
    }

    for (let index = 0; index < 3; index += 1) {
      await expect(service.enviarDocumento(signedInvoice, '', config('produccion')))
        .resolves.toEqual(expect.objectContaining({
          success: false,
          statusCode: 'DIAN_SYNC_ACCEPTANCE_EVIDENCE_INVALID',
          technical: true,
          uncertain: true,
        }));
    }
  });

  it('sólo conserva el rechazo fiscal sincrónico con AR raíz, firma y referencia exacta', async () => {
    const { service } = clientWithSignature();
    const rejected = officialAuthorityResponse(SIGNED_INVOICE_CUFE, '04');
    const post = jest.spyOn((service as any).axiosInstance, 'post');
    post.mockResolvedValueOnce({
      status: 200,
      data: `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><SendBillSyncResult><IsValid>false</IsValid><StatusCode>66</StatusCode><StatusDescription>Regla DIAN incumplida</StatusDescription><XmlDocumentKey>${SIGNED_INVOICE_CUFE}</XmlDocumentKey><XmlBase64Bytes>${Buffer.from(officialAuthorityResponse(SIGNED_INVOICE_CUFE, '02')).toString('base64')}</XmlBase64Bytes></SendBillSyncResult></s:Body></s:Envelope>`,
    });
    post.mockResolvedValueOnce({
      status: 200,
      data: `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><SendBillSyncResult><IsValid>false</IsValid><StatusCode>66</StatusCode><StatusDescription>Regla DIAN incumplida</StatusDescription><XmlDocumentKey>${SIGNED_INVOICE_CUFE}</XmlDocumentKey><XmlBase64Bytes>${Buffer.from(rejected).toString('base64')}</XmlBase64Bytes></SendBillSyncResult></s:Body></s:Envelope>`,
    });

    await expect(service.enviarDocumento(signedInvoice, '', config('produccion')))
      .resolves.toEqual(expect.objectContaining({
        success: false,
        authorityResponse: false,
        technical: true,
        uncertain: true,
      }));
    await expect(service.enviarDocumento(signedInvoice, '', config('produccion')))
      .resolves.toEqual(expect.objectContaining({
        success: false,
        statusCode: '66',
        authorityResponse: true,
        technical: false,
        uncertain: false,
        authoritySignatureTrusted: true,
        applicationResponseEvidence: expect.objectContaining({
          referencedDocumentKeys: [SIGNED_INVOICE_CUFE],
          responseCodes: ['04'],
        }),
      }));
  });

  it('separa SOAP Fault de un rechazo fiscal', async () => {
    const service = new DianApiClientService();
    jest.spyOn((service as any).axiosInstance, 'post').mockResolvedValue({
      status: 500,
      data: '<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><s:Fault><s:Code><s:Value>s:Sender</s:Value></s:Code><s:Reason><s:Text>InvalidSecurity</s:Text></s:Reason></s:Fault></s:Body></s:Envelope>',
    });
    await expect(service.consultarEstado('a'.repeat(96), config())).resolves.toEqual(expect.objectContaining({
      success: false,
      estado: 'PENDIENTE',
      transportCode: 's:Sender',
      explicitNotFound: false,
      uncertain: true,
    }));
  });

  it('nunca convierte el texto de un SOAP Fault en NOT_FOUND autoritativo', async () => {
    const service = new DianApiClientService();
    jest.spyOn((service as any).axiosInstance, 'post').mockResolvedValue({
      status: 500,
      data: '<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body>'
        + '<s:Fault><s:Code><s:Value>s:Receiver</s:Value></s:Code>'
        + '<s:Reason><s:Text>TrackId no encontrado por indisponibilidad temporal</s:Text></s:Reason>'
        + '</s:Fault></s:Body></s:Envelope>',
    });

    await expect(service.consultarEstadoZip('a'.repeat(96), config())).resolves.toEqual(
      expect.objectContaining({
        success: false,
        estado: 'PENDIENTE',
        explicitNotFound: false,
        uncertain: true,
        authorityResponse: false,
        technical: true,
      }),
    );
  });

  it('marca timeout como resultado incierto y exige consulta antes de reenviar', async () => {
    const service = new DianApiClientService();
    const timeout = Object.assign(new Error('timeout'), {
      isAxiosError: true,
      code: 'ETIMEDOUT',
      toJSON: () => ({}),
    });
    jest.spyOn((service as any).axiosInstance, 'post').mockRejectedValue(timeout);
    await expect(service.enviarDocumento(signedInvoice, '', config('produccion'))).resolves.toEqual(
      expect.objectContaining({
        success: false,
        pending: true,
        statusCode: 'DIAN_TIMEOUT_UNCERTAIN',
      }),
    );
  });

  it('parsea GetStatusZip aceptado, rechazado y no encontrado sin colapsarlos', async () => {
    const { service } = clientWithSignature();
    const documentCufe = 'D'.repeat(96);
    const authorityXml = officialAuthorityResponse(documentCufe);
    const post = jest.spyOn((service as any).axiosInstance, 'post');
    post.mockResolvedValueOnce({
      status: 200,
      data: statusSoap('GetStatusZip', `<d:IsValid>true</d:IsValid><d:StatusCode>00</d:StatusCode><d:StatusDescription>Validado</d:StatusDescription><d:XmlDocumentKey>${documentCufe}</d:XmlDocumentKey><d:XmlBase64Bytes>${Buffer.from(authorityXml).toString('base64')}</d:XmlBase64Bytes>`),
    });
    post.mockResolvedValueOnce({
      status: 200,
      data: statusSoap('GetStatusZip', `<d:IsValid>false</d:IsValid><d:StatusCode>99</d:StatusCode><d:StatusDescription>Regla fiscal rechazada</d:StatusDescription><d:XmlDocumentKey>${documentCufe}</d:XmlDocumentKey><d:XmlBase64Bytes>${Buffer.from(officialAuthorityResponse(documentCufe, '04')).toString('base64')}</d:XmlBase64Bytes>`),
    });
    post.mockResolvedValueOnce({
      status: 200,
      data: statusSoap('GetStatusZip', '<d:IsValid>false</d:IsValid><d:StatusCode>90</d:StatusCode><d:StatusDescription>TrackId no encontrado</d:StatusDescription>'),
    });
    await expect(service.consultarEstadoZip('a'.repeat(96), config())).resolves.toEqual(expect.objectContaining({
      estado: 'ACEPTADO', cufe: documentCufe, authorityStatusCode: '00',
      authoritySignatureTrusted: true, explicitNotFound: false,
    }));
    await expect(service.consultarEstadoZip('b'.repeat(96), config())).resolves.toEqual(expect.objectContaining({
      estado: 'RECHAZADO', authorityStatusCode: '99', explicitNotFound: false,
    }));
    await expect(service.consultarEstadoZip('c'.repeat(96), config())).resolves.toEqual(expect.objectContaining({
      estado: 'NO_ENCONTRADO', authorityStatusCode: '90', explicitNotFound: true,
    }));
  });

  it('no autoriza reenvío con NOT_FOUND truncado, sin IsValid, anidado o contradictorio', async () => {
    const { service } = clientWithSignature();
    const trackId = 'C'.repeat(96);
    const contradictoryXml = officialAuthorityResponse('D'.repeat(96));
    const post = jest.spyOn((service as any).axiosInstance, 'post');
    post.mockResolvedValueOnce({
      status: 200,
      data: `<s:Envelope xmlns:s="${SOAP_NAMESPACE}" xmlns:w="${WCF_NAMESPACE}" xmlns:d="${DIAN_RESPONSE_NAMESPACE}"><s:Body><w:GetStatusZipResponse><w:GetStatusZipResult><d:StatusCode>90</d:StatusCode></w:GetStatusZipResult></w:GetStatusZipResponse></s:Body></s:Envelope>`,
    });
    post.mockResolvedValueOnce({
      status: 200,
      data: statusSoap('GetStatusZip', '<d:StatusCode>90</d:StatusCode>'),
    });
    post.mockResolvedValueOnce({
      status: 200,
      data: statusSoap('GetStatusZip', '<d:IsValid><d:value>false</d:value></d:IsValid><d:StatusCode><d:value>90</d:value></d:StatusCode>'),
    });
    post.mockResolvedValueOnce({
      status: 200,
      data: statusSoap('GetStatusZip', `<d:IsValid>false</d:IsValid><d:StatusCode>90</d:StatusCode><d:XmlDocumentKey>${trackId}</d:XmlDocumentKey><d:XmlBase64Bytes>${Buffer.from(contradictoryXml).toString('base64')}</d:XmlBase64Bytes>`),
    });

    for (let index = 0; index < 4; index += 1) {
      await expect(service.consultarEstadoZip(trackId, config())).resolves.toEqual(expect.objectContaining({
        estado: 'PENDIENTE',
        explicitNotFound: false,
        authorityResponse: false,
        technical: true,
        uncertain: true,
      }));
    }
  });

  it('no deriva NOT_FOUND de prefijos ligados a namespaces SOAP o WCF falsos', async () => {
    const { service } = clientWithSignature();
    const trackId = 'C'.repeat(96);
    const fields = '<d:IsValid>false</d:IsValid><d:StatusCode>90</d:StatusCode>';
    const post = jest.spyOn((service as any).axiosInstance, 'post');
    post.mockResolvedValueOnce({
      status: 200,
      data: `<s:Envelope xmlns:s="urn:fake-soap" xmlns:soapBait="${SOAP_NAMESPACE}" xmlns:w="${WCF_NAMESPACE}" xmlns:d="${DIAN_RESPONSE_NAMESPACE}"><s:Body><w:GetStatusZipResponse><w:GetStatusZipResult><d:DianResponse>${fields}</d:DianResponse></w:GetStatusZipResult></w:GetStatusZipResponse></s:Body></s:Envelope>`,
    });
    post.mockResolvedValueOnce({
      status: 200,
      data: `<s:Envelope xmlns:s="${SOAP_NAMESPACE}" xmlns:w="urn:fake-wcf" xmlns:wcfBait="${WCF_NAMESPACE}" xmlns:d="${DIAN_RESPONSE_NAMESPACE}"><s:Body><w:GetStatusZipResponse><w:GetStatusZipResult><d:DianResponse>${fields}</d:DianResponse></w:GetStatusZipResult></w:GetStatusZipResponse></s:Body></s:Envelope>`,
    });

    for (let index = 0; index < 2; index += 1) {
      await expect(service.consultarEstadoZip(trackId, config())).resolves.toEqual(expect.objectContaining({
        estado: 'PENDIENTE',
        transportCode: 'DIAN_STATUS_RESPONSE_STRUCTURE_INVALID',
        explicitNotFound: false,
        authorityResponse: false,
        technical: true,
        uncertain: true,
      }));
    }
  });

  it('conserva el ApplicationResponse base64 de GetStatus para cerrar ACCEPTED', async () => {
    const { service } = clientWithSignature();
    const applicationResponse = officialAuthorityResponse('a'.repeat(96));
    jest.spyOn((service as any).axiosInstance, 'post').mockResolvedValue({
      status: 200,
      data: statusSoap('GetStatus', `<d:IsValid>true</d:IsValid><d:StatusCode>00</d:StatusCode><d:StatusDescription>Validado</d:StatusDescription><d:XmlDocumentKey>${'a'.repeat(96)}</d:XmlDocumentKey><d:XmlBase64Bytes>${Buffer.from(applicationResponse).toString('base64')}</d:XmlBase64Bytes>`),
    });
    await expect(service.consultarEstado('a'.repeat(96), config())).resolves.toEqual(expect.objectContaining({
      estado: 'ACEPTADO', xmlResponse: applicationResponse,
      authoritySignatureTrusted: true,
    }));
  });

  it('no presenta una clave local inválida como NOT_FOUND confirmado por DIAN', async () => {
    const service = new DianApiClientService();
    const post = jest.spyOn((service as any).axiosInstance, 'post');
    await expect(service.consultarEstadoZip('invalido', config())).resolves.toEqual(expect.objectContaining({
      estado: 'NO_ENCONTRADO', explicitNotFound: false,
    }));
    expect(post).not.toHaveBeenCalled();
  });

  it('parsea todos los campos fiscales de GetNumberingRange, incluida TechnicalKey', async () => {
    const service = new DianApiClientService();
    jest.spyOn((service as any).axiosInstance, 'post').mockResolvedValue({
      status: 200,
      data: '<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><GetNumberingRangeResponse><GetNumberingRangeResult><OperationCode>100</OperationCode><ResponseList><NumberRangeResponse><ResolutionNumber>18764000001</ResolutionNumber><Prefix>FV</Prefix><FromNumber>1</FromNumber><ToNumber>5000</ToNumber><ValidDateFrom>2026-01-01</ValidDateFrom><ValidDateTo>2027-01-01</ValidDateTo><TechnicalKey>clave-tecnica</TechnicalKey></NumberRangeResponse></ResponseList></GetNumberingRangeResult></GetNumberingRangeResponse></s:Body></s:Envelope>',
    });
    await expect(service.consultarRangosAutorizados(config())).resolves.toEqual({
      rangos: [expect.objectContaining({
        prefijo: 'FV',
        desde: 1,
        hasta: 5000,
        resolucion: '18764000001',
        claveTecnica: 'clave-tecnica',
      })],
    });
  });

  it('no inventa SendEventUpdateStatus desde CUFE y motivo parciales', async () => {
    const service = new DianApiClientService();
    const post = jest.spyOn((service as any).axiosInstance, 'post');
    await expect(service.enviarEvento('a'.repeat(96), 'ACUSE', null, config())).resolves.toEqual(
      expect.objectContaining({ statusCode: 'DIAN_EVENT_XML_SIGNED_REQUIRED' }),
    );
    expect(post).not.toHaveBeenCalled();
  });

  it('consulta GetStatusEvent por CUFE y extrae todos los ResponseCode oficiales', async () => {
    const { service, verificarFirmaAutoridad } = clientWithSignature();
    const invoiceCufe = 'A'.repeat(96);
    const eventCude = 'B'.repeat(96);
    const applicationResponse = `<ApplicationResponse xmlns="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><cbc:UUID>${eventCude}</cbc:UUID><cac:DocumentResponse><cac:Response><cbc:ResponseCode>030</cbc:ResponseCode></cac:Response><cac:DocumentReference><cbc:UUID>${invoiceCufe}</cbc:UUID></cac:DocumentReference></cac:DocumentResponse><cac:DocumentResponse><cac:Response><cbc:ResponseCode>032</cbc:ResponseCode></cac:Response><cac:DocumentReference><cbc:UUID>${invoiceCufe}</cbc:UUID></cac:DocumentReference></cac:DocumentResponse><ds:Signature /></ApplicationResponse>`;
    const post = jest.spyOn((service as any).axiosInstance, 'post').mockResolvedValue({
      status: 200,
      data: `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><GetStatusEventResponse><GetStatusEventResult><IsValid>true</IsValid><StatusCode>00</StatusCode><StatusDescription>Eventos encontrados</StatusDescription><XmlDocumentKey>${invoiceCufe}</XmlDocumentKey><XmlBase64Bytes>${Buffer.from(applicationResponse).toString('base64')}</XmlBase64Bytes></GetStatusEventResult></GetStatusEventResponse></s:Body></s:Envelope>`,
    });

    await expect(service.consultarEventosFactura(invoiceCufe, config('produccion')))
      .resolves.toEqual(expect.objectContaining({
        success: true,
        usable: true,
        authorityDocumentKey: invoiceCufe,
        eventCodes: ['030', '032'],
        applicationResponseEvidence: expect.objectContaining({
          responseCodes: ['030', '032'],
        }),
        authorityXml: applicationResponse,
        authorityXmlSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      }));
    expect(verificarFirmaAutoridad).toHaveBeenCalledWith(
      applicationResponse,
      config('produccion').authorityTrust,
    );
    expect(post.mock.calls[0][1]).toContain(`<wcf:GetStatusEvent><wcf:trackId>${invoiceCufe}</wcf:trackId>`);
    expect(post.mock.calls[0][2]).toEqual(expect.objectContaining({
      headers: expect.objectContaining({ 'Content-Type': expect.stringContaining('/GetStatusEvent') }),
    }));
  });

  it('GetStatusEvent falla cerrado con documentKey distinto, código fuera del contrato o 90', async () => {
    const { service } = clientWithSignature();
    const invoiceCufe = 'C'.repeat(96);
    const eventCude = 'D'.repeat(96);
    const xml = (code: string) => `<ApplicationResponse xmlns:cbc="urn:test" xmlns:cac="urn:test"><cbc:UUID>${eventCude}</cbc:UUID><cac:DocumentResponse><cac:Response><cbc:ResponseCode>${code}</cbc:ResponseCode></cac:Response><cac:DocumentReference><cbc:UUID>${invoiceCufe}</cbc:UUID></cac:DocumentReference></cac:DocumentResponse></ApplicationResponse>`;
    const post = jest.spyOn((service as any).axiosInstance, 'post');
    post.mockResolvedValueOnce({
      status: 200,
      data: `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><GetStatusEventResult><IsValid>true</IsValid><StatusCode>00</StatusCode><XmlDocumentKey>${'E'.repeat(96)}</XmlDocumentKey><XmlBase64Bytes>${Buffer.from(xml('030')).toString('base64')}</XmlBase64Bytes></GetStatusEventResult></s:Body></s:Envelope>`,
    });
    post.mockResolvedValueOnce({
      status: 200,
      data: `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><GetStatusEventResult><IsValid>true</IsValid><StatusCode>00</StatusCode><XmlDocumentKey>${invoiceCufe}</XmlDocumentKey><XmlBase64Bytes>${Buffer.from(xml('00')).toString('base64')}</XmlBase64Bytes></GetStatusEventResult></s:Body></s:Envelope>`,
    });
    post.mockResolvedValueOnce({
      status: 200,
      data: '<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><GetStatusEventResult><IsValid>false</IsValid><StatusCode>90</StatusCode><StatusDescription>Evento no encontrado</StatusDescription></GetStatusEventResult></s:Body></s:Envelope>',
    });
    await expect(service.consultarEventosFactura(invoiceCufe, config('produccion')))
      .resolves.toEqual(expect.objectContaining({ usable: false, uncertain: true }));
    await expect(service.consultarEventosFactura(invoiceCufe, config('produccion')))
      .resolves.toEqual(expect.objectContaining({
        usable: false,
        statusCode: 'DIAN_EVENT_APPLICATION_RESPONSE_INVALID',
      }));
    await expect(service.consultarEventosFactura(invoiceCufe, config('produccion')))
      .resolves.toEqual(expect.objectContaining({
        usable: false,
        explicitNotFound: true,
        explicitNoEvents: true,
      }));
  });

  it('SendEventUpdateStatus transmite un ZIP con exactamente un ar XML firmado', async () => {
    const { service, verificarFirma } = clientWithSignature();
    const eventCude = 'F'.repeat(96);
    const signedApplicationResponse = `<ApplicationResponse xmlns:cbc="urn:test" xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><cbc:UUID>${eventCude}</cbc:UUID><cbc:ResponseCode>030</cbc:ResponseCode><ds:Signature /></ApplicationResponse>`;
    const officialResponse = officialAuthorityResponse(eventCude);
    const post = jest.spyOn((service as any).axiosInstance, 'post').mockResolvedValue({
      status: 200,
      data: `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><SendEventUpdateStatusResult><IsValid>true</IsValid><StatusCode>00</StatusCode><StatusDescription>Procesado</StatusDescription><XmlDocumentKey>${eventCude}</XmlDocumentKey><XmlBase64Bytes>${Buffer.from(officialResponse).toString('base64')}</XmlBase64Bytes></SendEventUpdateStatusResult></s:Body></s:Envelope>`,
    });
    await expect(service.enviarEventoXml(signedApplicationResponse, config('produccion')))
      .resolves.toEqual(expect.objectContaining({
        success: true,
        cufe: eventCude,
        xmlResponse: officialResponse,
      }));
    const envelope = String(post.mock.calls[0][1]);
    const contentBase64 = /<wcf:contentFile>([^<]+)<\/wcf:contentFile>/u.exec(envelope)?.[1];
    expect(contentBase64).toBeTruthy();
    const zip = new AdmZip(Buffer.from(contentBase64!, 'base64'));
    const entries = zip.getEntries().filter((entry) => !entry.isDirectory);
    expect(entries).toHaveLength(1);
    expect(entries[0].entryName).toMatch(/^ar\d{10}\d{3}\d{2}[0-9A-F]{8}\.xml$/u);
    expect(entries[0].getData().toString('utf8')).toBe(signedApplicationResponse);
    expect(verificarFirma).toHaveBeenCalledWith(signedApplicationResponse);
  });

  it('sólo conserva un rechazo fiscal de evento con AR confiable y CUDE exacto', async () => {
    const { service } = clientWithSignature();
    const eventCude = '9'.repeat(96);
    const signedApplicationResponse = `<ApplicationResponse xmlns:cbc="urn:test" xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><cbc:UUID>${eventCude}</cbc:UUID><cbc:ResponseCode>030</cbc:ResponseCode><ds:Signature /></ApplicationResponse>`;
    const rejectedAr = officialAuthorityResponse(eventCude, '04');
    const post = jest.spyOn((service as any).axiosInstance, 'post');
    post.mockResolvedValueOnce({
      status: 200,
      data: '<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><SendEventUpdateStatusResult><IsValid>false</IsValid><StatusCode>66</StatusCode><StatusDescription>UBL inválido</StatusDescription></SendEventUpdateStatusResult></s:Body></s:Envelope>',
    });
    post.mockResolvedValueOnce({
      status: 200,
      data: `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><SendEventUpdateStatusResult><IsValid>false</IsValid><StatusCode>66</StatusCode><StatusDescription>UBL inválido</StatusDescription><XmlDocumentKey>${eventCude}</XmlDocumentKey><XmlBase64Bytes>${Buffer.from(officialAuthorityResponse(eventCude, '02')).toString('base64')}</XmlBase64Bytes></SendEventUpdateStatusResult></s:Body></s:Envelope>`,
    });
    post.mockResolvedValueOnce({
      status: 200,
      data: `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><SendEventUpdateStatusResult><IsValid>false</IsValid><StatusCode>66</StatusCode><StatusDescription>UBL inválido</StatusDescription><XmlDocumentKey>${eventCude}</XmlDocumentKey><XmlBase64Bytes>${Buffer.from(rejectedAr).toString('base64')}</XmlBase64Bytes></SendEventUpdateStatusResult></s:Body></s:Envelope>`,
    });

    await expect(service.enviarEventoXml(signedApplicationResponse, config('produccion')))
      .resolves.toEqual(expect.objectContaining({
        success: false,
        technical: true,
        uncertain: true,
        authorityResponse: false,
      }));
    await expect(service.enviarEventoXml(signedApplicationResponse, config('produccion')))
      .resolves.toEqual(expect.objectContaining({
        success: false,
        technical: true,
        uncertain: true,
        authorityResponse: false,
      }));
    await expect(service.enviarEventoXml(signedApplicationResponse, config('produccion')))
      .resolves.toEqual(expect.objectContaining({
        success: false,
        statusCode: '66',
        technical: false,
        uncertain: false,
        authorityResponse: true,
        authoritySignatureTrusted: true,
        cufe: eventCude,
      }));
  });

  it('GetXmlByDocumentKey acepta 100/Ok con Invoice firmado y rechaza 205', async () => {
    const { service, verificarFirma } = clientWithSignature();
    const cufe = '1'.repeat(96);
    const invoice = `<Invoice xmlns:cbc="urn:test" xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><cbc:UUID>${cufe}</cbc:UUID><ds:Signature /></Invoice>`;
    const post = jest.spyOn((service as any).axiosInstance, 'post');
    for (const code of ['100', 'Ok']) {
      post.mockResolvedValueOnce({
        status: 200,
        data: `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><GetXmlByDocumentKeyResult><Code>${code}</Code><Message>OK</Message><XmlBytesBase64>${Buffer.from(invoice).toString('base64')}</XmlBytesBase64></GetXmlByDocumentKeyResult></s:Body></s:Envelope>`,
      });
    }
    post.mockResolvedValueOnce({
      status: 200,
      data: '<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><GetXmlByDocumentKeyResult><Code>205</Code><Message>XML no encontrado</Message></GetXmlByDocumentKeyResult></s:Body></s:Envelope>',
    });
    await expect(service.consultarXmlPorClave(cufe, config('produccion')))
      .resolves.toEqual(expect.objectContaining({ usable: true, code: '100', xml: invoice }));
    await expect(service.consultarXmlPorClave(cufe, config('produccion')))
      .resolves.toEqual(expect.objectContaining({ usable: true, code: 'Ok', xml: invoice }));
    await expect(service.consultarXmlPorClave(cufe, config('produccion')))
      .resolves.toEqual(expect.objectContaining({
        usable: false,
        code: '205',
        explicitNotFound: true,
        uncertain: false,
      }));
    expect(verificarFirma).toHaveBeenCalledTimes(2);
  });

  it('rechaza cac:Signature y firmas manipuladas antes de confiar o transmitir', async () => {
    const cufe = '2'.repeat(96);
    const fakeInvoice = `<Invoice xmlns:cbc="urn:test" xmlns:cac="urn:test"><cbc:UUID>${cufe}</cbc:UUID><cac:Signature /></Invoice>`;
    const { service, verificarFirma } = clientWithSignature(false);
    const post = jest.spyOn((service as any).axiosInstance, 'post');
    post.mockResolvedValueOnce({
      status: 200,
      data: `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><GetXmlByDocumentKeyResult><Code>100</Code><Message>OK</Message><XmlBytesBase64>${Buffer.from(fakeInvoice).toString('base64')}</XmlBytesBase64></GetXmlByDocumentKeyResult></s:Body></s:Envelope>`,
    });
    await expect(service.consultarXmlPorClave(cufe, config('produccion')))
      .resolves.toEqual(expect.objectContaining({
        usable: false,
        code: 'DIAN_XML_SIGNATURE_INVALID',
      }));

    post.mockClear();
    const tamperedEvent = `<ApplicationResponse xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><UUID>${'3'.repeat(96)}</UUID><ds:Signature><ds:SignatureValue>manipulada</ds:SignatureValue></ds:Signature></ApplicationResponse>`;
    await expect(service.enviarEventoXml(tamperedEvent, config('produccion')))
      .resolves.toEqual(expect.objectContaining({
        success: false,
        statusCode: 'DIAN_EVENT_XML_INVALID',
        technical: true,
      }));
    expect(verificarFirma).toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });
});
