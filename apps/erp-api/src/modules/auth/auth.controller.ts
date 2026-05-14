import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  Response as NestResponse,
  Get,
  UnauthorizedException,
  Logger,
  HttpCode,
} from '@nestjs/common';
import { Response as ExpressResponse } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService, LoginDto } from './auth.service';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { AuthRateLimitGuard } from '../../shared/security/guards/auth-rate-limit.guard';
import { Public } from '../../common/decorators/public.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ConfigService } from '@nestjs/config';
import {
  RequestPasswordResetDto,
  ValidatePasswordResetDto,
  ResetPasswordDto
} from './dto';

@ApiTags('Autenticación')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  private setAuthCookie(response: ExpressResponse, token: string) {
    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';
    const sameSite =
      (this.configService.get<string>('AUTH_COOKIE_SAME_SITE') ?? 'lax').toLowerCase() === 'strict'
        ? 'strict'
        : 'lax';

    response.cookie('access_token', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite,
      path: '/',
      maxAge: 8 * 60 * 60 * 1000,
    });
  }

  private clearAuthCookie(response: ExpressResponse) {
    const sameSite =
      (this.configService.get<string>('AUTH_COOKIE_SAME_SITE') ?? 'lax').toLowerCase() === 'strict'
        ? 'strict'
        : 'lax';

    response.clearCookie('access_token', {
      path: '/',
      httpOnly: true,
      secure: this.configService.get<string>('NODE_ENV') === 'production',
      sameSite,
    });
  }

  private async enforceMinimumDuration(startedAt: number, minimumMs = 400): Promise<void> {
    const remainingMs = minimumMs - (Date.now() - startedAt);
    if (remainingMs > 0) {
      await new Promise(resolve => setTimeout(resolve, remainingMs));
    }
  }

  @Post('login')
  @Public()
  @UseGuards(AuthRateLimitGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 intentos por minuto
  @ApiOperation({ summary: 'Iniciar sesión' })
  @ApiResponse({ status: 200, description: 'Login exitoso' })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas' })
  @ApiResponse({ status: 429, description: 'Demasiados intentos' })
  async login(@Body() loginDto: LoginDto, @Request() req, @NestResponse({ passthrough: true }) response: ExpressResponse) {
    // ✅ A5: Extraer IP y user-agent para registro de intentos
    const clientIp = req.ip || req.connection?.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    const result = await this.authService.login(loginDto, clientIp, userAgent);
    if (result?.access_token) {
      this.setAuthCookie(response, result.access_token);
    }
    return result;
  }

  @Get('profile')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtener perfil del usuario autenticado' })
  @ApiResponse({ status: 200, description: 'Perfil del usuario' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  async getProfile(@Request() req) {
    return req.user;
  }

  @Post('refresh')
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 refresh por minuto
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Renovar token de acceso' })
  @ApiResponse({ status: 200, description: 'Token renovado' })
  async refresh(@Request() req, @NestResponse({ passthrough: true }) response: ExpressResponse) {
    const result = await this.authService.refreshToken(req.user);
    if (result?.access_token) {
      this.setAuthCookie(response, result.access_token);
    }
    return result;
  }

  @Post('validate')
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60000 } }) // 20 validaciones por minuto
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
  async getConfigStatus() {
    try {
      // Verificar configuración de seguridad
      const hasJwtSecret = !!this.configService.get<string>('JWT_SECRET');
      const hasRefreshSecret = !!this.configService.get<string>('JWT_REFRESH_SECRET');
      const hasEncryptionKey =
        !!this.configService.get<string>('ENCRYPTION_KEY') ||
        !!this.configService.get<string>('CERT_ENCRYPTION_KEY');

      return {
        security: {
          jwtConfigured: hasJwtSecret,
          refreshConfigured: hasRefreshSecret,
          encryptionConfigured: hasEncryptionKey,
          environment: this.configService.get<string>('NODE_ENV') ?? 'development'
        }
      };
    } catch (error) {
      throw new UnauthorizedException('Error verificando configuración');
    }
  }

  @Post('password-reset/request')
  @HttpCode(200)
  @Public()
  @Throttle({ default: { limit: 3, ttl: 60000 } }) // 3 requests per minute
  @ApiOperation({
    summary: 'Solicitar reset de contraseña',
    description: 'Genera un token de reset y lo envía al email del usuario (si existe). Por seguridad, siempre retorna el mismo mensaje.'
  })
  @ApiResponse({ status: 200, description: 'Solicitud procesada. Si el email existe, recibirás un enlace de reset.' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  async requestPasswordReset(@Body() dto: RequestPasswordResetDto, @Request() req) {
    const startedAt = Date.now();
    const clientIp = req.ip || req.connection?.remoteAddress || 'unknown';
    const response = {
      message: 'Si el email existe en nuestro sistema, recibirás un enlace de reset de contraseña.'
    };

    void this.authService.generatePasswordResetToken(dto.email, clientIp).catch(() => {
      this.logger.warn(`Password reset request failed for email: ${dto.email} from IP: ${clientIp}`);
    });

    // Respuesta uniforme: no espera hash/BD/email, evitando enumeracion por timing.
    await this.enforceMinimumDuration(startedAt);
    return response;
  }

  @Post('password-reset/validate')
  @HttpCode(200)
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
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
  @HttpCode(200)
  @Public()
  @Throttle({ default: { limit: 3, ttl: 60000 } })
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
  @UseGuards(SuperAdminGuard)
  @RequirePermission('tenants.manage')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cambiar de tenant (solo super-admins)' })
  @ApiResponse({ status: 200, description: 'Tenant cambiado exitosamente' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 403, description: 'Acceso denegado - Se requieren privilegios de super-administrador' })
  async switchTenant(
    @Request() req,
    @NestResponse({ passthrough: true }) response: ExpressResponse,
    @Body('targetTenantId') targetTenantId: string
  ) {
    const result = await this.authService.switchTenant(req.user.id, targetTenantId);
    if (result?.access_token) {
      this.setAuthCookie(response, result.access_token);
    }
    return result;
  }

  @Post('logout')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cerrar sesión' })
  @ApiResponse({ status: 200, description: 'Sesión cerrada' })
  async logout(@Request() req, @NestResponse({ passthrough: true }) response: ExpressResponse, @Body('sessionToken') sessionToken?: string) {
    const tokenToRevoke = sessionToken || req.user?.session_token;
    if (tokenToRevoke) {
      await this.authService.revokeSession(tokenToRevoke);
    }
    this.clearAuthCookie(response);
    return { message: 'Sesión cerrada exitosamente' };
  }

  @Post('logout-all')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cerrar todas las sesiones del usuario' })
  @ApiResponse({ status: 200, description: 'Todas las sesiones cerradas' })
  async logoutAll(@Request() req) {
    await this.authService.revokeUserSessions(req.user.id);
    return { message: 'Todas las sesiones cerradas exitosamente' };
  }
}
