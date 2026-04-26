import { CallHandler, ExecutionContext, ForbiddenException, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class TenantBodyInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const isSuperAdmin = user?.is_super_admin === true;
    const tenantFromToken: string | null = user?.tenant_id ?? null;

    if (isSuperAdmin || !tenantFromToken) {
      return next.handle();
    }

    const tenantFromQuery = (request.query?.tenant_id ?? request.query?.tenantId) as
      | string
      | undefined;
    if (tenantFromQuery && tenantFromQuery !== tenantFromToken) {
      throw new ForbiddenException('Acceso denegado: tenant_id en query no coincide con el token');
    }

    const tenantFromParams = (request.params?.tenant_id ?? request.params?.tenantId) as
      | string
      | undefined;
    if (tenantFromParams && tenantFromParams !== tenantFromToken) {
      throw new ForbiddenException('Acceso denegado: tenant_id en ruta no coincide con el token');
    }

    const body = request.body;
    if (!body || typeof body !== 'object') {
      return next.handle();
    }

    const tenantFromBody = (body.tenant_id ?? body.tenantId) as string | undefined;
    if (tenantFromBody && tenantFromBody !== tenantFromToken) {
      throw new ForbiddenException('Acceso denegado: tenant_id en payload no coincide con el token');
    }

    return next.handle();
  }
}
