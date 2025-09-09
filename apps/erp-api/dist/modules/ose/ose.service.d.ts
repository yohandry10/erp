import { ConfigService } from '@nestjs/config';
export interface OseConfig {
    url: string;
    usuario: string;
    password: string;
    ruc: string;
    certificatePath: string;
    certificatePassword: string;
    environment: 'homologacion' | 'produccion';
}
export interface SunatResponse {
    success: boolean;
    codigoRespuesta: string;
    descripcionRespuesta: string;
    cdr?: string;
    observaciones?: string[];
    numeroComprobante?: string;
    hashCPE?: string;
}
export declare class OseService {
    private readonly configService;
    private readonly logger;
    private xmlSigner;
    private oseConfig;
    constructor(configService: ConfigService);
    private initializeOseConfig;
    private initializeXmlSigner;
    enviarCpe(xmlUnsigned: string, fileName: string): Promise<SunatResponse>;
    enviarGre(xmlUnsigned: string, fileName: string): Promise<SunatResponse>;
    consultarEstadoCpe(ruc: string, tipoDocumento: string, serie: string, numero: string): Promise<SunatResponse>;
    private compressXml;
    private sendToSunat;
    private sendGreToSunat;
    private buildSunatRequest;
    private parseSunatResponse;
    private queryStatusInSunat;
    verificarConfiguracion(): Promise<{
        valid: boolean;
        errors: string[];
    }>;
    getConfiguracion(): {
        environment: "produccion" | "homologacion";
        url: string;
        ruc: string;
        certificateExists: boolean;
        usuario: string;
        password: string;
    };
    signXmlOnly(xmlContent: string): Promise<string>;
}
