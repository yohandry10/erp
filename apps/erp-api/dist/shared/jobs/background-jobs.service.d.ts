import { SupabaseService } from '../supabase/supabase.service';
import { EventBusService } from '../events/event-bus.service';
export declare class BackgroundJobsService {
    private readonly supabase;
    private readonly eventBus;
    constructor(supabase: SupabaseService, eventBus: EventBusService);
    private initializeJobs;
    private scheduleDaily;
    private scheduleInterval;
    private scheduleWeekly;
    private scheduleMonthly;
    ejecutarCierreVentasDiario(): Promise<void>;
    verificarStockBajo(): Promise<void>;
    verificarVencimientosPagos(): Promise<void>;
    generarReportesSireMensual(): Promise<void>;
    actualizarMetricasDashboard(): Promise<void>;
    ejecutarInventarioCiclico(): Promise<void>;
    procesarAsistenciasPendientes(): Promise<void>;
}
