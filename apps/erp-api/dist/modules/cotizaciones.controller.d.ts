import { SupabaseService } from '../shared/supabase/supabase.service';
import { Request } from 'express';
export declare class CotizacionesController {
    private readonly supabaseService;
    constructor(supabaseService: SupabaseService);
    getStats(req: Request): Promise<{
        success: boolean;
        data: {
            cotizacionesDelMes: number;
            valorCotizado: number;
            tasaConversion: number;
            porVencer: number;
        };
        error?: undefined;
    } | {
        success: boolean;
        data: {
            cotizacionesDelMes: number;
            valorCotizado: number;
            tasaConversion: number;
            porVencer: number;
        };
        error: any;
    }>;
    getCotizaciones(filters: any, req: Request): Promise<{
        success: boolean;
        data: any[];
        error?: undefined;
    } | {
        success: boolean;
        data: any[];
        error: any;
    }>;
    getClientesTop(req: Request): Promise<{
        success: boolean;
        data: any[];
    }>;
    createCotizacion(cotizacionData: any, req: Request): Promise<{
        success: boolean;
        data: any;
        message: string;
        error?: undefined;
    } | {
        success: boolean;
        data: any;
        error: any;
        message?: undefined;
    }>;
    actualizarCotizacion(id: string, cotizacionData: any, req: Request): Promise<{
        success: boolean;
        data: any;
        message: string;
        error?: undefined;
    } | {
        success: boolean;
        data: any;
        error: any;
        message?: undefined;
    }>;
    getCotizacion(id: string, req: Request): Promise<{
        success: boolean;
        data: any;
        error?: undefined;
    } | {
        success: boolean;
        data: any;
        error: any;
    }>;
    aprobarCotizacion(id: string, data: {
        probabilidad?: number;
        observaciones?: string;
    }, req: Request): Promise<{
        success: boolean;
        data: any;
        message: string;
        error?: undefined;
    } | {
        success: boolean;
        data: any;
        error: any;
        message?: undefined;
    }>;
    convertirEnVenta(id: string, opcionesConversion: {
        generar_factura?: boolean;
        tipo_documento?: 'FACTURA' | 'BOLETA';
        metodo_pago?: string;
        fecha_emision?: string;
        fecha_vencimiento?: string;
        observaciones?: string;
    }, req: Request): Promise<{
        success: boolean;
        data: {
            cotizacion: any;
            documento: any;
        };
        message: string;
        error?: undefined;
    } | {
        success: boolean;
        data: any;
        error: any;
        message?: undefined;
    }>;
    rechazarCotizacion(id: string, data: {
        motivo: string;
    }, req: Request): Promise<{
        success: boolean;
        data: any;
        message: string;
        error?: undefined;
    } | {
        success: boolean;
        data: any;
        error: any;
        message?: undefined;
    }>;
    puedeConvertir(id: string, req: Request): Promise<{
        success: boolean;
        puede_convertir: boolean;
        motivo: string;
        requiere_aprobacion?: undefined;
        estado_actual?: undefined;
    } | {
        success: boolean;
        puede_convertir: boolean;
        motivo: string;
        requiere_aprobacion: boolean;
        estado_actual: any;
    }>;
}
