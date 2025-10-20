import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { CreateUserDto, UpdateUserDto, UserFiltersDto } from './dto';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class UserManagementService {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Create a new user with tenant isolation
   * Requirements: 2.1, 6.1
   */
  async createUser(tenantId: string, userData: CreateUserDto) {
    const client = this.supabase.getClient();

    // Validate email uniqueness within tenant
    const { data: existingUser } = await client
      .from('usuarios_sistema')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('email', userData.email)
      .single();

    if (existingUser) {
      throw new ConflictException('El email ya está registrado en este tenant');
    }

    // Generate temporary password if not provided
    const password = userData.password || this.generateTemporaryPassword();
    
    // Hash password with bcrypt
    const passwordHash = await bcrypt.hash(password, 10);

    // Insert user with tenant_id
    const { data: newUser, error: insertError } = await client
      .from('usuarios_sistema')
      .insert({
        tenant_id: tenantId,
        nombre: userData.nombre,
        apellido: userData.apellido,
        email: userData.email,
        password_hash: passwordHash,
        telefono: userData.telefono,
        cargo: userData.cargo,
        departamento: userData.departamento,
        estado: 'ACTIVO',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating user:', insertError);
      throw new BadRequestException('Error al crear usuario');
    }

    // Assign roles if provided
    if (userData.roles && userData.roles.length > 0) {
      await this.assignRoles(tenantId, newUser.id, userData.roles);
    }

    // TODO: Send activation email with credentials
    console.log('📧 [USER-MGMT] Email de activación pendiente - Usuario:', userData.email, 'Password temporal:', password);

    const { password_hash, ...userWithoutPassword } = newUser;
    return {
      ...userWithoutPassword,
      temporaryPassword: password // Return for testing purposes
    };
  }

  /**
   * Update user information
   * Requirements: 2.2
   */
  async updateUser(tenantId: string, userId: string, userData: UpdateUserDto) {
    const client = this.supabase.getClient();

    // Validate user belongs to tenant
    const { data: existingUser } = await client
      .from('usuarios_sistema')
      .select('id')
      .eq('id', userId)
      .eq('tenant_id', tenantId)
      .single();

    if (!existingUser) {
      throw new NotFoundException('Usuario no encontrado en este tenant');
    }

    // Update user record
    const { data: updatedUser, error } = await client
      .from('usuarios_sistema')
      .update({
        ...userData,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) {
      console.error('Error updating user:', error);
      throw new BadRequestException('Error al actualizar usuario');
    }

    const { password_hash, ...userWithoutPassword } = updatedUser;
    return userWithoutPassword;
  }

  /**
   * Delete user
   * Requirements: 2.3
   */
  async deleteUser(tenantId: string, userId: string): Promise<void> {
    const client = this.supabase.getClient();

    // Validate user belongs to tenant
    const { data: existingUser } = await client
      .from('usuarios_sistema')
      .select('id, email')
      .eq('id', userId)
      .eq('tenant_id', tenantId)
      .single();

    if (!existingUser) {
      throw new NotFoundException('Usuario no encontrado en este tenant');
    }

    // Delete user record (cascade will handle user_roles)
    const { error } = await client
      .from('usuarios_sistema')
      .delete()
      .eq('id', userId)
      .eq('tenant_id', tenantId);

    if (error) {
      console.error('Error deleting user:', error);
      throw new BadRequestException('Error al eliminar usuario');
    }

    // Log deletion to audit_log
    await client
      .from('audit_log')
      .insert({
        table_name: 'usuarios_sistema',
        operation: 'DELETE',
        old_values: { id: userId, email: existingUser.email },
        user_id: userId,
        tenant_id: tenantId,
        timestamp: new Date().toISOString()
      });

    console.log('🗑️ [USER-MGMT] Usuario eliminado - ID:', userId, 'Email:', existingUser.email);
  }

  /**
   * Get users with filters and pagination
   * Requirements: 2.8
   */
  async getUsers(tenantId: string, filters?: UserFiltersDto) {
    const client = this.supabase.getClient();
    
    const page = filters?.page || 1;
    const limit = filters?.limit || 50;
    const offset = (page - 1) * limit;

    let query = client
      .from('usuarios_sistema')
      .select('*, user_roles(role_id, roles(id, nombre))', { count: 'exact' })
      .eq('tenant_id', tenantId);

    // Apply search filter
    if (filters?.search) {
      query = query.or(`nombre.ilike.%${filters.search}%,email.ilike.%${filters.search}%`);
    }

    // Apply estado filter
    if (filters?.estado) {
      query = query.eq('estado', filters.estado);
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1).order('created_at', { ascending: false });

    const { data, error, count } = await query;

    if (error) {
      console.error('Error fetching users:', error);
      throw new BadRequestException('Error al obtener usuarios');
    }

    // Remove password_hash from results
    const users = data.map(user => {
      const { password_hash, password_reset_token, ...userWithoutSensitiveData } = user;
      return userWithoutSensitiveData;
    });

    return {
      data: users,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit)
      }
    };
  }

  /**
   * Get user by ID with roles
   * Requirements: 2.8
   */
  async getUserById(tenantId: string, userId: string) {
    const client = this.supabase.getClient();

    const { data: user, error } = await client
      .from('usuarios_sistema')
      .select('*, user_roles(role_id, roles(id, nombre, descripcion))')
      .eq('id', userId)
      .eq('tenant_id', tenantId)
      .single();

    if (error || !user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const { password_hash, password_reset_token, ...userWithoutSensitiveData } = user;
    return userWithoutSensitiveData;
  }

  /**
   * Assign roles to user
   * Requirements: 2.5
   */
  async assignRoles(tenantId: string, userId: string, roleIds: string[]): Promise<void> {
    const client = this.supabase.getClient();

    // Validate user belongs to tenant
    const { data: user } = await client
      .from('usuarios_sistema')
      .select('id')
      .eq('id', userId)
      .eq('tenant_id', tenantId)
      .single();

    if (!user) {
      throw new NotFoundException('Usuario no encontrado en este tenant');
    }

    // Validate roles belong to tenant
    const { data: roles } = await client
      .from('roles')
      .select('id')
      .eq('tenant_id', tenantId)
      .in('id', roleIds);

    if (!roles || roles.length !== roleIds.length) {
      throw new BadRequestException('Uno o más roles no pertenecen a este tenant');
    }

    // Get existing role assignments
    const { data: existingRoles } = await client
      .from('user_roles')
      .select('role_id')
      .eq('usuario_sistema_id', userId);

    const existingRoleIds = existingRoles?.map(r => r.role_id) || [];

    // Filter out roles that are already assigned (prevent duplicates)
    const newRoleIds = roleIds.filter(roleId => !existingRoleIds.includes(roleId));

    if (newRoleIds.length === 0) {
      console.log('⚠️ [USER-MGMT] Todos los roles ya están asignados');
      return;
    }

    // Insert records into user_roles table
    const roleAssignments = newRoleIds.map(roleId => ({
      usuario_sistema_id: userId,
      role_id: roleId,
      created_at: new Date().toISOString()
    }));

    const { error } = await client
      .from('user_roles')
      .insert(roleAssignments);

    if (error) {
      console.error('Error assigning roles:', error);
      throw new BadRequestException('Error al asignar roles');
    }

    console.log('✅ [USER-MGMT] Roles asignados - Usuario:', userId, 'Roles:', newRoleIds);
  }

  /**
   * Remove roles from user
   * Requirements: 2.5
   */
  async removeRoles(tenantId: string, userId: string, roleIds: string[]): Promise<void> {
    const client = this.supabase.getClient();

    // Validate user belongs to tenant
    const { data: user } = await client
      .from('usuarios_sistema')
      .select('id')
      .eq('id', userId)
      .eq('tenant_id', tenantId)
      .single();

    if (!user) {
      throw new NotFoundException('Usuario no encontrado en este tenant');
    }

    // Delete records from user_roles table
    const { error } = await client
      .from('user_roles')
      .delete()
      .eq('usuario_sistema_id', userId)
      .in('role_id', roleIds);

    if (error) {
      console.error('Error removing roles:', error);
      throw new BadRequestException('Error al remover roles');
    }

    console.log('✅ [USER-MGMT] Roles removidos - Usuario:', userId, 'Roles:', roleIds);
  }

  /**
   * Activate user
   * Requirements: 6.5
   */
  async activateUser(tenantId: string, userId: string) {
    const client = this.supabase.getClient();

    const { data: user, error } = await client
      .from('usuarios_sistema')
      .update({
        estado: 'ACTIVO',
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error || !user) {
      throw new NotFoundException('Usuario no encontrado en este tenant');
    }

    const { password_hash, ...userWithoutPassword } = user;
    console.log('✅ [USER-MGMT] Usuario activado - ID:', userId);
    return userWithoutPassword;
  }

  /**
   * Deactivate user and revoke sessions
   * Requirements: 2.6, 6.4
   */
  async deactivateUser(tenantId: string, userId: string) {
    const client = this.supabase.getClient();

    // Update estado to INACTIVO
    const { data: user, error } = await client
      .from('usuarios_sistema')
      .update({
        estado: 'INACTIVO',
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error || !user) {
      throw new NotFoundException('Usuario no encontrado en este tenant');
    }

    // Revoke all active sessions
    await client
      .from('user_sessions')
      .delete()
      .eq('usuario_sistema_id', userId);

    const { password_hash, ...userWithoutPassword } = user;
    console.log('🔒 [USER-MGMT] Usuario desactivado y sesiones revocadas - ID:', userId);
    return userWithoutPassword;
  }

  /**
   * Reset user password
   * Requirements: 6.3
   */
  async resetPassword(tenantId: string, userId: string) {
    const client = this.supabase.getClient();

    // Validate user belongs to tenant
    const { data: user } = await client
      .from('usuarios_sistema')
      .select('id, email')
      .eq('id', userId)
      .eq('tenant_id', tenantId)
      .single();

    if (!user) {
      throw new NotFoundException('Usuario no encontrado en este tenant');
    }

    // Generate secure reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = await bcrypt.hash(resetToken, 10);

    // Set token expiration (24 hours)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    // Update password_reset_token and password_reset_expires
    const { error } = await client
      .from('usuarios_sistema')
      .update({
        password_reset_token: hashedToken,
        password_reset_expires: expiresAt.toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .eq('tenant_id', tenantId);

    if (error) {
      console.error('Error resetting password:', error);
      throw new BadRequestException('Error al resetear contraseña');
    }

    // TODO: Send password reset email
    console.log('📧 [USER-MGMT] Email de reset pendiente - Usuario:', user.email, 'Token:', resetToken);

    return {
      message: 'Token de reset generado exitosamente',
      resetToken, // Return for testing purposes
      expiresAt
    };
  }

  /**
   * Generate a secure temporary password
   */
  private generateTemporaryPassword(): string {
    const length = 12;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    
    for (let i = 0; i < length; i++) {
      const randomIndex = crypto.randomInt(0, charset.length);
      password += charset[randomIndex];
    }
    
    return password;
  }
}
