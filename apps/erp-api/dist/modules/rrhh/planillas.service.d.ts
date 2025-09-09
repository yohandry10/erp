import { SupabaseService } from '../../shared/supabase/supabase.service';
import { EventBusService } from '../../shared/events/event-bus.service';
export declare class PlanillasService {
    private readonly supabaseService;
    private readonly eventBus;
    constructor(supabaseService: SupabaseService, eventBus: EventBusService);
    getPlanillas(): Promise<{
        success: boolean;
        data: any[];
    }>;
    crearPlanilla(planillaData: any): Promise<any>;
    calcularPlanillaMensual(planillaId: string): Promise<{
        success: boolean;
        totalEmpleados: number;
        totalIngresos: number;
        totalDescuentos: number;
        totalNeto: number;
    }>;
    private calcularEmpleado;
    private tieneHijos;
    private calcularImpuestoRenta;
    getDetallePlanilla(planillaId: string): Promise<any[]>;
    getBoleta(empleadoPlanillaId: string): Promise<any>;
    updatePlanilla(planillaId: string, updateData: any): Promise<any>;
    deletePlanilla(planillaId: string): Promise<{
        success: boolean;
        message: string;
        deletedPlanilla: any;
    }>;
    getConceptos(): Promise<{
        success: boolean;
        data: any[];
    }>;
    calcularPlanillaPersonalizada(planillaId: string, empleadosPersonalizados: any[]): Promise<{
        success: boolean;
        totalEmpleados: number;
        totalIngresos: number;
        totalDescuentos: number;
        totalNeto: number;
    }>;
    private calcularEmpleadoPersonalizado;
    pagarPlanillaCompleta(planillaId: string, metodoPago: 'efectivo' | 'transferencia'): Promise<{
        success: boolean;
        message: string;
        data: {
            planillaId: string;
            periodo: any;
            totalPagado: number;
            empleadosPagados: number;
            metodoPago: "transferencia" | "efectivo";
            pagos: any[];
        };
    }>;
    pagarEmpleadosSeleccionados(planillaId: string, pagoData: any): Promise<{
        success: boolean;
        message: string;
        data: {
            empleados_pagados: number;
            total_pagado: number;
            metodo_pago: any;
            asientos_generados: boolean;
        };
    }>;
    private getCuentaIdPorCodigo;
    generarAsientosContables(planillaId: string): Promise<{
        success: boolean;
        message: string;
        data: {
            numero_asiento: string;
            asiento_id: any;
            registros: number;
            monto_total: any;
            planilla_periodo: any;
            tablas_utilizadas: string[];
        };
    }>;
    getHistorialPagos(planillaId: string): Promise<{
        success: boolean;
        data: any[];
    }>;
}
