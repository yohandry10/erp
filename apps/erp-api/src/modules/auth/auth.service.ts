import { Injectable, UnauthorizedException, Logger, InternalServerErrorException, Inject, forwardRef } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { EmailService } from '../../shared/email/email.service';
import { PermissionService } from '../permissions/permission.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

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
  private readonly logger = new Logger(AuthService.name);
  
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
    @Inject(forwardRef(() => PermissionService))
    private readonly permissionService?: PermissionService,
  ) {}

  async validateUser(email: string, password: string): Promise<any> {
    try {
      const user = await this.findUserByEmail(email);
      if (!user) {
        return null;
      }

      // Check if account is locked
      if (user.locked_until && new Date(user.locked_until) > new Date()) {
        // ✅ A5: Este caso se registrará en el método login cuando capture la excepción
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
        // ✅ A5: Este caso se registrará en el método login cuando capture la excepción
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

  // ✅ A5: Método para registrar intentos de login
  private async logLoginAttempt(data: {
    email: string;
    ipAddress: string;
    userAgent: string;
    success: boolean;
    failedReason?: string;
    tenantId?: string | null;
  }): Promise<void> {
    try {
      // Usar cliente público porque el login NO tiene tenant context
      const client = this.supabaseService.getPublicClient();
      await client
        .from('auth_login_attempts')
        .insert({
          user_email: data.email,
          ip_address: data.ipAddress,
          user_agent: data.userAgent,
          success: data.success,
          failed_reason: data.failedReason || null,
          tenant_id: data.tenantId || null,
          created_at: new Date().toISOString(),
        });
    } catch (error) {
      // No bloquear el flujo si falla el registro de intentos
      this.logger.error('Error registrando intento de login:', error);
    }
  }

  // ✅ A5: Verificar si hay demasiados intentos fallidos recientes
  private async checkFailedAttemptsLimit(email: string, minutesWindow: number = 15, maxAttempts: number = 5): Promise<boolean> {
    try {
      // Usar cliente público porque el login NO tiene tenant context
      const client = this.supabaseService.getPublicClient();
      const cutoffTime = new Date();
      cutoffTime.setMinutes(cutoffTime.getMinutes() - minutesWindow);

      const { data: attempts, error } = await client
        .from('auth_login_attempts')
        .select('id')
        .eq('user_email', email)
        .eq('success', false)
        .gte('created_at', cutoffTime.toISOString());

      if (error) {
        this.logger.error('Error verificando intentos fallidos:', error);
        return false; // No bloquear si hay error en la consulta
      }

      return (attempts?.length || 0) >= maxAttempts;
    } catch (error) {
      this.logger.error('Error en checkFailedAttemptsLimit:', error);
      return false;
    }
  }

  async login(loginDto: LoginDto, ipAddress?: string, userAgent?: string) {
    // ✅ A5: Verificar límite de intentos fallidos antes de procesar
    const hasTooManyAttempts = await this.checkFailedAttemptsLimit(loginDto.email);
    if (hasTooManyAttempts) {
      await this.logLoginAttempt({
        email: loginDto.email,
        ipAddress: ipAddress || 'unknown',
        userAgent: userAgent || 'unknown',
        success: false,
        failedReason: 'Demasiados intentos fallidos recientes',
        tenantId: null,
      });
      throw new UnauthorizedException('Demasiados intentos fallidos. Intente más tarde.');
    }

    try {
      const user = await this.validateUser(loginDto.email, loginDto.password);
      if (!user) {
        // ✅ A5: Registrar intento fallido
        await this.logLoginAttempt({
          email: loginDto.email,
          ipAddress: ipAddress || 'unknown',
          userAgent: userAgent || 'unknown',
          success: false,
          failedReason: 'Credenciales inválidas',
          tenantId: null, // No sabemos el tenant si el usuario no existe
        });
        
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
        is_super_admin: user.is_super_admin || false
      };

      console.log('🔐 [AUTH] Login exitoso - Tenant:', payload.tenant_id, 'Usuario:', user.email, 'Super-Admin:', payload.is_super_admin, 'Roles:', roleNames);

      // Update last access timestamp
      await this.updateLastAccess(user.id);

      // Create session
      const sessionToken = await this.createSession(user.id, user.tenant_id);

      // ✅ A5: Registrar intento exitoso
      await this.logLoginAttempt({
        email: loginDto.email,
        ipAddress: ipAddress || 'unknown',
        userAgent: userAgent || 'unknown',
        success: true,
        tenantId: user.tenant_id,
      });

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
    } catch (error) {
      // ✅ A5: Registrar intento fallido con razón específica
      if (error instanceof UnauthorizedException) {
        // Obtener tenant_id si el usuario existe (para casos de cuenta bloqueada/inactiva)
        let tenantIdForLogging: string | null = null;
        if (error.message.includes('bloqueada') || error.message.includes('inactivo')) {
          try {
            const user = await this.findUserByEmail(loginDto.email);
            if (user) {
              tenantIdForLogging = user.tenant_id || null;
            }
          } catch (e) {
            // Ignorar errores al obtener tenant_id
          }
        }

        const failedReason = error.message || 'Error de autenticación';
        await this.logLoginAttempt({
          email: loginDto.email,
          ipAddress: ipAddress || 'unknown',
          userAgent: userAgent || 'unknown',
          success: false,
          failedReason,
          tenantId: tenantIdForLogging,
        });
      }
      throw error;
    }
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
      // Usar cliente público porque el login NO tiene tenant context
      const client = this.supabaseService.getPublicClient();
      
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

  // ✅ A3: Método público para validación de usuario en guard
  async findUserById(id: string): Promise<any> {
    try {
      // Usar cliente público para validación de tokens
      const client = this.supabaseService.getPublicClient();
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
      // Usar cliente público porque el login NO tiene tenant context
      const client = this.supabaseService.getPublicClient();
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
      // Usar cliente público porque el login NO tiene tenant context
      const client = this.supabaseService.getPublicClient();
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
      // Usar cliente público porque el login NO tiene tenant context
      const client = this.supabaseService.getPublicClient();
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
  async generatePasswordResetToken(email: string, clientIp?: string): Promise<string> {
    try {
      // ✅ A2: Validar que existe proveedor de email configurado
      if (!this.emailService.isConfigured()) {
        this.logger.error('Email service not configured - cannot send password reset');
        throw new InternalServerErrorException(
          'Servicio de email no configurado. No es posible enviar reset de contraseña.'
        );
      }

      const user = await this.findUserByEmail(email);
      if (!user) {
        // ✅ SEGURIDAD: Log de intento de reset para usuario inexistente
        this.logger.warn(
          `Password reset attempt for non-existent user: ${email} from IP: ${clientIp || 'unknown'}`
        );
        throw new UnauthorizedException('Usuario no encontrado');
      }

      // Generate secure reset token (32 bytes = 64 hex characters)
      const resetToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = await bcrypt.hash(resetToken, 10);

      // Set token expiration to 24 hours
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      // Usar cliente público porque password reset NO tiene tenant context
      const client = this.supabaseService.getPublicClient();
      const { error } = await client
        .from('usuarios_sistema')
        .update({
          password_reset_token: hashedToken,
          password_reset_expires: expiresAt.toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (error) {
        this.logger.error(`Failed to store reset token for user ${user.email}:`, error);
        throw new Error('Failed to generate reset token');
      }

      // ✅ SEGURIDAD: Log exitoso con IP
      this.logger.log(
        `Password reset token generated for user: ${user.email} from IP: ${clientIp || 'unknown'}, expires: ${expiresAt.toISOString()}`
      );
      
      // ✅ Enviar email con el token de reset
      const emailSent = await this.emailService.sendPasswordResetEmail(
        user.email,
        user.nombre || user.nombre_usuario || 'Usuario',
        resetToken,
        clientIp
      );

      if (!emailSent) {
        this.logger.warn(
          `Failed to send password reset email to ${user.email}. Token generated but not delivered.`
        );
        // No throw - el token sigue siendo válido incluso si el email falla
      }
      
      return resetToken; // Return unhashed token (usado internamente, nunca expuesto)
    } catch (error) {
      this.logger.error('Error generating password reset token:', error);
      throw error;
    }
  }

  async validatePasswordResetToken(email: string, token: string, clientIp?: string): Promise<boolean> {
    try {
      const user = await this.findUserByEmail(email);
      if (!user || !user.password_reset_token || !user.password_reset_expires) {
        this.logger.warn(
          `Password reset token validation failed - user not found or no token: ${email} from IP: ${clientIp || 'unknown'}`
        );
        return false;
      }

      // Check if token is expired
      if (new Date(user.password_reset_expires) < new Date()) {
        this.logger.warn(
          `Expired password reset token attempt for user: ${user.email} from IP: ${clientIp || 'unknown'}`
        );
        return false;
      }

      // Validate token
      const isValid = await bcrypt.compare(token, user.password_reset_token);
      
      if (!isValid) {
        this.logger.warn(
          `Invalid password reset token attempt for user: ${user.email} from IP: ${clientIp || 'unknown'}`
        );
      }
      
      return isValid;
    } catch (error) {
      this.logger.error('Error validating password reset token:', error);
      return false;
    }
  }

  async resetPassword(email: string, token: string, newPassword: string, clientIp?: string): Promise<void> {
    try {
      // Validate token first
      const isValid = await this.validatePasswordResetToken(email, token, clientIp);
      if (!isValid) {
        this.logger.warn(
          `Failed password reset attempt for email: ${email} from IP: ${clientIp || 'unknown'} - Invalid or expired token`
        );
        throw new UnauthorizedException('Token inválido o expirado');
      }

      const user = await this.findUserByEmail(email);
      if (!user) {
        throw new UnauthorizedException('Usuario no encontrado');
      }

      // ✅ SEGURIDAD: Hash de contraseña nueva (ya validada por DTO)
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // Usar cliente público porque password reset NO tiene tenant context
      const client = this.supabaseService.getPublicClient();
      
      // Update password and clear reset token
      const { error: updateError } = await client
        .from('usuarios_sistema')
        .update({
          password_hash: hashedPassword,
          password_reset_token: null,
          password_reset_expires: null,
          failed_login_attempts: 0, // Reset intentos fallidos
          locked_until: null, // Desbloquear cuenta si estaba bloqueada
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (updateError) {
        this.logger.error(`Failed to update password for user ${user.email}:`, updateError);
        throw new Error('Failed to reset password');
      }

      // ✅ CRÍTICO: Revocar todas las sesiones activas por seguridad
      await this.revokeUserSessions(user.id);

      // ✅ SEGURIDAD: Log exitoso del reset
      this.logger.log(
        `Password reset successful for user: ${user.email} from IP: ${clientIp || 'unknown'}. All sessions revoked.`
      );

      // ✅ Enviar email de confirmación (best practice de seguridad)
      await this.emailService.sendPasswordResetConfirmationEmail(
        user.email,
        user.nombre || user.nombre_usuario || 'Usuario',
        clientIp
      );
    } catch (error) {
      this.logger.error(`Error resetting password for email: ${email}`, error);
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

      // Validate target tenant exists - usar cliente público para validación
      const client = this.supabaseService.getPublicClient();
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

      // ✅ B1: Invalidar cache de permisos al cambiar de tenant
      if (this.permissionService) {
        this.permissionService.invalidateUserPermissions(userId);
        this.logger.log(`✅ [B1] Cache de permisos invalidado para usuario ${userId} al cambiar de tenant`);
      }

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

      // Usar cliente público porque el login NO tiene tenant context aún
      const client = this.supabaseService.getPublicClient();
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
      // Usar cliente público para validación de sesiones
      const client = this.supabaseService.getPublicClient();
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
      // Usar cliente público para revocar sesiones
      const client = this.supabaseService.getPublicClient();
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
      // Usar cliente público para revocar sesiones
      const client = this.supabaseService.getPublicClient();
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
      // Usar cliente público para limpieza de sesiones
      const client = this.supabaseService.getPublicClient();
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
