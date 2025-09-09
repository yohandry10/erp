export declare class ApiResponseDto<T = any> {
    success: boolean;
    data?: T;
    message?: string;
    error?: string;
    timestamp: Date;
    constructor(success: boolean, data?: T, message?: string, error?: string);
    static success<T>(data?: T, message?: string): ApiResponseDto<T>;
    static error(error: string, message?: string): ApiResponseDto;
}
//# sourceMappingURL=response.dto.d.ts.map