import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

export const CORRELATION_ID_HEADER = 'x-correlation-id';
export const CORRELATION_ID_KEY = 'correlationId';

/**
 * Middleware para gestionar Correlation IDs en todas las requests
 * 
 * Funcionalidad:
 * - Extrae correlation ID del header `x-correlation-id` si existe
 * - Genera uno nuevo si no viene en el request
 * - Almacena en request.correlationId para acceso en servicios
 * - Propaga en response header para trazabilidad
 * - Permite tracking de requests a través de múltiples servicios
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
    use(req: Request, res: Response, next: NextFunction) {
        // Extraer correlation ID del header o generar uno nuevo
        const correlationId =
            (req.headers[CORRELATION_ID_HEADER] as string) || uuidv4();

        // Almacenar en request para acceso en toda la aplicación
        (req as any)[CORRELATION_ID_KEY] = correlationId;

        // Propagar en response headers
        res.setHeader(CORRELATION_ID_HEADER, correlationId);

        next();
    }
}
