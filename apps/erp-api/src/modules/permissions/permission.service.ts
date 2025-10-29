import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { Permission, RolePermission } from './types';

// Re-export types for backward compatibility
export { Permission, RolePermission } from './types';

@Injectable()
export class PermissionService {
  private permissionCache: Map<string, { permissions: string[]; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

  constructor(private readonly supabase: SupabaseService) {}

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
  async assignPermissionToRole(tenantId: string, roleId: string, permissionId: string): Promise<void> {
    const client = this.supabase.getClient();

    // Validate role belongs to tenant
    const { data: role } = await client
      .from('roles')
      .select('id')
      .eq('id', roleId)
      .eq('tenant_id', tenantId)
      .single();

    if (!role) {
      throw new NotFoundException('Rol no encontrado en este tenant');
    }

    // Validate permission belongs to tenant
    const { data: permission } = await client
      .from('permisos')
      .select('id')
      .eq('id', permissionId)
      .eq('tenant_id', tenantId)
      .single();

    if (!permission) {
      throw new NotFoundException('Permiso no encontrado en este tenant');
    }

    // Check if permission is already assigned
    const { data: existing } = await client
      .from('rol_permisos')
      .select('id')
      .eq('role_id', roleId)
      .eq('permiso_id', permissionId)
      .single();

    if (existing) {
      console.log('⚠️ [PERMISSION] Permiso ya asignado al rol');
      return;
    }

    // Insert into rol_permisos table
    const { error } = await client
      .from('rol_permisos')
      .insert({
        role_id: roleId,
        permiso_id: permissionId,
        concedido: true,
        created_at: new Date().toISOString()
      });

    if (error) {
      console.error('Error assigning permission to role:', error);
      throw new BadRequestException('Error al asignar permiso al rol');
    }

    console.log('✅ [PERMISSION] Permiso asignado - Rol:', roleId, 'Permiso:', permissionId);
  }

  /**
   * Revoke a permission from a role
   * Requirements: 5.5
   */
  async revokePermissionFromRole(tenantId: string, roleId: string, permissionId: string): Promise<void> {
    const client = this.supabase.getClient();

    // Validate role belongs to tenant
    const { data: role } = await client
      .from('roles')
      .select('id')
      .eq('id', roleId)
      .eq('tenant_id', tenantId)
      .single();

    if (!role) {
      throw new NotFoundException('Rol no encontrado en este tenant');
    }

    // Delete from rol_permisos table
    const { error } = await client
      .from('rol_permisos')
      .delete()
      .eq('role_id', roleId)
      .eq('permiso_id', permissionId);

    if (error) {
      console.error('Error revoking permission from role:', error);
      throw new BadRequestException('Error al revocar permiso del rol');
    }

    console.log('✅ [PERMISSION] Permiso revocado - Rol:', roleId, 'Permiso:', permissionId);
  }

  /**
   * Check if a user has a specific permission
   * Requirements: 5.2, 5.3
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
    const { data: usuario, error: userError } = await client
      .from('usuarios_sistema')
      .select('is_super_admin')
      .eq('id', userId)
      .single();

    if (!userError && usuario?.is_super_admin === true) {
      console.log('✅ [PERMISSION] SUPER_ADMIN detected - granting access');
      return true;
    }

    // Generate cache key
    const cacheKey = `${userId}:${tenantId}:${modulo}:${accion}:${recurso}`;
    
    // Check cache
    const cached = this.permissionCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.permissions.length > 0;
    }

    // Query user roles
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
      this.permissionCache.set(cacheKey, { permissions: [], timestamp: Date.now() });
      return false;
    }

    const roleIds = userRoles.map(ur => ur.role_id);

    // Query role permissions
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
      .in('role_id', roleIds)
      .eq('concedido', true);

    if (permissionsError) {
      console.error('Error fetching role permissions:', permissionsError);
      return false;
    }

    // Check if any role has the required permission
    const hasPermission = rolePermissions?.some(rp => {
      const permisos = Array.isArray(rp.permisos) ? rp.permisos : [rp.permisos];
      return permisos.some(p =>
        p &&
        p.tenant_id === tenantId &&
        p.modulo === modulo &&
        p.accion === accion &&
        p.recurso === recurso &&
        p.activo === true
      );
    }) || false;

    // Cache result
    this.permissionCache.set(cacheKey, {
      permissions: hasPermission ? [cacheKey] : [],
      timestamp: Date.now()
    });

    return hasPermission;
  }

  /**
   * Get all permissions for a user (aggregated from all roles)
   * Requirements: 5.6
   */
  async getUserPermissions(userId: string, tenantId: string): Promise<Permission[]> {
    const client = this.supabase.getClient();

    // Query user roles
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

    // Query all permissions from user's roles
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
      .in('role_id', roleIds)
      .eq('concedido', true);

    if (permissionsError) {
      console.error('Error fetching role permissions:', permissionsError);
      throw new BadRequestException('Error al obtener permisos del usuario');
    }

    // Extract permissions and filter by tenant and active status
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
}
