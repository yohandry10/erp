import { ConflictException } from '@nestjs/common';
import { CondicionPago, TipoDocumento } from '@erp-suite/dtos';
import { CpeService } from './cpe/cpe.service';
import { DocumentosService } from './documentos.service';
import { TipoDocumentoManual } from './documentos/dto/documentos.dto';

describe('DocumentosService — contrato atómico 461/443/448', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const actorId = '22222222-2222-4222-8222-222222222222';
  const documentoId = '33333333-3333-4333-8333-333333333333';
  let client: any;
  let cpe: jest.Mocked<Pick<CpeService, 'create' | 'findOne' | 'resendToOse' | 'anularComprobante' | 'getSignedXml'>>;
  let service: DocumentosService;
  let tableResults: Record<string, any[]>;

  const draftDto = {
    tipo_documento: TipoDocumentoManual.FACTURA,
    serie: 'F001',
    receptor_tipo_doc: 'RUC',
    receptor_numero_doc: '20100066603',
    receptor_razon_social: 'CLIENTE SAC',
    fecha_emision: '2026-08-09',
    moneda: 'PEN',
    condicion_pago: 'CONTADO' as any,
    detalles: [{
      codigo_producto: 'SERV-1',
      descripcion: 'Servicio de implementación',
      unidad_medida: 'ZZ',
      cantidad: 2,
      precio_unitario: 100,
      descuento_unitario: 10,
    }],
    idempotency_key: 'document-create:test-1',
  };

  function chainFor(table: string) {
    const result = tableResults[table]?.shift() ?? { data: null, error: null };
    const chain: any = {};
    for (const method of ['select', 'eq', 'in', 'order', 'gte', 'lte', 'ilike', 'limit', 'insert']) {
      chain[method] = jest.fn().mockReturnValue(chain);
    }
    chain.maybeSingle = jest.fn().mockResolvedValue(result);
    chain.single = jest.fn().mockResolvedValue(result);
    chain.then = (resolve: (value: any) => unknown) => Promise.resolve(result).then(resolve);
    return chain;
  }

  beforeEach(() => {
    tableResults = {};
    client = {
      rpc: jest.fn(),
      from: jest.fn((table: string) => chainFor(table)),
    };
    cpe = {
      create: jest.fn(),
      findOne: jest.fn(),
      resendToOse: jest.fn(),
      anularComprobante: jest.fn(),
      getSignedXml: jest.fn(),
    } as any;
    service = new DocumentosService(
      { getClient: () => client } as any,
      { onDocumentoCreated: jest.fn() } as any,
      cpe as any,
    );
  });

  it('crea cabecera, correlativo, detalle e impuestos únicamente mediante el RPC 461', async () => {
    client.rpc.mockResolvedValueOnce({
      data: {
        documento: { id: documentoId, estado: 'BORRADOR', total: 212.4 },
        detalles: [{ orden: 1, valor_venta: 180, impuesto_igv: 32.4, total_item: 212.4 }],
        idempotent: false,
      },
      error: null,
    });

    const result = await service.crearDocumento(draftDto, tenantId, actorId);

    expect(client.rpc).toHaveBeenCalledWith('crear_documento_manual_tx', {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_payload: expect.not.objectContaining({ total: expect.anything() }),
      p_detalles: draftDto.detalles,
      p_idempotency_key: draftDto.idempotency_key,
    });
    expect(client.from).not.toHaveBeenCalled();
    expect(result.data).toMatchObject({ id: documentoId, total: 212.4 });
  });

  it('propaga como conflicto la reutilización de una clave con otro fingerprint', async () => {
    client.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '23505', message: 'DOCUMENT_MANUAL_IDEMPOTENCY_CONFLICT' },
    });
    await expect(service.crearDocumento(draftDto, tenantId, actorId)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('crea series sólo mediante el RPC 461 con actor, key y máximo explícitos', async () => {
    client.rpc.mockResolvedValueOnce({
      data: {
        serie: { id: 'serie-1', tipo_documento: 'FACTURA', serie: 'F009' },
        idempotent: false,
      },
      error: null,
    });

    const result = await service.crearSerie({
      tipo_documento: TipoDocumentoManual.FACTURA,
      serie: 'f009',
      correlativo_maximo: 9999,
      idempotency_key: 'document-series:test-1',
    }, tenantId, actorId);

    expect(client.rpc).toHaveBeenCalledWith('crear_serie_documento_tx', {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_tipo_documento: TipoDocumentoManual.FACTURA,
      p_serie: 'f009',
      p_correlativo_maximo: 9999,
      p_idempotency_key: 'document-series:test-1',
    });
    expect(client.from).not.toHaveBeenCalled();
    expect(result.data).toMatchObject({ id: 'serie-1', serie: 'F009' });
  });

  it('emite el borrador por CPE/443 con valores persistidos y XML firmado', async () => {
    tableResults.cpe = [{ data: null, error: null }];
    tableResults.documentos = [{
      data: {
        id: documentoId,
        tipo_documento: 'FACTURA',
        serie: 'F001',
        numero: '00000007',
        estado: 'BORRADOR',
        emisor_ruc: '20100066603',
        emisor_razon_social: 'EMISOR SAC',
        receptor_tipo_doc: 'RUC',
        receptor_numero_doc: '20555555551',
        receptor_razon_social: 'CLIENTE SAC',
        moneda: 'PEN',
        tipo_cambio: 1,
        fecha_emision: '2026-08-09T05:00:00.000Z',
        metodo_pago: 'CONTADO',
        subtotal: 100,
        total_gravadas: 100,
        impuesto_igv: 18,
        total: 118,
        documento_detalles: [{
          orden: 1,
          codigo_producto: 'S1',
          descripcion: 'Servicio',
          unidad_medida: 'ZZ',
          cantidad: 1,
          precio_unitario: 100,
          descuento_unitario: 0,
          valor_venta: 100,
          impuesto_igv: 18,
          impuesto_isc: 0,
          total_item: 118,
          metadata: { afectacion_igv: '10' },
        }],
      },
      error: null,
    }];
    tableResults.empresa_config = [{ data: { pais: 'PE' }, error: null }];
    cpe.create.mockResolvedValueOnce({
      id: 'cpe-1',
      documento_id: documentoId,
      xml_firmado: '<Invoice><ds:Signature/></Invoice>',
      hash: 'abc',
    } as any);

    const result = await service.generarXML(
      documentoId,
      'document-emit:test-1',
      tenantId,
      actorId,
    );

    expect(cpe.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo_documento: TipoDocumento.FACTURA,
        serie: 'F001',
        numero: 7,
        condicion_pago: CondicionPago.CONTADO,
        total_gravadas: 100,
        total_igv: 18,
        total_venta: 118,
        idempotency_key: 'document-emit:test-1',
        items: [expect.objectContaining({ valor_venta: 100, igv: 18, precio_venta: 118 })],
      }),
      tenantId,
      actorId,
    );
    expect(result.data).toMatchObject({ cpe_id: 'cpe-1', documento_id: documentoId });
  });

  it('reutiliza el CPE firmado vinculado sin volver a emitir ni duplicar CxC/outbox', async () => {
    tableResults.cpe = [{ data: { id: 'cpe-existing' }, error: null }];
    cpe.findOne.mockResolvedValueOnce({
      id: 'cpe-existing',
      estado: 'FIRMADO',
      sunat_status: 'READY',
      xml_firmado: '<Invoice><ds:Signature/></Invoice>',
      hash: 'hash',
    } as any);

    const result = await service.generarXML(documentoId, 'document-emit:test', tenantId, actorId);

    expect(cpe.create).not.toHaveBeenCalled();
    expect(result.idempotent).toBe(true);
  });

  it('nunca responde éxito para un CPE legacy vinculado sin XML, hash ni estado reparable', async () => {
    tableResults.cpe = [{
      data: { id: 'cpe-incomplete', idempotency_key: 'legacy-partial-key' },
      error: null,
    }];
    cpe.findOne.mockResolvedValueOnce({
      id: 'cpe-incomplete',
      estado: 'BORRADOR',
      xml_firmado: null,
      hash: null,
    } as any);

    await expect(
      service.generarXML(documentoId, 'document-emit:repair', tenantId, actorId),
    ).rejects.toThrow('CPE_LINKED_INCOMPLETE');
    expect(cpe.create).not.toHaveBeenCalled();
  });

  it('mantiene reintento cuando el transporte fiscal termina en ERROR técnico', async () => {
    tableResults.cpe = [
      { data: { id: 'cpe-technical' }, error: null },
      {
        data: {
          id: 'cpe-technical',
          estado: 'RECHAZADO',
          sunat_status: 'ERROR',
          error_message: 'Timeout temporal',
        },
        error: null,
      },
    ];
    cpe.resendToOse.mockResolvedValueOnce({ message: 'procesado' } as any);

    await expect(
      service.enviarSUNAT(
        documentoId,
        'document-send:test-technical',
        tenantId,
        actorId,
      ),
    ).rejects.toThrow('Timeout temporal');

    expect(cpe.resendToOse).toHaveBeenCalledWith('cpe-technical', tenantId, {
      idempotencyKey: 'document-send:test-technical',
      actorId,
      origin: 'USER',
    });
  });

  it('rechaza firmar un contrato porque no es un comprobante fiscal', async () => {
    tableResults.cpe = [{ data: null, error: null }];
    tableResults.documentos = [{
      data: {
        id: documentoId,
        tipo_documento: 'CONTRATO',
        estado: 'BORRADOR',
        documento_detalles: [{ descripcion: 'Servicio' }],
      },
      error: null,
    }];
    await expect(
      service.generarXML(documentoId, 'document-emit:contract', tenantId, actorId),
    ).rejects.toThrow('no genera CPE/XML fiscal');
    expect(cpe.create).not.toHaveBeenCalled();
  });

  it('reemplaza el borrador completo mediante actualizar_documento_manual_tx', async () => {
    client.rpc.mockResolvedValueOnce({
      data: { documento: { id: documentoId }, detalles: [], idempotent: false },
      error: null,
    });
    await service.actualizarDocumento(
      documentoId,
      { ...draftDto, idempotency_key: 'document-update:test-1' },
      tenantId,
      actorId,
    );
    expect(client.rpc).toHaveBeenCalledWith(
      'actualizar_documento_manual_tx',
      expect.objectContaining({ p_documento_id: documentoId, p_actor_id: actorId }),
    );
  });

  it('anula localmente sólo un borrador y no permite saltar el permiso CPE desde esta ruta', async () => {
    tableResults.cpe = [
      { data: null, error: null },
      { data: { id: 'cpe-1' }, error: null },
    ];
    client.rpc.mockResolvedValueOnce({
      data: { documento_id: documentoId, estado: 'ANULADO', idempotent: false },
      error: null,
    });
    await service.anularDocumento(
      documentoId,
      'Borrador equivocado',
      'document-cancel:test-1',
      tenantId,
      actorId,
    );
    await expect(service.anularDocumento(
      documentoId, 'Devolución total', 'document-cancel:test-2', tenantId, actorId,
    )).rejects.toThrow('cpe.comprobantes.anular');

    expect(client.rpc).toHaveBeenCalledWith(
      'anular_documento_borrador_tx',
      expect.objectContaining({ p_documento_id: documentoId, p_idempotency_key: 'document-cancel:test-1' }),
    );
    expect(cpe.anularComprobante).not.toHaveBeenCalled();
  });

  it('retira explícitamente el writer fragmentado de pedidos', async () => {
    await expect(service.crearDocumentoDesdePedido({})).rejects.toThrow('446');
  });
});
