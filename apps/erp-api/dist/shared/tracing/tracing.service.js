"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TracingService = void 0;
const common_1 = require("@nestjs/common");
const uuid_1 = require("uuid");
const async_hooks_1 = require("async_hooks");
let TracingService = class TracingService {
    constructor() {
        this.asyncLocalStorage = new async_hooks_1.AsyncLocalStorage();
    }
    generateCorrelationId() {
        return `corr_${(0, uuid_1.v4)()}`;
    }
    generateEventId() {
        return `evt_${(0, uuid_1.v4)()}`;
    }
    createTraceContext(options) {
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
    async runWithContext(context, callback) {
        return this.asyncLocalStorage.run(context, callback);
    }
    getCurrentContext() {
        return this.asyncLocalStorage.getStore();
    }
    createChildEvent(options) {
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
    enrichEvent(event, source) {
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
    createTraceHeaders() {
        const context = this.getCurrentContext();
        if (!context)
            return {};
        return {
            'X-Correlation-ID': context.correlationId,
            'X-Event-ID': context.eventId,
            'X-Parent-Event-ID': context.parentEventId || '',
            'X-User-ID': context.userId || '',
            'X-Session-ID': context.sessionId || '',
            'X-Request-ID': context.requestId || '',
        };
    }
    extractTraceFromHeaders(headers) {
        const getHeader = (key) => {
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
    log(level, message, data) {
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
};
exports.TracingService = TracingService;
exports.TracingService = TracingService = __decorate([
    (0, common_1.Injectable)()
], TracingService);
//# sourceMappingURL=tracing.service.js.map