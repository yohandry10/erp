import { TracingService } from '../tracing/tracing.service';
import { MetricsService } from './metrics.service';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';
export interface LogEntry {
    timestamp: string;
    level: LogLevel;
    message: string;
    correlationId?: string;
    eventId?: string;
    parentEventId?: string;
    userId?: string;
    sessionId?: string;
    source?: string;
    module?: string;
    operation?: string;
    duration?: number;
    statusCode?: number;
    error?: {
        name: string;
        message: string;
        stack?: string;
        code?: string;
    };
    metadata?: Record<string, any>;
    tags?: string[];
}
export interface LoggerConfig {
    level: LogLevel;
    enableConsole: boolean;
    enableFile: boolean;
    enableMetrics: boolean;
    format: 'json' | 'text';
}
export declare class LoggerService {
    private readonly tracingService;
    private readonly metricsService;
    private config;
    private logLevels;
    constructor(tracingService: TracingService, metricsService: MetricsService);
    configure(config: Partial<LoggerConfig>): void;
    log(level: LogLevel, message: string, metadata?: Record<string, any>, options?: {
        module?: string;
        operation?: string;
        duration?: number;
        statusCode?: number;
        error?: Error;
        tags?: string[];
    }): void;
    debug(message: string, metadata?: Record<string, any>, options?: any): void;
    info(message: string, metadata?: Record<string, any>, options?: any): void;
    warn(message: string, metadata?: Record<string, any>, options?: any): void;
    error(message: string, error?: Error, metadata?: Record<string, any>, options?: any): void;
    fatal(message: string, error?: Error, metadata?: Record<string, any>, options?: any): void;
    logHttpRequest(method: string, url: string, statusCode: number, duration: number, metadata?: Record<string, any>): void;
    logDatabaseOperation(operation: string, table: string, duration: number, success: boolean, metadata?: Record<string, any>): void;
    logBusinessEvent(eventType: string, aggregateType: string, aggregateId: string, metadata?: Record<string, any>): void;
    private logToConsole;
    private logToFile;
}
