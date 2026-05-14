import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FiscalServiceAbstract } from '../../shared/integration/fiscal-service.abstract';
import { 
  FiscalConfig, 
  FiscalResponse, 
  DocumentoElectronico, 
  ValidacionDocumento,
  ConsultaEstado,
  LibroContableFiscal 
} from '../../shared/integration/fiscal.interfaces';
import { XmlSigner } from '@erp-suite/crypto';
import * as https from 'https';

@Injectable()
export class SunatFiscalService extends FiscalServiceAbstract {
  private xmlSigner: XmlSigner;

  constructor(private readonly configService: ConfigService) {
    const config: FiscalConfig = {
      url: configService.get('OSE_URL') || 'https://api-cpe-beta.sunat.gob.pe',
      usuario: configService.get('OSE_USUARIO') || '',
      password: configService.get('OSE_PASSWORD') || '',
      empresaId: configService.get('EMPRESA_RUC') || '',
      certificatePath: configService.get('CERTIFICATE_PATH') || '/certificates/certificado.pfx',
      certificatePassword: configService.get('CERTIFICATE_PASSWORD') || '',
      environment: configService.get('SUNAT_ENVIRONMENT') === 'produccion' ? 'produccion' : 'homologacion',
      pais: 'PE'
    };
    
    super(config);
    this.initializeXmlSigner();
  }

  private initializeXmlSigner(): void {
    const requireRealCertificate = this.config.environment === 'produccion'
      || this.configService.get<string | boolean>('REQUIRE_REAL_FISCAL_CERTIFICATE') === true
      || this.configService.get<string | boolean>('REQUIRE_REAL_FISCAL_CERTIFICATE') === 'true';

    this.xmlSigner = new XmlSigner({
      pfxPath: this.config.certificatePath,
      pfxPassword: this.config.certificatePassword,
      allowDemoFallback: !requireRealCertificate,
    });
  }

  async enviarDocumento(documento: DocumentoElectronico): Promise<FiscalResponse> {
    try {
      this.logOperation('Enviando documento a SUNAT', { 
        tipo: documento.tipoDocumento, 
        numero: `${documento.serie}-${documento.numero}` 
      });

      // 1. Generar XML
      const xmlUnsigned = await this.generarXML(documento);
      
      // 2. Firmar XML
      const xmlSigned = await this.firmarXML(xmlUnsigned);
      
      // 3. Comprimir y enviar
      const fileName = `${documento.emisor.numeroDocumento}-${documento.tipoDocumento}-${documento.serie}-${documento.numero}`;
      const zipBuffer = await this.compressXml(xmlSigned, fileName);
      const response = await this.sendToSunat(zipBuffer, fileName);

      if (response.success) {
        this.logSuccess('Documento enviado a SUNAT', { fileName });
      } else {
        this.logError('Error enviando documento', response.descripcionRespuesta);
      }

      return response;
    } catch (error) {
      this.logError('enviarDocumento', error);
      return {
        success: false,
        codigoRespuesta: '99',
        descripcionRespuesta: `Error técnico: ${error.message}`
      };
    }
  }

  async consultarEstado(consulta: ConsultaEstado): Promise<FiscalResponse> {
    try {
      this.logOperation('Consultando estado en SUNAT', consulta);
      
      const response = await this.queryStatusInSunat(
        consulta.empresaId,
        consulta.tipoDocumento,
        consulta.serie,
        consulta.numero
      );
      
      return response;
    } catch (error) {
      this.logError('consultarEstado', error);
      return {
        success: false,
        codigoRespuesta: '99',
        descripcionRespuesta: `Error consultando estado: ${error.message}`
      };
    }
  }

  async validarDocumento(documento: DocumentoElectronico): Promise<ValidacionDocumento> {
    const errores: string[] = [];
    const advertencias: string[] = [];

    // Validaciones específicas de SUNAT
    if (!documento.emisor.numeroDocumento || documento.emisor.numeroDocumento.length !== 11) {
      errores.push('RUC del emisor debe tener 11 dígitos');
    }

    if (documento.tipoDocumento === '01' && documento.importeTotal < 700) {
      advertencias.push('Factura con monto menor a S/ 700.00');
    }

    if (documento.moneda !== 'PEN' && documento.moneda !== 'USD') {
      errores.push('Moneda debe ser PEN o USD');
    }

    return {
      valido: errores.length === 0,
      errores,
      advertencias,
      numeroDocumento: `${documento.serie}-${documento.numero}`,
      tipoDocumento: documento.tipoDocumento
    };
  }

  async generarXML(documento: DocumentoElectronico): Promise<string> {
    // Implementación específica para generar XML según estándares UBL de SUNAT
    return this.buildSunatXML(documento);
  }

  async firmarXML(xmlContent: string): Promise<string> {
    return this.xmlSigner.signXml(xmlContent);
  }

  async enviarLibroContable(libro: LibroContableFiscal): Promise<FiscalResponse> {
    try {
      this.logOperation('Enviando libro contable a SUNAT', { 
        periodo: libro.periodo, 
        tipo: libro.tipoLibro 
      });

      // Implementación específica para libros contables SUNAT
      // Por ahora retornamos éxito simulado
      return {
        success: true,
        codigoRespuesta: '0',
        descripcionRespuesta: 'Libro contable enviado exitosamente'
      };
    } catch (error) {
      this.logError('enviarLibroContable', error);
      return {
        success: false,
        codigoRespuesta: '99',
        descripcionRespuesta: `Error enviando libro: ${error.message}`
      };
    }
  }

  // Métodos privados específicos de SUNAT
  private async compressXml(xmlContent: string, fileName: string): Promise<Buffer> {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip();
    zip.addFile(`${fileName}.xml`, Buffer.from(xmlContent, 'utf8'));
    return zip.toBuffer();
  }

  private async sendToSunat(zipBuffer: Buffer, fileName: string): Promise<FiscalResponse> {
    // Implementación del envío SOAP a SUNAT (reutilizar lógica existente)
    return new Promise((resolve) => {
      // Simulación por ahora
      resolve({
        success: true,
        codigoRespuesta: '0',
        descripcionRespuesta: 'Aceptado por SUNAT'
      });
    });
  }

  private async queryStatusInSunat(ruc: string, tipoDocumento: string, serie: string, numero: string): Promise<FiscalResponse> {
    // Implementación de consulta de estado (reutilizar lógica existente)
    return {
      success: true,
      codigoRespuesta: '0',
      descripcionRespuesta: 'Documento encontrado'
    };
  }

  private buildSunatXML(documento: DocumentoElectronico): string {
    // Implementación específica para XML de SUNAT
    return `<?xml version="1.0" encoding="UTF-8"?>
<!-- XML SUNAT generado para ${documento.serie}-${documento.numero} -->`;
  }
}
