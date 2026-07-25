import { Injectable, Logger } from '@nestjs/common';
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
import { createHash } from 'crypto';
import { decryptBuffer, decryptText, encryptBuffer, encryptText } from '../../shared/utils/secure-config.utils';
import {
  INITIAL_ACTIVE_COUNTRY_CODE,
  INITIAL_ACTIVE_COUNTRY_ID,
  INITIAL_ACTIVE_COUNTRY_CURRENCY,
  INITIAL_ACTIVE_COUNTRY_MESSAGE,
  isInitialActiveCountryCode,
  isInitialActiveCountryId,
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
            'emision_cpe_modo',
            'gre_obligatorio',
            'gre_automatico_habilitado',
            'sunat_environment',
            'sunat_username',
            'sunat_password',
            'sunat_gre_transport',
            'sunat_gre_client_id',
            'sunat_gre_client_secret',
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

      // Build missing items list
      const missingItems: string[] = [];
      
      if (!certificateValidation.isValid) {
        missingItems.push('Certificado digital');
      }
      
      if (rucValidation.missingFields.length > 0) {
        missingItems.push(...rucValidation.missingFields);
      }

      const typedEmpresaConfig = empresaConfig as any;
      const rawPaisCodigo = (typedEmpresaConfig?.pais || INITIAL_ACTIVE_COUNTRY_CODE).toString().toUpperCase();
      if (!isInitialActiveCountryCode(rawPaisCodigo)) {
        missingItems.push(INITIAL_ACTIVE_COUNTRY_MESSAGE);
      }
      const paisCodigo = INITIAL_ACTIVE_COUNTRY_CODE;
      const emisionModo = (typedEmpresaConfig?.emision_cpe_modo || 'SUNAT_DIRECTO').toString().toUpperCase();
      const oseAuthTipo = (typedEmpresaConfig?.ose_auth_tipo || 'BASIC').toString().toUpperCase();
      const oseActivo = typedEmpresaConfig?.ose_activo === true;
      const requiereOse = emisionModo === 'OSE_API';
      const dianEnvironment = (typedEmpresaConfig?.dian_environment || 'HOMOLOGACION').toString().toUpperCase();
      const dianActivo = typedEmpresaConfig?.dian_activo === true;
      const requiereDian: boolean = false;
      const requiereSunatDirecto = paisCodigo === 'PE' && emisionModo === 'SUNAT_DIRECTO';
      const sunatGreTransport = (typedEmpresaConfig?.sunat_gre_transport || 'soap').toString().toLowerCase();

      if (requiereOse) {
        if (!oseActivo) {
          missingItems.push('Activar OSE API');
        }
        if (!typedEmpresaConfig?.ose_url) {
          missingItems.push('URL de OSE');
        }

        if (oseAuthTipo === 'BASIC') {
          if (!typedEmpresaConfig?.ose_username) missingItems.push('Usuario OSE');
          if (!typedEmpresaConfig?.ose_password) missingItems.push('Password OSE');
        } else if (oseAuthTipo === 'BEARER') {
          if (!typedEmpresaConfig?.ose_bearer_token) missingItems.push('Bearer token OSE');
        } else if (oseAuthTipo === 'API_KEY') {
          if (!typedEmpresaConfig?.ose_api_key) missingItems.push('API key OSE');
          if (!typedEmpresaConfig?.ose_api_header) missingItems.push('Header API key OSE');
        }
      }

      if (requiereSunatDirecto) {
        if (!typedEmpresaConfig?.sunat_username) missingItems.push('Usuario SOL secundario');
        if (!typedEmpresaConfig?.sunat_password) missingItems.push('Clave SOL secundaria');
        if (sunatGreTransport === 'rest') {
          if (!typedEmpresaConfig?.sunat_gre_client_id) missingItems.push('Client ID GRE REST');
          if (!typedEmpresaConfig?.sunat_gre_client_secret) missingItems.push('Client secret GRE REST');
        }
      }

      if (requiereDian) {
        if (!dianActivo) missingItems.push('Activar DIAN');
        if (!typedEmpresaConfig?.dian_url) missingItems.push('URL DIAN');
        if (!typedEmpresaConfig?.dian_usuario) missingItems.push('Usuario DIAN');
        if (!typedEmpresaConfig?.dian_password) missingItems.push('Password DIAN');
        if (!typedEmpresaConfig?.dian_software_id) missingItems.push('Software ID DIAN');
        if (!typedEmpresaConfig?.dian_software_pin) missingItems.push('Software PIN DIAN');
        if (!typedEmpresaConfig?.dian_regimen_fiscal) missingItems.push('Régimen fiscal DIAN');
        if (!typedEmpresaConfig?.dian_tipo_contribuyente) missingItems.push('Tipo contribuyente DIAN');
        if (dianEnvironment === 'HOMOLOGACION' && !typedEmpresaConfig?.dian_test_set_id) {
          missingItems.push('Test Set ID DIAN');
        }
        if (!typedEmpresaConfig?.dian_resolucion_numero) missingItems.push('Resolución DIAN');
        if (!typedEmpresaConfig?.dian_resolucion_prefijo) missingItems.push('Prefijo DIAN');
        if (typedEmpresaConfig?.dian_resolucion_desde == null) missingItems.push('Rango inicio DIAN');
        if (typedEmpresaConfig?.dian_resolucion_hasta == null) missingItems.push('Rango fin DIAN');
        if (!typedEmpresaConfig?.dian_resolucion_fecha_inicio) missingItems.push('Vigencia inicio DIAN');
        if (!typedEmpresaConfig?.dian_resolucion_fecha_fin) missingItems.push('Vigencia fin DIAN');
      }

      // Calculate completion percentage
      const baseRequirements = 4; // Certificate, RUC, Razon Social, Direccion
      let sunatRequirements = 0;
      let oseRequirements = 0;
      let dianRequirements = 0;
      if (requiereSunatDirecto) {
        sunatRequirements += 2; // usuario y clave SOL secundaria
        if (sunatGreTransport === 'rest') {
          sunatRequirements += 2; // client_id/client_secret GRE REST
        }
      }
      if (requiereOse) {
        oseRequirements += 1; // ose_activo
        oseRequirements += 1; // ose_url
        if (oseAuthTipo === 'BASIC') oseRequirements += 2;
        if (oseAuthTipo === 'BEARER') oseRequirements += 1;
        if (oseAuthTipo === 'API_KEY') oseRequirements += 2;
      }
      if (requiereDian) {
        dianRequirements += 1; // dian_activo
        dianRequirements += 1; // dian_url
        dianRequirements += 1; // dian_usuario
        dianRequirements += 1; // dian_password
        dianRequirements += 1; // dian_software_id
        dianRequirements += 1; // dian_software_pin
        dianRequirements += 1; // dian_regimen_fiscal
        dianRequirements += 1; // dian_tipo_contribuyente
        if (dianEnvironment === 'HOMOLOGACION') dianRequirements += 1; // dian_test_set_id
        dianRequirements += 1; // dian_resolucion_numero
        dianRequirements += 1; // dian_resolucion_prefijo
        dianRequirements += 1; // dian_resolucion_desde
        dianRequirements += 1; // dian_resolucion_hasta
        dianRequirements += 1; // dian_resolucion_fecha_inicio
        dianRequirements += 1; // dian_resolucion_fecha_fin
      }
      const totalRequirements = baseRequirements + sunatRequirements + oseRequirements + dianRequirements;
      const completedRequirements = Math.max(totalRequirements - missingItems.length, 0);
      const completionPercentage = Math.round((completedRequirements / totalRequirements) * 100);

      const isComplete = missingItems.length === 0 && certificateValidation.isValid && rucValidation.isValid;

      const status: ConfigurationStatus = {
        isComplete,
        completionPercentage,
        missingItems,
        certificate: {
          exists: certificateValidation.errors.length === 0 || !certificateValidation.errors.some(e => e.includes('No se ha cargado')),
          isValid: certificateValidation.isValid,
          expiresAt: certificateValidation.expiresAt,
        },
        ruc: {
          isConfigured: rucValidation.isValid,
          missingFields: rucValidation.missingFields,
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
      if (config.dianPassword !== undefined) updateData.dian_password = config.dianPassword;
      if (config.dianSoftwareId !== undefined) updateData.dian_software_id = config.dianSoftwareId;
      if (config.dianSoftwarePin !== undefined) updateData.dian_software_pin = config.dianSoftwarePin;
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

      const { error } = await this.supabaseService
        .getClient()
        .from('empresa_config')
        .update(updateData)
        .eq('tenant_id', tenantId);

      if (error) {
        this.logger.error(`Error updating empresa config for tenant ${tenantId}:`, error);
        throw error;
      }

      // Update configuration status
      const status = await this.getConfigurationStatus(tenantId);
      
      await this.supabaseService
        .getClient()
        .from('empresa_config')
        .update({
          configuracion_completa: status.isComplete,
        })
        .eq('tenant_id', tenantId);

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
  ): Promise<void> {
    try {
      this.logger.log(`Updating GRE thresholds for tenant: ${tenantId}`);

      const { error } = await this.supabaseService
        .getClient()
        .from('empresa_config')
        .update({
          umbral_gre_automatico: thresholds.umbralGREAutomatico,
          gre_automatico_habilitado: thresholds.greAutomaticoHabilitado,
        })
        .eq('tenant_id', tenantId);

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
  ): Promise<WizardProgress> {
    try {
      this.logger.log(`Saving wizard step for tenant: ${tenantId}, step: ${stepData.pasoActual}`);

      // Get existing progress or create new
      const existingProgress = await this.getWizardProgress(tenantId);

      const pasosCompletados = new Set(existingProgress?.pasosCompletados || []);
      pasosCompletados.add(stepData.pasoActual);

      const configuracionTemporal = stepData.configuracionTemporal
        ? {
            ...(existingProgress?.configuracionTemporal || {}),
            ...stepData.configuracionTemporal,
          }
        : existingProgress?.configuracionTemporal;

      const progressData = {
        tenant_id: tenantId,
        paso_actual: stepData.pasoActual,
        pasos_completados: Array.from(pasosCompletados),
        configuracion_temporal: configuracionTemporal,
        updated_at: new Date().toISOString(),
      };

      if (existingProgress) {
        // Update existing
        const { data, error } = await this.supabaseService
          .getClient()
          .from('wizard_progress')
          .update(progressData)
          .eq('tenant_id', tenantId)
          .select()
          .single();

        if (error) {
          this.logger.error(`Error updating wizard progress for tenant ${tenantId}:`, error);
          throw error;
        }

        const typedData = data as any;
        return {
          id: typedData.id,
          tenantId: typedData.tenant_id,
          pasoActual: typedData.paso_actual,
          pasosCompletados: typedData.pasos_completados,
          configuracionTemporal: typedData.configuracion_temporal,
          completado: typedData.completado,
          completadoAt: typedData.completado_at ? new Date(typedData.completado_at) : undefined,
          createdAt: new Date(typedData.created_at),
          updatedAt: new Date(typedData.updated_at),
        };
      } else {
        // Create new
        const { data, error } = await this.supabaseService
          .getClient()
          .from('wizard_progress')
          .insert(progressData)
          .select()
          .single();

        if (error) {
          this.logger.error(`Error creating wizard progress for tenant ${tenantId}:`, error);
          throw error;
        }

        const typedInsertData = data as any;
        return {
          id: typedInsertData.id,
          tenantId: typedInsertData.tenant_id,
          pasoActual: typedInsertData.paso_actual,
          pasosCompletados: typedInsertData.pasos_completados,
          configuracionTemporal: typedInsertData.configuracion_temporal,
          completado: typedInsertData.completado,
          completadoAt: typedInsertData.completado_at ? new Date(typedInsertData.completado_at) : undefined,
          createdAt: new Date(typedInsertData.created_at),
          updatedAt: new Date(typedInsertData.updated_at),
        };
      }
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
  async completeWizard(tenantId: string, configOverride?: any): Promise<void> {
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

      if (!config.certificateBase64) {
        throw new Error('No se encontró el certificado digital en la configuración');
      }

      if (!/^\d{6}$/.test(String(config.ubigeo || '').trim())) {
        throw new Error(
          'La configuración fiscal de Perú requiere un ubigeo de 6 dígitos para emitir GRE',
        );
      }

      if (config.certificatePassword === undefined || config.certificatePassword === null) {
        throw new Error('La contraseña del certificado digital es requerida');
      }

      const certificateValidation = await this.validateCertificatePayload(tenantId, {
        certificateBase64: config.certificateBase64,
        certificatePassword: config.certificatePassword,
      });

      const paisCodigo = INITIAL_ACTIVE_COUNTRY_CODE;
      const emisionModo = (config.emision_cpe_modo || 'SUNAT_DIRECTO').toString().toUpperCase();
      const sunatGreTransport = (config.sunat_gre_transport || 'soap').toString().toLowerCase();
      if (paisCodigo === 'PE' && emisionModo === 'SUNAT_DIRECTO') {
        if (!config.sunat_username || !config.sunat_password) {
          throw new Error('SUNAT directo requiere usuario y clave SOL secundaria');
        }
        if (sunatGreTransport === 'rest' && (!config.sunat_gre_client_id || !config.sunat_gre_client_secret)) {
          throw new Error('GRE REST requiere client_id y client_secret SUNAT');
        }
      }

      // 2. Save RUC, company data AND certificate to empresa_config
      this.logger.log(`Saving all configuration to empresa_config...`);
      
      // Convert base64 certificate to Buffer for bytea storage
      const certificateBuffer = Buffer.from(config.certificateBase64.replace(/\s+/g, ''), 'base64');
      const encryptedCertificate = encryptBuffer(this.configService, certificateBuffer);
      const certificateHash = createHash('sha256').update(certificateBuffer).digest('hex');
      this.logger.log(
        `Certificate payload size=${certificateBuffer.length}, hash=${certificateHash.substr(0, 16)}...`,
      );
      
      const { error: empresaError } = await this.supabaseService
        .getClient()
        .from('empresa_config')
        .upsert({
          tenant_id: tenantId,
          ruc: config.ruc,
          razon_social: config.razonSocial,
          direccion_fiscal: config.direccion,
          ubigeo: config.ubigeo,
          departamento: config.departamento || null,
          provincia: config.provincia || null,
          distrito: config.distrito || null,
          pais: INITIAL_ACTIVE_COUNTRY_CODE,
          pais_id: INITIAL_ACTIVE_COUNTRY_ID,
          moneda_defecto: INITIAL_ACTIVE_COUNTRY_CURRENCY,
          certificado_pfx: toPostgresBytea(encryptedCertificate),
          certificado_password: encryptText(this.configService, config.certificatePassword),
          certificado_expira_en: certificateValidation.validTo.toISOString(),
          configuracion_completa: true,
          // Configuración de ventas
          tipo_empresa: config.tipo_empresa || 'MICRO',
          usar_flujo_logistica: config.usar_flujo_logistica !== undefined ? config.usar_flujo_logistica : false,
          gre_obligatorio: config.gre_obligatorio !== undefined ? config.gre_obligatorio : false,
          gre_automatico_habilitado: config.gre_automatico_habilitado !== undefined ? config.gre_automatico_habilitado : false,
          umbral_gre_automatico: config.umbral_gre_automatico || 700,
          // Configuración fiscal
          regimen_tributario: config.regimen_tributario,
          igv_porcentaje: config.igv_porcentaje || 18,
          retencion_renta_porcentaje: config.retencion_renta_porcentaje || 0,
          serie_factura: config.serie_factura,
          serie_boleta: config.serie_boleta,
          serie_nota_credito: config.serie_nota_credito,
          // Configuración OSE (opcional)
          emision_cpe_modo: config.emision_cpe_modo || 'SUNAT_DIRECTO',
          sunat_environment: config.sunat_environment || 'homologacion',
          sunat_username: config.sunat_username || null,
          sunat_password: config.sunat_password ? encryptText(this.configService, config.sunat_password) : null,
          sunat_cpe_url: config.sunat_cpe_url || null,
          sunat_summary_url: config.sunat_summary_url || null,
          sunat_query_url: config.sunat_query_url || null,
          sunat_gre_url: config.sunat_gre_url || null,
          sunat_gre_transport: config.sunat_gre_transport || 'soap',
          sunat_gre_rest_base_url: config.sunat_gre_rest_base_url || 'https://api-cpe.sunat.gob.pe/v1',
          sunat_gre_auth_url: config.sunat_gre_auth_url || null,
          sunat_gre_client_id: config.sunat_gre_client_id || null,
          sunat_gre_client_secret: config.sunat_gre_client_secret
            ? encryptText(this.configService, config.sunat_gre_client_secret)
            : null,
          sunat_cert_expected_ruc: config.sunat_cert_expected_ruc || config.ruc || null,
          sunat_cert_ruc_mismatch_confirmed: config.sunat_cert_ruc_mismatch_confirmed === true,
          sunat_cert_ruc_mismatch_reason: config.sunat_cert_ruc_mismatch_reason || null,
          ose_url: config.ose_url,
          ose_status_url: config.ose_status_url,
          ose_username: config.ose_username,
          ose_password: config.ose_password,
          ose_auth_tipo: config.ose_auth_tipo || 'BASIC',
          ose_api_key: config.ose_api_key,
          ose_api_header: config.ose_api_header,
          ose_bearer_token: config.ose_bearer_token,
          ose_activo: config.ose_activo || false,
          // Colombia/DIAN queda en roadmap: no persistir configuración activa no-PE.
          dian_activo: false,
          dian_url: null,
          dian_usuario: null,
          dian_password: null,
          dian_software_id: null,
          dian_software_pin: null,
          dian_test_set_id: null,
          dian_environment: null,
          dian_regimen_fiscal: null,
          dian_tipo_contribuyente: null,
          dian_resolucion_numero: null,
          dian_resolucion_prefijo: null,
          dian_resolucion_desde: null,
          dian_resolucion_hasta: null,
          dian_resolucion_fecha_inicio: null,
          dian_resolucion_fecha_fin: null,
          // Logo de la empresa (multi-tenant)
          logo_url: config.logoUrl || config.logoBase64 || null,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'tenant_id'
        });

      if (empresaError) {
        this.logger.error(`Error saving empresa_config:`, empresaError);
        throw empresaError;
      }
      
      this.logger.log(`✅ All configuration saved to empresa_config`);

      // Double-check that the certificate can be read back correctly
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
        if (!storedBuffer) {
          throw new Error('El certificado almacenado está vacío');
        }
        const storedHash = createHash('sha256').update(storedBuffer).digest('hex');
        this.logger.log(
          `✅ Certificate stored for tenant ${tenantId}. Bytes: ${storedBuffer.length}, hash=${storedHash.substr(0, 16)}...`,
        );
        if (storedHash !== certificateHash) {
          this.logger.warn(
            `Hash mismatch between payload and stored certificate for tenant ${tenantId}`,
          );
        }
        parseCertificateBuffer(storedBuffer, decryptText(this.configService, typedVerifyData.certificado_password));
      } catch (verifyParseError) {
        this.logger.error(
          `Error verifying stored certificate for tenant ${tenantId}:`,
          verifyParseError,
        );
        throw verifyParseError;
      }


      // 4. Mark wizard as completed
      const { error: wizardError } = await this.supabaseService
        .getClient()
        .from('wizard_progress')
        .update({
          completado: true,
          completado_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', tenantId);

      if (wizardError) {
        this.logger.error(`Error marking wizard as completed:`, wizardError);
        throw wizardError;
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
  async resetWizard(tenantId: string): Promise<void> {
    try {
      this.logger.log(`Resetting wizard for tenant: ${tenantId}`);

      const client = this.supabaseService.getClient();

      const { error: deleteError } = await client
        .from('wizard_progress')
        .delete()
        .eq('tenant_id', tenantId);

      if (deleteError && deleteError.code !== 'PGRST116') {
        this.logger.error(`Error deleting wizard progress for tenant ${tenantId}:`, deleteError);
        throw deleteError;
      }

      const resetPayload = {
        tenant_id: tenantId,
        configuracion_completa: false,
        certificado_pfx: null,
        certificado_password: null,
        certificado_expira_en: null,
        ultima_validacion: null,
        errores_configuracion: {
          reason: 'wizard_reset',
          at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      };

      const { error: empresaError } = await client
        .from('empresa_config')
        .upsert(resetPayload, {
          onConflict: 'tenant_id',
        });

      if (empresaError) {
        this.logger.error(`Error resetting empresa_config for tenant ${tenantId}:`, empresaError);
        throw empresaError;
      }

      this.logger.log(`✅ Wizard reset completed for tenant: ${tenantId}`);
    } catch (error) {
      this.logger.error(`Error resetting wizard for tenant ${tenantId}:`, error);
      throw error;
    }
  }

}
