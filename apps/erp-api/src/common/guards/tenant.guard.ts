import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

/**
 * ✅ MULTI-TENANT: Guard que valida que el usuario tenga acceso al tenant solicitado
 * 
 * Uso:
 * @UseGuards(TenantGuard)
 * @Get(':tenant_id/recursos')
 * findAll(@Param('tenant_id') tenantId: string) {
 *   // Solo se ejecuta si el usuario pertenece a ese tenant
 * }
 */
@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const isSuperAdmin = user?.is_super_admin === true;
    
    // Obtener tenant_id del parámetro de ruta o query
    const requestedTenantId = request.params.tenant_id || request.query.tenant_id;
    
    if (!requestedTenantId) {
      // Si no se especifica tenant en la ruta, permitir (se usará el del usuario)
      return true;
    }
    
    if (!user || !user.tenant_id) {
      console.error('❌ [TenantGuard] Usuario sin tenant_id');
      throw new ForbiddenException('Acceso denegado: tenant no identificado');
    }

    // Superadmin puede operar sobre tenants distintos (siempre que JWT ya fue verificado)
    if (isSuperAdmin) {
      console.log('✅ [TenantGuard] Superadmin - acceso permitido');
      return true;
    }
    
    // Validar que el tenant del usuario coincida con el solicitado
    if (user.tenant_id !== requestedTenantId) {
      console.error('❌ [TenantGuard] Intento de acceso a otro tenant:', {
        userTenant: user.tenant_id,
        requestedTenant: requestedTenantId,
        user: user.email
      });
      throw new ForbiddenException('Acceso denegado: no pertenece a este tenant');
    }
    
    console.log('✅ [TenantGuard] Acceso permitido - Tenant:', user.tenant_id);
    return true;
  }
}
