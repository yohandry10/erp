import { UnauthorizedException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';

type TestRequest = {
  path: string;
  headers: Record<string, string>;
  user?: { tenant_id?: string; email?: string };
  tenantId?: string;
  tenant_id?: string;
};

const mockExecutionContext = (request: any): ExecutionContext => {
  const handler = jest.fn();
  const clazz = class TestController {};

  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => handler,
    getClass: () => clazz,
    switchToRpc: () => ({} as any),
    switchToWs: () => ({} as any),
    getArgs: () => [],
    getArgByIndex: () => undefined as any,
    getType: () => 'http' as const,
  } as unknown as ExecutionContext;
};

describe('JwtAuthGuard', () => {
  const createReflector = (metadataValue: boolean | undefined) =>
    ({ getAllAndOverride: jest.fn().mockReturnValue(metadataValue) } as unknown as Reflector);

  const getJwtCanActivateSpy = (guard: JwtAuthGuard) => {
    const basePrototype = Object.getPrototypeOf(Object.getPrototypeOf(guard));
    return jest.spyOn(basePrototype as any, 'canActivate');
  };

  it('permite rutas públicas sin validar JWT', async () => {
    const reflector = createReflector(true);
    const guard = new JwtAuthGuard(undefined, reflector);
    const baseSpy = getJwtCanActivateSpy(guard).mockResolvedValue(false);
    const request = { path: '/auth/login', headers: {} };

    const context = mockExecutionContext(request);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(baseSpy).not.toHaveBeenCalled();
  });

  it('rechaza acceso privado sin token válido', async () => {
    const reflector = createReflector(false);
    const guard = new JwtAuthGuard(undefined, reflector);
    const baseSpy = getJwtCanActivateSpy(guard).mockRejectedValue(
      new UnauthorizedException('Token inválido o expirado'),
    );
    const request = { path: '/api/usuarios', headers: {} };

    const context = mockExecutionContext(request);

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    expect(baseSpy).toHaveBeenCalledTimes(1);
  });

  it('establece tenantId y tenant_id en request cuando el token es válido', async () => {
    const reflector = createReflector(false);
    const guard = new JwtAuthGuard(undefined, reflector);
    const request: TestRequest = {
      path: '/api/usuarios',
      headers: { authorization: 'Bearer token' },
      user: {
        tenant_id: 'tenant-123',
        email: 'usuario@prueba.com',
      },
    };

    const context = mockExecutionContext(request);
    getJwtCanActivateSpy(guard).mockResolvedValue(true);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.tenantId).toBe('tenant-123');
    expect(request.tenant_id).toBe('tenant-123');
  });

  it('rechaza token válido sin tenant_id en el payload', async () => {
    const reflector = createReflector(false);
    const guard = new JwtAuthGuard(undefined, reflector);
    const request = {
      path: '/api/usuarios',
      headers: { authorization: 'Bearer token' },
      user: { email: 'usuario@prueba.com', tenant_id: '' },
    };

    const context = mockExecutionContext(request);
    getJwtCanActivateSpy(guard).mockResolvedValue(true);

    await expect(guard.canActivate(context)).rejects.toThrow('Token inválido: falta tenant_id');
  });
}); 
