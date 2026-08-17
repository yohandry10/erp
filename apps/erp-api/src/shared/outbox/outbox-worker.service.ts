import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseService } from '../supabase/supabase.service';
import { ClaimedOutboxEvent, OutboxService } from './outbox.service';
import { EventBusService, ERPEvent } from '../events/event-bus.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { ACCOUNTING_EVENT_TYPES } from './accounting-event-types';

/** Worker genérico. El claim SQL es la fuente única de propiedad del evento. */
@Injectable()
export class OutboxWorker implements OnApplicationBootstrap {
  private readonly logger = new Logger(OutboxWorker.name);
  private readonly workerName = `outbox-generic:${process.env.RENDER_INSTANCE_ID ?? process.pid}`;
  private readonly cronLockKey = 'worker:outbox:shared';
  private readonly cronLockTtlSeconds = 240;
  private isProcessing = false;

  constructor(
    private readonly supabase: SupabaseService,
    private readonly outboxService: OutboxService,
    @Inject(EventBusService) private readonly eventBus: EventBusService,
    private readonly tenantContext: TenantContextService,
  ) {}

  onApplicationBootstrap(): void {
    this.logger.log('[OutboxWorker] Worker iniciado; programando catch-up inmediato');
    setImmediate(() => {
      void this.processPendingEvents().catch((error) => {
        this.logger.error('[OutboxWorker] Catch-up inicial falló', error);
      });
    });
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async processPendingEvents(): Promise<void> {
    if (process.env.OUTBOX_WORKER_CRON_ENABLED === 'false' || this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    let lockAcquired = false;
    try {
      const backoffMs = this.supabase.getNetworkBackoffRemainingMs();
      if (backoffMs > 0) {
        throw new Error(`SUPABASE_BACKOFF_ACTIVE:${backoffMs}`);
      }

      lockAcquired = await this.tryAcquireJobLock();
      if (!lockAcquired) {
        this.logger.debug('[OutboxWorker] Otro nodo posee el lock distribuido');
        return;
      }

      await this.tenantContext.run(
        { tenantId: null, userId: 'outbox-worker', isSuperAdmin: true },
        async () => {
          const reset = await this.outboxService.resetStuckEvents(15);
          if (reset > 0) {
            this.logger.warn(`[OutboxWorker] Claims vencidos reiniciados: ${reset}`);
          }

          const claimed = await this.outboxService.claimPendingEvents({
            worker: this.workerName,
            limit: 100,
            excludedEventTypes: ACCOUNTING_EVENT_TYPES,
          });
          if (claimed.length === 0) {
            this.logger.debug('[OutboxWorker] No hay eventos reclamables');
            return;
          }

          const { completed, failed } = await this.processClaimBatch(claimed);
          this.logger.log(
            `[OutboxWorker] Lote cerrado: claimed=${claimed.length}, completed=${completed}, failed=${failed}`,
          );
        },
      );
    } catch (error) {
      this.logger.error('[OutboxWorker] Fallo procesando lote', error);
    } finally {
      if (lockAcquired) {
        await this.releaseJobLock();
      }
      this.isProcessing = false;
    }
  }

  async processPendingEventsManual(limit: number = 100): Promise<{ processed: number; failed: number }> {
    return this.tenantContext.run(
      { tenantId: null, userId: 'outbox-worker', isSuperAdmin: true },
      async () => {
        const claimed = await this.outboxService.claimPendingEvents({
          worker: `${this.workerName}:manual`,
          limit,
          excludedEventTypes: ACCOUNTING_EVENT_TYPES,
        });
        const { completed, failed } = await this.processClaimBatch(claimed);
        return { processed: completed, failed };
      },
    );
  }

  private async processClaimBatch(
    claimed: ClaimedOutboxEvent[],
  ): Promise<{ completed: number; failed: number }> {
    const active = new Map(claimed.map((event) => [event.id, event]));
    const heartbeatTimer = setInterval(() => {
      void this.heartbeatClaimBatch([...active.values()]);
    }, 60_000);
    heartbeatTimer.unref?.();

    let completed = 0;
    let failed = 0;
    try {
      for (const event of claimed) {
        const ok = await this.processClaimedEvent(event);
        active.delete(event.id);
        if (ok) {
          completed += 1;
        } else {
          failed += 1;
        }
      }
      return { completed, failed };
    } finally {
      clearInterval(heartbeatTimer);
    }
  }

  private async heartbeatClaimBatch(events: ClaimedOutboxEvent[]): Promise<void> {
    const results = await Promise.allSettled(
      events.map((event) => this.outboxService.heartbeatEvent(event.id, event.claim_token)),
    );
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        this.logger.error(
          `[OutboxWorker] Heartbeat falló para claim ${events[index]?.id}`,
          result.reason,
        );
      }
    });
  }

  private async processClaimedEvent(event: ClaimedOutboxEvent): Promise<boolean> {
    return this.tenantContext.run(
      {
        tenantId: event.tenant_id,
        userId: 'outbox-worker',
        isSuperAdmin: false,
        outboxEventRowId: event.id,
        outboxEventId: event.event_id,
        outboxClaimToken: event.claim_token,
        outboxWorker: event.claimed_by,
      },
      async () => {
        try {
          await this.outboxService.heartbeatEvent(event.id, event.claim_token);
          const erpEvent: ERPEvent = {
            type: event.event_type,
            data: {
              ...(event.event_data ?? event.payload ?? {}),
              outboxRowId: event.id,
              outboxClaimToken: event.claim_token,
            },
            timestamp: new Date(event.created_at),
            module: 'outbox-worker',
          };
          await this.eventBus.emitAndAwait(event.event_type, erpEvent.data, 'outbox-worker');
          await this.outboxService.markEventCompleted(event.id, event.claim_token);
          return true;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          try {
            await this.outboxService.markEventFailed(event.id, event.claim_token, message);
          } catch (transitionError) {
            this.logger.error(
              `[OutboxWorker] No se pudo cerrar claim ${event.id}; requiere reconciliación`,
              transitionError,
            );
          }
          this.logger.error(`[OutboxWorker] Evento ${event.event_type} (${event.id}) falló`, error);
          return false;
        }
      },
    );
  }

  private async tryAcquireJobLock(): Promise<boolean> {
    try {
      const { data, error } = await this.supabase.getPublicClient().rpc('acquire_job_lock', {
        p_lock_key: this.cronLockKey,
        p_lock_ttl_seconds: this.cronLockTtlSeconds,
      });
      if (error) {
        this.logger.warn(`[OutboxWorker] Lock distribuido no disponible: ${error.message}`);
        return false;
      }
      return data === true || data === 'true';
    } catch (error) {
      this.logger.warn(`[OutboxWorker] Error adquiriendo lock: ${error?.message ?? error}`);
      return false;
    }
  }

  private async releaseJobLock(): Promise<void> {
    try {
      const { error } = await this.supabase.getPublicClient().rpc('release_job_lock', {
        p_lock_key: this.cronLockKey,
      });
      if (error) {
        this.logger.warn(`[OutboxWorker] Error liberando lock: ${error.message}`);
      }
    } catch (error) {
      this.logger.warn(`[OutboxWorker] Error liberando lock: ${error?.message ?? error}`);
    }
  }
}
