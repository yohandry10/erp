import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { ValidationService } from '../validations/validation.service';
import {
  ConfigurationStatus,
  GREThresholds,
  WizardProgress,
  SaveWizardStepDto,
  UpdateEmpresaConfigDto,
  UpdateGREThresholdsDto,
  ValidateWizardCertificateDto,
  WizardCertificateValidationResult,
} from './configuration.types';
import { parseCertificateBuffer, toPostgresBytea } from '../../shared/utils/certificate.utils';
import { verificarTitularidadCertificado } from '../../shared/utils/certificado-ruc-peru.util';
import { createHash } from 'crypto';
import { decryptBuffer, decryptText, encryptBuffer, encryptText } from '../../shared/utils/secure-config.utils';
import {
  INITIAL_ACTIVE_COUNTRY_CODE,
  INITIAL_ACTIVE_COUNTRY_MESSAGE,
  getActiveCountryByCode,
  getActiveCountryById,
  isInitialActiveCountryCode,
  isInitialActiveCountryId,
  validateArgentinaCuit,
  validateColombiaNit,
} from '../paises/initial-country';

export const TOTAL_WIZARD_STEPS = 7;

@Injectable()
export class ConfigurationService {
  private readonly logger = new Logger(ConfigurationService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly validationService: ValidationService,
    private readonly configService: ConfigService,
  ) {}

  private requireAtomicContext(actorId?: string, idempotencyKey?: string): {
    actorId: string;
    idempotencyKey: string;
  } {
    const actor = String(actorId || '').trim();
    const key = String(idempotencyKey || '').trim();
    if (!actor) {
      throw new BadRequestException('No se pudo identificar al actor de la operación');
    }
    if (key.length < 8 || key.length > 255) {
      throw new BadRequestException(
        'Idempotency-Key es obligatorio y debe tener entre 8 y 255 caracteres',
      );
    }
    return { actorId: actor, idempotencyKey: key };
  }

  private mapWizardProgress(row: any): WizardProgress {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      pasoActual: row.paso_actual,
      pasosCompletados: row.pasos_completados || [],
      configuracionTemporal: row.configuracion_temporal,
      completado: row.completado,
      completadoAt: row.completado_at ? new Date(row.completado_at) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private sanitizeWizardTemporaryConfig(
    input: Record<string, unknown> | undefined,
  ): Record<string, unknown> {
    const sanitized = { ...(input || {}) };
    const secretOrBinaryKeys = [
      'certificateBase64',
      'certificatePassword',
      'certificateFile',
      'certificado_pfx',
      'certificado_password',
      'logoBase64',
      'logoFile',
      'sunat_password',
      'sunat_gre_client_secret',
      'ose_password',
      'ose_api_key',
      'ose_bearer_token',
      'dian_password',
      'dian_software_pin',
    ];
    for (const key of secretOrBinaryKeys) delete sanitized[key];
    return sanitized;
  }

  private configurationIntentFingerprint(input: unknown): string {
    const canonicalize = (value: any): any => {
      if (value === undefined) return null;
      if (value === null || typeof value !== 'object') return value;
      if (Buffer.isBuffer(value)) return value.toString('base64');
      if (value instanceof Date) return value.toISOString();
      if (Array.isArray(value)) return value.map(canonicalize);
      return Object.keys(value)
        .filter((key) => key !== 'certificateFile' && key !== 'logoFile')
        .sort()
        .reduce<Record<string, unknown>>((result, key) => {
          result[key] = canonicalize(value[key]);
          return result;
        }, {});
    };
    return createHash('sha256')
      .update(JSON.stringify(canonicalize(input)))
      .digest('hex');
  }

  async updateEmpresaPatchAtomic(
    tenantId: string,
    patch: Record<string, unknown>,
    actorId?: string,
    idempotencyKey?: string,
    operation: 'EMPRESA' | 'PARAMETROS' | 'GRE' | 'TENANT_UPDATE' = 'EMPRESA',
  ): Promise<any> {
    const atomic = this.requireAtomicContext(actorId, idempotencyKey);
    const { data, error } = await this.supabaseService.getClient().rpc(
      'actualizar_empresa_config_tx',
      {
        p_tenant_id: tenantId,
        p_actor_id: atomic.actorId,
        p_idempotency_key: atomic.idempotencyKey,
        p_operation: operation,
        p_patch: patch,
      },
    );
    if (error) throw error;
    return (data as any)?.configuracion;
  }

  async updateDocumentSeriesAtomic(
    tenantId: string,
    actorId: string | undefined,
    idempotencyKey: string | undefined,
    input: {
      tipoDocumento: string;
      serie: string;
      correlativoMaximo?: number;
      activo?: boolean;
    },
  ): Promise<any> {
    const atomic = this.requireAtomicContext(actorId, idempotencyKey);
    const { data, error } = await this.supabaseService.getClient().rpc(
      'actualizar_serie_documento_tx',
      {
        p_tenant_id: tenantId,
        p_actor_id: atomic.actorId,
        p_idempotency_key: atomic.idempotencyKey,
        p_tipo_documento: input.tipoDocumento,
        p_serie: input.serie,
        p_correlativo_maximo: input.correlativoMaximo ?? 99999999,
        p_activo: input.activo !== false,
      },
    );
    if (error) throw error;
    return (data as any)?.serie;
  }

  /**
   * Get configuration status for a tenant
   */
  async getConfigurationStatus(tenantId: string): Promise<ConfigurationStatus> {
    try {
      this.logger.log(`Getting configuration status for tenant: ${tenantId}`);

      // Las 3 fuentes de datos son independientes (Supabase remoto = ~1s por
      // roundtrip). Antes corrían secuenciales y sumaban ~3.3s. Con Promise.all
      // el endpoint se acota al tiempo del query más lento (~1.1s).
      const [certificateValidation, rucValidation, empresaConfigResult] = await Promise.all([
        this.validationService.validateCertificate(tenantId),
        this.validationService.validateRucConfiguration(tenantId),
        this.supabaseService
          .getClient()
          .from('empresa_config')
          .select([
            'pais',
            'is_demo',
            'emision_cpe_modo',
            'gre_obligatorio',
            'gre_automatico_habilitado',
            'sunat_environment',
            'sunat_username',
            'sunat_password',
            'sunat_gre_transport',
            'sunat_gre_client_id',
            'sunat_gre_client_secret',
            'sire_activo',
            'ose_activo',
            'ose_url',
            'ose_status_url',
            'ose_username',
            'ose_password',
            'ose_auth_tipo',
            'ose_api_key',
            'ose_api_header',
            'ose_bearer_token',
            'dian_activo',
            'dian_url',
            'dian_usuario',
            'dian_password',
            'dian_software_id',
            'dian_software_pin',
            'dian_test_set_id',
            'dian_environment',
            'dian_regimen_fiscal',
            'dian_tipo_contribuyente',
            'dian_resolucion_numero',
            'dian_resolucion_prefijo',
            'dian_resolucion_desde',
            'dian_resolucion_hasta',
            'dian_resolucion_fecha_inicio',
            'dian_resolucion_fecha_fin',
            'arca_activo',
            'arca_environment',
            'arca_wsaa_url',
            'arca_wsfe_url',
            'arca_cuit_representada',
            'arca_punto_venta',
            'arca_condicion_iva',
            'ingresos_brutos',
            'fecha_inicio_actividades',
            'provincia_fiscal',
          ].join(','))
          .eq('tenant_id', tenantId)
          .maybeSingle(),
      ]);

      const { data: empresaConfig, error: empresaConfigError } = empresaConfigResult;

      if (empresaConfigError && empresaConfigError.code !== 'PGRST116') {
        this.logger.warn(
          `No se pudo leer empresa_config para OSE (tenant ${tenantId}): ${empresaConfigError.message}`,
        );
      }

      const typedEmpresaConfig = empresaConfig as any;
      const isDemo = typedEmpresaConfig?.is_demo === true;

      // La preparación base del ERP y la habilitación fiscal son dos fronteras
      // distintas. El cliente puede operar el ERP sin certificado; la emisión
      // electrónica seguirá fail-closed hasta que aporte su propia configuración.
      const coreMissingItems: string[] = [];
      const fiscalMissingItems: string[] = [];
      const addCoreMissingItem = (item: string) => {
        if (!coreMissingItems.includes(item)) coreMissingItems.push(item);
      };
      const addFiscalMissingItem = (item: string) => {
        if (!fiscalMissingItems.includes(item)) fiscalMissingItems.push(item);
      };

      const certificateExists =
        certificateValidation.errors.length === 0 ||
        !certificateValidation.errors.some((error) =>
          error.includes('No se ha cargado') ||
          error.includes('No se encontró configuración de certificado'),
        );

      if (!certificateValidation.isValid && !isDemo) {
        addFiscalMissingItem('Certificado digital del cliente');
      }

      if (rucValidation.missingFields.length > 0) {
        rucValidation.missingFields.forEach(addCoreMissingItem);
      } else if (!rucValidation.isValid && !isDemo) {
        addCoreMissingItem('Documento fiscal válido');
      }

      const rawPaisCodigo = (typedEmpresaConfig?.pais || INITIAL_ACTIVE_COUNTRY_CODE).toString().toUpperCase();
      if (!isInitialActiveCountryCode(rawPaisCodigo)) {
        addCoreMissingItem(INITIAL_ACTIVE_COUNTRY_MESSAGE);
      }
      const paisCodigo = isInitialActiveCountryCode(rawPaisCodigo)
        ? rawPaisCodigo
        : INITIAL_ACTIVE_COUNTRY_CODE;
      const emisionModo = (typedEmpresaConfig?.emision_cpe_modo || 'SUNAT_DIRECTO').toString().toUpperCase();
      const oseAuthTipo = (typedEmpresaConfig?.ose_auth_tipo || 'BASIC').toString().toUpperCase();
      const oseActivo = typedEmpresaConfig?.ose_activo === true;
      const requiereOse = emisionModo === 'OSE_API';
      const dianEnvironment = (typedEmpresaConfig?.dian_environment || 'HOMOLOGACION').toString().toUpperCase();
      const dianActivo = typedEmpresaConfig?.dian_activo === true;
      const requiereDian = paisCodigo === 'CO' && !isDemo;
      const requiereSunatDirecto = paisCodigo === 'PE' && emisionModo === 'SUNAT_DIRECTO';
      const requiereArca = paisCodigo === 'AR' && !isDemo;
      const sunatGreTransport = (typedEmpresaConfig?.sunat_gre_transport || 'soap').toString().toLowerCase();
      const sireActivo = paisCodigo === 'PE' && typedEmpresaConfig?.sire_activo === true && !isDemo;

      if (requiereOse) {
        if (!oseActivo) {
          addFiscalMissingItem('Activar OSE API');
        }
        if (!typedEmpresaConfig?.ose_url) {
          addFiscalMissingItem('URL de OSE');
        }

        if (oseAuthTipo === 'BASIC') {
          if (!typedEmpresaConfig?.ose_username) addFiscalMissingItem('Usuario OSE');
          if (!typedEmpresaConfig?.ose_password) addFiscalMissingItem('Password OSE');
        } else if (oseAuthTipo === 'BEARER') {
          if (!typedEmpresaConfig?.ose_bearer_token) addFiscalMissingItem('Bearer token OSE');
        } else if (oseAuthTipo === 'API_KEY') {
          if (!typedEmpresaConfig?.ose_api_key) addFiscalMissingItem('API key OSE');
          if (!typedEmpresaConfig?.ose_api_header) addFiscalMissingItem('Header API key OSE');
        }
      }

      if (requiereSunatDirecto) {
        if (!typedEmpresaConfig?.sunat_username) addFiscalMissingItem('Usuario SOL secundario');
        if (!typedEmpresaConfig?.sunat_password) addFiscalMissingItem('Clave SOL secundaria');
        if (sunatGreTransport === 'rest') {
          if (!typedEmpresaConfig?.sunat_gre_client_id) addFiscalMissingItem('Client ID API SUNAT');
          if (!typedEmpresaConfig?.sunat_gre_client_secret) addFiscalMissingItem('Client secret API SUNAT');
        }
      }

      if (sireActivo) {
        if (!typedEmpresaConfig?.sunat_username) addFiscalMissingItem('Usuario SOL secundario');
        if (!typedEmpresaConfig?.sunat_password) addFiscalMissingItem('Clave SOL secundaria');
        if (!typedEmpresaConfig?.sunat_gre_client_id) addFiscalMissingItem('Client ID API SUNAT');
        if (!typedEmpresaConfig?.sunat_gre_client_secret) addFiscalMissingItem('Client secret API SUNAT');
      }

      if (requiereArca) {
        if (!typedEmpresaConfig?.arca_activo) addFiscalMissingItem('Activar ARCA WSFE');
        if (!typedEmpresaConfig?.arca_wsaa_url) addFiscalMissingItem('URL WSAA');
        if (!typedEmpresaConfig?.arca_wsfe_url) addFiscalMissingItem('URL WSFEv1');
        if (!typedEmpresaConfig?.arca_cuit_representada) addFiscalMissingItem('CUIT representada');
        if (!typedEmpresaConfig?.arca_punto_venta) addFiscalMissingItem('Punto de venta ARCA');
        if (!typedEmpresaConfig?.arca_condicion_iva) addFiscalMissingItem('Condición frente al IVA');
        if (!typedEmpresaConfig?.ingresos_brutos) addFiscalMissingItem('Inscripción en Ingresos Brutos');
        if (!typedEmpresaConfig?.fecha_inicio_actividades) addFiscalMissingItem('Fecha de inicio de actividades');
        if (!typedEmpresaConfig?.provincia_fiscal) addFiscalMissingItem('Jurisdicción fiscal');
      }

      if (requiereDian) {
        if (!dianActivo) addFiscalMissingItem('Activar DIAN');
        if (!typedEmpresaConfig?.dian_url) addFiscalMissingItem('URL DIAN');
        if (!typedEmpresaConfig?.dian_usuario) addFiscalMissingItem('Usuario DIAN');
        if (!typedEmpresaConfig?.dian_password) addFiscalMissingItem('Password DIAN');
        if (!typedEmpresaConfig?.dian_software_id) addFiscalMissingItem('Software ID DIAN');
        if (!typedEmpresaConfig?.dian_software_pin) addFiscalMissingItem('Software PIN DIAN');
        if (!typedEmpresaConfig?.dian_regimen_fiscal) addFiscalMissingItem('Régimen fiscal DIAN');
        if (!typedEmpresaConfig?.dian_tipo_contribuyente) addFiscalMissingItem('Tipo contribuyente DIAN');
        if (dianEnvironment === 'HOMOLOGACION' && !typedEmpresaConfig?.dian_test_set_id) {
          addFiscalMissingItem('Test Set ID DIAN');
        }
        if (!typedEmpresaConfig?.dian_resolucion_numero) addFiscalMissingItem('Resolución DIAN');
        if (!typedEmpresaConfig?.dian_resolucion_prefijo) addFiscalMissingItem('Prefijo DIAN');
        if (typedEmpresaConfig?.dian_resolucion_desde == null) addFiscalMissingItem('Rango inicio DIAN');
        if (typedEmpresaConfig?.dian_resolucion_hasta == null) addFiscalMissingItem('Rango fin DIAN');
        if (!typedEmpresaConfig?.dian_resolucion_fecha_inicio) addFiscalMissingItem('Vigencia inicio DIAN');
        if (!typedEmpresaConfig?.dian_resolucion_fecha_fin) addFiscalMissingItem('Vigencia fin DIAN');
      }

      const effectiveCoreMissingItems = isDemo ? [] : coreMissingItems;
      const baseRequirements = 3; // Documento fiscal, razón social y dirección.
      const completedRequirements = Math.max(
        baseRequirements - Math.min(effectiveCoreMissingItems.length, baseRequirements),
        0,
      );
      const completionPercentage = isDemo
        ? 100
        : Math.round((completedRequirements / baseRequirements) * 100);
      const certificateReady = isDemo || certificateValidation.isValid;
      const isComplete = isDemo || (
        effectiveCoreMissingItems.length === 0 && rucValidation.isValid
      );
      const fiscalEnabled = !isDemo && Boolean(
        certificateExists ||
        oseActivo ||
        sireActivo ||
        dianActivo ||
        typedEmpresaConfig?.arca_activo === true ||
        typedEmpresaConfig?.sunat_username ||
        typedEmpresaConfig?.sunat_password ||
        typedEmpresaConfig?.sunat_gre_client_id ||
        typedEmpresaConfig?.sunat_gre_client_secret,
      );

      const status: ConfigurationStatus = {
        isComplete,
        isDemo,
        completionPercentage,
        missingItems: effectiveCoreMissingItems,
        certificate: {
          exists: certificateExists,
          isValid: certificateReady,
          expiresAt: certificateValidation.expiresAt,
          rucMatches: certificateValidation.rucMatches,
          rucsEnCertificado: certificateValidation.rucsEnCertificado,
          motivoTitularidad: certificateValidation.rucMatches === false
            ? certificateValidation.errors.find((e) => e.includes('certificado'))
            : undefined,
        },
        ruc: {
          isConfigured: rucValidation.isValid,
          missingFields: rucValidation.missingFields,
        },
        fiscal: {
          isEnabled: fiscalEnabled,
          isReady: !isDemo && fiscalMissingItems.length === 0 && certificateValidation.isValid,
          missingItems: isDemo ? [] : fiscalMissingItems,
        },
      };

      this.logger.log(
        `Configuration status for tenant ${tenantId}: ${isComplete ? 'COMPLETE' : 'INCOMPLETE'} (${completionPercentage}%)`,
      );

      return status;
    } catch (error) {
      this.logger.error(`Error getting configuration status for tenant ${tenantId}:`, error);
      throw error;
    }
  }

  /**
   * Check if configuration is complete for a tenant
   */
  async isConfigurationComplete(tenantId: string): Promise<boolean> {
    try {
      const status = await this.getConfigurationStatus(tenantId);
      return status.isComplete;
    } catch (error) {
      this.logger.error(`Error checking configuration completeness for tenant ${tenantId}:`, error);
      return false;
    }
  }

  /**
   * Update empresa configuration
   */
  async updateEmpresaConfig(
    tenantId: string,
    config: UpdateEmpresaConfigDto,
    actorId?: string,
    idempotencyKey?: string,
  ): Promise<void> {
    try {
      this.logger.log(`Updating empresa config for tenant: ${tenantId}`);

      const dianConfigFields = [
        'dianActivo',
        'dianUrl',
        'dianUsuario',
        'dianPassword',
        'dianSoftwareId',
        'dianSoftwarePin',
        'dianTestSetId',
        'dianEnvironment',
        'dianRegimenFiscal',
        'dianTipoContribuyente',
        'dianResolucionNumero',
        'dianResolucionPrefijo',
        'dianResolucionDesde',
        'dianResolucionHasta',
        'dianResolucionFechaInicio',
        'dianResolucionFechaFin',
      ];
      if (dianConfigFields.some((field) => {
        const value = (config as any)[field];
        return value !== undefined && value !== null && value !== '' && value !== false;
      })) {
        throw new Error(INITIAL_ACTIVE_COUNTRY_MESSAGE);
      }

      const updateData: any = {};

      if (config.ruc !== undefined) updateData.ruc = config.ruc;
      if (config.razonSocial !== undefined) updateData.razon_social = config.razonSocial;
      if (config.direccion !== undefined) updateData.direccion = config.direccion;
      if (config.certificadoPfx !== undefined) updateData.certificado_pfx = config.certificadoPfx;
      if (config.certificadoPassword !== undefined) updateData.certificado_password = config.certificadoPassword;
      if (config.certificadoExpiraEn !== undefined) updateData.certificado_expira_en = config.certificadoExpiraEn;
      if (config.umbralGREAutomatico !== undefined) updateData.umbral_gre_automatico = config.umbralGREAutomatico;
      if (config.greAutomaticoHabilitado !== undefined) updateData.gre_automatico_habilitado = config.greAutomaticoHabilitado;
      if (config.emisionCpeModo !== undefined) updateData.emision_cpe_modo = config.emisionCpeModo;
      if (config.sunatEnvironment !== undefined) updateData.sunat_environment = config.sunatEnvironment;
      if (config.sunatUsername !== undefined) updateData.sunat_username = config.sunatUsername;
      if (config.sunatPassword !== undefined) {
        updateData.sunat_password = config.sunatPassword ? encryptText(this.configService, config.sunatPassword) : '';
      }
      if (config.sunatCpeUrl !== undefined) updateData.sunat_cpe_url = config.sunatCpeUrl;
      if (config.sunatSummaryUrl !== undefined) updateData.sunat_summary_url = config.sunatSummaryUrl;
      if (config.sunatQueryUrl !== undefined) updateData.sunat_query_url = config.sunatQueryUrl;
      if (config.sunatGreUrl !== undefined) updateData.sunat_gre_url = config.sunatGreUrl;
      if (config.sunatGreTransport !== undefined) updateData.sunat_gre_transport = config.sunatGreTransport;
      if (config.sunatGreRestBaseUrl !== undefined) updateData.sunat_gre_rest_base_url = config.sunatGreRestBaseUrl;
      if (config.sunatGreAuthUrl !== undefined) updateData.sunat_gre_auth_url = config.sunatGreAuthUrl;
      if (config.sunatGreClientId !== undefined) updateData.sunat_gre_client_id = config.sunatGreClientId;
      if (config.sunatGreClientSecret !== undefined) {
        updateData.sunat_gre_client_secret = config.sunatGreClientSecret
          ? encryptText(this.configService, config.sunatGreClientSecret)
          : '';
      }
      if (config.sireActivo !== undefined) updateData.sire_activo = config.sireActivo;
      if (config.sunatCertExpectedRuc !== undefined) updateData.sunat_cert_expected_ruc = config.sunatCertExpectedRuc;
      if (config.sunatCertRucMismatchConfirmed !== undefined) updateData.sunat_cert_ruc_mismatch_confirmed = config.sunatCertRucMismatchConfirmed;
      if (config.sunatCertRucMismatchReason !== undefined) updateData.sunat_cert_ruc_mismatch_reason = config.sunatCertRucMismatchReason;
      if (config.oseUrl !== undefined) updateData.ose_url = config.oseUrl;
      if (config.oseStatusUrl !== undefined) updateData.ose_status_url = config.oseStatusUrl;
      if (config.oseUsername !== undefined) updateData.ose_username = config.oseUsername;
      if (config.osePassword !== undefined) updateData.ose_password = config.osePassword;
      if (config.oseApiKey !== undefined) updateData.ose_api_key = config.oseApiKey;
      if (config.oseApiHeader !== undefined) updateData.ose_api_header = config.oseApiHeader;
      if (config.oseBearerToken !== undefined) updateData.ose_bearer_token = config.oseBearerToken;
      if (config.oseAuthTipo !== undefined) updateData.ose_auth_tipo = config.oseAuthTipo;
      if (config.oseActivo !== undefined) updateData.ose_activo = config.oseActivo;
      if (config.dianActivo !== undefined) updateData.dian_activo = config.dianActivo;
      if (config.dianUrl !== undefined) updateData.dian_url = config.dianUrl;
      if (config.dianUsuario !== undefined) updateData.dian_usuario = config.dianUsuario;
      if (config.dianPassword !== undefined && config.dianPassword !== 'CONFIGURADO') {
        updateData.dian_password = config.dianPassword
          ? encryptText(this.configService, config.dianPassword)
          : null;
      }
      if (config.dianSoftwareId !== undefined) updateData.dian_software_id = config.dianSoftwareId;
      if (config.dianSoftwarePin !== undefined && config.dianSoftwarePin !== 'CONFIGURADO') {
        updateData.dian_software_pin = config.dianSoftwarePin
          ? encryptText(this.configService, config.dianSoftwarePin)
          : null;
      }
      if (config.dianTestSetId !== undefined) updateData.dian_test_set_id = config.dianTestSetId;
      if (config.dianEnvironment !== undefined) updateData.dian_environment = config.dianEnvironment;
      if (config.dianRegimenFiscal !== undefined) updateData.dian_regimen_fiscal = config.dianRegimenFiscal;
      if (config.dianTipoContribuyente !== undefined) updateData.dian_tipo_contribuyente = config.dianTipoContribuyente;
      if (config.dianResolucionNumero !== undefined) updateData.dian_resolucion_numero = config.dianResolucionNumero;
      if (config.dianResolucionPrefijo !== undefined) updateData.dian_resolucion_prefijo = config.dianResolucionPrefijo;
      if (config.dianResolucionDesde !== undefined) updateData.dian_resolucion_desde = config.dianResolucionDesde;
      if (config.dianResolucionHasta !== undefined) updateData.dian_resolucion_hasta = config.dianResolucionHasta;
      if (config.dianResolucionFechaInicio !== undefined) updateData.dian_resolucion_fecha_inicio = config.dianResolucionFechaInicio;
      if (config.dianResolucionFechaFin !== undefined) updateData.dian_resolucion_fecha_fin = config.dianResolucionFechaFin;

      // Update timestamp
      updateData.ultima_validacion = new Date().toISOString();

      const atomic = this.requireAtomicContext(actorId, idempotencyKey);
      const { error } = await this.supabaseService.getClient().rpc(
        'actualizar_empresa_config_tx',
        {
          p_tenant_id: tenantId,
          p_actor_id: atomic.actorId,
          p_idempotency_key: atomic.idempotencyKey,
          p_operation: 'EMPRESA',
          p_patch: updateData,
        },
      );

      if (error) {
        this.logger.error(`Error updating empresa config for tenant ${tenantId}:`, error);
        throw error;
      }

      this.logger.log(`Empresa config updated successfully for tenant: ${tenantId}`);
    } catch (error) {
      this.logger.error(`Error updating empresa config for tenant ${tenantId}:`, error);
      throw error;
    }
  }

  /**
   * Get GRE thresholds configuration
   */
  async getGREThresholds(tenantId: string): Promise<GREThresholds> {
    try {
      this.logger.log(`Getting GRE thresholds for tenant: ${tenantId}`);

      const { data, error } = await this.supabaseService
        .getClient()
        .from('empresa_config')
        .select('umbral_gre_automatico, gre_automatico_habilitado')
        .eq('tenant_id', tenantId)
        .single();

      if (error) {
        this.logger.error(`Error getting GRE thresholds for tenant ${tenantId}:`, error);
        throw error;
      }

      const typedData = data as any;
      return {
        umbralGREAutomatico: typedData?.umbral_gre_automatico || 700.0,
        greAutomaticoHabilitado: typedData?.gre_automatico_habilitado === true,
      };
    } catch (error) {
      this.logger.error(`Error getting GRE thresholds for tenant ${tenantId}:`, error);
      // Fail closed: no activar GRE automática si la configuración no se puede leer.
      return {
        umbralGREAutomatico: 700.0,
        greAutomaticoHabilitado: false,
      };
    }
  }

  /**
   * Update GRE thresholds configuration
   */
  async updateGREThresholds(
    tenantId: string,
    thresholds: UpdateGREThresholdsDto,
    actorId?: string,
    idempotencyKey?: string,
  ): Promise<void> {
    try {
      this.logger.log(`Updating GRE thresholds for tenant: ${tenantId}`);

      const atomic = this.requireAtomicContext(actorId, idempotencyKey);
      const { error } = await this.supabaseService.getClient().rpc(
        'actualizar_empresa_config_tx',
        {
          p_tenant_id: tenantId,
          p_actor_id: atomic.actorId,
          p_idempotency_key: atomic.idempotencyKey,
          p_operation: 'GRE',
          p_patch: {
            umbral_gre_automatico: thresholds.umbralGREAutomatico,
            gre_automatico_habilitado: thresholds.greAutomaticoHabilitado,
          },
        },
      );

      if (error) {
        this.logger.error(`Error updating GRE thresholds for tenant ${tenantId}:`, error);
        throw error;
      }

      this.logger.log(`GRE thresholds updated successfully for tenant: ${tenantId}`);
    } catch (error) {
      this.logger.error(`Error updating GRE thresholds for tenant ${tenantId}:`, error);
      throw error;
    }
  }

  /**
   * Get wizard progress for a tenant
   */
  async getWizardProgress(tenantId: string): Promise<WizardProgress | null> {
    try {
      this.logger.log(`Getting wizard progress for tenant: ${tenantId}`);

      const { data, error } = await this.supabaseService
        .getClient()
        .from('wizard_progress')
        .select('*')
        .eq('tenant_id', tenantId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No record found
          return null;
        }
        this.logger.error(`Error getting wizard progress for tenant ${tenantId}:`, error);
        throw error;
      }

      const typedData = data as any;
      return {
        id: typedData.id,
        tenantId: typedData.tenant_id,
        pasoActual: typedData.paso_actual,
        pasosCompletados: typedData.pasos_completados || [],
        configuracionTemporal: typedData.configuracion_temporal,
        completado: typedData.completado,
        completadoAt: typedData.completado_at ? new Date(typedData.completado_at) : undefined,
        createdAt: new Date(typedData.created_at),
        updatedAt: new Date(typedData.updated_at),
      };
    } catch (error) {
      this.logger.error(`Error getting wizard progress for tenant ${tenantId}:`, error);
      throw error;
    }
  }

  /**
   * Save wizard step progress
   */
  async saveWizardStep(
    tenantId: string,
    stepData: SaveWizardStepDto,
    actorId?: string,
    idempotencyKey?: string,
  ): Promise<WizardProgress> {
    try {
      this.logger.log(`Saving wizard step for tenant: ${tenantId}, step: ${stepData.pasoActual}`);
      const atomic = this.requireAtomicContext(actorId, idempotencyKey);
      const { data, error } = await this.supabaseService.getClient().rpc(
        'guardar_paso_wizard_config_tx',
        {
          p_tenant_id: tenantId,
          p_actor_id: atomic.actorId,
          p_idempotency_key: atomic.idempotencyKey,
          p_paso_actual: stepData.pasoActual,
          p_configuracion_temporal: this.sanitizeWizardTemporaryConfig(
            stepData.configuracionTemporal,
          ),
        },
      );
      if (error) {
        this.logger.error(`Error saving wizard progress for tenant ${tenantId}:`, error);
        throw error;
      }
      const progress = (data as any)?.progress;
      if (!progress) {
        throw new Error('El RPC de wizard no devolvió progreso');
      }
      return this.mapWizardProgress(progress);
    } catch (error) {
      this.logger.error(`Error saving wizard step for tenant ${tenantId}:`, error);
      throw error;
    }
  }

  /**
   * Validates a raw certificate payload before persisting it.
   */
  async validateCertificatePayload(
    tenantId: string,
    payload: ValidateWizardCertificateDto,
  ): Promise<WizardCertificateValidationResult> {
    if (!payload.certificateBase64) {
      throw new Error('El certificado es requerido');
    }

    if (payload.certificatePassword === undefined || payload.certificatePassword === null) {
      throw new Error('La contraseña del certificado es requerida');
    }

    try {
      const normalizedBase64 = payload.certificateBase64.replace(/\s+/g, '');
      const buffer = Buffer.from(normalizedBase64, 'base64');
      const metadata = parseCertificateBuffer(buffer, payload.certificatePassword);

      // Un certificado puede cargar y estar vigente y aun asi no servir: SUNAT
      // solo acepta el del contribuyente que emite. Se comprueba al subirlo y
      // no al facturar, que es cuando ya seria tarde.
      const { data: empresa } = await this.supabaseService
        .getClient()
        .from('empresa_config')
        .select('ruc, pais, sunat_cert_expected_ruc, arca_cuit_representada')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      const isArgentina = String(empresa?.pais || '').toUpperCase() === 'AR';
      const rucEmisor = isArgentina
        ? empresa?.arca_cuit_representada || empresa?.ruc || null
        : empresa?.sunat_cert_expected_ruc || empresa?.ruc || null;
      const titularidad = isArgentina
        ? (() => {
            const candidatos = metadata.subject.match(/(?<!\d)\d{11}(?!\d)/g) ?? [];
            const cuits = [...new Set(candidatos.filter(validateArgentinaCuit))];
            const coincide = Boolean(rucEmisor && cuits.includes(String(rucEmisor).replace(/\D/g, '')));
            return {
              coincide,
              rucsEnCertificado: cuits,
              error: coincide
                ? undefined
                : 'El certificado ARCA debe declarar el CUIT representado en su titular.',
            };
          })()
        : verificarTitularidadCertificado(metadata.subject, rucEmisor);

      const now = new Date();
      const daysUntilExpiration = Math.ceil(
        (metadata.validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );

      this.logger.log(
        `Certificate payload validated for tenant ${tenantId} (expira: ${metadata.validTo.toISOString()})`,
      );

      return {
        subject: metadata.subject,
        issuer: metadata.issuer,
        serialNumber: metadata.serialNumber,
        validFrom: metadata.validFrom,
        validTo: metadata.validTo,
        daysUntilExpiration,
        rucEmisor,
        rucsEnCertificado: titularidad.rucsEnCertificado,
        perteneceAlEmisor: titularidad.coincide,
        motivoTitularidad: titularidad.error,
      };
    } catch (error) {
      this.logger.error(`Error validating certificate payload for tenant ${tenantId}:`, error);
      throw error instanceof Error
        ? error
        : new Error('No se pudo validar el certificado digital');
    }
  }

  /**
   * Calculate wizard completion percentage
   */
  calculateWizardCompletionPercentage(
    pasosCompletados: number[],
    totalSteps: number = TOTAL_WIZARD_STEPS,
  ): number {
    if (totalSteps === 0) return 0;
    return Math.round((pasosCompletados.length / totalSteps) * 100);
  }

  /**
   * Mark wizard as completed
   */
  async completeWizard(
    tenantId: string,
    configOverride?: any,
    actorId?: string,
    idempotencyKey?: string,
  ): Promise<void> {
    try {
      this.logger.log(`Completing wizard and saving configuration for tenant: ${tenantId}`);

      let config = configOverride;

      if (!config) {
        // 1. Get wizard progress with temporary configuration
        const progress = await this.getWizardProgress(tenantId);
        
        if (!progress || !progress.configuracionTemporal) {
          throw new Error('No se encontró configuración temporal para guardar');
        }

        config = progress.configuracionTemporal;
      }

      this.logger.log('Configuration payload received', {
        tenantId,
        hasCertificate: Boolean(config.certificateBase64),
        emisionCpeModo: config.emision_cpe_modo || 'SUNAT_DIRECTO',
        sunatEnvironment: config.sunat_environment || 'homologacion',
        greTransport: config.sunat_gre_transport || 'soap',
      });

      if (config.pais && !isInitialActiveCountryCode(config.pais)) {
        throw new Error(INITIAL_ACTIVE_COUNTRY_MESSAGE);
      }

      if (
        config.pais_id !== undefined &&
        config.pais_id !== null &&
        !isInitialActiveCountryId(config.pais_id)
      ) {
        throw new Error(INITIAL_ACTIVE_COUNTRY_MESSAGE);
      }

      const country =
        getActiveCountryByCode(config.pais) ??
        getActiveCountryById(config.pais_id) ??
        getActiveCountryByCode(INITIAL_ACTIVE_COUNTRY_CODE)!;
      const paisCodigo = country.codigo;

      if (!String(config.ruc || '').trim() || !String(config.razonSocial || '').trim() || !String(config.direccion || '').trim()) {
        throw new Error('Documento fiscal, razón social y dirección son obligatorios para habilitar el ERP');
      }

      if (paisCodigo === 'PE' && !/^\d{11}$/.test(String(config.ruc || '').trim())) {
        throw new Error('Perú requiere un RUC válido de 11 dígitos');
      }
      if (
        paisCodigo === 'PE' &&
        String(config.ubigeo || '').trim() &&
        !/^\d{6}$/.test(String(config.ubigeo).trim())
      ) {
        throw new Error('El ubigeo, cuando se informa, debe tener 6 dígitos');
      }
      if (
        paisCodigo === 'PE' &&
        (config.gre_obligatorio === true || config.gre_automatico_habilitado === true) &&
        !/^\d{6}$/.test(String(config.ubigeo || '').trim())
      ) {
        throw new Error(
          'La configuración fiscal de Perú requiere un ubigeo de 6 dígitos para emitir GRE',
        );
      }

      const hasCertificate = Boolean(String(config.certificateBase64 || '').trim());
      const hasCertificatePassword = Boolean(String(config.certificatePassword || ''));
      if (hasCertificate !== hasCertificatePassword) {
        throw new Error(
          hasCertificate
            ? 'La contraseña del certificado digital es requerida'
            : 'No se puede guardar una contraseña sin el certificado digital',
        );
      }

      const certificateValidation = hasCertificate
        ? await this.validateCertificatePayload(tenantId, {
            certificateBase64: config.certificateBase64,
            certificatePassword: config.certificatePassword,
          })
        : null;
      if (certificateValidation && certificateValidation.daysUntilExpiration < 0) {
        throw new Error('El certificado digital aportado por el cliente está vencido');
      }

      const emisionModo = (config.emision_cpe_modo || 'SUNAT_DIRECTO').toString().toUpperCase();
      const sunatGreTransport = (config.sunat_gre_transport || 'soap').toString().toLowerCase();
      const sireActivo = paisCodigo === 'PE' && config.sire_activo === true;
      if (sireActivo && (
        !config.sunat_username
        || !config.sunat_password
        || !config.sunat_gre_client_id
        || !config.sunat_gre_client_secret
      )) {
        throw new Error('SIRE requiere usuario/clave SOL secundaria y client_id/client_secret API SUNAT');
      }
      if (paisCodigo === 'PE' && config.ose_activo === true) {
        if (emisionModo !== 'OSE_API' || !config.ose_url) {
          throw new Error('OSE activo requiere seleccionar OSE API e informar su URL');
        }
        const authTipo = String(config.ose_auth_tipo || 'BASIC').toUpperCase();
        if (authTipo === 'BASIC' && (!config.ose_username || !config.ose_password)) {
          throw new Error('OSE BASIC requiere usuario y contraseña');
        }
        if (authTipo === 'BEARER' && !config.ose_bearer_token) {
          throw new Error('OSE BEARER requiere el token aportado por el cliente');
        }
        if (authTipo === 'API_KEY' && (!config.ose_api_key || !config.ose_api_header)) {
          throw new Error('OSE API_KEY requiere clave y nombre de cabecera');
        }
      }
      if (paisCodigo === 'AR') {
        if (!validateArgentinaCuit(config.ruc)) {
          throw new Error('Argentina requiere un CUIT válido de 11 dígitos');
        }
        if (config.arca_activo === true) {
          if (!config.arca_wsaa_url || !config.arca_wsfe_url) {
            throw new Error('ARCA activo requiere las URL WSAA y WSFEv1');
          }
          if (!config.arca_punto_venta || Number(config.arca_punto_venta) < 1) {
            throw new Error('ARCA requiere un punto de venta electrónico habilitado');
          }
          if (!config.arca_condicion_iva || !config.ingresos_brutos || !config.provincia_fiscal) {
            throw new Error('ARCA activo requiere condición IVA, Ingresos Brutos y jurisdicción fiscal');
          }
          const existingCertificate = certificateValidation
            ? { isValid: true }
            : await this.validationService.validateCertificate(tenantId);
          if (!existingCertificate.isValid) {
            throw new Error('ARCA activo requiere el certificado digital vigente aportado por el cliente');
          }
        }
      }
      if (paisCodigo === 'CO') {
        if (!validateColombiaNit(config.ruc)) {
          throw new Error('Colombia requiere un NIT válido con dígito de verificación');
        }
        if (config.dian_activo === true) {
          const requiredDianFields = [
            config.dian_url,
            config.dian_usuario,
            config.dian_password,
            config.dian_software_id,
            config.dian_software_pin,
            config.dian_resolucion_numero,
            config.dian_resolucion_prefijo,
          ];
          if (requiredDianFields.some((value) => !value)) {
            throw new Error('DIAN activo requiere credenciales, software y resolución aportados por el cliente');
          }
          const existingCertificate = certificateValidation
            ? { isValid: true }
            : await this.validationService.validateCertificate(tenantId);
          if (!existingCertificate.isValid) {
            throw new Error('DIAN activo requiere el certificado digital vigente aportado por el cliente');
          }
        }
      }

      // 2. Persiste el alta operativa. Certificados y credenciales son opcionales:
      // si no vienen en el payload, nunca se borran los que el cliente ya cargó.
      this.logger.log('Saving ERP configuration through the atomic boundary');
      let certificateHash: string | undefined;
      const configurationPatch: Record<string, unknown> = {
        ruc: String(config.ruc).trim(),
        razon_social: String(config.razonSocial).trim(),
        direccion_fiscal: String(config.direccion).trim(),
        ubigeo: String(config.ubigeo || '').trim() || null,
        pais: country.codigo,
        pais_id: country.id,
        moneda_defecto: country.moneda,
        configuracion_completa: true,
        tipo_empresa: config.tipo_empresa || 'MICRO',
        usar_flujo_logistica: config.usar_flujo_logistica === true,
        gre_obligatorio: config.gre_obligatorio === true,
        gre_automatico_habilitado: config.gre_automatico_habilitado === true,
        umbral_gre_automatico: config.umbral_gre_automatico || 700,
        igv_porcentaje: config.igv_porcentaje || country.tasaImpuesto * 100,
        retencion_renta_porcentaje: config.retencion_renta_porcentaje || 0,
        emision_cpe_modo:
          paisCodigo === 'AR'
            ? 'ARCA_WSFE'
            : paisCodigo === 'CO'
              ? 'DIAN_DIRECTO'
              : config.emision_cpe_modo || 'SUNAT_DIRECTO',
        sunat_environment: config.sunat_environment || 'homologacion',
        sunat_gre_transport: config.sunat_gre_transport || 'soap',
        sunat_gre_rest_base_url:
          config.sunat_gre_rest_base_url || 'https://api-cpe.sunat.gob.pe/v1',
        sire_activo: paisCodigo === 'PE' && config.sire_activo === true,
        sunat_cert_expected_ruc: config.sunat_cert_expected_ruc || config.ruc,
        sunat_cert_ruc_mismatch_confirmed:
          config.sunat_cert_ruc_mismatch_confirmed === true,
        ose_auth_tipo: config.ose_auth_tipo || 'BASIC',
        ose_activo: paisCodigo === 'PE' && config.ose_activo === true,
        arca_activo: paisCodigo === 'AR' && config.arca_activo === true,
        arca_environment: config.arca_environment || 'homologacion',
        dian_activo: paisCodigo === 'CO' && config.dian_activo === true,
        dian_environment:
          paisCodigo === 'CO' ? config.dian_environment || 'HOMOLOGACION' : null,
        _intent_fingerprint: this.configurationIntentFingerprint({
          tenantId,
          country: country.codigo,
          configuration: config,
        }),
      };

      const setIfPresent = (
        key: string,
        value: unknown,
        transform: (input: any) => unknown = (input) => input,
      ) => {
        if (value !== undefined && value !== null && value !== '') {
          configurationPatch[key] = transform(value);
        }
      };

      setIfPresent('departamento', config.departamento);
      setIfPresent('provincia', config.provincia);
      setIfPresent('distrito', config.distrito);
      setIfPresent('regimen_tributario', config.regimen_tributario);
      setIfPresent('serie_factura', config.serie_factura);
      setIfPresent('serie_boleta', config.serie_boleta);
      setIfPresent('serie_nota_credito', config.serie_nota_credito);
      setIfPresent('serie_guia_remision', config.serie_guia_remision);
      setIfPresent('sunat_username', config.sunat_username);
      setIfPresent('sunat_password', config.sunat_password, (value) =>
        encryptText(this.configService, value),
      );
      setIfPresent('sunat_cpe_url', config.sunat_cpe_url);
      setIfPresent('sunat_summary_url', config.sunat_summary_url);
      setIfPresent('sunat_query_url', config.sunat_query_url);
      setIfPresent('sunat_gre_url', config.sunat_gre_url);
      setIfPresent('sunat_gre_auth_url', config.sunat_gre_auth_url);
      setIfPresent('sunat_gre_client_id', config.sunat_gre_client_id);
      setIfPresent('sunat_gre_client_secret', config.sunat_gre_client_secret, (value) =>
        encryptText(this.configService, value),
      );
      setIfPresent('sunat_cert_ruc_mismatch_reason', config.sunat_cert_ruc_mismatch_reason);
      setIfPresent('ose_url', config.ose_url);
      setIfPresent('ose_status_url', config.ose_status_url);
      setIfPresent('ose_username', config.ose_username);
      setIfPresent('ose_password', config.ose_password);
      setIfPresent('ose_api_key', config.ose_api_key);
      setIfPresent('ose_api_header', config.ose_api_header);
      setIfPresent('ose_bearer_token', config.ose_bearer_token);
      if (paisCodigo === 'AR') {
        setIfPresent('arca_wsaa_url', config.arca_wsaa_url);
        setIfPresent('arca_wsfe_url', config.arca_wsfe_url);
        setIfPresent('arca_cuit_representada', config.arca_cuit_representada || config.ruc);
        setIfPresent('arca_punto_venta', config.arca_punto_venta, Number);
        setIfPresent('arca_condicion_iva', config.arca_condicion_iva);
        setIfPresent('ingresos_brutos', config.ingresos_brutos);
        setIfPresent('fecha_inicio_actividades', config.fecha_inicio_actividades);
        setIfPresent('provincia_fiscal', config.provincia_fiscal);
      }
      if (paisCodigo === 'CO') {
        setIfPresent('dian_url', config.dian_url);
        setIfPresent('dian_usuario', config.dian_usuario);
        setIfPresent('dian_password', config.dian_password, (value) =>
          encryptText(this.configService, value),
        );
        setIfPresent('dian_software_id', config.dian_software_id);
        setIfPresent('dian_software_pin', config.dian_software_pin, (value) =>
          encryptText(this.configService, value),
        );
        setIfPresent('dian_test_set_id', config.dian_test_set_id);
        setIfPresent('dian_regimen_fiscal', config.dian_regimen_fiscal);
        setIfPresent('dian_tipo_contribuyente', config.dian_tipo_contribuyente);
        setIfPresent('dian_resolucion_numero', config.dian_resolucion_numero);
        setIfPresent('dian_resolucion_prefijo', config.dian_resolucion_prefijo);
        setIfPresent('dian_resolucion_desde', config.dian_resolucion_desde, Number);
        setIfPresent('dian_resolucion_hasta', config.dian_resolucion_hasta, Number);
        setIfPresent('dian_resolucion_fecha_inicio', config.dian_resolucion_fecha_inicio);
        setIfPresent('dian_resolucion_fecha_fin', config.dian_resolucion_fecha_fin);
      }
      setIfPresent('logo_url', config.logoUrl || config.logoBase64);

      if (certificateValidation) {
        const certificateBuffer = Buffer.from(
          String(config.certificateBase64).replace(/\s+/g, ''),
          'base64',
        );
        certificateHash = createHash('sha256').update(certificateBuffer).digest('hex');
        configurationPatch.certificado_pfx = toPostgresBytea(
          encryptBuffer(this.configService, certificateBuffer),
        );
        configurationPatch.certificado_password = encryptText(
          this.configService,
          config.certificatePassword,
        );
        configurationPatch.certificado_expira_en = certificateValidation.validTo.toISOString();
      }
      const atomic = this.requireAtomicContext(actorId, idempotencyKey);
      const { error: empresaError } = await this.supabaseService.getClient().rpc(
        'completar_wizard_config_tx',
        {
          p_tenant_id: tenantId,
          p_actor_id: atomic.actorId,
          p_idempotency_key: atomic.idempotencyKey,
          p_patch: configurationPatch,
        },
      );

      if (empresaError) {
        this.logger.error(`Error saving empresa_config:`, empresaError);
        throw empresaError;
      }
      
      this.logger.log(`✅ All configuration saved to empresa_config`);

      if (certificateHash) {
        // Sólo relee el certificado cuando este intento efectivamente cargó uno.
        const { data: verifyData, error: verifyError } = await this.supabaseService
          .getClient()
          .from('empresa_config')
          .select('certificado_pfx, certificado_password')
          .eq('tenant_id', tenantId)
          .single();

        if (verifyError) {
          this.logger.error(`Error verifying certificate after save for tenant ${tenantId}:`, verifyError);
          throw verifyError;
        }

        const typedVerifyData = verifyData as any;
        try {
          const storedBuffer = decryptBuffer(this.configService, typedVerifyData.certificado_pfx);
          if (!storedBuffer) throw new Error('El certificado almacenado está vacío');
          const storedHash = createHash('sha256').update(storedBuffer).digest('hex');
          if (storedHash !== certificateHash) {
            throw new Error('El certificado persistido no coincide con el payload validado');
          }
          parseCertificateBuffer(
            storedBuffer,
            decryptText(this.configService, typedVerifyData.certificado_password),
          );
        } catch (verifyParseError) {
          this.logger.error(
            `Error verifying stored certificate for tenant ${tenantId}:`,
            verifyParseError,
          );
          throw verifyParseError;
        }
      }
      this.logger.log(`✅ Wizard completed successfully for tenant: ${tenantId}`);
    } catch (error) {
      this.logger.error(`Error completing wizard for tenant ${tenantId}:`, error);
      throw error;
    }
  }

  /**
   * Reset wizard progress and mark configuration as incomplete.
   */
  async resetWizard(
    tenantId: string,
    actorId?: string,
    idempotencyKey?: string,
  ): Promise<void> {
    try {
      this.logger.log(`Resetting wizard for tenant: ${tenantId}`);
      const atomic = this.requireAtomicContext(actorId, idempotencyKey);
      const { error } = await this.supabaseService.getClient().rpc(
        'resetear_wizard_config_tx',
        {
          p_tenant_id: tenantId,
          p_actor_id: atomic.actorId,
          p_idempotency_key: atomic.idempotencyKey,
        },
      );
      if (error) throw error;

      this.logger.log(`✅ Wizard reset completed for tenant: ${tenantId}`);
    } catch (error) {
      this.logger.error(`Error resetting wizard for tenant ${tenantId}:`, error);
      throw error;
    }
  }

}
