import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import * as bcrypt from 'bcrypt';

export interface LoginDto {
  email: string;
  password: string;
}

export interface JwtPayload {
  sub: string;
  email: string;
  username?: string;
  roles?: string[];
  tenant_id: string; // ✅ MULTI-TENANT: Identificador del tenant
  is_super_admin: boolean; // Super-admin flag
}

@Injectable()
export class AuthService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string): Promise<any> {
    try {
      const user = await this.findUserByEmail(email);
      if (!user) {
        return null;
      }

      // Check if account is locked
      if (user.locked_until && new Date(user.locked_until) > new Date()) {
        throw new UnauthorizedException('Cuenta bloqueada temporalmente. Intente más tarde.');
      }

      // Verificar contraseña
      const isPasswordValid = await bcrypt.compare(password, user.password_hash);
      if (!isPasswordValid) {
        // Increment failed login attempts
        await this.incrementFailedLoginAttempts(user.id);
        return null;
      }

      // Reset failed login attempts on successful login
      await this.resetFailedLoginAttempts(user.id);

      // Verificar que el usuario esté activo
      if (user.estado !== 'ACTIVO') {
        throw new UnauthorizedException('Usuario inactivo');
      }

      const { password_hash, ...result } = user;
      return result;
    } catch (error) {
      console.error('Error validating user:', error);
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      return null;
    }
  }

  async login(loginDto: LoginDto) {
    const user = await this.validateUser(loginDto.email, loginDto.password);
    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Extract roles from user_roles join
    const roles = user.user_roles?.map((ur: any) => ({
      id: ur.roles?.id,
      nombre: ur.roles?.nombre,
      descripcion: ur.roles?.descripcion
    })) || [];

    const roleNames = roles.map((r: any) => r.nombre).filter(Boolean);

    // ✅ MULTI-TENANT: Incluir tenant_id y is_super_admin en el JWT
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      username: user.nombre_usuario || user.nombre,
      roles: roleNames,
      tenant_id: user.tenant_id,
 // Default tenant
      is_super_admin: user.is_super_admin || false
    };

    console.log('🔐 [AUTH] Login exitoso - Tenant:', payload.tenant_id, 'Usuario:', user.email, 'Super-Admin:', payload.is_super_admin, 'Roles:', roleNames);

    // Update last access timestamp
    await this.updateLastAccess(user.id);

    // Create session
    const sessionToken = await this.createSession(user.id, user.tenant_id);

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        nombre: user.nombre,
        apellido: user.apellido,
        nombre_usuario: user.nombre_usuario,
        roles: roles,
        tenant_id: user.tenant_id,
        is_super_admin: user.is_super_admin || false
      },
      session_token: sessionToken
    };
  }

  async validateToken(token: string): Promise<any> {
    try {
      const payload = this.jwtService.verify(token);
      const user = await this.findUserById(payload.sub);
      if (!user || !user.activo) {
        throw new UnauthorizedException('Token inválido');
      }
      return user;
    } catch (error) {
      throw new UnauthorizedException('Token inválido');
    }
  }

  private async findUserByEmail(email: string): Promise<any> {
    try {
      const client = this.supabaseService.getClient();
      
      // Primero obtener el usuario
      const { data: user, error: userError } = await client
        .from('usuarios_sistema')
        .select('*')
        .eq('email', email)
        .single();

      if (userError || !user) {
        console.error('Error finding user by email:', userError);
        return null;
      }

      // Luego obtener sus roles por separado
      const { data: userRoles, error: rolesError } = await client
        .from('user_roles')
        .select('role_id, roles(id, nombre, descripcion)')
        .eq('usuario_sistema_id', user.id);

      // Agregar roles al usuario
      user.user_roles = userRoles || [];

      return user;
    } catch (error) {
      console.error('Error in findUserByEmail:', error);
      return null;
    }
  }

  private async findUserById(id: string): Promise<any> {
    try {
      const client = this.supabaseService.getClient();
      const { data, error } = await client
        .from('usuarios_sistema')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        console.error('Error finding user by id:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error in findUserById:', error);
      return null;
    }
  }

  async refreshToken(user: any) {
    // ✅ MULTI-TENANT: Incluir tenant_id en refresh
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      username: user.nombre_usuario,
      roles: user.roles || [],
      tenant_id: user.tenant_id,

      is_super_admin: user.is_super_admin || false
    };

    return {
      access_token: this.jwtService.sign(payload)
    };
  }

  // Failed login attempt tracking
  private async incrementFailedLoginAttempts(userId: string): Promise<void> {
    try {
      const client = this.supabaseService.getClient();
      const user = await this.findUserById(userId);
      
      if (!user) return;

      const failedAttempts = (user.failed_login_attempts || 0) + 1;
      const updateData: any = {
        failed_login_attempts: failedAttempts,
        updated_at: new Date().toISOString()
      };

      // Lock account after 5 failed attempts
      if (failedAttempts >= 5) {
        const lockUntil = new Date();
        lockUntil.setMinutes(lockUntil.getMinutes() + 15); // Lock for 15 minutes
        updateData.locked_until = lockUntil.toISOString();
        console.log('🔒 [AUTH] Cuenta bloqueada por intentos fallidos - Usuario:', userId);
      }

      await client
        .from('usuarios_sistema')
        .update(updateData)
        .eq('id', userId);
    } catch (error) {
      console.error('Error incrementing failed login attempts:', error);
    }
  }

  private async resetFailedLoginAttempts(userId: string): Promise<void> {
    try {
      const client = this.supabaseService.getClient();
      await client
        .from('usuarios_sistema')
        .update({
          failed_login_attempts: 0,
          locked_until: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);
    } catch (error) {
      console.error('Error resetting failed login attempts:', error);
    }
  }

  private async updateLastAccess(userId: string): Promise<void> {
    try {
      const client = this.supabaseService.getClient();
      await client
        .from('usuarios_sistema')
        .update({
          fecha_ultimo_acceso: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);
    } catch (error) {
      console.error('Error updating last access:', error);
    }
  }

  // Password reset functionality
  async generatePasswordResetToken(email: string): Promise<string> {
    try {
      const user = await this.findUserByEmail(email);
      if (!user) {
        throw new UnauthorizedException('Usuario no encontrado');
      }

      // Generate secure reset token
      const crypto = require('crypto');
      const resetToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = await bcrypt.hash(resetToken, 10);

      // Set token expiration to 24 hours
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      const client = this.supabaseService.getClient();
      await client
        .from('usuarios_sistema')
        .update({
          password_reset_token: hashedToken,
          password_reset_expires: expiresAt.toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      console.log('🔑 [AUTH] Token de reset generado - Usuario:', user.email);
      return resetToken; // Return unhashed token to send via email
    } catch (error) {
      console.error('Error generating password reset token:', error);
      throw error;
    }
  }

  async validatePasswordResetToken(email: string, token: string): Promise<boolean> {
    try {
      const user = await this.findUserByEmail(email);
      if (!user || !user.password_reset_token || !user.password_reset_expires) {
        return false;
      }

      // Check if token is expired
      if (new Date(user.password_reset_expires) < new Date()) {
        console.log('⚠️ [AUTH] Token de reset expirado - Usuario:', user.email);
        return false;
      }

      // Validate token
      const isValid = await bcrypt.compare(token, user.password_reset_token);
      return isValid;
    } catch (error) {
      console.error('Error validating password reset token:', error);
      return false;
    }
  }

  async resetPassword(email: string, token: string, newPassword: string): Promise<void> {
    try {
      const isValid = await this.validatePasswordResetToken(email, token);
      if (!isValid) {
        throw new UnauthorizedException('Token inválido o expirado');
      }

      const user = await this.findUserByEmail(email);
      if (!user) {
        throw new UnauthorizedException('Usuario no encontrado');
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      const client = this.supabaseService.getClient();
      await client
        .from('usuarios_sistema')
        .update({
          password_hash: hashedPassword,
          password_reset_token: null,
          password_reset_expires: null,
          failed_login_attempts: 0,
          locked_until: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      // Revoke all existing sessions
      await this.revokeUserSessions(user.id);

      console.log('✅ [AUTH] Contraseña reseteada - Usuario:', user.email);
    } catch (error) {
      console.error('Error resetting password:', error);
      throw error;
    }
  }

  // Tenant switching for super-admins
  async switchTenant(userId: string, targetTenantId: string): Promise<any> {
    try {
      const user = await this.findUserById(userId);
      if (!user) {
        throw new UnauthorizedException('Usuario no encontrado');
      }

      // Validate user is super-admin
      if (!user.is_super_admin) {
        throw new UnauthorizedException('Solo super-admins pueden cambiar de tenant');
      }

      // Validate target tenant exists
      const client = this.supabaseService.getClient();
      const { data: tenant, error } = await client
        .from('tenants')
        .select('id, nombre, estado')
        .eq('id', targetTenantId)
        .single();

      if (error || !tenant) {
        throw new UnauthorizedException('Tenant no encontrado');
      }

      if (tenant.estado !== 'ACTIVO') {
        throw new UnauthorizedException('Tenant no está activo');
      }

      // Generate new JWT with target tenant_id
      const payload: JwtPayload = {
        sub: user.id,
        email: user.email,
        username: user.nombre_usuario || user.nombre,
        roles: user.roles || [],
        tenant_id: targetTenantId,
        is_super_admin: true // Maintain super-admin flag
      };

      // Log tenant switch action to audit_log
      await client
        .from('audit_log')
        .insert({
          table_name: 'usuarios_sistema',
          operation: 'UPDATE',
          old_values: { tenant_id: user.tenant_id },
          new_values: { tenant_id: targetTenantId },
          user_id: user.id,
          tenant_id: targetTenantId,
          timestamp: new Date().toISOString()
        });

      console.log('🔄 [AUTH] Tenant switch - Usuario:', user.email, 'De:', user.tenant_id, 'A:', targetTenantId);

      return {
        access_token: this.jwtService.sign(payload),
        tenant: {
          id: tenant.id,
          nombre: tenant.nombre
        }
      };
    } catch (error) {
      console.error('Error switching tenant:', error);
      throw error;
    }
  }

  // Session management
  private async createSession(userId: string, tenantId: string): Promise<string> {
    try {
      const crypto = require('crypto');
      const sessionToken = crypto.randomBytes(32).toString('hex');
      
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 8); // 8 hours session

      const client = this.supabaseService.getClient();
      await client
        .from('user_sessions')
        .insert({
          usuario_sistema_id: userId,
          tenant_id: tenantId,
          session_token: sessionToken,
          expires_at: expiresAt.toISOString(),
          last_activity: new Date().toISOString(),
          created_at: new Date().toISOString()
        });

      return sessionToken;
    } catch (error) {
      console.error('Error creating session:', error);
      throw error;
    }
  }

  async validateSession(sessionToken: string): Promise<boolean> {
    try {
      const client = this.supabaseService.getClient();
      const { data: session, error } = await client
        .from('user_sessions')
        .select('*')
        .eq('session_token', sessionToken)
        .single();

      if (error || !session) {
        return false;
      }

      // Check if session is expired
      if (new Date(session.expires_at) < new Date()) {
        await this.revokeSession(sessionToken);
        return false;
      }

      // Update last activity
      await client
        .from('user_sessions')
        .update({ last_activity: new Date().toISOString() })
        .eq('session_token', sessionToken);

      return true;
    } catch (error) {
      console.error('Error validating session:', error);
      return false;
    }
  }

  async revokeSession(sessionToken: string): Promise<void> {
    try {
      const client = this.supabaseService.getClient();
      await client
        .from('user_sessions')
        .delete()
        .eq('session_token', sessionToken);
    } catch (error) {
      console.error('Error revoking session:', error);
    }
  }

  async revokeUserSessions(userId: string): Promise<void> {
    try {
      const client = this.supabaseService.getClient();
      await client
        .from('user_sessions')
        .delete()
        .eq('usuario_sistema_id', userId);
      
      console.log('🔒 [AUTH] Sesiones revocadas - Usuario:', userId);
    } catch (error) {
      console.error('Error revoking user sessions:', error);
    }
  }

  async cleanupExpiredSessions(): Promise<void> {
    try {
      const client = this.supabaseService.getClient();
      const { data, error } = await client
        .from('user_sessions')
        .delete()
        .lt('expires_at', new Date().toISOString());

      if (!error) {
        console.log('🧹 [AUTH] Sesiones expiradas limpiadas');
      }
    } catch (error) {
      console.error('Error cleaning up expired sessions:', error);
    }
  }
}
