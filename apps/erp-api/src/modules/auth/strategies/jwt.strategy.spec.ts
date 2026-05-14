import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const configService = {
    getOrThrow: jest.fn().mockReturnValue('jwt-secret-for-tests'),
  } as unknown as ConfigService;

  it('rechaza access tokens sin sesión revocable', async () => {
    const authService = {
      validateSession: jest.fn(),
    } as unknown as AuthService;
    const strategy = new JwtStrategy(authService, configService);

    await expect(strategy.validate({
      sub: 'user-123',
      email: 'test@example.com',
      tenant_id: 'tenant-123',
    })).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza access tokens con sesión revocada', async () => {
    const authService = {
      validateSession: jest.fn().mockResolvedValue(false),
    } as unknown as AuthService;
    const strategy = new JwtStrategy(authService, configService);

    await expect(strategy.validate({
      sub: 'user-123',
      email: 'test@example.com',
      tenant_id: 'tenant-123',
      session_token: 'session-123',
    })).rejects.toThrow(UnauthorizedException);
  });

  it('propaga session_token al request user cuando la sesión está activa', async () => {
    const authService = {
      validateSession: jest.fn().mockResolvedValue(true),
    } as unknown as AuthService;
    const strategy = new JwtStrategy(authService, configService);

    const user = await strategy.validate({
      sub: 'user-123',
      email: 'test@example.com',
      username: 'test',
      roles: ['admin'],
      tenant_id: 'tenant-123',
      is_super_admin: true,
      session_token: 'session-123',
    });

    expect(user).toMatchObject({
      id: 'user-123',
      email: 'test@example.com',
      tenant_id: 'tenant-123',
      session_token: 'session-123',
    });
  });
});
