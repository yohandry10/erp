import { Injectable, Logger } from '@nestjs/common';
import { OutboxService } from '../../shared/outbox/outbox.service';
import { EmailService } from '../../shared/email/email.service';
import { SendEmailOptions } from '../../shared/email/interfaces/email-config.interface';

interface EmailNotificationData {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
  priority?: 'high' | 'normal' | 'low';
  metadata?: {
    notificationType?: string;
    tenantId?: string;
    userId?: string;
    eventId?: string;
  };
}

@Injectable()
export class EmailNotificationService {
  private readonly logger = new Logger(EmailNotificationService.name);

  constructor(
    private readonly outboxService: OutboxService,
    private readonly emailService: EmailService,
  ) { }

  /**
   * Envía un email usando Outbox Pattern
   * Si el servicio de email falla, el evento se persiste y se reintentará automáticamente
   */
  async sendEmailWithRetry(
    tenantId: string,
    emailData: EmailNotificationData,
  ): Promise<string> {
    try {
      // Intentar enviar inmediatamente primero
      const sent = await this.emailService.sendEmail({
        to: emailData.to,
        subject: emailData.subject,
        html: emailData.html,
        text: emailData.text,
        attachments: emailData.attachments,
      });

      if (sent) {
        this.logger.log(`✅ Email enviado exitosamente a ${emailData.to}`);
        return 'sent';
      }

      // Si falla el envío, persistir en outbox para reintento
      this.logger.warn(
        `⚠️ Email falló al enviar inmediatamente, persistiendo en outbox para reintento: ${emailData.to}`,
      );

      return await this.persistEmailToOutbox(tenantId, emailData);
    } catch (error) {
      this.logger.error(
        `❌ Error enviando email a ${emailData.to}, persistiendo en outbox:`,
        error,
      );

      // Persistir en outbox para reintento
      return await this.persistEmailToOutbox(tenantId, emailData);
    }
  }

  /**
   * Persiste un email en el outbox para procesamiento posterior
   */
  private async persistEmailToOutbox(
    tenantId: string,
    emailData: EmailNotificationData,
  ): Promise<string> {
    const eventData = {
      to: emailData.to,
      subject: emailData.subject,
      html: emailData.html,
      text: emailData.text,
      attachments: emailData.attachments
        ? emailData.attachments.map((att) => ({
          filename: att.filename,
          content: Buffer.isBuffer(att.content)
            ? att.content.toString('base64')
            : att.content,
          contentType: att.contentType,
        }))
        : undefined,
      priority: emailData.priority || 'normal',
      metadata: {
        ...emailData.metadata,
        tenantId, // Incluir tenantId explícitamente
      },
    };

    const eventId = await this.outboxService.persistEventStandard({
      tenantId,
      eventType: 'email.send',
      aggregateType: 'notification',
      aggregateId: emailData.to,
      eventData,
      maxRetries: 5,
    });

    // Agregar eventId al metadata para poder rastrearlo
    eventData.metadata.eventId = eventId;

    this.logger.log(
      `📧 Email persistido en outbox (Event ID: ${eventId}) para ${emailData.to}`,
    );

    return eventId;
  }

  /**
   * Procesa un evento de email desde el outbox
   * Este método es llamado por el worker/listener
   */
  async processEmailEvent(eventId: string, eventData: any): Promise<boolean> {
    try {
      this.logger.log(`📧 Procesando email desde outbox (Event ID: ${eventId})`);

      // Reconstruir attachments si existen
      const attachments = eventData.attachments
        ? eventData.attachments.map((att: any) => ({
          filename: att.filename,
          content: Buffer.from(att.content, 'base64'),
          contentType: att.contentType,
        }))
        : undefined;

      const emailOptions: SendEmailOptions = {
        to: eventData.to,
        subject: eventData.subject,
        html: eventData.html,
        text: eventData.text,
        attachments,
      };

      const sent = await this.emailService.sendEmail(emailOptions);

      if (sent) {
        this.logger.log(
          `✅ Email enviado exitosamente desde outbox (Event ID: ${eventId}) a ${eventData.to}`,
        );
        return true;
      } else {
        this.logger.warn(
          `⚠️ Email falló al enviar desde outbox (Event ID: ${eventId}) a ${eventData.to}`,
        );
        return false;
      }
    } catch (error) {
      this.logger.error(
        `❌ Error procesando email desde outbox (Event ID: ${eventId}):`,
        error,
      );
      return false;
    }
  }

  /**
   * Envía email de notificación usando outbox pattern
   */
  async sendNotificationEmail(
    tenantId: string,
    to: string,
    subject: string,
    html: string,
    text?: string,
    metadata?: {
      notificationType?: string;
      userId?: string;
    },
  ): Promise<string> {
    return this.sendEmailWithRetry(tenantId, {
      to,
      subject,
      html,
      text,
      priority: 'normal',
      metadata: {
        ...metadata,
        tenantId,
        notificationType: metadata?.notificationType || 'notification',
      },
    });
  }
}

