import { ServiceUnavailableException } from '@nestjs/common';
import { AppController } from './app.controller';

describe('AppController runtime contract', () => {
  function build(options: { dbReady?: boolean; redisReady?: boolean } = {}) {
    const rpc = jest.fn().mockResolvedValue({
      data: {
        ready: options.dbReady ?? true,
        database: 'ok',
        contract: { outbox_rpcs: true, service_role_reads: true },
        backlog: { claimable: 0 },
      },
      error: null,
    });
    const configValues: Record<string, string> = {
      NODE_ENV: 'production',
      RENDER_GIT_COMMIT: 'render-sha-492',
      RENDER_SERVICE_ID: 'srv-local-492',
      APP_VERSION: '1.2.3',
      // Simula una variable rezagada en el proveedor de despliegue. El binario
      // no debe aceptar un esquema inferior al contractual compilado.
      REQUIRED_DATABASE_SCHEMA_VERSION: '519',
    };
    const config = { get: jest.fn((key: string) => configValues[key]) };
    const cache = {
      getRuntimeHealth: jest.fn().mockResolvedValue({
        ready: options.redisReady ?? true,
        required: true,
        status: options.redisReady === false ? 'reconnecting' : 'ready',
        mode: 'redis',
      }),
    };
    const controller = new AppController(
      { getPublicClient: () => ({ rpc }) } as any,
      config as any,
      cache as any,
    );
    return { controller, rpc, cache };
  }

  it('valida DB/outbox y Redis sin mutar ni llamar pgrst_reload_schema', async () => {
    const { controller, rpc, cache } = build();
    await expect(controller.getReadyHealth()).resolves.toEqual(expect.objectContaining({
      status: 'ready',
      checks: expect.objectContaining({
        database: expect.objectContaining({ ready: true }),
        redis: expect.objectContaining({ ready: true }),
      }),
    }));
    expect(rpc).toHaveBeenCalledWith('outbox_runtime_health_492', expect.objectContaining({
      p_required_schema_version: 534,
    }));
    expect(rpc).not.toHaveBeenCalledWith('pgrst_reload_schema', expect.anything());
    expect(cache.getRuntimeHealth).toHaveBeenCalledTimes(1);
  });

  it('permite que el despliegue eleve, pero no rebaje, el piso contractual', async () => {
    const { controller, rpc } = build();
    (controller as any).configService.get.mockImplementation((key: string) => (
      key === 'REQUIRED_DATABASE_SCHEMA_VERSION' ? '535' : {
        NODE_ENV: 'production',
        RENDER_GIT_COMMIT: 'render-sha-492',
        RENDER_SERVICE_ID: 'srv-local-492',
        APP_VERSION: '1.2.3',
      }[key]
    ));

    await controller.getReadyHealth();

    expect(rpc).toHaveBeenCalledWith('outbox_runtime_health_492', expect.objectContaining({
      p_required_schema_version: 535,
    }));
  });

  it.each([
    { dbReady: false, redisReady: true, dependency: 'database' },
    { dbReady: true, redisReady: false, dependency: 'redis' },
  ])('devuelve 503 si $dependency no está listo', async (scenario) => {
    const { controller } = build(scenario);
    await expect(controller.getReadyHealth()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('expone el SHA que Render inyecta cuando APP_COMMIT_SHA no está definido', () => {
    const { controller } = build();
    expect(controller.getVersionInfo()).toEqual(expect.objectContaining({
      version: '1.2.3',
      commit: 'render-sha-492',
      renderServiceId: 'srv-local-492',
    }));
  });
});
