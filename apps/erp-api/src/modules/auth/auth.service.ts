import { Injectable, UnauthorizedException, Logger, InternalServerErrorException, Inject, forwardRef, HttpException, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { EmailService } from '../../shared/email/email.service';
import { PermissionService } from '../permissions/permission.service';
import { CacheService } from '../../shared/cache/cache.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

// La revocación administrativa debe observarse en el request siguiente en
// cualquier réplica. El cache positivo sólo puede reactivarse cuando exista
// invalidación distribuida transaccional para todos los writers de sesiones.
const SESSION_CACHE_TTL = 0;

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
  session_token?: string;
}

export interface AuthenticatedUserView {
  id: string;
  email: string;
  nombre?: string;
  apellido?: string;
  nombre_usuario?: string;
  roles: string[];
  tenant_id: string;
  is_super_admin: boolean;
  activo: boolean;
  estado?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
    private readonly cacheService: CacheService,
    @Inject(forwardRef(() => PermissionService))
    private readonly permissionService?: PermissionService,
  ) {}

  private sessionCacheKey(token: string): string {
    return `auth:session:${token}`;
  }

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

      // Verificar que el usuario esté activo
      if (user.estado !== 'ACTIVO') {
        // ✅ A5: Este caso se registrará en el método login cuando capture la excepción
        throw new UnauthorizedException('Usuario inactivo');
      }

      const { password_hash, ...result } = user;
      return result;
    } catch (error) {
      console.error('Error validating user:', error);
      if (error instanceof UnauthorizedException || error instanceof ServiceUnavailableException) {
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
      // El login todavía no tiene contexto de tenant, pero la escritura queda
      // encapsulada en una RPC service-role para no exponer DML sobre la tabla.
      const client = this.supabaseService.getAdminClient();
      const { error } = await client.rpc('registrar_intento_login_auth_tx', {
        p_email: data.email.trim().toLowerCase(),
        p_ip_address: data.ipAddress,
        p_user_agent: data.userAgent,
        p_success: data.success,
        p_failed_reason: data.failedReason || null,
        p_tenant_id: data.tenantId || null,
      });
      if (error) {
        this.logger.error('Error registrando intento de login:', error);
      }
    } catch (error) {
      // No bloquear el flujo si falla el registro de intentos
      this.logger.error('Error registrando intento de login:', error);
    }
  }

  // ✅ A5: Verificar si hay demasiados intentos fallidos recientes
  private async checkFailedAttemptsLimit(
    email: string,
    ipAddress: string,
    userAgent: string,
    minutesWindow: number = 15,
    maxAttempts: number = 5,
  ): Promise<boolean> {
    try {
      // Usar cliente público porque el login NO tiene tenant context
      const client = this.supabaseService.getAdminClient();
      const cutoffTime = new Date();
      cutoffTime.setMinutes(cutoffTime.getMinutes() - minutesWindow);

      // Check by email only (not IP or user-agent) to prevent bypass via rotation
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
    const requestIpAddress = ipAddress || 'unknown';
    const requestUserAgent = userAgent || 'unknown';
    const normalizedEmail = loginDto.email.trim().toLowerCase();

    // ✅ A5: Verificar límite de intentos fallidos antes de procesar
    const hasTooManyAttempts = await this.checkFailedAttemptsLimit(normalizedEmail, requestIpAddress, requestUserAgent);

    try {
      const user = await this.validateUser(normalizedEmail, loginDto.password);
      if (!user) {
        if (hasTooManyAttempts) {
          await this.logLoginAttempt({
            email: normalizedEmail,
            ipAddress: requestIpAddress,
            userAgent: requestUserAgent,
            success: false,
            failedReason: 'Demasiados intentos fallidos recientes',
            tenantId: null,
          });
          throw new HttpException('Demasiados intentos fallidos. Intente más tarde.', HttpStatus.TOO_MANY_REQUESTS);
        }

        // El catch registra exactamente un intento fallido.
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

      // La RPC vuelve inseparables validación de usuario/tenant, último acceso y sesión.
      const sessionToken = await this.createSession(user.id);
      payload.session_token = sessionToken;

      // ✅ A5: Registrar intento exitoso
      await this.logLoginAttempt({
        email: normalizedEmail,
        ipAddress: requestIpAddress,
        userAgent: requestUserAgent,
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
            const user = await this.findUserByEmail(normalizedEmail);
            if (user) {
              tenantIdForLogging = user.tenant_id || null;
            }
          } catch (e) {
            // Ignorar errores al obtener tenant_id
          }
        }

        const failedReason = error.message || 'Error de autenticación';
        await this.logLoginAttempt({
          email: normalizedEmail,
        ipAddress: requestIpAddress,
        userAgent: requestUserAgent,
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
      if (!payload?.session_token || !(await this.validateSession(payload.session_token))) {
        throw new UnauthorizedException('Sesión expirada o revocada');
      }
      const user = await this.findUserById(payload.sub);
      if (!user || !user.activo) {
        throw new UnauthorizedException('Token inválido');
      }
      return this.toAuthenticatedUserView(user);
    } catch (error) {
      throw new UnauthorizedException('Token inválido');
    }
  }

  private extractRoleNames(user: any): string[] {
    if (Array.isArray(user?.roles)) {
      return user.roles
        .map((role: any) => typeof role === 'string' ? role : role?.nombre)
        .filter(Boolean);
    }

    if (Array.isArray(user?.user_roles)) {
      return user.user_roles
        .map((ur: any) => ur?.roles?.nombre || ur?.role_name || ur?.role_id)
        .filter(Boolean);
    }

    return [];
  }

  private toAuthenticatedUserView(user: any): AuthenticatedUserView {
    return {
      id: user.id,
      email: user.email,
      nombre: user.nombre,
      apellido: user.apellido,
      nombre_usuario: user.nombre_usuario,
      roles: this.extractRoleNames(user),
      tenant_id: user.tenant_id,
      is_super_admin: user.is_super_admin || false,
      activo: user.activo !== false,
      estado: user.estado,
    };
  }

  private buildJwtPayloadFromUser(user: any, sessionToken?: string): JwtPayload {
    return {
      sub: user.id,
      email: user.email,
      username: user.nombre_usuario || user.nombre,
      roles: this.extractRoleNames(user),
      tenant_id: user.tenant_id,
      is_super_admin: user.is_super_admin || false,
      session_token: sessionToken
    };
  }

  private isNoRowsError(error: any): boolean {
    return error?.code === 'PGRST116';
  }

  private isSupabaseUnavailableError(error: any): boolean {
    const message = `${error?.message || error || ''}`.toLowerCase();
    const code = `${error?.code || error?.cause?.code || ''}`.toUpperCase();

    return (
      error instanceof TypeError ||
      ['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'].includes(code) ||
      message.includes('fetch failed') ||
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('enotfound') ||
      message.includes('econnrefused') ||
      message.includes('etimedout')
    );
  }

  private throwIfSupabaseUnavailable(error: any, operation: string): void {
    if (!error || this.isNoRowsError(error)) {
      return;
    }

    if (this.isSupabaseUnavailableError(error)) {
      this.logger.error(`[AUTH] Supabase no disponible durante ${operation}: ${error?.message || error}`);
      throw new ServiceUnavailableException('Servicio de autenticación temporalmente no disponible');
    }
  }

  private async findUserByEmail(email: string): Promise<any> {
    try {
      const normalizedEmail = email.trim().toLowerCase();
      // Usar cliente público porque el login NO tiene tenant context
      const client = this.supabaseService.getAdminClient();
      
      // Primero obtener el usuario
      const { data: user, error: userError } = await client
        .from('usuarios_sistema')
        .select('*')
        .eq('email', normalizedEmail)
        .single();

      if (this.isNoRowsError(userError)) {
        console.error('Error finding user by email:', userError);
        return null;
      }
      this.throwIfSupabaseUnavailable(userError, 'consulta de usuario por email');
      if (userError || !user) {
        console.error('Error finding user by email:', userError);
        return null;
      }

      // Luego obtener sus roles por separado
      const { data: userRoles, error: rolesError } = await client
        .from('user_roles')
        .select('role_id, roles(id, nombre, descripcion, activo)')
        .eq('usuario_sistema_id', user.id);

      this.throwIfSupabaseUnavailable(rolesError, 'consulta de roles de usuario');
      if (rolesError) {
        this.logger.error('Error finding user roles by email:', rolesError);
        return null;
      }

      // Agregar roles al usuario
      user.user_roles = (userRoles || []).filter((link: any) => {
        const role = Array.isArray(link.roles) ? link.roles[0] : link.roles;
        return role?.activo !== false;
      });

      return user;
    } catch (error) {
      console.error('Error in findUserByEmail:', error);
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      if (this.isSupabaseUnavailableError(error)) {
        throw new ServiceUnavailableException('Servicio de autenticación temporalmente no disponible');
      }
      return null;
    }
  }

  // ✅ A3: Método público para validación de usuario en guard
  async findUserById(id: string): Promise<any> {
    try {
      // Usar cliente público para validación de tokens
      const client = this.supabaseService.getAdminClient();
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
    const userId = user?.id || user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Token inválido');
    }
    if (!user?.session_token) {
      throw new UnauthorizedException('Token sin sesión activa');
    }

    const sessionIsActive = await this.validateSession(user.session_token);
    if (!sessionIsActive) {
      throw new UnauthorizedException('Sesión expirada o revocada');
    }

    const freshUser = await this.findUserById(userId);
    if (!freshUser || !freshUser.activo || freshUser.estado === 'INACTIVO') {
      throw new UnauthorizedException('Usuario inactivo o inexistente');
    }

    const payload = this.buildJwtPayloadFromUser(freshUser, user.session_token);

    return {
      access_token: this.jwtService.sign(payload)
    };
  }

  // Failed login attempt tracking
  private async incrementFailedLoginAttempts(userId: string): Promise<void> {
    try {
      const client = this.supabaseService.getAdminClient();
      const { data, error } = await client.rpc('increment_failed_login_attempts', {
        p_user_id: userId,
        p_max_attempts: 5,
        p_lock_minutes: 15,
      });

      if (error) {
        this.logger.error('Error incrementing failed login attempts atomically:', error);
        return;
      }

      const failedAttempts = Array.isArray(data) ? data[0]?.failed_login_attempts : data?.failed_login_attempts;
      if (failedAttempts >= 5) {
        console.log('🔒 [AUTH] Cuenta bloqueada por intentos fallidos - Usuario:', userId);
      }
    } catch (error) {
      console.error('Error incrementing failed login attempts:', error);
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
        // SEGURIDAD: Log de intento pero NO revelar que el email no existe (prevenir enumeración)
        this.logger.warn(
          `Password reset attempt for non-existent user: ${email} from IP: ${clientIp || 'unknown'}`
        );
        // Retornar token ficticio para que la respuesta sea indistinguible
        return 'reset-requested';
      }

      // Generate secure reset token (32 bytes = 64 hex characters)
      const resetToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = await bcrypt.hash(resetToken, 10);

      // Set token expiration to 24 hours
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      const { error } = await this.supabaseService.getAdminClient()
        .rpc('registrar_solicitud_reset_auth_tx', {
          p_usuario_id: user.id,
          p_token_hash: hashedToken,
          p_expires_at: expiresAt.toISOString(),
        });

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

      if (
        !user.password_reset_token ||
        !user.password_reset_expires ||
        new Date(user.password_reset_expires) < new Date() ||
        !(await bcrypt.compare(token, user.password_reset_token))
      ) {
        this.logger.warn(
          `Password reset token changed or already consumed for user: ${email} from IP: ${clientIp || 'unknown'}`
        );
        throw new UnauthorizedException('Token inválido o expirado');
      }

      // ✅ SEGURIDAD: Hash de contraseña nueva (ya validada por DTO)
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      const { data: resetResult, error: updateError } = await this.supabaseService.getAdminClient()
        .rpc('consumir_reset_password_auth_tx', {
          p_usuario_id: user.id,
          p_expected_token_hash: user.password_reset_token,
          p_new_password_hash: hashedPassword,
        });
      if (updateError) {
        this.logger.error(`Failed to update password for user ${user.email}:`, updateError);
        if (updateError.code === '42501') {
          throw new UnauthorizedException('Token inválido o expirado');
        }
        throw new Error('Failed to reset password');
      }
      if (!resetResult) {
        this.logger.warn(
          `Password reset token already consumed for user: ${user.email} from IP: ${clientIp || 'unknown'}`
        );
        throw new UnauthorizedException('Token inválido o expirado');
      }

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
      const client = this.supabaseService.getAdminClient();
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
  private async createSession(userId: string): Promise<string> {
    try {
      const crypto = require('crypto');
      const sessionToken = crypto.randomBytes(32).toString('hex');
      
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 8); // 8 hours session

      const { data, error } = await this.supabaseService.getAdminClient()
        .rpc('crear_sesion_login_auth_tx', {
          p_usuario_id: userId,
          p_session_token: sessionToken,
          p_expires_at: expiresAt.toISOString(),
        });

      if (error || !data) {
        if (error?.code === '42501') throw new UnauthorizedException('Usuario o tenant inactivo');
        throw error || new Error('No se pudo crear la sesión');
      }

      return sessionToken;
    } catch (error) {
      console.error('Error creating session:', error);
      throw error;
    }
  }

  async validateSession(sessionToken: string): Promise<boolean> {
    if (SESSION_CACHE_TTL > 0) {
      const cached = await this.cacheService.get<boolean>(this.sessionCacheKey(sessionToken));
      if (cached === true) return true;
    }

    try {
      const client = this.supabaseService.getAdminClient();
      const { data: validation, error } = await client.rpc('validar_sesion_auth_tx', {
        p_session_token: sessionToken,
      });

      if (error || validation?.valid !== true) {
        await this.cacheService.del(this.sessionCacheKey(sessionToken));
        return false;
      }

      if (SESSION_CACHE_TTL > 0) {
        await this.cacheService.set(this.sessionCacheKey(sessionToken), true, SESSION_CACHE_TTL);
      }

      return true;
    } catch (error) {
      console.error('Error validating session:', error);
      return false;
    }
  }

  async revokeSession(sessionToken: string, userId: string): Promise<void> {
    try {
      // Invalidamos cache PRIMERO para que requests in-flight con cache
      // positivo no sigan pasando después del revoke.
      await this.cacheService.del(this.sessionCacheKey(sessionToken));

      const { error } = await this.supabaseService.getAdminClient()
        .rpc('revocar_sesion_auth_tx', {
          p_session_token: sessionToken,
          p_usuario_id: userId,
          p_reason: 'LOGOUT',
        });
      if (error) throw error;
    } catch (error) {
      console.error('Error revoking session:', error);
    }
  }

  async revokeUserSessions(userId: string): Promise<void> {
    try {
      const client = this.supabaseService.getAdminClient();

      const { data: sessions, error: selectError } = await client
        .from('user_sessions')
        .select('session_token')
        .eq('usuario_sistema_id', userId);

      if (selectError) {
        this.logger.warn(`Could not list sessions before revoke for user ${userId}:`, selectError);
      }

      const sessionTokens = (sessions || [])
        .map((session: any) => session?.session_token)
        .filter((token: unknown): token is string => typeof token === 'string' && token.length > 0);

      await Promise.all(
        sessionTokens.map((sessionToken) => this.cacheService.del(this.sessionCacheKey(sessionToken)))
      );

      const { error } = await client.rpc('revocar_sesiones_usuario_auth_tx', {
        p_usuario_id: userId,
        p_reason: 'LOGOUT_ALL',
      });
      if (error) throw error;

      console.log('🔒 [AUTH] Sesiones revocadas - Usuario:', userId, 'Tokens:', sessionTokens.length);
    } catch (error) {
      console.error('Error revoking user sessions:', error);
    }
  }

  async cleanupExpiredSessions(): Promise<void> {
    try {
      const { data, error } = await this.supabaseService.getAdminClient()
        .rpc('cleanup_expired_user_sessions', { p_limit: 5000 });

      if (!error) {
        console.log('🧹 [AUTH] Sesiones expiradas limpiadas');
      }
    } catch (error) {
      console.error('Error cleaning up expired sessions:', error);
    }
  }
}
