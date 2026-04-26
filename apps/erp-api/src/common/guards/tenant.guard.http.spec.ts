import { Controller, Get, INestApplication, Param, Query, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TenantGuard } from './tenant.guard';

@Controller('tenant-guard-test')
@UseGuards(TenantGuard)
class TenantGuardTestController {
  @Get('param/:tenant_id')
  getParam(@Param('tenant_id') tenantId: string) {
    return { ok: true, tenantId };
  }

  @Get('query')
  getQuery(@Query('tenant_id') tenantId: string) {
    return { ok: true, tenantId };
  }
}

function withTestUserHeaders(headers: Record<string, string>, user: { tenantId?: string; isSuperAdmin?: boolean }) {
  if (user.tenantId) headers['x-test-user-tenant-id'] = user.tenantId;
  if (user.isSuperAdmin !== undefined) headers['x-test-user-superadmin'] = user.isSuperAdmin ? 'true' : 'false';
  return headers;
}

describe('TenantGuard (HTTP integration, no DB)', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TenantGuardTestController],
      providers: [TenantGuard],
    }).compile();

    app = moduleRef.createNestApplication();

    app.use((req: any, _res: any, next: any) => {
      const tenantId = req.headers['x-test-user-tenant-id'];
      const isSuperAdminRaw = req.headers['x-test-user-superadmin'];

      if (tenantId || isSuperAdminRaw !== undefined) {
        req.user = {
          tenant_id: tenantId,
          is_super_admin: isSuperAdminRaw === 'true',
          email: 'test@example.com',
        };
      }
      next();
    });

    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  it('denies non-superadmin when requested tenant_id != user.tenant_id (param)', async () => {
    const headers = withTestUserHeaders({}, { tenantId: 'tenant-a', isSuperAdmin: false });
    const response = await fetch(`${baseUrl}/tenant-guard-test/param/tenant-b`, { headers });
    expect(response.status).toBe(403);
  });

  it('allows superadmin when requested tenant_id != user.tenant_id (param)', async () => {
    const headers = withTestUserHeaders({}, { tenantId: 'tenant-a', isSuperAdmin: true });
    const response = await fetch(`${baseUrl}/tenant-guard-test/param/tenant-b`, { headers });
    expect(response.status).toBe(200);
  });

  it('denies when requested tenant exists but req.user missing (query)', async () => {
    const response = await fetch(`${baseUrl}/tenant-guard-test/query?tenant_id=tenant-a`);
    expect(response.status).toBe(403);
  });

  it('allows when no tenant_id is requested (guard should pass-through)', async () => {
    const headers = withTestUserHeaders({}, { tenantId: 'tenant-a', isSuperAdmin: false });
    const response = await fetch(`${baseUrl}/tenant-guard-test/query`, { headers });
    expect(response.status).toBe(200);
  });
});

