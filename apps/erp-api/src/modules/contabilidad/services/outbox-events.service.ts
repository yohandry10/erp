import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';

export interface OutboxEvent {
  id: string;
  event_id: string;
  correlation_id: string;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  event_data: any;
  event_version: number;
  created_at: string;
  processed_at: string | null;
  retry_count: number;
  status: string;
  error_message: string | null;
}

@Injectable()
export class OutboxEventsService {
  private readonly logger = new Logger(OutboxEventsService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Lee eventos pendientes de la tabla outbox_events
   * @param tenantId - ID del tenant (opcional, para filtrar por tenant si aplica)
   * @param limit - Límite de eventos a leer (default: 100)
   * @returns Lista de eventos pendientes ordenados por fecha de creación (created_at ASC)
   */
  async leerEventosPendientes(
    tenantId?: string,
    limit: number = 100
  ): Promise<OutboxEvent[]> {
    try {
      let query = this.supabaseService
        .getPublicClient()
        .from('outbox_events')
        .select('*')
        .is('processed_at', null)
        .order('created_at', { ascending: true })
        .limit(limit);

      // Si el tenant_id está en event_data, necesitamos filtrar después
      // Por ahora, leemos todos los eventos pendientes
      const { data, error } = await query;

      if (error) {
        this.logger.error(
          '❌ [OutboxEvents] Error leyendo eventos pendientes:',
          error
        );
        throw new Error(`Error leyendo eventos pendientes: ${error.message}`);
      }

      if (!data || data.length === 0) {
        this.logger.debug('ℹ️ [OutboxEvents] No hay eventos pendientes');
        return [];
      }

      this.logger.log(
        `✅ [OutboxEvents] ${data.length} eventos pendientes encontrados`
      );

      // Filtrar por tenant si se proporciona
      let eventos = data as OutboxEvent[];
      if (tenantId) {
        eventos = eventos.filter(evento => {
          const eventData = evento.event_data;
          return eventData && eventData.tenant_id === tenantId;
        });
        this.logger.log(
          `✅ [OutboxEvents] ${eventos.length} eventos para tenant ${tenantId}`
        );
      }

      return eventos;
    } catch (error) {
      this.logger.error(
        '❌ [OutboxEvents] Excepción leyendo eventos pendientes:',
        error
      );
      throw error;
    }
  }

  /**
   * Lee eventos pendientes con reintentos limitados
   * @param maxRetries - Número máximo de reintentos permitidos (default: 3)
   * @param limit - Límite de eventos a leer (default: 100)
   * @returns Lista de eventos pendientes que no han excedido el límite de reintentos
   */
  async leerEventosPendientesConReintentos(
    maxRetries: number = 3,
    limit: number = 100
  ): Promise<OutboxEvent[]> {
    try {
      const { data, error } = await this.supabaseService
        .getPublicClient()
        .from('outbox_events')
        .select('*')
        .is('processed_at', null)
        .or(`status.eq.pending,status.eq.failed`)
        .lt('retry_count', maxRetries)
        .order('created_at', { ascending: true })
        .limit(limit);

      if (error) {
        this.logger.error(
          '❌ [OutboxEvents] Error leyendo eventos con reintentos:',
          error
        );
        throw new Error(
          `Error leyendo eventos con reintentos: ${error.message}`
        );
      }

      if (!data || data.length === 0) {
        this.logger.debug(
          'ℹ️ [OutboxEvents] No hay eventos pendientes con reintentos disponibles'
        );
        return [];
      }

      this.logger.log(
        `✅ [OutboxEvents] ${data.length} eventos pendientes con reintentos encontrados`
      );

      return data as OutboxEvent[];
    } catch (error) {
      // Silenciar errores de tenant context - es normal cuando no hay eventos con tenant
      if (error.message === 'Tenant context required') {
        return [];
      }
      if (error.message !== 'Tenant context required') {
        this.logger.error(
          '❌ [OutboxEvents] Excepción leyendo eventos con reintentos:',
          error
        );
      }
      throw error;
    }
  }

  /**
   * Lee eventos pendientes por tipo de evento
   * @param eventType - Tipo de evento a filtrar
   * @param limit - Límite de eventos a leer (default: 100)
   * @returns Lista de eventos pendientes del tipo especificado
   */
  async leerEventosPendientesPorTipo(
    eventType: string,
    limit: number = 100
  ): Promise<OutboxEvent[]> {
    try {
      const { data, error } = await this.supabaseService
        .getPublicClient()
        .from('outbox_events')
        .select('*')
        .is('processed_at', null)
        .eq('event_type', eventType)
        .order('created_at', { ascending: true })
        .limit(limit);

      if (error) {
        this.logger.error(
          `❌ [OutboxEvents] Error leyendo eventos tipo ${eventType}:`,
          error
        );
        throw new Error(
          `Error leyendo eventos tipo ${eventType}: ${error.message}`
        );
      }

      if (!data || data.length === 0) {
        this.logger.debug(
          `ℹ️ [OutboxEvents] No hay eventos pendientes tipo ${eventType}`
        );
        return [];
      }

      this.logger.log(
        `✅ [OutboxEvents] ${data.length} eventos tipo ${eventType} encontrados`
      );

      return data as OutboxEvent[];
    } catch (error) {
      this.logger.error(
        `❌ [OutboxEvents] Excepción leyendo eventos tipo ${eventType}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Obtiene un evento específico por su event_id
   * @param eventId - ID del evento
   * @returns Evento encontrado o null
   */
  async obtenerEventoPorId(eventId: string): Promise<OutboxEvent | null> {
    try {
      const { data, error } = await this.supabaseService
        .getPublicClient()
        .from('outbox_events')
        .select('*')
        .eq('event_id', eventId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          this.logger.debug(
            `ℹ️ [OutboxEvents] Evento ${eventId} no encontrado`
          );
          return null;
        }
        this.logger.error(
          `❌ [OutboxEvents] Error obteniendo evento ${eventId}:`,
          error
        );
        throw new Error(`Error obteniendo evento ${eventId}: ${error.message}`);
      }

      return data as OutboxEvent;
    } catch (error) {
      this.logger.error(
        `❌ [OutboxEvents] Excepción obteniendo evento ${eventId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Cuenta el número de eventos pendientes
   * @param tenantId - ID del tenant (opcional)
   * @returns Número de eventos pendientes
   */
  async contarEventosPendientes(tenantId?: string): Promise<number> {
    try {
      const { count, error } = await this.supabaseService
        .getPublicClient()
        .from('outbox_events')
        .select('*', { count: 'exact', head: true })
        .is('processed_at', null);

      if (error) {
        this.logger.error(
          '❌ [OutboxEvents] Error contando eventos pendientes:',
          error
        );
        throw new Error(`Error contando eventos pendientes: ${error.message}`);
      }

      return count || 0;
    } catch (error) {
      this.logger.error(
        '❌ [OutboxEvents] Excepción contando eventos pendientes:',
        error
      );
      throw error;
    }
  }

  /**
   * Lee eventos fallidos que pueden ser reintentados
   * @param limit - Límite de eventos a leer (default: 100)
   * @returns Lista de eventos fallidos
   */
  async leerEventosFallidos(limit: number = 100): Promise<OutboxEvent[]> {
    try {
      const { data, error } = await this.supabaseService
        .getPublicClient()
        .from('outbox_events')
        .select('*')
        .eq('status', 'failed')
        .order('created_at', { ascending: true })
        .limit(limit);

      if (error) {
        this.logger.error(
          '❌ [OutboxEvents] Error leyendo eventos fallidos:',
          error
        );
        throw new Error(`Error leyendo eventos fallidos: ${error.message}`);
      }

      if (!data || data.length === 0) {
        this.logger.debug('ℹ️ [OutboxEvents] No hay eventos fallidos');
        return [];
      }

      this.logger.log(
        `✅ [OutboxEvents] ${data.length} eventos fallidos encontrados`
      );

      return data as OutboxEvent[];
    } catch (error) {
      this.logger.error(
        '❌ [OutboxEvents] Excepción leyendo eventos fallidos:',
        error
      );
      throw error;
    }
  }

  /**
   * Lee eventos en dead letter (fallidos permanentemente)
   * @param limit - Límite de eventos a leer (default: 100)
   * @returns Lista de eventos en dead letter
   */
  async leerEventosDeadLetter(limit: number = 100): Promise<OutboxEvent[]> {
    try {
      const { data, error } = await this.supabaseService
        .getPublicClient()
        .from('outbox_events')
        .select('*')
        .eq('status', 'dead_letter')
        .order('created_at', { ascending: true })
        .limit(limit);

      if (error) {
        this.logger.error(
          '❌ [OutboxEvents] Error leyendo eventos dead letter:',
          error
        );
        throw new Error(
          `Error leyendo eventos dead letter: ${error.message}`
        );
      }

      if (!data || data.length === 0) {
        this.logger.debug('ℹ️ [OutboxEvents] No hay eventos dead letter');
        return [];
      }

      this.logger.log(
        `✅ [OutboxEvents] ${data.length} eventos dead letter encontrados`
      );

      return data as OutboxEvent[];
    } catch (error) {
      this.logger.error(
        '❌ [OutboxEvents] Excepción leyendo eventos dead letter:',
        error
      );
      throw error;
    }
  }

  /**
   * Obtiene estadísticas de eventos por estado
   * @returns Estadísticas de eventos
   */
  async obtenerEstadisticasEventos(): Promise<{
    pending: number;
    processed: number;
    failed: number;
    dead_letter: number;
    processed_today: number;
    avg_processing_time_ms: number | null;
  }> {
    try {
      const { data, error } = await this.supabaseService
        .getPublicClient()
        .from('outbox_events')
        .select('status, processed_at, created_at');

      if (error) {
        this.logger.error(
          '❌ [OutboxEvents] Error obteniendo estadísticas:',
          error
        );
        throw new Error(`Error obteniendo estadísticas: ${error.message}`);
      }

      const stats = {
        pending: 0,
        processed: 0,
        failed: 0,
        dead_letter: 0,
        processed_today: 0,
        avg_processing_time_ms: null as number | null
      };

      // Get today's date at midnight (start of day)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayISO = today.toISOString();

      // Variables for calculating average processing time
      let totalProcessingTimeMs = 0;
      let processedCount = 0;

      if (data) {
        for (const evento of data) {
          if (evento.status === 'pending') {
            stats.pending++;
          } else if (evento.status === 'processed') {
            stats.processed++;
            
            // Check if processed today
            if (evento.processed_at && evento.processed_at >= todayISO) {
              stats.processed_today++;
            }

            // Calculate processing time
            if (evento.processed_at && evento.created_at) {
              const createdAt = new Date(evento.created_at).getTime();
              const processedAt = new Date(evento.processed_at).getTime();
              const processingTime = processedAt - createdAt;
              
              if (processingTime >= 0) {
                totalProcessingTimeMs += processingTime;
                processedCount++;
              }
            }
          } else if (evento.status === 'failed') {
            stats.failed++;
          } else if (evento.status === 'dead_letter') {
            stats.dead_letter++;
          }
        }
      }

      // Calculate average processing time
      if (processedCount > 0) {
        stats.avg_processing_time_ms = Math.round(totalProcessingTimeMs / processedCount);
      }

      this.logger.log(
        `📊 [OutboxEvents] Estadísticas: ${stats.pending} pendientes, ${stats.processed} procesados (${stats.processed_today} hoy), ${stats.failed} fallidos, ${stats.dead_letter} dead letter, tiempo promedio: ${stats.avg_processing_time_ms ? `${stats.avg_processing_time_ms}ms` : 'N/A'}`
      );

      return stats;
    } catch (error) {
      this.logger.error(
        '❌ [OutboxEvents] Excepción obteniendo estadísticas:',
        error
      );
      throw error;
    }
  }
}
