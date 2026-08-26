import { BadRequestException } from '@nestjs/common';
import { CpeDeliveryService } from './cpe-delivery.service';

describe('CpeDeliveryService - frontera de firma 476', () => {
  function createService(databaseMessage: string) {
    const rpc = jest.fn().mockResolvedValue({
      data: null, error: { message: databaseMessage },
    });
    const supabase = {
      getClient: jest.fn(() => ({ rpc })),
      getPublicClient: jest.fn(() => {
        const chain: any = {
          select: jest.fn(), eq: jest.fn(),
          maybeSingle: jest.fn().mockResolvedValue({ data: { is_demo: false }, error: null }),
        };
        chain.select.mockReturnValue(chain);
        chain.eq.mockReturnValue(chain);
        return { from: jest.fn(() => chain) };
      }),
      update: jest.fn(),
    };
    const fiscal = {
      obtenerNombreServicioFiscal: jest.fn(),
      enviarDocumento: jest.fn(),
    };
    return {
      service: new CpeDeliveryService(supabase as any, fiscal as any, {} as any, {} as any),
      rpc, supabase, fiscal,
    };
  }

  it('un CPE no enviable falla durante la reserva y no muta ni sale a red', async () => {
    const { service, rpc, supabase, fiscal } = createService('CPE_NOT_SENDABLE');

    await expect(service.retrySendToOse(
      'cpe-note-476', 'tenant-476',
      { actorId: 'actor-476', origin: 'USER' },
    )).rejects.toBeInstanceOf(BadRequestException);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(supabase.update).not.toHaveBeenCalled();
    expect(fiscal.obtenerNombreServicioFiscal).not.toHaveBeenCalled();
    expect(fiscal.enviarDocumento).not.toHaveBeenCalled();
  });

  it('un CPE sin XML firmado queda bloqueado en la reserva', async () => {
    const { service, rpc, supabase, fiscal } = createService('CPE_SIGNED_XML_REQUIRED');

    await expect(service.retrySendToOse(
      'cpe-note-476', 'tenant-476',
      { actorId: 'actor-476', origin: 'USER' },
    )).rejects.toThrow('CPE_SIGNED_XML_REQUIRED');

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(supabase.update).not.toHaveBeenCalled();
    expect(fiscal.enviarDocumento).not.toHaveBeenCalled();
  });
});
