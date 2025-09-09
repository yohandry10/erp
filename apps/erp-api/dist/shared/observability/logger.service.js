"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoggerService = void 0;
const common_1 = require("@nestjs/common");
const tracing_service_1 = require("../tracing/tracing.service");
const metrics_service_1 = require("./metrics.service");
let LoggerService = class LoggerService {
    constructor(tracingService, metricsService) {
        this.tracingService = tracingService;
        this.metricsService = metricsService;
        this.config = {
            level: 'info',
            enableConsole: true,
            enableFile: false,
            enableMetrics: true,
            format: 'json',
        };
        this.logLevels = {
            debug: 0,
            info: 1,
            warn: 2,
            error: 3,
            fatal: 4,
        };
    }
    configure(config) {
        this.config = { ...this.config, ...config };
    }
    log(level, message, metadata, options) {
        if (this.logLevels[level] < this.logLevels[this.config.level]) {
            return;
        }
        const context = this.tracingService.getCurrentContext();
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
            module: options?.module,
            operation: options?.operation,
            duration: options?.duration,
            statusCode: options?.statusCode,
            metadata,
            tags: options?.tags,
        };
        if (options?.error) {
            logEntry.error = {
                name: options.error.name,
                message: options.error.message,
                stack: options.error.stack,
                code: options.error.code,
            };
        }
        if (this.config.enableConsole) {
            this.logToConsole(logEntry);
        }
        if (this.config.enableFile) {
            this.logToFile(logEntry);
        }
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
    debug(message, metadata, options) {
        this.log('debug', message, metadata, options);
    }
    info(message, metadata, options) {
        this.log('info', message, metadata, options);
    }
    warn(message, metadata, options) {
        this.log('warn', message, metadata, options);
    }
    error(message, error, metadata, options) {
        this.log('error', message, metadata, { ...options, error });
    }
    fatal(message, error, metadata, options) {
        this.log('fatal', message, metadata, { ...options, error });
    }
    logHttpRequest(method, url, statusCode, duration, metadata) {
        const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
        this.log(level, `HTTP ${method} ${url}`, metadata, {
            module: 'http',
            operation: `${method} ${url}`,
            statusCode,
            duration,
            tags: ['http', 'request'],
        });
    }
    logDatabaseOperation(operation, table, duration, success, metadata) {
        const level = success ? 'debug' : 'error';
        this.log(level, `DB ${operation} on ${table}`, metadata, {
            module: 'database',
            operation: `${operation}.${table}`,
            duration,
            tags: ['database', operation],
        });
    }
    logBusinessEvent(eventType, aggregateType, aggregateId, metadata) {
        this.log('info', `Business event: ${eventType}`, metadata, {
            module: 'business',
            operation: eventType,
            tags: ['business', 'event', aggregateType],
        });
    }
    logToConsole(logEntry) {
        const colorMap = {
            debug: '\x1b[36m',
            info: '\x1b[32m',
            warn: '\x1b[33m',
            error: '\x1b[31m',
            fatal: '\x1b[35m',
        };
        const resetColor = '\x1b[0m';
        const color = colorMap[logEntry.level];
        if (this.config.format === 'json') {
            console.log(`${color}[${logEntry.level.toUpperCase()}]${resetColor}`, JSON.stringify(logEntry, null, 2));
        }
        else {
            const timestamp = logEntry.timestamp;
            const correlationId = logEntry.correlationId ? ` [${logEntry.correlationId}]` : '';
            const module = logEntry.module ? ` [${logEntry.module}]` : '';
            console.log(`${color}${timestamp} [${logEntry.level.toUpperCase()}]${module}${correlationId} ${logEntry.message}${resetColor}`);
            if (logEntry.metadata && Object.keys(logEntry.metadata).length > 0) {
                console.log('  Metadata:', logEntry.metadata);
            }
            if (logEntry.error) {
                console.log('  Error:', logEntry.error);
            }
        }
    }
    logToFile(logEntry) {
        this.metricsService.incrementCounter('logs.file_writes', {
            level: logEntry.level,
        });
    }
};
exports.LoggerService = LoggerService;
exports.LoggerService = LoggerService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tracing_service_1.TracingService,
        metrics_service_1.MetricsService])
], LoggerService);
//# sourceMappingURL=logger.service.js.map