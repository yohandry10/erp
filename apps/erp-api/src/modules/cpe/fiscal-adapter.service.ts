/**
 * Fiscal Adapter Service
 * 
 * Servicio adaptador que detecta el país del tenant y delega
 * al servicio fiscal correcto (SUNAT para Perú, DIAN para Colombia)
 * 
 * Este servicio evita hardcodear SUNAT en el código de CPE
 * 
 * @module FiscalAdapterService
 */

import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { FiscalServiceFactory } from '../fiscal/fiscal-service.factory';
import { DocumentoElectronico, FiscalResponse } from '../../shared/integration/fiscal.interfaces';
import { OseApiFiscalService, OseApiConfig, OseAuthTipo } from '../fiscal/ose-api-fiscal.service';
import { OseService } from '../ose/ose.service';

export interface EnvioDocumentoResult {
  success: boolean;
  codigoRespuesta: string;
  descripcionRespuesta: string;
  cdr?: string;
  hash?: string;
  numeroComprobante?: string;
  metadata?: any;
}

@Injectable()
export class FiscalAdapterService {
  private readonly logger = new Logger(FiscalAdapterService.name);
  private readonly paisCache = new Map<string, number>(); // Cache de país por tenant

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly fiscalServiceFactory: FiscalServiceFactory,
    private readonly oseApiService: OseApiFiscalService,
    private readonly oseService: OseService,
  ) {}

  /**
   * Envía un documento electrónico al servicio fiscal correcto según el país del tenant
   */
  async enviarDocumento(
    documento: DocumentoElectronico,
    tenantId: string
  ): Promise<EnvioDocumentoResult> {
    try {
      // 1. Obtener país del tenant
      const paisId = await this.obtenerPaisTenant(tenantId);
      const emisionConfig = await this.obtenerEmisionConfig(tenantId);

      if (emisionConfig?.modo === 'OSE_API') {
        this.logger.log(`🌍 Enviando documento via OSE API para tenant ${tenantId}`);

        if (!emisionConfig.activo) {
          return {
            success: false,
            codigoRespuesta: 'OSE_DISABLED',
            descripcionRespuesta: 'OSE API no esta activada en la configuracion del tenant',
          };
        }

        if (!emisionConfig.config?.url) {
          return {
            success: false,
            codigoRespuesta: 'OSE_MISSING_URL',
            descripcionRespuesta: 'URL de OSE API no configurada',
          };
        }

        const oseResponse = await this.oseApiService.enviarDocumento(documento, emisionConfig.config);
        return this.mapFiscalResponse(oseResponse);
      }
      
      // 2. Obtener servicio fiscal correcto
      const fiscalService = this.fiscalServiceFactory.getServiceByPaisId(paisId);
      
      // 3. Log del país detectado
      const paisNombre = paisId === 1
        ? 'Perú (SUNAT)'
        : paisId === 2
          ? 'Colombia (DIAN)'
          : paisId === 5
            ? 'Argentina (ARCA)'
            : `País ${paisId}`;
      this.logger.log(`🌍 Enviando documento a ${paisNombre} para tenant ${tenantId}`);

      if (paisId === 1) {
        if (!documento.xmlContent) {
          return {
            success: false,
            codigoRespuesta: 'SUNAT_MISSING_XML',
            descripcionRespuesta: 'SUNAT directo requiere XML UBL generado para el documento',
          };
        }

        const fileName = this.buildSunatFileName(documento);
        const sunatResponse = await this.oseService.enviarCpe(documento.xmlContent, fileName, { tenantId });
        return {
          success: sunatResponse.success,
          codigoRespuesta: sunatResponse.codigoRespuesta,
          descripcionRespuesta: sunatResponse.descripcionRespuesta,
          cdr: sunatResponse.cdr,
          hash: sunatResponse.hashCPE,
          numeroComprobante: sunatResponse.numeroComprobante || fileName,
          metadata: {
            observaciones: sunatResponse.observaciones,
          },
        };
      }
      
      // 4. Enviar documento
      const response: FiscalResponse = await fiscalService.enviarDocumento(documento);
      
      // 5. Mapear respuesta a formato común
      return this.mapFiscalResponse(response);
    } catch (error) {
      this.logger.error(`❌ Error enviando documento:`, error);
      return {
        success: false,
        codigoRespuesta: '99',
        descripcionRespuesta: `Error técnico: ${error.message}`
      };
    }
  }

  /**
   * Consulta el estado de un documento en el servicio fiscal
   */
  async consultarEstado(
    tenantId: string,
    tipoDocumento: string,
    serie: string,
    numero: string,
    hash?: string
  ): Promise<EnvioDocumentoResult> {
    try {
      const emisionConfig = await this.obtenerEmisionConfig(tenantId);
      if (emisionConfig?.modo === 'OSE_API') {
        if (!emisionConfig.activo) {
          return {
            success: false,
            codigoRespuesta: 'OSE_DISABLED',
            descripcionRespuesta: 'OSE API no esta activada en la configuracion del tenant',
          };
        }

        if (!emisionConfig.config?.url) {
          return {
            success: false,
            codigoRespuesta: 'OSE_MISSING_URL',
            descripcionRespuesta: 'URL de OSE API no configurada',
          };
        }

        const oseResponse = await this.oseApiService.consultarEstado({
          empresaId: '',
          tipoDocumento,
          serie,
          numero,
          hash
        }, emisionConfig.config);

        return this.mapFiscalResponse(oseResponse);
      }

      const paisId = await this.obtenerPaisTenant(tenantId);
      if (paisId === 1) {
        const ruc = await this.obtenerRucTenant(tenantId);
        const sunatResponse = await this.oseService.consultarEstadoCpe(
          ruc,
          tipoDocumento,
          serie,
          numero,
          { tenantId },
        );
        return {
          success: sunatResponse.success,
          codigoRespuesta: sunatResponse.codigoRespuesta,
          descripcionRespuesta: sunatResponse.descripcionRespuesta,
          cdr: sunatResponse.cdr,
          hash: sunatResponse.hashCPE,
          numeroComprobante: `${ruc}-${tipoDocumento}-${serie}-${numero}`,
          metadata: {
            observaciones: sunatResponse.observaciones,
          },
        };
      }

      const fiscalService = this.fiscalServiceFactory.getServiceByPaisId(paisId);
      
      const response = await fiscalService.consultarEstado({
        empresaId: '', // Se obtiene del servicio
        tipoDocumento,
        serie,
        numero,
        hash
      });
      
      return this.mapFiscalResponse(response);
    } catch (error) {
      this.logger.error(`❌ Error consultando estado:`, error);
      return {
        success: false,
        codigoRespuesta: '99',
        descripcionRespuesta: `Error: ${error.message}`
      };
    }
  }

  /**
   * Obtiene el nombre del servicio fiscal según el país
   */
  async obtenerNombreServicioFiscal(tenantId: string): Promise<string> {
    const emisionConfig = await this.obtenerEmisionConfig(tenantId);
    if (emisionConfig?.modo === 'OSE_API') {
      return 'OSE API';
    }

    const paisId = await this.obtenerPaisTenant(tenantId);
    
    switch (paisId) {
      case 1:
        return 'SUNAT';
      case 2:
        return 'DIAN';
      case 3:
        return 'SII'; // Chile
      case 4:
        return 'SAT'; // México
      case 5:
        return 'ARCA';
      default:
        return 'Servicio Fiscal';
    }
  }

  /**
   * Obtiene el código ISO del país del tenant
   */
  async obtenerCodigoPais(tenantId: string): Promise<string> {
    const paisId = await this.obtenerPaisTenant(tenantId);
    
    const { data } = await this.supabaseService.getClient()
      .from('paises')
      .select('codigo_iso')
      .eq('id', paisId)
      .single();

    const typedData = data as any;
    return typedData?.codigo_iso || 'PE';
  }

  /**
   * Verifica si el tenant requiere GRE (solo Perú)
   */
  async requiereGRE(tenantId: string): Promise<boolean> {
    const paisId = await this.obtenerPaisTenant(tenantId);
    return paisId === 1; // Solo Perú requiere GRE
  }

  /**
   * Obtiene configuración fiscal del tenant
   */
  async obtenerConfiguracionFiscal(tenantId: string): Promise<{
    paisId: number;
    paisCodigo: string;
    paisNombre: string;
    servicioFiscal: string;
    impuestoPrincipal: string;
    tasaImpuesto: number;
    moneda: string;
    requiereGRE: boolean;
  }> {
    const paisId = await this.obtenerPaisTenant(tenantId);
    
    const { data: pais } = await this.supabaseService.getClient()
      .from('paises')
      .select(`
        id,
        codigo_iso,
        nombre,
        moneda_codigo
      `)
      .eq('id', paisId)
      .single();

    const { data: configFiscal } = await this.supabaseService.getClient()
      .from('configuracion_fiscal')
      .select('impuesto_principal_nombre, impuesto_principal_porcentaje')
      .eq('pais_id', paisId)
      .single();

    const typedPais = pais as any;
    const typedConfigFiscal = configFiscal as any;
    return {
      paisId,
      paisCodigo: typedPais?.codigo_iso || 'PE',
      paisNombre: typedPais?.nombre || 'Perú',
      servicioFiscal: await this.obtenerNombreServicioFiscal(tenantId),
      impuestoPrincipal: typedConfigFiscal?.impuesto_principal_nombre || 'IGV',
      tasaImpuesto: typedConfigFiscal?.impuesto_principal_porcentaje || 0.18,
      moneda: typedPais?.moneda_codigo || 'PEN',
      requiereGRE: paisId === 1
    };
  }

  private mapFiscalResponse(response: FiscalResponse): EnvioDocumentoResult {
    return {
      success: response.success,
      codigoRespuesta: response.codigoRespuesta,
      descripcionRespuesta: response.descripcionRespuesta,
      cdr: response.cdr,
      hash: response.hash,
      numeroComprobante: response.numeroComprobante,
      metadata: response.metadata
    };
  }

  private buildSunatFileName(documento: DocumentoElectronico): string {
    return [
      documento.emisor.numeroDocumento,
      documento.tipoDocumento,
      documento.serie,
      documento.numero,
    ]
      .map((part) => String(part || '').trim())
      .join('-');
  }

  private async obtenerEmisionConfig(tenantId: string): Promise<{
    modo: string;
    activo: boolean;
    config?: OseApiConfig;
  } | null> {
    try {
      const { data, error } = await this.supabaseService.getClient()
        .from('empresa_config')
        .select([
          'emision_cpe_modo',
          'ose_activo',
          'ose_url',
          'ose_status_url',
          'ose_username',
          'ose_password',
          'ose_auth_tipo',
          'ose_api_key',
          'ose_api_header',
          'ose_bearer_token'
        ].join(','))
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        this.logger.warn(`Error leyendo configuracion de emision: ${error.message}`);
      }

      const typedData = data as any;
      const modo = (typedData?.emision_cpe_modo || 'SUNAT_DIRECTO').toString().toUpperCase();
      const activo = typedData?.ose_activo === true;

      if (modo !== 'OSE_API') {
        return { modo, activo };
      }

      const authTipo = (typedData?.ose_auth_tipo || 'BASIC').toString().toUpperCase() as OseAuthTipo;
      const config: OseApiConfig = {
        url: typedData?.ose_url || '',
        statusUrl: typedData?.ose_status_url || null,
        authTipo,
        username: typedData?.ose_username || null,
        password: typedData?.ose_password || null,
        apiKey: typedData?.ose_api_key || null,
        apiHeader: typedData?.ose_api_header || null,
        bearerToken: typedData?.ose_bearer_token || null,
      };

      return { modo, activo, config };
    } catch (error) {
      this.logger.warn(`No se pudo resolver modo de emision: ${error.message}`);
      return null;
    }
  }

  // ========== MÉTODOS PRIVADOS ==========

  /**
   * Obtiene el país del tenant desde empresa_config
   * Implementa cache para optimizar performance
   */
  private async obtenerPaisTenant(tenantId: string): Promise<number> {
    // Verificar cache
    if (this.paisCache.has(tenantId)) {
      return this.paisCache.get(tenantId)!;
    }

    try {
      const { data, error } = await this.supabaseService.getClient()
        .from('empresa_config')
        .select('pais_id')
        .eq('tenant_id', tenantId)
        .single();

      const typedPaisData = data as any;
      if (error || !typedPaisData) {
        this.logger.warn(`⚠️ No se encontró país para tenant ${tenantId}, usando Perú por defecto`);
        return 1; // Default: Perú
      }

      const paisId = typedPaisData.pais_id || 1;
      
      // Guardar en cache
      this.paisCache.set(tenantId, paisId);
      
      return paisId;
    } catch (error) {
      this.logger.error(`❌ Error obteniendo país del tenant:`, error);
      return 1; // Default: Perú
    }
  }

  private async obtenerRucTenant(tenantId: string): Promise<string> {
    const { data, error } = await this.supabaseService.getClient()
      .from('empresa_config')
      .select('ruc')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      throw new Error(`No se pudo obtener RUC del tenant ${tenantId}: ${error.message}`);
    }

    const ruc = (data as any)?.ruc;
    if (!ruc) {
      throw new Error(`RUC no configurado para tenant ${tenantId}`);
    }

    return String(ruc);
  }

  /**
   * Limpia el cache de país para un tenant
   * Útil cuando se actualiza la configuración del tenant
   */
  limpiarCachePais(tenantId: string): void {
    this.paisCache.delete(tenantId);
    this.logger.log(`🗑️ Cache de país limpiado para tenant ${tenantId}`);
  }

  /**
   * Limpia todo el cache
   */
  limpiarTodoCache(): void {
    this.paisCache.clear();
    this.logger.log(`🗑️ Cache de países limpiado completamente`);
  }
}
