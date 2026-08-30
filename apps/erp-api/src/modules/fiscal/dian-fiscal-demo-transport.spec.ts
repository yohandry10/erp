import { DianFiscalService } from './dian-fiscal.service';

const runtime = (isDemo = false) => ({
  fiscalConfig: {
    url: 'https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc',
    usuario: 'usuario', password: 'password', empresaId: '9003739135',
    certificatePath: '/unused.p12', certificatePassword: 'cert-pass',
    environment: 'homologacion', pais: 'CO',
  },
  dianConfig: {
    url: 'https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc',
    environment: 'habilitacion', nit: '9003739135', softwareId: 'software-id',
    softwarePin: 'software-pin', testSetId: 'test-set-id',
    certificatePfx: Buffer.from('pfx'), certificatePassword: 'cert-pass',
    authorityTrust: {
      caBundlePem: 'TEST-DIAN-CA-BUNDLE',
      allowedSpkiSha256: ['a'.repeat(64)],
    },
  },
  dianActive: !isDemo,
  externalApprovalValidated: false,
  certificateBuffer: Buffer.from('pfx'),
  snapshot: { isDemo },
});

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
    jest.spyOn(service as any, 'loadTenantConfig').mockResolvedValue(runtime(true));

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

  it('valida por operación firmada y distingue TestSet listo de aprobación externa', async () => {
    const probarConectividad = jest.fn().mockResolvedValue({
      reachable: true,
      endpoint: 'https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc?wsdl',
      serviceDetected: true,
      message: 'WSDL oficial DIAN disponible.',
    });
    const configurar = jest.fn();
    const consultarRangosAutorizados = jest.fn().mockResolvedValue({
      rangos: [{
        prefijo: 'SETP', desde: 1, hasta: 5000, resolucion: '18760000001',
        fechaInicio: new Date('2026-01-01T05:00:00Z'),
        fechaFin: new Date('2027-12-31T05:00:00Z'),
        claveTecnica: 'NO-DEBE-PERSISTIRSE',
      }],
    });
    const configRow = {
        pais: 'CO',
        pais_id: 2,
        is_demo: false,
        dian_activo: true,
        dian_environment: 'HOMOLOGACION',
        dian_usuario: 'usuario-cifrado',
        dian_password: 'password-cifrado',
        dian_software_id: 'software-id',
        dian_software_pin: 'software-pin-cifrado',
        dian_test_set_id: 'test-set-id',
        dian_resolucion_numero: '18760000001',
        dian_resolucion_prefijo: 'SETP',
        dian_resolucion_desde: 1,
        dian_resolucion_hasta: 5000,
        dian_resolucion_fecha_inicio: '2026-01-01',
        dian_resolucion_fecha_fin: '2027-12-31',
        certificado_pfx: 'certificado-cifrado',
        certificado_password: 'certificado-password-cifrado',
      };
    const maybeSingle = jest.fn().mockResolvedValue({
      data: configRow,
      error: null,
    });
    const persistEq = jest.fn().mockResolvedValue({ data: null, error: null });
    const update = jest.fn(() => ({ eq: persistEq }));
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
      { configurar, probarConectividad, consultarRangosAutorizados } as any,
      supabase as any,
      { getTenantId: jest.fn(() => 'tenant-real-co') } as any,
    );
    const loadTenantConfig = jest.spyOn(service as any, 'loadTenantConfig')
      .mockResolvedValue(runtime());

    await expect(service.probarConfiguracion('tenant-real-co')).resolves.toEqual(
      expect.objectContaining({
        ready: true,
        mode: 'REAL',
        transportReachable: true,
        credentialsPresent: true,
        numberingValidated: true,
        softwarePinValidated: false,
        credentialsValidated: false,
        portalAttestationReady: true,
        homologationValidated: false,
        testSetSubmissionReady: true,
        transmissionEnabled: true,
        blocker: undefined,
        externalApprovalPending: false,
      }),
    );
    expect(probarConectividad).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      dian_ultima_prueba_estado: 'LISTA_PARA_TESTSET',
      dian_ultima_prueba_detalle: expect.objectContaining({
        reachable: true,
        numberingValidated: true,
        softwarePinValidated: false,
        credentialsValidated: false,
        portalAttestationReady: true,
        testSetSubmissionReady: true,
        transmissionEnabled: true,
      }),
    }));
    expect(JSON.stringify(update.mock.calls)).not.toContain('NO-DEBE-PERSISTIRSE');
    expect(persistEq).toHaveBeenCalledWith('tenant_id', 'tenant-real-co');

    consultarRangosAutorizados.mockResolvedValueOnce({
      rangos: [{
        prefijo: 'OTRO', desde: 1, hasta: 5000, resolucion: '18760000001',
        fechaInicio: new Date('2026-01-01T05:00:00Z'),
        fechaFin: new Date('2027-12-31T05:00:00Z'),
        claveTecnica: 'NO-DEBE-PERSISTIRSE',
      }],
    });
    await expect(service.probarConfiguracion('tenant-real-co')).resolves.toEqual(
      expect.objectContaining({
        ready: false,
        numberingValidated: false,
        portalAttestationReady: false,
        blocker: 'DIAN_NUMBERING_NOT_VALIDATED',
      }),
    );

    maybeSingle.mockResolvedValue({
      data: { ...configRow, dian_environment: 'PRODUCCION' },
      error: null,
    });
    loadTenantConfig.mockResolvedValue({
      ...runtime(),
      dianConfig: { ...runtime().dianConfig, environment: 'produccion', testSetId: undefined },
      externalApprovalValidated: false,
    });
    await expect(service.probarConfiguracion('tenant-real-co')).resolves.toEqual(
      expect.objectContaining({
        ready: false,
        numberingValidated: true,
        softwarePinValidated: false,
        credentialsValidated: false,
        portalAttestationReady: true,
        homologationValidated: false,
        testSetSubmissionReady: false,
        transmissionEnabled: false,
        blocker: 'DIAN_TEST_SET_APPROVAL_EVIDENCE_REQUIRED',
      }),
    );

    loadTenantConfig.mockResolvedValue({
      ...runtime(),
      dianConfig: { ...runtime().dianConfig, environment: 'produccion', testSetId: undefined },
      externalApprovalValidated: true,
    });
    await expect(service.probarConfiguracion('tenant-real-co')).resolves.toEqual(
      expect.objectContaining({
        ready: true,
        numberingValidated: true,
        softwarePinValidated: true,
        credentialsValidated: true,
        portalAttestationReady: true,
        homologationValidated: true,
        testSetSubmissionReady: false,
        transmissionEnabled: true,
        blocker: undefined,
      }),
    );
  });

  it('registra la primera atestación y revalida inmediatamente el estado productivo', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: {
        estado: 'HABILITADO',
        reference: 'RADICADO-DIAN-VERIFY-528',
        idempotent: false,
      },
      error: null,
    });
    const service = new DianFiscalService(
      { get: jest.fn(() => undefined) } as any,
      {} as any,
      {} as any,
      {} as any,
      { getClient: () => ({ rpc }) } as any,
      { getTenantId: jest.fn(() => 'tenant-real-co') } as any,
    );
    const probarConfiguracion = jest.spyOn(service, 'probarConfiguracion')
      .mockResolvedValue({
        ready: true,
        mode: 'REAL',
        numberingValidated: true,
        homologationValidated: true,
        transmissionEnabled: true,
      });

    await expect(service.registrarHabilitacionPortal(
      'tenant-real-co',
      'actor-admin-co',
      'verify-first-attestation-528',
      'RADICADO-DIAN-VERIFY-528',
    )).resolves.toEqual({
      attestation: expect.objectContaining({ estado: 'HABILITADO' }),
      validation: expect.objectContaining({ ready: true, transmissionEnabled: true }),
    });
    expect(rpc).toHaveBeenCalledWith('registrar_habilitacion_dian_tx', {
      p_tenant_id: 'tenant-real-co',
      p_actor_id: 'actor-admin-co',
      p_idempotency_key: 'verify-first-attestation-528',
      p_reference: 'RADICADO-DIAN-VERIFY-528',
    });
    expect(probarConfiguracion).toHaveBeenCalledWith('tenant-real-co');
    expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(
      probarConfiguracion.mock.invocationCallOrder[0],
    );
  });

  it('declara el trust store y los pins como bloqueadores sin intentar conectividad', async () => {
    const probarConectividad = jest.fn();
    const consultarRangosAutorizados = jest.fn();
    const maybeSingle = jest.fn().mockResolvedValue({
      data: {
        pais: 'CO', pais_id: 2, is_demo: false, dian_activo: true,
        dian_environment: 'HOMOLOGACION', dian_software_id: 'software-id',
        dian_software_pin: 'software-pin', dian_test_set_id: 'test-set-id',
        dian_resolucion_numero: '18760000001', dian_resolucion_prefijo: 'SETP',
        certificado_pfx: 'certificado-cifrado',
        certificado_password: 'certificado-password-cifrado',
      },
      error: null,
    });
    const persistEq = jest.fn().mockResolvedValue({ data: null, error: null });
    const update = jest.fn(() => ({ eq: persistEq }));
    const service = new DianFiscalService(
      { get: jest.fn(() => undefined) } as any,
      {} as any,
      {} as any,
      { probarConectividad, consultarRangosAutorizados } as any,
      {
        getClient: () => ({
          from: () => ({
            select: () => ({ eq: () => ({ maybeSingle }) }),
            update,
          }),
        }),
      } as any,
      { getTenantId: jest.fn(() => 'tenant-real-co') } as any,
    );
    jest.spyOn(service as any, 'loadTenantConfig').mockResolvedValue({
      ...runtime(),
      dianConfig: { ...runtime().dianConfig, authorityTrust: undefined },
    });

    await expect(service.probarConfiguracion('tenant-real-co')).resolves.toEqual(
      expect.objectContaining({
        ready: false,
        missing: expect.arrayContaining(['authorityTrustBundle', 'authorityTrustSpkiPins']),
        authorityTrust: {
          bundleConfigured: false,
          bundleSource: 'MISSING',
          pinsConfigured: false,
          spkiPinCount: 0,
          ready: false,
        },
        transportReachable: false,
      }),
    );
    expect(probarConectividad).not.toHaveBeenCalled();
    expect(consultarRangosAutorizados).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      dian_ultima_prueba_detalle: expect.objectContaining({
        missing: expect.arrayContaining(['authorityTrustBundle', 'authorityTrustSpkiPins']),
      }),
    }));
  });

  it('espera la validación asíncrona y bloquea una factura fuera del rango DIAN', async () => {
    const service = new DianFiscalService(
      { get: jest.fn(() => undefined) } as any,
      {} as any,
      {} as any,
      { configurar: jest.fn() } as any,
      {} as any,
      { getTenantId: jest.fn(() => 'tenant-real-co') } as any,
    );
    jest.spyOn(service as any, 'loadTenantConfig').mockResolvedValue(runtime());
    const validarRango = jest.spyOn(service as any, 'validarRangoAutorizado')
      .mockResolvedValue(false);

    const result = await service.validarDocumento({
      tipoDocumento: '01',
      serie: 'SETT',
      numero: '99999999',
      fechaEmision: new Date('2026-08-29T10:00:00-05:00'),
      moneda: 'COP',
      emisor: { numeroDocumento: '9003739135' },
      receptor: { numeroDocumento: '9012345678' },
      items: [],
      totales: { subtotal: 0, impuestos: 0, total: 0 },
    } as any);

    expect(validarRango).toHaveBeenCalledWith(
      'SETT',
      '99999999',
      expect.objectContaining({ nit: '9003739135', softwareId: 'software-id' }),
    );
    expect(result.valido).toBe(false);
    expect(result.errores).toContain('Número de factura fuera del rango autorizado por DIAN');
  });

  it('no declara una prueba lista si la base rechaza persistir su evidencia', async () => {
    const eq = jest.fn().mockResolvedValue({
      data: null,
      error: { message: 'check constraint' },
    });
    const service = new DianFiscalService(
      { get: jest.fn(() => undefined) } as any,
      {} as any,
      {} as any,
      {} as any,
      { getClient: () => ({ from: () => ({ update: () => ({ eq }) }) }) } as any,
      { getTenantId: jest.fn(() => 'tenant-real-co') } as any,
    );

    await expect((service as any).persistirPrueba(
      'LISTA_PARA_TESTSET',
      { credentialsValidated: true },
      'tenant-real-co',
    )).rejects.toThrow('No se pudo persistir la prueba DIAN');
  });

  it('no hereda secretos DIAN globales cuando un tenant tiene configuración parcial', async () => {
    const maybeSingle = jest.fn().mockResolvedValue({
      data: {
        ruc: '9003739135',
        pais: 'CO',
        is_demo: false,
        dian_activo: true,
        dian_environment: 'HOMOLOGACION',
        dian_url: null,
        dian_software_id: null,
        dian_software_pin: null,
        dian_test_set_id: null,
        certificado_pfx: null,
        certificado_password: null,
      },
      error: null,
    });
    const service = new DianFiscalService(
      { get: jest.fn((key: string) => ({
        DIAN_SOFTWARE_ID: 'GLOBAL-SOFTWARE-OTHER-TENANT',
        DIAN_SOFTWARE_PIN: 'GLOBAL-PIN-OTHER-TENANT',
        DIAN_TEST_SET_ID: 'GLOBAL-TESTSET-OTHER-TENANT',
        DIAN_CERTIFICATE_PATH: 'C:/global/other-tenant.p12',
        DIAN_CERTIFICATE_PASSWORD: 'GLOBAL-CERT-PASSWORD',
        EMPRESA_NIT: '8001972684',
      } as Record<string, string>)[key]) } as any,
      {} as any,
      {} as any,
      {} as any,
      {
        getClient: () => ({
          from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
        }),
      } as any,
      { getTenantId: jest.fn(() => 'tenant-partial-co') } as any,
    );

    const loaded = await (service as any).loadTenantConfig();

    expect(loaded.fiscalConfig).toEqual(expect.objectContaining({
      empresaId: '9003739135',
      certificatePath: '',
      certificatePassword: '',
    }));
    expect(loaded.dianConfig).toEqual(expect.objectContaining({
      nit: '9003739135',
      softwareId: '',
      softwarePin: '',
    }));
    expect(loaded.dianConfig.testSetId).toBeUndefined();
    expect(loaded.certificateBuffer).toBeUndefined();
    expect(JSON.stringify(loaded)).not.toContain('OTHER-TENANT');
    expect(JSON.stringify(loaded)).not.toContain('GLOBAL-CERT-PASSWORD');
  });

  it('bloquea una configuración tenant incompleta antes de reservar paquete o firmar', async () => {
    const rpc = jest.fn();
    const firmarXML = jest.fn();
    const enviarDocumento = jest.fn();
    const service = new DianFiscalService(
      { get: jest.fn(() => undefined) } as any,
      {} as any,
      { firmarXML } as any,
      { enviarDocumento } as any,
      { getClient: () => ({ rpc }) } as any,
      { getTenantId: jest.fn(() => 'tenant-partial-co') } as any,
    );
    jest.spyOn(service as any, 'loadTenantConfig').mockResolvedValue({
      ...runtime(),
      dianConfig: {
        ...runtime().dianConfig,
        softwareId: '',
        softwarePin: '',
        testSetId: undefined,
      },
      certificateBuffer: undefined,
    });

    await expect(service.enviarDocumento({
      tipoDocumento: '01',
      serie: 'SETP',
      numero: '1',
      fiscalContext: {
        isDemo: false,
        deliveryOperation: {
          tenantId: 'tenant-partial-co', operationId: 'op-1', claimToken: 'claim-1',
        },
      },
    } as any)).resolves.toEqual(expect.objectContaining({
      success: false,
      descripcionRespuesta: expect.stringContaining('DIAN_TENANT_CONFIGURATION_INCOMPLETE'),
      metadata: expect.objectContaining({ dianSealed: false, dianIoAttempted: false }),
    }));
    expect(rpc).not.toHaveBeenCalled();
    expect(firmarXML).not.toHaveBeenCalled();
    expect(enviarDocumento).not.toHaveBeenCalled();
  });
});
