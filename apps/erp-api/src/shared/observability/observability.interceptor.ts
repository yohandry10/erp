import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Request, Response } from 'express';
import { LoggerService } from './logger.service';
import { MetricsService } from './metrics.service';
import { TracingService } from '../tracing/tracing.service';
import { redactSensitiveHeaders, redactSensitiveData } from '../utils/redact-sensitive';

@Injectable()
export class ObservabilityInterceptor implements NestInterceptor {
  constructor(
    private readonly logger: LoggerService,
    private readonly metrics: MetricsService,
    private readonly tracing: TracingService
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const startTime = Date.now();
    
    const method = request.method;
    const url = request.url;
    const userAgent = request.headers['user-agent'];
    const ip = request.ip;
    
    // Log de inicio de request
    this.logger.info('HTTP Request iniciado', {
      method,
      url,
      userAgent,
      ip,
      headers: redactSensitiveHeaders(request.headers as Record<string, any>),
    }, {
      module: 'http',
      operation: `${method} ${url}`,
      tags: ['http', 'request', 'start'],
    });

    // Incrementar contador de requests
    this.metrics.incrementCounter('http.requests.total', {
      method,
      endpoint: this.normalizeEndpoint(url),
    });

    return next.handle().pipe(
      tap((data) => {
        const duration = Date.now() - startTime;
        const statusCode = response.statusCode;
        
        // Log de request completado
        this.logger.logHttpRequest(method, url, statusCode, duration, redactSensitiveData({
          responseSize: JSON.stringify(data || {}).length,
          userAgent,
          ip,
        }));

        // Métricas de performance
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

        // Métricas de respuesta
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
      }),
      catchError((error) => {
        const duration = Date.now() - startTime;
        const statusCode = response.statusCode || 500;
        
        // Log de error
        this.logger.error(
          `HTTP Request falló: ${method} ${url}`,
          error,
          redactSensitiveData({
            method,
            url,
            statusCode,
            duration,
            userAgent,
            ip,
          }),
          {
            module: 'http',
            operation: `${method} ${url}`,
            duration,
            statusCode,
            tags: ['http', 'request', 'error'],
          }
        );

        // Métricas de error
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
      })
    );
  }

  /**
   * Normaliza endpoints para métricas (remueve IDs dinámicos)
   */
  private normalizeEndpoint(url: string): string {
    return url
      .replace(/\/\d+/g, '/:id')
      .replace(/\/[a-f0-9-]{36}/g, '/:uuid')
      .replace(/\?.*$/, '')
      .toLowerCase();
  }

  /**
   * Obtiene categoría de status code
   */
  private getStatusCategory(statusCode: number): string {
    if (statusCode < 200) return '1xx';
    if (statusCode < 300) return '2xx';
    if (statusCode < 400) return '3xx';
    if (statusCode < 500) return '4xx';
    return '5xx';
  }
}
