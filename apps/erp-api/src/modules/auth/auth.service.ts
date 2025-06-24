import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(private jwtService: JwtService) {}

  async validateUser(username: string, password: string): Promise<any> {
    // TODO: Implementar validación real con base de datos
    // Por ahora, permitir cualquier usuario para testing
    return { id: 1, username, email: `${username}@example.com` };
  }

  async login(user: any) {
    const payload = { username: user.username, sub: user.id, email: user.email };
    return {
      access_token: this.jwtService.sign(payload),
      user: user,
    };
  }

  async verifyToken(token: string) {
    try {
      return this.jwtService.verify(token);
    } catch (error) {
      return null;
    }
  }
}