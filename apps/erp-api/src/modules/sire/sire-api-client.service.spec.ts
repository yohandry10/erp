import { BadRequestException } from '@nestjs/common';
import { SireApiClientService } from './sire-api-client.service';

const tenantId = '11111111-1111-4111-8111-111111111111';

function queryWith(data: any) {
  const query: any = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    maybeSingle: jest.fn(async () => ({ data, error: null })),
  };
  return query;
}

function createService(projectRef = 'wypnbcptofqdmoynlonq') {
  const empresa = {
    ruc: '20123456789',
    pais: 'PE',
    is_demo: false,
    sire_activo: true,
    sunat_environment: 'produccion',
    sunat_username: 'SIREUSER',
    sunat_password: 'clave-sol-plana',
    sunat_gre_client_id: 'client-id',
    sunat_gre_client_secret: 'client-secret-plano',
  };
  const query = queryWith(empresa);
  const supabase = { getClient: jest.fn(() => ({ from: jest.fn(() => query) })) };
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'EXPECTED_SUPABASE_PROJECT_REF') return projectRef;
      return undefined;
    }),
  };
  return new SireApiClientService(supabase as any, config as any);
}

describe('SireApiClientService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('bloquea cualquier aceptación real cuando el backend no apunta a PROD', async () => {
    const service = createService('hbueraexcbowpfnjlppi');
    const fetchSpy = jest.spyOn(global, 'fetch');

    await expect(service.aceptarPropuesta(tenantId, 'REG_VEN', '202608'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('autentica server-side y conserva el ticket sin tratarlo como terminado', async () => {
    const service = createService();
    jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'token-sensible' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ numTicket: '20260100000001' }), { status: 200 }));

    const result = await service.aceptarPropuesta(tenantId, 'REG_VEN', '202608');

    expect(result.ticket).toBe('20260100000001');
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/rvie/propuesta/web/propuesta/202608/aceptapropuesta'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(JSON.stringify(result.responseSummary)).not.toContain('token-sensible');
  });

  it('sólo considera terminado el código SUNAT 06', async () => {
    const service = createService();
    jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'token' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        registros: [{
          numTicket: '20260100000001',
          codEstadoProceso: '06',
          desEstadoProceso: 'Terminado',
          detalleTicket: { numTicket: '20260100000001', cntFilasvalidada: 10 },
        }],
      }), { status: 200 }));

    const result = await service.consultarTicket(tenantId, 'REG_COM', '202608', '20260100000001');

    expect(result.terminado).toBe(true);
    expect(result.conErrores).toBe(false);
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('codLibro=080000'),
      expect.objectContaining({ method: 'GET' }),
    );
  });
});
