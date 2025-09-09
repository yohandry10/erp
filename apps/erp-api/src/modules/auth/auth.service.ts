import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import * as bcrypt from 'bcrypt';

export interface LoginDto {
  email: string;
  password: string;
}

export interface JwtPayload {
  sub: string;
  email: string;
  username?: string;
  roles?: string[];
}

@Injectable()
export class AuthService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string): Promise<any> {
    try {
      const user = await this.findUserByEmail(email);
      if (!user) {
        return null;
      }

      // Verificar contraseña
      const isPasswordValid = await bcrypt.compare(password, user.password_hash);
      if (!isPasswordValid) {
        return null;
      }

      // Verificar que el usuario esté activo
      if (!user.activo) {
        throw new UnauthorizedException('Usuario inactivo');
      }

      const { password_hash, ...result } = user;
      return result;
    } catch (error) {
      console.error('Error validating user:', error);
      return null;
    }
  }

  async login(loginDto: LoginDto) {
    const user = await this.validateUser(loginDto.email, loginDto.password);
    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      username: user.nombre_usuario,
      roles: user.roles || []
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        nombre: user.nombre,
        apellido: user.apellido,
        nombre_usuario: user.nombre_usuario,
        roles: user.roles
      }
    };
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
      const client = this.supabaseService.getClient();
      const { data, error } = await client
        .from('usuarios_sistema')
        .select('*')
        .eq('email', email)
        .single();

      if (error) {
        console.error('Error finding user by email:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error in findUserByEmail:', error);
      return null;
    }
  }

  private async findUserById(id: string): Promise<any> {
    try {
      const client = this.supabaseService.getClient();
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
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      username: user.nombre_usuario,
      roles: user.roles || []
    };

    return {
      access_token: this.jwtService.sign(payload)
    };
  }
}