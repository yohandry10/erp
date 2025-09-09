import { DocumentosService } from './documentos.service';
import { Request } from 'express';
export declare class DocumentosController {
    private readonly documentosService;
    constructor(documentosService: DocumentosService);
    getStats(req: Request): Promise<{
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
    getDocumentos(filters: any, req: Request): Promise<{
        success: boolean;
        data: any[];
        error?: undefined;
    } | {
        success: boolean;
        data: any[];
        error: any;
    }>;
    getDocumento(id: string, req: Request): Promise<{
        success: boolean;
        data: any;
    } | {
        success: boolean;
        data: any;
        error: any;
    }>;
    crearDocumento(documentoData: any, req: Request): Promise<{
        success: boolean;
        data: any;
        message: string;
    } | {
        success: boolean;
        data: any;
        error: any;
    }>;
    actualizarDocumento(id: string, documentoData: any, req: Request): Promise<{
        success: boolean;
        data: {
            id: string;
        };
        message: string;
    } | {
        success: boolean;
        data: any;
        error: any;
    }>;
    generarXML(id: string, req: Request): Promise<{
        success: boolean;
        data: {
            xml_content: string;
            codigo_hash: string;
        };
        message: string;
    } | {
        success: boolean;
        data: any;
        error: any;
    }>;
    enviarSUNAT(id: string, req: Request): Promise<{
        success: boolean;
        data: {
            codigo_respuesta: string;
            mensaje: string;
            cdr: string;
        };
        message: string;
    } | {
        success: boolean;
        data: any;
        error: any;
    }>;
    descargarPDF(id: string, req: Request): Promise<{
        success: boolean;
        data: string;
        message: string;
    } | {
        success: boolean;
        data: any;
        error: any;
    }>;
    descargarXML(id: string, req: Request): Promise<{
        success: boolean;
        data: any;
        message: string;
    } | {
        success: boolean;
        data: any;
        error: any;
    }>;
    validarRUC(data: {
        ruc: string;
    }, req: Request): Promise<{
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
    validarDocumento(documentoData: any, req: Request): Promise<{
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
    getSeries(req: Request): Promise<{
        success: boolean;
        data: any[];
        error?: undefined;
    } | {
        success: boolean;
        data: any[];
        error: any;
    }>;
    crearSerie(serieData: any, req: Request): Promise<{
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
    getAuditoria(id: string, req: Request): Promise<{
        success: boolean;
        data: any[];
        error?: undefined;
    } | {
        success: boolean;
        data: any[];
        error: any;
    }>;
    anularDocumento(id: string, data: {
        motivo: string;
    }, req: Request): Promise<{
        success: boolean;
        data: {
            id: string;
        };
        message: string;
    } | {
        success: boolean;
        data: any;
        error: any;
    }>;
}
