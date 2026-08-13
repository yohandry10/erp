import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerException } from '@nestjs/throttler';
import { AuthRateLimitGuard } from './auth-rate-limit.guard';

class MemoryStorage {
  private readonly hits = new Map<string, number>();

  async increment(key: string, _ttl: number, limit: number) {
    const totalHits = (this.hits.get(key) || 0) + 1;
    this.hits.set(key, totalHits);
    return {
      totalHits,
      timeToExpire: 60,
      isBlocked: totalHits > limit,
      timeToBlockExpire: totalHits > limit ? 60 : 0,
    };
  }
}

const contextFor = (email: string, ip = '10.20.30.40'): ExecutionContext => {
  const headers: Record<string, number> = {};
  const request = {
    ip,
    body: { email },
    headers: { 'user-agent': 'ERP-Office-Terminal' },
    route: { path: '/auth/login' },
    url: '/auth/login',
  };
  const response = { header: (name: string, value: number) => { headers[name] = value; } };
  const handler = () => undefined;
  class AuthControllerForTest {}
  return {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
    getHandler: () => handler,
    getClass: () => AuthControllerForTest,
  } as unknown as ExecutionContext;
};

const createGuard = async () => {
  const guard = new AuthRateLimitGuard(
    [{ name: 'default', limit: 5, ttl: 60_000 }] as any,
    new MemoryStorage() as any,
    new Reflector(),
  );
  await guard.onModuleInit();
  return guard;
};

describe('AuthRateLimitGuard', () => {
  it('permite diez cuentas distintas detrás de la misma IP y User-Agent', async () => {
    const guard = await createGuard();
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        guard.canActivate(contextFor(`office-user-${index}@example.com`)),
      ),
    );
    expect(results).toEqual(Array(10).fill(true));
  });

  it('mantiene el límite estricto de cinco intentos por cuenta e IP', async () => {
    const guard = await createGuard();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(guard.canActivate(contextFor('same-user@example.com'))).resolves.toBe(true);
    }
    await expect(guard.canActivate(contextFor('same-user@example.com')))
      .rejects.toBeInstanceOf(ThrottlerException);
  });

  it('bloquea credential spraying aunque roten las cuentas', async () => {
    const guard = await createGuard();
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await expect(guard.canActivate(contextFor(`spray-${attempt}@example.com`))).resolves.toBe(true);
    }
    await expect(guard.canActivate(contextFor('spray-21@example.com')))
      .rejects.toBeInstanceOf(ThrottlerException);
  });
});
