import { ForbiddenException } from '@nestjs/common';
import { TenantGuard } from './tenant.guard';

describe('TenantGuard', () => {
  const makeContext = (request: any) =>
    ({
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    }) as any;

  it('allows when no tenant is requested', () => {
    const guard = new TenantGuard();
    const request: any = { user: { tenant_id: 'tenant-a' }, params: {}, query: {} };
    expect(guard.canActivate(makeContext(request))).toBe(true);
  });

  it('throws when user has no tenant_id', () => {
    const guard = new TenantGuard();
    const request: any = { user: { id: 'u1' }, params: { tenant_id: 'tenant-a' }, query: {} };
    expect(() => guard.canActivate(makeContext(request))).toThrow(ForbiddenException);
  });

  it('throws when requested tenant mismatches token tenant (non-superadmin)', () => {
    const guard = new TenantGuard();
    const request: any = {
      user: { tenant_id: 'tenant-a', is_super_admin: false, email: 'a@a.com' },
      params: { tenant_id: 'tenant-b' },
      query: {},
    };
    expect(() => guard.canActivate(makeContext(request))).toThrow(ForbiddenException);
  });

  it('allows when requested tenant matches token tenant (non-superadmin)', () => {
    const guard = new TenantGuard();
    const request: any = {
      user: { tenant_id: 'tenant-a', is_super_admin: false },
      params: { tenant_id: 'tenant-a' },
      query: {},
    };
    expect(guard.canActivate(makeContext(request))).toBe(true);
  });

  it('allows superadmin even when requested tenant differs', () => {
    const guard = new TenantGuard();
    const request: any = {
      user: { tenant_id: 'tenant-a', is_super_admin: true },
      params: { tenant_id: 'tenant-b' },
      query: {},
    };
    expect(guard.canActivate(makeContext(request))).toBe(true);
  });
});

