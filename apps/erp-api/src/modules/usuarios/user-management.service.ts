import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { EmailService } from '../../shared/email/email.service';
import { PermissionService } from '../permissions/permission.service';
import { sanitizePostgrestSearch } from '../../common/util/postgrest.util';
import { CreateUserDto, UpdateUserDto, UserFiltersDto } from './dto';

const USER_SAFE_SELECT = `
  id, tenant_id, email, nombre, apellido, telefono, cargo, departamento,
  estado, activo, is_super_admin, is_demo_user, fecha_ultimo_acceso,
  created_at, updated_at,
  user_roles!user_roles_usuario_sistema_id_fkey(role_id, roles(id, nombre, descripcion, activo))
`;

@Injectable()
export class UserManagementService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly emailService: EmailService,
    private readonly permissionService: PermissionService,
  ) {}

  private requireActor(actorId?: string): string {
    const actor = actorId?.trim();
    if (!actor) throw new ForbiddenException('Se requiere un usuario autenticado para administrar accesos');
    return actor;
  }

  private throwRpcError(error: any, fallback: string): never {
    const message = `${error?.message || fallback}`;
    if (error?.code === 'P0002' || message.includes('_NOT_FOUND')) throw new NotFoundException(message);
    if (error?.code === '42501' || message.includes('ADMIN_ACTOR') || message.includes('CROSS_TENANT')) {
      throw new ForbiddenException(message);
    }
    if (error?.code === '23505' || message.includes('_CONFLICT')) throw new ConflictException(message);
    throw new BadRequestException(message);
  }

  async createUser(tenantId: string, userData: CreateUserDto, actorId?: string) {
    const actor = this.requireActor(actorId);
    const password = userData.password || this.generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(password, 10);
    const { data, error } = await this.supabase.getClient().rpc('crear_usuario_rbac_tx', {
      p_tenant_id: tenantId,
      p_actor_id: actor,
      p_idempotency_key: userData.idempotency_key,
      p_usuario: {
        nombre: userData.nombre,
        apellido: userData.apellido,
        email: userData.email,
        telefono: userData.telefono,
        cargo: userData.cargo,
        departamento: userData.departamento,
        estado: 'ACTIVO',
        password_hash: passwordHash,
      },
      p_role_ids: userData.roles,
    });
    if (error || !data) this.throwRpcError(error, 'Error al crear usuario');

    if (!(data as any).idempotent) {
      try {
        const name = `${userData.nombre} ${userData.apellido || ''}`.trim() || userData.email;
        await this.emailService.sendUserActivationEmail(userData.email, name, password);
      } catch (emailError) {
        console.warn('[USER-MGMT] Usuario creado; no se pudo enviar activación:', emailError);
      }
    }
    return { ...(data as any), temporaryPassword: password };
  }

  async createFirstAdmin(
    tenantId: string,
    userData: Omit<CreateUserDto, 'roles'>,
    adminRoleId: string,
  ) {
    const password = userData.password || this.generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(password, 10);
    const { data, error } = await this.supabase.getClient().rpc('crear_primer_admin_tenant_tx', {
      p_tenant_id: tenantId,
      p_idempotency_key: userData.idempotency_key,
      p_usuario: {
        nombre: userData.nombre,
        apellido: userData.apellido,
        email: userData.email,
        telefono: userData.telefono,
        cargo: userData.cargo,
        departamento: userData.departamento,
        password_hash: passwordHash,
      },
      p_admin_role_id: adminRoleId,
    });
    if (error || !data) this.throwRpcError(error, 'Error al crear el primer administrador');
    try {
      const name = `${userData.nombre} ${userData.apellido || ''}`.trim() || userData.email;
      await this.emailService.sendUserActivationEmail(userData.email, name, password);
    } catch (emailError) {
      console.warn('[USER-MGMT] Primer admin creado; no se pudo enviar activación:', emailError);
    }
    return { ...(data as any), temporaryPassword: password };
  }

  async updateUser(
    tenantId: string,
    userId: string,
    userData: UpdateUserDto,
    actorId?: string,
  ) {
    const actor = this.requireActor(actorId);
    const { roles, ...changes } = userData;
    const { data, error } = await this.supabase.getClient().rpc('actualizar_usuario_rbac_tx', {
      p_usuario_id: userId,
      p_tenant_id: tenantId,
      p_actor_id: actor,
      p_cambios: changes,
      p_role_ids: roles ?? null,
    });
    if (error || !data) this.throwRpcError(error, 'Error al actualizar usuario');
    this.permissionService.invalidateUserPermissions(userId);
    return data;
  }

  async deleteUser(tenantId: string, userId: string, actorId?: string): Promise<void> {
    await this.changeStatus(tenantId, userId, 'INACTIVO', actorId);
  }

  async getUsers(tenantId: string, filters?: UserFiltersDto) {
    const page = filters?.page || 1;
    const limit = filters?.limit || 50;
    const offset = (page - 1) * limit;
    let query = this.supabase.getClient()
      .from('usuarios_sistema')
      .select(USER_SAFE_SELECT, { count: 'exact' })
      .eq('tenant_id', tenantId);
    if (filters?.search) {
      const safe = sanitizePostgrestSearch(filters.search);
      if (safe) query = query.or(`nombre.ilike.%${safe}%,email.ilike.%${safe}%`);
    }
    if (filters?.estado) query = query.eq('estado', filters.estado);
    const { data, error, count } = await query
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false });
    if (error) throw new BadRequestException(`Error al obtener usuarios: ${error.message}`);
    const users = (data || []).map((user: any) => ({
      ...user,
      roles: (user.user_roles || [])
        .flatMap((link: any) => Array.isArray(link.roles) ? link.roles : [link.roles])
        .filter((role: any) => role?.activo !== false),
    }));
    return {
      data: users,
      pagination: { page, limit, total: count || 0, totalPages: Math.ceil((count || 0) / limit) },
    };
  }

  async getUserById(tenantId: string, userId: string) {
    const { data, error } = await this.supabase.getClient()
      .from('usuarios_sistema')
      .select(USER_SAFE_SELECT)
      .eq('id', userId)
      .eq('tenant_id', tenantId)
      .single();
    if (error || !data) throw new NotFoundException('Usuario no encontrado');
    return {
      ...data,
      roles: ((data as any).user_roles || [])
        .flatMap((link: any) => Array.isArray(link.roles) ? link.roles : [link.roles])
        .filter((role: any) => role?.activo !== false),
    };
  }

  async assignRoles(
    tenantId: string,
    userId: string,
    roleIds: string[],
    actorId?: string,
  ): Promise<void> {
    const actor = this.requireActor(actorId);
    const { error } = await this.supabase.getClient().rpc('asignar_roles_usuario_rbac_tx', {
      p_usuario_id: userId,
      p_tenant_id: tenantId,
      p_actor_id: actor,
      p_role_ids: roleIds,
      p_mode: 'ADD',
    });
    if (error) this.throwRpcError(error, 'Error al asignar roles');
    this.permissionService.invalidateUserPermissions(userId);
  }

  async removeRoles(
    tenantId: string,
    userId: string,
    roleIds: string[],
    actorId?: string,
  ): Promise<void> {
    const actor = this.requireActor(actorId);
    const { error } = await this.supabase.getClient().rpc('asignar_roles_usuario_rbac_tx', {
      p_usuario_id: userId,
      p_tenant_id: tenantId,
      p_actor_id: actor,
      p_role_ids: roleIds,
      p_mode: 'REMOVE',
    });
    if (error) this.throwRpcError(error, 'Error al remover roles');
    this.permissionService.invalidateUserPermissions(userId);
  }

  private async changeStatus(
    tenantId: string,
    userId: string,
    estado: 'ACTIVO' | 'INACTIVO' | 'SUSPENDIDO',
    actorId?: string,
  ) {
    const actor = this.requireActor(actorId);
    const { data, error } = await this.supabase.getClient().rpc('cambiar_estado_usuario_rbac_tx', {
      p_usuario_id: userId,
      p_tenant_id: tenantId,
      p_actor_id: actor,
      p_estado: estado,
    });
    if (error || !data) this.throwRpcError(error, 'Error al cambiar estado del usuario');
    this.permissionService.invalidateUserPermissions(userId);
    return data;
  }

  async activateUser(tenantId: string, userId: string, actorId?: string) {
    return this.changeStatus(tenantId, userId, 'ACTIVO', actorId);
  }

  async deactivateUser(tenantId: string, userId: string, actorId?: string) {
    return this.changeStatus(tenantId, userId, 'INACTIVO', actorId);
  }

  async resetPassword(tenantId: string, userId: string, actorId?: string) {
    const actor = this.requireActor(actorId);
    const user = await this.getUserById(tenantId, userId);
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = await bcrypt.hash(resetToken, 10);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const { error } = await this.supabase.getClient().rpc('registrar_reset_usuario_rbac_tx', {
      p_usuario_id: userId,
      p_tenant_id: tenantId,
      p_actor_id: actor,
      p_token_hash: hashedToken,
      p_expires_at: expiresAt.toISOString(),
    });
    if (error) this.throwRpcError(error, 'Error al generar reset de contraseña');
    try {
      const name = `${(user as any).nombre || ''} ${(user as any).apellido || ''}`.trim() || (user as any).email;
      await this.emailService.sendPasswordResetEmail((user as any).email, name, resetToken);
    } catch (emailError) {
      console.warn('[USER-MGMT] Reset registrado; no se pudo enviar email:', emailError);
    }
    return { message: 'Solicitud de reset generada exitosamente', expiresAt };
  }

  async rotateDemoCredential(
    tenantId: string,
    userId: string,
    password: string,
    profile: { nombre?: string; apellido?: string },
    actorId?: string,
  ) {
    const actor = this.requireActor(actorId);
    const passwordHash = await bcrypt.hash(password, 10);
    const { data, error } = await this.supabase.getClient().rpc('actualizar_credencial_demo_usuario_rbac_tx', {
      p_usuario_id: userId,
      p_tenant_id: tenantId,
      p_actor_id: actor,
      p_password_hash: passwordHash,
      p_perfil: profile,
    });
    if (error || !data) this.throwRpcError(error, 'Error al actualizar credencial demo');
    this.permissionService.invalidateUserPermissions(userId);
    return data;
  }

  async clearDemoUsers(tenantId: string, actorId?: string) {
    const actor = this.requireActor(actorId);
    const { data, error } = await this.supabase.getClient().rpc('desmarcar_usuarios_demo_rbac_tx', {
      p_tenant_id: tenantId,
      p_actor_id: actor,
    });
    if (error || !data) this.throwRpcError(error, 'Error al cerrar usuarios demo');
    return data;
  }

  private generateTemporaryPassword(): string {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 12; i += 1) password += charset[crypto.randomInt(0, charset.length)];
    return password;
  }
}
