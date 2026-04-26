import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
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
    // NOTA: Este middleware se ejecuta ANTES del JwtAuthGuard
    // Por lo tanto, req.user NO es confiable aquí.
    // HARDENING: NO decodificar ni confiar en claims del JWT (sin verify) para tenant/superadmin.

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

    // HARDENING: NO propagar tenant/is_super_admin aquí. Eso se decide en TenantContextInterceptor (post-JWT).
    (req as any).is_super_admin = false;
    this.logger.debug(`Request pre-auth - Path: ${req.path}`);

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
