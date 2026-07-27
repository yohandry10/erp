import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { CreateRoleDto, UpdateRoleDto } from './dto';
import { Role } from './types';

// Re-export type for backward compatibility
export type { Role } from './types';

@Injectable()
export class RoleService {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Create a new role with optional initial permissions
   * Requirements: 5.1
   */
  async createRole(tenantId: string, roleData: CreateRoleDto): Promise<Role> {
    const client = this.supabase.getClient();

    // Check if role name already exists in tenant
    const { data: existingRole } = await client
      .from('roles')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('nombre', roleData.nombre)
      .single();

    if (existingRole) {
      throw new BadRequestException('Ya existe un rol con ese nombre en este tenant');
    }

    // Insert role with tenant_id
    const { data: newRole, error: insertError } = await client
      .from('roles')
      .insert({
        tenant_id: tenantId,
        nombre: roleData.nombre,
        descripcion: roleData.descripcion || '',
        is_system_role: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating role:', insertError);
      throw new BadRequestException('Error al crear rol');
    }

    // Optionally assign initial permissions
    if (roleData.permission_ids && roleData.permission_ids.length > 0) {
      await this.assignPermissionsToRole(tenantId, newRole.id, roleData.permission_ids);
    }

    console.log('✅ [ROLE] Rol creado - ID:', newRole.id, 'Nombre:', roleData.nombre);
    return newRole;
  }

  /**
   * Update role information
   * Requirements: 5.1
   */
  async updateRole(tenantId: string, roleId: string, roleData: UpdateRoleDto): Promise<Role> {
    const client = this.supabase.getClient();

    // Validate role belongs to tenant
    const { data: existingRole } = await client
      .from('roles')
      .select('id, is_system_role')
      .eq('id', roleId)
      .eq('tenant_id', tenantId)
      .single();

    if (!existingRole) {
      throw new NotFoundException('Rol no encontrado en este tenant');
    }

    // Prevent updating system roles
    if (existingRole.is_system_role) {
      throw new ForbiddenException('No se pueden modificar roles del sistema');
    }

    // Check if new name conflicts with existing role
    if (roleData.nombre) {
      const { data: conflictingRole } = await client
        .from('roles')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('nombre', roleData.nombre)
        .neq('id', roleId)
        .single();

      if (conflictingRole) {
        throw new BadRequestException('Ya existe un rol con ese nombre en este tenant');
      }
    }

    // Update role record
    const { data: updatedRole, error } = await client
      .from('roles')
      .update({
        ...roleData,
        updated_at: new Date().toISOString()
      })
      .eq('id', roleId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) {
      console.error('Error updating role:', error);
      throw new BadRequestException('Error al actualizar rol');
    }

    console.log('✅ [ROLE] Rol actualizado - ID:', roleId);
    return updatedRole;
  }

  /**
   * Delete a role (cascade deletes user_roles and rol_permisos)
   * Requirements: 5.1
   */
  async deleteRole(tenantId: string, roleId: string): Promise<void> {
    const client = this.supabase.getClient();

    // Validate role belongs to tenant
    const { data: existingRole } = await client
      .from('roles')
      .select('id, nombre, is_system_role')
      .eq('id', roleId)
      .eq('tenant_id', tenantId)
      .single();

    if (!existingRole) {
      throw new NotFoundException('Rol no encontrado en este tenant');
    }

    // Validate role is not system role
    if (existingRole.is_system_role) {
      throw new ForbiddenException('No se pueden eliminar roles del sistema');
    }

    // Delete role record (cascade will handle user_roles and rol_permisos)
    const { error } = await client
      .from('roles')
      .delete()
      .eq('id', roleId)
      .eq('tenant_id', tenantId);

    if (error) {
      console.error('Error deleting role:', error);
      throw new BadRequestException('Error al eliminar rol');
    }

    console.log('🗑️ [ROLE] Rol eliminado - ID:', roleId, 'Nombre:', existingRole.nombre);
  }

  /**
   * Get all roles for a tenant
   * Requirements: 5.1
   */
  async getRoles(tenantId: string): Promise<Role[]> {
    const client = this.supabase.getClient();

    const { data: roles, error } = await client
      .from('roles')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('nombre', { ascending: true });

    if (error) {
      console.error('Error fetching roles:', error);
      throw new BadRequestException('Error al obtener roles');
    }

    return roles || [];
  }

  /**
   * Get role by ID with permissions
   * Requirements: 5.1
   */
  async getRoleById(tenantId: string, roleId: string): Promise<any> {
    const client = this.supabase.getClient();

    // Query role by id and tenant_id
    const { data: role, error } = await client
      .from('roles')
      .select('*')
      .eq('id', roleId)
      .eq('tenant_id', tenantId)
      .single();

    if (error || !role) {
      throw new NotFoundException('Rol no encontrado');
    }

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
          descripcion,
          activo,
          created_at
        )
      `)
      .eq('role_id', roleId)
      .eq('concedido', true);

    if (permissionsError) {
      console.error('Error fetching role permissions:', permissionsError);
      throw new BadRequestException('Error al obtener permisos del rol');
    }

    // Extract permissions
    const permissions = rolePermissions
      ?.map(rp => rp.permisos)
      .flat()
      .filter(p => p && p.tenant_id === tenantId && p.activo) || [];

    return {
      ...role,
      permissions
    };
  }

  /**
   * Get users assigned to a role
   * Requirements: 5.1
   */
  async getRoleUsers(tenantId: string, roleId: string): Promise<any[]> {
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

    // Query usuarios_sistema joined with user_roles
    const { data: users, error } = await client
      .from('user_roles')
      .select(`
        usuario_sistema_id,
        usuarios_sistema (
          id,
          tenant_id,
          nombre,
          apellido,
          email,
          telefono,
          cargo,
          departamento,
          estado,
          created_at
        )
      `)
      .eq('role_id', roleId);

    if (error) {
      console.error('Error fetching role users:', error);
      throw new BadRequestException('Error al obtener usuarios del rol');
    }

    // Extract and filter users by tenant_id
    const roleUsers = users
      ?.map(ur => ur.usuarios_sistema)
      .flat()
      .filter(u => u && u.tenant_id === tenantId) || [];

    return roleUsers;
  }

  /**
   * Helper method to assign multiple permissions to a role
   * Used internally by createRole
   */
  private async assignPermissionsToRole(tenantId: string, roleId: string, permissionIds: string[]): Promise<void> {
    const client = this.supabase.getClient();

    // Validate permissions belong to tenant
    const { data: permissions } = await client
      .from('permisos')
      .select('id')
      .eq('tenant_id', tenantId)
      .in('id', permissionIds);

    if (!permissions || permissions.length !== permissionIds.length) {
      throw new BadRequestException('Uno o más permisos no pertenecen a este tenant');
    }

    // Insert permission assignments
    const permissionAssignments = permissionIds.map(permissionId => ({
      role_id: roleId,
      permiso_id: permissionId,
      concedido: true,
      created_at: new Date().toISOString()
    }));

    const { error } = await client
      .from('rol_permisos')
      .insert(permissionAssignments);

    if (error) {
      console.error('Error assigning permissions to role:', error);
      throw new BadRequestException('Error al asignar permisos al rol');
    }

    console.log('✅ [ROLE] Permisos asignados - Rol:', roleId, 'Permisos:', permissionIds.length);
  }
}
