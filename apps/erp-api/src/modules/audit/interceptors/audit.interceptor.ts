import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { mergeMap, catchError } from 'rxjs/operators';
import { AuditService } from '../audit.service';
import { Reflector } from '@nestjs/core';

/**
 * Metadata key for audit configuration
 */
export const AUDIT_METADATA_KEY = 'audit';

/**
 * Configuration for audit decorator
 */
export interface AuditConfig {
  entity: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  recordIdParam?: string; // Name of the parameter containing the record ID
  includeBody?: boolean; // Whether to include request body as new_values
  includeResult?: boolean; // Whether to include response as new_values
}

/**
 * Decorator to mark methods for automatic auditing
 * 
 * @example
 * @Audit({ entity: 'pedidos_venta', action: 'UPDATE', recordIdParam: 'id' })
 * async updatePedido(@Param('id') id: string, @Body() dto: UpdatePedidoDto) {
 *   // ...
 * }
 */
export const Audit = (config: AuditConfig) => {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    Reflect.defineMetadata(AUDIT_METADATA_KEY, config, descriptor.value);
    return descriptor;
  };
};

/**
 * Interceptor that automatically audits method calls marked with @Audit decorator
 * Requirements: 27.1, 27.2
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly auditService: AuditService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const handler = context.getHandler();
    const auditConfig = this.reflector.get<AuditConfig>(
      AUDIT_METADATA_KEY,
      handler,
    );

    // If no audit configuration, skip auditing
    if (!auditConfig) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id;
    const tenantId = request.user?.tenant_id;

    // Extract record ID from params if specified
    let recordId: string | undefined;
    if (auditConfig.recordIdParam) {
      recordId = request.params[auditConfig.recordIdParam];
    }

    // Prepare audit data
    const auditData: any = {
      entity: auditConfig.entity,
      action: auditConfig.action,
      usuario: userId,
      tenantId,
      recordId,
      metadata: {
        method: request.method,
        url: request.url?.split('?')[0],
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      },
    };

    // Include request body if configured
    if (auditConfig.includeBody && request.body) {
      auditData.cambios = {
        new: request.body,
      };
    }

    return next.handle().pipe(
      mergeMap(async (result) => {
          // Include result if configured
          if (auditConfig.includeResult && result) {
            if (!auditData.cambios) {
              auditData.cambios = {};
            }
            auditData.cambios.new = result;
            
            // Extract record ID from result if not already set
            if (!recordId && (result?.id || result?.data?.id)) {
              auditData.recordId = result.id || result.data.id;
            }
          }

          // Log the audit entry
          if (tenantId && userId) {
            await this.auditService.registrarCambio(
              auditData.entity,
              auditData.action,
              auditData.usuario,
              auditData.cambios || {},
              auditData.tenantId,
              auditData.recordId,
              auditData.metadata,
            ).catch(() => {
              // Log error but don't throw to avoid breaking the main operation
              console.error('AUDIT_WRITE_FAILURE: interceptor de respuesta');
            });
          }
          return result;
      }),
      catchError(async (error) => {
          // Log failed operations as well
          if (tenantId && userId) {
            await this.auditService.registrarCambio(
              auditData.entity,
              auditData.action,
              auditData.usuario,
              auditData.cambios || {},
              auditData.tenantId,
              auditData.recordId,
              {
                ...auditData.metadata,
                error: error.message,
                status: 'FAILED',
              },
            ).catch(() => {
              console.error('AUDIT_WRITE_FAILURE: interceptor de error');
            });
          }
          throw error;
      }),
    );
  }
}
