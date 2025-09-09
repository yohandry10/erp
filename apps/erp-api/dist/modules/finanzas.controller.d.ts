import { SupabaseService } from '../shared/supabase/supabase.service';
import { EventBusService } from '../shared/events/event-bus.service';
import { FinancialIntegrationService } from '../shared/integration/financial-integration.service';
export declare class FinanzasController {
    private readonly supabase;
    private readonly eventBus;
    private readonly financialService;
    constructor(supabase: SupabaseService, eventBus: EventBusService, financialService: FinancialIntegrationService);
    getDashboardFinancieroCompleto(): Promise<{
        success: boolean;
        data: {
            indicadoresActuales: import("../shared/integration/financial-integration.service").KPIsFinancieros;
            tendencias: {
                ventasMensuales: {
                    mes: string;
                    anio: number;
                    ventas: number;
                    gastos: number;
                    utilidad: number;
                }[];
                gastosMensuales: {
                    mes: string;
                    categoria: string;
                    monto: number;
                }[];
                utilidadMensual: {
                    mes: string;
                    anio: number;
                    utilidad: number;
                    margen: number;
                }[];
            };
            comparativas: {
                crecimientoAnual: number;
                margenPromedio: number;
            };
        };
        message?: undefined;
    } | {
        success: boolean;
        message: string;
        data?: undefined;
    }>;
    getFlujoProyectado(meses?: number): Promise<import("../shared/integration/financial-integration.service").ProyeccionFlujoEfectivo>;
    getAnalisisCredito(solicitudData: {
        montoSolicitado: number;
        plazoMeses: number;
        ingresosMensuales: number;
        historialCrediticio: 'EXCELENTE' | 'BUENO' | 'REGULAR' | 'MALO';
    }): Promise<import("../shared/integration/financial-integration.service").AnalisisCredito>;
    getHistoricoVentas(): Promise<{
        success: boolean;
        data: {
            mes: string;
            anio: number;
            ventas: number;
            gastos: number;
            utilidad: number;
        }[];
    }>;
    getHistoricoGastos(): Promise<{
        success: boolean;
        data: {
            mes: string;
            categoria: string;
            monto: number;
        }[];
    }>;
    getHistoricoUtilidad(): Promise<{
        success: boolean;
        data: {
            mes: string;
            anio: number;
            utilidad: number;
            margen: number;
        }[];
    }>;
    private calcularCrecimientoAnual;
    private calcularMargenPromedio;
}
