import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { AuthService } from '../auth.service';
import { ConfigService } from '@nestjs/config';

const cookieExtractor = (req: any) => {
  const parsedToken = req?.cookies?.['access_token'];
  if (typeof parsedToken === 'string' && parsedToken.length > 0) {
    return parsedToken;
  }

  const cookieHeader = req?.headers?.cookie;
  if (typeof cookieHeader !== 'string') {
    return null;
  }

  const token = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('access_token='))
    ?.slice('access_token='.length);

  return token ? decodeURIComponent(token) : null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private authService: AuthService,
    private configService: ConfigService
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        cookieExtractor,
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
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
      // El superadmin es la única excepción: no pertenece a ningún tenant, los
      // atraviesa todos (ver TenantGuard), así que su token sale sin tenant_id.
      if (!payload.tenant_id && payload.is_super_admin !== true) {
        console.warn('⚠️ [JWT Strategy] Token sin tenant_id detectado');
        throw new UnauthorizedException('Token inválido: falta tenant_id');
      }

      if (!payload.session_token) {
        throw new UnauthorizedException('Token inválido: falta sesión');
      }

      const sessionIsActive = await this.authService.validateSession(payload.session_token);
      if (!sessionIsActive) {
        throw new UnauthorizedException('Sesión expirada o revocada');
      }
      
      return {
        id: payload.sub,
        email: payload.email,
        username: payload.username,
        roles: payload.roles || [],
        tenant_id: payload.tenant_id, // ✅ Incluir tenant_id en request.user
        is_super_admin: payload.is_super_admin || false, // ✅ Incluir is_super_admin en request.user
        session_token: payload.session_token
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
