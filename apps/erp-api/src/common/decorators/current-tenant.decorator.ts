import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';

/**
 * ✅ MULTI-TENANT: Decorator para obtener el tenant_id del usuario autenticado
 * 
 * Uso:
 * @Get()
 * findAll(@CurrentTenant() tenantId: string) {
 *   return this.service.findAll(tenantId);
 * }
 */
export const CurrentTenant = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    const resolvedTenant = request.tenant_id || request.tenantId || user?.tenant_id;

    if (!user || !resolvedTenant) {
      console.error('❌ [CurrentTenant] Usuario sin tenant_id:', user);
      throw new UnauthorizedException('Tenant no identificado');
    }

    console.log('🏢 [CurrentTenant] Tenant extraído:', resolvedTenant);
    return resolvedTenant;
  },
);
