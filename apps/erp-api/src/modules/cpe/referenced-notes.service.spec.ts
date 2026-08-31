import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ReferencedNotesService } from './referenced-notes.service';

describe('ReferencedNotesService 472', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const actorId = '22222222-2222-4222-8222-222222222222';
  let client: any;
  let cpeService: any;
  let service: ReferencedNotesService;

  beforeEach(() => {
    client = { rpc: jest.fn(), from: jest.fn() };
    cpeService = { firmarNotaDianReferenciada: jest.fn() };
    service = new ReferencedNotesService(
      { getClient: jest.fn(() => client) } as any,
      { get: jest.fn() } as unknown as ConfigService,
      cpeService,
    );
  });

  it('no ofrece orígenes fiscalmente aceptados sintéticos en una demo Colombia', async () => {
    const configQuery: any = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { pais: 'CO', is_demo: true },
        error: null,
      }),
    };
    client.from.mockImplementation((table: string) => {
      if (table !== 'empresa_config') {
        throw new Error(`La demo no debe consultar orígenes ${table}`);
      }
      return configQuery;
    });

    await expect(service.listarOrigenes(tenantId)).resolves.toEqual([]);
    expect(configQuery.eq).toHaveBeenCalledWith('tenant_id', tenantId);
    expect(client.from).toHaveBeenCalledTimes(1);
  });

  it('expone dos líneas con afectaciones distintas y descuenta el saldo reservado por NC', async () => {
    const sourceDocumentId = '33333333-3333-4333-8333-333333333333';
    const sourceLineA = '44444444-4444-4444-8444-444444444441';
    const sourceLineB = '44444444-4444-4444-8444-444444444442';
    const chain = (data: any) => {
      const query: any = {};
      for (const method of ['select', 'eq', 'in', 'not', 'neq', 'is', 'order', 'limit', 'contains', 'or']) {
        query[method] = jest.fn().mockReturnValue(query);
      }
      query.maybeSingle = jest.fn().mockResolvedValue({ data, error: null });
      query.then = (resolve: any, reject: any) => Promise.resolve({ data, error: null }).then(resolve, reject);
      return query;
    };
    const config = chain({ pais: 'CO', is_demo: false });
    const cpes = chain([{
      id: '55555555-5555-4555-8555-555555555555',
      documento_id: sourceDocumentId,
      tipo_documento: '01', serie: 'FV', numero: '125', estado: 'ACEPTADO',
    }]);
    const documents = chain([{
      id: sourceDocumentId, tipo_documento: 'FACTURA', moneda: 'COP', total: 219,
    }]);
    const sourceLines = chain([{
      id: sourceLineA, documento_id: sourceDocumentId, orden: 1,
      descripcion: 'Gravado', unidad_medida: 'NIU', cantidad: 2,
      valor_venta: 100, impuesto_igv: 19, impuesto_isc: 0, total_item: 119,
      metadata: { afectacion_igv: '10' },
    }, {
      id: sourceLineB, documento_id: sourceDocumentId, orden: 2,
      descripcion: 'Exento', unidad_medida: 'NIU', cantidad: 1,
      valor_venta: 100, impuesto_igv: 0, impuesto_isc: 0, total_item: 100,
      metadata: { afectacion_igv: '20' },
    }]);
    const creditNotes = chain([{
      id: '66666666-6666-4666-8666-666666666666',
      documento_origen_id: sourceDocumentId, estado: 'EMITIDO',
    }]);
    const creditedLines = chain([{
      documento_id: '66666666-6666-4666-8666-666666666666',
      cantidad: 1, valor_venta: 50, impuesto_igv: 9.5, impuesto_isc: 0,
      total_item: 59.5,
      metadata: { source_document_line_id: sourceLineA, codigo_motivo: '1' },
    }]);
    let documentCall = 0;
    let detailCall = 0;
    client.from.mockImplementation((table: string) => {
      if (table === 'empresa_config') return config;
      if (table === 'cpe') return cpes;
      if (table === 'documentos') return documentCall++ === 0 ? documents : creditNotes;
      if (table === 'documento_detalles') return detailCall++ === 0 ? sourceLines : creditedLines;
      throw new Error(`Tabla inesperada ${table}`);
    });

    const result = await service.listarOrigenes(tenantId);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      saldo_total: 159.5,
      lineas: [
        expect.objectContaining({
          id: sourceLineA, afectacion_igv: '10', saldo_cantidad: 1,
          saldo_base: 50, saldo_impuesto: 9.5, saldo_total: 59.5,
        }),
        expect.objectContaining({
          id: sourceLineB, afectacion_igv: '20', saldo_cantidad: 1,
          saldo_base: 100, saldo_impuesto: 0, saldo_total: 100,
        }),
      ],
    });
  });

  it('envía actor, llave e intención exacta a la RPC de creación', async () => {
    client.rpc.mockResolvedValue({
      data: {
        documento_id: 'doc-note', cpe_id: 'cpe-note', idempotent: false,
        financial_effect_status: 'PENDING_FISCAL_ACCEPTANCE',
      },
      error: null,
    });

    const result = await service.crear({
      documento_origen_id: '33333333-3333-4333-8333-333333333333',
      tipo_documento: '08',
      codigo_motivo: '02',
      motivo: 'Aumento contractual del valor',
      monto_total: 118,
    }, tenantId, actorId, 'NOTE-472-CREATE-1');

    expect(client.rpc).toHaveBeenCalledWith('crear_nota_referenciada_tx', {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_documento_origen_id: '33333333-3333-4333-8333-333333333333',
      p_tipo_documento: '08',
      p_codigo_motivo: '02',
      p_motivo: 'Aumento contractual del valor',
      p_monto_total: 118,
      p_idempotency_key: 'note-472-create-1',
    });
    expect(result).toEqual(expect.objectContaining({ cpe_id: 'cpe-note' }));
  });

  it('preserva 91 y el motivo DIAN de un dígito al crear la nota colombiana', async () => {
    const configQuery: any = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { pais: 'CO', is_demo: false },
        error: null,
      }),
    };
    client.from.mockImplementation((table: string) => {
      if (table !== 'empresa_config') throw new Error(`Tabla inesperada ${table}`);
      return configQuery;
    });
    client.rpc.mockResolvedValue({
      data: {
        documento_id: 'doc-note-co', cpe_id: 'cpe-note-co', tipo_documento: '91',
        financial_effect_status: 'PENDING_FISCAL_ACCEPTANCE', idempotent: false,
      },
      error: null,
    });

    await service.crear({
      documento_origen_id: '33333333-3333-4333-8333-333333333333',
      tipo_documento: '91',
      codigo_motivo: '1',
      motivo: 'Devolución parcial de bienes',
      monto_total: 119,
      lineas: [{
        source_document_line_id: '44444444-4444-4444-8444-444444444444',
        cantidad: 1,
        base: 100,
        impuesto: 19,
        total: 119,
      }],
    }, tenantId, actorId, 'NOTE-529-CREATE-CO');

    expect(client.rpc).toHaveBeenCalledWith('crear_nota_referenciada_tx', expect.objectContaining({
      p_tipo_documento: '91',
      p_codigo_motivo: '1',
      p_lineas: [expect.objectContaining({
        source_document_line_id: '44444444-4444-4444-8444-444444444444',
        total: 119,
      })],
      p_prorrateo_global: false,
      p_idempotency_key: 'note-529-create-co',
    }));
  });

  it.each([
    ['91', '1'],
    ['91', '4'],
    ['92', '1'],
    ['92', '2'],
    ['92', '4'],
  ] as const)('bloquea %s/%s si no identifica las líneas fiscales exactas', async (
    tipo_documento,
    codigo_motivo,
  ) => {
    const configQuery: any = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { pais: 'CO', is_demo: false }, error: null,
      }),
    };
    client.from.mockReturnValue(configQuery);

    await expect(service.crear({
      documento_origen_id: '33333333-3333-4333-8333-333333333333',
      tipo_documento,
      codigo_motivo,
      motivo: 'Ajuste sin líneas',
      monto_total: 119,
    }, tenantId, actorId, `NOTE-LINES-${tipo_documento}-${codigo_motivo}`))
      .rejects.toThrow(/seleccionar al menos una línea origen/i);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('bloquea antes de SQL si el total DIAN contradice la suma de líneas', async () => {
    const configQuery: any = {
      select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: { pais: 'CO', is_demo: false }, error: null }),
    };
    client.from.mockReturnValue(configQuery);

    await expect(service.crear({
      documento_origen_id: '33333333-3333-4333-8333-333333333333',
      tipo_documento: '91', codigo_motivo: '1',
      motivo: 'Devolución con total contradictorio', monto_total: 100,
      lineas: [{
        source_document_line_id: '44444444-4444-4444-8444-444444444444',
        cantidad: 1, base: 100, impuesto: 19, total: 119,
      }],
    }, tenantId, actorId, 'NOTE-LINE-TOTAL-MISMATCH'))
      .rejects.toThrow(/coincidir exactamente con la suma/i);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('exige prorrateo global explícito para NC 3', async () => {
    const configQuery: any = {
      select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: { pais: 'CO', is_demo: false }, error: null }),
    };
    client.from.mockReturnValue(configQuery);

    await expect(service.crear({
      documento_origen_id: '33333333-3333-4333-8333-333333333333',
      tipo_documento: '91', codigo_motivo: '3', motivo: 'Descuento global', monto_total: 10,
    }, tenantId, actorId, 'NOTE-GLOBAL-NO-CONFIRM'))
      .rejects.toThrow(/confirmar el prorrateo explícito/i);
  });

  it('rechaza el motivo Otros porque no conserva una representación exacta', async () => {
    const configQuery: any = {
      select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: { pais: 'CO', is_demo: false }, error: null }),
    };
    client.from.mockReturnValue(configQuery);

    await expect(service.crear({
      documento_origen_id: '33333333-3333-4333-8333-333333333333',
      tipo_documento: '91', codigo_motivo: '5', motivo: 'Otro ajuste', monto_total: 10,
    }, tenantId, actorId, 'NOTE-UNSUPPORTED-OTHER'))
      .rejects.toThrow(/no se puede representar de forma fiscalmente exacta/i);
  });

  it('traduce el rechazo SQL de anulación parcial a una instrucción clara', async () => {
    const configQuery: any = {
      select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: { pais: 'CO', is_demo: false }, error: null }),
    };
    client.from.mockReturnValue(configQuery);
    client.rpc.mockResolvedValue({
      data: null,
      error: { code: '23514', message: 'DIAN_REFERENCED_NOTE_CANCELLATION_MUST_EQUAL_REMAINING_BALANCE' },
    });

    await expect(service.crear({
      documento_origen_id: '33333333-3333-4333-8333-333333333333',
      tipo_documento: '91', codigo_motivo: '2',
      motivo: 'Anulación parcial inválida', monto_total: 10,
    }, tenantId, actorId, 'NOTE-PARTIAL-CANCEL'))
      .rejects.toThrow(/debe cubrir exactamente el saldo total restante/i);
  });

  it('rechaza la creación DIAN en demo antes de reservar correlativo o tocar SQL', async () => {
    const configQuery: any = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { pais: 'CO', is_demo: true },
        error: null,
      }),
    };
    client.from.mockReturnValue(configQuery);

    await expect(service.crear({
      documento_origen_id: '33333333-3333-4333-8333-333333333333',
      tipo_documento: '91',
      codigo_motivo: '1',
      motivo: 'Devolución parcial de bienes',
      monto_total: 119,
    }, tenantId, actorId, 'NOTE-529-DEMO-BLOCK'))
      .rejects.toThrow(/la demo no fabrica aceptación fiscal/i);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('rechaza una respuesta que no pruebe neutralidad financiera del borrador', async () => {
    client.rpc.mockResolvedValue({
      data: { documento_id: 'doc-note', cpe_id: 'cpe-note', idempotent: false },
      error: null,
    });

    await expect(service.crear({
      documento_origen_id: '33333333-3333-4333-8333-333333333333',
      tipo_documento: '07',
      codigo_motivo: '10',
      motivo: 'Ajuste comercial',
      monto_total: 10,
    }, tenantId, actorId, 'NOTE-494-CREATE-NEUTRAL'))
      .rejects.toThrow(/neutralidad financiera/i);
  });

  it('rechaza antes de SQL si falta actor o llave idempotente', async () => {
    const dto = {
      documento_origen_id: '33333333-3333-4333-8333-333333333333',
      tipo_documento: '07' as const,
      codigo_motivo: '10',
      motivo: 'Ajuste comercial',
      monto_total: 10,
    };
    await expect(service.crear(dto, tenantId, undefined, 'note-472-create-2'))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.crear(dto, tenantId, actorId, 'short'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it.each([
    { persistedType: '07', persistedReason: '10', family: 'SUNAT', expectedRoot: 'CreditNote' },
    { persistedType: '08', persistedReason: '02', family: 'SUNAT', expectedRoot: 'DebitNote' },
    { persistedType: '91', persistedReason: '1', family: 'DIAN', expectedRoot: 'CreditNote' },
    { persistedType: '92', persistedReason: '2', family: 'DIAN', expectedRoot: 'DebitNote' },
  ] as const)(
  'firma el snapshot $persistedType con UBL $family del mismo tipo fiscal', async ({
    persistedType, persistedReason, family, expectedRoot,
  }) => {
    const isCredit = ['07', '91'].includes(persistedType);
    const isDian = family === 'DIAN';
    const cpe = {
      id: '44444444-4444-4444-8444-444444444444',
      documento_id: '55555555-5555-4555-8555-555555555555',
      tipo_documento: persistedType,
      serie: persistedType === '91' ? 'NC01'
        : persistedType === '92' ? 'ND01'
          : persistedType === '07' ? 'FC01' : 'FD01',
      numero: '00000001',
      ruc_emisor: '20123456789', razon_social_emisor: 'ERP QA SAC',
      tipo_documento_receptor: '6', documento_receptor: '20999999999',
      razon_social_receptor: 'Cliente QA', moneda: isDian ? 'COP' : 'PEN',
      total_gravadas: 100, total_exoneradas: 0, total_inafectas: 0,
      total_exportacion: 0, total_igv: 18, total_venta: 118,
      fecha_emision: '2026-08-10', documento_referencia_tipo: '01',
      documento_referencia_serie: 'F001', documento_referencia_numero: '00000001',
      tipo_nota_credito: isCredit ? persistedReason : null,
      tipo_nota_debito: isCredit ? null : persistedReason,
      motivo_nota: 'Ajuste comercial',
    };
    const details = [{
      orden: 1, producto_id: null, codigo_producto: 'SERV-01',
      descripcion: 'Servicio', unidad_medida: 'ZZ', cantidad: 1,
      precio_unitario: 100, valor_venta: 100, impuesto_igv: 18,
      impuesto_isc: 0, total_item: 118, metadata: { afectacion_igv: '10' },
    }];
    const cpeQuery: any = {
      select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(), maybeSingle: jest.fn().mockResolvedValue({ data: cpe, error: null }),
    };
    const detailQuery: any = {
      select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ data: details, error: null }),
    };
    client.from.mockImplementation((table: string) => table === 'cpe' ? cpeQuery : detailQuery);
    const signedXml = isDian
      ? `<${expectedRoot} xmlns="urn:oasis:names:specification:ubl:schema:xsd:${expectedRoot}-2" xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:Signature>${'x'.repeat(180)}</ds:Signature></${expectedRoot}>`
      : `<Signed>${'x'.repeat(180)}</Signed>`;
    const signer = {
      signXml: jest.fn().mockReturnValue(signedXml),
      validateSignature: jest.fn().mockReturnValue(true),
      generateHash: jest.fn().mockReturnValue('firma-hash-472'),
    };
    (service as any).certificateService = {
      getXmlSigner: jest.fn().mockResolvedValue(signer),
    };
    (service as any).xmlBuilder = {
      generateXmlContent: jest.fn().mockReturnValue(`<${expectedRoot}/>`),
    };
    cpeService.firmarNotaDianReferenciada.mockResolvedValue(signedXml);
    client.rpc.mockResolvedValue({
      data: { cpe_id: cpe.id, estado: 'FIRMADO', idempotent: false }, error: null,
    });

    const result = await service.firmar(cpe.id, tenantId, actorId, 'NOTE-472-SIGN-1');

    if (isDian) {
      expect(cpeService.firmarNotaDianReferenciada).toHaveBeenCalledWith(
        expect.objectContaining({ tipo_documento: persistedType, items: expect.any(Array) }),
        tenantId,
      );
      expect(signer.signXml).not.toHaveBeenCalled();
      expect((service as any).xmlBuilder.generateXmlContent).not.toHaveBeenCalled();
    } else {
      expect(signer.signXml).toHaveBeenCalledWith(`<${expectedRoot}/>`);
      expect((service as any).xmlBuilder.generateXmlContent).toHaveBeenCalledWith(
        expect.objectContaining({
          tipo_documento: persistedType,
          ...(isCredit
            ? { tipo_nota_credito: persistedReason }
            : { tipo_nota_debito: persistedReason }),
        }),
      );
      expect(cpeService.firmarNotaDianReferenciada).not.toHaveBeenCalled();
    }
    expect(cpeQuery.in).toHaveBeenCalledWith('tipo_documento', ['07', '08', '91', '92']);
    expect(client.rpc).toHaveBeenCalledWith('firmar_nota_referenciada_tx', expect.objectContaining({
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_cpe_id: cpe.id,
      p_xml_firmado: signedXml,
      p_hash_firma: isDian
        ? expect.stringMatching(/^[0-9a-f]{64}$/)
        : 'firma-hash-472',
      p_xml_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_idempotency_key: 'note-472-sign-1',
    }));
    expect(result).toEqual(expect.objectContaining({ estado: 'FIRMADO' }));
  });
});
