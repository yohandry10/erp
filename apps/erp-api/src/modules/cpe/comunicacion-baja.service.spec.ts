import { ComunicacionBajaService } from './comunicacion-baja.service';
import { XmlSigner } from '@erp-suite/crypto';

describe('ComunicacionBajaService — RA/RC durable 461', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const actorId = '22222222-2222-4222-8222-222222222222';
  const cpeId = '33333333-3333-4333-8333-333333333333';
  let service: ComunicacionBajaService;
  let client: any;
  let ose: any;
  let tableResults: Record<string, any[]>;
  let directWrites: Array<{ table: string; operation: string }>;

  function chainFor(table: string) {
    const result = tableResults[table]?.shift() ?? { data: null, error: null };
    const chain: any = {};
    for (const method of ['select', 'eq', 'in', 'order', 'limit']) {
      chain[method] = jest.fn().mockReturnValue(chain);
    }
    for (const operation of ['insert', 'update', 'delete']) {
      chain[operation] = jest.fn(() => {
        directWrites.push({ table, operation });
        return chain;
      });
    }
    chain.maybeSingle = jest.fn().mockResolvedValue(result);
    chain.single = jest.fn().mockResolvedValue(result);
    chain.then = (resolve: (value: any) => unknown) => Promise.resolve(result).then(resolve);
    return chain;
  }

  beforeEach(() => {
    tableResults = {};
    directWrites = [];
    client = {
      rpc: jest.fn(),
      from: jest.fn((table: string) => chainFor(table)),
    };
    ose = { enviarResumen: jest.fn(), consultarTicket: jest.fn() };
    service = new ComunicacionBajaService(
      { getClient: () => client } as any,
      ose,
      { get: jest.fn() } as any,
    );
  });

  it('genera VoidedDocuments RA con líneas SUNAT y datos del emisor', async () => {
    jest.spyOn(service as any, 'getEmpresaFiscalInfo').mockResolvedValue({
      ruc: '20100066603',
      razonSocial: 'EMPRESA DEMO SAC',
    });
    const xml = await (service as any).generarXmlComunicacionBaja(
      {
        numero_comunicacion: 'RA-20260809-1',
        fecha_generacion: '2026-08-09',
        fecha_comunicacion: '2026-08-09',
      },
      [{ tipo_documento: '01', serie: 'F001', numero: '00000001' }],
      'ERROR EN DATOS DE PRUEBA',
      tenantId,
    );
    expect(xml).toContain('<VoidedDocuments');
    expect(xml).toContain('<cbc:CustomizationID>1.0</cbc:CustomizationID>');
    expect(xml).toContain('<sac:DocumentSerialID>F001</sac:DocumentSerialID>');
    expect(xml).toContain('<sac:DocumentNumberID>1</sac:DocumentNumberID>');
  });

  it('rechaza un PFX inválido del tenant sin sustituirlo por una firma demo', () => {
    const options = (service as any).getCertificateRucGuardOptions({
      ruc: '20100066603',
      sunat_environment: 'homologacion',
    });

    expect(options.allowDemoFallback).toBe(false);
    expect(() => new XmlSigner({
      ...options,
      pfxBuffer: Buffer.from('pfx-invalido'),
      pfxPassword: 'incorrecta',
    })).toThrow();
  });

  it('no congela un lote si la firma XML generada no se puede validar', async () => {
    jest.spyOn(service as any, 'getXmlSigner').mockResolvedValue({
      signXml: jest.fn().mockReturnValue('<signed/>'),
      validateSignature: jest.fn().mockReturnValue(false),
    });

    await expect((service as any).firmarXml('<SummaryDocuments/>', tenantId))
      .rejects.toThrow('firma XML de RA/RC no pudo validarse');
  });

  it('genera SummaryDocuments RC con condición y bases tributarias', async () => {
    jest.spyOn(service as any, 'getEmpresaFiscalInfo').mockResolvedValue({
      ruc: '20100066603',
      razonSocial: 'EMPRESA DEMO SAC',
    });
    const xml = await (service as any).generarXmlResumenDiario(
      {
        numero_resumen: 'RC-20260809-1',
        fecha_generacion: '2026-08-09',
        fecha_referencia: '2026-08-09',
      },
      [{
        tipo_documento: '03',
        serie: 'B001',
        numero: '00000002',
        tipo_documento_receptor: '1',
        documento_receptor: '12345678',
        tipo_operacion_resumen: '3',
        moneda: 'PEN',
        total_gravadas: 10,
        total_igv: 1.8,
        total_venta: 11.8,
      }],
      tenantId,
    );
    expect(xml).toContain('<SummaryDocuments');
    expect(xml).toContain('<cbc:ConditionCode>3</cbc:ConditionCode>');
    expect(xml).toContain('<sac:TotalAmount currencyID="PEN">11.80</sac:TotalAmount>');
    expect(xml).toContain('<cbc:InstructionID>01</cbc:InstructionID>');
  });

  it('reserva cabecera+detalle RA y congela el XML firmado sólo mediante RPC', async () => {
    client.rpc
      .mockResolvedValueOnce({
        data: {
          lote: {
            id: 'ra-1',
            estado: 'PENDIENTE',
            numero_comunicacion: 'RA-20260809-1',
            fecha_generacion: '2026-08-09',
            fecha_comunicacion: '2026-08-09',
            motivo_baja: 'Error de emisión',
            comprobantes_ids: [cpeId],
          },
          idempotent: false,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { lote: { id: 'ra-1', estado: 'GENERADO' }, idempotent: false },
        error: null,
      });
    tableResults.cpe = [{
      data: [{ id: cpeId, tipo_documento: '01', serie: 'F001', numero: '1' }],
      error: null,
    }];
    jest.spyOn(service as any, 'getEmpresaFiscalInfo').mockResolvedValue({
      ruc: '20100066603',
      razonSocial: 'EMISOR SAC',
    });
    jest.spyOn(service as any, 'firmarXml').mockResolvedValue('<signed-ra/>');

    const result = await service.crearComunicacionBaja(
      {
        comprobantesIds: [cpeId],
        motivoBaja: 'Error de emisión',
        fechaComunicacion: '2026-08-09',
        idempotencyKey: 'ra-create:test-1',
      },
      tenantId,
      actorId,
    );

    expect(client.rpc.mock.calls.map((call: any[]) => call[0])).toEqual([
      'crear_comunicacion_baja_tx',
      'marcar_resumen_fiscal_generado_tx',
    ]);
    expect(client.rpc.mock.calls[1][1]).toMatchObject({
      p_tipo: 'RA',
      p_xml_firmado: '<signed-ra/>',
      p_actor_id: actorId,
    });
    expect(directWrites).toEqual([]);
    expect(result.data.estado).toBe('GENERADO');
  });

  it('reserva RC con fecha de referencia y no duplica escritores directos', async () => {
    client.rpc
      .mockResolvedValueOnce({
        data: {
          lote: {
            id: 'rc-1', estado: 'PENDIENTE', numero_resumen: 'RC-20260809-1',
            fecha_generacion: '2026-08-09', fecha_referencia: '2026-08-09',
            comprobantes_ids: [cpeId],
          },
          idempotent: false,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { lote: { id: 'rc-1', estado: 'GENERADO' }, idempotent: false },
        error: null,
      });
    tableResults.cpe = [{
      data: [{
        id: cpeId, tipo_documento: '03', serie: 'B001', numero: '1', moneda: 'PEN',
        total_gravadas: 100, total_igv: 18, total_venta: 118,
      }],
      error: null,
    }];
    jest.spyOn(service as any, 'getEmpresaFiscalInfo').mockResolvedValue({
      ruc: '20100066603', razonSocial: 'EMISOR SAC',
    });
    jest.spyOn(service as any, 'firmarXml').mockResolvedValue('<signed-rc/>');

    await service.crearResumenDiario(
      {
        fechaReferencia: '2026-08-09',
        comprobantesIds: [cpeId],
        idempotencyKey: 'rc-create:test-1',
      },
      tenantId,
      actorId,
    );

    expect(client.rpc.mock.calls[0]).toEqual([
      'crear_resumen_diario_tx',
      expect.objectContaining({ p_fecha_referencia: '2026-08-09', p_actor_id: actorId }),
    ]);
    expect(client.rpc.mock.calls[1][1]).toMatchObject({ p_tipo: 'RC' });
    expect(directWrites).toEqual([]);
  });

  it('persiste token antes de enviar y ticket después de sendSummary', async () => {
    client.rpc
      .mockResolvedValueOnce({
        data: {
          lote: { id: 'ra-1', numero_comunicacion: 'RA-20260809-1', xml_firmado: '<signed/>' },
          send_token: '44444444-4444-4444-8444-444444444444',
          should_send: true,
          idempotent: false,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { lote: { id: 'ra-1', estado: 'ENVIADO', ticket_sunat: 'T-1' }, resultado: 'TICKET' },
        error: null,
      });
    jest.spyOn(service as any, 'getEmpresaFiscalInfo').mockResolvedValue({
      ruc: '20100066603', razonSocial: 'EMISOR SAC',
    });
    ose.enviarResumen.mockResolvedValue({
      success: true,
      ticket: 'T-1',
      codigoRespuesta: '0',
      descripcionRespuesta: 'Ticket recibido',
    });

    const result = await service.enviarComunicacionBaja(
      'ra-1', tenantId, actorId, 'ra-send:test-1',
    );

    expect(client.rpc.mock.calls[0][0]).toBe('preparar_envio_resumen_fiscal_tx');
    expect(ose.enviarResumen).toHaveBeenCalledWith(
      '<signed/>', '20100066603-RA-20260809-1', { tenantId },
    );
    expect(client.rpc.mock.calls[1]).toEqual([
      'finalizar_envio_resumen_fiscal_tx',
      expect.objectContaining({
        p_resultado: 'TICKET',
        p_ticket: 'T-1',
        p_envio_token: '44444444-4444-4444-8444-444444444444',
      }),
    ]);
    expect(result.ticket).toBe('T-1');
    expect(directWrites).toEqual([]);
  });

  it('no convierte en RETRY un outcome definitivo cuya persistencia final falló', async () => {
    client.rpc
      .mockResolvedValueOnce({
        data: {
          lote: { id: 'ra-1', numero_comunicacion: 'RA-20260809-1', xml_firmado: '<signed/>' },
          send_token: '44444444-4444-4444-8444-444444444444',
          should_send: true,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: { code: '23514', message: 'FISCAL_BATCH_ACCEPTED_EVIDENCE_REQUIRED' },
      });
    jest.spyOn(service as any, 'getEmpresaFiscalInfo').mockResolvedValue({
      ruc: '20100066603', razonSocial: 'EMISOR SAC',
    });
    ose.enviarResumen.mockResolvedValue({
      success: true,
      codigoRespuesta: '0',
      descripcionRespuesta: 'Aceptado',
      cdr: '<CDR/>',
    });

    await expect(service.enviarComunicacionBaja(
      'ra-1', tenantId, actorId, 'ra-send:definitive',
    )).rejects.toThrow('FISCAL_BATCH_ACCEPTED_EVIDENCE_REQUIRED');

    expect(client.rpc).toHaveBeenCalledTimes(2);
    expect(client.rpc.mock.calls[1][1]).toMatchObject({ p_resultado: 'ACEPTADO' });
  });

  it('conserva una respuesta técnica de ticket como PENDIENTE, no como rechazo definitivo', async () => {
    tableResults.comunicaciones_baja = [{
      data: {
        id: 'ra-1', estado: 'ENVIADO', ticket_sunat: 'T-1',
        envio_token: '44444444-4444-4444-8444-444444444444',
      },
      error: null,
    }];
    ose.consultarTicket.mockResolvedValue({
      success: false,
      codigoRespuesta: '99',
      descripcionRespuesta: 'Convert HTTP produced invalid XML: Incomplete markup',
    });
    client.rpc.mockResolvedValueOnce({
      data: { lote: { id: 'ra-1', estado: 'ENVIADO' }, resultado: 'PENDIENTE' },
      error: null,
    });

    const result = await service.consultarEstadoComunicacion('ra-1', tenantId, actorId);

    expect(client.rpc).toHaveBeenCalledWith(
      'finalizar_envio_resumen_fiscal_tx',
      expect.objectContaining({ p_resultado: 'PENDIENTE' }),
    );
    expect(result).toMatchObject({ success: false, estado: 'ENVIADO', retryable: true });
    expect(directWrites).toEqual([]);
  });

  it('lista para RA sólo CPE con reversa 448 durable y sin lote activo', async () => {
    const freeCpeId = '55555555-5555-4555-8555-555555555555';
    tableResults.cpe = [{
      data: [
        {
          id: cpeId, tipo_documento: '01', serie: 'F001', numero: '1',
          fecha_emision: '2026-08-09', total_venta: 118, moneda: 'PEN',
          estado: 'ANULADO', estado_sunat: 'ANULADO',
          metadata: {
            commercial_reversal_handled: true,
            cancellation_finalization_key: 'cancel-final:occupied',
          },
        },
        {
          id: freeCpeId, tipo_documento: '01', serie: 'F001', numero: '2',
          fecha_emision: '2026-08-09', total_venta: 59, moneda: 'PEN',
          estado: 'ANULADO', estado_sunat: 'ANULADO',
          metadata: {
            commercial_reversal_handled: true,
            cancellation_finalization_key: 'cancel-final:free',
          },
        },
        {
          id: '66666666-6666-4666-8666-666666666666', tipo_documento: '01',
          estado: 'ANULADO', estado_sunat: 'ANULADO', metadata: {},
        },
      ],
      error: null,
    }];
    tableResults.comunicaciones_baja = [{
      data: [{ comprobantes_ids: [cpeId], estado: 'GENERADO' }],
      error: null,
    }];

    const result = await service.listarCpeBajaElegibles('ra', tenantId, actorId);

    expect(result.data).toEqual([
      expect.objectContaining({
        id: freeCpeId,
        tipo: 'RA',
        reversaComercialConfirmada: true,
      }),
    ]);
    expect(directWrites).toEqual([]);
  });

  it('expone lotes RC recientes para recuperar ticket/retry tras recargar la UI', async () => {
    tableResults.resumenes_diarios = [{
      data: [{ id: 'rc-1', estado: 'ENVIADO', ticket_sunat: 'T-RC-1' }],
      error: null,
    }];

    const result = await service.listarLotesFiscales('RC', tenantId, actorId);

    expect(result.data).toEqual([
      expect.objectContaining({ id: 'rc-1', tipo: 'RC', ticket_sunat: 'T-RC-1' }),
    ]);
    expect(directWrites).toEqual([]);
  });
});
