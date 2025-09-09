import { SupabaseService } from '../../shared/supabase/supabase.service';
import { CreateGuiaRemisionDto, GuiaRemisionResponseDto } from './gre.types';
import { EventBusService } from '../../shared/events/event-bus.service';
import { InventoryIntegrationService } from '../../shared/integration/inventory-integration.service';
import { OseService } from '../ose/ose.service';
export declare class GreService {
    private readonly supabaseService;
    private readonly eventBus;
    private readonly inventoryService;
    private readonly oseService;
    constructor(supabaseService: SupabaseService, eventBus: EventBusService, inventoryService: InventoryIntegrationService, oseService: OseService);
    private initializeEventListeners;
    evaluarCreacionAutomaticaGRE(datos: any): Promise<void>;
    private verificarConfiguracionClienteTransporte;
    private calcularPesoEstimado;
    findAll(): {
        message: string;
        data: any[];
    };
    findAllGuias(): Promise<GuiaRemisionResponseDto[]>;
    findGuiaById(id: string): Promise<GuiaRemisionResponseDto>;
    createGuia(greData: CreateGuiaRemisionDto): Promise<GuiaRemisionResponseDto>;
    private generateGreXmlUbl;
    private getMotivoCode;
    private getModalidadCode;
    private procesarGeneracionXML;
    private firmarXmlGre;
    private generarHashXml;
    private procesarEnvioSunat;
    reenviarGre(greId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    enviarManualmenteSunat(greId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    consultarEstadoGre(greId: string): Promise<any>;
    private generarNumeroCorrelativo;
    getStats(): Promise<{
        total: number;
        estados: {};
        pesoTotal: any;
        tendencia: any[];
    }>;
    private calcularTendenciaSemanal;
}
