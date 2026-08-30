import { CpeDeliveryService } from './cpe-delivery.service';

jest.mock('../../shared/utils/fiscal-transport-guard', () => ({
  assertExternalFiscalTransportAllowed: jest.fn(async () => undefined),
}));

describe('CpeDeliveryService - recuperación DIAN por tipo de clave', () => {
  const cufe = 'C'.repeat(96);
  const zipKey = 'D'.repeat(96);
  const authorityXml = '<ApplicationResponse xmlns="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2" '
    + 'xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" '
    + 'xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" '
    + 'xmlns:ds="http://www.w3.org/2000/09/xmldsig#">'
    + '<ds:Signature/><cac:DocumentResponse><cac:Response><cbc:ResponseCode>02</cbc:ResponseCode>'
    + '</cac:Response><cac:DocumentReference>'
    + `<cbc:UUID>${cufe}</cbc:UUID>`
    + '</cac:DocumentReference></cac:DocumentResponse></ApplicationResponse>';
  const rejectedAuthorityXml = authorityXml.replace(
    '<cbc:ResponseCode>02</cbc:ResponseCode>',
    '<cbc:ResponseCode>04</cbc:ResponseCode>',
  );

  function chainForMaybeSingle(data: any) {
    const chain: any = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data, error: null }),
    };
    return chain;
  }

  function chainForOperations(data: any[]) {
    const chain: any = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data, error: null }),
    };
    return chain;
  }

  it.each([
    ['ZIP_TRACK_ID', zipKey],
    ['CUFE_CUDE', cufe],
  ] as const)('consulta %s usando exactamente la clave persistida', async (queryKind, queryKey) => {
    const cpe = {
      id: 'cpe-dian-recovery',
      tenant_id: 'tenant-co',
      estado: 'ERROR',
      sunat_status: 'ERROR',
      simulated_origin: false,
      issuer_snapshot: { country_code: 'CO' },
      tipo_documento: '01',
      serie: 'FV01',
      numero: '1',
      hash: 'xml-hash',
      metadata: {},
    };
    const sendOperation = {
      id: 'send-operation',
      state: 'TECHNICAL_ERROR',
      result_kind: 'TECHNICAL_ERROR',
      lease_expires_at: null,
      created_at: '2026-08-29T10:00:00Z',
      request_summary: {
        country_code: 'CO',
        dian_evidence_kind: 'CUFE',
        dian_unique_code: cufe,
      },
      response_summary: {
        countryCode: 'CO',
        dianQueryKind: queryKind,
        dianQueryKey: queryKey,
      },
    };
    const cpeChain = chainForMaybeSingle(cpe);
    const operationChain = chainForOperations([sendOperation]);
    const queryOperation = {
      id: 'query-operation',
      claim_token: 'query-claim',
      request_summary: {
        ...sendOperation.request_summary,
        dian_query_kind: queryKind,
        dian_query_key: queryKey,
      },
    };
    const rpc = jest.fn(async (name: string) => name === 'reservar_recuperacion_dian_tx'
      ? {
          data: {
            claimed: true,
            cpe,
            operation: queryOperation,
            dian_unique_code: cufe,
            dian_query_kind: queryKind,
            dian_query_key: queryKey,
          },
          error: null,
        }
      : {
          data: {
            cpe: { ...cpe, estado: 'ACEPTADO' },
            operation: { ...queryOperation, result_kind: 'ACCEPTED' },
          },
          error: null,
        });
    const client = {
      from: jest.fn((table: string) => table === 'cpe' ? cpeChain : operationChain),
      rpc,
    };
    const fiscalAdapter = {
      obtenerCodigoPais: jest.fn(async () => 'CO'),
      consultarEstado: jest.fn(async () => ({
        success: true,
        codigoRespuesta: '00',
        descripcionRespuesta: 'Aceptado por DIAN',
        cdr: authorityXml,
        metadata: {
          cufe,
          authorityDocumentKey: cufe,
          authorityStatusCode: '00',
          authoritySignatureTrusted: true,
          authorityResponse: true,
          technical: false,
          uncertain: false,
          applicationResponse: authorityXml,
          dianQueryKind: queryKind,
          dianQueryKey: queryKey,
        },
      })),
    };
    const service = new CpeDeliveryService(
      { getClient: () => client } as any,
      fiscalAdapter as any,
      {} as any,
      {} as any,
    );

    await expect(service.checkOseStatus(cpe.id, cpe.tenant_id, {
      idempotencyKey: `dian.query.${queryKind.toLowerCase()}`,
      origin: 'SYSTEM',
    })).resolves.toMatchObject({ resultKind: 'ACCEPTED' });

    expect(fiscalAdapter.consultarEstado).toHaveBeenCalledWith(
      cpe.tenant_id,
      cpe.tipo_documento,
      cpe.serie,
      cpe.numero,
      queryKey,
      'CO',
      queryKind,
    );
    expect(rpc).toHaveBeenNthCalledWith(1, 'reservar_recuperacion_dian_tx', expect.any(Object));
    expect(rpc).toHaveBeenNthCalledWith(2, 'finalizar_recuperacion_dian_tx', expect.objectContaining({
      p_result_kind: 'ACCEPTED',
      p_response_summary: expect.objectContaining({
        dianQueryKind: queryKind,
        dianQueryKey: queryKey,
      }),
    }));
  });

  it('bloquea el reenvío si un resultado incierto no conserva tipo y clave de consulta', async () => {
    const cpe = {
      id: 'cpe-unsafe', estado: 'ERROR', sunat_status: 'ERROR',
      simulated_origin: false, issuer_snapshot: { country_code: 'CO' },
    };
    const cpeChain = chainForMaybeSingle(cpe);
    const operationChain = chainForOperations([{
      id: 'send-unsafe', state: 'TECHNICAL_ERROR', result_kind: 'TECHNICAL_ERROR',
      lease_expires_at: null, created_at: '2026-08-29T10:00:00Z',
      request_summary: {
        country_code: 'CO', dian_evidence_kind: 'CUFE', dian_unique_code: cufe,
      },
      response_summary: { countryCode: 'CO' },
    }]);
    const client = {
      from: jest.fn((table: string) => table === 'cpe' ? cpeChain : operationChain),
    };
    const service = new CpeDeliveryService(
      { getClient: () => client } as any, {} as any, {} as any, {} as any,
    );

    await expect((service as any).findDianRecoveryCandidate(cpe.id, 'tenant-co'))
      .rejects.toThrow(/bloquea el reenvío automático/i);
  });

  it('sólo acepta NOT_FOUND autoritativo con el código oficial del tipo de consulta', () => {
    const service = new CpeDeliveryService({} as any, {} as any, {} as any, {} as any);
    const authoritative = {
      codigoRespuesta: 'DIAN_NOT_FOUND',
      metadata: {
        status: 'NOT_FOUND',
        explicitNotFound: true,
        authorityResponse: true,
        technical: false,
        uncertain: false,
        authorityStatusCode: '66',
        dianQueryKind: 'CUFE_CUDE',
      },
    };

    expect((service as any).isDianExplicitNotFound(authoritative)).toBe(true);
    expect((service as any).isDianExplicitNotFound({
      ...authoritative,
      metadata: {
        ...authoritative.metadata,
        authorityResponse: false,
        technical: true,
      },
    })).toBe(false);
    expect((service as any).isDianExplicitNotFound({
      ...authoritative,
      metadata: { ...authoritative.metadata, authorityStatusCode: '90' },
    })).toBe(false);
    expect((service as any).isDianExplicitNotFound({
      ...authoritative,
      metadata: {
        ...authoritative.metadata,
        authorityStatusCode: '90',
        dianQueryKind: 'ZIP_TRACK_ID',
      },
    })).toBe(true);
  });

  it('reintenta SEND sin QUERY después de corregir un error local previo al sellado', async () => {
    const cpe = {
      id: 'cpe-local-preflight', tenant_id: 'tenant-co', estado: 'ERROR', sunat_status: 'ERROR',
      simulated_origin: false, issuer_snapshot: { country_code: 'CO' },
    };
    const localFailure = {
      id: 'send-local-preflight', state: 'TECHNICAL_ERROR', result_kind: 'TECHNICAL_ERROR',
      lease_expires_at: null, created_at: '2026-08-29T10:00:00Z', request_summary: {},
      response_summary: {
        countryCode: 'CO', retryDisposition: 'RETRY_SEND',
        dianDeliveryStage: 'PREFLIGHT', dianSealed: false, dianIoAttempted: false,
        dianQueryKind: null, dianQueryKey: null,
      },
    };
    const client = {
      from: jest.fn((table: string) => table === 'cpe'
        ? chainForMaybeSingle(cpe)
        : chainForOperations([localFailure])),
    };
    const fiscalAdapter = { obtenerCodigoPais: jest.fn(async () => 'CO') };
    const service = new CpeDeliveryService(
      { getClient: () => client } as any, fiscalAdapter as any, {} as any, {} as any,
    );
    const send = jest.spyOn(service, 'sendToOse').mockResolvedValue({
      success: true, resultKind: 'PENDING',
    } as any);
    const query = jest.spyOn(service, 'checkOseStatus');

    await expect(service.retrySendToOse(cpe.id, cpe.tenant_id, {
      idempotencyKey: 'retry-after-config-fix',
    })).resolves.toMatchObject({ resultKind: 'PENDING' });

    expect(send).toHaveBeenCalledWith(cpe.id, cpe.tenant_id, {
      idempotencyKey: 'retry-after-config-fix',
    });
    expect(query).not.toHaveBeenCalled();
  });

  it('obliga QUERY antes de cualquier reenvío tras timeout posterior al sellado', async () => {
    const cpe = {
      id: 'cpe-post-send-timeout', tenant_id: 'tenant-co', estado: 'ERROR', sunat_status: 'ERROR',
      simulated_origin: false, issuer_snapshot: { country_code: 'CO' },
    };
    const uncertainFailure = {
      id: 'send-post-timeout', state: 'TECHNICAL_ERROR', result_kind: 'TECHNICAL_ERROR',
      lease_expires_at: null, created_at: '2026-08-29T10:00:00Z',
      request_summary: {
        country_code: 'CO', dian_evidence_kind: 'CUFE', dian_unique_code: cufe,
      },
      response_summary: {
        countryCode: 'CO', retryDisposition: 'QUERY_BEFORE_RESEND',
        dianDeliveryStage: 'EXTERNAL_IO', dianSealed: true, dianIoAttempted: true,
        dianQueryKind: 'CUFE_CUDE', dianQueryKey: cufe,
      },
    };
    const client = {
      from: jest.fn((table: string) => table === 'cpe'
        ? chainForMaybeSingle(cpe)
        : chainForOperations([uncertainFailure])),
    };
    const fiscalAdapter = { obtenerCodigoPais: jest.fn(async () => 'CO') };
    const service = new CpeDeliveryService(
      { getClient: () => client } as any, fiscalAdapter as any, {} as any, {} as any,
    );
    const query = jest.spyOn(service, 'checkOseStatus').mockResolvedValue({
      success: true, resultKind: 'PENDING',
    } as any);
    const send = jest.spyOn(service, 'sendToOse');

    await expect(service.retrySendToOse(cpe.id, cpe.tenant_id)).resolves.toMatchObject({
      resultKind: 'PENDING',
    });

    expect(query).toHaveBeenCalledWith(cpe.id, cpe.tenant_id, expect.objectContaining({
      idempotencyKey: `dian.recovery:${uncertainFailure.id}`,
    }));
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    ['RECHAZADO', 'REJECTED'],
    ['PENDIENTE', 'PENDING'],
  ] as const)('finaliza una consulta DIAN %s como %s, no como error técnico', async (estado, resultKind) => {
    const cpe = {
      id: `cpe-dian-${estado.toLowerCase()}`,
      tenant_id: 'tenant-co',
      estado: 'ERROR',
      sunat_status: 'ERROR',
      simulated_origin: false,
      issuer_snapshot: { country_code: 'CO' },
      tipo_documento: '01',
      serie: 'FV01',
      numero: '1',
      hash: 'xml-hash',
      metadata: {},
    };
    const sendOperation = {
      id: 'send-operation',
      state: 'TECHNICAL_ERROR',
      result_kind: 'TECHNICAL_ERROR',
      lease_expires_at: null,
      created_at: '2026-08-29T10:00:00Z',
      request_summary: {
        country_code: 'CO',
        dian_evidence_kind: 'CUFE',
        dian_unique_code: cufe,
      },
      response_summary: {
        countryCode: 'CO',
        dianQueryKind: 'CUFE_CUDE',
        dianQueryKey: cufe,
      },
    };
    const queryOperation = {
      id: 'query-operation',
      claim_token: 'query-claim',
      request_summary: {
        ...sendOperation.request_summary,
        dian_query_kind: 'CUFE_CUDE',
        dian_query_key: cufe,
      },
    };
    const rpc = jest.fn(async (name: string, args: Record<string, unknown>) =>
      name === 'reservar_recuperacion_dian_tx'
        ? {
            data: {
              claimed: true,
              cpe,
              operation: queryOperation,
              dian_unique_code: cufe,
              dian_query_kind: 'CUFE_CUDE',
              dian_query_key: cufe,
            },
            error: null,
          }
        : {
            data: {
              cpe: { ...cpe, estado },
              operation: { ...queryOperation, result_kind: args.p_result_kind },
            },
            error: null,
          });
    const client = {
      from: jest.fn((table: string) => table === 'cpe'
        ? chainForMaybeSingle(cpe)
        : chainForOperations([sendOperation])),
      rpc,
    };
    const fiscalAdapter = {
      obtenerCodigoPais: jest.fn(async () => 'CO'),
      consultarEstado: jest.fn(async () => ({
        success: false,
        codigoRespuesta: estado === 'RECHAZADO' ? 'DIAN_REJECTED' : 'DIAN_PENDING',
        descripcionRespuesta: estado === 'RECHAZADO' ? 'Regla DIAN incumplida' : 'Validación en curso',
        metadata: {
          estado,
          authorityStatusCode: estado === 'RECHAZADO' ? '99' : undefined,
          authorityDocumentKey: estado === 'RECHAZADO' ? cufe : undefined,
          authoritySignatureTrusted: estado === 'RECHAZADO' ? true : undefined,
          authorityResponse: estado === 'RECHAZADO' ? true : undefined,
          technical: false,
          uncertain: false,
          applicationResponse: estado === 'RECHAZADO' ? rejectedAuthorityXml : undefined,
          dianQueryKind: 'CUFE_CUDE',
          dianQueryKey: cufe,
        },
      })),
    };
    const service = new CpeDeliveryService(
      { getClient: () => client } as any,
      fiscalAdapter as any,
      {} as any,
      {} as any,
    );
    const request = service.checkOseStatus(cpe.id, cpe.tenant_id, {
      idempotencyKey: `dian.query.${estado.toLowerCase()}`,
      origin: 'SYSTEM',
    });

    if (estado === 'RECHAZADO') {
      await expect(request).rejects.toThrow(/DIAN rechazó la consulta/i);
    } else {
      await expect(request).resolves.toMatchObject({ resultKind: 'PENDING' });
    }
    expect(rpc).toHaveBeenLastCalledWith(
      'finalizar_recuperacion_dian_tx',
      expect.objectContaining({ p_result_kind: resultKind }),
    );
  });
});
