import { SupabaseService } from '../supabase/supabase.service';
import { FiltrosContables } from './accounting.interfaces';
export declare class AccountingReportsService {
    private readonly supabase;
    constructor(supabase: SupabaseService);
    getRegistroVentas(filtros?: FiltrosContables): Promise<{
        fecha: any;
        tipoDocumento: any;
        numeroDocumento: any;
        clienteNombre: any;
        clienteDocumento: any;
        baseImponible: any;
        igv: any;
        total: any;
        moneda: any;
    }[]>;
    getRegistroCompras(filtros?: FiltrosContables): Promise<{
        fecha: any;
        tipoDocumento: any;
        numeroDocumento: any;
        proveedorNombre: any;
        proveedorDocumento: any;
        baseImponible: any;
        igv: any;
        total: any;
        moneda: any;
    }[]>;
    getRegistroActivosFijos(filtros?: FiltrosContables): Promise<{
        codigo: any;
        descripcion: any;
        fechaAdquisicion: any;
        valorAdquisicion: any;
        depreciacionAcumulada: any;
        valorNeto: number;
        vidaUtil: any;
        estado: any;
    }[]>;
    getLibroPlanillas(filtros?: FiltrosContables): Promise<any[]>;
    getRegistroCostos(filtros?: FiltrosContables): Promise<{
        tipo: string;
        totalCosto: number;
        movimientos: any[];
    }[]>;
    getLibrosElectronicosSunat(filtros?: FiltrosContables): Promise<{
        registroVentas: {
            periodo: string;
            totalRegistros: number;
            totalVentas: any;
            datos: {
                fecha: any;
                tipoDocumento: any;
                numeroDocumento: any;
                clienteNombre: any;
                clienteDocumento: any;
                baseImponible: any;
                igv: any;
                total: any;
                moneda: any;
            }[];
        };
        registroCompras: {
            periodo: string;
            totalRegistros: number;
            totalCompras: any;
            datos: {
                fecha: any;
                tipoDocumento: any;
                numeroDocumento: any;
                proveedorNombre: any;
                proveedorDocumento: any;
                baseImponible: any;
                igv: any;
                total: any;
                moneda: any;
            }[];
        };
        libroDiario: {
            periodo: string;
            totalAsientos: number;
            datos: {
                periodo: string;
                numeroCorrelativo: string;
                fechaOperacion: any;
                glosa: any;
                referencia: any;
                detalles: any;
            }[];
        };
        libroMayor: {
            periodo: string;
            totalCuentas: number;
            datos: any[];
        };
    }>;
    private getLibroDiarioSunat;
    private getLibroMayorSunat;
    private getAsientosParaSunat;
    private getMovimientosParaSunat;
    private clasificarTipoCosto;
    private formatearPeriodo;
    private extraerPeriodo;
}
