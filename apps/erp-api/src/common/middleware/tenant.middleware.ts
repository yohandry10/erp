import { ForbiddenException, Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { TenantContextService } from '../../shared/tenant/tenant-context.service';
import * as jwt from 'jsonwebtoken';

/**
 * Middleware multi-tenant que fija el contexto de tenant para cada request.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantMiddleware.name);

  constructor(private readonly tenantContext: TenantContextService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    // NOTA: Este middleware se ejecuta ANTES del JwtAuthGuard
    // Por lo tanto, req.user puede no estar disponible aún
    // Decodificamos el token JWT directamente para obtener tenant_id
    
    let tenantId: string | null = null;
    let userId: string | null = null;
    let isSuperAdmin: boolean = false;
    let supabaseAccessToken: string | null = null;

    // Extraer token del header Authorization
    const authHeader = req.headers.authorization;
    if (authHeader && typeof authHeader === 'string') {
      const [scheme, token] = authHeader.split(' ');
      if (scheme?.toLowerCase() === 'bearer' && token) {
        supabaseAccessToken = token;
        
        try {
          // Decodificar el token SIN verificar (la verificación la hace el guard)
          // Solo necesitamos extraer el tenant_id para el contexto
          const decoded = jwt.decode(token) as any;
          
          if (decoded) {
            tenantId = decoded.tenant_id || null;
            userId = decoded.sub || null;
            isSuperAdmin = decoded.is_super_admin === true;
            
            this.logger.debug(
              `Token decoded - Tenant: ${tenantId}, User: ${userId}, Path: ${req.path}`,
            );
          }
        } catch (error) {
          // Si falla la decodificación, el guard JWT se encargará de rechazar
          this.logger.warn(`Failed to decode JWT token: ${error.message}`);
        }
      }
    }

    // Intentar obtener de headers alternativos si no hay token
    if (!supabaseAccessToken) {
      const headerCandidates = ['x-supabase-access-token', 'supabase-access-token', 'sb-access-token'];
      for (const header of headerCandidates) {
        const raw = req.headers[header];
        if (typeof raw === 'string' && raw.trim().length > 0) {
          supabaseAccessToken = raw.trim();
          break;
        }
      }
    }

    // HARDENING: propagar información en el request
    (req as any).is_super_admin = isSuperAdmin;
    
    if (tenantId) {
      (req as any).tenant_id = tenantId;
      (req as any).tenantId = tenantId;
      (req as any).user_id = userId;
      this.logger.debug(
        `Tenant context set - Tenant: ${tenantId}, User: ${userId ?? 'unknown'}, Path: ${req.path}`,
      );
    } else {
      this.logger.debug(`Request sin tenant - Path: ${req.path}`);
    }

    this.tenantContext.run(
      {
        tenantId,
        userId,
        supabaseAccessToken,
        isSuperAdmin,
      },
      () => next(),
    );
  }
}
