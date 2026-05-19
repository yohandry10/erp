import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { XmlSigner } from '@erp-suite/crypto';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import { CircuitBreakerService, CircuitBreakerOpenError, CircuitStats } from '../../shared/resilience/circuit-breaker.service';

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
  ticket?: string;
}

// Q33: Nombres de circuitos para servicios SUNAT
const CIRCUIT_SUNAT_CPE = 'SUNAT_CPE';
const CIRCUIT_SUNAT_GRE = 'SUNAT_GRE';
const CIRCUIT_SUNAT_QUERY = 'SUNAT_QUERY';

@Injectable()
export class OseService implements OnModuleInit {
  private readonly logger = new Logger(OseService.name);
  private xmlSigner: XmlSigner;
  private oseConfig: OseConfig;

  constructor(
    private readonly configService: ConfigService,
    private readonly circuitBreaker: CircuitBreakerService,
  ) {
    this.initializeOseConfig();
    this.initializeXmlSigner();
  }

  /**
   * Q33: Inicializar circuit breakers para servicios SUNAT
   */
  onModuleInit() {
    // Circuit breaker para envío de CPE (facturas/boletas)
    this.circuitBreaker.registerCircuit(CIRCUIT_SUNAT_CPE, {
      failureThreshold: 5,    // 5 fallos consecutivos para abrir
      successThreshold: 2,    // 2 éxitos para cerrar
      timeout: 60000,         // 1 minuto antes de probar de nuevo
    });

    // Circuit breaker para envío de GRE (guías de remisión)
    this.circuitBreaker.registerCircuit(CIRCUIT_SUNAT_GRE, {
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 60000,
    });

    // Circuit breaker para consultas de estado
    this.circuitBreaker.registerCircuit(CIRCUIT_SUNAT_QUERY, {
      failureThreshold: 3,    // Más sensible para consultas
      successThreshold: 1,
      timeout: 30000,         // 30 segundos
    });

    this.logger.log('✅ Circuit breakers inicializados para servicios SUNAT');
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
    const requireRealCertificate = this.oseConfig.environment === 'produccion'
      || this.configService.get<string | boolean>('REQUIRE_REAL_FISCAL_CERTIFICATE') === true
      || this.configService.get<string | boolean>('REQUIRE_REAL_FISCAL_CERTIFICATE') === 'true';
    const resolvedCertificatePath = this.resolveCertificatePath(this.oseConfig.certificatePath);

    try {
      if (resolvedCertificatePath) {
        this.xmlSigner = new XmlSigner({
          pfxPath: resolvedCertificatePath,
          pfxPassword: this.oseConfig.certificatePassword,
          allowDemoFallback: !requireRealCertificate,
        });
        this.logger.log('✅ Certificado digital real cargado exitosamente');
      } else {
        if (requireRealCertificate) {
          throw new Error(`Certificado fiscal requerido no encontrado: ${this.oseConfig.certificatePath}`);
        }
        this.logger.warn('⚠️ Certificado no encontrado, usando modo DEMO para testing');
        // Usar modo demo con la flag correcta
        this.xmlSigner = new XmlSigner({
          useDemoMode: true
        });
        this.logger.log('✅ XmlSigner inicializado en modo DEMO');
      }
    } catch (error) {
      this.logger.error('❌ Error inicializando certificado:', error);
      if (requireRealCertificate) {
        throw error;
      }
      // Fallback a modo demo si hay cualquier error
      this.logger.warn('🔧 Iniciando en modo DEMO como fallback...');
      this.xmlSigner = new XmlSigner({
        useDemoMode: true
      });
    }
  }

  private resolveCertificatePath(configuredPath: string): string | null {
    if (!configuredPath) {
      return null;
    }

    if (path.isAbsolute(configuredPath) && fs.existsSync(configuredPath)) {
      return configuredPath;
    }

    const candidates = [
      path.resolve(process.cwd(), configuredPath),
      path.resolve(process.cwd(), '..', '..', configuredPath),
      path.resolve(__dirname, '..', '..', '..', configuredPath),
    ];

    return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
  }

  /**
   * Enviar CPE (Factura/Boleta) a SUNAT
   * Q33: Protegido con Circuit Breaker
   */
  async enviarCpe(xmlUnsigned: string, fileName: string): Promise<SunatResponse> {
    try {
      this.logger.log(`📤 Enviando CPE a SUNAT: ${fileName}`);

      // 1. Firmar el XML
      const xmlSigned = this.xmlSigner.signXml(xmlUnsigned);
      const hash = this.xmlSigner.generateHash(xmlSigned);

      // 2. Comprimir el XML
      const zipBuffer = await this.compressXml(xmlSigned, fileName);

      // 3. Q33: Enviar a SUNAT con Circuit Breaker
      const response = await this.circuitBreaker.execute<SunatResponse>(
        CIRCUIT_SUNAT_CPE,
        () => this.sendToSunat(zipBuffer, fileName),
        // Fallback: retornar error controlado si el circuito está abierto
        () => ({
          success: false,
          codigoRespuesta: 'CB_OPEN',
          descripcionRespuesta: 'Servicio SUNAT temporalmente no disponible. El documento será enviado automáticamente cuando el servicio se recupere.',
        }),
      );

      // 4. Procesar respuesta
      if (response.success) {
        this.logger.log(`✅ CPE enviado exitosamente: ${fileName}`);
        return {
          success: true,
          codigoRespuesta: response.codigoRespuesta,
          descripcionRespuesta: response.descripcionRespuesta,
          cdr: response.cdr || undefined,
          numeroComprobante: fileName,
          hashCPE: hash
        };
      } else {
        this.logger.error(`❌ Error enviando CPE: ${response.descripcionRespuesta}`);
        return response;
      }

    } catch (error) {
      // Q33: Manejar error de circuit breaker abierto
      if (error instanceof CircuitBreakerOpenError) {
        this.logger.warn(`⚡ Circuit breaker abierto para SUNAT CPE: ${error.message}`);
        return {
          success: false,
          codigoRespuesta: 'CB_OPEN',
          descripcionRespuesta: error.message,
        };
      }

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
   * Q33: Protegido con Circuit Breaker
   */
  async enviarGre(xmlUnsigned: string, fileName: string): Promise<SunatResponse> {
    try {
      this.logger.log(`🚚 Enviando GRE a SUNAT: ${fileName}`);

      // 1. Firmar el XML de la GRE
      const xmlSigned = this.xmlSigner.signXml(xmlUnsigned);
      const hash = this.xmlSigner.generateHash(xmlSigned);

      // 2. Comprimir el XML
      const zipBuffer = await this.compressXml(xmlSigned, fileName);

      // 3. Q33: Enviar a SUNAT con Circuit Breaker
      const response = await this.circuitBreaker.execute<SunatResponse>(
        CIRCUIT_SUNAT_GRE,
        () => this.sendGreToSunat(zipBuffer, fileName),
        () => ({
          success: false,
          codigoRespuesta: 'CB_OPEN',
          descripcionRespuesta: 'Servicio SUNAT GRE temporalmente no disponible. La guía será enviada automáticamente cuando el servicio se recupere.',
        }),
      );

      // 4. Procesar respuesta
      if (response.success) {
        this.logger.log(`✅ GRE enviada exitosamente: ${fileName}`);
        return {
          success: true,
          codigoRespuesta: response.codigoRespuesta,
          descripcionRespuesta: response.descripcionRespuesta,
          cdr: response.cdr || undefined,
          numeroComprobante: fileName,
          hashCPE: hash
        };
      } else {
        this.logger.error(`❌ Error enviando GRE: ${response.descripcionRespuesta}`);
        return response;
      }

    } catch (error) {
      if (error instanceof CircuitBreakerOpenError) {
        this.logger.warn(`⚡ Circuit breaker abierto para SUNAT GRE: ${error.message}`);
        return {
          success: false,
          codigoRespuesta: 'CB_OPEN',
          descripcionRespuesta: error.message,
        };
      }

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
   * Q33: Protegido con Circuit Breaker
   */
  async consultarEstadoCpe(ruc: string, tipoDocumento: string, serie: string, numero: string): Promise<SunatResponse> {
    try {
      this.logger.log(`🔍 Consultando estado CPE: ${ruc}-${tipoDocumento}-${serie}-${numero}`);

      // Q33: Consultar con Circuit Breaker
      const response = await this.circuitBreaker.execute(
        CIRCUIT_SUNAT_QUERY,
        () => this.queryStatusInSunat(ruc, tipoDocumento, serie, numero),
        () => ({
          success: false,
          codigoRespuesta: 'CB_OPEN',
          descripcionRespuesta: 'Servicio de consulta SUNAT temporalmente no disponible. Intente más tarde.',
        }),
      );
      
      return response;
    } catch (error) {
      if (error instanceof CircuitBreakerOpenError) {
        this.logger.warn(`⚡ Circuit breaker abierto para consulta SUNAT: ${error.message}`);
        return {
          success: false,
          codigoRespuesta: 'CB_OPEN',
          descripcionRespuesta: error.message,
        };
      }

      this.logger.error('❌ Error consultando estado CPE:', error);
      return {
        success: false,
        codigoRespuesta: '99',
        descripcionRespuesta: `Error consultando estado: ${error.message}`
      };
    }
  }

  /**
   * Consultar ticket de comunicación de bajas u otros procesos asíncronos
   * (stub simple hasta tener integración real con OSE)
   */
  async consultarTicket(ticket: string): Promise<SunatResponse> {
    this.logger.warn(`⚠️ [OSE] consultarTicket() aún no implementado. Ticket recibido: ${ticket}`);
    return {
      success: true,
      codigoRespuesta: '0',
      descripcionRespuesta: 'Consulta de ticket simulada (pendiente de integración real)',
      ticket,
    };
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
    if (!this.resolveCertificatePath(this.oseConfig.certificatePath)) errors.push('Certificado digital no encontrado');

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
      certificateExists: !!this.resolveCertificatePath(this.oseConfig.certificatePath),
      usuario: this.oseConfig.usuario ? '***configurado***' : 'no configurado',
      password: this.oseConfig.password ? '***configurado***' : 'no configurado'
    };
  }

  /**
   * Q33: Obtener estado de los circuit breakers de SUNAT
   * Útil para monitoreo y dashboards de operaciones
   */
  getCircuitBreakerStatus(): { cpe: CircuitStats; gre: CircuitStats; query: CircuitStats } {
    return {
      cpe: this.circuitBreaker.getStats(CIRCUIT_SUNAT_CPE),
      gre: this.circuitBreaker.getStats(CIRCUIT_SUNAT_GRE),
      query: this.circuitBreaker.getStats(CIRCUIT_SUNAT_QUERY),
    };
  }

  /**
   * Q33: Forzar reset de un circuit breaker (para recuperación manual)
   */
  resetCircuitBreaker(circuit: 'cpe' | 'gre' | 'query'): void {
    const circuitName = {
      cpe: CIRCUIT_SUNAT_CPE,
      gre: CIRCUIT_SUNAT_GRE,
      query: CIRCUIT_SUNAT_QUERY,
    }[circuit];

    if (circuitName) {
      this.circuitBreaker.forceClose(circuitName);
      this.logger.log(`✅ Circuit breaker ${circuit} reseteado manualmente`);
    }
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
