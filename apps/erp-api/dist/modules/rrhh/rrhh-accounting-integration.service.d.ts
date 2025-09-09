import { SupabaseService } from '../../shared/supabase/supabase.service';
export interface AsientoPlanilla {
    planillaId: string;
    periodo: string;
    totalIngresos: number;
    totalDescuentos: number;
    totalAportes: number;
    totalNeto: number;
    empleados: EmpleadoPlanilla[];
}
export interface EmpleadoPlanilla {
    empleadoId: string;
    nombres: string;
    apellidos: string;
    numeroDocumento: string;
    ingresos: number;
    descuentos: number;
    aportes: number;
    neto: number;
}
export declare class RrhhAccountingIntegrationService {
    private readonly supabase;
    constructor(supabase: SupabaseService);
    generarAsientosPlanilla(planillaData: AsientoPlanilla): Promise<string>;
    private generarDetallesAsiento;
    private calcularAportesPensiones;
    private calcularImpuestoRenta;
    generarAsientoPagoPlanilla(planillaId: string, metodoPago: 'transferencia' | 'efectivo'): Promise<string>;
    generarAsientoLiquidacion(liquidacionId: string): Promise<string>;
    getResumenContableRrhh(fechaDesde?: string, fechaHasta?: string): Promise<{
        success: boolean;
        data: {
            periodo: string;
            totalAsientos: number;
            totales: any;
            asientos: any[];
        };
    }>;
}
