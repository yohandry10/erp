import { NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { TracingService } from './tracing.service';
export declare class TracingInterceptor implements NestInterceptor {
    private readonly tracingService;
    constructor(tracingService: TracingService);
    intercept(context: ExecutionContext, next: CallHandler): Observable<any>;
}
