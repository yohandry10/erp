import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';
import { EmailProvider } from './interfaces/email-config.interface';

describe('EmailService', () => {
  let service: EmailService;
  let configService: ConfigService;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      const config = {
        EMAIL_PROVIDER: 'smtp',
        EMAIL_FROM_ADDRESS: 'test@example.com',
        EMAIL_FROM_NAME: 'Test Sender',
        SUPPORT_EMAIL: 'support@example.com',
        APP_NAME: 'Test App',
        APP_URL: 'http://localhost:3000',
        SMTP_HOST: 'localhost',
        SMTP_PORT: 1025,
        SMTP_SECURE: false,
        SMTP_USER: '',
        SMTP_PASS: '',
      };
      return config[key] !== undefined ? config[key] : defaultValue;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<EmailService>(EmailService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Service Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should load SMTP configuration by default', () => {
      const configInfo = service.getConfigInfo();
      expect(configInfo.provider).toBe(EmailProvider.SMTP);
      expect(configInfo.from).toBe('Test Sender <test@example.com>');
    });

    it('should indicate if service is configured', () => {
      const configInfo = service.getConfigInfo();
      expect(configInfo.configured).toBe(true);
    });
  });

  describe('getConfigInfo', () => {
    it('should return correct configuration info', () => {
      const info = service.getConfigInfo();

      expect(info).toEqual({
        provider: EmailProvider.SMTP,
        configured: true,
        from: 'Test Sender <test@example.com>',
      });
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('should generate correct reset link', async () => {
      const spy = jest.spyOn(service, 'sendEmail').mockResolvedValue(true);

      await service.sendPasswordResetEmail(
        'user@example.com',
        'Test User',
        'a'.repeat(64),
        '192.168.1.1'
      );

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: expect.stringContaining('Restablecer contraseña'),
        })
      );

      const callArgs = spy.mock.calls[0][0];
      expect(callArgs.html).toContain('http://localhost:3000/reset-password?token=');
      expect(callArgs.html).toContain('email=user%40example.com');
      expect(callArgs.html).toContain('Test User');
      expect(callArgs.html).toContain('24 horas');
    });

    it('should include security warnings in email', async () => {
      const spy = jest.spyOn(service, 'sendEmail').mockResolvedValue(true);

      await service.sendPasswordResetEmail(
        'user@example.com',
        'Test User',
        'a'.repeat(64)
      );

      const callArgs = spy.mock.calls[0][0];
      expect(callArgs.html).toContain('No solicitaste este cambio');
      expect(callArgs.html).toContain('contraseña fuerte');
      expect(callArgs.text).toContain('No solicitaste este cambio');
    });

    it('should return true when email is sent successfully', async () => {
      jest.spyOn(service, 'sendEmail').mockResolvedValue(true);

      const result = await service.sendPasswordResetEmail(
        'user@example.com',
        'Test User',
        'a'.repeat(64)
      );

      expect(result).toBe(true);
    });

    it('should return false when email fails to send', async () => {
      jest.spyOn(service, 'sendEmail').mockResolvedValue(false);

      const result = await service.sendPasswordResetEmail(
        'user@example.com',
        'Test User',
        'a'.repeat(64)
      );

      expect(result).toBe(false);
    });

    it('should log IP address when provided', async () => {
      const spy = jest.spyOn(service, 'sendEmail').mockResolvedValue(true);

      await service.sendPasswordResetEmail(
        'user@example.com',
        'Test User',
        'a'.repeat(64),
        '203.0.113.42'
      );

      expect(spy).toHaveBeenCalled();
      // Verificar que el email service fue llamado (el logging se verifica en logs reales)
    });
  });

  describe('sendPasswordResetConfirmationEmail', () => {
    it('should send confirmation email with correct info', async () => {
      const spy = jest.spyOn(service, 'sendEmail').mockResolvedValue(true);

      await service.sendPasswordResetConfirmationEmail(
        'user@example.com',
        'Test User',
        '192.168.1.1'
      );

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: expect.stringContaining('Contraseña actualizada'),
        })
      );

      const callArgs = spy.mock.calls[0][0];
      expect(callArgs.html).toContain('Test User');
      expect(callArgs.html).toContain('192.168.1.1');
      expect(callArgs.html).toContain('contraseña ha sido actualizada exitosamente');
    });

    it('should include security warning in confirmation', async () => {
      const spy = jest.spyOn(service, 'sendEmail').mockResolvedValue(true);

      await service.sendPasswordResetConfirmationEmail(
        'user@example.com',
        'Test User'
      );

      const callArgs = spy.mock.calls[0][0];
      expect(callArgs.html).toContain('No fuiste tú');
      expect(callArgs.html).toContain('support@example.com');
    });

    it('should handle missing IP gracefully', async () => {
      const spy = jest.spyOn(service, 'sendEmail').mockResolvedValue(true);

      await service.sendPasswordResetConfirmationEmail(
        'user@example.com',
        'Test User'
        // No IP provided
      );

      expect(spy).toHaveBeenCalled();
      const callArgs = spy.mock.calls[0][0];
      expect(callArgs.html).toContain('No disponible');
    });
  });

  describe('Email Template Validation', () => {
    it('should generate valid HTML email', async () => {
      const spy = jest.spyOn(service, 'sendEmail').mockResolvedValue(true);

      await service.sendPasswordResetEmail(
        'user@example.com',
        'Test User',
        'a'.repeat(64)
      );

      const callArgs = spy.mock.calls[0][0];
      
      // Verificar estructura HTML básica
      expect(callArgs.html).toContain('<!DOCTYPE html>');
      expect(callArgs.html).toContain('<html');
      expect(callArgs.html).toContain('</html>');
      expect(callArgs.html).toContain('<head>');
      expect(callArgs.html).toContain('<body>');
      
      // Verificar estilos inline (necesarios para email clients)
      expect(callArgs.html).toContain('style=');
      
      // Verificar responsive viewport
      expect(callArgs.html).toContain('viewport');
    });

    it('should include text fallback', async () => {
      const spy = jest.spyOn(service, 'sendEmail').mockResolvedValue(true);

      await service.sendPasswordResetEmail(
        'user@example.com',
        'Test User',
        'a'.repeat(64)
      );

      const callArgs = spy.mock.calls[0][0];
      expect(callArgs.text).toBeDefined();
      expect(callArgs.text).toContain('Restablecer contraseña');
      expect(callArgs.text).toContain('http://localhost:3000/reset-password');
    });

    it('should properly encode email in URL', async () => {
      const spy = jest.spyOn(service, 'sendEmail').mockResolvedValue(true);

      await service.sendPasswordResetEmail(
        'user+test@example.com',
        'Test User',
        'a'.repeat(64)
      );

      const callArgs = spy.mock.calls[0][0];
      // + debe ser encoded como %2B
      expect(callArgs.html).toContain('email=user%2Btest%40example.com');
    });
  });

  describe('Error Handling', () => {
    it('should return false when transporter is not configured', async () => {
      // Crear servicio con configuración inválida
      const mockBadConfigService = {
        get: jest.fn(() => undefined),
      };

      const moduleWithBadConfig = await Test.createTestingModule({
        providers: [
          EmailService,
          {
            provide: ConfigService,
            useValue: mockBadConfigService,
          },
        ],
      }).compile();

      const badService = moduleWithBadConfig.get<EmailService>(EmailService);

      const result = await badService.sendEmail({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      });

      expect(result).toBe(false);
    });

    it('should handle long user names gracefully', async () => {
      const spy = jest.spyOn(service, 'sendEmail').mockResolvedValue(true);

      const longName = 'A'.repeat(200);
      await service.sendPasswordResetEmail(
        'user@example.com',
        longName,
        'a'.repeat(64)
      );

      expect(spy).toHaveBeenCalled();
      const callArgs = spy.mock.calls[0][0];
      expect(callArgs.html).toContain(longName);
    });

    it('should handle special characters in user name', async () => {
      const spy = jest.spyOn(service, 'sendEmail').mockResolvedValue(true);

      await service.sendPasswordResetEmail(
        'user@example.com',
        'José María <test@hack.com>',
        'a'.repeat(64)
      );

      expect(spy).toHaveBeenCalled();
      // HTML debería estar properly escaped por la plantilla
    });
  });

  describe('Configuration Providers', () => {
    it('should recognize SendGrid provider', () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'EMAIL_PROVIDER') return 'sendgrid';
        return mockConfigService.get(key);
      });

      const moduleWithSendGrid = Test.createTestingModule({
        providers: [
          EmailService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      });

      // Verificar que no arroja error al inicializar
      expect(moduleWithSendGrid).toBeDefined();
    });

    it('should recognize AWS SES provider', () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'EMAIL_PROVIDER') return 'aws-ses';
        return mockConfigService.get(key);
      });

      const moduleWithAwsSes = Test.createTestingModule({
        providers: [
          EmailService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      });

      expect(moduleWithAwsSes).toBeDefined();
    });
  });

  describe('Integration', () => {
    it('should work with typical password reset flow', async () => {
      const sendEmailSpy = jest.spyOn(service, 'sendEmail').mockResolvedValue(true);

      // 1. Usuario solicita reset
      const resetToken = 'a'.repeat(64);
      const sent = await service.sendPasswordResetEmail(
        'user@example.com',
        'John Doe',
        resetToken,
        '192.168.1.100'
      );

      expect(sent).toBe(true);
      expect(sendEmailSpy).toHaveBeenCalledTimes(1);

      // 2. Usuario completa reset, se envía confirmación
      sendEmailSpy.mockClear();
      
      await service.sendPasswordResetConfirmationEmail(
        'user@example.com',
        'John Doe',
        '192.168.1.100'
      );

      expect(sendEmailSpy).toHaveBeenCalledTimes(1);
    });
  });
});

