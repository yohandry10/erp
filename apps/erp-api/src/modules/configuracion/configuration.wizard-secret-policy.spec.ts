import { ConfigurationService } from './configuration.service';

describe('ConfigurationService - secretos del progreso del wizard', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const actorId = '22222222-2222-4222-8222-222222222222';

  function progressRow(configuracionTemporal: Record<string, unknown>) {
    return {
      id: '33333333-3333-4333-8333-333333333333',
      tenant_id: tenantId,
      paso_actual: 3,
      pasos_completados: [1, 2],
      configuracion_temporal: configuracionTemporal,
      completado: false,
      completado_at: null,
      created_at: '2026-08-29T00:00:00.000Z',
      updated_at: '2026-08-29T00:00:00.000Z',
    };
  }

  function createService(options: { stored?: Record<string, unknown> } = {}) {
    const row = progressRow(options.stored ?? {});
    const rpc = jest.fn().mockImplementation((_name: string, args: any) => Promise.resolve({
      data: { progress: progressRow(args.p_configuracion_temporal) },
      error: null,
    }));
    const single = jest.fn().mockResolvedValue({ data: row, error: null });
    const eq = jest.fn().mockReturnValue({ single });
    const select = jest.fn().mockReturnValue({ eq });
    const from = jest.fn().mockReturnValue({ select });
    const client = { rpc, from };
    const service = new ConfigurationService(
      { getClient: () => client } as any,
      {} as any,
      {} as any,
    );
    return { service, rpc };
  }

  it('guarda sólo campos permitidos y elimina alias, variantes y secretos anidados', async () => {
    const { service, rpc } = createService();
    const progress = await service.saveWizardStep(tenantId, {
      pasoActual: 3,
      configuracionTemporal: {
        razonSocial: 'Empresa segura S.A.S.',
        dian_url: 'https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc',
        dianPassword: 'camel-secret',
        DIAN_SOFTWARE_PIN: 'case-secret',
        sunatPassword: 'sunat-secret',
        oseApiKey: 'ose-secret',
        unknownField: 'no debe persistir',
        certificateMetadata: {
          subject: 'CN=Empresa segura',
          serialNumber: '1234',
          certificatePassword: 'nested-secret',
          nested: { dianSoftwarePin: 'deep-secret' },
        },
      },
    }, actorId, 'wizard-secret-policy');

    const persisted = rpc.mock.calls[0][1].p_configuracion_temporal;
    expect(persisted).toEqual({
      razonSocial: 'Empresa segura S.A.S.',
      dian_url: 'https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc',
      certificateMetadata: {
        subject: 'CN=Empresa segura',
        serialNumber: '1234',
      },
    });
    expect(JSON.stringify(progress.configuracionTemporal)).not.toContain('secret');
  });

  it('redacta al leer una fila legacy antes de devolverla al controlador', async () => {
    const { service } = createService({
      stored: {
        ruc: '9001234568',
        dian_software_id: 'software-id-visible',
        dian_password: 'legacy-secret',
        DianSoftwarePin: 'legacy-pin',
        arbitrary: { oseBearerToken: 'nested-token' },
        certificateMetadata: {
          issuer: 'CN=CA de prueba',
          PRIVATE_KEY: 'private-key-secret',
        },
      },
    });

    const progress = await service.getWizardProgress(tenantId);
    expect(progress?.configuracionTemporal).toEqual({
      ruc: '9001234568',
      dian_software_id: 'software-id-visible',
      certificateMetadata: { issuer: 'CN=CA de prueba' },
    });
  });
});
