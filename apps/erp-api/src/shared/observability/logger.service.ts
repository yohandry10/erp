import { Injectable } from '@nestjs/common';
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

@Injectable()
export class LoggerService {
  private config: LoggerConfig = {
    level: 'info',
    enableConsole: true,
    enableFile: false,
    enableMetrics: true,
    format: 'json',
  };

  private logLevels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    fatal: 4,
  };

  constructor(
    private readonly tracingService: TracingService,
    private readonly metricsService: MetricsService
  ) {}

  /**
   * Configura el logger
   */
  configure(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Log genérico
   */
  log(
    level: LogLevel,
    message: string,
    metadata?: Record<string, any>,
    options?: {
      module?: string;
      operation?: string;
      duration?: number;
      statusCode?: number;
      error?: Error;
      tags?: string[];
    }
  ): void {
    // Verificar si el nivel está habilitado
    if (this.logLevels[level] < this.logLevels[this.config.level]) {
      return;
    }

    const context = this.tracingService.getCurrentContext();
    
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      correlationId: context?.correlationId,
      eventId: context?.eventId,
      parentEventId: context?.parentEventId,
      userId: context?.userId,
      sessionId: context?.sessionId,
      source: context?.source,
      module: options?.module,
      operation: options?.operation,
      duration: options?.duration,
      statusCode: options?.statusCode,
      metadata,
      tags: options?.tags,
    };

    // Agregar información de error si existe
    if (options?.error) {
      logEntry.error = {
        name: options.error.name,
        message: options.error.message,
        stack: options.error.stack,
        code: (options.error as any).code,
      };
    }

    // Enviar a diferentes destinos
    if (this.config.enableConsole) {
      this.logToConsole(logEntry);
    }

    if (this.config.enableFile) {
      this.logToFile(logEntry);
    }

    // Registrar métricas de logging
    if (this.config.enableMetrics) {
      this.metricsService.incrementCounter('logs.total', {
        level,
        module: options?.module || 'unknown',
        source: context?.source || 'unknown',
      });

      if (level === 'error' || level === 'fatal') {
        this.metricsService.incrementCounter('logs.errors', {
          level,
          module: options?.module || 'unknown',
          errorType: options?.error?.name || 'unknown',
        });
      }
    }
  }

  /**
   * Log de debug
   */
  debug(message: string, metadata?: Record<string, any>, options?: any): void {
    this.log('debug', message, metadata, options);
  }

  /**
   * Log de información
   */
  info(message: string, metadata?: Record<string, any>, options?: any): void {
    this.log('info', message, metadata, options);
  }

  /**
   * Log de advertencia
   */
  warn(message: string, metadata?: Record<string, any>, options?: any): void {
    this.log('warn', message, metadata, options);
  }

  /**
   * Log de error
   */
  error(message: string, error?: Error, metadata?: Record<string, any>, options?: any): void {
    this.log('error', message, metadata, { ...options, error });
  }

  /**
   * Log de error fatal
   */
  fatal(message: string, error?: Error, metadata?: Record<string, any>, options?: any): void {
    this.log('fatal', message, metadata, { ...options, error });
  }

  /**
   * Log de request HTTP
   */
  logHttpRequest(
    method: string,
    url: string,
    statusCode: number,
    duration: number,
    metadata?: Record<string, any>
  ): void {
    const level: LogLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
    
    this.log(
      level,
      `HTTP ${method} ${url}`,
      metadata,
      {
        module: 'http',
        operation: `${method} ${url}`,
        statusCode,
        duration,
        tags: ['http', 'request'],
      }
    );
  }

  /**
   * Log de operación de base de datos
   */
  logDatabaseOperation(
    operation: string,
    table: string,
    duration: number,
    success: boolean,
    metadata?: Record<string, any>
  ): void {
    const level: LogLevel = success ? 'debug' : 'error';
    
    this.log(
      level,
      `DB ${operation} on ${table}`,
      metadata,
      {
        module: 'database',
        operation: `${operation}.${table}`,
        duration,
        tags: ['database', operation],
      }
    );
  }

  /**
   * Log de evento de negocio
   */
  logBusinessEvent(
    eventType: string,
    aggregateType: string,
    aggregateId: string,
    metadata?: Record<string, any>
  ): void {
    this.log(
      'info',
      `Business event: ${eventType}`,
      metadata,
      {
        module: 'business',
        operation: eventType,
        tags: ['business', 'event', aggregateType],
      }
    );
  }

  /**
   * Envía log a consola
   */
  private logToConsole(logEntry: LogEntry): void {
    const colorMap: Record<LogLevel, string> = {
      debug: '\x1b[36m', // Cyan
      info: '\x1b[32m',  // Green
      warn: '\x1b[33m',  // Yellow
      error: '\x1b[31m', // Red
      fatal: '\x1b[35m', // Magenta
    };

    const resetColor = '\x1b[0m';
    const color = colorMap[logEntry.level];

    if (this.config.format === 'json') {
      console.log(`${color}[${logEntry.level.toUpperCase()}]${resetColor}`, JSON.stringify(logEntry, null, 2));
    } else {
      const timestamp = logEntry.timestamp;
      const correlationId = logEntry.correlationId ? ` [${logEntry.correlationId}]` : '';
      const module = logEntry.module ? ` [${logEntry.module}]` : '';
      
      console.log(
        `${color}${timestamp} [${logEntry.level.toUpperCase()}]${module}${correlationId} ${logEntry.message}${resetColor}`
      );
      
      if (logEntry.metadata && Object.keys(logEntry.metadata).length > 0) {
        console.log('  Metadata:', logEntry.metadata);
      }
      
      if (logEntry.error) {
        console.log('  Error:', logEntry.error);
      }
    }
  }

  /**
   * Envía log a archivo (placeholder)
   */
  private logToFile(logEntry: LogEntry): void {
    // Implementación de escritura a archivo
    // En producción, esto podría usar winston, pino, o similar
    // Por ahora, solo registramos que se enviaría a archivo
    this.metricsService.incrementCounter('logs.file_writes', {
      level: logEntry.level,
    });
  }
}