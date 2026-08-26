import { DianFiscalService } from './dian-fiscal.service';

describe('DianFiscalService · aislamiento de transporte demo', () => {
  it('no consulta el WSDL ni persiste una conectividad ficticia para una demo CO', async () => {
    const probarConectividad = jest.fn();
    const configurar = jest.fn();
    const maybeSingle = jest.fn().mockResolvedValue({
      data: {
        pais: 'CO',
        pais_id: 2,
        is_demo: true,
        dian_activo: false,
        dian_environment: 'HOMOLOGACION',
      },
      error: null,
    });
    const update = jest.fn();
    const supabase = {
      getClient: () => ({
        from: () => ({
          select: () => ({ eq: () => ({ maybeSingle }) }),
          update,
        }),
      }),
    };
    const service = new DianFiscalService(
      { get: jest.fn(() => undefined) } as any,
      {} as any,
      {} as any,
      { configurar, probarConectividad } as any,
      supabase as any,
      { getTenantId: jest.fn(() => 'tenant-demo-co') } as any,
    );
    jest.spyOn(service as any, 'loadTenantConfig').mockResolvedValue(undefined);

    await expect(service.probarConfiguracion('tenant-demo-co')).resolves.toEqual(
      expect.objectContaining({
        ready: false,
        mode: 'DEMO_EXTERNAL_TRANSPORT_BLOCKED',
        transportReachable: false,
      }),
    );
    expect(probarConectividad).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});
