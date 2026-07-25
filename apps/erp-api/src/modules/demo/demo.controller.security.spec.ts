import { ForbiddenException } from '@nestjs/common';
import { DemoController } from './demo.controller';

describe('DemoController security gates', () => {
  const previousDemoApiEnabled = process.env.DEMO_API_ENABLED;
  const previousDeploymentEnv = process.env.DEPLOYMENT_ENV;
  const previousNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (previousDemoApiEnabled === undefined) {
      delete process.env.DEMO_API_ENABLED;
    } else {
      process.env.DEMO_API_ENABLED = previousDemoApiEnabled;
    }
    if (previousDeploymentEnv === undefined) delete process.env.DEPLOYMENT_ENV;
    else process.env.DEPLOYMENT_ENV = previousDeploymentEnv;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  });

  it('bloquea la lista de planes cuando DEMO_API_ENABLED no esta activo', async () => {
    process.env.DEMO_API_ENABLED = 'false';

    const controller = new DemoController({
      getPlanes: jest.fn(),
    } as any);

    await expect(controller.getPlanes()).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('permite la lista de planes cuando DEMO_API_ENABLED esta activo', async () => {
    process.env.DEMO_API_ENABLED = 'true';
    process.env.DEPLOYMENT_ENV = 'DEV';
    process.env.NODE_ENV = 'development';
    const getPlanes = jest.fn().mockReturnValue({ planes: [] });

    const controller = new DemoController({
      getPlanes,
    } as any);

    await expect(controller.getPlanes()).resolves.toEqual({ planes: [] });
    expect(getPlanes).toHaveBeenCalledTimes(1);
  });

  it('crea una demo normal en DEV sin captcha cuando la API demo esta habilitada', async () => {
    process.env.DEMO_API_ENABLED = 'true';
    process.env.DEPLOYMENT_ENV = 'DEV';
    process.env.NODE_ENV = 'development';
    const dto = { dias_duracion: 14 };
    const createDemoTenant = jest.fn().mockResolvedValue({ tenant_id: 'tenant-demo' });

    const controller = new DemoController({ createDemoTenant } as any);

    await expect(controller.createDemo(dto as any)).resolves.toEqual({ tenant_id: 'tenant-demo' });
    expect(createDemoTenant).toHaveBeenCalledWith(dto);
  });

  it('bloquea demos en PROD aunque DEMO_API_ENABLED este activo', async () => {
    process.env.DEMO_API_ENABLED = 'true';
    process.env.DEPLOYMENT_ENV = 'PROD';

    const controller = new DemoController({ getPlanes: jest.fn() } as any);

    await expect(controller.getPlanes()).rejects.toBeInstanceOf(ForbiddenException);
  });
});
