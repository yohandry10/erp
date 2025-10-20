import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

/**
 * SuperAdminGuard - Validates that the user is a super-admin
 * 
 * Requirements: 1.1, 1.5
 * 
 * This guard checks the is_super_admin flag from the JWT payload
 * to ensure only super-admins can access protected endpoints.
 * 
 * Usage:
 * @UseGuards(JwtAuthGuard, SuperAdminGuard)
 * @Get('tenants')
 * getTenants() {
 *   // Only super-admins can access this
 * }
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      console.error('❌ [SuperAdminGuard] No user found in request');
      throw new ForbiddenException('Acceso denegado: usuario no autenticado');
    }

    // Check is_super_admin flag from JWT payload
    if (!user.is_super_admin) {
      console.error('❌ [SuperAdminGuard] Acceso denegado - Usuario no es super-admin:', user.email);
      throw new ForbiddenException('Acceso denegado: se requieren privilegios de super-administrador');
    }

    console.log('✅ [SuperAdminGuard] Acceso permitido - Super-Admin:', user.email);
    return true;
  }
}
