import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { PermissionGuard } from './permission.guard';
import { Reflector } from '@nestjs/core';
import { PermissionService } from '../../modules/permissions/permission.service';

const mockExecutionContext = (request: any): ExecutionContext => ({
  switchToHttp: () => ({ getRequest: () => request }),
  switchToRpc: () => ({} as any),
  switchToWs: () => ({} as any),
  getClass: jest.fn(),
  getHandler: jest.fn(),
  getArgs: jest.fn(),
  getArgByIndex: jest.fn(),
  getType: jest.fn(),
} as unknown as ExecutionContext);

describe('PermissionGuard', () => {
  const permission = { module: 'ventas', resource: '__global__', action: 'emitir', raw: 'ventas.emitir' } as any;

  it('lanza ForbiddenException cuando el usuario no tiene permiso', async () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(permission) } as unknown as Reflector;
    const permissionService = {
      checkUserPermission: jest.fn().mockResolvedValue(false),
    } as unknown as PermissionService;
    const guard = new PermissionGuard(reflector, permissionService);

    const context = mockExecutionContext({
      user: { id: 'user-1', tenant_id: 'tenant-1' },
      tenantId: 'tenant-1',
    });

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('permite acceso cuando el usuario tiene permiso', async () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(permission) } as unknown as Reflector;
    const permissionService = {
      checkUserPermission: jest.fn().mockResolvedValue(true),
    } as unknown as PermissionService;
    const guard = new PermissionGuard(reflector, permissionService);

    const context = mockExecutionContext({
      user: { id: 'user-1', tenant_id: 'tenant-1' },
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('lanza UnauthorizedException cuando no hay usuario', async () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(permission) } as unknown as Reflector;
    const permissionService = {
      checkUserPermission: jest.fn(),
    } as unknown as PermissionService;
    const guard = new PermissionGuard(reflector, permissionService);

    const context = mockExecutionContext({});

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });
});
