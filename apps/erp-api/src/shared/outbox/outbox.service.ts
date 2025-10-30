import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

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
   */
  async persistEvent(
    tenantId: string,
    eventType: string,
    eventData: any,
    maxRetries: number = 5,
  ): Promise<string> {
    const client = this.supabase.getClient();

    // Adaptar a estructura existente: la tabla tiene columnas diferentes
    // Intentar insertar con tenant_id (si existe la columna) o sin él
    const insertData: any = {
      event_type: eventType,
      event_data: {
        ...eventData,
        tenantId, // Siempre en event_data para compatibilidad
      },
      status: 'PENDING',
      retry_count: 0,
    };

    // Solo agregar tenant_id si la columna existe (será agregada por migración)
    // Intentamos insertar tenant_id, si falla, lo omitimos y solo usamos event_data
    try {
      const { data: event, error } = await client
        .from('outbox_events')
        .insert({
          ...insertData,
          tenant_id: tenantId, // Intentar agregar tenant_id
          max_retries: maxRetries,
        } as any)
        .select('id')
        .single();

      if (error) {
        // Si falla por tenant_id, intentar sin él
        if (error.message?.includes('tenant_id')) {
          const { data: event2, error: error2 } = await client
            .from('outbox_events')
            .insert(insertData)
            .select('id')
            .single();

          if (error2) {
            this.logger.error(`❌ Error persistiendo evento ${eventType}:`, error2);
            throw new Error(`No se pudo persistir evento: ${error2.message}`);
          }

          this.logger.log(`✅ Evento ${eventType} persistido en outbox (ID: ${event2.id})`);
          return event2.id;
        }

        this.logger.error(`❌ Error persistiendo evento ${eventType}:`, error);
        throw new Error(`No se pudo persistir evento: ${error.message}`);
      }

      this.logger.log(`✅ Evento ${eventType} persistido en outbox (ID: ${event.id})`);
      return event.id;
    } catch (error) {
      this.logger.error(`❌ Error persistiendo evento ${eventType}:`, error);
      throw error;
    }
  }

  /**
   * Obtiene eventos pendientes para procesar
   */
  async getPendingEvents(limit: number = 100, tenantId?: string): Promise<any[]> {
    const client = this.supabase.getClient();

    const { data, error } = await client.rpc('get_pending_outbox_events', {
      p_limit: limit,
      p_tenant_id: tenantId || null,
    });

    if (error) {
      this.logger.error('❌ Error obteniendo eventos pendientes:', error);
      throw new Error(`No se pudieron obtener eventos pendientes: ${error.message}`);
    }

    return data || [];
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

    this.logger.log(`✅ Evento ${eventId} marcado como completado`);
  }

  /**
   * Marca un evento como fallido y programa reintento
   */
  async markEventFailed(eventId: string, errorMessage: string): Promise<void> {
    const client = this.supabase.getClient();

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
