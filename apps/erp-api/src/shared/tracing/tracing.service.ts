import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { AsyncLocalStorage } from 'async_hooks';

export interface TraceContext {
  correlationId: string;
  eventId: string;
  parentEventId?: string;
  userId?: string;
  sessionId?: string;
  requestId?: string;
  timestamp: Date;
  source: string;
  metadata?: Record<string, any>;
}

export interface TracedEvent {
  eventId: string;
  correlationId: string;
  parentEventId?: string;
  eventType: string;
  aggregateType?: string;
  aggregateId?: string;
  data: any;
  timestamp: Date;
  source: string;
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class TracingService {
  private asyncLocalStorage = new AsyncLocalStorage<TraceContext>();

  /**
   * Genera un nuevo correlation ID único
   */
  generateCorrelationId(): string {
    return `corr_${uuidv4()}`;
  }

  /**
   * Genera un nuevo event ID único
   */
  generateEventId(): string {
    return `evt_${uuidv4()}`;
  }

  /**
   * Crea un nuevo contexto de trazabilidad
   */
  createTraceContext(options: {
    correlationId?: string;
    parentEventId?: string;
    userId?: string;
    sessionId?: string;
    requestId?: string;
    source: string;
    metadata?: Record<string, any>;
  }): TraceContext {
    return {
      correlationId: options.correlationId || this.generateCorrelationId(),
      eventId: this.generateEventId(),
      parentEventId: options.parentEventId,
      userId: options.userId,
      sessionId: options.sessionId,
      requestId: options.requestId,
      timestamp: new Date(),
      source: options.source,
      metadata: options.metadata,
    };
  }

  /**
   * Ejecuta código dentro de un contexto de trazabilidad
   */
  async runWithContext<T>(
    context: TraceContext,
    callback: () => Promise<T> | T
  ): Promise<T> {
    return this.asyncLocalStorage.run(context, callback);
  }

  /**
   * Obtiene el contexto actual de trazabilidad
   */
  getCurrentContext(): TraceContext | undefined {
    return this.asyncLocalStorage.getStore();
  }

  /**
   * Crea un evento hijo con el contexto actual
   */
  createChildEvent(options: {
    eventType: string;
    aggregateType?: string;
    aggregateId?: string;
    data: any;
    source: string;
    metadata?: Record<string, any>;
  }): TracedEvent {
    const currentContext = this.getCurrentContext();
    
    return {
      eventId: this.generateEventId(),
      correlationId: currentContext?.correlationId || this.generateCorrelationId(),
      parentEventId: currentContext?.eventId,
      eventType: options.eventType,
      aggregateType: options.aggregateType,
      aggregateId: options.aggregateId,
      data: options.data,
      timestamp: new Date(),
      source: options.source,
      userId: currentContext?.userId,
      sessionId: currentContext?.sessionId,
      metadata: {
        ...currentContext?.metadata,
        ...options.metadata,
      },
    };
  }

  /**
   * Enriquece un evento con información de trazabilidad
   */
  enrichEvent(event: any, source: string): TracedEvent {
    const currentContext = this.getCurrentContext();
    
    return {
      ...event,
      eventId: event.eventId || this.generateEventId(),
      correlationId: event.correlationId || currentContext?.correlationId || this.generateCorrelationId(),
      parentEventId: event.parentEventId || currentContext?.eventId,
      timestamp: event.timestamp || new Date(),
      source: event.source || source,
      userId: event.userId || currentContext?.userId,
      sessionId: event.sessionId || currentContext?.sessionId,
      metadata: {
        ...currentContext?.metadata,
        ...event.metadata,
      },
    };
  }

  /**
   * Crea headers HTTP con información de trazabilidad
   */
  createTraceHeaders(): Record<string, string> {
    const context = this.getCurrentContext();
    if (!context) return {};

    return {
      'X-Correlation-ID': context.correlationId,
      'X-Event-ID': context.eventId,
      'X-Parent-Event-ID': context.parentEventId || '',
      'X-User-ID': context.userId || '',
      'X-Session-ID': context.sessionId || '',
      'X-Request-ID': context.requestId || '',
    };
  }

  /**
   * Extrae contexto de trazabilidad desde headers HTTP
   */
  extractTraceFromHeaders(headers: Record<string, string | string[]>): Partial<TraceContext> {
    const getHeader = (key: string): string | undefined => {
      const value = headers[key] || headers[key.toLowerCase()];
      return Array.isArray(value) ? value[0] : value;
    };

    return {
      correlationId: getHeader('X-Correlation-ID'),
      parentEventId: getHeader('X-Parent-Event-ID'),
      userId: getHeader('X-User-ID'),
      sessionId: getHeader('X-Session-ID'),
      requestId: getHeader('X-Request-ID'),
    };
  }

  /**
   * Logs estructurados con contexto de trazabilidad
   */
  log(level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: any) {
    const context = this.getCurrentContext();
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      correlationId: context?.correlationId,
      eventId: context?.eventId,
      parentEventId: context?.parentEventId,
      userId: context?.userId,
      sessionId: context?.sessionId,
      source: context?.source,
      data,
    };

    console.log(`[${level.toUpperCase()}]`, JSON.stringify(logEntry, null, 2));
  }
}