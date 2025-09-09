import { SupabaseService } from '../supabase/supabase.service';
import { EventBusService } from '../events/event-bus.service';
export interface KPIsFinancieros {
    efectivoDisponible: number;
    ventasUltimos30dias: number;
    gastosUltimos30dias: number;
    utilidadUltimos30dias: number;
    cuentasPorCobrar: number;
    cuentasPorPagar: number;
    rotacionInventario: number;
    margenBruto: number;
    liquidez: string;
    rentabilidad: string;
    crecimiento: string;
}
export interface DatosHistoricos {
    ventasMensuales: Array<{
        mes: string;
        anio: number;
        ventas: number;
        gastos: number;
        utilidad: number;
    }>;
    gastosMensuales: Array<{
        mes: string;
        categoria: string;
        monto: number;
    }>;
    utilidadMensual: Array<{
        mes: string;
        anio: number;
        utilidad: number;
        margen: number;
    }>;
}
export interface ProyeccionFlujoEfectivo {
    meses: Array<{
        mes: string;
        anio: number;
        ingresos: number;
        egresos: number;
        saldoNeto: number;
        saldoAcumulado: number;
    }>;
    recomendaciones: string[];
    escenarios: {
        optimista: Array<any>;
        realista: Array<any>;
        pesimista: Array<any>;
    };
}
export interface AnalisisCredito {
    capacidadPago: {
        ingresosMensuales: number;
        gastosFijos: number;
        gastosPorcentaje: number;
        capacidadDisponible: number;
        recomendacionMaxima: number;
    };
    puntuacion: {
        liquidez: number;
        rentabilidad: number;
        historialPagos: number;
        estabilidad: number;
        puntuacionTotal: number;
    };
    recomendacion: 'RECOMENDAR' | 'ANALIZAR' | 'NO_RECOMENDAR';
    justificacion: string;
    documentosNecesarios: string[];
}
export declare class FinancialIntegrationService {
    private readonly supabase;
    private readonly eventBus;
    private kpisCache;
    private lastKPIUpdate;
    private cacheValidityMinutes;
    constructor(supabase: SupabaseService, eventBus: EventBusService);
    private initializeEventListeners;
    getDatosHistoricosCompleto(): Promise<DatosHistoricos>;
    private obtenerVentasMensuales;
    private obtenerGastosMensuales;
    private obtenerUtilidadMensual;
    getFlujoProyectado(meses?: number): Promise<ProyeccionFlujoEfectivo>;
    private calcularPromedio;
    private generarRecomendacionesFlujo;
    private generarEscenarios;
    getAnalisisCredito(solicitudData: {
        montoSolicitado: number;
        plazoMeses: number;
        ingresosMensuales: number;
        historialCrediticio: 'EXCELENTE' | 'BUENO' | 'REGULAR' | 'MALO';
    }): Promise<AnalisisCredito>;
    private calcularPuntuacionLiquidez;
    private calcularPuntuacionRentabilidad;
    private calcularPuntuacionHistorial;
    private calcularPuntuacionEstabilidad;
    getKPIsFinancieros(): Promise<KPIsFinancieros>;
    private calcularEfectivoDisponible;
    private calcularVentas30Dias;
    private calcularGastos30Dias;
    private calcularCuentasPorCobrar;
    private calcularCuentasPorPagar;
    private calcularValorInventario;
    private evaluarLiquidez;
    private evaluarRentabilidad;
    private evaluarCrecimiento;
    private calcularVentasPeriodo;
    procesarVentaParaFinanzas(venta: any): Promise<void>;
    procesarCompraParaFinanzas(compra: any): Promise<void>;
    procesarGastoParaFinanzas(gasto: any): Promise<void>;
    procesarPagoFacturaParaFinanzas(pago: any): Promise<void>;
}
