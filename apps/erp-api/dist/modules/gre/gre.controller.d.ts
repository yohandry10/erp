import { GreService } from './gre.service';
import { CreateGuiaRemisionDto, GuiaRemisionResponseDto } from './gre.types';
export declare class GreController {
    private readonly greService;
    constructor(greService: GreService);
    findAll(): {
        message: string;
        data: any[];
    };
    findAllGuias(filters: any): Promise<{
        success: boolean;
        data: GuiaRemisionResponseDto[];
        message: string;
    } | {
        success: boolean;
        data: any[];
        message: any;
    }>;
    findGuiaById(id: string): Promise<{
        success: boolean;
        message: string;
        data: GuiaRemisionResponseDto;
        error?: undefined;
    } | {
        success: boolean;
        message: any;
        error: any;
        data?: undefined;
    }>;
    createGuia(greData: CreateGuiaRemisionDto): Promise<{
        success: boolean;
        message: string;
        data: GuiaRemisionResponseDto;
        error?: undefined;
    } | {
        success: boolean;
        message: any;
        error: any;
        data?: undefined;
    }>;
    generateReport(): {
        success: boolean;
        data: any;
        message: string;
    };
    getStats(): Promise<{
        success: boolean;
        data: {
            total: number;
            estados: {};
            pesoTotal: any;
            tendencia: any[];
        };
    } | {
        success: boolean;
        data: {
            greEmitidas: number;
            totalGre: number;
            enTransito: number;
            completados: number;
        };
    }>;
    reenviarGre(id: string): Promise<{
        success: boolean;
        message: string;
        data: {
            id: string;
            timestamp: Date;
        };
        error?: undefined;
    } | {
        success: boolean;
        message: string;
        error: any;
        data?: undefined;
    }>;
    consultarEstadoSunat(id: string): Promise<{
        success: boolean;
        message: string;
        data: any;
        error?: undefined;
    } | {
        success: boolean;
        message: string;
        error: any;
        data?: undefined;
    }>;
    obtenerXmlFirmado(id: string, res: any): Promise<any>;
    enviarManualmenteSunat(id: string): Promise<{
        success: boolean;
        message: string;
        data?: undefined;
    } | {
        success: boolean;
        message: string;
        data: {
            id: string;
            timestamp: Date;
        };
    }>;
}
