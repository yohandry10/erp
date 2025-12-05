import { Injectable, Logger, OnModuleInit, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseService } from '../supabase/supabase.service';
import { OutboxService } from '../outbox/outbox.service';
import { EventBusService, ERPEvent } from '../events/event-bus.service';
import { TenantContextService } from '../tenant/tenant-context.service';

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
    private readonly tenantContext: TenantContextService,
  ) {}

  onModuleInit() {
    this.logger.log('🚀 [OutboxWorker] Worker iniciado');
    // No procesar eventos al iniciar para evitar errores de tenant context
    // El cron se encargará de procesarlos cada minuto
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
      await this.tenantContext.run({ tenantId: null, userId: 'outbox-worker', isSuperAdmin: true }, async () => {
        this.logger.log('🔄 [OutboxWorker] Procesando eventos pendientes...');

        // Evitar eventos atascados en PROCESSING por ejecuciones previas (TTL 10 min)
        await this.resetStuckEvents(5);

        // Obtener eventos pendientes (máximo 100 por ejecución) usando superadmin para poder traer de todos los tenants
        const pendingEvents = await this.outboxService.getPendingEvents(100);

        if (pendingEvents.length === 0) {
          this.logger.debug('✅ [OutboxWorker] No hay eventos pendientes');
          return;
        }

        this.logger.log(`📦 [OutboxWorker] Procesando ${pendingEvents.length} eventos pendientes`);

        for (const event of pendingEvents) {
          // Procesar cada evento con el tenant real para cumplir RLS
          await this.tenantContext.run(
            { tenantId: event.tenant_id, userId: 'outbox-worker', isSuperAdmin: false },
            async () => {
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
                  this.logger.log(
                    `✅ [OutboxWorker] Evento ${event.event_type} (ID: ${event.id}) procesado exitosamente`,
                  );
                }
              } catch (error) {
                this.logger.error(
                  `❌ [OutboxWorker] Error procesando evento ${event.event_type} (ID: ${event.id}) tenant ${event.tenant_id}:`,
                  error,
                );

                // Marcar evento como fallido y programar reintento
                await this.outboxService.markEventFailed(event.id, error.message || String(error));
              }
            },
          );
        }

        this.logger.log(`✅ [OutboxWorker] Procesamiento completado: ${pendingEvents.length} eventos`);
      });
    } catch (error) {
      // Silenciar errores de tenant context - es normal cuando no hay eventos con tenant
      if (error.message !== 'Tenant context required') {
        this.logger.error('❌ [OutboxWorker] Error general procesando eventos pendientes:', error);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Recoloca en PENDING los eventos que quedaron en PROCESSING por más de ttlMinutes
   * para evitar atascos si un worker murió a mitad de ejecución.
   */
  private async resetStuckEvents(ttlMinutes: number = 10): Promise<void> {
    try {
      // Usamos el cliente público (service role) para no requerir contexto de tenant al limpiar.
      const client = this.supabase.getPublicClient();
      const cutoff = new Date(Date.now() - ttlMinutes * 60 * 1000).toISOString();

      const { error, count } = await client
        .from('outbox_events')
        .update({
          status: 'PENDING',
          next_retry_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('status', 'PROCESSING')
        .lt('updated_at', cutoff);

      if (error) {
        this.logger.warn(`⚠️ [OutboxWorker] No se pudieron limpiar eventos atascados: ${error.message}`);
        return;
      }

      if ((count || 0) > 0) {
        this.logger.warn(`⚠️ [OutboxWorker] Reestablecidos ${count} eventos atascados en PROCESSING`);
      }
    } catch (err) {
      this.logger.warn('[OutboxWorker] Error limpiando eventos atascados:', err);
    }
  }

  /**
   * Procesa eventos pendientes de forma manual (útil para testing o procesamiento inmediato)
   */
  async processPendingEventsManual(limit: number = 100): Promise<{ processed: number; failed: number }> {
    return this.tenantContext.run(
      { tenantId: null, userId: 'outbox-worker', isSuperAdmin: true },
      async () => {
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
      },
    );
  }
}

