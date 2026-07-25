import { ForbiddenException } from '@nestjs/common';
import { of } from 'rxjs';
import { TenantContextInterceptor } from './tenant-context.interceptor';

describe('TenantContextInterceptor', () => {
  const makeContext = (request: any) =>
    ({
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    }) as any;

  const makeNext = () => ({
    handle: jest.fn(() => of('ok')),
  });

  const makeTenantContext = () => {
    const store = { tenantId: null, userId: null, supabaseAccessToken: null, isSuperAdmin: false };
    return {
      getContext: jest.fn(() => store),
      setContext: jest.fn(),
      run: jest.fn((_ctx: any, fn: () => void) => fn()),
    } as any;
  };

  it('throws when header tenant mismatches token tenant (non-superadmin)', () => {
    const tenantContext = makeTenantContext();
    const interceptor = new TenantContextInterceptor(tenantContext);
    const next = makeNext();

    const request: any = {
      headers: { 'x-tenant-id': 'tenant-b' },
      user: { tenant_id: 'tenant-a', id: 'user-1', is_super_admin: false },
      path: '/api/test',
    };

    expect(() => interceptor.intercept(makeContext(request), next as any)).toThrow(ForbiddenException);
    expect(next.handle).not.toHaveBeenCalled();
  });

  it('allows override when superadmin provides X-Tenant-Id', (done) => {
    const tenantContext = makeTenantContext();
    const interceptor = new TenantContextInterceptor(tenantContext);
    const next = makeNext();

    const request: any = {
      headers: { 'x-tenant-id': 'tenant-b' },
      user: { tenant_id: 'tenant-a', id: 'user-1', is_super_admin: true },
      path: '/api/test',
    };

    interceptor.intercept(makeContext(request), next as any).subscribe({
      next: () => {
        expect(request.tenantId).toBe('tenant-b');
        expect(request.tenant_id).toBe('tenant-b');
        expect(request.is_super_admin).toBe(true);
      },
      error: done,
      complete: done,
    });
  });

  it('accepts desktop x-erp-tenant-id alias for tenant context', (done) => {
    const tenantContext = makeTenantContext();
    const interceptor = new TenantContextInterceptor(tenantContext);
    const next = makeNext();

    const request: any = {
      headers: { 'x-erp-tenant-id': 'tenant-a' },
      user: { tenant_id: 'tenant-a', id: 'user-1', is_super_admin: false },
      path: '/api/test',
    };

    interceptor.intercept(makeContext(request), next as any).subscribe({
      next: () => {
        expect(request.tenantId).toBe('tenant-a');
        expect(request.tenant_id).toBe('tenant-a');
      },
      error: done,
      complete: done,
    });
  });
});
