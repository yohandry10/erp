export declare class ResponseDto<T> {
    success: boolean;
    data?: T;
    message?: string;
    error?: string;
    metadata?: {
        timestamp?: string;
        requestId?: string;
        version?: string;
        [key: string]: any;
    };
}
export declare class PaginatedResponseDto<T> extends ResponseDto<T[]> {
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
    };
}
export declare class ErrorResponseDto extends ResponseDto<null> {
    success: false;
    data: null;
    errorCode?: string;
    details?: any[];
}
