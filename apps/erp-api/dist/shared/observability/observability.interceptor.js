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
exports.ObservabilityInterceptor = void 0;
const common_1 = require("@nestjs/common");
const operators_1 = require("rxjs/operators");
const logger_service_1 = require("./logger.service");
const metrics_service_1 = require("./metrics.service");
const tracing_service_1 = require("../tracing/tracing.service");
let ObservabilityInterceptor = class ObservabilityInterceptor {
    constructor(logger, metrics, tracing) {
        this.logger = logger;
        this.metrics = metrics;
        this.tracing = tracing;
    }
    intercept(context, next) {
        const request = context.switchToHttp().getRequest();
        const response = context.switchToHttp().getResponse();
        const startTime = Date.now();
        const method = request.method;
        const url = request.url;
        const userAgent = request.headers['user-agent'];
        const ip = request.ip;
        this.logger.info('HTTP Request iniciado', {
            method,
            url,
            userAgent,
            ip,
            headers: this.sanitizeHeaders(request.headers),
        }, {
            module: 'http',
            operation: `${method} ${url}`,
            tags: ['http', 'request', 'start'],
        });
        this.metrics.incrementCounter('http.requests.total', {
            method,
            endpoint: this.normalizeEndpoint(url),
        });
        return next.handle().pipe((0, operators_1.tap)((data) => {
            const duration = Date.now() - startTime;
            const statusCode = response.statusCode;
            this.logger.logHttpRequest(method, url, statusCode, duration, {
                responseSize: JSON.stringify(data || {}).length,
                userAgent,
                ip,
            });
            this.metrics.recordPerformance({
                operation: `http.${method}.${this.normalizeEndpoint(url)}`,
                duration,
                success: statusCode < 400,
                metadata: {
                    method,
                    url,
                    statusCode,
                    responseSize: JSON.stringify(data || {}).length,
                },
            });
            this.metrics.recordMetric({
                name: 'http.response.duration',
                value: duration,
                unit: 'ms',
                tags: {
                    method,
                    endpoint: this.normalizeEndpoint(url),
                    status: this.getStatusCategory(statusCode),
                },
            });
            this.metrics.incrementCounter('http.responses.total', {
                method,
                endpoint: this.normalizeEndpoint(url),
                status: statusCode.toString(),
                statusCategory: this.getStatusCategory(statusCode),
            });
        }), (0, operators_1.catchError)((error) => {
            const duration = Date.now() - startTime;
            const statusCode = response.statusCode || 500;
            this.logger.error(`HTTP Request falló: ${method} ${url}`, error, {
                method,
                url,
                statusCode,
                duration,
                userAgent,
                ip,
            }, {
                module: 'http',
                operation: `${method} ${url}`,
                duration,
                statusCode,
                tags: ['http', 'request', 'error'],
            });
            this.metrics.recordPerformance({
                operation: `http.${method}.${this.normalizeEndpoint(url)}`,
                duration,
                success: false,
                errorType: error.constructor.name,
                metadata: {
                    method,
                    url,
                    statusCode,
                    errorMessage: error.message,
                },
            });
            this.metrics.incrementCounter('http.errors.total', {
                method,
                endpoint: this.normalizeEndpoint(url),
                errorType: error.constructor.name,
                statusCode: statusCode.toString(),
            });
            throw error;
        }));
    }
    normalizeEndpoint(url) {
        return url
            .replace(/\/\d+/g, '/:id')
            .replace(/\/[a-f0-9-]{36}/g, '/:uuid')
            .replace(/\?.*$/, '')
            .toLowerCase();
    }
    getStatusCategory(statusCode) {
        if (statusCode < 200)
            return '1xx';
        if (statusCode < 300)
            return '2xx';
        if (statusCode < 400)
            return '3xx';
        if (statusCode < 500)
            return '4xx';
        return '5xx';
    }
    sanitizeHeaders(headers) {
        const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key', 'x-auth-token'];
        const sanitized = { ...headers };
        sensitiveHeaders.forEach(header => {
            if (sanitized[header]) {
                sanitized[header] = '[REDACTED]';
            }
        });
        return sanitized;
    }
};
exports.ObservabilityInterceptor = ObservabilityInterceptor;
exports.ObservabilityInterceptor = ObservabilityInterceptor = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [logger_service_1.LoggerService,
        metrics_service_1.MetricsService,
        tracing_service_1.TracingService])
], ObservabilityInterceptor);
//# sourceMappingURL=observability.interceptor.js.map