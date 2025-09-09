import { SupabaseService } from '../shared/supabase/supabase.service';
import { InventoryIntegrationService } from '../shared/integration/inventory-integration.service';
export declare class InventarioController {
    private readonly supabase;
    private readonly inventoryService;
    constructor(supabase: SupabaseService, inventoryService: InventoryIntegrationService);
    testConnection(): Promise<{
        success: boolean;
        message: string;
        debug: {
            hasSupabaseService: boolean;
            hasClient: boolean;
            code?: undefined;
            details?: undefined;
            hint?: undefined;
        };
        error?: undefined;
        data?: undefined;
    } | {
        success: boolean;
        message: string;
        error: string;
        debug: {
            code: string;
            details: string;
            hint: string;
            hasSupabaseService?: undefined;
            hasClient?: undefined;
        };
        data?: undefined;
    } | {
        success: boolean;
        message: string;
        data: {
            totalProductos: number;
            muestraProductos: any[];
        };
        debug?: undefined;
        error?: undefined;
    } | {
        success: boolean;
        message: string;
        error: any;
        debug?: undefined;
        data?: undefined;
    }>;
    getStats(): Promise<{
        success: boolean;
        data: {
            totalProductos: number;
            valorInventario: number;
            movimientosHoy: number;
            productosStockBajo: number;
        };
        message: string;
    } | {
        success: boolean;
        data: {
            totalProductos: number;
            valorInventario: number;
            productosStockBajo: number;
            movimientosHoy: number;
        };
        message?: undefined;
    }>;
    findAllProductos(query: any): Promise<{
        success: boolean;
        data: any[];
        message?: undefined;
    } | {
        success: boolean;
        message: string;
        data: any[];
    }>;
    findAllMovimientos(query: any): Promise<{
        success: boolean;
        data: any[];
        message: string;
    } | {
        success: boolean;
        data: {
            id: any;
            tenant_id: any;
            producto_id: any;
            tipo_movimiento: any;
            cantidad: any;
            motivo: any;
            referencia: any;
            usuario_id: any;
            created_at: any;
        }[];
        message?: undefined;
    }>;
    createProducto(productData: any): Promise<{
        success: boolean;
        message: string;
        data?: undefined;
    } | {
        success: boolean;
        data: any;
        message: string;
    }>;
    findOneProducto(id: string): Promise<{
        success: boolean;
        message: string;
        data?: undefined;
    } | {
        success: boolean;
        data: any;
        message?: undefined;
    }>;
    deleteProducto(id: string): Promise<{
        success: boolean;
        message: string;
        data?: undefined;
    } | {
        success: boolean;
        data: any;
        message: string;
    }>;
}
