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
exports.MetricsService = void 0;
const common_1 = require("@nestjs/common");
const tracing_service_1 = require("../tracing/tracing.service");
let MetricsService = class MetricsService {
    constructor(tracingService) {
        this.tracingService = tracingService;
        this.metrics = new Map();
        this.performanceMetrics = [];
        this.businessMetrics = [];
    }
    recordMetric(metric) {
        const metricData = {
            ...metric,
            timestamp: new Date(),
        };
        const key = metric.name;
        if (!this.metrics.has(key)) {
            this.metrics.set(key, []);
        }
        this.metrics.get(key).push(metricData);
        const metricsList = this.metrics.get(key);
        if (metricsList.length > 1000) {
            metricsList.splice(0, metricsList.length - 1000);
        }
        this.tracingService.log('debug', 'Métrica registrada', {
            metric: metric.name,
            value: metric.value,
            unit: metric.unit,
            tags: metric.tags,
        });
    }
    recordPerformance(performance) {
        this.performanceMetrics.push(performance);
        if (this.performanceMetrics.length > 5000) {
            this.performanceMetrics.splice(0, this.performanceMetrics.length - 5000);
        }
        this.tracingService.log('info', 'Métrica de performance registrada', {
            operation: performance.operation,
            duration: `${performance.duration}ms`,
            success: performance.success,
            errorType: performance.errorType,
        });
    }
    recordBusinessMetric(business) {
        this.businessMetrics.push(business);
        if (this.businessMetrics.length > 10000) {
            this.businessMetrics.splice(0, this.businessMetrics.length - 10000);
        }
        this.tracingService.log('info', 'Métrica de negocio registrada', {
            metric: business.metric,
            value: business.value,
            dimension: business.dimension,
            aggregationType: business.aggregationType,
        });
    }
    async measureTime(operation, fn, metadata) {
        const startTime = Date.now();
        let success = true;
        let errorType;
        try {
            const result = await fn();
            return result;
        }
        catch (error) {
            success = false;
            errorType = error.constructor.name;
            throw error;
        }
        finally {
            const duration = Date.now() - startTime;
            this.recordPerformance({
                operation,
                duration,
                success,
                errorType,
                metadata,
            });
            this.recordMetric({
                name: `operation.${operation}.duration`,
                value: duration,
                unit: 'ms',
                tags: {
                    success: success.toString(),
                    errorType: errorType || 'none',
                },
            });
        }
    }
    incrementCounter(name, tags) {
        this.recordMetric({
            name,
            value: 1,
            unit: 'count',
            tags,
        });
    }
    recordGauge(name, value, tags) {
        this.recordMetric({
            name,
            value,
            unit: 'count',
            tags,
        });
    }
    getMetricsStats() {
        const stats = {};
        for (const [name, metrics] of this.metrics.entries()) {
            const values = metrics.map(m => m.value);
            stats[name] = {
                count: values.length,
                sum: values.reduce((a, b) => a + b, 0),
                avg: values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0,
                min: values.length > 0 ? Math.min(...values) : 0,
                max: values.length > 0 ? Math.max(...values) : 0,
                latest: metrics[metrics.length - 1],
            };
        }
        return stats;
    }
    getPerformanceStats() {
        const operationStats = {};
        for (const metric of this.performanceMetrics) {
            if (!operationStats[metric.operation]) {
                operationStats[metric.operation] = {
                    count: 0,
                    successCount: 0,
                    errorCount: 0,
                    totalDuration: 0,
                    minDuration: Infinity,
                    maxDuration: 0,
                    errors: {},
                };
            }
            const stats = operationStats[metric.operation];
            stats.count++;
            stats.totalDuration += metric.duration;
            stats.minDuration = Math.min(stats.minDuration, metric.duration);
            stats.maxDuration = Math.max(stats.maxDuration, metric.duration);
            if (metric.success) {
                stats.successCount++;
            }
            else {
                stats.errorCount++;
                if (metric.errorType) {
                    stats.errors[metric.errorType] = (stats.errors[metric.errorType] || 0) + 1;
                }
            }
        }
        for (const operation in operationStats) {
            const stats = operationStats[operation];
            stats.avgDuration = stats.totalDuration / stats.count;
            stats.successRate = (stats.successCount / stats.count) * 100;
            stats.errorRate = (stats.errorCount / stats.count) * 100;
        }
        return operationStats;
    }
    getBusinessMetricsStats() {
        const businessStats = {};
        for (const metric of this.businessMetrics) {
            const key = metric.dimension ? `${metric.metric}.${metric.dimension}` : metric.metric;
            if (!businessStats[key]) {
                businessStats[key] = {
                    count: 0,
                    sum: 0,
                    avg: 0,
                    min: Infinity,
                    max: -Infinity,
                    aggregationType: metric.aggregationType,
                };
            }
            const stats = businessStats[key];
            stats.count++;
            stats.sum += metric.value;
            stats.min = Math.min(stats.min, metric.value);
            stats.max = Math.max(stats.max, metric.value);
            stats.avg = stats.sum / stats.count;
        }
        return businessStats;
    }
    cleanupOldMetrics(olderThanHours = 24) {
        const cutoffTime = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
        for (const [name, metrics] of this.metrics.entries()) {
            const filteredMetrics = metrics.filter(m => m.timestamp > cutoffTime);
            this.metrics.set(name, filteredMetrics);
        }
        this.tracingService.log('info', 'Métricas antiguas limpiadas', {
            olderThanHours,
            cutoffTime: cutoffTime.toISOString(),
        });
    }
};
exports.MetricsService = MetricsService;
exports.MetricsService = MetricsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tracing_service_1.TracingService])
], MetricsService);
//# sourceMappingURL=metrics.service.js.map