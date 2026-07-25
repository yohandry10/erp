import { GreService } from './gre.service';

describe('GreService idempotency/in-flight guards', () => {
  it('evita doble envío concurrente si estado=ENVIADO y sunat_status=SENDING', async () => {
    const greData = {
      id: 'gre-1',
      tenant_id: 'tenant-1',
      estado: 'ENVIADO',
      sunat_status: 'SENDING',
      idempotency_key: 'gre.send:tenant-1:gre-1',
      numero: 'T001-00000001',
    };

    const single = jest.fn().mockResolvedValue({ data: greData, error: null });
    const eq = jest.fn().mockReturnValue({ single });
    const select = jest.fn().mockReturnValue({ eq });
    const from = jest.fn().mockReturnValue({ select });

    const supabaseService = {
      getClient: () => ({ from }),
      update: jest.fn(),
    } as any;

    const oseService = { enviarGre: jest.fn() } as any;

    const service = new GreService(
      supabaseService,
      { on: jest.fn(), emit: jest.fn(), eventEmitter: { eventNames: () => [] } } as any,
      {} as any,
      oseService,
      {} as any,
    );

    await service.retryProcesarEnvioSunat('gre-1', 'tenant-1');

    expect(supabaseService.update).not.toHaveBeenCalled();
    expect(oseService.enviarGre).not.toHaveBeenCalled();
  });

  it('propaga rechazos SUNAT y no reporta exito operativo en GRE', async () => {
    const greData = {
      id: 'gre-2',
      tenant_id: 'tenant-1',
      estado: 'FIRMADO',
      sunat_status: 'READY',
      idempotency_key: 'gre.send:tenant-1:gre-2',
      numero: 'T001-00000002',
    };

    const single = jest.fn().mockResolvedValue({ data: greData, error: null });
    const eq = jest.fn().mockReturnValue({ single });
    const select = jest.fn().mockReturnValue({ eq });
    const from = jest.fn().mockReturnValue({ select });

    const supabaseService = {
      getClient: () => ({ from }),
      update: jest.fn().mockResolvedValue({ data: null, error: null }),
    } as any;

    const oseService = {
      enviarGre: jest.fn().mockResolvedValue({
        success: false,
        codigoRespuesta: '3200',
        descripcionRespuesta: 'GRE rechazada por SUNAT',
      }),
    } as any;

    const service = new GreService(
      supabaseService,
      { on: jest.fn(), emit: jest.fn(), eventEmitter: { eventNames: () => [] } } as any,
      {} as any,
      oseService,
      {} as any,
    ) as any;

    service.buildGreXmlPayload = jest.fn().mockResolvedValue({
      emisor: { ruc: '20100066603' },
      gre: { numero: 'T001-00000002' },
      detalles: [],
    });
    service.generateGreXmlUbl = jest.fn().mockReturnValue('<DespatchAdvice/>');

    await expect(service.retryProcesarEnvioSunat('gre-2', 'tenant-1'))
      .rejects.toThrow(/SUNAT rechazó la GRE/);

    expect(oseService.enviarGre).toHaveBeenCalledWith(
      '<DespatchAdvice/>',
      '20100066603-09-T001-00000002',
      { tenantId: 'tenant-1' },
    );
    expect(supabaseService.update).toHaveBeenCalledWith(
      'gre_guias',
      expect.objectContaining({
        estado: 'RECHAZADO',
        sunat_status: 'REJECTED',
        error_message: '3200: GRE rechazada por SUNAT',
      }),
      { id: 'gre-2' },
    );
  });
});
