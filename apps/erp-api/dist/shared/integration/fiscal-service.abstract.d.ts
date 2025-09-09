import { Logger } from '@nestjs/common';
import { FiscalConfig, FiscalResponse, DocumentoElectronico, ValidacionDocumento, ConsultaEstado, LibroContableFiscal } from './fiscal.interfaces';
export declare abstract class FiscalServiceAbstract {
    protected readonly logger: Logger;
    protected config: FiscalConfig;
    constructor(config: FiscalConfig);
    abstract enviarDocumento(documento: DocumentoElectronico): Promise<FiscalResponse>;
    abstract consultarEstado(consulta: ConsultaEstado): Promise<FiscalResponse>;
    abstract validarDocumento(documento: DocumentoElectronico): Promise<ValidacionDocumento>;
    abstract generarXML(documento: DocumentoElectronico): Promise<string>;
    abstract firmarXML(xmlContent: string): Promise<string>;
    abstract enviarLibroContable(libro: LibroContableFiscal): Promise<FiscalResponse>;
    getConfiguracion(): Partial<FiscalConfig>;
    verificarConfiguracion(): Promise<{
        valid: boolean;
        errors: string[];
    }>;
    protected logOperation(operation: string, details: any): void;
    protected logError(operation: string, error: any): void;
    protected logSuccess(operation: string, details: any): void;
}
