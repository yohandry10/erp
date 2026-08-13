import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ReferencedNotesService } from './referenced-notes.service';

describe('ReferencedNotesService 472', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const actorId = '22222222-2222-4222-8222-222222222222';
  let client: any;
  let service: ReferencedNotesService;

  beforeEach(() => {
    client = { rpc: jest.fn(), from: jest.fn() };
    service = new ReferencedNotesService(
      { getClient: jest.fn(() => client) } as any,
      { get: jest.fn() } as unknown as ConfigService,
    );
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

  it('firma el snapshot de la nota y persiste sólo la transición de firma', async () => {
    const cpe = {
      id: '44444444-4444-4444-8444-444444444444',
      documento_id: '55555555-5555-4555-8555-555555555555',
      tipo_documento: '07', serie: 'FC01', numero: '00000001',
      ruc_emisor: '20123456789', razon_social_emisor: 'ERP QA SAC',
      tipo_documento_receptor: '6', documento_receptor: '20999999999',
      razon_social_receptor: 'Cliente QA', moneda: 'PEN',
      total_gravadas: 100, total_exoneradas: 0, total_inafectas: 0,
      total_exportacion: 0, total_igv: 18, total_venta: 118,
      fecha_emision: '2026-08-10', documento_referencia_tipo: '01',
      documento_referencia_serie: 'F001', documento_referencia_numero: '00000001',
      tipo_nota_credito: '10', motivo_nota: 'Ajuste comercial',
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
    const signedXml = `<Signed>${'x'.repeat(180)}</Signed>`;
    const signer = {
      signXml: jest.fn().mockReturnValue(signedXml),
      validateSignature: jest.fn().mockReturnValue(true),
      generateHash: jest.fn().mockReturnValue('firma-hash-472'),
    };
    (service as any).certificateService = {
      getXmlSigner: jest.fn().mockResolvedValue(signer),
    };
    (service as any).xmlBuilder = {
      generateXmlContent: jest.fn().mockReturnValue('<CreditNote/>'),
    };
    client.rpc.mockResolvedValue({
      data: { cpe_id: cpe.id, estado: 'FIRMADO', idempotent: false }, error: null,
    });

    const result = await service.firmar(cpe.id, tenantId, actorId, 'NOTE-472-SIGN-1');

    expect(signer.signXml).toHaveBeenCalledWith('<CreditNote/>');
    expect(client.rpc).toHaveBeenCalledWith('firmar_nota_referenciada_tx', expect.objectContaining({
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_cpe_id: cpe.id,
      p_xml_firmado: signedXml,
      p_hash_firma: 'firma-hash-472',
      p_xml_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_idempotency_key: 'note-472-sign-1',
    }));
    expect(result).toEqual(expect.objectContaining({ estado: 'FIRMADO' }));
  });
});
