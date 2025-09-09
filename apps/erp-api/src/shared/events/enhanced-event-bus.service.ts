import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { v4 as uuidv4 } from 'uuid';

export interface EnhancedERPEvent {
  eventId: string;
  eventType: string;
  aggregateId: string;
  aggregateType: string;
  data: any;
  metadata: Record<string, any>;
  timestamp: Date;
  version: number;
  correlationId?: string;
  causationId?: string;
  module: string;
  priority: 'low' | 'medium' | 'high';
  source: string;
}

@Injectable()
export class EnhancedEventBusService {
  private readonly logger = new Logger(EnhancedEventBusService.name);

  constructor(private readonly eventEmitter: EventEmitter2) {}

  async emit(
    eventType: string,
    data: any,
    options: {
      aggregateId: string;
      aggregateType: string;
      module: string;
      priority?: 'low' | 'medium' | 'high';
      metadata?: Record<string, any>;
      correlationId?: string;
      causationId?: string;
    },
  ): Promise<void> {
    const event: EnhancedERPEvent = {
      eventId: uuidv4(),
      eventType,
      aggregateId: options.aggregateId,
      aggregateType: options.aggregateType,
      data,
      metadata: options.metadata || {},
      timestamp: new Date(),
      version: 1,
      correlationId: options.correlationId,
      causationId: options.causationId,
      module: options.module,
      priority: options.priority || 'medium',
      source: 'enhanced-event-bus',
    };

    try {
      this.logger.debug(`Emitting event: ${eventType}`, {
        eventId: event.eventId,
        aggregateId: event.aggregateId,
        module: event.module,
      });

      this.eventEmitter.emit(eventType, event);
    } catch (error) {
      this.logger.error(`Error emitting event ${eventType}:`, error);
      throw error;
    }
  }

  on(eventType: string, listener: (event: EnhancedERPEvent) => Promise<void> | void): void {
    this.eventEmitter.on(eventType, async (event: EnhancedERPEvent) => {
      try {
        this.logger.debug(`Processing event: ${eventType}`, {
          eventId: event.eventId,
          correlationId: event.correlationId,
          source: event.source,
        });
        await listener(event);
      } catch (error) {
        this.logger.error(`Error processing event ${eventType}:`, error);
      }
    });
  }

  // ========== MÉTODOS DE EMISIÓN ESPECÍFICOS ==========

  async emitVentaProcessed(data: any, options?: { aggregateId?: string; metadata?: Record<string, any> }) {
    await this.emit('venta.procesada', data, {
      module: 'pos',
      aggregateType: 'venta',
      aggregateId: options?.aggregateId || data.ventaId,
      priority: 'high',
      metadata: options?.metadata,
    });
  }

  async emitComprobanteCreadoEvent(data: any, options?: { metadata?: Record<string, any> }) {
    await this.emit('comprobante.creado', data, {
      module: 'cpe',
      aggregateType: 'comprobante',
      aggregateId: data.cpeId,
      priority: 'high',
      metadata: options?.metadata,
    });
  }

  async emitMovimientoStock(data: any, options?: { metadata?: Record<string, any> }) {
    await this.emit('stock.movimiento', data, {
      module: 'inventario',
      aggregateType: 'producto',
      aggregateId: data.productoId,
      priority: 'medium',
      metadata: options?.metadata,
    });
  }

  async emitPlanillaCalculada(data: any, options?: { metadata?: Record<string, any> }) {
    await this.emit('planilla.calculada', data, {
      module: 'rrhh',
      aggregateType: 'planilla',
      aggregateId: data.planillaId,
      priority: 'high',
      metadata: options?.metadata,
    });
  }

  // ========== LISTENERS TIPADOS ==========

  onVentaProcessed(listener: (event: EnhancedERPEvent) => Promise<void> | void) {
    this.on('venta.procesada', listener);
  }

  onComprobanteCreadoEvent(listener: (event: EnhancedERPEvent) => Promise<void> | void) {
    this.on('comprobante.creado', listener);
  }

  onMovimientoStock(listener: (event: EnhancedERPEvent) => Promise<void> | void) {
    this.on('stock.movimiento', listener);
  }

  onPlanillaCalculada(listener: (event: EnhancedERPEvent) => Promise<void> | void) {
    this.on('planilla.calculada', listener);
  }

  // ========== UTILIDADES ==========

  getEventStats(): Record<string, number> {
    const eventNames = this.eventEmitter.eventNames();
    const stats: Record<string, number> = {};
    
    for (const eventName of eventNames) {
      stats[eventName.toString()] = this.eventEmitter.listenerCount(eventName);
    }
    
    return stats;
  }
}