import { CpeDeliveryService } from './cpe-delivery.service';

describe('CpeDeliveryService - owner durable 476', () => {
  const cpe = {
    id: 'cpe-476', tenant_id: 'tenant-476', estado: 'FIRMADO',
    sunat_status: 'READY', xml_firmado: '<Invoice>signed</Invoice>',
    ruc_emisor: '20123456789', razon_social_emisor: 'Emisor',
    tipo_documento_receptor: '6', documento_receptor: '20999999999',
    razon_social_receptor: 'Cliente', tipo_documento: '01',
    serie: 'F476', numero: '00000001', moneda: 'PEN',
    total_gravadas: 100, total_igv: 18, total_venta: 118, items: [],
  };

  function createService(rpc: jest.Mock) {
    const supabase = {
      getClient: jest.fn(() => ({ rpc })),
      update: jest.fn(),
    };
    const fiscal = {
      obtenerNombreServicioFiscal: jest.fn().mockResolvedValue('OSE QA'),
      obtenerCodigoPais: jest.fn().mockResolvedValue('PE'),
      obtenerConfiguracionFiscal: jest.fn().mockResolvedValue({ tasaImpuesto: 18 }),
      enviarDocumento: jest.fn().mockResolvedValue({
        success: true, codigoRespuesta: '0', descripcionRespuesta: 'Aceptado',
        cdr: '<cdr>476</cdr>', hash: 'HASH-EXT-476', numeroComprobante: 'SUNAT-476',
      }),
    };
    const service = new CpeDeliveryService(
      supabase as any, fiscal as any, {} as any, {} as any,
    );
    jest.spyOn(service as any, 'getEmpresaEmisorInfo').mockResolvedValue({
      ruc: cpe.ruc_emisor, razonSocial: cpe.razon_social_emisor,
      direccion: '', ciudad: '', departamento: '', codigoUbigeo: '',
      codigoDepartamento: '', regimenFiscal: '', tipoContribuyente: '',
    });
    return { service, supabase, fiscal };
  }

  it('ejecuta exactamente reservar → adaptador externo → finalizar', async () => {
    const operation = { id: 'operation-476', claim_token: 'claim-476' };
    const rpc = jest.fn()
      .mockResolvedValueOnce({ data: { claimed: true, operation, cpe }, error: null })
      .mockResolvedValueOnce({
        data: {
          idempotent: false,
          operation: { ...operation, result_kind: 'ACCEPTED', response_code: '0' },
          cpe: { ...cpe, estado: 'ACEPTADO', sunat_status: 'ACCEPTED' },
        },
        error: null,
      });
    const { service, supabase, fiscal } = createService(rpc);

    await service.retrySendToOse(cpe.id, cpe.tenant_id, {
      idempotencyKey: 'cpe.send:tenant-476:cpe-476', origin: 'SYSTEM',
    });

    expect(rpc).toHaveBeenNthCalledWith(1, 'reservar_envio_cpe_tx', {
      p_tenant_id: cpe.tenant_id, p_actor_id: null, p_cpe_id: cpe.id,
      p_idempotency_key: 'cpe.send:tenant-476:cpe-476', p_origin: 'SYSTEM',
    });
    expect(fiscal.enviarDocumento).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenNthCalledWith(2, 'finalizar_envio_cpe_tx', expect.objectContaining({
      p_tenant_id: cpe.tenant_id, p_operation_id: operation.id,
      p_claim_token: operation.claim_token, p_result_kind: 'ACCEPTED',
      p_cdr: '<cdr>476</cdr>',
    }));
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(supabase.update).not.toHaveBeenCalled();
  });

  it('un mismo key in-flight no llama al adaptador ni al finalizador', async () => {
    const rpc = jest.fn().mockResolvedValueOnce({
      data: {
        claimed: false, idempotent: true, reason: 'IN_FLIGHT',
        operation: { id: 'operation-476', state: 'CLAIMED' }, cpe,
      },
      error: null,
    });
    const { service, supabase, fiscal } = createService(rpc);

    const result = await service.retrySendToOse(cpe.id, cpe.tenant_id, {
      idempotencyKey: 'cpe.send:tenant-476:cpe-476', origin: 'SYSTEM',
    });

    expect(result).toEqual(expect.objectContaining({
      success: true, claimed: false, idempotent: true, reason: 'IN_FLIGHT',
    }));
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(fiscal.enviarDocumento).not.toHaveBeenCalled();
    expect(fiscal.obtenerNombreServicioFiscal).not.toHaveBeenCalled();
    expect(supabase.update).not.toHaveBeenCalled();
  });
});
