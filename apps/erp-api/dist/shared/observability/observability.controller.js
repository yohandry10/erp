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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ObservabilityController = void 0;
const common_1 = require("@nestjs/common");
const metrics_service_1 = require("./metrics.service");
const logger_service_1 = require("./logger.service");
const tracing_service_1 = require("../tracing/tracing.service");
let ObservabilityController = class ObservabilityController {
    constructor(metricsService, loggerService, tracingService) {
        this.metricsService = metricsService;
        this.loggerService = loggerService;
        this.tracingService = tracingService;
    }
    getMetrics() {
        return {
            timestamp: new Date().toISOString(),
            metrics: this.metricsService.getMetricsStats(),
            performance: this.metricsService.getPerformanceStats(),
            business: this.metricsService.getBusinessMetricsStats(),
        };
    }
    getHealth() {
        const performanceStats = this.metricsService.getPerformanceStats();
        const overallSuccessRate = this.calculateOverallSuccessRate(performanceStats);
        const avgResponseTime = this.calculateAvgResponseTime(performanceStats);
        return {
            status: overallSuccessRate > 95 && avgResponseTime < 1000 ? 'healthy' : 'degraded',
            timestamp: new Date().toISOString(),
            metrics: {
                overallSuccessRate: `${overallSuccessRate.toFixed(2)}%`,
                avgResponseTime: `${avgResponseTime.toFixed(2)}ms`,
                totalRequests: this.getTotalRequests(performanceStats),
            },
            traceInfo: {
                correlationId: this.tracingService.getCurrentContext()?.correlationId,
                eventId: this.tracingService.getCurrentContext()?.eventId,
            },
        };
    }
    getPerformanceMetrics(operation) {
        const stats = this.metricsService.getPerformanceStats();
        if (operation) {
            return {
                operation,
                stats: stats[operation] || null,
                timestamp: new Date().toISOString(),
            };
        }
        return {
            timestamp: new Date().toISOString(),
            operations: stats,
        };
    }
    getBusinessMetrics() {
        return {
            timestamp: new Date().toISOString(),
            metrics: this.metricsService.getBusinessMetricsStats(),
        };
    }
    getCurrentTrace() {
        const context = this.tracingService.getCurrentContext();
        return {
            timestamp: new Date().toISOString(),
            traceContext: context,
            hasActiveTrace: !!context,
        };
    }
    calculateOverallSuccessRate(stats) {
        let totalRequests = 0;
        let totalSuccessful = 0;
        Object.values(stats).forEach((operationStats) => {
            totalRequests += operationStats.count;
            totalSuccessful += operationStats.successCount;
        });
        return totalRequests > 0 ? (totalSuccessful / totalRequests) * 100 : 100;
    }
    calculateAvgResponseTime(stats) {
        let totalDuration = 0;
        let totalRequests = 0;
        Object.values(stats).forEach((operationStats) => {
            totalDuration += operationStats.totalDuration;
            totalRequests += operationStats.count;
        });
        return totalRequests > 0 ? totalDuration / totalRequests : 0;
    }
    getTotalRequests(stats) {
        return Object.values(stats).reduce((total, operationStats) => {
            return total + operationStats.count;
        }, 0);
    }
};
exports.ObservabilityController = ObservabilityController;
__decorate([
    (0, common_1.Get)('metrics'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ObservabilityController.prototype, "getMetrics", null);
__decorate([
    (0, common_1.Get)('health'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ObservabilityController.prototype, "getHealth", null);
__decorate([
    (0, common_1.Get)('performance'),
    __param(0, (0, common_1.Query)('operation')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ObservabilityController.prototype, "getPerformanceMetrics", null);
__decorate([
    (0, common_1.Get)('business'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ObservabilityController.prototype, "getBusinessMetrics", null);
__decorate([
    (0, common_1.Get)('trace'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ObservabilityController.prototype, "getCurrentTrace", null);
exports.ObservabilityController = ObservabilityController = __decorate([
    (0, common_1.Controller)('observability'),
    __metadata("design:paramtypes", [metrics_service_1.MetricsService,
        logger_service_1.LoggerService,
        tracing_service_1.TracingService])
], ObservabilityController);
//# sourceMappingURL=observability.controller.js.map