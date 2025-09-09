import { SupabaseService } from './shared/supabase/supabase.service';
import { Request } from 'express';
export declare class AppController {
    private readonly supabaseService;
    constructor(supabaseService: SupabaseService);
    getStatus(): {
        status: string;
        timestamp: string;
        version: string;
        message: string;
        endpoints: {
            docs: string;
            health: string;
        };
    };
    healthCheck(): {
        status: string;
        timestamp: string;
        uptime: number;
        version: string;
    };
    testConnection(req: Request): Promise<{
        status: string;
        message: string;
        user_id: any;
        tenant_id: any;
        timestamp: string;
        error?: undefined;
    } | {
        status: string;
        message: string;
        error: any;
        timestamp: string;
        user_id?: undefined;
        tenant_id?: undefined;
    }>;
    getApiInfo(): {
        name: string;
        version: string;
        description: string;
        modules: {
            auth: string;
            cpe: string;
            gre: string;
            sire: string;
            ose: string;
        };
        features: string[];
        documentation: string;
        timestamp: string;
    };
}
