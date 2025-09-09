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
}