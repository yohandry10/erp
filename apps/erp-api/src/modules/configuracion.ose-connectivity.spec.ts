import { BadRequestException } from '@nestjs/common';
import { ConfiguracionController } from './configuracion.controller';
import { DEMO_EXTERNAL_TRANSPORT_BLOCKED } from '../shared/utils/fiscal-transport-guard';

describe('ConfiguracionController OSE connectivity contract', () => {
  const buildController = (isDemo: boolean, valid = true) => {
    const maybeSingle = jest.fn().mockResolvedValue({
      data: { is_demo: isDemo },
      error: null,
    });
    const publicClient = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle,
      }),
    };
    const oseService = {
      verificarConfiguracion: jest.fn().mockResolvedValue({
        valid,
        errors: valid ? [] : ['Certificado digital no encontrado'],
      }),
      getConfiguracion: jest.fn().mockReturnValue({
        url: 'https://ose.example.invalid',
        certificateExists: true,
        usuario: '***configurado***',
        password: '***configurado***',
      }),
      getTenantConfigurationStatus: jest.fn().mockResolvedValue({
        configuracion: {
          url: 'https://ose.example.invalid',
          certificateExists: true,
          usuario: '***configurado***',
          password: '***configurado***',
          environment: 'homologacion',
          isDemoTenant: false,
          connectivityStatus: 'NO_PROBADO',
          transportStatus: 'CONFIGURADO_NO_PROBADO',
        },
        verificacion: {
          valid,
          errors: valid ? [] : ['Certificado digital no encontrado'],
          connectivityStatus: 'NO_PROBADO',
        },
      }),
    };
    const controller = new ConfiguracionController(
      { getPublicClient: jest.fn().mockReturnValue(publicClient) } as any,
      oseService as any,
      {} as any,
      {} as any,
    );

    return { controller, oseService, maybeSingle };
  };

  it('bloquea una demo antes de consultar OSE y conserva el código contractual', async () => {
    const { controller, oseService } = buildController(true);

    let thrown: unknown;
    try {
      await controller.verificarConectividadSunat('tenant-demo');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(BadRequestException);
    expect((thrown as BadRequestException).getResponse()).toEqual(
      expect.objectContaining({ code: DEMO_EXTERNAL_TRANSPORT_BLOCKED }),
    );
    expect(oseService.verificarConfiguracion).not.toHaveBeenCalled();
    expect(oseService.getConfiguracion).not.toHaveBeenCalled();
    expect(oseService.getTenantConfigurationStatus).not.toHaveBeenCalled();
  });

  it('para un tenant real informa sólo configuración, nunca conexión inventada', async () => {
    const { controller, oseService } = buildController(false);

    const result = await controller.verificarConectividadSunat('tenant-real');

    expect(result).toEqual(expect.objectContaining({
      success: true,
      message: expect.stringContaining('conectividad externa no probada'),
      data: expect.objectContaining({
        conectividad: expect.objectContaining({
          status: 'NO_PROBADO',
          connectivityTested: false,
          certificateValid: true,
        }),
      }),
    }));
    expect(JSON.stringify(result)).not.toContain('CONECTADO');
    expect(JSON.stringify(result)).not.toContain('150ms');
    expect(oseService.getTenantConfigurationStatus).toHaveBeenCalledWith('tenant-real');
    expect(oseService.verificarConfiguracion).not.toHaveBeenCalled();
    expect(oseService.getConfiguracion).not.toHaveBeenCalled();
  });

  it('una configuración incompleta también queda explícitamente no probada', async () => {
    const { controller } = buildController(false, false);

    const result = await controller.verificarConectividadSunat('tenant-real');

    expect(result).toEqual(expect.objectContaining({
      success: false,
      data: expect.objectContaining({
        conectividad: expect.objectContaining({
          status: 'NO_PROBADO',
          connectivityTested: false,
          certificateValid: null,
        }),
      }),
    }));
  });

  it('GET OSE también usa exclusivamente la configuración del tenant', async () => {
    const { controller, oseService } = buildController(false);

    const result = await controller.getConfiguracionOse('tenant-real');

    expect(result).toEqual(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        message: expect.stringContaining('conectividad externa no probada'),
        configuracion: expect.objectContaining({ connectivityStatus: 'NO_PROBADO' }),
      }),
    }));
    expect(oseService.getTenantConfigurationStatus).toHaveBeenCalledWith('tenant-real');
    expect(oseService.verificarConfiguracion).not.toHaveBeenCalled();
    expect(oseService.getConfiguracion).not.toHaveBeenCalled();
  });
});
