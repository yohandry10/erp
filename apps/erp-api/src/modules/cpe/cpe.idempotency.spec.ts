import { CpeService } from './cpe.service';

describe('CpeService idempotency/in-flight guards', () => {
  it('evita doble envío concurrente si estado=ENVIADO y sunat_status=SENDING', async () => {
    const cpeData = {
      id: 'cpe-1',
      tenant_id: 'tenant-1',
      estado: 'ENVIADO',
      sunat_status: 'SENDING',
      idempotency_key: 'cpe.send:tenant-1:cpe-1',
      xml_firmado: '<xml/>',
      ruc_emisor: '20123456789',
      tipo_documento: '01',
      serie: 'F001',
      numero: 1,
    };

    const single = jest.fn().mockResolvedValue({ data: cpeData, error: null });
    const eq = jest.fn().mockReturnValue({ single });
    const select = jest.fn().mockReturnValue({ eq });
    const from = jest.fn().mockReturnValue({ select });

    const supabaseService = {
      getClient: () => ({ from }),
      update: jest.fn(),
    } as any;

    const fiscalAdapter = {
      obtenerNombreServicioFiscal: jest.fn(),
      consultarEstado: jest.fn(),
    } as any;

    const service = new CpeService(
      supabaseService,
      {} as any,
      { emit: jest.fn(), on: jest.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      fiscalAdapter,
    );

    await service.retrySendToOse('cpe-1');

    expect(fiscalAdapter.obtenerNombreServicioFiscal).not.toHaveBeenCalled();
    expect(supabaseService.update).not.toHaveBeenCalled();
  });
});

