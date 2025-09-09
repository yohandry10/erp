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
exports.TracingInterceptor = void 0;
const common_1 = require("@nestjs/common");
const operators_1 = require("rxjs/operators");
const tracing_service_1 = require("./tracing.service");
let TracingInterceptor = class TracingInterceptor {
    constructor(tracingService) {
        this.tracingService = tracingService;
    }
    intercept(context, next) {
        const request = context.switchToHttp().getRequest();
        const response = context.switchToHttp().getResponse();
        const traceInfo = this.tracingService.extractTraceFromHeaders(request.headers);
        const traceContext = this.tracingService.createTraceContext({
            correlationId: traceInfo.correlationId,
            parentEventId: traceInfo.parentEventId,
            userId: traceInfo.userId,
            sessionId: traceInfo.sessionId,
            requestId: traceInfo.requestId || `req_${Date.now()}`,
            source: 'http-api',
            metadata: {
                method: request.method,
                url: request.url,
                userAgent: request.headers['user-agent'],
                ip: request.ip,
            },
        });
        const responseTraceHeaders = this.tracingService.createTraceHeaders();
        Object.entries(responseTraceHeaders).forEach(([key, value]) => {
            if (value)
                response.setHeader(key, value);
        });
        const startTime = Date.now();
        this.tracingService.log('info', `HTTP Request iniciado`, {
            method: request.method,
            url: request.url,
            correlationId: traceContext.correlationId,
            eventId: traceContext.eventId,
        });
        return next.handle().pipe((0, operators_1.tap)({
            next: (data) => {
                const duration = Date.now() - startTime;
                this.tracingService.log('info', `HTTP Request completado`, {
                    method: request.method,
                    url: request.url,
                    statusCode: response.statusCode,
                    duration: `${duration}ms`,
                    correlationId: traceContext.correlationId,
                    eventId: traceContext.eventId,
                });
            },
            error: (error) => {
                const duration = Date.now() - startTime;
                this.tracingService.log('error', `HTTP Request falló`, {
                    method: request.method,
                    url: request.url,
                    statusCode: response.statusCode,
                    duration: `${duration}ms`,
                    error: error.message,
                    correlationId: traceContext.correlationId,
                    eventId: traceContext.eventId,
                });
            },
        }));
    }
};
exports.TracingInterceptor = TracingInterceptor;
exports.TracingInterceptor = TracingInterceptor = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tracing_service_1.TracingService])
], TracingInterceptor);
//# sourceMappingURL=tracing.interceptor.js.map