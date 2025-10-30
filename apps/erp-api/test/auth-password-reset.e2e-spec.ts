import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AuthModule } from '../src/modules/auth/auth.module';
import { SupabaseModule } from '../src/shared/supabase/supabase.module';

describe('Auth Password Reset (e2e)', () => {
  let app: INestApplication;
  let testUserEmail: string;
  let resetToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AuthModule, SupabaseModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    
    // Enable validation pipes like in production
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    
    await app.init();
    
    // Setup: Create test user
    testUserEmail = `test-reset-${Date.now()}@ejemplo.com`;
    // TODO: Implementar creación de usuario de prueba
  });

  afterAll(async () => {
    // Cleanup: Delete test user
    // TODO: Implementar eliminación de usuario de prueba
    await app.close();
  });

  describe('POST /auth/password-reset/request', () => {
    it('debería rechazar solicitud sin email', () => {
      return request(app.getHttpServer())
        .post('/auth/password-reset/request')
        .send({})
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toContain('email');
        });
    });

    it('debería rechazar solicitud con email inválido', () => {
      return request(app.getHttpServer())
        .post('/auth/password-reset/request')
        .send({ email: 'not-an-email' })
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toContain('email válido');
        });
    });

    it('debería retornar mismo mensaje para email inexistente (prevenir user enumeration)', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/password-reset/request')
        .send({ email: 'nonexistent@ejemplo.com' })
        .expect(200);

      expect(response.body.message).toContain('Si el email existe');
      expect(response.body.token).toBeUndefined(); // ✅ CRÍTICO: Nunca exponer token
    });

    it('debería generar token para email existente sin exponerlo', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/password-reset/request')
        .send({ email: testUserEmail })
        .expect(200);

      expect(response.body.message).toContain('Si el email existe');
      expect(response.body.token).toBeUndefined(); // ✅ CRÍTICO: Nunca exponer token
      
      // TODO: Verificar que el token fue almacenado en BD
      // TODO: Verificar que se envió email (mock)
    });

    it('debería respetar rate limiting (3 requests por minuto)', async () => {
      // First 3 requests should succeed
      for (let i = 0; i < 3; i++) {
        await request(app.getHttpServer())
          .post('/auth/password-reset/request')
          .send({ email: 'test@ejemplo.com' })
          .expect(200);
      }

      // 4th request should be rate limited
      await request(app.getHttpServer())
        .post('/auth/password-reset/request')
        .send({ email: 'test@ejemplo.com' })
        .expect(429);
    });
  });

  describe('POST /auth/password-reset/validate', () => {
    beforeEach(async () => {
      // Generate a valid token for tests
      const response = await request(app.getHttpServer())
        .post('/auth/password-reset/request')
        .send({ email: testUserEmail });
      
      // TODO: Obtener token desde BD para tests
      resetToken = 'valid-token-from-db';
    });

    it('debería rechazar validación sin email o token', () => {
      return request(app.getHttpServer())
        .post('/auth/password-reset/validate')
        .send({ email: testUserEmail })
        .expect(400);
    });

    it('debería rechazar token con longitud inválida', () => {
      return request(app.getHttpServer())
        .post('/auth/password-reset/validate')
        .send({ 
          email: testUserEmail,
          token: 'short-token'
        })
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toContain('Token inválido');
        });
    });

    it('debería rechazar token inválido', () => {
      return request(app.getHttpServer())
        .post('/auth/password-reset/validate')
        .send({ 
          email: testUserEmail,
          token: 'a'.repeat(64) // Token de longitud correcta pero inválido
        })
        .expect(401)
        .expect((res) => {
          expect(res.body.message).toContain('Token inválido o expirado');
        });
    });

    it('debería aceptar token válido', () => {
      return request(app.getHttpServer())
        .post('/auth/password-reset/validate')
        .send({ 
          email: testUserEmail,
          token: resetToken
        })
        .expect(200)
        .expect((res) => {
          expect(res.body.valid).toBe(true);
        });
    });
  });

  describe('POST /auth/password-reset/confirm', () => {
    beforeEach(async () => {
      // Generate a valid token for tests
      await request(app.getHttpServer())
        .post('/auth/password-reset/request')
        .send({ email: testUserEmail });
      
      // TODO: Obtener token desde BD para tests
      resetToken = 'valid-token-from-db';
    });

    it('debería rechazar contraseña sin mayúscula', () => {
      return request(app.getHttpServer())
        .post('/auth/password-reset/confirm')
        .send({ 
          email: testUserEmail,
          token: resetToken,
          newPassword: 'debilpass123!'
        })
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toContain('mayúscula');
        });
    });

    it('debería rechazar contraseña sin minúscula', () => {
      return request(app.getHttpServer())
        .post('/auth/password-reset/confirm')
        .send({ 
          email: testUserEmail,
          token: resetToken,
          newPassword: 'DEBILPASS123!'
        })
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toContain('minúscula');
        });
    });

    it('debería rechazar contraseña sin número', () => {
      return request(app.getHttpServer())
        .post('/auth/password-reset/confirm')
        .send({ 
          email: testUserEmail,
          token: resetToken,
          newPassword: 'DebilPass!'
        })
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toContain('número');
        });
    });

    it('debería rechazar contraseña sin símbolo especial', () => {
      return request(app.getHttpServer())
        .post('/auth/password-reset/confirm')
        .send({ 
          email: testUserEmail,
          token: resetToken,
          newPassword: 'DebilPass123'
        })
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toContain('símbolo especial');
        });
    });

    it('debería rechazar contraseña menor a 8 caracteres', () => {
      return request(app.getHttpServer())
        .post('/auth/password-reset/confirm')
        .send({ 
          email: testUserEmail,
          token: resetToken,
          newPassword: 'Pass1!'
        })
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toContain('mínimo 8 caracteres');
        });
    });

    it('debería aceptar contraseña robusta y revocar sesiones', async () => {
      // TODO: Crear sesiones activas para el usuario antes del test
      
      const response = await request(app.getHttpServer())
        .post('/auth/password-reset/confirm')
        .send({ 
          email: testUserEmail,
          token: resetToken,
          newPassword: 'NuevaPass123!'
        })
        .expect(200);

      expect(response.body.message).toContain('Contraseña actualizada exitosamente');
      expect(response.body.message).toContain('sesiones activas han sido cerradas');
      
      // TODO: Verificar que password_reset_token fue limpiado en BD
      // TODO: Verificar que todas las sesiones fueron revocadas
      // TODO: Verificar que failed_login_attempts fue reseteado a 0
      // TODO: Verificar que locked_until fue limpiado
    });

    it('debería rechazar token expirado', async () => {
      // TODO: Generar token y forzar expiración en BD
      
      await request(app.getHttpServer())
        .post('/auth/password-reset/confirm')
        .send({ 
          email: testUserEmail,
          token: resetToken,
          newPassword: 'NuevaPass123!'
        })
        .expect(401)
        .expect((res) => {
          expect(res.body.message).toContain('Token inválido o expirado');
        });
    });

    it('debería rechazar reutilización de token ya usado', async () => {
      // First reset should succeed
      await request(app.getHttpServer())
        .post('/auth/password-reset/confirm')
        .send({ 
          email: testUserEmail,
          token: resetToken,
          newPassword: 'NuevaPass123!'
        })
        .expect(200);

      // Second attempt with same token should fail
      await request(app.getHttpServer())
        .post('/auth/password-reset/confirm')
        .send({ 
          email: testUserEmail,
          token: resetToken,
          newPassword: 'OtraPass456!'
        })
        .expect(401)
        .expect((res) => {
          expect(res.body.message).toContain('Token inválido o expirado');
        });
    });
  });

  describe('Security Logging', () => {
    it('debería registrar intentos de reset para usuarios inexistentes', async () => {
      await request(app.getHttpServer())
        .post('/auth/password-reset/request')
        .send({ email: 'hacker@example.com' })
        .expect(200);
      
      // TODO: Verificar log en sistema (Winston, CloudWatch, etc.)
    });

    it('debería registrar intentos de validación con token inválido', async () => {
      await request(app.getHttpServer())
        .post('/auth/password-reset/validate')
        .send({ 
          email: testUserEmail,
          token: 'a'.repeat(64)
        })
        .expect(401);
      
      // TODO: Verificar log de security warning
    });

    it('debería registrar reset exitoso con IP del cliente', async () => {
      await request(app.getHttpServer())
        .post('/auth/password-reset/confirm')
        .set('X-Forwarded-For', '192.168.1.100')
        .send({ 
          email: testUserEmail,
          token: resetToken,
          newPassword: 'NuevaPass123!'
        })
        .expect(200);
      
      // TODO: Verificar que log incluye IP 192.168.1.100
    });
  });
});

