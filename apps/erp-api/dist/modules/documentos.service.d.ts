import { SupabaseService } from '../shared/supabase/supabase.service';
export declare class DocumentosService {
    private readonly supabaseService;
    constructor(supabaseService: SupabaseService);
    getStats(tenantId?: string): Promise<{
        success: boolean;
        data: {
            totalDocumentos: number;
            facturas: number;
            boletas: number;
            notasCredito: number;
            contratos: number;
            pendientesEnvio: number;
        };
        error?: undefined;
    } | {
        success: boolean;
        data: {
            totalDocumentos: number;
            facturas: number;
            boletas: number;
            notasCredito: number;
            contratos: number;
            pendientesEnvio: number;
        };
        error: any;
    }>;
    private contarPorTipo;
    getDocumentos(filters: any, tenantId?: string): Promise<{
        success: boolean;
        data: any[];
        error?: undefined;
    } | {
        success: boolean;
        data: any[];
        error: any;
    }>;
    getDocumento(id: string, tenantId?: string): Promise<{
        success: boolean;
        data: any;
    }>;
    crearDocumento(documentoData: any, tenantId?: string, userId?: string): Promise<{
        success: boolean;
        data: any;
        message: string;
    }>;
    private crearDetallesDocumento;
    generarXML(id: string, tenantId?: string): Promise<{
        success: boolean;
        data: {
            xml_content: string;
            codigo_hash: string;
        };
        message: string;
    }>;
    enviarSUNAT(id: string, tenantId?: string, userId?: string): Promise<{
        success: boolean;
        data: {
            codigo_respuesta: string;
            mensaje: string;
            cdr: string;
        };
        message: string;
    }>;
    validarRUC(ruc: string): Promise<{
        success: boolean;
        data: {
            ruc: string;
            razon_social: string;
            estado: string;
            condicion: string;
            direccion: string;
            ubigeo: string;
        };
        message: string;
        error?: undefined;
    } | {
        success: boolean;
        data: any;
        error: any;
        message?: undefined;
    }>;
    validarDocumento(documentoData: any): Promise<{
        success: boolean;
        data: {
            valido: boolean;
            errores: any[];
        };
        message: string;
        error?: undefined;
    } | {
        success: boolean;
        data: {
            valido: boolean;
            errores: string[];
        };
        error: any;
        message?: undefined;
    }>;
    private getSerieDefault;
    private obtenerSiguienteNumero;
    private obtenerConfigEmpresa;
    private generarXMLFactura;
    private generarXMLBoleta;
    private generarXMLNotaCredito;
    private generarXMLNotaDebito;
    private generarHashXML;
    private simularEnvioSUNAT;
    private consultarRUCSUNAT;
    private registrarAuditoria;
    getSeries(tenantId?: string): Promise<{
        success: boolean;
        data: any[];
        error?: undefined;
    } | {
        success: boolean;
        data: any[];
        error: any;
    }>;
    crearSerie(serieData: any, tenantId?: string): Promise<{
        success: boolean;
        data: any;
        message: string;
        error?: undefined;
    } | {
        success: boolean;
        data: any;
        error: any;
        message?: undefined;
    }>;
    getAuditoria(documentoId: string, tenantId?: string): Promise<{
        success: boolean;
        data: any[];
        error?: undefined;
    } | {
        success: boolean;
        data: any[];
        error: any;
    }>;
    actualizarDocumento(id: string, documentoData: any, tenantId?: string, userId?: string): Promise<{
        success: boolean;
        data: {
            id: string;
        };
        message: string;
    }>;
    anularDocumento(id: string, motivo: string, tenantId?: string, userId?: string): Promise<{
        success: boolean;
        data: {
            id: string;
        };
        message: string;
    }>;
    generarPDF(id: string, tenantId?: string): Promise<{
        success: boolean;
        data: string;
        message: string;
    }>;
    descargarXML(id: string, tenantId?: string): Promise<{
        success: boolean;
        data: any;
        message: string;
    }>;
    private generarPDFContent;
}
