import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AuthController } from '../src/modules/auth/auth.controller';
import { AuthService } from '../src/modules/auth/auth.service';
import { AuthRateLimitGuard } from '../src/shared/security/guards/auth-rate-limit.guard';

describe('Auth Password Reset (e2e)', () => {
  let app: INestApplication;

  const validToken = 'a'.repeat(64);
  const testUserEmail = 'test-reset@ejemplo.com';

  const authServiceMock = {
    generatePasswordResetToken: jest.fn(),
    validatePasswordResetToken: jest.fn(),
    resetPassword: jest.fn(),
    login: jest.fn(),
    refreshToken: jest.fn(),
    switchTenant: jest.fn(),
    revokeSession: jest.fn(),
    revokeUserSessions: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    authServiceMock.generatePasswordResetToken.mockResolvedValue(undefined);
    authServiceMock.validatePasswordResetToken.mockImplementation(
      async (_email: string, token: string) => token === validToken,
    );
    authServiceMock.resetPassword.mockImplementation(async (_email: string, token: string) => {
      if (token !== validToken) {
        throw new UnauthorizedException('Token inválido o expirado');
      }
    });

    const moduleBuilder = Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authServiceMock },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'NODE_ENV') return 'test';
              if (key === 'AUTH_COOKIE_SAME_SITE') return 'lax';
              return undefined;
            }),
          },
        },
      ],
    }).overrideGuard(AuthRateLimitGuard).useValue({ canActivate: () => true });

    const moduleFixture: TestingModule = await moduleBuilder.compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('POST /auth/password-reset/request', () => {
    it('rechaza solicitud sin email', async () => {
      await request(app.getHttpServer()).post('/auth/password-reset/request').send({}).expect(400);
    });

    it('rechaza solicitud con email invalido', async () => {
      await request(app.getHttpServer())
        .post('/auth/password-reset/request')
        .send({ email: 'not-an-email' })
        .expect(400);
    });

    it('retorna mensaje generico sin exponer token', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/password-reset/request')
        .send({ email: 'nonexistent@ejemplo.com' })
        .expect(200);

      expect(response.body.message).toContain('Si el email existe');
      expect(response.body.token).toBeUndefined();
      expect(authServiceMock.generatePasswordResetToken).toHaveBeenCalledWith(
        'nonexistent@ejemplo.com',
        expect.any(String),
      );
    });
  });

  describe('POST /auth/password-reset/validate', () => {
    it('rechaza validacion sin email o token', async () => {
      await request(app.getHttpServer())
        .post('/auth/password-reset/validate')
        .send({ email: testUserEmail })
        .expect(400);
    });

    it('rechaza token con longitud invalida', async () => {
      await request(app.getHttpServer())
        .post('/auth/password-reset/validate')
        .send({ email: testUserEmail, token: 'short-token' })
        .expect(400);
    });

    it('rechaza token invalido', async () => {
      await request(app.getHttpServer())
        .post('/auth/password-reset/validate')
        .send({ email: testUserEmail, token: 'b'.repeat(64) })
        .expect(401);
    });

    it('acepta token valido', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/password-reset/validate')
        .send({ email: testUserEmail, token: validToken })
        .expect(200);

      expect(response.body.valid).toBe(true);
    });
  });

  describe('POST /auth/password-reset/confirm', () => {
    it('rechaza contraseña debil', async () => {
      await request(app.getHttpServer())
        .post('/auth/password-reset/confirm')
        .send({ email: testUserEmail, token: validToken, newPassword: 'debilpass123!' })
        .expect(400);
    });

    it('acepta contraseña robusta y no expone datos sensibles', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/password-reset/confirm')
        .send({ email: testUserEmail, token: validToken, newPassword: 'NuevaPass123!' })
        .expect(200);

      expect(response.body.message).toContain('Contraseña actualizada exitosamente');
      expect(response.body.token).toBeUndefined();
      expect(authServiceMock.resetPassword).toHaveBeenCalledWith(
        testUserEmail,
        validToken,
        'NuevaPass123!',
        expect.any(String),
      );
    });

    it('rechaza token invalido', async () => {
      await request(app.getHttpServer())
        .post('/auth/password-reset/confirm')
        .send({ email: testUserEmail, token: 'b'.repeat(64), newPassword: 'NuevaPass123!' })
        .expect(401);
    });
  });
});
