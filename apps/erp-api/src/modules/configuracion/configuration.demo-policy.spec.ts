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
    });
  });

  it('mantiene obligatoria la configuración cuando el tenant ya es real', async () => {
    const status = await createService(false).getConfigurationStatus('tenant-real');

    expect(status.isDemo).toBe(false);
    expect(status.isComplete).toBe(false);
    expect(status.completionPercentage).toBeLessThan(100);
    expect(status.missingItems).toEqual(expect.arrayContaining([
      'Certificado digital',
      'Usuario SOL secundario',
      'Clave SOL secundaria',
    ]));
    expect(status.certificate.isValid).toBe(false);
  });
});
