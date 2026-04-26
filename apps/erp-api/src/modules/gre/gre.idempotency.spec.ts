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
});
