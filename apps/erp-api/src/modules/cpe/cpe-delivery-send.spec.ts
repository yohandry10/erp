import { CpeDeliveryService } from './cpe-delivery.service';

jest.mock('../../shared/utils/fiscal-transport-guard', () => ({
  assertExternalFiscalTransportAllowed: jest.fn(async () => undefined),
}));

describe('CpeDeliveryService - contrato persistido hacia adaptadores fiscales', () => {
  const dianAuthorityXml = (documentKey: string, signed = true, responseCode = '02') =>
    '<ApplicationResponse xmlns="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2" '
    + 'xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" '
    + 'xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" '
    + 'xmlns:ds="http://www.w3.org/2000/09/xmldsig#">'
    + (signed ? '<ds:Signature/>' : '')
    + '<cac:DocumentResponse><cac:Response>'
    + `<cbc:ResponseCode>${responseCode}</cbc:ResponseCode>`
    + '</cac:Response><cac:DocumentReference>'
    + `<cbc:UUID>${documentKey}</cbc:UUID>`
    + '</cac:DocumentReference></cac:DocumentResponse></ApplicationResponse>';

  function setup(
    country: 'AR' | 'CO' = 'AR',
    options: { note?: boolean; pendingZipTrackId?: string; technicalError?: boolean } = {},
  ) {
    const cpe = {
      id: 'cpe-snake',
      simulated_origin: false,
      pais: country,
      issuer_snapshot: {
        contract_version: 525,
        country_code: country,
        tax_id: country === 'AR' ? '30712345678' : '9001234567',
        legal_name: 'EMISOR FISCAL',
      },
      tenant_id: 'tenant-fiscal',
      cliente_id: country === 'CO' ? 'cliente-co-1' : null,
      tipo_documento: country === 'AR' && options.note ? '07' : '01',
      serie: country === 'AR' ? '00012' : 'FV01',
      numero: 37,
      fecha_emision: '2026-08-29T14:30:00-03:00',
      ruc_emisor: country === 'AR' ? '30712345678' : '9001234567',
      razon_social_emisor: 'EMISOR FISCAL',
      tipo_documento_receptor: country === 'AR' ? '80' : '31',
      documento_receptor: country === 'AR' ? '30712345671' : '800123456',
      razon_social_receptor: 'CLIENTE REAL',
      moneda: country === 'AR' ? 'ARS' : 'COP',
      total_gravadas: '200.00',
      total_exoneradas: '0',
      total_inafectas: '0',
      total_exportacion: '0',
      total_igv: '42.00',
      total_venta: '242.00',
      items: [{
        descripcion: 'Servicio persistido',
        cantidad: '2',
        precio_unitario: '100.00',
        valor_venta: '200.00',
        impuesto_igv: '42.00',
        precio_venta: '242.00',
        tasa_igv: '21',
        unidad_medida: 'NIU',
        codigo_producto: 'SRV-01',
      }],
      metadata: country === 'AR' ? {
        arca_condicion_iva_emisor: 'RESPONSABLE_INSCRIPTO',
        arca_condicion_iva_receptor: 'RESPONSABLE_INSCRIPTO',
      } : {
        dian_receptor_tax_profile: {
          profile: 'ADQUIRIENTE_NIT_B2B', taxLevelCode: 'O-99',
          taxLevelListName: '04', taxSchemeId: '01', taxSchemeName: 'IVA',
        },
      },
      ...(country === 'AR' && options.note ? {
        documento_referencia_tipo: '01', documento_referencia_serie: '00005',
        documento_referencia_numero: '00000009',
      } : {}),
    };
    const sealedCufe = 'E'.repeat(96);
    const authorityXml = dianAuthorityXml(sealedCufe);
    const rpc = jest.fn(async (name: string, _args: any) => {
      if (name === 'reservar_envio_cpe_tx') {
        return {
          data: {
            claimed: true,
            cpe,
            operation: { id: 'op-1', claim_token: 'claim-1' },
          },
          error: null,
        };
      }
      return {
        data: {
          claimed: true,
          cpe: { ...cpe, estado: 'ACEPTADO' },
          operation: { id: 'op-1', result_kind: 'ACCEPTED' },
        },
        error: null,
      };
    });
    const configChain: any = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          ruc: cpe.ruc_emisor,
          razon_social: cpe.razon_social_emisor,
          direccion_fiscal: 'Domicilio fiscal',
          arca_condicion_iva: 'RESPONSABLE_INSCRIPTO',
          arca_punto_venta: 12,
        },
        error: null,
      }),
    };
    const referenceChain: any = {
      select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          id: 'cpe-original', tipo_documento: '01', serie: '00005', numero: 9,
          fecha_emision: '2026-08-01', hash: '70417054367475',
          metadata: {
            fiscal_country: 'AR', arca_cae: '70417054367475',
            arca_cae_vencimiento: '20260811', arca_punto_venta: 5,
            arca_cbte_tipo: 1, arca_cbte_numero: 9,
          },
        },
        error: null,
      }),
    };
    const sealedOperationChain: any = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { request_summary: { dian_unique_code: 'E'.repeat(96) } },
        error: null,
      }),
    };
    const customerChain: any = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          dian_perfil_fiscal: 'ADQUIRIENTE_NIT_B2B',
          dian_responsabilidad_fiscal: 'O-99',
          dian_responsabilidad_list_name: '04',
          dian_tributo_id: '01',
          dian_tributo_nombre: 'IVA',
        },
        error: null,
      }),
    };
    const client = {
      rpc,
      from: jest.fn((table: string) => {
        if (table === 'cpe_operaciones') return sealedOperationChain;
        if (table === 'clientes') return customerChain;
        if (table === 'cpe' && options.note) return referenceChain;
        return configChain;
      }),
    };
    const fiscalAdapter = {
      obtenerNombreServicioFiscal: jest.fn(async () => country === 'AR' ? 'ARCA' : 'DIAN'),
      obtenerCodigoPais: jest.fn(async () => country),
      obtenerConfiguracionFiscal: jest.fn(async () => ({ tasaImpuesto: 21 })),
      enviarDocumento: jest.fn(async () => country === 'AR' ? ({
        success: true,
        codigoRespuesta: 'A',
        descripcionRespuesta: 'Autorizado',
        hash: '70417054367476',
        numeroComprobante: '00012-00000037',
        metadata: {
          cae: '70417054367476',
          caeVencimiento: '20260908',
          puntoVenta: 12,
          tipoComprobante: options.note ? 3 : 1,
          qrUrl: 'https://www.arca.gob.ar/fe/qr/?p=demo',
        },
      }) : options.pendingZipTrackId ? ({
        success: true,
        codigoRespuesta: 'DIAN_ASYNC_SUBMITTED',
        descripcionRespuesta: 'ZIP recibido por DIAN',
        metadata: {
          pending: true,
          trackId: options.pendingZipTrackId,
          dianIoAttempted: true,
        },
      }) : options.technicalError ? ({
        success: false,
        codigoRespuesta: 'DIAN_TIMEOUT_UNCERTAIN',
        descripcionRespuesta: 'Resultado incierto',
        metadata: { dianIoAttempted: true, technical: true, uncertain: true },
      }) : ({
        success: true,
        codigoRespuesta: '00',
        descripcionRespuesta: 'Validado',
        cdr: authorityXml,
        hash: 'XML-HASH-NO-ES-CUFE',
        metadata: {
          cufe: sealedCufe,
          authorityDocumentKey: sealedCufe,
          authorityStatusCode: '00',
          authoritySignatureTrusted: true,
          authorityResponse: true,
          technical: false,
          uncertain: false,
          applicationResponse: authorityXml,
          dianIoAttempted: true,
        },
      })),
    };
    const service = new CpeDeliveryService(
      { getClient: () => client } as any,
      fiscalAdapter as any,
      {} as any,
      {} as any,
    );
    return { service, rpc, fiscalAdapter, referenceChain, customerChain, cpe };
  }

  it('normaliza snake_case y acepta AR por CAE válido aunque no exista CDR', async () => {
    const { service, rpc, fiscalAdapter } = setup('AR');

    await expect(service.sendToOse('cpe-snake', 'tenant-fiscal')).resolves.toMatchObject({
      resultKind: 'ACCEPTED',
    });

    expect(fiscalAdapter.enviarDocumento).toHaveBeenCalledWith(
      expect.objectContaining({
        subtotal: 200,
        totalImpuestos: 42,
        importeTotal: 242,
        tasaImpuesto: 0.21,
        emisor: expect.objectContaining({ condicionIva: 'RESPONSABLE_INSCRIPTO' }),
        receptor: expect.objectContaining({ tipoDocumento: '80', condicionIva: 'RESPONSABLE_INSCRIPTO' }),
        items: [expect.objectContaining({
          descripcion: 'Servicio persistido',
          cantidad: 2,
          precioUnitario: 100,
          valorVenta: 200,
          igv: 42,
          tasaIgv: 0.21,
          codigoProducto: 'SRV-01',
        })],
      }),
      'tenant-fiscal',
      'AR',
    );
    const finalize = rpc.mock.calls.find(([name]) => name === 'finalizar_envio_cpe_tx');
    expect(finalize?.[1]).toMatchObject({
      p_result_kind: 'ACCEPTED',
      p_cdr: null,
      p_external_hash: '70417054367476',
      p_response_summary: {
        countryCode: 'AR',
        caeVencimiento: '20260908',
        puntoVenta: 12,
        tipoComprobante: 1,
      },
    });
  });

  it('entrega la misma forma canónica al adaptador DIAN', async () => {
    const { service, fiscalAdapter, customerChain } = setup('CO');
    await service.sendToOse('cpe-snake', 'tenant-fiscal');
    expect(fiscalAdapter.enviarDocumento).toHaveBeenCalledWith(
      expect.objectContaining({
        subtotal: 200,
        totalImpuestos: 42,
        receptor: expect.objectContaining({
          dianTaxProfile: {
            profile: 'ADQUIRIENTE_NIT_B2B', taxLevelCode: 'O-99',
            taxLevelListName: '04', taxSchemeId: '01', taxSchemeName: 'IVA',
          },
        }),
        items: [expect.objectContaining({ precioUnitario: 100, valorVenta: 200, igv: 42 })],
      }),
      'tenant-fiscal',
      'CO',
    );
    expect(customerChain.eq).not.toHaveBeenCalled();
  });

  it('no acepta un HTTP exitoso si el ApplicationResponse trae otra CUFE', async () => {
    const { service, rpc, fiscalAdapter } = setup('CO');
    const mismatchedCufe = 'F'.repeat(96);
    const responseXml = dianAuthorityXml(mismatchedCufe);
    fiscalAdapter.enviarDocumento.mockResolvedValueOnce({
      success: true,
      codigoRespuesta: '00',
      descripcionRespuesta: 'Validado con clave ajena',
      cdr: responseXml,
      hash: 'XML-HASH-INVALIDO',
      metadata: {
        cufe: mismatchedCufe,
        authorityDocumentKey: mismatchedCufe,
        authorityStatusCode: '00',
        authoritySignatureTrusted: true,
        authorityResponse: true,
        applicationResponse: responseXml,
        technical: false,
        uncertain: false,
        dianIoAttempted: true,
      },
    });

    await expect(service.sendToOse('cpe-snake', 'tenant-fiscal'))
      .rejects.toThrow('Validado con clave ajena');
    const finalize = rpc.mock.calls.find(([name]) => name === 'finalizar_envio_cpe_tx');
    expect(finalize?.[1]).toMatchObject({ p_result_kind: 'TECHNICAL_ERROR' });
  });

  it.each([
    [
      'raíz exterior',
      (cufe: string) => `<Envelope>${dianAuthorityXml(cufe)}</Envelope>`,
    ],
    [
      'ApplicationResponse anidado',
      (cufe: string) => '<ApplicationResponse xmlns="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2">'
        + dianAuthorityXml(cufe) + '</ApplicationResponse>',
    ],
    [
      'contrato sólo dentro de comentario',
      (cufe: string) => '<ApplicationResponse xmlns="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2" '
        + 'xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:Signature/>'
        + `<!-- <DocumentResponse><DocumentReference><UUID>${cufe}</UUID></DocumentReference></DocumentResponse> -->`
        + '</ApplicationResponse>',
    ],
    [
      'CUFE fuera de DocumentResponse/DocumentReference',
      (cufe: string) => '<ApplicationResponse xmlns="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2" '
        + 'xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" '
        + 'xmlns:ds="http://www.w3.org/2000/09/xmldsig#">'
        + `<ds:Signature/><cbc:UUID>${cufe}</cbc:UUID></ApplicationResponse>`,
    ],
    [
      'DocumentResponse sin Response firmado',
      (cufe: string) => dianAuthorityXml(cufe).replace(
        '<cac:Response><cbc:ResponseCode>02</cbc:ResponseCode></cac:Response>',
        '',
      ),
    ],
    [
      'ResponseCode firmado duplicado',
      (cufe: string) => dianAuthorityXml(cufe).replace(
        '<cbc:ResponseCode>02</cbc:ResponseCode>',
        '<cbc:ResponseCode>02</cbc:ResponseCode><cbc:ResponseCode>02</cbc:ResponseCode>',
      ),
    ],
    [
      'ResponseCode firmado de rechazo bajo StatusCode 00',
      (cufe: string) => dianAuthorityXml(cufe, true, '04'),
    ],
  ])('rechaza evidencia DIAN con %s aunque contenga texto coincidente', async (_case, buildXml) => {
    const { service, rpc, fiscalAdapter } = setup('CO');
    const cufe = 'E'.repeat(96);
    const responseXml = buildXml(cufe);
    fiscalAdapter.enviarDocumento.mockResolvedValueOnce({
      success: true,
      codigoRespuesta: '00',
      descripcionRespuesta: 'Evidencia estructural inválida',
      cdr: responseXml,
      hash: 'XML-HASH-ESTRUCTURA-INVALIDA',
      metadata: {
        cufe,
        authorityDocumentKey: cufe,
        authorityStatusCode: '00',
        authoritySignatureTrusted: true,
        authorityResponse: true,
        applicationResponse: responseXml,
        technical: false,
        uncertain: false,
        dianIoAttempted: true,
      },
    });

    await expect(service.sendToOse('cpe-snake', 'tenant-fiscal'))
      .rejects.toThrow('Evidencia estructural inválida');
    const finalize = rpc.mock.calls.find(([name]) => name === 'finalizar_envio_cpe_tx');
    expect(finalize?.[1]).toMatchObject({ p_result_kind: 'TECHNICAL_ERROR' });
  });

  it('no convierte en rechazo terminal una respuesta DIAN no confiable', async () => {
    const { service, rpc, fiscalAdapter } = setup('CO');
    const cufe = 'E'.repeat(96);
    const unsignedXml = dianAuthorityXml(cufe, false, '04');
    fiscalAdapter.enviarDocumento.mockResolvedValueOnce({
      success: false,
      codigoRespuesta: '90',
      descripcionRespuesta: 'Rechazo sin identidad de autoridad',
      cdr: unsignedXml,
      hash: 'XML-HASH-RECHAZO-NO-CONFIABLE',
      metadata: {
        cufe,
        authorityDocumentKey: cufe,
        authorityStatusCode: '90',
        authoritySignatureTrusted: false,
        authorityResponse: true,
        applicationResponse: unsignedXml,
        technical: false,
        uncertain: false,
        dianIoAttempted: true,
      },
    });

    await expect(service.sendToOse('cpe-snake', 'tenant-fiscal'))
      .rejects.toThrow('Rechazo sin identidad de autoridad');
    const finalize = rpc.mock.calls.find(([name]) => name === 'finalizar_envio_cpe_tx');
    expect(finalize?.[1]).toMatchObject({ p_result_kind: 'TECHNICAL_ERROR' });
  });

  it('sólo registra rechazo terminal con ApplicationResponse DIAN firmado y correlacionado', async () => {
    const { service, rpc, fiscalAdapter } = setup('CO');
    const cufe = 'E'.repeat(96);
    const signedXml = dianAuthorityXml(cufe, true, '04');
    fiscalAdapter.enviarDocumento.mockResolvedValueOnce({
      success: false,
      codigoRespuesta: '90',
      descripcionRespuesta: 'Rechazo firmado',
      cdr: signedXml,
      hash: 'XML-HASH-RECHAZO-FIRMADO',
      metadata: {
        cufe,
        authorityDocumentKey: cufe,
        authorityStatusCode: '90',
        authoritySignatureTrusted: true,
        authorityResponse: true,
        applicationResponse: signedXml,
        technical: false,
        uncertain: false,
        dianIoAttempted: true,
      },
    });

    await expect(service.sendToOse('cpe-snake', 'tenant-fiscal'))
      .rejects.toThrow('DIAN rechazó el comprobante: 90: Rechazo firmado');
    const finalize = rpc.mock.calls.find(([name]) => name === 'finalizar_envio_cpe_tx');
    expect(finalize?.[1]).toMatchObject({ p_result_kind: 'REJECTED' });
  });

  it('cierra antes del adaptador DIAN si el perfil persistido está ausente', async () => {
    const { service, fiscalAdapter, customerChain, cpe } = setup('CO');
    delete (cpe.metadata as Record<string, unknown>).dian_receptor_tax_profile;

    await expect(service.sendToOse('cpe-snake', 'tenant-fiscal'))
      .rejects.toThrow('perfil tributario inmutable del receptor');
    expect(fiscalAdapter.enviarDocumento).not.toHaveBeenCalled();
    expect(customerChain.eq).not.toHaveBeenCalled();
  });

  it('persiste la ZipKey con tipo explícito para recuperar SendTestSetAsync con GetStatusZip', async () => {
    const zipKey = 'D'.repeat(96);
    const { service, rpc } = setup('CO', { pendingZipTrackId: zipKey });

    await expect(service.sendToOse('cpe-snake', 'tenant-fiscal')).resolves.toBeDefined();

    const finalize = rpc.mock.calls.find(([name]) => name === 'finalizar_envio_cpe_tx');
    expect(finalize?.[1]).toMatchObject({
      p_result_kind: 'PENDING',
      p_response_summary: {
        countryCode: 'CO',
        dianQueryKind: 'ZIP_TRACK_ID',
        dianQueryKey: zipKey,
      },
    });
  });

  it('recupera el CUFE sellado tras timeout sin ZipKey y obliga GetStatus antes de reenviar', async () => {
    const { service, rpc } = setup('CO', { technicalError: true });

    await expect(service.sendToOse('cpe-snake', 'tenant-fiscal')).rejects.toThrow(
      /resultado incierto/i,
    );

    const finalize = rpc.mock.calls.find(([name]) => name === 'finalizar_envio_cpe_tx');
    expect(finalize?.[1]).toMatchObject({
      p_result_kind: 'TECHNICAL_ERROR',
      p_response_summary: {
        countryCode: 'CO',
        dianQueryKind: 'CUFE_CUDE',
        dianQueryKey: 'E'.repeat(96),
        retryDisposition: 'QUERY_BEFORE_RESEND',
        dianSealed: true,
        dianIoAttempted: true,
      },
    });
  });

  it('resuelve una nota AR contra la evidencia CAE autorizada del CPE origen', async () => {
    const { service, fiscalAdapter, referenceChain } = setup('AR', { note: true });
    await service.sendToOse('cpe-snake', 'tenant-fiscal');

    expect(referenceChain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-fiscal');
    expect(fiscalAdapter.enviarDocumento).toHaveBeenCalledWith(
      expect.objectContaining({
        tipoDocumento: '07',
        documentoReferencia: {
          tipo: '001', serie: '00005', numero: '9', fecha: '2026-08-01',
        },
      }),
      'tenant-fiscal',
      'AR',
    );
  });

  it('falla cerrado antes del adaptador cuando el país histórico difiere del tenant', async () => {
    const { service, fiscalAdapter, cpe } = setup('AR');
    cpe.pais = 'CO';
    cpe.issuer_snapshot.country_code = 'CO';

    await expect(service.sendToOse('cpe-snake', 'tenant-fiscal')).rejects.toThrow(
      /pertenece fiscalmente a CO.*configurado en AR/i,
    );
    expect(fiscalAdapter.enviarDocumento).not.toHaveBeenCalled();
  });

  it.each([
    'DIAN_TRANSPORT_CERT_REQUIRED',
    'DIAN_TRANSPORT_ERROR',
    'DIAN_WS_SECURITY_INVALID',
    'DIAN_TIMEOUT_UNCERTAIN',
    'HTTP_503',
    'DIAN_RESPONSE_INCOMPLETE',
  ])('clasifica %s como error técnico recuperable, no rechazo fiscal', (code) => {
    const { service } = setup('CO');
    expect((service as any).isTechnicalError(code, 'Fallo DIAN')).toBe(true);
  });
});
