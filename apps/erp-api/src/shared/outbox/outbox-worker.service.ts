import { Injectable, Logger, OnModuleInit, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseService } from '../supabase/supabase.service';
import { OutboxService } from '../outbox/outbox.service';
import { EventBusService, ERPEvent } from '../events/event-bus.service';

/**
 * Worker que procesa eventos pendientes de la tabla outbox
 * Garantiza entrega atómica de eventos con reintentos automáticos
 */
@Injectable()
export class OutboxWorker implements OnModuleInit {
  private readonly logger = new Logger(OutboxWorker.name);
  private isProcessing = false;

  constructor(
    private readonly supabase: SupabaseService,
    private readonly outboxService: OutboxService,
    @Inject(EventBusService) private readonly eventBus: EventBusService,
  ) {}

  onModuleInit() {
    this.logger.log('🚀 [OutboxWorker] Worker iniciado');
    // Procesar eventos pendientes al iniciar
    this.processPendingEvents();
  }

  /**
   * 🔴 CRÍTICO FIX: Procesa eventos pendientes de la tabla outbox
   * Se ejecuta cada minuto para procesar eventos pendientes
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async processPendingEvents(): Promise<void> {
    if (this.isProcessing) {
      this.logger.debug('⏳ [OutboxWorker] Ya hay un proceso en ejecución, saltando...');
      return;
    }

    this.isProcessing = true;

    try {
      this.logger.log('🔄 [OutboxWorker] Procesando eventos pendientes...');

      // Obtener eventos pendientes (máximo 100 por ejecución)
      const pendingEvents = await this.outboxService.getPendingEvents(100);

      if (pendingEvents.length === 0) {
        this.logger.debug('✅ [OutboxWorker] No hay eventos pendientes');
        return;
      }

      this.logger.log(`📦 [OutboxWorker] Procesando ${pendingEvents.length} eventos pendientes`);

      for (const event of pendingEvents) {
        try {
          // Marcar evento como procesando
          await this.outboxService.markEventProcessing(event.id);

          // Construir evento ERP
          const erpEvent: ERPEvent = {
            type: event.event_type,
            data: {
              ...event.event_data,
              eventId: event.id, // Incluir eventId para que los listeners puedan rastrearlo
            },
            timestamp: new Date(event.created_at),
            module: 'outbox-worker',
          };

          // Emitir evento en el event bus (esto disparará los listeners)
          // Para emails, los listeners marcarán el evento como completado/fallido
          // Para otros eventos, marcamos como completado aquí
          if (event.event_type === 'email.send') {
            // Para emails, solo emitir - el EmailOutboxWorker manejará el estado
            this.eventBus.emit(event.event_type, erpEvent.data, 'outbox-worker');
          } else {
            // Para otros eventos, procesar normalmente
            this.eventBus.emit(event.event_type, erpEvent.data, 'outbox-worker');
            await this.outboxService.markEventCompleted(event.id);
            this.logger.log(`✅ [OutboxWorker] Evento ${event.event_type} (ID: ${event.id}) procesado exitosamente`);
          }
        } catch (error) {
          this.logger.error(
            `❌ [OutboxWorker] Error procesando evento ${event.event_type} (ID: ${event.id}):`,
            error,
          );

          // Marcar evento como fallido y programar reintento
          await this.outboxService.markEventFailed(event.id, error.message || String(error));
        }
      }

      this.logger.log(`✅ [OutboxWorker] Procesamiento completado: ${pendingEvents.length} eventos`);
    } catch (error) {
      this.logger.error('❌ [OutboxWorker] Error general procesando eventos pendientes:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Procesa eventos pendientes de forma manual (útil para testing o procesamiento inmediato)
   */
  async processPendingEventsManual(limit: number = 100): Promise<{ processed: number; failed: number }> {
    const pendingEvents = await this.outboxService.getPendingEvents(limit);
    let processed = 0;
    let failed = 0;

    for (const event of pendingEvents) {
      try {
        await this.outboxService.markEventProcessing(event.id);

        const erpEvent: ERPEvent = {
          type: event.event_type,
          data: event.event_data,
          timestamp: new Date(event.created_at),
          module: 'outbox-worker',
        };

        this.eventBus.emit(event.event_type, erpEvent.data, 'outbox-worker');
        await this.outboxService.markEventCompleted(event.id);
        processed++;
      } catch (error) {
        await this.outboxService.markEventFailed(event.id, error.message || String(error));
        failed++;
      }
    }

    return { processed, failed };
  }
}

