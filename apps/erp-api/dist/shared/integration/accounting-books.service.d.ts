import { SupabaseService } from '../supabase/supabase.service';
import { FiltrosContables } from './accounting.interfaces';
export declare class AccountingBooksService {
    private readonly supabase;
    constructor(supabase: SupabaseService);
    getPlanCuentas(): Promise<any[]>;
    getAsientosContables(filtros?: FiltrosContables): Promise<any[]>;
    getLibroMayorPorCuenta(cuentaCodigo: string, filtros?: FiltrosContables): Promise<any[]>;
    getLibroMayorCompleto(filtros?: FiltrosContables): Promise<any[]>;
    getLibroDiario(filtros?: FiltrosContables): Promise<any[]>;
    getBalanceComprobacion(filtros?: FiltrosContables): Promise<any[]>;
    getKardexValorizado(filtros?: any): Promise<any[]>;
    getLibroCajaBancos(filtros?: FiltrosContables): Promise<any[]>;
    getLibroInventariosBalances(filtros?: FiltrosContables): Promise<any[]>;
    getRegistroActivosFijos(filtros?: FiltrosContables): Promise<any[]>;
    getLibroPlanillas(filtros?: FiltrosContables): Promise<any[]>;
    getRegistroCostos(filtros?: FiltrosContables): Promise<any[]>;
    getLibrosElectronicosSunat(filtros?: FiltrosContables): Promise<any[]>;
    getRegistroVentas(filtros?: FiltrosContables): Promise<any[]>;
    getRegistroCompras(filtros?: FiltrosContables): Promise<any[]>;
    getRegistroConsignaciones(filtros?: FiltrosContables): Promise<any[]>;
    createConsignacion(consignacionData: any): Promise<any>;
    updateEstadoConsignacion(id: string, nuevoEstado: string): Promise<any>;
}
