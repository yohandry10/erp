import { Injectable, CanActivate, ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY, ParsedPermission } from '../decorators/require-permission.decorator';
import { PermissionService } from '../../modules/permissions/permission.service';

/**
 * HARDENING: Guard centralizado que valida permisos granulares contra la tabla
 * rol_permisos en lugar de asumir permisos por rol genérico.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionService: PermissionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermission = this.reflector.getAllAndOverride<ParsedPermission>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermission) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Usuario no autenticado');
    }

    if (user.is_super_admin) {
      return true;
    }

    const tenantId = request.tenantId || user.tenant_id;

    if (!tenantId) {
      // HARDENING: sin tenant no se puede evaluar RLS ni permisos.
      throw new ForbiddenException('Tenant no identificado en la petición');
    }

    const { module, resource, action } = requiredPermission;

    let hasPermission = await this.permissionService.checkUserPermission(
      user.id,
      tenantId,
      module,
      action,
      resource,
    );

    if (!hasPermission && resource !== '__global__') {
      // HARDENING: permite fallback a permisos globales si existen.
      hasPermission = await this.permissionService.checkUserPermission(
        user.id,
        tenantId,
        module,
        action,
        '__global__',
      );
    }

    if (!hasPermission) {
      throw new ForbiddenException(
        `Permiso requerido: ${requiredPermission.raw}`,
      );
    }

    return true;
  }
}
