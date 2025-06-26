import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { XmlSigner } from '@erp-suite/crypto';
import * as https from 'https';
import * as fs from 'fs';

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

@Injectable()
export class OseService {
  private readonly logger = new Logger(OseService.name);
  private xmlSigner: XmlSigner;
  private oseConfig: OseConfig;

  constructor(private readonly configService: ConfigService) {
    this.initializeOseConfig();
    this.initializeXmlSigner();
  }

  private initializeOseConfig() {
    this.oseConfig = {
      url: this.configService.get('OSE_URL') || 'https://api-cpe-beta.sunat.gob.pe',
      usuario: this.configService.get('OSE_USUARIO') || '',
      password: this.configService.get('OSE_PASSWORD') || '',
      ruc: this.configService.get('EMPRESA_RUC') || '',
      certificatePath: this.configService.get('CERTIFICATE_PATH') || '/certificates/certificado.pfx',
      certificatePassword: this.configService.get('CERTIFICATE_PASSWORD') || '',
      environment: this.configService.get('SUNAT_ENVIRONMENT') === 'produccion' ? 'produccion' : 'homologacion'
    };

    this.logger.log(`🔧 OSE configurado para: ${this.oseConfig.environment}`);
    this.logger.log(`🔧 URL OSE: ${this.oseConfig.url}`);
    this.logger.log(`🔧 RUC Empresa: ${this.oseConfig.ruc}`);
  }

  private initializeXmlSigner() {
    try {
      // Verificar si existe el certificado real
      if (fs.existsSync(this.oseConfig.certificatePath)) {
        this.xmlSigner = new XmlSigner({
          pfxPath: this.oseConfig.certificatePath,
          pfxPassword: this.oseConfig.certificatePassword,
        });
        this.logger.log('✅ Certificado digital real cargado exitosamente');
      } else {
        this.logger.warn('⚠️ Certificado no encontrado, usando modo DEMO para testing');
        // Usar modo demo con la flag correcta
        this.xmlSigner = new XmlSigner({
          useDemoMode: true
        });
        this.logger.log('✅ XmlSigner inicializado en modo DEMO');
      }
    } catch (error) {
      this.logger.error('❌ Error inicializando certificado:', error);
      // Fallback a modo demo si hay cualquier error
      this.logger.warn('🔧 Iniciando en modo DEMO como fallback...');
      this.xmlSigner = new XmlSigner({
        useDemoMode: true
      });
    }
  }

  /**
   * Enviar CPE (Factura/Boleta) a SUNAT
   */
  async enviarCpe(xmlUnsigned: string, fileName: string): Promise<SunatResponse> {
    try {
      this.logger.log(`📤 Enviando CPE a SUNAT: ${fileName}`);

      // 1. Firmar el XML
      const xmlSigned = this.xmlSigner.signXml(xmlUnsigned);
      const hash = this.xmlSigner.generateHash(xmlSigned);

      // 2. Comprimir el XML
      const zipBuffer = await this.compressXml(xmlSigned, fileName);

      // 3. Enviar a SUNAT
      const response = await this.sendToSunat(zipBuffer, fileName);

      // 4. Procesar respuesta
      if (response.success) {
        this.logger.log(`✅ CPE enviado exitosamente: ${fileName}`);
        return {
          success: true,
          codigoRespuesta: response.codigoRespuesta,
          descripcionRespuesta: response.descripcionRespuesta,
          cdr: response.cdr,
          numeroComprobante: fileName,
          hashCPE: hash
        };
      } else {
        this.logger.error(`❌ Error enviando CPE: ${response.descripcionRespuesta}`);
        return response;
      }

    } catch (error) {
      this.logger.error('❌ Error en envío CPE:', error);
      return {
        success: false,
        codigoRespuesta: '99',
        descripcionRespuesta: `Error técnico: ${error.message}`
      };
    }
  }

  /**
   * Enviar GRE (Guía de Remisión) a SUNAT
   */
  async enviarGre(xmlUnsigned: string, fileName: string): Promise<SunatResponse> {
    try {
      this.logger.log(`🚚 Enviando GRE a SUNAT: ${fileName}`);

      // 1. Firmar el XML de la GRE
      const xmlSigned = this.xmlSigner.signXml(xmlUnsigned);
      const hash = this.xmlSigner.generateHash(xmlSigned);

      // 2. Comprimir el XML
      const zipBuffer = await this.compressXml(xmlSigned, fileName);

      // 3. Enviar a SUNAT (endpoint específico para GRE)
      const response = await this.sendGreToSunat(zipBuffer, fileName);

      // 4. Procesar respuesta
      if (response.success) {
        this.logger.log(`✅ GRE enviada exitosamente: ${fileName}`);
        return {
          success: true,
          codigoRespuesta: response.codigoRespuesta,
          descripcionRespuesta: response.descripcionRespuesta,
          cdr: response.cdr,
          numeroComprobante: fileName,
          hashCPE: hash
        };
      } else {
        this.logger.error(`❌ Error enviando GRE: ${response.descripcionRespuesta}`);
        return response;
      }

    } catch (error) {
      this.logger.error('❌ Error en envío GRE:', error);
      return {
        success: false,
        codigoRespuesta: '99',
        descripcionRespuesta: `Error técnico: ${error.message}`
      };
    }
  }

  /**
   * Consultar estado de CPE en SUNAT
   */
  async consultarEstadoCpe(ruc: string, tipoDocumento: string, serie: string, numero: string): Promise<SunatResponse> {
    try {
      this.logger.log(`🔍 Consultando estado CPE: ${ruc}-${tipoDocumento}-${serie}-${numero}`);

      const response = await this.queryStatusInSunat(ruc, tipoDocumento, serie, numero);
      
      return response;
    } catch (error) {
      this.logger.error('❌ Error consultando estado CPE:', error);
      return {
        success: false,
        codigoRespuesta: '99',
        descripcionRespuesta: `Error consultando estado: ${error.message}`
      };
    }
  }

  /**
   * Comprimir XML para envío a SUNAT
   */
  private async compressXml(xmlContent: string, fileName: string): Promise<Buffer> {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip();
    
    // Agregar XML al ZIP
    zip.addFile(`${fileName}.xml`, Buffer.from(xmlContent, 'utf8'));
    
    return zip.toBuffer();
  }

  /**
   * Enviar CPE comprimido a SUNAT
   */
  private async sendToSunat(zipBuffer: Buffer, fileName: string): Promise<SunatResponse> {
    return new Promise((resolve, reject) => {
      // Configuración de la petición HTTPS a SUNAT
      const postData = this.buildSunatRequest(zipBuffer, fileName, 'cpe');
      
      const options = {
        hostname: new URL(this.oseConfig.url).hostname,
        port: 443,
        path: '/ol-ti-itcpfegem-beta/billService',
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'Content-Length': Buffer.byteLength(postData),
          'SOAPAction': 'urn:sendBill'
        },
        auth: `${this.oseConfig.usuario}:${this.oseConfig.password}`
      };

      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const response = this.parseSunatResponse(data);
            resolve(response);
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on('error', (error) => {
        this.logger.error('❌ Error en petición HTTPS a SUNAT:', error);
        reject(error);
      });

      req.write(postData);
      req.end();
    });
  }

  /**
   * Enviar GRE comprimida a SUNAT
   */
  private async sendGreToSunat(zipBuffer: Buffer, fileName: string): Promise<SunatResponse> {
    return new Promise((resolve, reject) => {
      // Configuración específica para GRE
      const postData = this.buildSunatRequest(zipBuffer, fileName, 'gre');
      
      const options = {
        hostname: new URL(this.oseConfig.url).hostname,
        port: 443,
        path: '/ol-ti-itemision-otroscpe-gem-beta/billService', // Endpoint específico para GRE
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'Content-Length': Buffer.byteLength(postData),
          'SOAPAction': 'urn:sendBill'
        },
        auth: `${this.oseConfig.usuario}:${this.oseConfig.password}`
      };

      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const response = this.parseSunatResponse(data);
            resolve(response);
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on('error', (error) => {
        this.logger.error('❌ Error en petición HTTPS GRE a SUNAT:', error);
        reject(error);
      });

      req.write(postData);
      req.end();
    });
  }

  /**
   * Construir petición SOAP para SUNAT
   */
  private buildSunatRequest(zipBuffer: Buffer, fileName: string, type: 'cpe' | 'gre'): string {
    const zipBase64 = zipBuffer.toString('base64');
    
    return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" 
               xmlns:ser="http://service.sunat.gob.pe"
               xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
  <soap:Header>
    <wsse:Security>
      <wsse:UsernameToken>
        <wsse:Username>${this.oseConfig.usuario}</wsse:Username>
        <wsse:Password>${this.oseConfig.password}</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  </soap:Header>
  <soap:Body>
    <ser:sendBill>
      <fileName>${fileName}.zip</fileName>
      <contentFile>${zipBase64}</contentFile>
    </ser:sendBill>
  </soap:Body>
</soap:Envelope>`;
  }

  /**
   * Parsear respuesta de SUNAT
   */
  private parseSunatResponse(soapResponse: string): SunatResponse {
    try {
      // Extraer información de la respuesta SOAP
      // (Implementación simplificada - en producción usar XML parser)
      
      if (soapResponse.includes('<faultstring>')) {
        // Error SOAP
        const faultMatch = soapResponse.match(/<faultstring>(.*?)<\/faultstring>/);
        return {
          success: false,
          codigoRespuesta: '99',
          descripcionRespuesta: faultMatch ? faultMatch[1] : 'Error SOAP desconocido'
        };
      }

      if (soapResponse.includes('applicationResponse')) {
        // Respuesta exitosa con CDR
        const cdrMatch = soapResponse.match(/<applicationResponse>(.*?)<\/applicationResponse>/);
        return {
          success: true,
          codigoRespuesta: '0',
          descripcionRespuesta: 'Aceptado por SUNAT',
          cdr: cdrMatch ? cdrMatch[1] : undefined
        };
      }

      // Respuesta desconocida
      return {
        success: false,
        codigoRespuesta: '98',
        descripcionRespuesta: 'Respuesta de SUNAT no reconocida'
      };

    } catch (error) {
      this.logger.error('❌ Error parseando respuesta SUNAT:', error);
      return {
        success: false,
        codigoRespuesta: '97',
        descripcionRespuesta: `Error parseando respuesta: ${error.message}`
      };
    }
  }

  /**
   * Consultar estado en SUNAT
   */
  private async queryStatusInSunat(ruc: string, tipoDocumento: string, serie: string, numero: string): Promise<SunatResponse> {
    return new Promise((resolve, reject) => {
      const postData = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" 
               xmlns:ser="http://service.sunat.gob.pe">
  <soap:Header/>
  <soap:Body>
    <ser:getStatus>
      <rucComprobante>${ruc}</rucComprobante>
      <tipoComprobante>${tipoDocumento}</tipoComprobante>
      <serieComprobante>${serie}</serieComprobante>
      <numeroComprobante>${numero}</numeroComprobante>
    </ser:getStatus>
  </soap:Body>
</soap:Envelope>`;

      const options = {
        hostname: new URL(this.oseConfig.url).hostname,
        port: 443,
        path: '/ol-ti-itcpfegem-beta/billService',
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'Content-Length': Buffer.byteLength(postData),
          'SOAPAction': 'urn:getStatus'
        },
        auth: `${this.oseConfig.usuario}:${this.oseConfig.password}`
      };

      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const response = this.parseSunatResponse(data);
            resolve(response);
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.write(postData);
      req.end();
    });
  }

  /**
   * Verificar configuración OSE
   */
  async verificarConfiguracion(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    if (!this.oseConfig.url) errors.push('URL de OSE no configurada');
    if (!this.oseConfig.usuario) errors.push('Usuario OSE no configurado');
    if (!this.oseConfig.password) errors.push('Password OSE no configurado');
    if (!this.oseConfig.ruc) errors.push('RUC de empresa no configurado');
    if (!fs.existsSync(this.oseConfig.certificatePath)) errors.push('Certificado digital no encontrado');

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Obtener configuración actual (sin datos sensibles)
   */
  getConfiguracion() {
    return {
      environment: this.oseConfig.environment,
      url: this.oseConfig.url,
      ruc: this.oseConfig.ruc,
      certificateExists: fs.existsSync(this.oseConfig.certificatePath),
      usuario: this.oseConfig.usuario ? '***configurado***' : 'no configurado',
      password: this.oseConfig.password ? '***configurado***' : 'no configurado'
    };
  }

  /**
   * Firmar XML únicamente (sin enviar a SUNAT)
   * Para testing y preparación offline
   */
  async signXmlOnly(xmlContent: string): Promise<string> {
    try {
      console.log('🔐 [OSE] Firmando XML para testing...');
      
      // Usar el XmlSigner mejorado
      const xmlSigned = this.xmlSigner.signXml(xmlContent);
      const hash = this.xmlSigner.generateHash(xmlSigned);
      
      // Validar la firma
      const isValid = this.xmlSigner.validateSignature(xmlSigned);
      
      // Log de información
      console.log('📜 [OSE] Info certificado: DEMO MODE');
      console.log(`📊 [OSE] Hash generado: ${hash}`);
      console.log(`📊 [OSE] Firma válida: ${isValid ? '✅' : '⚠️'}`);
      
      return xmlSigned;
    } catch (error) {
      console.error('❌ [OSE] Error firmando XML:', error);
      throw new Error(`Error firmando XML: ${error.message}`);
    }
  }
} 