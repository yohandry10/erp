import { AccountingBooksService } from '../shared/integration/accounting-books.service';
import { SupabaseService } from '../shared/supabase/supabase.service';
export declare class ContabilidadController {
    private readonly accountingService;
    private readonly supabaseService;
    constructor(accountingService: AccountingBooksService, supabaseService: SupabaseService);
    getEstadoResultados(periodo: any): {
        success: boolean;
        data: {
            ingresos: {
                ventasNetas: number;
                otrosIngresos: number;
                totalIngresos: number;
            };
            costos: {
                costoVentas: number;
                utilidadBruta: number;
            };
            gastos: {
                gastosOperativos: number;
                gastosAdministrativos: number;
                gastosVentas: number;
                gastosFinancieros: number;
                totalGastos: number;
            };
            resultado: {
                utilidadOperativa: number;
                utilidadAntesImpuestos: number;
                impuestos: number;
                utilidadNeta: number;
            };
        };
    };
    getBalanceGeneral(): {
        success: boolean;
        data: {
            activos: {
                corrientes: {
                    efectivo: number;
                    cuentasPorCobrar: number;
                    inventarios: number;
                    otrosActivos: number;
                    totalCorrientes: number;
                };
                fijos: {
                    equipos: number;
                    muebles: number;
                    depreciacion: number;
                    totalFijos: number;
                };
                totalActivos: number;
            };
            pasivos: {
                corrientes: {
                    cuentasPorPagar: number;
                    prestamosCortoplazo: number;
                    otrosPasivos: number;
                    totalCorrientes: number;
                };
                largoplazo: {
                    prestamosLargoplazo: number;
                    totalLargoplazo: number;
                };
                totalPasivos: number;
            };
            patrimonio: {
                capital: number;
                utilidadesRetenidas: number;
                totalPatrimonio: number;
            };
        };
    };
    getFlujoEfectivo(periodo: any): {
        success: boolean;
        data: {
            operacion: {
                utilidadNeta: number;
                depreciacion: number;
                cambiosCapitalTrabajo: number;
                flujoOperacion: number;
            };
            inversion: {
                compraActivos: number;
                ventaActivos: number;
                flujoInversion: number;
            };
            financiamiento: {
                prestamosRecibidos: number;
                pagosPrestamos: number;
                aportesSocios: number;
                dividendos: number;
                flujoFinanciamiento: number;
            };
            resumen: {
                flujoNetoEfectivo: number;
                efectivoInicial: number;
                efectivoFinal: number;
            };
        };
    };
    getPlanCuentas(): Promise<{
        success: boolean;
        data: any[];
        message?: undefined;
    } | {
        success: boolean;
        message: string;
        data: any[];
    }>;
    getRatiosFinancieros(): {
        success: boolean;
        data: {
            liquidez: {
                ratioLiquidez: number;
                pruebaAcida: number;
                capitalTrabajo: number;
            };
            rentabilidad: {
                margenBruto: number;
                margenOperativo: number;
                margenNeto: number;
                roa: number;
                roe: number;
            };
            endeudamiento: {
                ratioDeuda: number;
                ratioCobertura: number;
                apalancamiento: number;
            };
            eficiencia: {
                rotacionActivos: number;
                rotacionInventario: number;
                rotacionCuentasCobrar: number;
            };
        };
    };
    crearAsientoContable(asientoData: any): {
        success: boolean;
        data: {
            id: string;
            numeroAsiento: string;
            fecha: string;
            concepto: any;
            totalDebe: any;
            totalHaber: any;
            estado: string;
        };
        message: string;
    };
    getAsientosContables(filtros: any): Promise<{
        success: boolean;
        data: any[];
        message?: undefined;
    } | {
        success: boolean;
        message: string;
        data: any[];
    }>;
    getLibroMayor(cuentaCodigo: string, filtros: any): Promise<{
        success: boolean;
        data: any[];
        message?: undefined;
    } | {
        success: boolean;
        message: string;
        data: any;
    }>;
    getLibroMayorCompleto(filtros: any): Promise<{
        success: boolean;
        data: any[];
        message?: undefined;
    } | {
        success: boolean;
        message: string;
        data: any[];
    }>;
    getBalanceComprobacion(filtros: any): Promise<{
        success: boolean;
        data: any[];
        message?: undefined;
    } | {
        success: boolean;
        message: string;
        data: any;
    }>;
    getKardexValorizado(filtros: any): Promise<{
        success: boolean;
        data: any[];
        message?: undefined;
    } | {
        success: boolean;
        message: string;
        data: any;
    }>;
    realizarCierreContable(cierreData: any): {
        success: boolean;
        data: {
            periodo: any;
            fechaCierre: string;
            estado: string;
        };
        message: string;
    };
    getLibroCajaBancos(filtros: any): Promise<{
        success: boolean;
        data: any[];
        message?: undefined;
    } | {
        success: boolean;
        message: string;
        data: any;
    }>;
    getRegistroActivosFijos(filtros: any): Promise<{
        success: boolean;
        data: any[];
        message?: undefined;
    } | {
        success: boolean;
        message: string;
        data: any;
    }>;
    getLibroPlanillas(filtros: any): Promise<{
        success: boolean;
        data: any[];
        message?: undefined;
    } | {
        success: boolean;
        message: string;
        data: any;
    }>;
    getLibroInventariosBalances(filtros: any): Promise<{
        success: boolean;
        data: any[];
        message?: undefined;
    } | {
        success: boolean;
        message: string;
        data: any;
    }>;
    getRegistroCostos(filtros: any): Promise<{
        success: boolean;
        data: any[];
        message?: undefined;
    } | {
        success: boolean;
        message: string;
        data: any;
    }>;
    getLibrosElectronicosSunat(filtros: any): Promise<{
        success: boolean;
        data: any[];
        message?: undefined;
    } | {
        success: boolean;
        message: string;
        data: any;
    }>;
    getLibroDiario(filtros: any): Promise<{
        success: boolean;
        data: {
            periodo: string;
            totalAsientos: number;
            totalDebe: number;
            totalHaber: number;
            asientos: {
                numeroAsiento: any;
                fecha: any;
                concepto: any;
                referencia: any;
                detalles: any;
                totalDebe: number;
                totalHaber: number;
                estado: any;
            }[];
            fuentes: {
                contabilidad: number;
                rrhh: number;
            };
        };
        message?: undefined;
    } | {
        success: boolean;
        message: string;
        data: any;
    }>;
    getRegistroVentas(filtros: any): Promise<{
        success: boolean;
        data: any[];
        message?: undefined;
    } | {
        success: boolean;
        message: string;
        data: any;
    }>;
    getRegistroCompras(filtros: any): Promise<{
        success: boolean;
        data: any[];
        message?: undefined;
    } | {
        success: boolean;
        message: string;
        data: any;
    }>;
    getRegistroConsignaciones(fechaDesde?: string, fechaHasta?: string, estado?: string): Promise<{
        success: boolean;
        data: any[];
        message: string;
    }>;
    createConsignacion(consignacionData: any): Promise<{
        success: boolean;
        data: any;
        message: string;
    }>;
    updateEstadoConsignacion(id: string, nuevoEstado: string): Promise<{
        success: boolean;
        data: any;
        message: string;
    }>;
}
