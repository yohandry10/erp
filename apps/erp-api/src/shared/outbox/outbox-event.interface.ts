import { v4 as uuidv4 } from 'uuid';

/**
 * Interfaz estándar para insertar eventos en la tabla outbox_events
 * Garantiza consistencia en toda la aplicación
 */
export interface OutboxEventInsert {
  /** UUID único del evento - obligatorio para trazabilidad */
  event_id: string;

  /** ID del tenant - obligatorio para multi-tenancy */
  tenant_id: string;
  
  /** Tipo de agregado (entidad de dominio): venta, cobro, recepcion, etc. */
  aggregate_type: string;
  
  /** ID del agregado (ID de la entidad específica) */
  aggregate_id: string;
  
  /** Tipo de evento en formato snake_case: venta.procesada, cobro.registrado, etc. */
  event_type: string;
  
  /** Payload del evento con todos los datos necesarios */
  payload: Record<string, any>;

  /** Estado inicial del evento - siempre 'pending' al crear */
  status: 'pending';
  
  /** Contador de reintentos - siempre 0 al crear */
  retry_count: number;
  
  /** Llave de idempotencia por tenant (dedupe de reintentos upstream) */
  idempotency_key?: string;
  
  /** Timestamp de creación en formato ISO */
  created_at: string;
}

/**
 * Opciones para crear un evento en outbox
 */
export interface CreateOutboxEventOptions {
  tenantId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  eventData: Record<string, any>;
  eventId?: string;
  correlationId?: string;
  idempotencyKey?: string;
  eventVersion?: number;
  maxRetries?: number;
}

/**
 * Builder para crear eventos de outbox con estructura consistente
 */
export class OutboxEventBuilder {
  /**
   * Crea un evento de outbox con todos los campos requeridos
   */
  static build(options: CreateOutboxEventOptions): OutboxEventInsert {
    const {
      tenantId,
      eventType,
      aggregateType,
      aggregateId,
      eventData,
      eventId = uuidv4(),
    } = options;

    // Validaciones
    if (!tenantId) {
      throw new Error('tenantId es requerido para crear un evento de outbox');
    }
    if (!eventType) {
      throw new Error('eventType es requerido para crear un evento de outbox');
    }
    if (!aggregateType) {
      throw new Error('aggregateType es requerido para crear un evento de outbox');
    }
    if (!aggregateId) {
      throw new Error('aggregateId es requerido para crear un evento de outbox');
    }

    // Asegurar que tenantId esté en payload para compatibilidad con listeners.
    const enrichedPayload = {
      ...eventData,
      tenantId,
      tenant_id: tenantId,
    };

    return {
      event_id: eventId,
      tenant_id: tenantId,
      aggregate_type: aggregateType,
      aggregate_id: aggregateId,
      event_type: eventType,
      payload: enrichedPayload,
      status: 'pending',
      retry_count: 0,
      idempotency_key: options.idempotencyKey,
      created_at: new Date().toISOString(),
    };
  }
}
