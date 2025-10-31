import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { TenantContextService } from '../../shared/tenant/tenant-context.service';

/**
 * Interceptor que establece el contexto de tenant DESPUÉS de la autenticación
 * Se ejecuta después del JwtAuthGuard, por lo que req.user ya está disponible
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TenantContextInterceptor.name);

  constructor(private readonly tenantContext: TenantContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    const tenantId: string | null = user?.tenant_id ?? null;
    const userId: string | null = user?.id ?? null;
    const isSuperAdmin: boolean = user?.is_super_admin === true;

    // Propagar flag super admin en el request
    request.is_super_admin = isSuperAdmin;

    // Extraer token de Supabase si está disponible
    let supabaseAccessToken: string | null = null;
    const headerCandidates = ['x-supabase-access-token', 'supabase-access-token', 'sb-access-token'];
    for (const header of headerCandidates) {
      const raw = request.headers[header];
      if (typeof raw === 'string' && raw.trim().length > 0) {
        supabaseAccessToken = raw.trim();
        break;
      }
    }

    if (!supabaseAccessToken && typeof request.headers.authorization === 'string') {
      const [scheme, token] = request.headers.authorization.split(' ');
      if (scheme?.toLowerCase() === 'bearer' && token) {
        supabaseAccessToken = token;
      }
    }

    // Exponer tenant y usuario en el request para servicios
    if (tenantId) {
      request.tenant_id = tenantId;
      request.tenantId = tenantId;
      request.user_id = userId;
      this.logger.debug(
        `Tenant context set - Tenant: ${tenantId}, User: ${userId ?? 'unknown'}, Path: ${request.path}`,
      );
    }

    // Establecer contexto de tenant para AsyncLocalStorage
    const store = this.tenantContext.getContext();
    if (store) {
      // Si ya hay un store (del middleware), actualizarlo
      this.tenantContext.setContext({
        tenantId,
        userId,
        supabaseAccessToken,
        isSuperAdmin,
      });
      return next.handle();
    } else {
      // Si no hay store, crear uno nuevo
      return new Observable((subscriber) => {
        this.tenantContext.run(
          {
            tenantId,
            userId,
            supabaseAccessToken,
            isSuperAdmin,
          },
          () => {
            next.handle().subscribe(subscriber);
          },
        );
      });
    }
  }
}
