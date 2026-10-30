import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { CpeService } from './cpe.service';

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ACTOR = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const KEY = 'cpe-ui-cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const payload = () => ({
  tipoComprobante: '01', serie: 'F001', clienteTipoDocumento: 'RUC',
  clienteRuc: '20123456808', clienteRazonSocial: 'Cliente local',
  moneda: 'PEN', fechaEmision: '2026-10-08', idempotency_key: KEY,
  items: [{ descripcion: 'Servicio', cantidad: 1, valorUnitario: 1, igv: 0.18 }],
});

function harness(result: any = { data: null, error: null }) {
  const query: any = { select: jest.fn(), eq: jest.fn(), maybeSingle: jest.fn().mockResolvedValue(result) };
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
  const client = { from: jest.fn(() => query), rpc: jest.fn().mockResolvedValue({ data: 15, error: null }) };
  const service = new CpeService({ getClient: () => client } as any,
    {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
  jest.spyOn(service as any, 'getEmpresaEmisorInfoStrict').mockResolvedValue({
    pais: 'PE', moneda: 'PEN', ruc: '20123456808', razonSocial: 'Emisor local',
  });
  const writer = jest.spyOn(service, 'create').mockResolvedValue({ id: 'not-a-functional-receipt' } as any);
  return { service, client, query, writer };
}

describe('Rechazo anterior a la numeración del alta CPE UI Perú', () => {
  it.each([
    (value: any) => { value.items[0].cantidad = 0; },
    (value: any) => { value.items[0].descripcion = '   '; },
    (value: any) => { value.clienteTipoDocumento = 'DNI'; value.clienteRuc = '12345678'; },
    (value: any) => { value.clienteRazonSocial = '   '; },
  ])('identifica sólo normalización pura inválida con una intención nueva (%#)', async (invalidate) => {
    const { service, client, query, writer } = harness(); const value = payload(); invalidate(value);
    await expect(service.createFromComprobantePayload(value, TENANT, ACTOR, KEY)).rejects.toMatchObject({
      response: { error: 'CPE_CREATION_INPUT_NOT_APPLIED' },
    });
    expect(query.eq).toHaveBeenCalledWith('tenant_id', TENANT);
    expect(query.eq).toHaveBeenCalledWith('idempotency_key', KEY);
    expect(client.rpc).not.toHaveBeenCalled(); expect(writer).not.toHaveBeenCalled();
  });

  it('no libera una intención con un CPE existente aunque cambie la entrada', async () => {
    const { service, client, writer } = harness({ data: { serie: 'F001', numero: 14 }, error: null });
    const value = payload(); value.items[0].cantidad = 0;
    const error = await service.createFromComprobantePayload(value, TENANT, ACTOR, KEY).catch(value => value);
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getResponse()).not.toHaveProperty('error', 'CPE_CREATION_INPUT_NOT_APPLIED');
    expect(client.rpc).not.toHaveBeenCalled(); expect(writer).not.toHaveBeenCalled();
  });

  it.each([undefined, { data: null, error: { message: 'lectura indisponible' } }])(
    'no convierte una lectura incierta en ausencia de CPE (%#)', async (result) => {
      const { service, client, writer, query } = harness(); query.maybeSingle.mockResolvedValue(result);
      const value = payload(); value.items[0].cantidad = 0;
      const error = await service.createFromComprobantePayload(value, TENANT, ACTOR, KEY).catch(value => value);
      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.getResponse()).not.toHaveProperty('error', 'CPE_CREATION_INPUT_NOT_APPLIED');
      expect(client.rpc).not.toHaveBeenCalled(); expect(writer).not.toHaveBeenCalled();
    });

  it('conserva el contrato genérico cuando no hay clave propia de la UI', async () => {
    const { service, writer } = harness(); const value = { ...payload(), idempotency_key: '' }; value.items[0].cantidad = 0;
    const error = await service.createFromComprobantePayload(value, TENANT, ACTOR).catch(value => value);
    expect(error.getResponse()).not.toHaveProperty('error', 'CPE_CREATION_INPUT_NOT_APPLIED');
    expect(writer).not.toHaveBeenCalled();
  });

  it('nunca clasifica un error producido por el escritor como no aplicado', async () => {
    const { service, writer } = harness(); const uncertain = new ServiceUnavailableException('ACK incierto');
    writer.mockRejectedValue(uncertain);
    await expect(service.createFromComprobantePayload(payload(), TENANT, ACTOR, KEY)).rejects.toBe(uncertain);
    expect(writer).toHaveBeenCalledTimes(1);
  });
});
