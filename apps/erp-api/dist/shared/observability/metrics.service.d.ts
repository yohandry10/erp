import { TracingService } from '../tracing/tracing.service';
export interface MetricData {
    name: string;
    value: number;
    unit: 'ms' | 'count' | 'bytes' | 'percentage' | 'rate';
    tags?: Record<string, string>;
    timestamp: Date;
}
export interface PerformanceMetric {
    operation: string;
    duration: number;
    success: boolean;
    errorType?: string;
    metadata?: Record<string, any>;
}
export interface BusinessMetric {
    metric: string;
    value: number;
    dimension?: string;
    aggregationType: 'sum' | 'avg' | 'count' | 'max' | 'min';
    metadata?: Record<string, any>;
}
export declare class MetricsService {
    private readonly tracingService;
    private metrics;
    private performanceMetrics;
    private businessMetrics;
    constructor(tracingService: TracingService);
    recordMetric(metric: Omit<MetricData, 'timestamp'>): void;
    recordPerformance(performance: PerformanceMetric): void;
    recordBusinessMetric(business: BusinessMetric): void;
    measureTime<T>(operation: string, fn: () => Promise<T> | T, metadata?: Record<string, any>): Promise<T>;
    incrementCounter(name: string, tags?: Record<string, string>): void;
    recordGauge(name: string, value: number, tags?: Record<string, string>): void;
    getMetricsStats(): Record<string, any>;
    getPerformanceStats(): Record<string, any>;
    getBusinessMetricsStats(): Record<string, any>;
    cleanupOldMetrics(olderThanHours?: number): void;
}
