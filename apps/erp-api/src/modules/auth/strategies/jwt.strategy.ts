import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { AuthService } from '../auth.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private authService: AuthService,
    private configService: ConfigService
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'default-secret-key',
    });
  }

  async validate(payload: any) {
    try {
      // Verificar expiración
      if (payload.exp) {
        const now = Math.floor(Date.now() / 1000);
        const expiresIn = payload.exp - now;
        if (expiresIn <= 0) {
          throw new UnauthorizedException('Token expirado');
        }
      }
      
      // ✅ MULTI-TENANT: Validar tenant_id en el payload
      if (!payload.tenant_id) {
        console.warn('⚠️ [JWT Strategy] Token sin tenant_id detectado');
        throw new UnauthorizedException('Token inválido: falta tenant_id');
      }
      
      return {
        id: payload.sub,
        email: payload.email,
        username: payload.username,
        roles: payload.roles || [],
        tenant_id: payload.tenant_id, // ✅ Incluir tenant_id en request.user
        is_super_admin: payload.is_super_admin || false // ✅ Incluir is_super_admin en request.user
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      console.error('❌ [JWT Strategy] Error validando token:', error.message);
      throw new UnauthorizedException('Token inválido');
    }
  }
}