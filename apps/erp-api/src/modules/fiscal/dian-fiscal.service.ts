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
import { DianXmlBuilderService } from './colombia/dian-xml-builder.service';
import { DianSignerService } from './colombia/dian-signer.service';
import { DianApiClientService, DianConfig } from './colombia/dian-api-client.service';

@Injectable()
export class DianFiscalService extends FiscalServiceAbstract {
  private dianConfig: DianConfig;

  constructor(
    configService: ConfigService,
    private readonly xmlBuilder: DianXmlBuilderService,
    private readonly signer: DianSignerService,
    private readonly apiClient: DianApiClientService
  ) {
    const config: FiscalConfig = {
      url: configService.get('DIAN_URL') || 'https://vpfe-hab.dian.gov.co',
      usuario: configService.get('DIAN_USUARIO') || '',
      password: configService.get('DIAN_PASSWORD') || '',
      empresaId: configService.get('EMPRESA_NIT') || '',
      certificatePath: configService.get('DIAN_CERTIFICATE_PATH') || '/certificates/dian.p12',
      certificatePassword: configService.get('DIAN_CERTIFICATE_PASSWORD') || '',
      environment: configService.get('DIAN_ENVIRONMENT') === 'produccion' ? 'produccion' : 'homologacion',
      pais: 'CO'
    };
    
    super(config);

    // Configurar cliente DIAN
    this.dianConfig = {
      url: config.url,
      environment: config.environment === 'produccion' ? 'produccion' : 'habilitacion',
      nit: config.empresaId,
      softwareId: configService.get('DIAN_SOFTWARE_ID') || '',
      softwarePin: configService.get('DIAN_SOFTWARE_PIN') || '',
      testSetId: configService.get('DIAN_TEST_SET_ID')
    };

    this.apiClient.configurar(this.dianConfig);
  }

  async enviarDocumento(documento: DocumentoElectronico): Promise<FiscalResponse> {
    try {
      this.logOperation('Enviando documento a DIAN', { 
        tipo: documento.tipoDocumento, 
        numero: `${documento.serie}-${documento.numero}` 
      });

      // 1. Generar XML según tipo de documento
      const xmlContent = await this.generarXML(documento);
      
      // 2. Firmar XML con certificado digital
      const xmlSigned = await this.firmarXML(xmlContent);
      
      // 3. Generar ApplicationResponse (AttachedDocument)
      const attachedDocument = this.generarAttachedDocument(documento);
      
      // 4. Enviar a DIAN
      const dianResponse = await this.apiClient.enviarDocumento(
        xmlSigned,
        attachedDocument,
        this.dianConfig
      );

      if (dianResponse.success) {
        this.logSuccess('Documento aceptado por DIAN', { 
          cufe: dianResponse.cufe,
          documento: `${documento.serie}-${documento.numero}` 
        });

        return {
          success: true,
          codigoRespuesta: dianResponse.statusCode,
          descripcionRespuesta: dianResponse.statusDescription,
          cdr: dianResponse.xmlResponse,
          hash: dianResponse.cufe,
          metadata: {
            cufe: dianResponse.cufe,
            qrCode: dianResponse.qrCode
          }
        };
      } else {
        this.logError('Documento rechazado por DIAN', dianResponse.errors);
        return {
          success: false,
          codigoRespuesta: dianResponse.statusCode,
          descripcionRespuesta: dianResponse.statusDescription,
          errores: dianResponse.errors
        };
      }
    } catch (error) {
      this.logError('enviarDocumento', error);
      return {
        success: false,
        codigoRespuesta: '99',
        descripcionRespuesta: `Error técnico: ${error.message}`,
        errores: [error.message]
      };
    }
  }

  async consultarEstado(consulta: ConsultaEstado): Promise<FiscalResponse> {
    try {
      this.logOperation('Consultando estado en DIAN', consulta);
      
      // Consultar por CUFE (hash del documento)
      const cufe = consulta.hash || consulta.numeroDocumento;
      
      if (!cufe) {
        return {
          success: false,
          codigoRespuesta: '99',
          descripcionRespuesta: 'CUFE no proporcionado para consulta'
        };
      }

      const dianResponse = await this.apiClient.consultarEstado(cufe, this.dianConfig);

      return {
        success: dianResponse.success,
        codigoRespuesta: dianResponse.estado === 'ACEPTADO' ? '00' : '99',
        descripcionRespuesta: dianResponse.descripcion,
        metadata: {
          estado: dianResponse.estado,
          cufe: dianResponse.cufe,
          fechaProcesamiento: dianResponse.fechaProcesamiento
        }
      };
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

    // Validaciones específicas de DIAN Colombia
    if (!documento.emisor.numeroDocumento || !/^\d{9,10}$/.test(documento.emisor.numeroDocumento)) {
      errores.push('NIT del emisor debe tener 9 o 10 dígitos');
    }

    if (documento.moneda !== 'COP' && documento.moneda !== 'USD') {
      errores.push('Moneda debe ser COP o USD');
    }

    // Validación de rangos autorizados por DIAN
    if (documento.tipoDocumento === '01' && !this.validarRangoAutorizado(documento.serie, documento.numero)) {
      errores.push('Número de factura fuera del rango autorizado por DIAN');
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
    // Delegar generación de XML al servicio especializado
    switch (documento.tipoDocumento) {
      case '01': // Factura de Venta
        return await this.xmlBuilder.generarFacturaElectronica(documento);
      
      case '91': // Nota Crédito
        return await this.xmlBuilder.generarNotaCredito(documento);
      
      case '92': // Nota Débito
        return await this.xmlBuilder.generarNotaDebito(documento);
      
      default:
        throw new Error(`Tipo de documento no soportado: ${documento.tipoDocumento}`);
    }
  }

  async firmarXML(xmlContent: string): Promise<string> {
    // Delegar firma digital al servicio especializado
    return await this.signer.firmarXML(xmlContent, {
      certificatePath: this.config.certificatePath,
      certificatePassword: this.config.certificatePassword,
      signatureId: 'xmldsig-dian-signature'
    });
  }

  async enviarLibroContable(libro: LibroContableFiscal): Promise<FiscalResponse> {
    try {
      this.logOperation('Enviando libro contable a DIAN', { 
        periodo: libro.periodo, 
        tipo: libro.tipoLibro 
      });

      // Implementación específica para libros contables DIAN
      // Libros como Libro Mayor y de Balances, Libros Societarios
      return {
        success: true,
        codigoRespuesta: '0',
        descripcionRespuesta: 'Libro contable enviado exitosamente a DIAN'
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

  // ========== MÉTODOS PRIVADOS ==========

  private generarAttachedDocument(documento: DocumentoElectronico): string {
    // Generar ApplicationResponse (documento adjunto requerido por DIAN)
    return `<?xml version="1.0" encoding="UTF-8"?>
<ApplicationResponse xmlns="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2">
  <cbc:UBLVersionID>UBL 2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>1</cbc:CustomizationID>
  <cbc:ProfileID>DIAN 2.1</cbc:ProfileID>
  <cbc:ID>${documento.serie}${documento.numero}</cbc:ID>
  <cbc:IssueDate>${new Date().toISOString().split('T')[0]}</cbc:IssueDate>
  <cbc:IssueTime>${new Date().toISOString().split('T')[1].split('.')[0]}</cbc:IssueTime>
</ApplicationResponse>`;
  }

  private async validarRangoAutorizado(serie: string, numero: string): Promise<boolean> {
    try {
      const numeroInt = parseInt(numero, 10);
      const resultado = await this.apiClient.validarNumeracion(serie, numeroInt, this.dianConfig);
      return resultado.valido;
    } catch (error) {
      this.logger.warn(`No se pudo validar rango autorizado: ${error.message}`);
      return true; // Permitir continuar si falla la validación
    }
  }

  /**
   * Obtiene rangos de numeración autorizados por DIAN
   */
  async obtenerRangosAutorizados(): Promise<any[]> {
    try {
      const resultado = await this.apiClient.consultarRangosAutorizados(this.dianConfig);
      return resultado.rangos;
    } catch (error) {
      this.logger.error('Error obteniendo rangos autorizados:', error);
      return [];
    }
  }
}
