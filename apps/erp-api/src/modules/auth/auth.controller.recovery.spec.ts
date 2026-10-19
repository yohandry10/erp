import { ServiceUnavailableException } from '@nestjs/common';
import { AuthController } from './auth.controller';

describe('AuthController recuperación y cierre de sesión', () => {
  const authService = {
    isPasswordResetAvailable: jest.fn(),
    generatePasswordResetToken: jest.fn().mockResolvedValue('token'),
    revokeSession: jest.fn(),
    revokeUserSessions: jest.fn(),
  };
  const configService = { get: jest.fn() };
  const controller = new AuthController(authService as any, configService as any);
  const request = { ip: '127.0.0.1', user: { id: 'user-1', session_token: 'session-1' } };
  const response = { clearCookie: jest.fn() };

  beforeEach(() => jest.clearAllMocks());

  it('responde 503 sin generar token cuando el correo no está configurado', async () => {
    authService.isPasswordResetAvailable.mockReturnValue(false);
    await expect(controller.requestPasswordReset({ email: 'a@example.test' }, request))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(authService.generatePasswordResetToken).not.toHaveBeenCalled();
  });

  it('mantiene la respuesta uniforme cuando el correo está configurado', async () => {
    authService.isPasswordResetAvailable.mockReturnValue(true);
    await expect(controller.requestPasswordReset({ email: 'a@example.test' }, request))
      .resolves.toEqual({ message: expect.stringContaining('Si el email existe') });
    expect(authService.generatePasswordResetToken).toHaveBeenCalledWith('a@example.test', '127.0.0.1');
  });

  it('no informa cierre si la revocación falla, pero el navegador olvida la cookie', async () => {
    authService.revokeSession.mockRejectedValue(new ServiceUnavailableException());
    await expect(controller.logout(request, response as any)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(response.clearCookie).toHaveBeenCalledWith('access_token', expect.objectContaining({ path: '/' }));
  });

  it('propaga la falla del cierre global', async () => {
    authService.revokeUserSessions.mockRejectedValue(new ServiceUnavailableException());
    await expect(controller.logoutAll(request)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
