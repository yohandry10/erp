import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MetricsService } from '../../modules/metrics/metrics.service';

/**
 * Interceptor para registrar métricas HTTP automáticamente
 */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    
    const { method, url, user } = request;
    const tenantId = user?.tenant_id;
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = (Date.now() - startTime) / 1000;
          const statusCode = response.statusCode;
          
          this.metricsService.recordHttpRequest(method, url, statusCode, tenantId);
          this.metricsService.recordHttpDuration(method, url, statusCode, duration);
        },
        error: (error) => {
          const duration = (Date.now() - startTime) / 1000;
          const statusCode = error.status || 500;
          
          this.metricsService.recordHttpRequest(method, url, statusCode, tenantId);
          this.metricsService.recordHttpDuration(method, url, statusCode, duration);
          this.metricsService.recordHttpError(method, url, error.name || 'UnknownError');
        },
      }),
    );
  }
}
