import { Request } from 'express';
import { SireService } from './sire.service';
import { EventBusService } from '../../shared/events/event-bus.service';
export declare class SireController {
    private readonly sireService;
    private readonly eventBus;
    constructor(sireService: SireService, eventBus: EventBusService);
    getStats(req: Request): Promise<{
        success: boolean;
        data: {
            reportesDelMes: number;
            registrosTotales: any;
            enviadosASunat: number;
            pendientes: number;
        };
        error?: undefined;
    } | {
        success: boolean;
        data: {
            reportesDelMes: number;
            registrosTotales: number;
            enviadosASunat: number;
            pendientes: number;
        };
        error: any;
    }>;
    getReportes(filters: any, req: Request): Promise<{
        success: boolean;
        data: any[];
        error?: undefined;
    } | {
        success: boolean;
        data: any[];
        error: any;
    }>;
    generarReporte(reportData: any, req: Request): Promise<{
        success: boolean;
        data: any;
        message: string;
    } | {
        success: boolean;
        message: string;
        error: any;
    }>;
    downloadReporte(id: string, req: Request): Promise<{
        success: boolean;
        data: string;
        message: string;
    } | {
        success: boolean;
        message: string;
        error: any;
    }>;
    enviarSunat(id: string, req: Request): Promise<{
        success: boolean;
        message: string;
    } | {
        success: boolean;
        message: string;
        error: any;
    }>;
    testEvento(testData: any): Promise<{
        success: boolean;
        message: string;
        data: {
            id: string;
            numero_comprobante: string;
            tipo_comprobante: string;
            fecha_emision: string;
            total: number;
            serie: string;
            numero: number;
        };
        error?: undefined;
    } | {
        success: boolean;
        error: any;
        message?: undefined;
        data?: undefined;
    }>;
    testIntegracionPOS(testData: any): Promise<{
        success: boolean;
        message: string;
        data: {
            cpeId: string;
            tipoDocumento: string;
            serie: string;
            numero: string;
            clienteId: string;
            total: number;
            esCredito: boolean;
            ventaId: string;
        };
        error?: undefined;
    } | {
        success: boolean;
        error: any;
        message: string;
        data?: undefined;
    }>;
    findAll(): {
        success: boolean;
        message: string;
        data: any[];
    };
}
