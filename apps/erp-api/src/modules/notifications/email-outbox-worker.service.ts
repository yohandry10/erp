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
    const eventData = event.data;
    const eventId = eventData.outboxRowId || eventData.metadata?.eventId || 'unknown';
    this.logger.log(`📧 Procesando email desde outbox (Event ID: ${eventId})`);
    const success = await this.emailNotificationService.processEmailEvent(eventId, eventData);
    if (!success) {
      // El worker propietario del claim realiza la transición FAILED. El listener
      // sólo comunica el fallo para impedir un falso COMPLETED.
      throw new Error('Email failed to send');
    }
    this.logger.log(`✅ Email enviado exitosamente (Event ID: ${eventId}) a ${eventData.to}`);
  }

  /**
   * Procesa emails pendientes directamente desde el outbox (para procesamiento manual o inmediato)
   */
  async processPendingEmails(batchSize: number = 10): Promise<number> {
    const emailEvents = await this.outboxService.claimPendingEvents({
      worker: `email-manual:${process.env.RENDER_INSTANCE_ID ?? process.pid}`,
      limit: batchSize,
      eventTypes: ['email.send'],
    });

    if (emailEvents.length === 0) {
      return 0;
    }

    this.logger.log(`📧 Procesando ${emailEvents.length} email(s) pendiente(s)`);

    let processed = 0;
    for (const event of emailEvents) {
      try {
        const success = await this.emailNotificationService.processEmailEvent(
          event.id,
          event.event_data ?? event.payload ?? {},
        );

        if (success) {
          await this.outboxService.markEventCompleted(event.id, event.claim_token);
          processed++;
        } else {
          await this.outboxService.markEventFailed(
            event.id,
            event.claim_token,
            'Email failed to send',
          );
        }
      } catch (error) {
        await this.outboxService.markEventFailed(
          event.id,
          event.claim_token,
          error instanceof Error ? error.message : 'Unknown error',
        );
      }
    }

    return processed;
  }
}

