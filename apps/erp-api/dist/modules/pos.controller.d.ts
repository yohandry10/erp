import { SupabaseService } from '../shared/supabase/supabase.service';
import { EventBusService } from '../shared/events/event-bus.service';
import { InventoryIntegrationService } from '../shared/integration/inventory-integration.service';
export declare class PosController {
    private readonly supabase;
    private readonly eventBus;
    private readonly inventoryService;
    constructor(supabase: SupabaseService, eventBus: EventBusService, inventoryService: InventoryIntegrationService);
    getStats(): {
        success: boolean;
        data: {
            ventasHoy: number;
            montoVentasHoy: number;
            productosVendidos: number;
            estadoCaja: string;
            ultimaVenta: any;
        };
    };
    private estadoCaja;
    getEstadoCaja(): {
        success: boolean;
        data: {
            estado: "ABIERTA" | "CERRADA";
            montoInicial: number;
            ventasEfectivo: number;
            ventasTarjeta: number;
            montoFinal: number;
            fechaApertura: string | null;
            fechaCierre: string | null;
        };
    };
    abrirCaja(data: any): {
        success: boolean;
        data: {
            estado: "ABIERTA" | "CERRADA";
            montoInicial: number;
            ventasEfectivo: number;
            ventasTarjeta: number;
            montoFinal: number;
            fechaApertura: string | null;
            fechaCierre: string | null;
        };
        message: string;
    };
    cerrarCaja(data: any): Promise<{
        success: boolean;
        data: {
            sesion: {
                id: any;
                fechaApertura: any;
                fechaCierre: string;
                montoInicial: any;
                montoContado: any;
                diferencia: number;
            };
            analisisFinanciero: {
                cantidadVentas: number;
                totalVentas: any;
                totalSubtotal: any;
                totalImpuestos: any;
                montoEsperado: any;
                ventaPromedio: number;
                articulosVendidos: any;
            };
            productosMasVendidos: any[];
            analisisPagos: {
                efectivo: number;
                tarjeta: number;
                digital: number;
                transferencia: number;
                detallePorMetodo: {
                    [key: string]: number;
                };
            };
            ventasDetalladas: {
                numero: any;
                fecha: any;
                total: any;
                items: any;
                metodoPago: any;
            }[];
        };
        message: string;
        error?: undefined;
    } | {
        success: boolean;
        message: string;
        error: any;
        data?: undefined;
    }>;
    private generarAnalisisFinanciero;
    private calcularProductosMasVendidos;
    private analizarMetodosPago;
    procesarVenta(ventaData: any): Promise<{
        success: boolean;
        message: string;
        data: {
            faltantes: any[];
            error: string;
            venta?: undefined;
            numeroTicket?: undefined;
            total?: undefined;
            stockDescontado?: undefined;
            mensaje?: undefined;
            details?: undefined;
        };
    } | {
        success: boolean;
        data: {
            venta: any;
            numeroTicket: string;
            total: any;
            stockDescontado: any[];
            mensaje: string;
            faltantes?: undefined;
            error?: undefined;
            details?: undefined;
        };
        message?: undefined;
    } | {
        success: boolean;
        message: string;
        data: {
            error: string;
            details: any;
            faltantes?: undefined;
            venta?: undefined;
            numeroTicket?: undefined;
            total?: undefined;
            stockDescontado?: undefined;
            mensaje?: undefined;
        };
    } | {
        success: boolean;
        message: string;
        data: {
            error: string;
            faltantes?: undefined;
            venta?: undefined;
            numeroTicket?: undefined;
            total?: undefined;
            stockDescontado?: undefined;
            mensaje?: undefined;
            details?: undefined;
        };
    }>;
    getVentas(filtros: any): Promise<{
        success: boolean;
        data: any;
        total: any;
        message: string;
        error?: undefined;
    } | {
        success: boolean;
        data: any[];
        total: number;
        message: string;
        error: any;
    }>;
    getProductos(filtros: any): Promise<{
        success: boolean;
        data: {
            id: any;
            codigo: any;
            codigo_barras: any;
            nombre: any;
            descripcion: string;
            categoria: any;
            subcategoria: string;
            marca: string;
            precio_venta: number;
            precio_mayorista: number;
            precio_especial: number;
            stock_actual: number;
            stock_minimo: number;
            impuesto: number;
            imagen_url: any;
        }[];
        message: string;
        error?: undefined;
    } | {
        success: boolean;
        message: string;
        data: any[];
        error: {
            tipo: string;
            mensaje: any;
            codigo: string;
            detalles: any;
            sugerencia: string;
        };
    }>;
    retiroEfectivo(retiroData: any): {
        success: boolean;
        data: {
            id: string;
            monto: any;
            concepto: any;
            fecha: string;
        };
        message: string;
    };
    getMetodosPago(): Promise<{
        success: boolean;
        data: {
            id: string;
            codigo: string;
            nombre: string;
            tipo: string;
            requiere_referencia: boolean;
            comision_porcentaje: number;
            activo: boolean;
        }[];
        message?: undefined;
    } | {
        success: boolean;
        message: string;
        data: any[];
    }>;
    getClientes(filtros: any): Promise<{
        success: boolean;
        data: any[];
        message: string;
    }>;
    private crearClientesEjemplo;
    crearClientesEjemploManual(): Promise<{
        success: boolean;
        message: string;
    }>;
    getReporteCaja(fechaInicio: string, fechaFin: string): {
        success: boolean;
        data: {
            periodo: {
                fechaInicio: string;
                fechaFin: string;
            };
            totalVentas: number;
            totalEfectivo: number;
            totalTarjeta: number;
            totalTransferencia: number;
            retiros: number;
            diferencia: number;
        };
    };
}
