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
import * as FormData from 'form-data';

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
   * Envía documento electrónico a DIAN
   */
  async enviarDocumento(
    xmlContent: string,
    attachedDocument: string,
    config: DianConfig
  ): Promise<DianEnvioResponse> {
    try {
      this.logger.log(`📤 Enviando documento a DIAN...`);

      // Preparar payload según especificaciones DIAN
      const payload = {
        NIT: config.nit,
        InvoiceAuthorization: {
          Prefix: '',
          From: '',
          To: '',
          AuthorizationNumber: '',
          StartDate: new Date().toISOString(),
          EndDate: new Date().toISOString()
        },
        Invoice: {
          UBLVersionID: '2.1',
          CustomizationID: '10',
          ProfileID: 'DIAN 2.1',
          ID: '',
          IssueDate: new Date().toISOString().split('T')[0],
          InvoiceTypeCode: '01'
        },
        ApplicationResponse: attachedDocument,
        ContentFile: Buffer.from(xmlContent).toString('base64')
      };

      const response = await this.axiosInstance.post('/SendBillSync', payload);

      if (response.data.IsValid) {
        this.logger.log(`✅ Documento aceptado por DIAN`);
        return {
          success: true,
          statusCode: response.data.StatusCode || '00',
          statusDescription: response.data.StatusDescription || 'Aceptado',
          cufe: response.data.CUFE,
          qrCode: response.data.QRCode,
          xmlResponse: response.data.XmlBase64Bytes
        };
      } else {
        this.logger.warn(`⚠️ Documento rechazado por DIAN`);
        return {
          success: false,
          statusCode: response.data.StatusCode || '99',
          statusDescription: response.data.StatusDescription || 'Rechazado',
          errors: response.data.ErrorMessage ? [response.data.ErrorMessage] : []
        };
      }
    } catch (error) {
      this.logger.error(`❌ Error enviando documento a DIAN:`, error);
      
      if (axios.isAxiosError(error)) {
        return {
          success: false,
          statusCode: '99',
          statusDescription: `Error de comunicación: ${error.message}`,
          errors: [error.response?.data?.message || error.message]
        };
      }

      return {
        success: false,
        statusCode: '99',
        statusDescription: `Error técnico: ${error.message}`,
        errors: [error.message]
      };
    }
  }

  /**
   * Consulta estado de documento en DIAN
   */
  async consultarEstado(
    cufe: string,
    config: DianConfig
  ): Promise<DianConsultaResponse> {
    try {
      this.logger.log(`🔍 Consultando estado en DIAN: ${cufe}`);

      const payload = {
        NIT: config.nit,
        CUFE: cufe
      };

      const response = await this.axiosInstance.post('/GetStatus', payload);

      if (response.data.IsValid) {
        return {
          success: true,
          estado: this.mapearEstado(response.data.StatusCode),
          descripcion: response.data.StatusDescription,
          cufe: response.data.CUFE,
          fechaProcesamiento: response.data.ProcessDate ? new Date(response.data.ProcessDate) : undefined
        };
      } else {
        return {
          success: false,
          estado: 'NO_ENCONTRADO',
          descripcion: response.data.StatusDescription || 'Documento no encontrado'
        };
      }
    } catch (error) {
      this.logger.error(`❌ Error consultando estado en DIAN:`, error);
      return {
        success: false,
        estado: 'NO_ENCONTRADO',
        descripcion: `Error: ${error.message}`
      };
    }
  }

  /**
   * Valida numeración autorizada por DIAN
   */
  async validarNumeracion(
    prefijo: string,
    numero: number,
    config: DianConfig
  ): Promise<{ valido: boolean; mensaje: string }> {
    try {
      this.logger.log(`🔢 Validando numeración: ${prefijo}-${numero}`);

      const payload = {
        NIT: config.nit,
        Prefix: prefijo,
        Number: numero
      };

      const response = await this.axiosInstance.post('/ValidateNumbering', payload);

      return {
        valido: response.data.IsValid,
        mensaje: response.data.Message || 'Numeración válida'
      };
    } catch (error) {
      this.logger.error(`❌ Error validando numeración:`, error);
      return {
        valido: false,
        mensaje: `Error: ${error.message}`
      };
    }
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
    try {
      this.logger.log(`📋 Consultando rangos autorizados`);

      const payload = {
        NIT: config.nit
      };

      const response = await this.axiosInstance.post('/GetNumberingRanges', payload);

      const rangos = (response.data.Ranges || []).map((rango: any) => ({
        prefijo: rango.Prefix,
        desde: rango.From,
        hasta: rango.To,
        resolucion: rango.Resolution,
        fechaInicio: new Date(rango.StartDate),
        fechaFin: new Date(rango.EndDate)
      }));

      this.logger.log(`✅ ${rangos.length} rangos encontrados`);
      return { rangos };
    } catch (error) {
      this.logger.error(`❌ Error consultando rangos:`, error);
      return { rangos: [] };
    }
  }

  /**
   * Envía evento de documento (acuse de recibo, aceptación, rechazo)
   */
  async enviarEvento(
    cufe: string,
    tipoEvento: 'ACUSE' | 'ACEPTACION' | 'RECHAZO',
    motivoRechazo: string | null,
    config: DianConfig
  ): Promise<DianEnvioResponse> {
    try {
      this.logger.log(`📨 Enviando evento ${tipoEvento} para CUFE: ${cufe}`);

      const payload = {
        NIT: config.nit,
        CUFE: cufe,
        EventType: tipoEvento,
        RejectReason: motivoRechazo,
        EventDate: new Date().toISOString()
      };

      const response = await this.axiosInstance.post('/SendEvent', payload);

      return {
        success: response.data.IsValid,
        statusCode: response.data.StatusCode || '00',
        statusDescription: response.data.StatusDescription || 'Evento enviado',
        errors: response.data.ErrorMessage ? [response.data.ErrorMessage] : []
      };
    } catch (error) {
      this.logger.error(`❌ Error enviando evento:`, error);
      return {
        success: false,
        statusCode: '99',
        statusDescription: `Error: ${error.message}`,
        errors: [error.message]
      };
    }
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

  // ========== MÉTODOS PRIVADOS ==========

  private mapearEstado(statusCode: string): 'ACEPTADO' | 'RECHAZADO' | 'PENDIENTE' | 'NO_ENCONTRADO' {
    switch (statusCode) {
      case '00':
      case '0':
        return 'ACEPTADO';
      case '01':
      case '02':
        return 'RECHAZADO';
      case '99':
        return 'PENDIENTE';
      default:
        return 'NO_ENCONTRADO';
    }
  }
}
