import { SupabaseService } from '../supabase/supabase.service';
import { EventBusService } from '../events/event-bus.service';
export interface DashboardMetrics {
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
}
export interface ActivityItem {
    id: string;
    type: 'CPE' | 'GRE' | 'COMPRA' | 'COTIZACION' | 'VENTA';
    description: string;
    amount?: number;
    date: string;
    status: 'success' | 'warning' | 'error' | 'pending';
}
export declare class DashboardIntegrationService {
    private readonly supabase;
    private readonly eventBus;
    constructor(supabase: SupabaseService, eventBus: EventBusService);
    getConsolidatedMetrics(): Promise<DashboardMetrics>;
    getRecentActivities(): Promise<ActivityItem[]>;
    private getVentasHoy;
    private getVentasMes;
    private getVentasMesAnterior;
    private getComprasMes;
    private getOrdenesCompraPendientes;
    private getProductos;
    private getProductosStockBajo;
    private getMovimientosHoy;
    private getCpeDelMes;
    private getGreDelMes;
    private getSireDelMes;
    private getCotizacionesDelMes;
    private getCotizacionesPendientes;
    private getCotizacionesAceptadas;
    private getUsuarios;
    private getVentasRecientes;
    private getComprasRecientes;
    private getCotizacionesRecientes;
    private getCpeRecientes;
    private getGreRecientes;
    private sumarTotales;
    private calcularValorInventario;
    private processVentasActivities;
    private processComprasActivities;
    private processCotizacionesActivities;
    private processCpeActivities;
    private processGreActivities;
    private mapearEstado;
    private mapearEstadoSunat;
}
