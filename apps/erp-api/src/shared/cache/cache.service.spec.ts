import { CacheService } from './cache.service';

describe('CacheService runtime health', () => {
  it('exige PONG cuando Redis es contractual', async () => {
    const redis = { status: 'ready', ping: jest.fn().mockResolvedValue('PONG') };
    const config = { get: jest.fn((key: string) => key === 'REDIS_REQUIRED' ? 'true' : 'production') };
    const service = new CacheService(redis as any, config as any);
    await service.onModuleInit();
    await expect(service.getRuntimeHealth()).resolves.toEqual({
      ready: true, required: true, status: 'ready', mode: 'redis',
    });
  });

  it('no presenta el fallback de memoria como ready en producción', async () => {
    const redis = { status: 'reconnecting', ping: jest.fn() };
    const config = { get: jest.fn((key: string) => key === 'NODE_ENV' ? 'production' : undefined) };
    const service = new CacheService(redis as any, config as any);
    await service.onModuleInit();
    await expect(service.getRuntimeHealth()).resolves.toEqual({
      ready: false, required: true, status: 'reconnecting', mode: 'memory',
    });
    expect(redis.ping).not.toHaveBeenCalled();
  });
});
