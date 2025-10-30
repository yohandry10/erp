import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { 
  EmailConfig, 
  EmailProvider, 
  SendEmailOptions 
} from './interfaces/email-config.interface';
import { 
  generatePasswordResetEmail, 
  PasswordResetTemplateData 
} from './templates/password-reset.template';
import {
  generateUserActivationEmail,
  UserActivationTemplateData
} from './templates/user-activation.template';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly config: EmailConfig;
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly configService: ConfigService) {
    this.config = this.loadConfig();
    this.initializeTransporter();
  }

  /**
   * Carga configuración desde environment variables
   */
  private loadConfig(): EmailConfig {
    const provider = this.configService.get<string>('EMAIL_PROVIDER', 'smtp') as EmailProvider;
    
    const config: EmailConfig = {
      provider,
      from: {
        email: this.configService.get<string>('EMAIL_FROM_ADDRESS', 'noreply@erp.com'),
        name: this.configService.get<string>('EMAIL_FROM_NAME', 'ERP System'),
      },
    };

    // Configuración específica por proveedor
    switch (provider) {
      case EmailProvider.SENDGRID:
        config.sendgrid = {
          apiKey: this.configService.get<string>('SENDGRID_API_KEY', ''),
        };
        break;

      case EmailProvider.AWS_SES:
        config.awsSes = {
          region: this.configService.get<string>('AWS_SES_REGION', 'us-east-1'),
          accessKeyId: this.configService.get<string>('AWS_ACCESS_KEY_ID', ''),
          secretAccessKey: this.configService.get<string>('AWS_SECRET_ACCESS_KEY', ''),
        };
        break;

      case EmailProvider.SMTP:
      default:
        config.smtp = {
          host: this.configService.get<string>('SMTP_HOST', 'localhost'),
          port: this.configService.get<number>('SMTP_PORT', 587),
          secure: this.configService.get<boolean>('SMTP_SECURE', false),
          auth: {
            user: this.configService.get<string>('SMTP_USER', ''),
            pass: this.configService.get<string>('SMTP_PASS', ''),
          },
        };
        break;
    }

    return config;
  }

  /**
   * Inicializa el transportador de email según el proveedor configurado
   */
  private async initializeTransporter(): Promise<void> {
    try {
      switch (this.config.provider) {
        case EmailProvider.SENDGRID:
          await this.initializeSendGrid();
          break;

        case EmailProvider.AWS_SES:
          await this.initializeAwsSes();
          break;

        case EmailProvider.SMTP:
        default:
          await this.initializeSmtp();
          break;
      }

      this.logger.log(`Email service initialized with provider: ${this.config.provider}`);
    } catch (error) {
      this.logger.error(`Failed to initialize email service: ${error.message}`, error.stack);
      // No throw - permitir que la app arranque sin email configurado
    }
  }

  /**
   * Inicializa SendGrid
   */
  private async initializeSendGrid(): Promise<void> {
    if (!this.config.sendgrid?.apiKey) {
      throw new Error('SendGrid API key not configured');
    }

    // Nodemailer con SendGrid transport
    this.transporter = nodemailer.createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      secure: false,
      auth: {
        user: 'apikey',
        pass: this.config.sendgrid.apiKey,
      },
    });
  }

  /**
   * Inicializa AWS SES
   */
  private async initializeAwsSes(): Promise<void> {
    if (!this.config.awsSes?.accessKeyId || !this.config.awsSes?.secretAccessKey) {
      throw new Error('AWS SES credentials not configured');
    }

    // Nodemailer con AWS SES transport
    // Requiere: npm install @aws-sdk/client-ses
    this.transporter = nodemailer.createTransport({
      host: `email-smtp.${this.config.awsSes.region}.amazonaws.com`,
      port: 587,
      secure: false,
      auth: {
        user: this.config.awsSes.accessKeyId,
        pass: this.config.awsSes.secretAccessKey,
      },
    });
  }

  /**
   * Inicializa SMTP genérico
   */
  private async initializeSmtp(): Promise<void> {
    if (!this.config.smtp?.host) {
      throw new Error('SMTP host not configured');
    }

    this.transporter = nodemailer.createTransport({
      host: this.config.smtp.host,
      port: this.config.smtp.port,
      secure: this.config.smtp.secure,
      auth: this.config.smtp.auth.user ? {
        user: this.config.smtp.auth.user,
        pass: this.config.smtp.auth.pass,
      } : undefined,
    });
  }

  /**
   * Envía un email genérico
   */
  async sendEmail(options: SendEmailOptions): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn('Email service not configured. Email not sent.');
      return false;
    }

    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.transporter.sendMail({
          from: `"${this.config.from.name}" <${this.config.from.email}>`,
          to: options.to,
          subject: options.subject,
          html: options.html,
          text: options.text,
          attachments: options.attachments,
        });

        this.logger.log(
          `Email sent successfully to ${options.to} (messageId: ${result.messageId}, attempt: ${attempt})`
        );

        return true;
      } catch (error) {
        lastError = error;
        this.logger.warn(
          `Failed to send email to ${options.to} (attempt ${attempt}/${maxRetries}): ${error.message}`
        );

        if (attempt < maxRetries) {
          // Esperar antes de reintentar (exponential backoff)
          const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // Todos los intentos fallaron
    this.logger.error(
      `Failed to send email to ${options.to} after ${maxRetries} attempts: ${lastError?.message}`,
      lastError?.stack
    );

    return false;
  }

  /**
   * Envía email de reset de contraseña
   */
  async sendPasswordResetEmail(
    recipientEmail: string,
    recipientName: string,
    resetToken: string,
    clientIp?: string
  ): Promise<boolean> {
    const appUrl = this.configService.get<string>('APP_URL', 'http://localhost:3000');
    const supportEmail = this.configService.get<string>('SUPPORT_EMAIL', 'soporte@erp.com');
    const appName = this.configService.get<string>('APP_NAME', 'ERP System');

    // Construir enlace de reset
    const resetLink = `${appUrl}/reset-password?token=${resetToken}&email=${encodeURIComponent(recipientEmail)}`;

    // Generar contenido del email usando la plantilla
    const templateData: PasswordResetTemplateData = {
      userName: recipientName,
      resetLink,
      expirationHours: 24,
      supportEmail,
      appName,
      appUrl,
    };

    const emailContent = generatePasswordResetEmail(templateData);

    // Log de seguridad antes de enviar
    this.logger.log(
      `Sending password reset email to ${recipientEmail} from IP: ${clientIp || 'unknown'}`
    );

    // Enviar email
    const sent = await this.sendEmail({
      to: recipientEmail,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    });

    if (sent) {
      this.logger.log(
        `Password reset email sent successfully to ${recipientEmail} from IP: ${clientIp || 'unknown'}`
      );
    } else {
      this.logger.error(
        `Failed to send password reset email to ${recipientEmail} from IP: ${clientIp || 'unknown'}`
      );
    }

    return sent;
  }

  /**
   * Envía email de confirmación después de reset exitoso
   */
  async sendPasswordResetConfirmationEmail(
    recipientEmail: string,
    recipientName: string,
    clientIp?: string
  ): Promise<boolean> {
    const appName = this.configService.get<string>('APP_NAME', 'ERP System');
    const supportEmail = this.configService.get<string>('SUPPORT_EMAIL', 'soporte@erp.com');
    const appUrl = this.configService.get<string>('APP_URL', 'http://localhost:3000');

    const subject = `${appName} - Contraseña actualizada exitosamente`;

    const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Contraseña Actualizada</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1); overflow: hidden; }
    .header { background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: #ffffff; padding: 40px 30px; text-align: center; }
    .header h1 { margin: 0; font-size: 28px; font-weight: 600; }
    .content { padding: 40px 30px; }
    .success-box { background-color: #d4edda; border-left: 4px solid #28a745; padding: 16px; margin: 24px 0; border-radius: 4px; }
    .success-box p { margin: 0; color: #155724; font-size: 14px; }
    .warning-box { background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 16px; margin: 24px 0; border-radius: 4px; }
    .warning-box p { margin: 0; color: #856404; font-size: 14px; }
    .footer { background-color: #f8f9fa; padding: 24px 30px; text-align: center; border-top: 1px solid #e9ecef; }
    .footer p { margin: 8px 0; color: #6c757d; font-size: 13px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>✅ Contraseña Actualizada</h1>
    </div>
    <div class="content">
      <h2>Hola ${recipientName},</h2>
      <div class="success-box">
        <p>✓ Tu contraseña ha sido actualizada exitosamente.</p>
      </div>
      <p>Tu cuenta de ${appName} ahora está protegida con tu nueva contraseña.</p>
      <p><strong>Detalles del cambio:</strong></p>
      <ul>
        <li>Fecha y hora: ${new Date().toLocaleString('es-ES', { timeZone: 'America/Lima' })}</li>
        <li>IP del dispositivo: ${clientIp || 'No disponible'}</li>
      </ul>
      <div class="warning-box">
        <p>⚠️ <strong>¿No fuiste tú?</strong><br>
        Si no realizaste este cambio, tu cuenta puede haber sido comprometida. Contacta inmediatamente a <a href="mailto:${supportEmail}">${supportEmail}</a></p>
      </div>
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} ${appName}. Todos los derechos reservados.</p>
      <p><a href="${appUrl}">${appUrl}</a></p>
    </div>
  </div>
</body>
</html>
    `.trim();

    const text = `
Hola ${recipientName},

Tu contraseña ha sido actualizada exitosamente en ${appName}.

Detalles del cambio:
- Fecha y hora: ${new Date().toLocaleString('es-ES')}
- IP del dispositivo: ${clientIp || 'No disponible'}

¿No fuiste tú?
Si no realizaste este cambio, contacta inmediatamente a ${supportEmail}

---
© ${new Date().getFullYear()} ${appName}
${appUrl}
    `.trim();

    this.logger.log(
      `Sending password reset confirmation email to ${recipientEmail} from IP: ${clientIp || 'unknown'}`
    );

    return this.sendEmail({
      to: recipientEmail,
      subject,
      html,
      text,
    });
  }

  /**
   * Envía email de activación de usuario con credenciales temporales
   */
  async sendUserActivationEmail(
    recipientEmail: string,
    recipientName: string,
    temporaryPassword: string,
    clientIp?: string
  ): Promise<boolean> {
    const appUrl = this.configService.get<string>('APP_URL', 'http://localhost:3000');
    const supportEmail = this.configService.get<string>('SUPPORT_EMAIL', 'soporte@erp.com');
    const appName = this.configService.get<string>('APP_NAME', 'ERP System');

    // Construir enlace de login
    const loginUrl = `${appUrl}/login`;

    // Generar contenido del email usando la plantilla
    const templateData: UserActivationTemplateData = {
      userName: recipientName,
      userEmail: recipientEmail,
      temporaryPassword,
      loginUrl,
      supportEmail,
      appName,
      appUrl,
    };

    const emailContent = generateUserActivationEmail(templateData);

    // Log de seguridad antes de enviar
    this.logger.log(
      `Sending user activation email to ${recipientEmail} from IP: ${clientIp || 'unknown'}`
    );

    // Enviar email
    const sent = await this.sendEmail({
      to: recipientEmail,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    });

    if (sent) {
      this.logger.log(
        `User activation email sent successfully to ${recipientEmail} from IP: ${clientIp || 'unknown'}`
      );
    } else {
      this.logger.error(
        `Failed to send user activation email to ${recipientEmail} from IP: ${clientIp || 'unknown'}`
      );
    }

    return sent;
  }

  /**
   * Verifica si el servicio de email está configurado y funcionando
   */
  async verifyConfiguration(): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn('Email service not configured');
      return false;
    }

    try {
      await this.transporter.verify();
      this.logger.log('Email service configuration verified successfully');
      return true;
    } catch (error) {
      this.logger.error(`Email service verification failed: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * A2: Verifica si el servicio de email está configurado (sin verificación de conexión)
   * Más rápido que verifyConfiguration() para validaciones rápidas
   */
  isConfigured(): boolean {
    return this.transporter !== null;
  }

  /**
   * Retorna información sobre la configuración actual
   */
  getConfigInfo(): { provider: string; configured: boolean; from: string } {
    return {
      provider: this.config.provider,
      configured: this.transporter !== null,
      from: `${this.config.from.name} <${this.config.from.email}>`,
    };
  }
}

