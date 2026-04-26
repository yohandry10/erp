import { Module, Global } from '@nestjs/common';
import { StructuredLogger } from './logging/structured-logger.service';
import { LoggingInterceptor } from './interceptors/logging.interceptor';

/**
 * Módulo global para servicios compartidos
 * 
 * Incluye:
 * - StructuredLogger: Logging estructurado con correlation IDs
 * - LoggingInterceptor: Logging automático de HTTP requests
 */
@Global()
@Module({
    providers: [
        StructuredLogger,
        LoggingInterceptor,
    ],
    exports: [
        StructuredLogger,
        LoggingInterceptor,
    ],
})
export class SharedModule { }
