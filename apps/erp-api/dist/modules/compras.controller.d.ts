import { SupabaseService } from '../shared/supabase/supabase.service';
import { EventBusService } from '../shared/events/event-bus.service';
import { InventoryIntegrationService } from '../shared/integration/inventory-integration.service';
export declare class ComprasController {
    private readonly supabase;
    private readonly eventBus;
    private readonly inventoryIntegration;
    constructor(supabase: SupabaseService, eventBus: EventBusService, inventoryIntegration: InventoryIntegrationService);
    getStats(): Promise<{
        success: boolean;
        data: {
            comprasDelMes: number;
            totalCompras: any;
            montoTotalMes: any;
            ordenesActivas: number;
            proveedoresActivos: number;
            ordenesVencidas: number;
        };
    }>;
    getOrdenes(filtros: any): Promise<{
        success: boolean;
        data: any[];
        error?: undefined;
    } | {
        success: boolean;
        error: any;
        data: any[];
    }>;
    getNextNumber(): Promise<{
        success: boolean;
        data: {
            numero: string;
        };
        message?: undefined;
        error?: undefined;
    } | {
        success: boolean;
        message: string;
        error: any;
        data?: undefined;
    }>;
    crearOrden(ordenData: any): Promise<{
        success: boolean;
        message: string;
        data: any;
        error?: undefined;
    } | {
        success: boolean;
        error: any;
        message?: undefined;
        data?: undefined;
    }>;
    recibirMercancia(ordenId: string, recepcionData: any): Promise<{
        success: boolean;
        message: string;
        data: {
            ordenId: any;
            estado: string;
            totalRecibido: any;
            totalPedido: any;
        };
        error?: undefined;
    } | {
        success: boolean;
        error: any;
        message?: undefined;
        data?: undefined;
    }>;
    cancelarOrden(ordenId: string, motivoData: any): Promise<{
        success: boolean;
        message: string;
        error?: undefined;
    } | {
        success: boolean;
        error: any;
        message?: undefined;
    }>;
    getProveedores(): Promise<{
        success: boolean;
        data: {
            id: any;
            nombre: any;
            ruc: any;
            contacto: any;
            telefono: any;
            email: any;
            direccion: any;
            condiciones_pago: any;
            estado: any;
            activo: any;
        }[];
    } | {
        success: boolean;
        error: any;
        data: any[];
    }>;
    crearProveedor(proveedorData: any): Promise<{
        success: boolean;
        message: string;
        data: any;
        error?: undefined;
    } | {
        success: boolean;
        error: any;
        message?: undefined;
        data?: undefined;
    }>;
    actualizarProveedor(proveedorId: string, proveedorData: any): Promise<{
        success: boolean;
        message: string;
        data: any;
        error?: undefined;
    } | {
        success: boolean;
        error: any;
        message?: undefined;
        data?: undefined;
    }>;
    desactivarProveedor(proveedorId: string): Promise<{
        success: boolean;
        message: string;
        data: any;
        error?: undefined;
    } | {
        success: boolean;
        error: any;
        message?: undefined;
        data?: undefined;
    }>;
    getReporteCompras(filtros: any): Promise<{
        success: boolean;
        data: {
            ordenes: any[];
            resumen: {
                totalOrdenes: number;
                totalMonto: any;
                porEstado: {};
                topProveedores: any[];
            };
        };
        error?: undefined;
    } | {
        success: boolean;
        error: any;
        data: {
            ordenes: any[];
            resumen: {};
        };
    }>;
    getProductos(): Promise<{
        success: boolean;
        data: {
            id: any;
            codigo: any;
            nombre: any;
            precio: any;
            stock: any;
            categoria: any;
            activo: any;
        }[];
        message?: undefined;
        error?: undefined;
    } | {
        success: boolean;
        message: string;
        error: any;
        data?: undefined;
    }>;
    getOrden(ordenId: string): Promise<{
        success: boolean;
        data: any;
        error?: undefined;
    } | {
        success: boolean;
        error: any;
        data: any;
    }>;
}
