import { Injectable, Logger } from "@nestjs/common";
import { SupabaseService } from "../../../shared/supabase/supabase.service";
import { ACCOUNTING_EVENT_TYPES } from "../../../shared/outbox/accounting-event-types";

export interface OutboxEvent {
  id: string;
  event_id: string;
  correlation_id?: string;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  event_data: any;
  payload?: any;
  event_version?: number;
  created_at: string;
  processed_at: string | null;
  retry_count: number;
  status: string;
  error_message: string | null;
  tenant_id?: string;
  claim_token?: string;
  claimed_by?: string;
}

@Injectable()
export class OutboxEventsService {
  private readonly logger = new Logger(OutboxEventsService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  private normalizeEvent(row: any): OutboxEvent {
    if (row.event_data !== undefined || row.payload !== undefined) {
      return {
        ...row,
        event_data: row.event_data ?? row.payload ?? {},
      } as OutboxEvent;
    }

    return row as OutboxEvent;
  }

  private async leerEventosTenant(
    tenantId: string,
    actorId: string,
    statuses: string[] | null,
    limit: number,
  ): Promise<OutboxEvent[]> {
    const { data, error } = await this.supabaseService
      .getClient()
      .rpc("list_tenant_outbox_events_492", {
        p_tenant_id: tenantId,
        p_actor_id: actorId,
        p_statuses: statuses,
        p_limit: limit,
      });
    if (error) {
      throw new Error(`Error leyendo eventos del tenant: ${error.message}`);
    }
    return ((data ?? []) as any[]).map((row) => this.normalizeEvent(row));
  }

  /** Reclama atómicamente sólo los tipos cuyo propietario es contabilidad. */
  async reclamarEventosContables(
    worker: string,
    maxRetries: number = 3,
    limit: number = 50,
  ): Promise<OutboxEvent[]> {
    const { data, error } = await this.supabaseService
      .getPublicClient()
      .rpc("claim_outbox_events_tx", {
        p_worker: worker,
        p_limit: limit,
        p_event_types: [...ACCOUNTING_EVENT_TYPES],
        p_excluded_event_types: null,
        p_tenant_id: null,
        p_max_retries: maxRetries,
      });
    if (error) {
      throw new Error(
        `No se pudieron reclamar eventos contables: ${error.message}`,
      );
    }
    return ((data ?? []) as any[]).map((row) => this.normalizeEvent(row));
  }

  async renovarClaimContable(
    eventId: string,
    claimToken: string,
  ): Promise<void> {
    if (!eventId || !claimToken) {
      throw new Error("El heartbeat contable requiere fila y claim token");
    }
    const { data, error } = await this.supabaseService
      .getPublicClient()
      .rpc("heartbeat_outbox_event_tx", {
        p_id: eventId,
        p_claim_token: claimToken,
      });
    if (error) {
      throw new Error(`No se pudo renovar claim contable: ${error.message}`);
    }
    if (data !== true) {
      throw new Error(`OUTBOX_CLAIM_LOST:${eventId}`);
    }
  }

  /**
   * Lee eventos fallidos que pueden ser reintentados
   * @param limit - Límite de eventos a leer (default: 100)
   * @returns Lista de eventos fallidos
   */
  async leerEventosFallidos(
    tenantId: string,
    actorId: string,
    limit: number = 100,
  ): Promise<OutboxEvent[]> {
    try {
      const data = await this.leerEventosTenant(
        tenantId,
        actorId,
        ["failed"],
        limit,
      );
      if (data.length === 0) {
        this.logger.debug("ℹ️ [OutboxEvents] No hay eventos fallidos");
        return [];
      }

      this.logger.log(
        `✅ [OutboxEvents] ${data.length} eventos fallidos encontrados`,
      );

      return data;
    } catch (error) {
      this.logger.error(
        "❌ [OutboxEvents] Excepción leyendo eventos fallidos:",
        error,
      );
      throw error;
    }
  }

  /**
   * Lee eventos en dead letter (fallidos permanentemente)
   * @param limit - Límite de eventos a leer (default: 100)
   * @returns Lista de eventos en dead letter
   */
  async leerEventosDeadLetter(
    tenantId: string,
    actorId: string,
    limit: number = 100,
  ): Promise<OutboxEvent[]> {
    try {
      const data = await this.leerEventosTenant(
        tenantId,
        actorId,
        ["dead_letter"],
        limit,
      );
      if (data.length === 0) {
        this.logger.debug("ℹ️ [OutboxEvents] No hay eventos dead letter");
        return [];
      }

      this.logger.log(
        `✅ [OutboxEvents] ${data.length} eventos dead letter encontrados`,
      );

      return data;
    } catch (error) {
      this.logger.error(
        "❌ [OutboxEvents] Excepción leyendo eventos dead letter:",
        error,
      );
      throw error;
    }
  }

  /**
   * Obtiene estadísticas de eventos por estado
   * @returns Estadísticas de eventos
   */
  async obtenerEstadisticasEventos(
    tenantId: string,
    actorId: string,
  ): Promise<{
    pending: number;
    processed: number;
    failed: number;
    dead_letter: number;
    processed_today: number;
    avg_processing_time_ms: number | null;
  }> {
    try {
      const { data, error } = await this.supabaseService
        .getClient()
        .rpc("outbox_tenant_stats_492", {
          p_tenant_id: tenantId,
          p_actor_id: actorId,
        });

      if (error) {
        this.logger.error(
          "❌ [OutboxEvents] Error obteniendo estadísticas:",
          error,
        );
        throw new Error(`Error obteniendo estadísticas: ${error.message}`);
      }

      const raw = (data ?? {}) as Record<string, unknown>;
      const stats = {
        pending: Number(raw.pending ?? 0),
        processed: Number(raw.processed ?? 0),
        failed: Number(raw.failed ?? 0),
        dead_letter: Number(raw.dead_letter ?? 0),
        processed_today: Number(raw.processed_today ?? 0),
        avg_processing_time_ms:
          raw.avg_processing_time_ms == null
            ? null
            : Number(raw.avg_processing_time_ms),
      };

      this.logger.log(
        `📊 [OutboxEvents] Estadísticas: ${stats.pending} pendientes, ${stats.processed} procesados (${stats.processed_today} hoy), ${stats.failed} fallidos, ${stats.dead_letter} dead letter, tiempo promedio: ${stats.avg_processing_time_ms ? `${stats.avg_processing_time_ms}ms` : "N/A"}`,
      );

      return stats;
    } catch (error) {
      this.logger.error(
        "❌ [OutboxEvents] Excepción obteniendo estadísticas:",
        error,
      );
      throw error;
    }
  }
}
