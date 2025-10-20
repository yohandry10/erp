import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';

/**
 * Interface for permission metadata
 */
export interface PermissionMetadata {
  modulo: string;
  accion: string;
  recurso: string;
}

/**
 * ✅ MULTI-TENANT: Guard que valida permisos basados en roles
 * 
 * Este guard trabaja en conjunto con el decorator @RequirePermission()
 * para validar que el usuario tenga los permisos necesarios para ejecutar una acción.
 * 
 * Uso:
 * @UseGuards(JwtAuthGuard, PermissionGuard)
 * @RequirePermission('ventas', 'create', 'facturas')
 * @Post('facturas')
 * createFactura() { ... }
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Obtener los metadatos de permisos del decorator
    const requiredPermission = this.reflector.getAllAndOverride<PermissionMetadata>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Si no hay permisos requeridos, permitir acceso
    if (!requiredPermission) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Validar que el usuario esté autenticado
    if (!user) {
      console.error('❌ [PermissionGuard] Usuario no autenticado');
      throw new ForbiddenException('Usuario no autenticado');
    }

    // Super-admins tienen acceso a todo
    if (user.is_super_admin) {
      console.log('✅ [PermissionGuard] Super-admin - Acceso permitido');
      return true;
    }

    // Validar que el usuario tenga tenant_id
    if (!user.tenant_id) {
      console.error('❌ [PermissionGuard] Usuario sin tenant_id');
      throw new ForbiddenException('Tenant no identificado');
    }

    // Validar permisos del usuario
    const hasPermission = this.checkUserPermission(
      user,
      requiredPermission.modulo,
      requiredPermission.accion,
      requiredPermission.recurso,
    );

    if (!hasPermission) {
      console.error('❌ [PermissionGuard] Permiso denegado:', {
        user: user.email,
        tenant: user.tenant_id,
        required: requiredPermission,
        userRoles: user.roles,
      });
      throw new ForbiddenException(
        `No tiene permisos para ${requiredPermission.accion} en ${requiredPermission.modulo}/${requiredPermission.recurso}`,
      );
    }

    console.log('✅ [PermissionGuard] Permiso concedido:', {
      user: user.email,
      permission: requiredPermission,
    });
    return true;
  }

  /**
   * Verifica si el usuario tiene el permiso requerido
   * 
   * TODO: Esta es una implementación básica que debe ser reemplazada
   * por una consulta a la base de datos cuando se implemente el PermissionService.
   * 
   * Por ahora, valida permisos basados en roles simples:
   * - ADMIN: Acceso completo dentro del tenant
   * - VENDEDOR: Acceso a módulo de ventas
   * - CONTADOR: Acceso a módulo de contabilidad
   * - etc.
   */
  private checkUserPermission(
    user: any,
    modulo: string,
    accion: string,
    recurso: string,
  ): boolean {
    // Si no tiene roles, denegar acceso
    if (!user.roles || user.roles.length === 0) {
      return false;
    }

    // Verificar si tiene rol de ADMIN (acceso completo dentro del tenant)
    if (user.roles.includes('ADMIN') || user.roles.includes('ADMIN_EMPRESA')) {
      return true;
    }

    // Mapeo básico de roles a permisos
    // TODO: Reemplazar con consulta a base de datos (rol_permisos + permisos)
    const rolePermissions: Record<string, string[]> = {
      VENDEDOR: ['ventas', 'pos', 'clientes', 'productos'],
      CONTADOR: ['contabilidad', 'finanzas', 'reportes'],
      ALMACENERO: ['inventario', 'productos', 'almacenes'],
      COMPRADOR: ['compras', 'proveedores', 'productos'],
      GERENTE: ['ventas', 'compras', 'inventario', 'contabilidad', 'reportes', 'rrhh'],
    };

    // Verificar si alguno de los roles del usuario tiene acceso al módulo
    for (const role of user.roles) {
      const allowedModules = rolePermissions[role] || [];
      if (allowedModules.includes(modulo)) {
        // Por ahora, si tiene acceso al módulo, permitir todas las acciones
        // TODO: Implementar validación granular de acciones (create, read, update, delete)
        return true;
      }
    }

    return false;
  }
}
