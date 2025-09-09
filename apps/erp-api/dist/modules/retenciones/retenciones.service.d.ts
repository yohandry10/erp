import { SupabaseService } from '../../shared/supabase/supabase.service';
import { EventBusService } from '../../shared/events/event-bus.service';
import { CreateRetencionDto, RetencionResponse, CalcularRetencionDto, RetencionCalculada, ResumenRetencionesResponse } from './retenciones.types';
export declare class RetencionesService {
    private readonly supabase;
    private readonly eventBus;
    constructor(supabase: SupabaseService, eventBus: EventBusService);
    calcularRetencion(data: CalcularRetencionDto): Promise<RetencionCalculada>;
    crearRetencion(data: CreateRetencionDto): Promise<RetencionResponse>;
    getRetenciones(fechaDesde?: string, fechaHasta?: string, categoria?: string, proveedorId?: string, estado?: string, page?: number, limit?: number): Promise<{
        data: RetencionResponse[];
        total: number;
        page: number;
        totalPages: number;
    }>;
    getRetencionById(id: string): Promise<RetencionResponse>;
    anularRetencion(id: string, motivo: string): Promise<void>;
    getResumenRetenciones(fechaDesde: string, fechaHasta: string): Promise<ResumenRetencionesResponse>;
    private generarNumeroCorrelativo;
    exportarParaSunat(fechaDesde: string, fechaHasta: string, categoria?: string): Promise<any[]>;
    validarConfiguracion(): Promise<{
        valida: boolean;
        errores: string[];
    }>;
}
