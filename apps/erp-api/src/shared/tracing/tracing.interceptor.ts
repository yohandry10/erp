import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { TracingService } from './tracing.service';
import { Request, Response } from 'express';

@Injectable()
export class TracingInterceptor implements NestInterceptor {
  constructor(private readonly tracingService: TracingService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    
    // Extraer información de trazabilidad de headers
    const traceInfo = this.tracingService.extractTraceFromHeaders(request.headers);
    
    // Crear contexto de trazabilidad
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

    // Agregar headers de trazabilidad a la respuesta
    const responseTraceHeaders = this.tracingService.createTraceHeaders();
    Object.entries(responseTraceHeaders).forEach(([key, value]) => {
      if (value) response.setHeader(key, value);
    });

    const startTime = Date.now();
    
    this.tracingService.log('info', `HTTP Request iniciado`, {
      method: request.method,
      url: request.url,
      correlationId: traceContext.correlationId,
      eventId: traceContext.eventId,
    });

    return next.handle().pipe(
      tap({
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
      })
    );
  }
}