import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  Get,
  UnauthorizedException
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService, LoginDto } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { AuthRateLimitGuard } from '../../shared/security/guards/auth-rate-limit.guard';

@ApiTags('Autenticación')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @UseGuards(AuthRateLimitGuard)
  @Throttle(5, 60) // 5 intentos por minuto
  @ApiOperation({ summary: 'Iniciar sesión' })
  @ApiResponse({ status: 200, description: 'Login exitoso' })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas' })
  @ApiResponse({ status: 429, description: 'Demasiados intentos' })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
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
  @ApiOperation({ summary: 'Solicitar reset de contraseña' })
  @ApiResponse({ status: 200, description: 'Token de reset enviado' })
  @ApiResponse({ status: 401, description: 'Usuario no encontrado' })
  async requestPasswordReset(@Body('email') email: string) {
    const token = await this.authService.generatePasswordResetToken(email);
    // In production, send token via email instead of returning it
    return {
      message: 'Si el email existe, recibirás un enlace de reset',
      // TODO: Remove token from response in production
      token: process.env.NODE_ENV === 'development' ? token : undefined
    };
  }

  @Post('password-reset/validate')
  @Throttle(5, 60)
  @ApiOperation({ summary: 'Validar token de reset' })
  @ApiResponse({ status: 200, description: 'Token válido' })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado' })
  async validatePasswordResetToken(
    @Body('email') email: string,
    @Body('token') token: string
  ) {
    const isValid = await this.authService.validatePasswordResetToken(email, token);
    if (!isValid) {
      throw new UnauthorizedException('Token inválido o expirado');
    }
    return { valid: true };
  }

  @Post('password-reset/confirm')
  @Throttle(3, 60)
  @ApiOperation({ summary: 'Confirmar reset de contraseña' })
  @ApiResponse({ status: 200, description: 'Contraseña actualizada' })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado' })
  async resetPassword(
    @Body('email') email: string,
    @Body('token') token: string,
    @Body('newPassword') newPassword: string
  ) {
    await this.authService.resetPassword(email, token, newPassword);
    return { message: 'Contraseña actualizada exitosamente' };
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