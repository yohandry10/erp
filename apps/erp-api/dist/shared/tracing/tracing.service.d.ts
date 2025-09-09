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
export declare class TracingService {
    private asyncLocalStorage;
    generateCorrelationId(): string;
    generateEventId(): string;
    createTraceContext(options: {
        correlationId?: string;
        parentEventId?: string;
        userId?: string;
        sessionId?: string;
        requestId?: string;
        source: string;
        metadata?: Record<string, any>;
    }): TraceContext;
    runWithContext<T>(context: TraceContext, callback: () => Promise<T> | T): Promise<T>;
    getCurrentContext(): TraceContext | undefined;
    createChildEvent(options: {
        eventType: string;
        aggregateType?: string;
        aggregateId?: string;
        data: any;
        source: string;
        metadata?: Record<string, any>;
    }): TracedEvent;
    enrichEvent(event: any, source: string): TracedEvent;
    createTraceHeaders(): Record<string, string>;
    extractTraceFromHeaders(headers: Record<string, string | string[]>): Partial<TraceContext>;
    log(level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: any): void;
}
