import { SupabaseService } from '../../shared/supabase/supabase.service';
import { CreateFacturaDto, FacturaDto, PaginationDto, PaginatedResponseDto } from '@erp-suite/dtos';
import { ConfigService } from '@nestjs/config';
import { EventBusService } from '../../shared/events/event-bus.service';
import { OseService } from '../ose/ose.service';
export declare class CpeService {
    private readonly supabaseService;
    private readonly configService;
    private readonly eventBus;
    private readonly oseService;
    private xmlSigner;
    constructor(supabaseService: SupabaseService, configService: ConfigService, eventBus: EventBusService, oseService: OseService);
    create(createFacturaDto: CreateFacturaDto, tenantId: string): Promise<FacturaDto>;
    findAll(paginationDto: PaginationDto, tenantId: string): Promise<PaginatedResponseDto<FacturaDto>>;
    findOne(id: string, tenantId: string): Promise<FacturaDto>;
    getCpeById(id: string, tenantId: string): Promise<any>;
    generatePdf(id: string, tenantId: string): Promise<Buffer>;
    getSignedXml(id: string, tenantId: string): Promise<string>;
    resendToOse(id: string, tenantId: string): Promise<{
        message: string;
    }>;
    sendToOseManual(id: string, xmlFirmado: string, fileName: string): Promise<void>;
    checkOseStatus(id: string, tenantId: string): Promise<{
        id: string;
        estado: import("@erp-suite/dtos").EstadoCPE;
        codigoSunat: string;
        descripcionSunat: string;
        timestamp: Date;
    }>;
    private prepareXmlForSunat;
    private sendToOse;
    private generateXmlContent;
    private generateSimplePdfContent;
    private generateSimplePdfContentFromData;
    private evaluarSiRequiereTransporte;
    private mapToDto;
    getComprobantesFromDatabase(filters?: any, tenantId?: string): Promise<{
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
    private getTipoComprobanteText;
    getStatsFromDatabase(tenantId?: string): Promise<{
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
}
