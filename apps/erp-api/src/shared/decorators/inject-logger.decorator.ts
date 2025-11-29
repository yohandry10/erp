import { Inject } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger.service';

/**
 * Decorator para inyectar StructuredLogger en servicios
 * 
 * Uso:
 * ```typescript
 * @Injectable()
 * export class MyService {
 *   constructor(@InjectLogger() private readonly logger: StructuredLogger) {
 *     this.logger.setService('MyService');
 *   }
 * }
 * ```
 */
export const InjectLogger = () => Inject(StructuredLogger);
