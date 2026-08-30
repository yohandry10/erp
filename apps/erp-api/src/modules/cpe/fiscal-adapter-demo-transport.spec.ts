import { FiscalAdapterService } from './fiscal-adapter.service';

describe('FiscalAdapterService · frontera de transporte demo', () => {
  const tenantId = 'tenant-demo';
  const documento = {
    emisor: { numeroDocumento: '20123456786' },
    tipoDocumento: '01',
    serie: 'F001',
    numero: '1',
    xmlContent: '<Invoice/>',
  } as any;

  const build = () => {
    const oseApi = {
      enviarDocumento: jest.fn(),
      consultarEstado: jest.fn(),
    };
    const ose = {
      enviarCpe: jest.fn().mockResolvedValue({
        success: true,
        codigoRespuesta: '0',
        descripcionRespuesta: 'SIMULADO',
        cdr: 'cdr-demo',
        hashCPE: 'hash-demo',
      }),
      consultarEstadoCpe: jest.fn().mockResolvedValue({
        success: true,
        codigoRespuesta: '0',
        descripcionRespuesta: 'SIMULADO',
        cdr: 'cdr-demo',
      }),
    };
    const service = new FiscalAdapterService(
      {} as any,
      { getServiceByPaisId: jest.fn() } as any,
      oseApi as any,
      ose as any,
    );
    jest.spyOn(service as any, 'obtenerPaisTenant').mockResolvedValue(1);
    jest.spyOn(service as any, 'obtenerRucTenant').mockResolvedValue('20123456786');
    jest.spyOn(service as any, 'obtenerEmisionConfig').mockResolvedValue({
      modo: 'OSE_API',
      activo: true,
      isDemo: true,
      sunatEnvironment: 'homologacion',
      config: { url: 'https://ose.example.test' },
    });
    return { service, oseApi, ose };
  };

  it('bloquea todo transporte demo aunque tenga OSE_API configurado', async () => {
    const { service, oseApi, ose } = build();

    const envio = await service.enviarDocumento(documento, tenantId);
    const consulta = await service.consultarEstado(tenantId, '01', 'F001', '1');

    expect(envio).toEqual(expect.objectContaining({
      success: false,
      codigoRespuesta: 'DEMO_EXTERNAL_TRANSPORT_BLOCKED',
    }));
    expect(consulta).toEqual(expect.objectContaining({
      success: false,
      codigoRespuesta: 'DEMO_EXTERNAL_TRANSPORT_BLOCKED',
    }));
    expect(ose.enviarCpe).not.toHaveBeenCalled();
    expect(ose.consultarEstadoCpe).not.toHaveBeenCalled();
    expect(oseApi.enviarDocumento).not.toHaveBeenCalled();
    expect(oseApi.consultarEstado).not.toHaveBeenCalled();
  });

  it('bloquea una demo marcada con SUNAT producción antes de cualquier adaptador', async () => {
    const { service, oseApi, ose } = build();
    jest.spyOn(service as any, 'obtenerEmisionConfig').mockResolvedValue({
      modo: 'OSE_API',
      activo: true,
      isDemo: true,
      sunatEnvironment: 'produccion',
      config: { url: 'https://ose.example.test' },
    });

    const result = await service.enviarDocumento(documento, tenantId);

    expect(result.codigoRespuesta).toBe('DEMO_EXTERNAL_TRANSPORT_BLOCKED');
    expect(ose.enviarCpe).not.toHaveBeenCalled();
    expect(oseApi.enviarDocumento).not.toHaveBeenCalled();
  });

  it('una falla al leer empresa_config corta antes de cualquier adaptador', async () => {
    const oseApi = { enviarDocumento: jest.fn(), consultarEstado: jest.fn() };
    const ose = { enviarCpe: jest.fn(), consultarEstadoCpe: jest.fn() };
    const factory = { getServiceByPaisId: jest.fn() };
    const supabase = {
      getClient: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: null,
                error: { message: 'database unavailable' },
              }),
            }),
          }),
        }),
      }),
    };
    const service = new FiscalAdapterService(
      supabase as any,
      factory as any,
      oseApi as any,
      ose as any,
    );
    jest.spyOn(service as any, 'obtenerPaisTenant').mockResolvedValue(1);

    const result = await service.enviarDocumento(documento, tenantId);

    expect(result).toEqual(expect.objectContaining({
      success: false,
      codigoRespuesta: '99',
      descripcionRespuesta: expect.stringMatching(/database unavailable/i),
    }));
    expect(oseApi.enviarDocumento).not.toHaveBeenCalled();
    expect(ose.enviarCpe).not.toHaveBeenCalled();
    expect(factory.getServiceByPaisId).not.toHaveBeenCalled();
  });

  it('bloquea envío y consulta si el adaptador del tenant no coincide con el país histórico', async () => {
    const { service, oseApi, ose } = build();

    const envio = await service.enviarDocumento(documento, tenantId, 'CO');
    const consulta = await service.consultarEstado(
      tenantId,
      '01',
      'FV01',
      '1',
      undefined,
      'CO',
    );

    expect(envio).toEqual(expect.objectContaining({
      success: false,
      codigoRespuesta: '99',
      descripcionRespuesta: expect.stringMatching(/pertenece a CO.*configurado en PE/i),
    }));
    expect(consulta).toEqual(expect.objectContaining({
      success: false,
      codigoRespuesta: '99',
      descripcionRespuesta: expect.stringMatching(/pertenece a CO.*configurado en PE/i),
    }));
    expect(ose.enviarCpe).not.toHaveBeenCalled();
    expect(ose.consultarEstadoCpe).not.toHaveBeenCalled();
    expect(oseApi.enviarDocumento).not.toHaveBeenCalled();
    expect(oseApi.consultarEstado).not.toHaveBeenCalled();
  });

  it('un tenant Colombia nunca usa OSE aunque una fila legada diga OSE_API', async () => {
    const oseApi = { enviarDocumento: jest.fn(), consultarEstado: jest.fn() };
    const ose = { enviarCpe: jest.fn(), consultarEstadoCpe: jest.fn() };
    const dian = {
      enviarDocumento: jest.fn().mockResolvedValue({
        success: true,
        codigoRespuesta: '00',
        descripcionRespuesta: 'DIAN',
      }),
      consultarEstado: jest.fn().mockResolvedValue({
        success: true,
        codigoRespuesta: '00',
        descripcionRespuesta: 'DIAN',
      }),
    };
    const factory = { getServiceByPaisId: jest.fn().mockReturnValue(dian) };
    const service = new FiscalAdapterService(
      {} as any,
      factory as any,
      oseApi as any,
      ose as any,
    );
    jest.spyOn(service as any, 'obtenerPaisTenant').mockResolvedValue(2);
    jest.spyOn(service as any, 'obtenerEmisionConfig').mockResolvedValue({
      modo: 'OSE_API',
      activo: true,
      isDemo: false,
      sunatEnvironment: 'produccion',
      config: { url: 'http://169.254.169.254/latest/meta-data' },
    });

    await expect(service.enviarDocumento(documento, tenantId, 'CO')).resolves.toEqual(
      expect.objectContaining({ success: true, descripcionRespuesta: 'DIAN' }),
    );
    await expect(service.consultarEstado(
      tenantId,
      '01',
      'FV01',
      '1',
      undefined,
      'CO',
    )).resolves.toEqual(expect.objectContaining({ success: true, descripcionRespuesta: 'DIAN' }));

    expect(factory.getServiceByPaisId).toHaveBeenCalledWith(2);
    expect(dian.enviarDocumento).toHaveBeenCalledTimes(1);
    expect(dian.consultarEstado).toHaveBeenCalledTimes(1);
    expect(oseApi.enviarDocumento).not.toHaveBeenCalled();
    expect(oseApi.consultarEstado).not.toHaveBeenCalled();
    expect(ose.enviarCpe).not.toHaveBeenCalled();
    expect(ose.consultarEstadoCpe).not.toHaveBeenCalled();
  });
});
