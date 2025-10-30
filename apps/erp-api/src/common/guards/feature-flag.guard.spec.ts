import { ExecutionContext, ServiceUnavailableException } from '@nestjs/common';

const createExecutionContext = (): ExecutionContext => ({
  switchToHttp: () => ({ getRequest: () => ({}) }),
  switchToRpc: () => ({} as any),
  switchToWs: () => ({} as any),
  getClass: jest.fn(),
  getHandler: jest.fn(),
  getArgs: jest.fn(),
  getArgByIndex: jest.fn(),
  getType: jest.fn(),
} as unknown as ExecutionContext);

describe('FeatureFlagGuard', () => {
  const originalPosFlag = process.env.FEATURE_POS_ENABLED;
  const originalRrhhFlag = process.env.FEATURE_RRHH_ENABLED;

  afterEach(() => {
    process.env.FEATURE_POS_ENABLED = originalPosFlag;
    process.env.FEATURE_RRHH_ENABLED = originalRrhhFlag;
    jest.resetModules();
  });

  it('permite acceso cuando la bandera está habilitada', async () => {
    process.env.FEATURE_POS_ENABLED = 'true';
    const { FeatureFlagGuard } = await import('./feature-flag.guard');
    const guard = new FeatureFlagGuard({ get: jest.fn().mockReturnValue('pos') } as any);

    expect(guard.canActivate(createExecutionContext())).toBe(true);
  });

  it('lanza ServiceUnavailable cuando la bandera está deshabilitada', async () => {
    process.env.FEATURE_RRHH_ENABLED = 'false';
    const { FeatureFlagGuard } = await import('./feature-flag.guard');
    const guard = new FeatureFlagGuard({ get: jest.fn().mockReturnValue('rrhh') } as any);

    expect(() => guard.canActivate(createExecutionContext())).toThrow(
      'RRHH nómina no habilitado en este entorno',
    );
  });

  it('no aplica validación cuando no hay metadata de feature flag', async () => {
    const { FeatureFlagGuard } = await import('./feature-flag.guard');
    const guard = new FeatureFlagGuard({ get: jest.fn().mockReturnValue(undefined) } as any);

    expect(guard.canActivate(createExecutionContext())).toBe(true);
  });
});
