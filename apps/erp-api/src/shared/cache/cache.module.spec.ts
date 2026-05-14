import { ConfigService } from '@nestjs/config';
import { createRedisRetryStrategy, isRedisRequired } from './cache.module';

describe('CacheModule Redis production contract', () => {
  function config(values: Record<string, unknown>): ConfigService {
    return {
      get: jest.fn((key: string) => values[key]),
    } as unknown as ConfigService;
  }

  it('requires Redis when NODE_ENV is production', () => {
    expect(isRedisRequired(config({ NODE_ENV: 'production' }))).toBe(true);
  });

  it('requires Redis when REDIS_REQUIRED is true', () => {
    expect(isRedisRequired(config({ NODE_ENV: 'development', REDIS_REQUIRED: true }))).toBe(true);
    expect(isRedisRequired(config({ NODE_ENV: 'development', REDIS_REQUIRED: 'true' }))).toBe(true);
  });

  it('allows bounded Redis retries in development fallback mode', () => {
    const strategy = createRedisRetryStrategy(false);

    expect(strategy(1)).toBe(50);
    expect(strategy(3)).toBe(150);
    expect(strategy(4)).toBeNull();
  });

  it('keeps retrying when Redis is required', () => {
    const strategy = createRedisRetryStrategy(true);

    expect(strategy(1)).toBe(50);
    expect(strategy(100)).toBe(2000);
  });
});
