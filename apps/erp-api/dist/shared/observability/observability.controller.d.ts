import { MetricsService } from './metrics.service';
import { LoggerService } from './logger.service';
import { TracingService } from '../tracing/tracing.service';
export declare class ObservabilityController {
    private readonly metricsService;
    private readonly loggerService;
    private readonly tracingService;
    constructor(metricsService: MetricsService, loggerService: LoggerService, tracingService: TracingService);
    getMetrics(): {
        timestamp: string;
        metrics: Record<string, any>;
        performance: Record<string, any>;
        business: Record<string, any>;
    };
    getHealth(): {
        status: string;
        timestamp: string;
        metrics: {
            overallSuccessRate: string;
            avgResponseTime: string;
            totalRequests: number;
        };
        traceInfo: {
            correlationId: string;
            eventId: string;
        };
    };
    getPerformanceMetrics(operation?: string): {
        operation: string;
        stats: any;
        timestamp: string;
        operations?: undefined;
    } | {
        timestamp: string;
        operations: Record<string, any>;
        operation?: undefined;
        stats?: undefined;
    };
    getBusinessMetrics(): {
        timestamp: string;
        metrics: Record<string, any>;
    };
    getCurrentTrace(): {
        timestamp: string;
        traceContext: import("../tracing/tracing.service").TraceContext;
        hasActiveTrace: boolean;
    };
    private calculateOverallSuccessRate;
    private calculateAvgResponseTime;
    private getTotalRequests;
}
