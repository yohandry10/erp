export declare class LoginDto {
    email: string;
    password: string;
}
export declare class LoginResponseDto {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    user: {
        id: string;
        email: string;
        tenant_id: string;
    };
}
//# sourceMappingURL=login.dto.d.ts.map