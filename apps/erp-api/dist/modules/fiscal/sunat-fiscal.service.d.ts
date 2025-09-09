import { ConfigService } from '@nestjs/config';
import { FiscalServiceAbstract } from '../../shared/integration/fiscal-service.abstract';
import { FiscalResponse, DocumentoElectronico, ValidacionDocumento, ConsultaEstado, LibroContableFiscal } from '../../shared/integration/fiscal.interfaces';
export declare class SunatFiscalService extends FiscalServiceAbstract {
    private readonly configService;
    private xmlSigner;
    constructor(configService: ConfigService);
    private initializeXmlSigner;
    enviarDocumento(documento: DocumentoElectronico): Promise<FiscalResponse>;
    consultarEstado(consulta: ConsultaEstado): Promise<FiscalResponse>;
    validarDocumento(documento: DocumentoElectronico): Promise<ValidacionDocumento>;
    generarXML(documento: DocumentoElectronico): Promise<string>;
    firmarXML(xmlContent: string): Promise<string>;
    enviarLibroContable(libro: LibroContableFiscal): Promise<FiscalResponse>;
    private compressXml;
    private sendToSunat;
    private queryStatusInSunat;
    private buildSunatXML;
}
