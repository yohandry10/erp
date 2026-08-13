import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { OutboxEventBuilder, CreateOutboxEventOptions } from './outbox-event.interface';

export interface ClaimedOutboxEvent {
  id: string;
  event_id: string;
  tenant_id: string;
  event_type: string;
  aggregate_type?: string;
  aggregate_id?: string;
  payload?: Record<string, any>;
  event_data?: Record<string, any>;
  created_at: string;
  claim_token: string;
  claimed_by: string;
}

/** Frontera única de escritura para public.outbox_events. */
@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(private readonly supabase: SupabaseService) {}

  /** @deprecated Use persistEventStandard para conservar el contrato canónico. */
  async persistEvent(
    tenantId: string,
    eventType: string,
    eventData: any,
    maxRetries: number = 5,
  ): Promise<string> {
    const aggregateType = eventData.aggregateType || eventType.split('.')[0] || 'unknown';
    const aggregateId = eventData.aggregateId || eventData.id || eventData.ventaId
      || eventData.cobroId || eventData.recepcionId || 'unknown';

    return this.persistEventStandard({
      tenantId,
      eventType,
      aggregateType,
      aggregateId,
      eventData,
      maxRetries,
    });
  }

  async persistEventStandard(options: CreateOutboxEventOptions): Promise<string> {
    const eventToInsert = OutboxEventBuilder.build(options);
    const { data, error } = await this.supabase.getClient().rpc('enqueue_outbox_event_tx', {
      p_event: eventToInsert,
    });

    if (error) {
      this.logger.error(`Error encolando ${options.eventType}: ${error.message}`);
      throw new Error(`No se pudo persistir evento: ${error.message}`);
    }

    const result = data as { event_id?: string } | null;
    if (!result?.event_id) {
      throw new Error('enqueue_outbox_event_tx no devolvió event_id');
    }

    return result.event_id;
  }

  async claimPendingEvents(options: {
    worker: string;
    limit?: number;
    eventTypes?: readonly string[];
    excludedEventTypes?: readonly string[];
    tenantId?: string;
    maxRetries?: number;
  }): Promise<ClaimedOutboxEvent[]> {
    const { data, error } = await this.supabase.getClient({ silent: true }).rpc(
      'claim_outbox_events_tx',
      {
        p_worker: options.worker,
        p_limit: options.limit ?? 100,
        p_event_types: options.eventTypes?.length ? [...options.eventTypes] : null,
        p_excluded_event_types: options.excludedEventTypes?.length
          ? [...options.excludedEventTypes]
          : null,
        p_tenant_id: options.tenantId ?? null,
        p_max_retries: options.maxRetries ?? 5,
      },
    );

    if (error) {
      throw new Error(`No se pudieron reclamar eventos outbox: ${error.message}`);
    }

    const events = (data ?? []) as ClaimedOutboxEvent[];
    for (const event of events) {
      if (!event.id || !event.claim_token || !event.tenant_id) {
        throw new Error('claim_outbox_events_tx devolvió un claim incompleto');
      }
    }
    return events;
  }

  /** Lectura pasiva para diagnóstico/administración; no reclama eventos. */
  async getPendingEvents(limit: number = 100, tenantId?: string): Promise<any[]> {
    const { data, error } = await this.supabase.getClient({ silent: true }).rpc(
      'list_outbox_events_492',
      {
        p_tenant_id: tenantId ?? null,
        p_statuses: ['pending', 'failed'],
        p_event_type: null,
        p_event_id: null,
        p_limit: limit,
        p_max_retries: 5,
      },
    );
    if (error) {
      throw new Error(`No se pudieron leer eventos outbox: ${error.message}`);
    }
    return (data ?? []) as any[];
  }

  async markEventCompleted(eventId: string, claimToken: string): Promise<void> {
    this.assertClaim(eventId, claimToken);
    const { data, error } = await this.supabase.getClient().rpc('complete_outbox_event_tx', {
      p_id: eventId,
      p_claim_token: claimToken,
    });
    if (error) {
      throw new Error(`No se pudo completar evento outbox: ${error.message}`);
    }
    if (data !== true) {
      throw new Error(`OUTBOX_CLAIM_LOST:${eventId}`);
    }
  }

  async heartbeatEvent(eventId: string, claimToken: string): Promise<void> {
    this.assertClaim(eventId, claimToken);
    const { data, error } = await this.supabase.getClient({ silent: true }).rpc(
      'heartbeat_outbox_event_tx',
      { p_id: eventId, p_claim_token: claimToken },
    );
    if (error) {
      throw new Error(`No se pudo renovar claim outbox: ${error.message}`);
    }
    if (data !== true) {
      throw new Error(`OUTBOX_CLAIM_LOST:${eventId}`);
    }
  }

  async markEventFailed(
    eventId: string,
    claimToken: string,
    errorMessage: string,
    maxRetries: number = 5,
  ): Promise<'failed' | 'dead_letter'> {
    this.assertClaim(eventId, claimToken);
    const { data, error } = await this.supabase.getClient().rpc('fail_outbox_event_tx', {
      p_id: eventId,
      p_claim_token: claimToken,
      p_error: errorMessage,
      p_next_retry_at: null,
      p_max_retries: maxRetries,
    });
    if (error) {
      throw new Error(`No se pudo fallar evento outbox: ${error.message}`);
    }

    const result = data as { updated?: boolean; status?: 'failed' | 'dead_letter' } | null;
    if (!result?.updated || !result.status) {
      throw new Error(`OUTBOX_CLAIM_LOST:${eventId}`);
    }
    return result.status;
  }

  async resetStuckEvents(ttlMinutes: number = 15, limit: number = 500): Promise<number> {
    const cutoff = new Date(Date.now() - Math.max(ttlMinutes, 1) * 60_000).toISOString();
    const { data, error } = await this.supabase.getClient({ silent: true }).rpc(
      'reset_stuck_outbox_events_tx',
      { p_stale_before: cutoff, p_limit: limit },
    );
    if (error) {
      throw new Error(`No se pudieron resetear claims vencidos: ${error.message}`);
    }
    return Number(data ?? 0);
  }

  async resetEvent(
    tenantId: string,
    actorId: string,
    eventId: string,
    reason: string,
  ): Promise<boolean> {
    const { data, error } = await this.supabase.getClient().rpc('reset_outbox_event_tx', {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_event_id: eventId,
      p_reason: reason,
      p_max_restarts: 3,
    });
    if (error) {
      throw new Error(`No se pudo reintentar evento outbox: ${error.message}`);
    }
    return Boolean((data as { updated?: boolean } | null)?.updated);
  }

  private assertClaim(eventId: string, claimToken: string): void {
    if (!eventId || !claimToken) {
      throw new Error('eventId y claimToken son obligatorios para cambiar un claim outbox');
    }
  }
}
