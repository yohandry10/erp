import { Injectable } from '@nestjs/common';
// import { JwtService } from '@nestjs/jwt';
import { SupabaseService } from '../../shared/supabase/supabase.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly supabaseService: SupabaseService,
    // private readonly jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string): Promise<any> {
    // TODO: Implement actual user validation
    const user = await this.findUserByEmail(email);
    if (user && user.password === password) {
      const { password, ...result } = user;
      return result;
    }
    return null;
  }

  async login(user: any) {
    const payload = { email: user.email, sub: user.id };
    return {
      access_token: 'temporary-token', // this.jwtService.sign(payload),
    };
  }

  private async findUserByEmail(email: string): Promise<any> {
    // TODO: Implement actual user lookup
    return null;
  }
}