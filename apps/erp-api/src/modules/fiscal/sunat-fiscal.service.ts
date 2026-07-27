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

const SUNAT_CPE_ENDPOINTS = {
  homologacion: 'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService',
  produccion: 'https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService',
} as const;

const SUNAT_QUERY_ENDPOINTS = {
  homologacion: 'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService',
  produccion: 'https://e-factura.sunat.gob.pe/ol-it-wsconscpegem/billConsultService',
} as const;

const getConfigValue = (configService: ConfigService, ...keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = configService.get<string>(key);
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
};

@Injectable()
export class SunatFiscalService extends FiscalServiceAbstract {
  private xmlSigner: XmlSigner;

  constructor(private readonly configService: ConfigService) {
    const environment = configService.get('SUNAT_ENVIRONMENT') === 'produccion' ? 'produccion' : 'homologacion';
    const config: FiscalConfig = {
      url: configService.get('SUNAT_CPE_URL') || configService.get('OSE_URL') || SUNAT_CPE_ENDPOINTS[environment],
      usuario: getConfigValue(configService, 'SUNAT_USERNAME', 'OSE_USUARIO', 'OSE_USERNAME') || '',
      password: getConfigValue(configService, 'SUNAT_PASSWORD', 'OSE_PASSWORD') || '',
      empresaId: configService.get('EMPRESA_RUC') || '',
      certificatePath: getConfigValue(configService, 'CERTIFICATE_PATH', 'PFX_PATH') || '/certificates/certificado.pfx',
      certificatePassword: getConfigValue(configService, 'CERTIFICATE_PASSWORD', 'PFX_PASS') || '',
      environment,
      pais: 'PE'
    };
    
    super(config);
    this.initializeXmlSigner();
  }

  private getConfigValue(...keys: string[]): string | undefined {
    for (const key of keys) {
      const value = this.configService.get<string>(key);
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    return undefined;
  }

  private initializeXmlSigner(): void {
    const requireRealCertificate = this.config.environment === 'produccion'
      || this.configService.get<string | boolean>('REQUIRE_REAL_FISCAL_CERTIFICATE') === true
      || this.configService.get<string | boolean>('REQUIRE_REAL_FISCAL_CERTIFICATE') === 'true';

    this.xmlSigner = new XmlSigner({
      pfxPath: this.config.certificatePath,
      pfxPassword: this.config.certificatePassword,
      allowDemoFallback: !requireRealCertificate,
      expectedRuc: this.getConfigValue('SUNAT_CERT_EXPECTED_RUC') || this.config.empresaId,
      enforceRucInCertificate: this.config.environment === 'produccion',
      allowRucMismatchWithConfirmation: this.isCertificateRucMismatchConfirmed(),
    });
  }

  private isCertificateRucMismatchConfirmed(): boolean {
    return this.configService.get<string | boolean>('SUNAT_CERT_RUC_MISMATCH_CONFIRMED') === true
      || this.configService.get<string | boolean>('SUNAT_CERT_RUC_MISMATCH_CONFIRMED') === 'true';
  }

  async enviarDocumento(documento: DocumentoElectronico): Promise<FiscalResponse> {
    try {
      this.logOperation('Enviando documento a SUNAT', { 
        tipo: documento.tipoDocumento, 
        numero: `${documento.serie}-${documento.numero}` 
      });

      // Si CPE ya entrego XML firmado, no se vuelve a firmar.
      const xmlSigned = documento.xmlContent || await this.firmarXML(await this.generarXML(documento));
      
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

    if (documento.tipoDocumento === '01' && documento.receptor.numeroDocumento?.length !== 11) {
      errores.push('Factura requiere RUC del receptor de 11 dígitos');
    }

    if (documento.tipoDocumento === '03' && documento.importeTotal > 700) {
      if (!documento.receptor.razonSocial?.trim() || !documento.receptor.numeroDocumento?.trim()) {
        errores.push(
          'Boleta mayor a S/ 700 requiere apellidos y nombres o razón social, y número de documento del adquirente o usuario',
        );
      }
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
    if (documento.xmlContent) {
      return documento.xmlContent;
    }

    throw new Error(
      'SUNAT_DIRECTO requiere XML UBL generado por el modulo CPE. ' +
      'Use CpeService/POST /api/cpe o configure emision_cpe_modo=OSE_API para un PSE.',
    );
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

      return {
        success: false,
        codigoRespuesta: 'NOT_IMPLEMENTED',
        descripcionRespuesta:
          'El envío directo de libros contables no está implementado. Genere y valide el archivo PLE/SIRE mediante el módulo correspondiente.',
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
    return new Promise((resolve, reject) => {
      try {
        this.assertSunatDirectConfigured();
        const postData = this.buildSunatRequest(zipBuffer, fileName, 'sendBill');
        const endpoint = this.resolveSunatEndpoint();
        const requestOptions: https.RequestOptions = {
          hostname: endpoint.hostname,
          port: endpoint.port,
          path: endpoint.path,
          method: 'POST',
          headers: {
            'Content-Type': 'text/xml; charset=utf-8',
            'Content-Length': Buffer.byteLength(postData),
            SOAPAction: 'urn:sendBill',
          },
        };

        if (this.shouldUseHttpBasicAuth(endpoint.hostname)) {
          requestOptions.auth = `${this.config.usuario}:${this.config.password}`;
        }

        const req = https.request(
          requestOptions,
          (res) => {
            let data = '';
            res.on('data', (chunk) => {
              data += chunk;
            });
            res.on('end', () => resolve(this.parseSunatResponse(data)));
          },
        );

        req.on('error', reject);
        req.write(postData);
        req.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  private async queryStatusInSunat(ruc: string, tipoDocumento: string, serie: string, numero: string): Promise<FiscalResponse> {
    return new Promise((resolve, reject) => {
      try {
        this.assertSunatDirectConfigured();
        const rucConsulta = ruc || this.config.empresaId;
        if (!rucConsulta) {
          throw new Error('RUC emisor requerido para consultar estado SUNAT');
        }

        const postData = this.buildStatusCdrRequest(rucConsulta, tipoDocumento, serie, numero);
        const endpoint = this.resolveSunatEndpoint('query');
        const requestOptions: https.RequestOptions = {
          hostname: endpoint.hostname,
          port: endpoint.port,
          path: endpoint.path,
          method: 'POST',
          headers: {
            'Content-Type': 'text/xml; charset=utf-8',
            'Content-Length': Buffer.byteLength(postData),
            SOAPAction: 'urn:getStatusCdr',
          },
        };

        if (this.shouldUseHttpBasicAuth(endpoint.hostname)) {
          requestOptions.auth = `${this.config.usuario}:${this.config.password}`;
        }

        const req = https.request(
          requestOptions,
          (res) => {
            let data = '';
            res.on('data', (chunk) => {
              data += chunk;
            });
            res.on('end', () => resolve(this.parseSunatResponse(data)));
          },
        );

        req.on('error', reject);
        req.write(postData);
        req.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  private assertSunatDirectConfigured(): void {
    if (!this.config.url) throw new Error('URL SUNAT/OSE no configurada');
    if (!this.config.usuario) throw new Error('Usuario SUNAT/OSE no configurado');
    if (!this.config.password) throw new Error('Password SUNAT/OSE no configurado');
  }

  private resolveSunatEndpoint(kind: 'cpe' | 'query' = 'cpe'): { hostname: string; port: number; path: string } {
    const endpointUrl =
      kind === 'query'
        ? this.getConfigValue('SUNAT_QUERY_URL') || SUNAT_QUERY_ENDPOINTS[this.config.environment]
        : this.config.url || SUNAT_CPE_ENDPOINTS[this.config.environment];
    const defaultUrl = kind === 'query' ? SUNAT_QUERY_ENDPOINTS[this.config.environment] : SUNAT_CPE_ENDPOINTS[this.config.environment];
    const url = new URL(endpointUrl);
    const configuredPath = url.pathname && url.pathname !== '/' ? url.pathname : '';
    const path = configuredPath || new URL(defaultUrl).pathname;

    return {
      hostname: url.hostname,
      port: Number(url.port || 443),
      path,
    };
  }

  private shouldUseHttpBasicAuth(hostname: string): boolean {
    const normalizedHost = hostname.toLowerCase();
    return normalizedHost !== 'sunat.gob.pe' && !normalizedHost.endsWith('.sunat.gob.pe');
  }

  private buildSunatRequest(zipBuffer: Buffer, fileName: string, operation: 'sendBill'): string {
    const zipBase64 = zipBuffer.toString('base64');
    return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:ser="http://service.sunat.gob.pe"
               xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
  <soap:Header>
    <wsse:Security>
      <wsse:UsernameToken>
        <wsse:Username>${this.config.usuario}</wsse:Username>
        <wsse:Password>${this.config.password}</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  </soap:Header>
  <soap:Body>
    <ser:${operation}>
      <fileName>${fileName}.zip</fileName>
      <contentFile>${zipBase64}</contentFile>
    </ser:${operation}>
  </soap:Body>
</soap:Envelope>`;
  }

  private buildStatusCdrRequest(ruc: string, tipoDocumento: string, serie: string, numero: string): string {
    return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:ser="http://service.sunat.gob.pe"
               xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
  <soap:Header>
    <wsse:Security>
      <wsse:UsernameToken>
        <wsse:Username>${this.config.usuario}</wsse:Username>
        <wsse:Password>${this.config.password}</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  </soap:Header>
  <soap:Body>
    <ser:getStatusCdr>
      <rucComprobante>${ruc}</rucComprobante>
      <tipoComprobante>${tipoDocumento}</tipoComprobante>
      <serieComprobante>${serie}</serieComprobante>
      <numeroComprobante>${numero}</numeroComprobante>
    </ser:getStatusCdr>
  </soap:Body>
</soap:Envelope>`;
  }

  private parseSunatResponse(soapResponse: string): FiscalResponse {
    const faultMatch = soapResponse.match(/<faultstring>(.*?)<\/faultstring>/);
    if (faultMatch) {
      return {
        success: false,
        codigoRespuesta: '99',
        descripcionRespuesta: faultMatch[1],
      };
    }

    const cdrMatch =
      soapResponse.match(/<(?:\w+:)?applicationResponse\b[^>]*>([\s\S]*?)<\/(?:\w+:)?applicationResponse>/i) ||
      soapResponse.match(/<(?:\w+:)?content\b[^>]*>([\s\S]*?)<\/(?:\w+:)?content>/i);
    if (cdrMatch) {
      return {
        success: true,
        codigoRespuesta: '0',
        descripcionRespuesta: 'Aceptado por SUNAT',
        cdr: cdrMatch[1].trim(),
      };
    }

    const statusCodeMatch = soapResponse.match(/<(?:\w+:)?statusCode\b[^>]*>([\s\S]*?)<\/(?:\w+:)?statusCode>/i);
    const statusMessageMatch = soapResponse.match(/<(?:\w+:)?statusMessage\b[^>]*>([\s\S]*?)<\/(?:\w+:)?statusMessage>/i);
    if (statusCodeMatch || statusMessageMatch) {
      const codigo = statusCodeMatch?.[1] || '0';
      return {
        success: codigo === '0',
        codigoRespuesta: codigo,
        descripcionRespuesta: statusMessageMatch?.[1] || 'Respuesta de estado SUNAT recibida',
      };
    }

    return {
      success: false,
      codigoRespuesta: '98',
      descripcionRespuesta: 'Respuesta de SUNAT no reconocida',
    };
  }
}
