import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import {
  assertExternalFiscalTransportAllowed,
  DEMO_EXTERNAL_TRANSPORT_BLOCKED,
} from './fiscal-transport-guard';

function buildSupabase(result: { data: unknown; error: unknown }) {
  const chain: any = {
    select: jest.fn(),
    eq: jest.fn(),
    maybeSingle: jest.fn().mockResolvedValue(result),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  const client = { from: jest.fn(() => chain) };
  return { service: { getPublicClient: jest.fn(() => client) }, client, chain };
}

describe('assertExternalFiscalTransportAllowed', () => {
  it('permite transporte sólo cuando el tenant real fue verificado explícitamente', async () => {
    const { service, client, chain } = buildSupabase({ data: { is_demo: false }, error: null });

    await expect(assertExternalFiscalTransportAllowed(service as any, 'tenant-real')).resolves.toBeUndefined();

    expect(client.from).toHaveBeenCalledWith('empresa_config');
    expect(chain.select).toHaveBeenCalledWith('is_demo');
    expect(chain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-real');
  });

  it('bloquea una demo con un código estable antes de cualquier transporte', async () => {
    const { service } = buildSupabase({ data: { is_demo: true }, error: null });

    await expect(assertExternalFiscalTransportAllowed(service as any, 'tenant-demo'))
      .rejects.toMatchObject({
        constructor: BadRequestException,
        response: expect.objectContaining({ code: DEMO_EXTERNAL_TRANSPORT_BLOCKED }),
      });
  });

  it.each([
    [{ data: null, error: null }, 'configuración ausente'],
    [{ data: null, error: { message: 'timeout' } }, 'consulta fallida'],
    [{ data: { is_demo: null }, error: null }, 'bandera ambigua'],
  ])('falla cerrado ante %s (%s)', async (result, _caseName) => {
    const { service } = buildSupabase(result as any);

    await expect(assertExternalFiscalTransportAllowed(service as any, 'tenant-dudoso'))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
