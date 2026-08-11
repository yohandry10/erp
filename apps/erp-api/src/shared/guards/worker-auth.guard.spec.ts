import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { WorkerAuthGuard } from './worker-auth.guard';

const mockExecutionContext = (request: any): ExecutionContext => ({
  switchToHttp: () => ({
    getRequest: () => request,
  }),
  getHandler: () => jest.fn(),
  getClass: () => class TestController {},
} as unknown as ExecutionContext);

describe('WorkerAuthGuard', () => {
  const configService = {
    get: jest.fn((key: string) => key === 'POS_WORKER_JWT_SECRET' ? 'worker-secret-with-enough-length' : undefined),
  } as unknown as ConfigService;
  const workerSecret = 'worker-secret-with-enough-length';

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rechaza query/header tenant conflictivos antes de confiar en el token', () => {
    const guard = new WorkerAuthGuard(configService);
    const request = {
      headers: {
        authorization: 'Bearer token',
        'x-tenant-id': 'tenant-a',
      },
      query: { tenant_id: 'tenant-b' },
    };

    expect(() => guard.canActivate(mockExecutionContext(request))).toThrow(UnauthorizedException);
  });

  it('rechaza tokens worker sin scope pos.worker', () => {
    const token = jwt.sign({
      iss: 'pos.worker',
      scope: 'other.scope',
      tenant_id: 'tenant-a',
    }, workerSecret);
    const guard = new WorkerAuthGuard(configService);
    const request = {
      headers: {
        authorization: `Bearer ${token}`,
        'x-tenant-id': 'tenant-a',
      },
      query: {},
    };

    expect(() => guard.canActivate(mockExecutionContext(request))).toThrow(UnauthorizedException);
  });

  it('canonicaliza tenant validado en request.tenantId', () => {
    const token = jwt.sign({
      iss: 'pos.worker',
      scope: 'pos.worker',
      tenant_ids: ['tenant-a', 'tenant-b'],
      actor_id: '11111111-1111-4111-8111-111111111111',
    }, workerSecret);
    const guard = new WorkerAuthGuard(configService);
    const request: any = {
      headers: {
        authorization: `Bearer ${token}`,
        'x-tenant-id': 'tenant-b',
      },
      query: {},
    };

    expect(guard.canActivate(mockExecutionContext(request))).toBe(true);
    expect(request.tenantId).toBe('tenant-b');
    expect(request.user).toMatchObject({
      id: '11111111-1111-4111-8111-111111111111',
      tenant_id: 'tenant-b',
      is_worker: true,
    });
  });
});
