import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OutboxService } from '../../shared/outbox/outbox.service';
import { EmailNotificationService } from './email-notification.service';
import { ConfigService } from '@nestjs/config';
import { EventBusService } from '../../shared/events/event-bus.service';
import { ERPEvent } from '../../shared/events/event-bus.service';

/**
 * Listener que procesa eventos de email desde el outbox
 * Se suscribe a eventos 'email.send' emitidos por el OutboxWorker
 */
@Injectable()
export class EmailOutboxWorker implements OnModuleInit {
  private readonly logger = new Logger(EmailOutboxWorker.name);

  constructor(
    private readonly outboxService: OutboxService,
    private readonly emailNotificationService: EmailNotificationService,
    private readonly configService: ConfigService,
    private readonly eventBus: EventBusService,
  ) {}

  async onModuleInit() {
    // Suscribirse a eventos de email emitidos desde el outbox
    this.eventBus.on('email.send', this.handleEmailEvent.bind(this));
    this.logger.log('✅ Email Outbox Worker registrado como listener');
  }

  /**
   * Maneja eventos de email emitidos desde el outbox
   */
  private async handleEmailEvent(event: ERPEvent): Promise<void> {
    try {
      const eventData = event.data;
      const eventId = eventData.eventId || eventData.metadata?.eventId || 'unknown';

      this.logger.log(`📧 Procesando email desde outbox (Event ID: ${eventId})`);

      // Procesar el email
      const success = await this.emailNotificationService.processEmailEvent(
        eventId,
        eventData,
      );

      if (success) {
        // Marcar como completado
        await this.outboxService.markEventCompleted(eventId);
        this.logger.log(`✅ Email enviado exitosamente (Event ID: ${eventId}) a ${eventData.to}`);
      } else {
        // Marcar como fallido (se reintentará automáticamente)
        await this.outboxService.markEventFailed(eventId, 'Email failed to send');
        this.logger.warn(`⚠️ Email falló al enviar (Event ID: ${eventId}) a ${eventData.to}, será reintentado`);
      }
    } catch (error) {
      const eventId = event.data.eventId || event.data.metadata?.eventId || 'unknown';
      this.logger.error(`❌ Error procesando evento de email (Event ID: ${eventId}):`, error);
      
      // Marcar como fallido para reintento
      try {
        await this.outboxService.markEventFailed(
          eventId,
          error instanceof Error ? error.message : 'Unknown error',
        );
      } catch (markError) {
        this.logger.error(`❌ Error marcando evento como fallido:`, markError);
      }
    }
  }

  /**
   * Procesa emails pendientes directamente desde el outbox (para procesamiento manual o inmediato)
   */
  async processPendingEmails(batchSize: number = 10): Promise<number> {
    try {
      const pendingEvents = await this.outboxService.getPendingEvents(batchSize);
      const emailEvents = pendingEvents.filter(
        (event) => event.event_type === 'email.send',
      );

      if (emailEvents.length === 0) {
        return 0;
      }

      this.logger.log(`📧 Procesando ${emailEvents.length} email(s) pendiente(s)`);

      let processed = 0;
      for (const event of emailEvents) {
        try {
          await this.outboxService.markEventProcessing(event.id);

          const success = await this.emailNotificationService.processEmailEvent(
            event.id,
            event.event_data,
          );

          if (success) {
            await this.outboxService.markEventCompleted(event.id);
            processed++;
          } else {
            await this.outboxService.markEventFailed(
              event.id,
              'Email failed to send',
            );
          }
        } catch (error) {
          await this.outboxService.markEventFailed(
            event.id,
            error instanceof Error ? error.message : 'Unknown error',
          );
        }
      }

      return processed;
    } catch (error) {
      this.logger.error('❌ Error procesando emails pendientes:', error);
      return 0;
    }
  }
}

