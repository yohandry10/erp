import { JwtService } from '@nestjs/jwt';
import { SupabaseService } from '../../shared/supabase/supabase.service';
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
export declare class AuthService {
    private readonly supabaseService;
    private readonly jwtService;
    constructor(supabaseService: SupabaseService, jwtService: JwtService);
    validateUser(email: string, password: string): Promise<any>;
    login(loginDto: LoginDto): Promise<{
        access_token: string;
        user: {
            id: any;
            email: any;
            nombre: any;
            apellido: any;
            nombre_usuario: any;
            roles: any;
        };
    }>;
    validateToken(token: string): Promise<any>;
    private findUserByEmail;
    private findUserById;
    refreshToken(user: any): Promise<{
        access_token: string;
    }>;
}
