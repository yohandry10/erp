import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  Get,
  UnauthorizedException,
  Logger
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService, LoginDto } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { AuthRateLimitGuard } from '../../shared/security/guards/auth-rate-limit.guard';
import { 
  RequestPasswordResetDto, 
  ValidatePasswordResetDto, 
  ResetPasswordDto 
} from './dto';

@ApiTags('Autenticación')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @UseGuards(AuthRateLimitGuard)
  @Throttle(5, 60) // 5 intentos por minuto
  @ApiOperation({ summary: 'Iniciar sesión' })
  @ApiResponse({ status: 200, description: 'Login exitoso' })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas' })
  @ApiResponse({ status: 429, description: 'Demasiados intentos' })
  async login(@Body() loginDto: LoginDto, @Request() req) {
    // ✅ A5: Extraer IP y user-agent para registro de intentos
    const clientIp = req.ip || req.connection?.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    
    return this.authService.login(loginDto, clientIp, userAgent);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtener perfil del usuario autenticado' })
  @ApiResponse({ status: 200, description: 'Perfil del usuario' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  async getProfile(@Request() req) {
    return req.user;
  }

  @Post('refresh')
  @UseGuards(JwtAuthGuard)
  @Throttle(10, 60) // 10 refresh por minuto
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Renovar token de acceso' })
  @ApiResponse({ status: 200, description: 'Token renovado' })
  async refresh(@Request() req) {
    return this.authService.refreshToken(req.user);
  }

  @Post('validate')
  @Throttle(20, 60) // 20 validaciones por minuto
  @ApiOperation({ summary: 'Validar token' })
  @ApiResponse({ status: 200, description: 'Token válido' })
  @ApiResponse({ status: 401, description: 'Token inválido' })
  async validateToken(@Body('token') token: string) {
    try {
      const payload = await this.authService.validateToken(token);
      return { valid: true, payload };
    } catch (error) {
      throw new UnauthorizedException('Token inválido');
    }
  }

  @Get('config-status')
  @UseGuards(JwtAuthGuard)
  async getConfigStatus() {
    try {
      // Verificar configuración de seguridad
      const hasJwtSecret = !!process.env.JWT_SECRET;
      const hasRefreshSecret = !!process.env.JWT_REFRESH_SECRET;
      const hasEncryptionKey = !!process.env.ENCRYPTION_KEY;
      
      return {
        security: {
          jwtConfigured: hasJwtSecret,
          refreshConfigured: hasRefreshSecret,
          encryptionConfigured: hasEncryptionKey,
          environment: process.env.NODE_ENV || 'development'
        }
      };
    } catch (error) {
      throw new UnauthorizedException('Error verificando configuración');
    }
  }

  @Post('password-reset/request')
  @Throttle(3, 60) // 3 requests per minute
  @ApiOperation({ 
    summary: 'Solicitar reset de contraseña',
    description: 'Genera un token de reset y lo envía al email del usuario (si existe). Por seguridad, siempre retorna el mismo mensaje.'
  })
  @ApiResponse({ status: 200, description: 'Solicitud procesada. Si el email existe, recibirás un enlace de reset.' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  async requestPasswordReset(@Body() dto: RequestPasswordResetDto, @Request() req) {
    const clientIp = req.ip || req.connection?.remoteAddress || 'unknown';
    
    try {
      await this.authService.generatePasswordResetToken(dto.email, clientIp);
      
      // ✅ SEGURIDAD: Siempre retornar el mismo mensaje, nunca exponer el token
      // Esto previene enumerar usuarios válidos
      return {
        message: 'Si el email existe en nuestro sistema, recibirás un enlace de reset de contraseña.'
      };
    } catch (error) {
      // ✅ SEGURIDAD: Log del error sin exponer detalles al cliente
      this.logger.warn(`Password reset request failed for email: ${dto.email} from IP: ${clientIp}`);
      
      // Retornar mismo mensaje para no revelar si el usuario existe
      return {
        message: 'Si el email existe en nuestro sistema, recibirás un enlace de reset de contraseña.'
      };
    }
  }

  @Post('password-reset/validate')
  @Throttle(5, 60)
  @ApiOperation({ 
    summary: 'Validar token de reset',
    description: 'Verifica si un token de reset es válido y no ha expirado'
  })
  @ApiResponse({ status: 200, description: 'Token válido' })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  async validatePasswordResetToken(@Body() dto: ValidatePasswordResetDto, @Request() req) {
    const clientIp = req.ip || req.connection?.remoteAddress || 'unknown';
    
    const isValid = await this.authService.validatePasswordResetToken(dto.email, dto.token, clientIp);
    if (!isValid) {
      this.logger.warn(`Invalid password reset token attempt for email: ${dto.email} from IP: ${clientIp}`);
      throw new UnauthorizedException('Token inválido o expirado');
    }
    
    return { valid: true };
  }

  @Post('password-reset/confirm')
  @Throttle(3, 60)
  @ApiOperation({ 
    summary: 'Confirmar reset de contraseña',
    description: 'Cambia la contraseña del usuario usando el token de reset. Revoca todas las sesiones activas.'
  })
  @ApiResponse({ status: 200, description: 'Contraseña actualizada exitosamente. Todas las sesiones han sido revocadas.' })
  @ApiResponse({ status: 400, description: 'Datos inválidos o contraseña no cumple requisitos de seguridad' })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado' })
  async resetPassword(@Body() dto: ResetPasswordDto, @Request() req) {
    const clientIp = req.ip || req.connection?.remoteAddress || 'unknown';
    
    await this.authService.resetPassword(dto.email, dto.token, dto.newPassword, clientIp);
    
    this.logger.log(`Password reset successful for email: ${dto.email} from IP: ${clientIp}`);
    
    return { 
      message: 'Contraseña actualizada exitosamente. Por seguridad, todas tus sesiones activas han sido cerradas. Por favor, inicia sesión nuevamente.'
    };
  }

  @Post('switch-tenant')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cambiar de tenant (solo super-admins)' })
  @ApiResponse({ status: 200, description: 'Tenant cambiado exitosamente' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 403, description: 'Acceso denegado - Se requieren privilegios de super-administrador' })
  async switchTenant(
    @Request() req,
    @Body('targetTenantId') targetTenantId: string
  ) {
    return this.authService.switchTenant(req.user.id, targetTenantId);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cerrar sesión' })
  @ApiResponse({ status: 200, description: 'Sesión cerrada' })
  async logout(@Request() req, @Body('sessionToken') sessionToken?: string) {
    if (sessionToken) {
      await this.authService.revokeSession(sessionToken);
    }
    return { message: 'Sesión cerrada exitosamente' };
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cerrar todas las sesiones del usuario' })
  @ApiResponse({ status: 200, description: 'Todas las sesiones cerradas' })
  async logoutAll(@Request() req) {
    await this.authService.revokeUserSessions(req.user.id);
    return { message: 'Todas las sesiones cerradas exitosamente' };
  }
}