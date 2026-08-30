import { BadRequestException } from '@nestjs/common';
import { ARCA_ENDPOINTS } from '../fiscal/arca-fiscal.service';
import { ConfigurationController } from './configuration.controller';

describe('ConfigurationController · destinos ARCA', () => {
  const configurationService = {
    completeWizard: jest.fn(),
    saveWizardStep: jest.fn(),
    calculateWizardCompletionPercentage: jest.fn().mockReturnValue(20),
  };
  const cacheInvalidation = { invalidateAllTenantCache: jest.fn() };
  const controller = new ConfigurationController(
    configurationService as any,
    {} as any,
    { get: jest.fn() } as any,
    {} as any,
    cacheInvalidation as any,
    {} as any,
  );

  beforeEach(() => jest.clearAllMocks());

  it('rechaza un host arbitrario antes de completar el wizard', async () => {
    await expect(controller.completeConfiguration(
      { id: 'actor-1' } as any,
      {
        configuration: {
          pais: 'AR',
          arca_environment: 'produccion',
          arca_wsaa_url: ARCA_ENDPOINTS.produccion.wsaa,
          arca_wsfe_url: 'https://127.0.0.1/wsfev1/service.asmx',
        },
      },
      'tenant-1',
      'complete-arca-key',
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(configurationService.completeWizard).not.toHaveBeenCalled();
  });

  it('persiste únicamente el par oficial derivado del ambiente', async () => {
    configurationService.completeWizard.mockResolvedValue(undefined);

    await controller.completeConfiguration(
      { id: 'actor-1' } as any,
      {
        configuration: {
          pais: 'AR',
          arca_environment: 'produccion',
        },
      },
      'tenant-1',
      'complete-arca-key',
    );

    expect(configurationService.completeWizard).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        arca_environment: 'produccion',
        arca_wsaa_url: ARCA_ENDPOINTS.produccion.wsaa,
        arca_wsfe_url: ARCA_ENDPOINTS.produccion.wsfe,
      }),
      'actor-1',
      'complete-arca-key',
    );
  });

  it('tampoco guarda un endpoint arbitrario en el progreso temporal', async () => {
    await expect(controller.saveWizardStep(
      { id: 'actor-1' } as any,
      {
        pasoActual: 3,
        configuracionTemporal: {
          arca_environment: 'homologacion',
          arca_wsaa_url: 'https://169.254.169.254/latest/meta-data',
        },
      },
      'tenant-1',
      'wizard-arca-key',
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(configurationService.saveWizardStep).not.toHaveBeenCalled();
  });
});
