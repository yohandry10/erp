import { ConfigurationService } from './configuration.service';

describe('ConfigurationService - política demo', () => {
  const certificateMissing = {
    isValid: false,
    errors: ['No se ha cargado certificado digital'],
    warnings: [],
    rucMatches: undefined,
    rucsEnCertificado: [],
  };
  const validRuc = {
    isValid: true,
    missingFields: [],
    errors: [],
    warnings: [],
  };

  function createService(isDemo: boolean) {
    const query = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          is_demo: isDemo,
          pais: 'PE',
          emision_cpe_modo: 'SUNAT_DIRECTO',
          sunat_username: null,
          sunat_password: null,
        },
        error: null,
      }),
    };
    const supabaseService = {
      getClient: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue(query),
      }),
    };
    const validationService = {
      validateCertificate: jest.fn().mockResolvedValue(certificateMissing),
      validateRucConfiguration: jest.fn().mockResolvedValue(validRuc),
    };

    return new ConfigurationService(
      supabaseService as any,
      validationService as any,
      {} as any,
    );
  }

  it('considera lista una demo aunque no tenga certificado ni credenciales SOL', async () => {
    const status = await createService(true).getConfigurationStatus('tenant-demo');

    expect(status).toMatchObject({
      isDemo: true,
      isComplete: true,
      completionPercentage: 100,
      missingItems: [],
      certificate: { exists: false, isValid: true },
      fiscal: { isEnabled: false, isReady: false, missingItems: [] },
    });
  });

  it('habilita el ERP real sin fingir habilitación fiscal', async () => {
    const status = await createService(false).getConfigurationStatus('tenant-real');

    expect(status.isDemo).toBe(false);
    expect(status.isComplete).toBe(true);
    expect(status.completionPercentage).toBe(100);
    expect(status.missingItems).toEqual([]);
    expect(status.fiscal).toMatchObject({
      isEnabled: false,
      isReady: false,
      missingItems: expect.arrayContaining([
        'Certificado digital del cliente',
      'Usuario SOL secundario',
      'Clave SOL secundaria',
      ]),
    });
    expect(status.certificate.isValid).toBe(false);
  });

  it('no declara ARCA listo con una condición IVA del emisor inválida', async () => {
    const query = {
      select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          is_demo: false, pais: 'AR', arca_activo: true,
          arca_wsaa_url: 'https://wsaa.invalid', arca_wsfe_url: 'https://wsfe.invalid',
          arca_cuit_representada: '30710158229', arca_punto_venta: 12,
          arca_condicion_iva: 'CONSUMIDOR_FINAL', ingresos_brutos: '901-1',
          fecha_inicio_actividades: '2020-01-01', provincia_fiscal: 'CABA',
        },
        error: null,
      }),
    };
    const service = new ConfigurationService(
      { getClient: () => ({ from: () => query }) } as any,
      {
        validateCertificate: jest.fn().mockResolvedValue({ ...certificateMissing, isValid: true, errors: [] }),
        validateRucConfiguration: jest.fn().mockResolvedValue(validRuc),
      } as any,
      {} as any,
    );

    const status = await service.getConfigurationStatus('tenant-ar');
    expect(status.fiscal.isReady).toBe(false);
    expect(status.fiscal.missingItems).toContain('Condición frente al IVA válida');
  });

  it('no declara DIAN listo sólo porque todos los campos y el certificado existen', async () => {
    const query = {
      select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          is_demo: false,
          pais: 'CO',
          dian_activo: true,
          dian_url: 'https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc',
          dian_usuario: 'usuario-cifrado',
          dian_password: 'password-cifrado',
          dian_software_id: 'software-id',
          dian_software_pin: 'software-pin-cifrado',
          dian_test_set_id: 'test-set-id',
          dian_environment: 'HOMOLOGACION',
          dian_regimen_fiscal: 'RESPONSABLE_IVA',
          dian_tipo_contribuyente: 'PERSONA_JURIDICA',
          dian_resolucion_numero: '18760000001',
          dian_resolucion_prefijo: 'SETP',
          dian_resolucion_desde: 1,
          dian_resolucion_hasta: 5000,
          dian_resolucion_fecha_inicio: '2026-01-01',
          dian_resolucion_fecha_fin: '2027-01-01',
        },
        error: null,
      }),
    };
    const service = new ConfigurationService(
      { getClient: () => ({ from: () => query }) } as any,
      {
        validateCertificate: jest.fn().mockResolvedValue({ ...certificateMissing, isValid: true, errors: [] }),
        validateRucConfiguration: jest.fn().mockResolvedValue(validRuc),
      } as any,
      {} as any,
    );

    const status = await service.getConfigurationStatus('tenant-co');
    expect(status.fiscal.isEnabled).toBe(true);
    expect(status.fiscal.isReady).toBe(false);
    expect(status.fiscal.missingItems).toEqual([
      'Validar certificado, software y numeración con DIAN',
    ]);
  });

  it('no desbloquea producción DIAN sin una constancia de portal ligada a la identidad vigente', async () => {
    const query = {
      select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          is_demo: false, pais: 'CO', ruc: '9015250002', dian_activo: true,
          dian_url: 'https://vpfe.dian.gov.co/WcfDianCustomerServices.svc',
          dian_software_id: 'software-id', dian_software_pin: 'pin-cifrado',
          dian_test_set_id: 'test-set-id', dian_environment: 'PRODUCCION',
          dian_regimen_fiscal: 'RESPONSABLE_IVA', dian_tipo_contribuyente: 'PERSONA_JURIDICA',
          dian_resolucion_numero: '18760000001', dian_resolucion_prefijo: 'FV',
          dian_resolucion_desde: 1, dian_resolucion_hasta: 5000,
          dian_resolucion_fecha_inicio: '2026-01-01', dian_resolucion_fecha_fin: '2027-01-01',
          dian_ultima_prueba_estado: 'VALIDADA',
          // Una aceptación técnica de documento nunca es evidencia de portal.
          dian_habilitacion_estado: 'HABILITADO',
          dian_habilitacion_at: '2026-08-29T12:00:00.000Z',
          dian_habilitacion_evidencia: { source: 'DIAN_GET_STATUS_ZIP', portal_status: 'ACCEPTED' },
        },
        error: null,
      }),
    };
    const service = new ConfigurationService(
      { getClient: () => ({ from: () => query }) } as any,
      {
        validateCertificate: jest.fn().mockResolvedValue({ ...certificateMissing, isValid: true, errors: [] }),
        validateRucConfiguration: jest.fn().mockResolvedValue(validRuc),
      } as any,
      {} as any,
    );

    const status = await service.getConfigurationStatus('tenant-co-prod');
    expect(status.fiscal.isReady).toBe(false);
    expect(status.fiscal.externalApprovalValidated).toBe(false);
    expect(status.fiscal.missingItems).toContain(
      'Registrar estado Habilitado del software desde el portal DIAN',
    );
  });
});
