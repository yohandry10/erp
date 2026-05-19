import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { OutboxEventBuilder, CreateOutboxEventOptions } from './outbox-event.interface';

/**
 * Servicio para gestionar eventos usando Outbox Pattern
 * Garantiza persistencia y entrega atómica de eventos
 */
@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Persiste un evento en la tabla outbox antes de procesarlo
   * Esto garantiza que el evento no se pierda si el servicio se reinicia
   * @deprecated Use persistEventStandard instead for consistent structure
   */
  async persistEvent(
    tenantId: string,
    eventType: string,
    eventData: any,
    maxRetries: number = 5,
  ): Promise<string> {
    this.logger.warn('⚠️ persistEvent is deprecated. Use persistEventStandard instead.');
    
    // Extraer aggregateType y aggregateId del eventData si existen
    const aggregateType = eventData.aggregateType || eventType.split('.')[0] || 'unknown';
    const aggregateId = eventData.aggregateId || eventData.id || eventData.ventaId || eventData.cobroId || eventData.recepcionId || 'unknown';

    return this.persistEventStandard({
      tenantId,
      eventType,
      aggregateType,
      aggregateId,
      eventData,
      maxRetries,
    });
  }

  /**
   * Persiste un evento en la tabla outbox con estructura estándar
   * Garantiza consistencia en todos los campos requeridos
   */
  async persistEventStandard(options: CreateOutboxEventOptions): Promise<string> {
    const client = this.supabase.getClient();

    try {
      // Construir evento con estructura estándar
      const eventToInsert = OutboxEventBuilder.build(options);

      const { data: event, error } = await client
        .from('outbox_events')
        .insert(eventToInsert)
        .select('id, event_id')
        .single();

      if (error) {
        const isUniqueViolation =
          (error as any)?.code === '23505' ||
          (typeof (error as any)?.message === 'string' &&
            (error as any).message.toLowerCase().includes('duplicate key'));

        if (isUniqueViolation && options.idempotencyKey) {
          const { data: existing, error: existingError } = await client
            .from('outbox_events')
            .select('event_id')
            .eq('tenant_id', options.tenantId)
            .eq('idempotency_key', options.idempotencyKey)
            .maybeSingle();

          if (!existingError && existing?.event_id) {
            this.logger.warn(
              `♻️ Evento idempotente detectado (tenant=${options.tenantId}, idempotency_key=${options.idempotencyKey}). Retornando event_id existente ${existing.event_id}`,
            );
            return existing.event_id;
          }
        }

        this.logger.error(`❌ Error persistiendo evento ${options.eventType}:`, error);
        throw new Error(`No se pudo persistir evento: ${error.message}`);
      }

      this.logger.log(
        `✅ Evento ${options.eventType} persistido en outbox (ID: ${event.id}, Event ID: ${event.event_id})`
      );
      return event.event_id;
    } catch (error) {
      this.logger.error(`❌ Error persistiendo evento ${options.eventType}:`, error);
      throw error;
    }
  }

  /**
   * Obtiene eventos pendientes para procesar
   */
  async getPendingEvents(limit: number = 100, tenantId?: string): Promise<any[]> {
    try {
      const client = this.supabase.getClient({ silent: true });

      const { data, error } = await client.rpc('get_pending_outbox_events', {
        p_limit: limit,
        p_tenant_id: tenantId || null,
      });

      if (error) {
        this.logger.error('❌ Error obteniendo eventos pendientes:', error);
        throw new Error(`No se pudieron obtener eventos pendientes: ${error.message}`);
      }

      return data || [];
    } catch (error) {
      // Silenciar errores de tenant context
      if (error.message === 'Tenant context required') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Marca un evento como en procesamiento
   */
  async markEventProcessing(eventId: string): Promise<void> {
    const client = this.supabase.getClient();

    const { error } = await client.rpc('mark_outbox_event_processing', {
      p_event_id: eventId,
    });

    if (error) {
      this.logger.error(`❌ Error marcando evento ${eventId} como procesando:`, error);
      throw new Error(`No se pudo marcar evento como procesando: ${error.message}`);
    }
  }

  /**
   * Marca un evento como completado exitosamente
   */
  async markEventCompleted(eventId: string): Promise<void> {
    const client = this.supabase.getClient();

    const { error } = await client.rpc('mark_outbox_event_completed', {
      p_event_id: eventId,
    });

    if (error) {
      this.logger.error(`❌ Error marcando evento ${eventId} como completado:`, error);
      throw new Error(`No se pudo marcar evento como completado: ${error.message}`);
    }

    const { error: clearError } = await client
      .from('outbox_events')
      .update({ error_message: null, next_retry_at: null, updated_at: new Date().toISOString() })
      .eq('id', eventId)
      .eq('status', 'completed');

    if (clearError) {
      this.logger.error(`❌ Error limpiando estado de error del evento completado ${eventId}:`, clearError);
      throw new Error(`No se pudo limpiar estado de error del evento completado: ${clearError.message}`);
    }

    this.logger.log(`✅ Evento ${eventId} marcado como completado`);
  }

  /**
   * Marca un evento como fallido y programa reintento
   */
  async markEventFailed(eventId: string, errorMessage: string): Promise<void> {
    const client = this.supabase.getClient();

    const { data: current, error: currentError } = await client
      .from('outbox_events')
      .select('status')
      .eq('id', eventId)
      .maybeSingle();

    if (currentError) {
      this.logger.error(`❌ Error leyendo estado del evento ${eventId}:`, currentError);
      throw new Error(`No se pudo leer estado del evento: ${currentError.message}`);
    }

    if (String(current?.status ?? '').toLowerCase() === 'completed') {
      this.logger.warn(`⚠️ Evento ${eventId} ya estaba completado; no se degrada a fallido`);
      return;
    }

    const { error } = await client.rpc('mark_outbox_event_failed', {
      p_event_id: eventId,
      p_error_message: errorMessage,
    });

    if (error) {
      this.logger.error(`❌ Error marcando evento ${eventId} como fallido:`, error);
      throw new Error(`No se pudo marcar evento como fallido: ${error.message}`);
    }

    this.logger.warn(`⚠️ Evento ${eventId} marcado como fallido: ${errorMessage}`);
  }
}
