import { SupabaseService } from '../shared/supabase/supabase.service';
export declare class ReportsController {
    private readonly supabaseService;
    constructor(supabaseService: SupabaseService);
    reporteVentas(req: any, fechaInicio?: string, fechaFin?: string): Promise<{
        success: boolean;
        data: any[];
        total: number;
    }>;
    reporteInventario(req: any): Promise<{
        success: boolean;
        data: any[];
        total: number;
    }>;
}
