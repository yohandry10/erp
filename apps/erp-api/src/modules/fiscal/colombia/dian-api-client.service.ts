/**
 * DIAN API Client Service - Colombia
 * 
 * Cliente para comunicación con servicios web de DIAN
 * Maneja envío de documentos, consultas de estado y validaciones
 * 
 * @module DianApiClientService
 * @country Colombia
 */

import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

export interface DianConfig {
  url: string;
  environment: 'habilitacion' | 'produccion';
  nit: string;
  softwareId: string;
  softwarePin: string;
  testSetId?: string;
}

export interface DianEnvioResponse {
  success: boolean;
  statusCode: string;
  statusDescription: string;
  cufe?: string; // Código Único de Factura Electrónica
  qrCode?: string;
  xmlResponse?: string;
  errors?: string[];
}

export interface DianConsultaResponse {
  success: boolean;
  estado: 'ACEPTADO' | 'RECHAZADO' | 'PENDIENTE' | 'NO_ENCONTRADO';
  descripcion: string;
  cufe?: string;
  fechaProcesamiento?: Date;
}

@Injectable()
export class DianApiClientService {
  private readonly logger = new Logger(DianApiClientService.name);
  private axiosInstance: AxiosInstance;

  constructor() {
    this.axiosInstance = axios.create({
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
  }

  /**
   * Configura el cliente con credenciales DIAN
   */
  configurar(config: DianConfig): void {
    const defaultBaseUrl = config.environment === 'produccion'
      ? 'https://vpfe.dian.gov.co/WcfDianCustomerServices.svc'
      : 'https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc';
    const baseURL = config.url && config.url.trim() ? config.url.trim() : defaultBaseUrl;

    this.axiosInstance.defaults.baseURL = baseURL;
    this.axiosInstance.defaults.headers.common['NIT'] = config.nit;
    this.axiosInstance.defaults.headers.common['Software-Id'] = config.softwareId;

    this.logger.log(`🇨🇴 Cliente DIAN configurado: ${config.environment}`);
  }

  /**
   * Prueba únicamente el transporte/WSDL oficial. No afirma que credenciales,
   * software o certificado estén homologados: eso sólo lo determina DIAN al
   * procesar el set de pruebas firmado.
   */
  async probarConectividad(config: DianConfig): Promise<{
    reachable: boolean;
    endpoint: string;
    serviceDetected: boolean;
    message: string;
  }> {
    this.configurar(config);
    const endpoint = String(this.axiosInstance.defaults.baseURL || '');
    try {
      const wsdlUrl = `${endpoint}${endpoint.includes('?') ? '&' : '?'}singleWsdl`;
      const response = await this.axiosInstance.get(wsdlUrl, {
        timeout: 15000,
        headers: { Accept: 'application/xml,text/xml,*/*' },
        responseType: 'text',
      });
      const body = String(response.data || '');
      const serviceDetected = /WcfDianCustomerServices|wsdl:definitions|<definitions/i.test(body);
      return {
        reachable: response.status >= 200 && response.status < 400 && serviceDetected,
        endpoint,
        serviceDetected,
        message: serviceDetected
          ? 'WSDL oficial DIAN disponible.'
          : 'El endpoint respondió, pero no publicó el contrato DIAN esperado.',
      };
    } catch (error) {
      return {
        reachable: false,
        endpoint,
        serviceDetected: false,
        message: axios.isAxiosError(error)
          ? `No se pudo alcanzar el servicio DIAN (${error.code || error.response?.status || 'ERROR'}).`
          : 'No se pudo alcanzar el servicio DIAN.',
      };
    }
  }

  /**
   * Envía documento electrónico a DIAN
   */
  async enviarDocumento(
    _xmlContent: string,
    _attachedDocument: string,
    config: DianConfig
  ): Promise<DianEnvioResponse> {
    this.configurar(config);
    this.logger.error('Transmisión DIAN bloqueada: el adaptador SOAP WS-Security/XAdES aún no está homologado.');
    return this.transporteNoHomologado();
  }

  /**
   * Consulta estado de documento en DIAN
   */
  async consultarEstado(
    _cufe: string,
    config: DianConfig
  ): Promise<DianConsultaResponse> {
    this.configurar(config);
    return {
      success: false,
      estado: 'NO_ENCONTRADO',
      descripcion: this.mensajeTransporteNoHomologado(),
    };
  }

  /**
   * Valida numeración autorizada por DIAN
   */
  async validarNumeracion(
    _prefijo: string,
    _numero: number,
    config: DianConfig
  ): Promise<{ valido: boolean; mensaje: string }> {
    this.configurar(config);
    return { valido: false, mensaje: this.mensajeTransporteNoHomologado() };
  }

  /**
   * Consulta rangos de numeración autorizados
   */
  async consultarRangosAutorizados(config: DianConfig): Promise<{
    rangos: Array<{
      prefijo: string;
      desde: number;
      hasta: number;
      resolucion: string;
      fechaInicio: Date;
      fechaFin: Date;
    }>;
  }> {
    this.configurar(config);
    this.logger.error(this.mensajeTransporteNoHomologado());
    return { rangos: [] };
  }

  /**
   * Envía evento de documento (acuse de recibo, aceptación, rechazo)
   */
  async enviarEvento(
    _cufe: string,
    _tipoEvento: 'ACUSE' | 'ACEPTACION' | 'RECHAZO',
    _motivoRechazo: string | null,
    config: DianConfig
  ): Promise<DianEnvioResponse> {
    this.configurar(config);
    return this.transporteNoHomologado();
  }

  /**
   * Genera CUFE (Código Único de Factura Electrónica)
   */
  generarCUFE(
    numeroFactura: string,
    fechaEmision: Date,
    nitEmisor: string,
    nitReceptor: string,
    total: number,
    subtotal: number,
    iva: number,
    totalConImpuestos: number,
    claveTecnica: string
  ): string {
    // Formato: NumFac + FecFac + HorFac + ValFac + CodImp1 + ValImp1 + ... + NitOFE + TipAdq + NumAdq + ClTec
    const data = [
      numeroFactura,
      fechaEmision.toISOString().split('T')[0].replace(/-/g, ''),
      fechaEmision.toISOString().split('T')[1].substring(0, 8).replace(/:/g, ''),
      total.toFixed(2),
      '01', // Código IVA
      iva.toFixed(2),
      nitEmisor,
      '31', // Tipo documento NIT
      nitReceptor,
      claveTecnica
    ].join('');

    // Calcular SHA-384
    const crypto = require('crypto');
    const hash = crypto.createHash('sha384');
    hash.update(data);
    return hash.digest('hex');
  }

  private mensajeTransporteNoHomologado(): string {
    return 'La conectividad WSDL puede verificarse, pero la transmisión requiere un adaptador SOAP WS-Security/XAdES homologado con las credenciales reales de la empresa.';
  }

  private transporteNoHomologado(): DianEnvioResponse {
    const message = this.mensajeTransporteNoHomologado();
    return {
      success: false,
      statusCode: 'DIAN_SOAP_NO_HOMOLOGADO',
      statusDescription: message,
      errors: [message],
    };
  }
}
