import { EventEmitter2 } from '@nestjs/event-emitter';
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
export declare class EnhancedEventBusService {
    private readonly eventEmitter;
    private readonly logger;
    constructor(eventEmitter: EventEmitter2);
    emit(eventType: string, data: any, options: {
        aggregateId: string;
        aggregateType: string;
        module: string;
        priority?: 'low' | 'medium' | 'high';
        metadata?: Record<string, any>;
        correlationId?: string;
        causationId?: string;
    }): Promise<void>;
    on(eventType: string, listener: (event: EnhancedERPEvent) => Promise<void> | void): void;
    emitVentaProcessed(data: any, options?: {
        aggregateId?: string;
        metadata?: Record<string, any>;
    }): Promise<void>;
    emitComprobanteCreadoEvent(data: any, options?: {
        metadata?: Record<string, any>;
    }): Promise<void>;
    emitMovimientoStock(data: any, options?: {
        metadata?: Record<string, any>;
    }): Promise<void>;
    emitPlanillaCalculada(data: any, options?: {
        metadata?: Record<string, any>;
    }): Promise<void>;
    onVentaProcessed(listener: (event: EnhancedERPEvent) => Promise<void> | void): void;
    onComprobanteCreadoEvent(listener: (event: EnhancedERPEvent) => Promise<void> | void): void;
    onMovimientoStock(listener: (event: EnhancedERPEvent) => Promise<void> | void): void;
    onPlanillaCalculada(listener: (event: EnhancedERPEvent) => Promise<void> | void): void;
    getEventStats(): Record<string, number>;
}
