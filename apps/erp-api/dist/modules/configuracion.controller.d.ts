import { SupabaseService } from '../shared/supabase/supabase.service';
import { OseService } from './ose/ose.service';
export declare class ConfiguracionController {
    private readonly supabaseService;
    private readonly oseService;
    constructor(supabaseService: SupabaseService, oseService: OseService);
    getConfiguraciones(): Promise<{
        success: boolean;
        data: {
            configuraciones: string[];
        };
    }>;
    getConfiguracionOse(): Promise<{
        success: boolean;
        data: {
            configuracion: {
                environment: "produccion" | "homologacion";
                url: string;
                ruc: string;
                certificateExists: boolean;
                usuario: string;
                password: string;
            };
            verificacion: {
                valid: boolean;
                errors: string[];
            };
            message: string;
        };
        message?: undefined;
    } | {
        success: boolean;
        message: string;
        data: any;
    }>;
    verificarConectividadSunat(): Promise<{
        success: boolean;
        message: string;
        data: {
            errors: string[];
            recomendaciones: string[];
            conectividad?: undefined;
            configuracion?: undefined;
            error?: undefined;
        };
    } | {
        success: boolean;
        message: string;
        data: {
            conectividad: {
                url: string;
                status: string;
                responseTime: string;
                certificateValid: boolean;
                timestamp: Date;
            };
            configuracion: {
                environment: "produccion" | "homologacion";
                url: string;
                ruc: string;
                certificateExists: boolean;
                usuario: string;
                password: string;
            };
            errors?: undefined;
            recomendaciones?: undefined;
            error?: undefined;
        };
    } | {
        success: boolean;
        message: string;
        data: {
            error: any;
            recomendaciones: string[];
            errors?: undefined;
            conectividad?: undefined;
            configuracion?: undefined;
        };
    }>;
    getDatosEmpresa(): Promise<{
        success: boolean;
        data: {
            ruc: string;
            razonSocial: string;
            nombreComercial: string;
            direccion: string;
            telefono: string;
            email: string;
            representanteLegal: string;
            regimen: string;
            actividadEconomica: string;
            ubigeo: string;
        };
    }>;
    updateDatosEmpresa(datosEmpresa: any): Promise<{
        success: boolean;
        message: string;
        data: any;
    }>;
    getConfiguracionSeries(): Promise<{
        success: boolean;
        data: {
            series: {
                tipo: string;
                serie: string;
                numeroActual: number;
                estado: string;
            }[];
        };
    }>;
    updateSerie(tipo: string, serieData: any): Promise<{
        success: boolean;
        message: string;
        data: any;
    }>;
    getParametrosFacturacion(): Promise<{
        success: boolean;
        data: {
            parametros: {
                igv: number;
                monedaDefecto: string;
                redondeoDecimales: number;
                incluirIgvEnPrecio: boolean;
                envioAutomaticoSunat: boolean;
                generarPdfAutomatico: boolean;
                enviarEmailCliente: boolean;
                validarRucSunat: boolean;
                usarCodigosBarra: boolean;
                formatoNumeros: string;
            };
        };
    }>;
    updateParametrosFacturacion(parametros: any): Promise<{
        success: boolean;
        message: string;
        data: any;
    }>;
    uploadCertificado(certificadoData: any): Promise<{
        success: boolean;
        message: string;
        data: {
            filename: any;
            uploadDate: Date;
            status: string;
            validUntil: string;
        };
    }>;
    testIntegracionCompleta(): Promise<{
        success: boolean;
        message: string;
        data: {
            resultados: {
                configuracionOSE: {
                    valid: boolean;
                    errors: string[];
                };
                certificadoDigital: {
                    presente: boolean;
                    valido: boolean;
                    vencimiento: string;
                };
                conectividadSUNAT: {
                    conectado: boolean;
                    responseTime: string;
                };
                modulesCPE: {
                    disponible: boolean;
                    generacionXML: boolean;
                    firmaDigital: boolean;
                };
                modulesGRE: {
                    disponible: boolean;
                    generacionXML: boolean;
                    firmaDigital: boolean;
                };
                baseDatos: {
                    tablasCPE: boolean;
                    tablasGRE: boolean;
                    conexion: boolean;
                };
            };
            resumen: {
                modulosActivos: string[];
                estadoGeneral: string;
                timestamp: Date;
            };
            recomendaciones: string[];
        };
    }>;
    testFirmaXmlGet(): Promise<{
        success: boolean;
        mensaje: string;
        detalles: {
            xmlOriginalLength: number;
            xmlFirmadoLength: number;
            contieneSignature: boolean;
            contieneCertificado: boolean;
            certificadoInfo: {
                environment: "produccion" | "homologacion";
                url: string;
                ruc: string;
                certificateExists: boolean;
                usuario: string;
                password: string;
            };
            modoDemo: boolean;
            endpoint: string;
            timestamp: string;
            error?: undefined;
        };
        xmlFirmadoPreview: string;
        instrucciones: string[];
        solucionSugerida?: undefined;
    } | {
        success: boolean;
        mensaje: string;
        detalles: {
            endpoint: string;
            timestamp: string;
            error: any;
            xmlOriginalLength?: undefined;
            xmlFirmadoLength?: undefined;
            contieneSignature?: undefined;
            contieneCertificado?: undefined;
            certificadoInfo?: undefined;
            modoDemo?: undefined;
        };
        solucionSugerida: string[];
        xmlFirmadoPreview?: undefined;
        instrucciones?: undefined;
    }>;
    testFirmaXml(body: {
        xmlContent?: string;
    }): Promise<{
        success: boolean;
        mensaje: string;
        detalles: {
            xmlOriginalLength: number;
            xmlFirmadoLength: number;
            contieneSignature: boolean;
            certificadoInfo: {
                environment: "produccion" | "homologacion";
                url: string;
                ruc: string;
                certificateExists: boolean;
                usuario: string;
                password: string;
            };
            modoSandbox: boolean;
            timestamp: Date;
        };
        xmlFirmadoPreview: string;
        timestamp?: undefined;
    } | {
        success: boolean;
        mensaje: string;
        timestamp: Date;
        detalles?: undefined;
        xmlFirmadoPreview?: undefined;
    }>;
}
