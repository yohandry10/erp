import { ForbiddenException } from '@nestjs/common';
import { of } from 'rxjs';
import { TenantBodyInterceptor } from './tenant-body.interceptor';

describe('TenantBodyInterceptor', () => {
  const makeContext = (request: any) =>
    ({
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    }) as any;

  const makeNext = () => ({
    handle: jest.fn(() => of('ok')),
  });

  it('throws when body tenant_id mismatches token tenant (non-superadmin)', () => {
    const interceptor = new TenantBodyInterceptor();
    const next = makeNext();

    const request: any = {
      user: { tenant_id: 'tenant-a', is_super_admin: false },
      body: { tenant_id: 'tenant-b' },
    };

    expect(() => interceptor.intercept(makeContext(request), next as any)).toThrow(ForbiddenException);
    expect(next.handle).not.toHaveBeenCalled();
  });

  it('passes when body has no tenant field', (done) => {
    const interceptor = new TenantBodyInterceptor();
    const next = makeNext();

    const request: any = {
      user: { tenant_id: 'tenant-a', is_super_admin: false },
      body: { foo: 'bar' },
    };

    interceptor.intercept(makeContext(request), next as any).subscribe({
      next: () => expect(next.handle).toHaveBeenCalled(),
      error: done,
      complete: done,
    });
  });

  it('throws when query tenant_id mismatches token tenant (non-superadmin)', () => {
    const interceptor = new TenantBodyInterceptor();
    const next = makeNext();

    const request: any = {
      user: { tenant_id: 'tenant-a', is_super_admin: false },
      query: { tenant_id: 'tenant-b' },
      body: { foo: 'bar' },
    };

    expect(() => interceptor.intercept(makeContext(request), next as any)).toThrow(ForbiddenException);
    expect(next.handle).not.toHaveBeenCalled();
  });

  it('throws when params tenant_id mismatches token tenant (non-superadmin)', () => {
    const interceptor = new TenantBodyInterceptor();
    const next = makeNext();

    const request: any = {
      user: { tenant_id: 'tenant-a', is_super_admin: false },
      params: { tenant_id: 'tenant-b' },
      body: { foo: 'bar' },
    };

    expect(() => interceptor.intercept(makeContext(request), next as any)).toThrow(ForbiddenException);
    expect(next.handle).not.toHaveBeenCalled();
  });

  it('allows superadmin even if tenant_id is provided in body/query/params', (done) => {
    const interceptor = new TenantBodyInterceptor();
    const next = makeNext();

    const request: any = {
      user: { tenant_id: 'tenant-a', is_super_admin: true },
      query: { tenant_id: 'tenant-b' },
      params: { tenant_id: 'tenant-b' },
      body: { tenant_id: 'tenant-b' },
    };

    interceptor.intercept(makeContext(request), next as any).subscribe({
      next: () => expect(next.handle).toHaveBeenCalled(),
      error: done,
      complete: done,
    });
  });
});
