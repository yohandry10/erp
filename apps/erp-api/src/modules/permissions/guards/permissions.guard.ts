import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionService } from '../permission.service';

/**
 * Metadata key for required permissions
 */
export const PERMISSIONS_KEY = 'permissions';

/**
 * Decorator to specify required permissions for a route
 * Usage: @RequirePermissions('ventas', 'clientes', 'ver')
 * Requirements: 14.2
 */
export const RequirePermissions = (modulo: string, recurso: string, accion: string) =>
  SetMetadata(PERMISSIONS_KEY, { modulo, recurso, accion });

/**
 * Guard to check if user has required permissions
 * Requirements: 14.2
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private permissionService: PermissionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Get required permissions from metadata
    const requiredPermission = this.reflector.getAllAndOverride<{
      modulo: string;
      recurso: string;
      accion: string;
    }>(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);

    // If no permissions required, allow access
    if (!requiredPermission) {
      return true;
    }

    // Get request and user from context
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const tenantId = request.tenantId;

    // Check if user is authenticated
    if (!user || !user.id) {
      throw new ForbiddenException('Usuario no autenticado');
    }

    // Check if tenant is set
    if (!tenantId) {
      throw new ForbiddenException('Tenant no identificado');
    }

    // Check if user has the required permission
    const hasPermission = await this.permissionService.checkUserPermission(
      user.id,
      tenantId,
      requiredPermission.modulo,
      requiredPermission.accion,
      requiredPermission.recurso,
    );

    if (!hasPermission) {
      throw new ForbiddenException(
        `No tiene permisos para realizar esta acción: ${requiredPermission.modulo}.${requiredPermission.recurso}.${requiredPermission.accion}`,
      );
    }

    return true;
  }
}
