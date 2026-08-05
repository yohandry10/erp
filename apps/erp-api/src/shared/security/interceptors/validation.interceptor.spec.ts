import { BadRequestException, CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { ValidationInterceptor } from './validation.interceptor';

describe('ValidationInterceptor forwarded host', () => {
  const next: CallHandler = { handle: () => of({ ok: true }) };

  const context = (headers: Record<string, string>): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ headers, query: {} }),
      }),
    }) as any;

  const interceptor = new ValidationInterceptor({
    get: (key: string) =>
      key === 'ALLOWED_ORIGINS'
        ? 'https://erp-web-zeta-neon.vercel.app,http://localhost:3001'
        : undefined,
  } as any);

  it('acepta el host del frontend configurado detrás del proxy', () => {
    expect(() =>
      interceptor.intercept(
        context({ 'x-forwarded-host': 'erp-web-zeta-neon.vercel.app' }),
        next,
      ),
    ).not.toThrow();
  });

  it('rechaza un forwarded host que no está en el allowlist', () => {
    expect(() =>
      interceptor.intercept(context({ 'x-forwarded-host': 'evil.example' }), next),
    ).toThrow(BadRequestException);
  });

  it('mantiene bloqueados los headers de reescritura manipulables', () => {
    expect(() =>
      interceptor.intercept(context({ 'x-original-url': '/admin' }), next),
    ).toThrow(BadRequestException);
  });
});
