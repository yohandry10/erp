import { SupabaseService } from '../../shared/supabase/supabase.service';
import { EventBusService } from '../../shared/events/event-bus.service';
export declare class SireService {
    private readonly supabaseService;
    private readonly eventBus;
    constructor(supabaseService: SupabaseService, eventBus: EventBusService);
    private initializeEventListeners;
    procesarComprobanteParaSire(comprobante: any): Promise<void>;
    private buscarOCrearReportePeriodo;
    private actualizarContadorRegistros;
    private actualizarRegistrosPendientes;
    private crearRegistroDetalleComprobante;
    getStats(tenantId?: string): Promise<{
        success: boolean;
        data: {
            reportesDelMes: number;
            registrosTotales: any;
            enviadosASunat: number;
            pendientes: number;
        };
        error?: undefined;
    } | {
        success: boolean;
        data: {
            reportesDelMes: number;
            registrosTotales: number;
            enviadosASunat: number;
            pendientes: number;
        };
        error: any;
    }>;
    getReportes(filters: any, tenantId?: string): Promise<{
        success: boolean;
        data: any[];
        error?: undefined;
    } | {
        success: boolean;
        data: any[];
        error: any;
    }>;
    private getTipoReporteFullName;
    generarReporte(reportData: any, tenantId?: string): Promise<{
        success: boolean;
        data: any;
        message: string;
    }>;
    downloadReporte(id: string, tenantId?: string): Promise<{
        success: boolean;
        data: string;
        message: string;
    }>;
    enviarSunat(id: string, tenantId?: string): Promise<{
        success: boolean;
        message: string;
    }>;
    findAll(): {
        success: boolean;
        message: string;
        data: any[];
    };
    private simularGeneracionReporte;
    private generarContenidoSire;
    private generarRegistroVentas;
    private generarRegistroCompras;
    private generarLibrosElectronicos;
    private generarRetenciones;
    private getNextMonth;
    private generateUuid;
}
