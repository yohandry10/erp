import { SupabaseService } from '../supabase/supabase.service';
import { EventBusService, VentaProcessedEvent, MovimientoStockEvent, CompraEntregadaEvent, PagoFacturaEvent, GastoRegistradoEvent } from '../events/event-bus.service';
export declare class AccountingEntriesService {
    private readonly supabase;
    private readonly eventBus;
    private cuentasCache;
    constructor(supabase: SupabaseService, eventBus: EventBusService);
    initializeCuentasCache(): Promise<void>;
    private getCuentaId;
    private initializeEventListeners;
    procesarAsientoVenta(venta: VentaProcessedEvent): Promise<string | null>;
    procesarAsientoCompra(compra: CompraEntregadaEvent): Promise<string | null>;
    procesarAsientoMovimientoStock(movimiento: MovimientoStockEvent): Promise<string | null>;
    procesarAsientoPagoFactura(pago: PagoFacturaEvent): Promise<string | null>;
    procesarAsientoGasto(gasto: GastoRegistradoEvent): Promise<string | null>;
    private calcularCostoVentas;
    private guardarAsientoContable;
    getPlanCuentas(): Promise<any[]>;
    getAsientosContables(filtros?: any): Promise<any[]>;
}
