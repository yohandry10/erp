import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { CreateRoleDto, UpdateRoleDto } from './dto';
import { Role } from './types';

export type { Role } from './types';

@Injectable()
export class RoleService {
  constructor(private readonly supabase: SupabaseService) {}

  private requireActor(actorId?: string): string {
    const actor = actorId?.trim();
    if (!actor) throw new ForbiddenException('Se requiere un usuario autenticado para administrar roles');
    return actor;
  }

  private throwRpcError(error: any, fallback: string): never {
    const message = `${error?.message || fallback}`;
    if (error?.code === 'P0002' || message.includes('_NOT_FOUND')) throw new NotFoundException(message);
    if (error?.code === '42501') throw new ForbiddenException(message);
    if (error?.code === '23505' || message.includes('_CONFLICT')) throw new ConflictException(message);
    throw new BadRequestException(message);
  }

  async createRole(tenantId: string, roleData: CreateRoleDto, actorId?: string): Promise<Role> {
    const actor = this.requireActor(actorId);
    const { data, error } = await this.supabase.getClient().rpc('crear_rol_rbac_tx', {
      p_tenant_id: tenantId,
      p_actor_id: actor,
      p_idempotency_key: roleData.idempotency_key,
      p_rol: { nombre: roleData.nombre, descripcion: roleData.descripcion },
      p_permission_ids: roleData.permission_ids || [],
    });
    if (error || !data) this.throwRpcError(error, 'Error al crear rol');
    return data as Role;
  }

  async updateRole(
    tenantId: string,
    roleId: string,
    roleData: UpdateRoleDto,
    actorId?: string,
  ): Promise<Role> {
    const actor = this.requireActor(actorId);
    const { permission_ids, ...changes } = roleData;
    const { data, error } = await this.supabase.getClient().rpc('actualizar_rol_rbac_tx', {
      p_rol_id: roleId,
      p_tenant_id: tenantId,
      p_actor_id: actor,
      p_cambios: changes,
      p_permission_ids: permission_ids ?? null,
    });
    if (error || !data) this.throwRpcError(error, 'Error al actualizar rol');
    return data as Role;
  }

  async deleteRole(tenantId: string, roleId: string, actorId?: string): Promise<void> {
    const actor = this.requireActor(actorId);
    const { error } = await this.supabase.getClient().rpc('desactivar_rol_rbac_tx', {
      p_rol_id: roleId,
      p_tenant_id: tenantId,
      p_actor_id: actor,
    });
    if (error) this.throwRpcError(error, 'Error al desactivar rol');
  }

  async getRoles(tenantId: string): Promise<Role[]> {
    const { data, error } = await this.supabase.getClient()
      .from('roles')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('activo', true)
      .order('nombre', { ascending: true });
    if (error) throw new BadRequestException(`Error al obtener roles: ${error.message}`);
    return (data || []) as Role[];
  }

  async getRoleById(tenantId: string, roleId: string): Promise<any> {
    const { data: role, error } = await this.supabase.getClient()
      .from('roles')
      .select('*')
      .eq('id', roleId)
      .eq('tenant_id', tenantId)
      .eq('activo', true)
      .single();
    if (error || !role) throw new NotFoundException('Rol no encontrado');
    const { data: links, error: permissionError } = await this.supabase.getClient()
      .from('rol_permisos')
      .select('permiso_id, concedido, permisos(id, tenant_id, modulo, accion, recurso, descripcion, activo, created_at)')
      .eq('role_id', roleId)
      .eq('concedido', true);
    if (permissionError) throw new BadRequestException('Error al obtener permisos del rol');
    const permissions = (links || [])
      .flatMap((link: any) => Array.isArray(link.permisos) ? link.permisos : [link.permisos])
      .filter((permission: any) => permission?.tenant_id === tenantId && permission?.activo);
    return { ...role, permissions };
  }

  async getRoleUsers(tenantId: string, roleId: string): Promise<any[]> {
    await this.getRoleById(tenantId, roleId);
    const { data, error } = await this.supabase.getClient()
      .from('user_roles')
      .select('usuario_sistema_id, usuarios_sistema!user_roles_usuario_sistema_id_fkey(id, tenant_id, nombre, apellido, email, telefono, cargo, departamento, estado, activo, created_at)')
      .eq('tenant_id', tenantId)
      .eq('role_id', roleId);
    if (error) throw new BadRequestException('Error al obtener usuarios del rol');
    return (data || [])
      .flatMap((item: any) => Array.isArray(item.usuarios_sistema) ? item.usuarios_sistema : [item.usuarios_sistema])
      .filter((user: any) => user?.tenant_id === tenantId);
  }
}
