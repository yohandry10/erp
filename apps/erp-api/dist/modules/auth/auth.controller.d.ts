import { AuthService, LoginDto } from './auth.service';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
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
    getProfile(req: any): Promise<any>;
    refresh(req: any): Promise<{
        access_token: string;
    }>;
    validateToken(token: string): Promise<{
        valid: boolean;
        payload: any;
    }>;
    getConfigStatus(): Promise<{
        security: {
            jwtConfigured: boolean;
            refreshConfigured: boolean;
            encryptionConfigured: boolean;
            environment: string;
        };
    }>;
}
