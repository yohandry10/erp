import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { Permission, RolePermission } from './types';

// Re-export types for backward compatibility
export type { Permission, RolePermission } from './types';

@Injectable()
export class PermissionService {
  private permissionCache: Map<string, { permissions: string[]; timestamp: number }> = new Map();
  // Correctness beats a process-local cache: role changes must take effect on
  // every API replica immediately. A distributed/versioned cache can replace it.
  private readonly CACHE_TTL = 0;
  private readonly actionGroups: string[][] = [
    ['read', 'ver', 'view', 'listar', 'consultar'],
    ['write', 'crear', 'create', 'editar', 'update', 'actualizar', 'modificar', 'registrar', 'generar', 'emitir'],
    ['delete', 'eliminar', 'anular', 'cancelar'],
    ['approve', 'aprobar', 'autorizar'],
    ['manage', 'administrar', 'configurar'],
    ['convertir_pedido'],
    ['generar_factura'],
    ['generar_nota_credito'],
    ['preparar'],
    ['despachar'],
    ['recepcionar'],
    ['resolver'],
    ['validar_ruc'],
  ];

  constructor(private readonly supabase: SupabaseService) {}

  private normalize(value?: string | null): string {
    return value?.trim().toLowerCase() ?? '';
  }

  private normalizeResource(value?: string | null): string {
    const normalized = this.normalize(value);
    if (!normalized || normalized === '__global__') {
      return '__global__';
    }
    return normalized;
  }

  private findActionGroup(action: string): string[] {
    const normalized = this.normalize(action);
    return this.actionGroups.find(group => group.includes(normalized)) || [normalized];
  }

  private actionsMatch(requested: string, actual: string): boolean {
    const requestedGroup = this.findActionGroup(requested);
    const actualGroup = this.findActionGroup(actual);
    return requestedGroup.some(action => actualGroup.includes(action));
  }

  /**
   * B1: Invalidar cache de permisos para un usuario específico
   * Útil cuando el usuario cambia de tenant o cuando se modifican sus roles
   */
  invalidateUserPermissions(userId: string): void {
    const keysToDelete: string[] = [];
    for (const [key] of this.permissionCache) {
      if (key.startsWith(`${userId}:`)) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => this.permissionCache.delete(key));
    
    if (keysToDelete.length > 0) {
      console.log(`✅ [PERMISSION] Cache invalidado para usuario ${userId} - ${keysToDelete.length} entradas eliminadas`);
    }
  }

  /**
   * Get all permissions for a tenant
   * Requirements: 5.1
   */
  async getPermissions(tenantId: string): Promise<Permission[]> {
    const client = this.supabase.getClient();

    const { data: permissions, error } = await client
      .from('permisos')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('activo', true)
      .order('modulo', { ascending: true })
      .order('recurso', { ascending: true })
      .order('accion', { ascending: true });

    if (error) {
      console.error('Error fetching permissions:', error);
      throw new BadRequestException('Error al obtener permisos');
    }

    return permissions || [];
  }

  /**
   * Get permissions for a specific role
   * Requirements: 5.1
   */
  async getRolePermissions(tenantId: string, roleId: string): Promise<Permission[]> {
    const client = this.supabase.getClient();

    // Validate role belongs to tenant
    const { data: role } = await client
      .from('roles')
      .select('id')
      .eq('id', roleId)
      .eq('tenant_id', tenantId)
      .eq('activo', true)
      .single();

    if (!role) {
      throw new NotFoundException('Rol no encontrado en este tenant');
    }

    // Query rol_permisos joined with permisos
    const { data: rolePermissions, error } = await client
      .from('rol_permisos')
      .select(`
        permiso_id,
        concedido,
        permisos (
          id,
          tenant_id,
          modulo,
          accion,
          recurso,
          descripcion,
          activo,
          created_at
        )
      `)
      .eq('role_id', roleId)
      .eq('concedido', true);

    if (error) {
      console.error('Error fetching role permissions:', error);
      throw new BadRequestException('Error al obtener permisos del rol');
    }

    // Extract and filter permissions
    const permissions = rolePermissions
      ?.map(rp => rp.permisos)
      .flat()
      .filter(p => p && p.tenant_id === tenantId && p.activo) || [];

    return permissions as Permission[];
  }

  /**
   * Assign a permission to a role
   * Requirements: 5.1
   */
  async assignPermissionToRole(
    tenantId: string,
    roleId: string,
    permissionId: string,
    actorId?: string,
  ): Promise<void> {
    if (!actorId?.trim()) throw new ForbiddenException('Se requiere actor para asignar permisos');
    const { error } = await this.supabase.getClient().rpc('asignar_permisos_rol_rbac_tx', {
      p_rol_id: roleId,
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_permission_ids: [permissionId],
      p_mode: 'ADD',
    });
    if (error?.code === '42501') throw new ForbiddenException(error.message);
    if (error?.code === 'P0002') throw new NotFoundException(error.message);
    if (error) throw new BadRequestException(error.message || 'Error al asignar permiso al rol');
    await this.invalidateCacheForRoleUsers(roleId, tenantId);
  }

  /**
   * Revoke a permission from a role
   * Requirements: 5.5
   */
  async revokePermissionFromRole(
    tenantId: string,
    roleId: string,
    permissionId: string,
    actorId?: string,
  ): Promise<void> {
    if (!actorId?.trim()) throw new ForbiddenException('Se requiere actor para revocar permisos');
    const { error } = await this.supabase.getClient().rpc('asignar_permisos_rol_rbac_tx', {
      p_rol_id: roleId,
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_permission_ids: [permissionId],
      p_mode: 'REMOVE',
    });
    if (error?.code === '42501') throw new ForbiddenException(error.message);
    if (error?.code === 'P0002') throw new NotFoundException(error.message);
    if (error) throw new BadRequestException(error.message || 'Error al revocar permiso del rol');
    await this.invalidateCacheForRoleUsers(roleId, tenantId);
  }

  /**
   * Check if a user has a specific permission
   * Requirements: 5.2, 5.3
   * HARDENING B2: Filtros explícitos por tenant_id en todas las consultas
   */
  async checkUserPermission(
    userId: string,
    tenantId: string,
    modulo: string,
    accion: string,
    recurso: string
  ): Promise<boolean> {
    const client = this.supabase.getClient();

    // Check if user is SUPER_ADMIN first - they have all permissions
    // ✅ FIX: Usar maybeSingle() para evitar error PGRST301
    const { data: usuario, error: userError } = await client
      .from('usuarios_sistema')
      .select('is_super_admin, activo, estado')
      .eq('id', userId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (userError || !usuario || usuario.activo !== true || usuario.estado !== 'ACTIVO') {
      return false;
    }

    if (usuario.is_super_admin === true) {
      console.log('✅ [PERMISSION] SUPER_ADMIN detected - granting access');
      return true;
    }

    // Generate cache key
    const normalizedModule = this.normalize(modulo);
    const normalizedAction = this.normalize(accion);
    const normalizedResource = this.normalizeResource(recurso);

    const cacheKey = `${userId}:${tenantId}:${normalizedModule}:${normalizedAction}:${normalizedResource}`;
    
    // Check cache
    const cached = this.permissionCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.permissions.length > 0;
    }

    // HARDENING B2: Query user roles con validación explícita de tenant_id
    // Estrategia: Primero obtener roles del usuario, luego validar que pertenezcan al tenant
    const { data: userRoles, error: rolesError } = await client
      .from('user_roles')
      .select('role_id')
      .eq('usuario_sistema_id', userId);

    if (rolesError) {
      console.error('Error fetching user roles:', rolesError);
      return false;
    }

    if (!userRoles || userRoles.length === 0) {
      // Cache negative result
      if (this.CACHE_TTL > 0) this.permissionCache.set(cacheKey, { permissions: [], timestamp: Date.now() });
      return false;
    }

    const roleIds = userRoles.map(ur => ur.role_id);

    // HARDENING B2: Validar explícitamente que los roles pertenezcan al tenant
    const { data: validRoles, error: validRolesError } = await client
      .from('roles')
      .select('id, nombre')
      .in('id', roleIds)
      .eq('tenant_id', tenantId)
      .eq('activo', true);

    if (validRolesError) {
      console.error('Error validating roles tenant:', validRolesError);
      return false;
    }

    if (!validRoles || validRoles.length === 0) {
      // Cache negative result
      if (this.CACHE_TTL > 0) this.permissionCache.set(cacheKey, { permissions: [], timestamp: Date.now() });
      return false;
    }

    // Bypass global if user tiene rol ADMIN en este tenant
    const isAdmin = validRoles.some(r => (r as any)?.nombre?.toUpperCase() === 'ADMIN');
    if (isAdmin) {
      if (this.CACHE_TTL > 0) this.permissionCache.set(cacheKey, { permissions: [cacheKey], timestamp: Date.now() });
      return true;
    }

    const validRoleIds = validRoles.map(r => r.id);

    // HARDENING B2: Query role permissions solo de roles válidos del tenant
      const { data: rolePermissions, error: permissionsError } = await client
        .from('rol_permisos')
        .select(`
          permiso_id,
          concedido,
        permisos (
          id,
          tenant_id,
          modulo,
          accion,
          recurso,
          activo
        )
      `)
      .in('role_id', validRoleIds)
      .eq('concedido', true);

    if (permissionsError) {
      console.error('Error fetching role permissions:', permissionsError);
      return false;
    }

    // Check if any role has the required permission
    const normalizedRequestedResource = recurso || '__global__';

    const hasPermission = rolePermissions?.some(rp => {
      const permisos = Array.isArray(rp.permisos) ? rp.permisos : [rp.permisos];
      return permisos.some(p => {
        if (!p) return false;
        // HARDENING B2: Validación explícita de tenant_id del permiso
        // (Ya validamos que los roles pertenecen al tenant, ahora validamos los permisos)
        if (p.tenant_id !== tenantId) return false;
        if (p.activo !== true) return false;
        if (this.normalize(p.modulo) !== normalizedModule) return false;
        if (!this.actionsMatch(normalizedAction, p.accion)) return false;

        // HARDENING: habilita llaves globales como comodín.
        const permisoRecurso = this.normalizeResource(p.recurso);
        if (normalizedResource === '__global__') {
          return permisoRecurso === '__global__' || permisoRecurso === '*';
        }

        return (
          permisoRecurso === normalizedResource ||
          permisoRecurso === '__global__' ||
          permisoRecurso === '*'
        );
      });
    }) || false;

    // Cache result
    if (this.CACHE_TTL > 0) {
      this.permissionCache.set(cacheKey, {
        permissions: hasPermission ? [cacheKey] : [],
        timestamp: Date.now()
      });
    }

    return hasPermission;
  }

  /**
   * Get all permissions for a user (aggregated from all roles)
   * Requirements: 5.6
   * HARDENING B2: Filtros explícitos por tenant_id en todas las consultas
   */
  async getUserPermissions(userId: string, tenantId: string): Promise<Permission[]> {
    const client = this.supabase.getClient();

    // HARDENING B2: Query user roles con validación explícita de tenant_id
    // Estrategia: Primero obtener roles del usuario, luego validar que pertenezcan al tenant
    const { data: userRoles, error: rolesError } = await client
      .from('user_roles')
      .select('role_id')
      .eq('usuario_sistema_id', userId);

    if (rolesError) {
      console.error('Error fetching user roles:', rolesError);
      throw new BadRequestException('Error al obtener roles del usuario');
    }

    if (!userRoles || userRoles.length === 0) {
      return [];
    }

    const roleIds = userRoles.map(ur => ur.role_id);

    // HARDENING B2: Validar explícitamente que los roles pertenezcan al tenant
    const { data: validRoles, error: validRolesError } = await client
      .from('roles')
      .select('id')
      .in('id', roleIds)
      .eq('tenant_id', tenantId)
      .eq('activo', true);

    if (validRolesError) {
      console.error('Error validating roles tenant:', validRolesError);
      throw new BadRequestException('Error al validar roles del usuario');
    }

    if (!validRoles || validRoles.length === 0) {
      return [];
    }

    const validRoleIds = validRoles.map(r => r.id);

    // HARDENING B2: Query all permissions from user's roles solo de roles válidos del tenant
    const { data: rolePermissions, error: permissionsError } = await client
      .from('rol_permisos')
      .select(`
        permiso_id,
        concedido,
        permisos (
          id,
          tenant_id,
          modulo,
          accion,
          recurso,
          descripcion,
          activo,
          created_at
        )
      `)
      .in('role_id', validRoleIds)
      .eq('concedido', true);

    if (permissionsError) {
      console.error('Error fetching role permissions:', permissionsError);
      throw new BadRequestException('Error al obtener permisos del usuario');
    }

    // Extract permissions and filter by tenant and active status
    // HARDENING B2: Validación explícita de tenant_id del permiso
    // (Ya validamos que los roles pertenecen al tenant, ahora validamos los permisos)
    const permissions = rolePermissions
      ?.map(rp => rp.permisos)
      .flat()
      .filter(p => p && p.tenant_id === tenantId && p.activo) || [];

    // Remove duplicates (union) - use a Map to deduplicate by permission id
    const uniquePermissionsMap = new Map<string, Permission>();
    permissions.forEach(p => {
      if (p && p.id) {
        uniquePermissionsMap.set(p.id, p as Permission);
      }
    });

    const uniquePermissions = Array.from(uniquePermissionsMap.values());

    // Sort by module, recurso, accion for consistent ordering
    uniquePermissions.sort((a, b) => {
      if (a.modulo !== b.modulo) return a.modulo.localeCompare(b.modulo);
      if (a.recurso !== b.recurso) return a.recurso.localeCompare(b.recurso);
      return a.accion.localeCompare(b.accion);
    });

    return uniquePermissions;
  }

  /**
   * 🔴 CRÍTICO FIX: Invalidar cache de permisos de todos los usuarios que tienen un rol específico
   * Se llama cuando se modifican permisos de un rol para que los cambios se reflejen inmediatamente
   */
  private async invalidateCacheForRoleUsers(roleId: string, tenantId: string): Promise<void> {
    const client = this.supabase.getClient();

    try {
      // Obtener todos los usuarios que tienen este rol
      const { data: userRoles, error } = await client
        .from('user_roles')
        .select('usuario_sistema_id')
        .eq('role_id', roleId);

      if (error) {
        console.error('❌ Error obteniendo usuarios del rol para invalidar cache:', error);
        return;
      }

      if (!userRoles || userRoles.length === 0) {
        console.log(`✅ [PERMISSION] No hay usuarios con rol ${roleId}, no se necesita invalidar cache`);
        return;
      }

      // Invalidar cache de cada usuario
      const userIds = userRoles.map(ur => ur.usuario_sistema_id).filter(Boolean);
      let invalidatedCount = 0;

      for (const userId of userIds) {
        this.invalidateUserPermissions(userId);
        invalidatedCount++;
      }

      console.log(`✅ [PERMISSION] Cache invalidado para ${invalidatedCount} usuarios con rol ${roleId}`);
    } catch (error) {
      console.error('❌ Error invalidando cache de usuarios del rol:', error);
      // No lanzamos error para no bloquear la operación principal
    }
  }
}
