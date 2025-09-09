import { SupabaseService } from '../shared/supabase/supabase.service';
import { InventoryIntegrationService } from '../shared/integration/inventory-integration.service';
export declare class AnalyticsController {
    private readonly supabase;
    private readonly inventoryService;
    constructor(supabase: SupabaseService, inventoryService: InventoryIntegrationService);
    getVentasTiempo(filtros: any): Promise<{
        success: boolean;
        data: {
            labels: string[];
            datasets: {
                label: string;
                data: number[];
                backgroundColor: string;
                borderColor: string;
                fill: boolean;
            }[];
            totales: {
                ventasActuales: number;
                ventasAnterior: number;
                crecimiento: string;
            };
        };
        message?: undefined;
    } | {
        success: boolean;
        message: any;
        data: {
            labels: any[];
            datasets: any[];
            totales: {
                ventasActuales: number;
                ventasAnterior: number;
                crecimiento: string;
            };
        };
    }>;
    private procesarVentasDiarias;
    private calcularVentasMesAnterior;
    getDeudasClientes(): Promise<{
        success: boolean;
        data: {
            graficoEdadSaldos: {
                labels: string[];
                data: number[];
                backgroundColor: string[];
            };
            topDeudores: any[];
            alertasCobranza: any[];
            totales: {
                totalPorCobrar: number;
                vencido: number;
                porcentajeVencido: string | number;
            };
        };
        message?: undefined;
    } | {
        success: boolean;
        message: any;
        data?: undefined;
    }>;
    getRentabilidadProductos(): Promise<{
        success: boolean;
        data: {
            graficoBarras: {
                labels: any[];
                datasets: {
                    label: string;
                    data: number[];
                    backgroundColor: string;
                }[];
            };
            graficoScatter: {
                datasets: {
                    label: string;
                    data: {
                        x: number;
                        y: number;
                        producto: any;
                    }[];
                    backgroundColor: string;
                }[];
            };
            recomendaciones: string[];
        };
        message?: undefined;
    } | {
        success: boolean;
        message: any;
        data?: undefined;
    }>;
    getPuntoEquilibrio(): Promise<{
        success: boolean;
        data: {
            totalCostosFijos: number;
            analisisPorProducto: {
                producto: any;
                precioVenta: number;
                costoVariable: number;
                margenContribucion: number;
                puntoEquilibrioUnidades: number;
                puntoEquilibrioSoles: number;
            }[];
            resumen: {
                productosRentables: number;
                productosNoRentables: number;
                recomendacion: string;
            };
        };
        message?: undefined;
    } | {
        success: boolean;
        message: any;
        data?: undefined;
    }>;
    getEscenariosFinancieros(escenario?: string): Promise<{
        success: boolean;
        data: {
            escenarioActual: string;
            proyecciones: any;
            analisisSensibilidad: any;
            recomendaciones: string[];
        };
        message?: undefined;
    } | {
        success: boolean;
        message: any;
        data?: undefined;
    }>;
    private calcularCostoPromedio;
    private calcularPrecioVentaPromedio;
    private calcularVolumenVentas;
    private generarRecomendacionesRentabilidad;
    private generarAlertasCobranza;
    private obtenerVentasUltimos12Meses;
    private obtenerCostosUltimos12Meses;
    private simularEscenarios;
    private generarAnalisisSensibilidad;
    private generarRecomendacionesEscenarios;
    private generarRecomendacionPuntoEquilibrio;
}
