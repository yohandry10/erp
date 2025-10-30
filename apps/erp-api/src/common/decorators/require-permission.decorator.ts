import { BadRequestException, SetMetadata } from '@nestjs/common';

/**
 * Key para almacenar los metadatos de permisos
 */
export const PERMISSION_KEY = 'permission';

export interface ParsedPermission {
  module: string;
  resource: string;
  action: string;
  raw: string;
}

/**
 * HARDENING: Normaliza la notación de permisos granulares usando la forma
 * moduló.recurso.acción (por ejemplo: ventas.pedidos.confirmar).
 */
const parsePermissionPath = (permission: string): ParsedPermission => {
  const trimmed = permission?.trim();
  if (!trimmed) {
    throw new BadRequestException('Permiso requerido no puede ser vacío');
  }

  const parts = trimmed.split('.');

  if (parts.length === 3) {
    const [module, resource, action] = parts;
    if (!module || !resource || !action) {
      throw new BadRequestException(`Permiso "${trimmed}" inválido. Se esperaba formato modulo.recurso.accion`);
    }
    return {
      module,
      resource,
      action,
      raw: trimmed,
    };
  }

  if (parts.length === 2) {
    const [module, action] = parts;
    if (!module || !action) {
      throw new BadRequestException(`Permiso "${trimmed}" inválido. Se esperaba formato modulo.accion`);
    }
    return {
      module,
      resource: '__global__',
      action,
      raw: trimmed,
    };
  }

  throw new BadRequestException(
    `Permiso "${trimmed}" inválido. Utiliza "modulo.recurso.accion" o "modulo.accion"`,
  );
};

/**
 * ✅ MULTI-TENANT: Decorator para requerir permisos específicos.
 *
 * Uso recomendado:
 * @UseGuards(JwtAuthGuard, PermissionGuard)
 * @RequirePermission('ventas.pedidos.confirmar')
 */
export function RequirePermission(permission: string): ReturnType<typeof SetMetadata>;
export function RequirePermission(modulo: string, accion: string, recurso: string): ReturnType<typeof SetMetadata>;
export function RequirePermission(
  permissionOrModule: string,
  accion?: string,
  recurso?: string,
) {
  // HARDENING: se mantiene compatibilidad temporal con la firma antigua.
  if (accion && recurso) {
    const descriptor: ParsedPermission = {
      module: permissionOrModule,
      action: accion,
      resource: recurso,
      raw: `${permissionOrModule}.${recurso}.${accion}`,
    };
    return SetMetadata(PERMISSION_KEY, descriptor);
  }

  const descriptor = parsePermissionPath(permissionOrModule);
  return SetMetadata(PERMISSION_KEY, descriptor);
}
