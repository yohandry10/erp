import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { StructuredLogger } from '../logging/structured-logger.service';
import { CORRELATION_ID_KEY } from '../middleware/correlation-id.middleware';

/**
 * Interceptor para logging automático de requests/responses
 * 
 * Captura:
 * - Request entrante con método, path, correlation ID
 * - Tiempo de respuesta
 * - Status code
 * - Errores con stack trace
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
    constructor(private readonly logger: StructuredLogger) {
        this.logger.setService('HTTP');
    }

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const request = context.switchToHttp().getRequest();
        const { method, url, body } = request;
        const correlationId = request[CORRELATION_ID_KEY];
        const userId = request.user?.id;
        const tenantId = request.user?.tenantId;

        const startTime = Date.now();

        // Log request entrante
        this.logger.log('Incoming request', {
            correlationId,
            method,
            url,
            userId,
            tenantId,
            // No loguear body completo por seguridad (puede tener passwords)
            hasBody: !!body,
        });

        return next.handle().pipe(
            tap(() => {
                const response = context.switchToHttp().getResponse();
                const duration = Date.now() - startTime;

                // Log response exitosa
                this.logger.log('Request completed', {
                    correlationId,
                    method,
                    url,
                    statusCode: response.statusCode,
                    duration: `${duration}ms`,
                });
            }),
            catchError((error) => {
                const duration = Date.now() - startTime;

                // Log error con stack trace
                this.logger.error(
                    `Request failed: ${error.message}`,
                    error.stack,
                    {
                        correlationId,
                        method,
                        url,
                        statusCode: error.status || 500,
                        duration: `${duration}ms`,
                        errorName: error.name,
                    },
                );

                throw error;
            }),
        );
    }
}
