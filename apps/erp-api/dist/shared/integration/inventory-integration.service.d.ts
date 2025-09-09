import { SupabaseService } from '../supabase/supabase.service';
import { EventBusService, VentaProcessedEvent, CompraEntregadaEvent } from '../events/event-bus.service';
export interface MovimientoStock {
    id?: string;
    productoId: string;
    tipoMovimiento: 'ENTRADA' | 'SALIDA' | 'AJUSTE';
    cantidad: number;
    stockAnterior: number;
    stockNuevo: number;
    motivo: string;
    precioUnitario: number;
    valorTotal: number;
    usuarioId: string;
    referencia?: string;
    ventaId?: string;
}
export interface ProductoStock {
    id: string;
    codigo: string;
    nombre: string;
    stockActual: number;
    stockMinimo: number;
    valorUnitario: number;
    valorTotal: number;
    categoria: string;
    activo: boolean;
}
export declare class InventoryIntegrationService {
    private readonly supabase;
    private readonly eventBus;
    constructor(supabase: SupabaseService, eventBus: EventBusService);
    initializeEventListeners(): void;
    procesarVentaParaInventario(venta: VentaProcessedEvent): Promise<void>;
    procesarCompraParaInventario(compra: CompraEntregadaEvent): Promise<void>;
    realizarMovimientoStock(movimiento: MovimientoStock): Promise<string | null>;
    getProductosStock(): Promise<ProductoStock[]>;
    getMovimientosStock(filtros?: any): Promise<any[]>;
    getEstadisticasInventario(): Promise<{
        totalProductos: number;
        valorInventario: number;
        productosStockBajo: number;
        productosSinStock: number;
        movimientosHoy: number;
        entradasHoy: number;
        salidasHoy: number;
        productosConStock: number;
        rotacionPromedio: number;
    }>;
    private calcularRotacionPromedio;
    actualizarStockProducto(productoId: string, cantidad: number, tipoMovimiento: 'ENTRADA' | 'SALIDA' | 'AJUSTE', motivo: string, precioUnitario?: number, usuarioId?: string): Promise<string | null>;
    ajustarStock(productoId: string, cantidadAjuste: number, motivo: string, usuarioId?: string): Promise<string | null>;
    registrarEntrada(productoId: string, cantidad: number, precioUnitario: number, motivo: string, usuarioId?: string): Promise<string | null>;
    getProductosStockCritico(): Promise<ProductoStock[]>;
    getProductosSinStock(): Promise<ProductoStock[]>;
    verificarDisponibilidadStock(productosVenta: {
        productoId: string;
        cantidad: number;
    }[]): Promise<{
        disponible: boolean;
        faltantes: any[];
    }>;
}
