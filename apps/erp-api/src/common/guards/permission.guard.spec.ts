import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { PermissionGuard } from './permission.guard';
import { Reflector } from '@nestjs/core';
import { PermissionService } from '../../modules/permissions/permission.service';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';
import { PUBLIC_METADATA_KEY } from '../decorators/public.decorator';

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
  const configService = {
    get: jest.fn().mockReturnValue('EnvTestSecret!A1b2C3d4'),
  } as unknown as ConfigService;
  const jwtService = {
    verify: jest.fn(),
  } as unknown as JwtService;
  const tenantContext = {
    getContext: jest.fn().mockReturnValue(undefined),
    setContext: jest.fn(),
    run: jest.fn((_, callback) => callback()),
  };

  const createGuard = (permissionService: PermissionService, reflector: Reflector) =>
    new PermissionGuard(reflector, permissionService, jwtService, configService, tenantContext as any);

  const createMetadataAwareReflector = (required: boolean) =>
    ({
      getAllAndOverride: jest.fn().mockImplementation((key) => {
        return key === PERMISSION_KEY ? (required ? permission : undefined) : undefined;
      }),
    } as unknown as Reflector);

  const createPublicMetadataReflector = (isPublic: boolean, requiredPermission = false) =>
    ({
      getAllAndOverride: jest.fn().mockImplementation((key) => {
        if (key === PUBLIC_METADATA_KEY) return isPublic;
        if (key === PERMISSION_KEY) return requiredPermission ? permission : undefined;
        return undefined;
      }),
    } as unknown as Reflector);

  it('lanza ForbiddenException cuando el usuario no tiene permiso', async () => {
    const reflector = createMetadataAwareReflector(true);
    const permissionService = {
      checkUserPermission: jest.fn().mockResolvedValue(false),
    } as unknown as PermissionService;
    const guard = createGuard(permissionService, reflector);

    const context = mockExecutionContext({
      user: { id: 'user-1', tenant_id: 'tenant-1' },
      tenantId: 'tenant-1',
    });

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('permite acceso cuando el usuario tiene permiso', async () => {
    const reflector = createMetadataAwareReflector(true);
    const permissionService = {
      checkUserPermission: jest.fn().mockResolvedValue(true),
    } as unknown as PermissionService;
    const guard = createGuard(permissionService, reflector);

    const context = mockExecutionContext({
      user: { id: 'user-1', tenant_id: 'tenant-1' },
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('no concede permisos por el nombre del rol ADMIN', async () => {
    const reflector = createMetadataAwareReflector(true);
    const checkUserPermission = jest.fn().mockResolvedValue(false);
    const permissionService = {
      checkUserPermission,
    } as unknown as PermissionService;
    const guard = createGuard(permissionService, reflector);

    const context = mockExecutionContext({
      user: {
        id: 'user-admin',
        tenant_id: 'tenant-1',
        roles: ['ADMIN'],
        is_super_admin: false,
      },
    });

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    expect(checkUserPermission).toHaveBeenCalledWith(
      'user-admin',
      'tenant-1',
      'ventas',
      'emitir',
      '__global__',
    );
  });

  it('permite a un ADMIN solo cuando rol_permisos concede el permiso', async () => {
    const reflector = createMetadataAwareReflector(true);
    const checkUserPermission = jest.fn().mockResolvedValue(true);
    const permissionService = {
      checkUserPermission,
    } as unknown as PermissionService;
    const guard = createGuard(permissionService, reflector);

    const context = mockExecutionContext({
      user: {
        id: 'user-admin',
        tenant_id: 'tenant-1',
        roles: ['ADMIN'],
        is_super_admin: false,
      },
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(checkUserPermission).toHaveBeenCalledWith(
      'user-admin',
      'tenant-1',
      'ventas',
      'emitir',
      '__global__',
    );
  });

  it('mantiene el bypass exclusivo de SUPER_ADMIN', async () => {
    const reflector = createMetadataAwareReflector(true);
    const checkUserPermission = jest.fn();
    const permissionService = {
      checkUserPermission,
    } as unknown as PermissionService;
    const guard = createGuard(permissionService, reflector);

    const context = mockExecutionContext({
      user: {
        id: 'super-admin',
        is_super_admin: true,
      },
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(checkUserPermission).not.toHaveBeenCalled();
  });

  it('lanza UnauthorizedException cuando no hay usuario', async () => {
    const reflector = createMetadataAwareReflector(true);
    const permissionService = {
      checkUserPermission: jest.fn(),
    } as unknown as PermissionService;
    const guard = createGuard(permissionService, reflector);

    const context = mockExecutionContext({});

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('permite acceso a rutas públicas aunque no exista usuario ni token', async () => {
    const reflector = createPublicMetadataReflector(true);
    const permissionService = {
      checkUserPermission: jest.fn(),
    } as unknown as PermissionService;
    const guard = createGuard(permissionService, reflector);

    const context = mockExecutionContext({});

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});
