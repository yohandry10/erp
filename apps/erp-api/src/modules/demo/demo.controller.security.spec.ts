import { ForbiddenException } from '@nestjs/common';
import { DemoController } from './demo.controller';

describe('DemoController security gates', () => {
  const previousDemoApiEnabled = process.env.DEMO_API_ENABLED;

  afterEach(() => {
    if (previousDemoApiEnabled === undefined) {
      delete process.env.DEMO_API_ENABLED;
    } else {
      process.env.DEMO_API_ENABLED = previousDemoApiEnabled;
    }
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
    const getPlanes = jest.fn().mockReturnValue({ planes: [] });

    const controller = new DemoController({
      getPlanes,
    } as any);

    await expect(controller.getPlanes()).resolves.toEqual({ planes: [] });
    expect(getPlanes).toHaveBeenCalledTimes(1);
  });
});
