import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { TenantContextService } from '../../shared/tenant/tenant-context.service';

/**
 * ✅ MULTI-TENANT: Middleware que configura el contexto de tenant en cada request
 * 
 * Este middleware:
 * 1. Extrae el tenant_id y user_id del usuario autenticado (JWT)
 * 2. Configura app.current_tenant_id en Supabase para RLS
 * 3. Configura app.current_user_id en Supabase para RLS
 * 4. Agrega tenant_id al request para fácil acceso
 * 5. Maneja errores gracefully sin interrumpir el flujo
 * 
 * Requirements: 4.2, 7.1, 7.2
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantMiddleware.name);

  constructor(private readonly tenantContext: TenantContextService) {}

  use(req: Request, res: Response, next: NextFunction) {
    try {
      // Extract tenant_id and user_id from request.user (set by JwtAuthGuard)
      const user = (req as any).user;

      const tenantId = user?.tenant_id ?? null;
      const userId = user?.id ?? null;

      let supabaseAccessToken: string | null = null;
      const headerCandidates = [
        'x-supabase-access-token',
        'supabase-access-token',
        'sb-access-token',
      ];
      for (const header of headerCandidates) {
        const raw = req.headers[header];
        if (typeof raw === 'string' && raw.trim().length > 0) {
          supabaseAccessToken = raw.trim();
          break;
        }
      }

      if (!supabaseAccessToken && typeof req.headers.authorization === 'string') {
        const [scheme, token] = req.headers.authorization.split(' ');
        if (scheme?.toLowerCase() === 'bearer' && token) {
          supabaseAccessToken = token;
        }
      }

      if (tenantId) {
        this.logger.log(`Setting tenant context - Tenant: ${tenantId}, User: ${userId ?? 'unknown'}, Path: ${req.path}`);

        // Add tenant_id to request for easy access in controllers (both formats for compatibility)
        (req as any).tenant_id = tenantId;
        (req as any).tenantId = tenantId; // For guards that use camelCase
        (req as any).user_id = userId;

        this.logger.debug(`Tenant context set - RLS policies will use tenant_id from queries`);
      } else {
        // Request without authentication or tenant context
        this.logger.debug(`Request without tenant context - Path: ${req.path}`);
      }

      this.tenantContext.run(
        {
          tenantId,
          userId,
          supabaseAccessToken,
        },
        () => next(),
      );
    } catch (error) {
      // Handle errors gracefully - log and continue
      this.logger.error(`Error in TenantMiddleware: ${error.message}`, error.stack);
      next(); // Continue even if there's an error
    }
  }
}
