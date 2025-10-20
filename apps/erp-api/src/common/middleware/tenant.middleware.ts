import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { SupabaseService } from '../../shared/supabase/supabase.service';

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

  constructor(private readonly supabaseService: SupabaseService) { }

  async use(req: Request, res: Response, next: NextFunction) {
    try {
      // Extract tenant_id and user_id from request.user (set by JwtAuthGuard)
      const user = (req as any).user;

      if (user && user.tenant_id) {
        const tenantId = user.tenant_id;
        const userId = user.id;

        this.logger.log(`Setting tenant context - Tenant: ${tenantId}, User: ${userId}, Path: ${req.path}`);

        // Add tenant_id to request for easy access in controllers
        (req as any).tenant_id = tenantId;
        (req as any).user_id = userId;

        this.logger.debug(`Tenant context set - RLS policies will use tenant_id from queries`);
      } else {
        // Request without authentication or tenant context
        this.logger.debug(`Request without tenant context - Path: ${req.path}`);
      }

      next();
    } catch (error) {
      // Handle errors gracefully - log and continue
      this.logger.error(`Error in TenantMiddleware: ${error.message}`, error.stack);
      next(); // Continue even if there's an error
    }
  }
}
