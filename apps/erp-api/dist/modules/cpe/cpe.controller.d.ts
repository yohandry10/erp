import { CpeService } from './cpe.service';
import { CreateFacturaDto, FacturaDto, PaginationDto } from '@erp-suite/dtos';
import { Request, Response } from 'express';
export declare class CpeController {
    private readonly cpeService;
    constructor(cpeService: CpeService);
    create(createFacturaDto: CreateFacturaDto, req: Request): Promise<FacturaDto>;
    findAll(paginationDto: PaginationDto, req: Request): Promise<import("@erp-suite/dtos").PaginatedResponseDto<FacturaDto>>;
    getStats(req: Request): Promise<{
        success: boolean;
        data: {
            cpeEmitidosHoy: number;
            cpeDelMes: number;
            montoFacturado: number;
            rechazados: number;
        };
        error?: undefined;
    } | {
        success: boolean;
        data: {
            cpeEmitidosHoy: number;
            cpeDelMes: number;
            montoFacturado: number;
            rechazados: number;
        };
        error: any;
    }>;
    getComprobantes(filters: any, req: Request): Promise<{
        success: boolean;
        data: {
            id: any;
            tipoComprobante: string;
            serie: any;
            numero: any;
            fechaEmision: string;
            cliente: any;
            clienteRuc: any;
            total: number;
            moneda: any;
            estado: any;
            estadoSunat: any;
            observaciones: any;
            fechaCreacion: any;
        }[];
        message: string;
        error?: undefined;
    } | {
        success: boolean;
        data: any[];
        message: string;
        error: any;
    }>;
    getCpeData(id: string, req: Request): Promise<{
        success: boolean;
        data: any;
        message?: undefined;
        error?: undefined;
    } | {
        success: boolean;
        message: string;
        error: any;
        data?: undefined;
    }>;
    downloadPdf(id: string, req: Request, res: Response): Promise<void>;
    enviarSunat(id: string, req: Request): Promise<{
        success: boolean;
        message: string;
        data: {
            message: string;
        };
        error?: undefined;
    } | {
        success: boolean;
        message: string;
        error: any;
        data?: undefined;
    }>;
    findOne(id: string, req: Request): Promise<any>;
    downloadXml(id: string, req: Request, res: Response): Promise<void>;
    resend(id: string, req: Request): Promise<{
        message: string;
    }>;
    checkStatus(id: string, req: Request): Promise<{
        id: string;
        estado: import("@erp-suite/dtos").EstadoCPE;
        codigoSunat: string;
        descripcionSunat: string;
        timestamp: Date;
    }>;
    enviarManualmenteSunat(id: string, req: any): Promise<{
        success: boolean;
        message: string;
        data?: undefined;
    } | {
        success: boolean;
        message: string;
        data: {
            id: string;
            estado: string;
            timestamp: Date;
        };
    }>;
}
