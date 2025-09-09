import { NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { LoggerService } from './logger.service';
import { MetricsService } from './metrics.service';
import { TracingService } from '../tracing/tracing.service';
export declare class ObservabilityInterceptor implements NestInterceptor {
    private readonly logger;
    private readonly metrics;
    private readonly tracing;
    constructor(logger: LoggerService, metrics: MetricsService, tracing: TracingService);
    intercept(context: ExecutionContext, next: CallHandler): Observable<any>;
    private normalizeEndpoint;
    private getStatusCategory;
    private sanitizeHeaders;
}
