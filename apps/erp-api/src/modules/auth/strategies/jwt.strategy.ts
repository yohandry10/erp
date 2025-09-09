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
      // Validar que el usuario aún existe y está activo
      const user = await this.authService.validateToken(
        // Necesitamos reconstruir el token para validación completa
        // En un escenario real, esto se haría de manera diferente
        payload
      );
      
      return {
        id: payload.sub,
        email: payload.email,
        username: payload.username,
        roles: payload.roles || []
      };
    } catch (error) {
      throw new UnauthorizedException('Token inválido');
    }
  }
}