import { Injectable, CanActivate, ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY, ParsedPermission } from '../decorators/require-permission.decorator';
import { PermissionService } from '../../modules/permissions/permission.service';
import * as jwt from 'jsonwebtoken';

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
    let user = request.user;

    if (!user) {
      const authHeader = request.headers?.authorization;
      if (typeof authHeader !== 'string') {
        throw new UnauthorizedException('Usuario no autenticado');
      }

      const [scheme, token] = authHeader.split(' ');
      if (scheme?.toLowerCase() !== 'bearer' || !token) {
        throw new UnauthorizedException('Usuario no autenticado');
      }

      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        throw new UnauthorizedException('Usuario no autenticado');
      }

      try {
        const payload = jwt.verify(token, jwtSecret) as Record<string, any>;
        user = {
          id: payload.sub,
          email: payload.email,
          username: payload.username,
          roles: payload.roles || [],
          tenant_id: payload.tenant_id,
          is_super_admin: payload.is_super_admin || false,
        };
        request.user = user;
      } catch (error) {
        throw new UnauthorizedException('Usuario no autenticado');
      }
    }

    if (user.is_super_admin) {
      return true;
    }

    if (!user.tenant_id) {
      throw new UnauthorizedException('Tenant no identificado en token');
    }

    if (!request.tenantId) {
      request.tenantId = user.tenant_id;
      request.tenant_id = user.tenant_id;
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
