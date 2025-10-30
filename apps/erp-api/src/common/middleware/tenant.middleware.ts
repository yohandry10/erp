import { ForbiddenException, Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { TenantContextService } from '../../shared/tenant/tenant-context.service';

/**
 * Middleware multi-tenant que fija el contexto de tenant para cada request.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantMiddleware.name);

  constructor(private readonly tenantContext: TenantContextService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const user = (req as any).user;
    const tenantId: string | null = user?.tenant_id ?? null;
    const userId: string | null = user?.id ?? null;
    const isSuperAdmin: boolean = user?.is_super_admin === true;

    // HARDENING: propagar flag super admin en el request.
    (req as any).is_super_admin = isSuperAdmin;

    let supabaseAccessToken: string | null = null;
    const headerCandidates = ['x-supabase-access-token', 'supabase-access-token', 'sb-access-token'];
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

    if (!tenantId && user && !isSuperAdmin) {
      // HARDENING: la operación multi-tenant requiere un tenant explícito.
      this.logger.warn(
        `Solicitud rechazado sin tenant - Usuario: ${userId ?? 'desconocido'}, Path: ${req.path}`,
      );
      throw new ForbiddenException('Tenant requerido');
    }

    if (tenantId) {
      // HARDENING: exponer tenant y usuario en el request para guards y servicios.
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
