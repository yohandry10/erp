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

import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { getActiveCountryById } from '../paises/initial-country';
import { perfilPaisDelTenant } from './pais-del-tenant';
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

      if (emisionConfig.isDemo) {
        return {
          success: false,
          codigoRespuesta: 'DEMO_EXTERNAL_TRANSPORT_BLOCKED',
          descripcionRespuesta: 'La demo puede generar y firmar documentos, pero no transmite ni fabrica aceptación fiscal.',
        };
      }

      if (emisionConfig.modo === 'OSE_API') {
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
      const paisId = await this.obtenerPaisTenant(tenantId);
      const emisionConfig = await this.obtenerEmisionConfig(tenantId);
      if (emisionConfig.isDemo) {
        return {
          success: false,
          codigoRespuesta: 'DEMO_EXTERNAL_TRANSPORT_BLOCKED',
          descripcionRespuesta: 'La demo no consulta ni fabrica estados de aceptación fiscal.',
        };
      }
      if (emisionConfig.modo === 'OSE_API') {
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
    if (emisionConfig.modo === 'OSE_API' && !emisionConfig.isDemo) {
      return 'OSE API';
    }

    const paisId = await this.obtenerPaisTenant(tenantId);
    
    // La tabla de autoridades vivía repetida aquí, en `cpe-helper` y en
    // `pdf-format-helper`; las otras dos se habían quedado sin Argentina.
    return getActiveCountryById(paisId)?.autoridadFiscal ?? 'Servicio Fiscal';
  }

  /**
   * Obtiene el código ISO del país del tenant
   */
  async obtenerCodigoPais(tenantId: string): Promise<string> {
    return (await perfilPaisDelTenant(this.supabaseService.getClient(), tenantId)).codigo;
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

    // Sin país o sin configuración fiscal se caía a la identidad de Perú: código
    // PE, IGV, 18 % y soles, fuese cual fuese el país del contribuyente. Un
    // documento argentino habría salido con la tasa peruana sin que nadie lo
    // notara. Es el mismo fallo abierto que ya se retiró de TaxCalculatorService:
    // detenerse es peor que seguir sólo si lo que se emite es correcto, y aquí no
    // lo sería.
    if (!typedPais?.codigo_iso || !typedPais?.moneda_codigo) {
      throw new ServiceUnavailableException(
        `No se pudo resolver el país ${paisId} del contribuyente; no se emite con valores por defecto.`,
      );
    }
    // `Number(null)` es 0, así que comprobar sólo que sea finito convertiría una
    // tasa ausente en un 0 % perfectamente válido a ojos del código.
    const tasaCruda = typedConfigFiscal?.impuesto_principal_porcentaje;
    const tasa = Number(tasaCruda);
    if (
      !typedConfigFiscal?.impuesto_principal_nombre ||
      tasaCruda === null ||
      tasaCruda === undefined ||
      tasaCruda === '' ||
      !Number.isFinite(tasa) ||
      tasa <= 0
    ) {
      throw new ServiceUnavailableException(
        `Falta la configuración fiscal del país ${paisId}; no se emite con una tasa supuesta.`,
      );
    }

    return {
      paisId,
      paisCodigo: typedPais.codigo_iso,
      paisNombre: typedPais.nombre,
      servicioFiscal: await this.obtenerNombreServicioFiscal(tenantId),
      impuestoPrincipal: typedConfigFiscal.impuesto_principal_nombre,
      tasaImpuesto: tasa,
      moneda: typedPais.moneda_codigo,
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
    isDemo: boolean;
    sunatEnvironment: string;
    config?: OseApiConfig;
  }> {
    const { data, error } = await this.supabaseService.getClient()
      .from('empresa_config')
      .select([
        'emision_cpe_modo',
        'is_demo',
        'sunat_environment',
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

    if (error) {
      throw new ServiceUnavailableException(
        `No se pudo leer la configuración de emisión del tenant ${tenantId}: ${error.message}`,
      );
    }
    if (!data) {
      throw new ServiceUnavailableException(
        `No existe configuración de emisión para el tenant ${tenantId}`,
      );
    }

    const typedData = data as any;
    const modo = (typedData.emision_cpe_modo || 'SUNAT_DIRECTO').toString().toUpperCase();
    const activo = typedData.ose_activo === true;
    const isDemo = typedData.is_demo === true;
    const sunatEnvironment = String(typedData.sunat_environment || '').trim().toLowerCase();

    if (modo !== 'OSE_API') {
      return { modo, activo, isDemo, sunatEnvironment };
    }

    const authTipo = (typedData.ose_auth_tipo || 'BASIC').toString().toUpperCase() as OseAuthTipo;
    const config: OseApiConfig = {
      url: typedData.ose_url || '',
      statusUrl: typedData.ose_status_url || null,
      authTipo,
      username: typedData.ose_username || null,
      password: typedData.ose_password || null,
      apiKey: typedData.ose_api_key || null,
      apiHeader: typedData.ose_api_header || null,
      bearerToken: typedData.ose_bearer_token || null,
    };

    return { modo, activo, isDemo, sunatEnvironment, config };
  }

  // ========== MÉTODOS PRIVADOS ==========

  /**
   * Obtiene el país del tenant desde empresa_config
   * Implementa cache para optimizar performance
   */
  private async obtenerPaisTenant(tenantId: string): Promise<number> {
    if (this.paisCache.has(tenantId)) {
      return this.paisCache.get(tenantId)!;
    }

    // Antes devolvía 1 (Perú) en los tres caminos de error y lo dejaba cacheado,
    // así que un fallo momentáneo de lectura convertía al contribuyente en peruano
    // para el resto de la vida del proceso.
    const perfil = await perfilPaisDelTenant(this.supabaseService.getClient(), tenantId);
    this.paisCache.set(tenantId, perfil.id);
    return perfil.id;
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
