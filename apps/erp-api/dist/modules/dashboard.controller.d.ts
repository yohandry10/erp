import { SupabaseService } from '../shared/supabase/supabase.service';
export declare class DashboardController {
    private readonly supabase;
    constructor(supabase: SupabaseService);
    seedTestData(): Promise<{
        success: boolean;
        data: {
            cpe_insertados: number;
            gre_insertadas: number;
            errores: {
                cpe: string;
                gre: string;
            };
        };
        message: string;
        error?: undefined;
    } | {
        success: boolean;
        message: string;
        error: any;
        data?: undefined;
    }>;
    getStats(): Promise<{
        success: boolean;
        data: {
            totalCpe: number;
            totalGre: number;
            totalSire: number;
            totalUsers: number;
            totalInventario: number;
            totalCompras: number;
            totalCotizaciones: number;
            ventasMes: number;
            ventasHoy: number;
            comprasMes: number;
            valorInventario: number;
            productosConStockBajo: number;
            cotizacionesPendientes: number;
            ordenesCompraPendientes: number;
            movimientosHoy: number;
            tasaConversionCotizaciones: number;
            crecimientoVentas: number;
            ultimaActualizacion: string;
            periodoCalculado: {
                inicio: string;
                fin: string;
            };
        };
        message?: undefined;
    } | {
        success: boolean;
        data: {
            totalCpe: number;
            totalGre: number;
            totalSire: number;
            totalUsers: number;
            totalInventario: number;
            totalCompras: number;
            totalCotizaciones: number;
            ventasMes: number;
            ventasHoy: number;
            comprasMes: number;
            valorInventario: number;
            productosConStockBajo: number;
            cotizacionesPendientes: number;
            ordenesCompraPendientes: number;
            movimientosHoy: number;
            tasaConversionCotizaciones: number;
            crecimientoVentas: number;
            ultimaActualizacion: string;
            error: any;
        };
        message: string;
    }>;
    getActivities(): Promise<{
        success: boolean;
        data: any[];
        message?: undefined;
    } | {
        success: boolean;
        data: any[];
        message: string;
    }>;
    private sumarTotales;
    private sumarTotalesCpe;
    private calcularValorInventario;
    private contarProductosStockBajo;
    private mapearEstado;
}
