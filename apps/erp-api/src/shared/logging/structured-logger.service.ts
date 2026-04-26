import { Injectable, LoggerService, Scope } from '@nestjs/common';
import { Request } from 'express';
import { CORRELATION_ID_KEY } from '../middleware/correlation-id.middleware';

/**
 * Niveles de log estandarizados
 */
export enum LogLevel {
    DEBUG = 'debug',
    INFO = 'info',
    WARN = 'warn',
    ERROR = 'error',
}

/**
 * Contexto de log estructurado
 */
export interface LogContext {
    correlationId?: string;
    userId?: string;
    tenantId?: string;
    service?: string;
    method?: string;
    path?: string;
    [key: string]: any;
}

/**
 * Entrada de log estructurada
 */
interface LogEntry {
    timestamp: string;
    level: LogLevel;
    message: string;
    context: LogContext;
    stack?: string;
}

/**
 * Servicio de logging estructurado con soporte para correlation IDs
 * 
 * Mejoras vs. Logger básico de NestJS:
 * - Formato JSON estructurado para fácil parsing
 * - Correlation ID automático en todos los logs
 * - Contexto enriquecido (user, tenant, service, etc.)
 * - Integración con agregadores externos (CloudWatch, Datadog, etc.)
 * - Niveles de log apropiados y consistentes
 */
@Injectable({ scope: Scope.TRANSIENT })
export class StructuredLogger implements LoggerService {
    private context: LogContext = {};
    private serviceName?: string;

    setContext(context: LogContext) {
        this.context = { ...this.context, ...context };
    }

    setService(serviceName: string) {
        this.serviceName = serviceName;
        this.context.service = serviceName;
    }

    /**
     * Extrae correlation ID y contexto del request
     */
    setRequest(req: Request) {
        const correlationId = (req as any)[CORRELATION_ID_KEY];
        const userId = (req as any).user?.id;
        const tenantId = (req as any).user?.tenantId;

        this.setContext({
            correlationId,
            userId,
            tenantId,
            method: req.method,
            path: req.path,
        });
    }

    /**
     * Crea entrada de log estructurada
     */
    private createLogEntry(
        level: LogLevel,
        message: string,
        additionalContext?: any,
        stack?: string,
    ): LogEntry {
        return {
            timestamp: new Date().toISOString(),
            level,
            message,
            context: {
                ...this.context,
                ...additionalContext,
            },
            ...(stack && { stack }),
        };
    }

    /**
     * Escribe log en formato JSON
     */
    private writeLog(entry: LogEntry) {
        const output = JSON.stringify(entry);

        // En producción, esto puede ir a CloudWatch, Datadog, etc.
        // Por ahora, console.log con formato JSON para fácil parsing
        switch (entry.level) {
            case LogLevel.ERROR:
                console.error(output);
                break;
            case LogLevel.WARN:
                console.warn(output);
                break;
            case LogLevel.DEBUG:
                console.debug(output);
                break;
            default:
                console.log(output);
        }
    }

    /**
     * Métodos públicos de logging
     */
    log(message: string, context?: any) {
        const entry = this.createLogEntry(LogLevel.INFO, message, context);
        this.writeLog(entry);
    }

    error(message: string, trace?: string, context?: any) {
        const entry = this.createLogEntry(LogLevel.ERROR, message, context, trace);
        this.writeLog(entry);
    }

    warn(message: string, context?: any) {
        const entry = this.createLogEntry(LogLevel.WARN, message, context);
        this.writeLog(entry);
    }

    debug(message: string, context?: any) {
        const entry = this.createLogEntry(LogLevel.DEBUG, message, context);
        this.writeLog(entry);
    }

    verbose(message: string, context?: any) {
        // Verbose se mapea a DEBUG
        this.debug(message, context);
    }

    /**
     * Helper para logging de operaciones de negocio
     */
    logBusinessEvent(
        eventType: string,
        message: string,
        data?: any,
        level: LogLevel = LogLevel.INFO,
    ) {
        this.writeLog(
            this.createLogEntry(level, message, {
                eventType,
                data,
            }),
        );
    }

    /**
     * Helper para logging de operaciones de seguridad
     */
    logSecurityEvent(
        eventType: string,
        message: string,
        severity: 'low' | 'medium' | 'high' | 'critical',
        data?: any,
    ) {
        const level = severity === 'critical' || severity === 'high'
            ? LogLevel.ERROR
            : LogLevel.WARN;

        this.writeLog(
            this.createLogEntry(level, message, {
                eventType,
                severity,
                category: 'security',
                data,
            }),
        );
    }
}
