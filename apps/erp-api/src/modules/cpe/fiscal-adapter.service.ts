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
    private readonly fiscalServiceFactory: FiscalServiceFactory
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
      
      // 2. Obtener servicio fiscal correcto
      const fiscalService = this.fiscalServiceFactory.getServiceByPaisId(paisId);
      
      // 3. Log del país detectado
      const paisNombre = paisId === 1 ? 'Perú (SUNAT)' : paisId === 2 ? 'Colombia (DIAN)' : `País ${paisId}`;
      this.logger.log(`🌍 Enviando documento a ${paisNombre} para tenant ${tenantId}`);
      
      // 4. Enviar documento
      const response: FiscalResponse = await fiscalService.enviarDocumento(documento);
      
      // 5. Mapear respuesta a formato común
      return {
        success: response.success,
        codigoRespuesta: response.codigoRespuesta,
        descripcionRespuesta: response.descripcionRespuesta,
        cdr: response.cdr,
        hash: response.hash,
        numeroComprobante: response.numeroComprobante,
        metadata: response.metadata
      };
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
      const paisId = await this.obtenerPaisTenant(tenantId);
      const fiscalService = this.fiscalServiceFactory.getServiceByPaisId(paisId);
      
      const response = await fiscalService.consultarEstado({
        empresaId: '', // Se obtiene del servicio
        tipoDocumento,
        serie,
        numero,
        hash
      });
      
      return {
        success: response.success,
        codigoRespuesta: response.codigoRespuesta,
        descripcionRespuesta: response.descripcionRespuesta,
        metadata: response.metadata
      };
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
    
    return data?.codigo_iso || 'PE';
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
    
    return {
      paisId,
      paisCodigo: pais?.codigo_iso || 'PE',
      paisNombre: pais?.nombre || 'Perú',
      servicioFiscal: await this.obtenerNombreServicioFiscal(tenantId),
      impuestoPrincipal: configFiscal?.impuesto_principal_nombre || 'IGV',
      tasaImpuesto: configFiscal?.impuesto_principal_porcentaje || 0.18,
      moneda: pais?.moneda_codigo || 'PEN',
      requiereGRE: paisId === 1
    };
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

      if (error || !data) {
        this.logger.warn(`⚠️ No se encontró país para tenant ${tenantId}, usando Perú por defecto`);
        return 1; // Default: Perú
      }

      const paisId = data.pais_id || 1;
      
      // Guardar en cache
      this.paisCache.set(tenantId, paisId);
      
      return paisId;
    } catch (error) {
      this.logger.error(`❌ Error obteniendo país del tenant:`, error);
      return 1; // Default: Perú
    }
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
