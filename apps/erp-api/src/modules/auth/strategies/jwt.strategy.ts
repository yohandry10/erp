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
      // ✅ MULTI-TENANT: Validar tenant_id en el payload
      if (!payload.tenant_id) {
        console.warn('⚠️ [JWT] Token sin tenant_id detectado');
        throw new UnauthorizedException('Token inválido: falta tenant_id');
      }

      console.log('🔐 [JWT] Validando token - Tenant:', payload.tenant_id, 'Usuario:', payload.email, 'Super-Admin:', payload.is_super_admin || false);
      
      return {
        id: payload.sub,
        email: payload.email,
        username: payload.username,
        roles: payload.roles || [],
        tenant_id: payload.tenant_id, // ✅ Incluir tenant_id en request.user
        is_super_admin: payload.is_super_admin || false // ✅ Incluir is_super_admin en request.user
      };
    } catch (error) {
      throw new UnauthorizedException('Token inválido');
    }
  }
}