import { Injectable, Logger } from '@nestjs/common';
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
import { normalizeCertificateInput, parseCertificateBuffer } from '../../shared/utils/certificate.utils';
import { createHash } from 'crypto';

export const TOTAL_WIZARD_STEPS = 7;

@Injectable()
export class ConfigurationService {
  private readonly logger = new Logger(ConfigurationService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly validationService: ValidationService,
  ) {}

  /**
   * Get configuration status for a tenant
   */
  async getConfigurationStatus(tenantId: string): Promise<ConfigurationStatus> {
    try {
      this.logger.log(`Getting configuration status for tenant: ${tenantId}`);

      // Get validation results
      const certificateValidation = await this.validationService.validateCertificate(tenantId);
      const rucValidation = await this.validationService.validateRucConfiguration(tenantId);

      // Build missing items list
      const missingItems: string[] = [];
      
      if (!certificateValidation.isValid) {
        missingItems.push('Certificado digital');
      }
      
      if (rucValidation.missingFields.length > 0) {
        missingItems.push(...rucValidation.missingFields);
      }

      // Calculate completion percentage
      const totalRequirements = 4; // Certificate, RUC, Razón Social, Dirección
      const completedRequirements = totalRequirements - missingItems.length;
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

      const updateData: any = {};

      if (config.ruc !== undefined) updateData.ruc = config.ruc;
      if (config.razonSocial !== undefined) updateData.razon_social = config.razonSocial;
      if (config.direccion !== undefined) updateData.direccion = config.direccion;
      if (config.certificadoPfx !== undefined) updateData.certificado_pfx = config.certificadoPfx;
      if (config.certificadoPassword !== undefined) updateData.certificado_password = config.certificadoPassword;
      if (config.certificadoExpiraEn !== undefined) updateData.certificado_expira_en = config.certificadoExpiraEn;
      if (config.umbralGREAutomatico !== undefined) updateData.umbral_gre_automatico = config.umbralGREAutomatico;
      if (config.greAutomaticoHabilitado !== undefined) updateData.gre_automatico_habilitado = config.greAutomaticoHabilitado;

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

      return {
        umbralGREAutomatico: data?.umbral_gre_automatico || 700.0,
        greAutomaticoHabilitado: data?.gre_automatico_habilitado !== false,
      };
    } catch (error) {
      this.logger.error(`Error getting GRE thresholds for tenant ${tenantId}:`, error);
      // Return defaults on error
      return {
        umbralGREAutomatico: 700.0,
        greAutomaticoHabilitado: true,
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

      return {
        id: data.id,
        tenantId: data.tenant_id,
        pasoActual: data.paso_actual,
        pasosCompletados: data.pasos_completados || [],
        configuracionTemporal: data.configuracion_temporal,
        completado: data.completado,
        completadoAt: data.completado_at ? new Date(data.completado_at) : undefined,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at),
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

        return {
          id: data.id,
          tenantId: data.tenant_id,
          pasoActual: data.paso_actual,
          pasosCompletados: data.pasos_completados,
          configuracionTemporal: data.configuracion_temporal,
          completado: data.completado,
          completadoAt: data.completado_at ? new Date(data.completado_at) : undefined,
          createdAt: new Date(data.created_at),
          updatedAt: new Date(data.updated_at),
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

        return {
          id: data.id,
          tenantId: data.tenant_id,
          pasoActual: data.paso_actual,
          pasosCompletados: data.pasos_completados,
          configuracionTemporal: data.configuracion_temporal,
          completado: data.completado,
          completadoAt: data.completado_at ? new Date(data.completado_at) : undefined,
          createdAt: new Date(data.created_at),
          updatedAt: new Date(data.updated_at),
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

      this.logger.log(`Configuration data to save:`, config);

      if (!config.certificateBase64) {
        throw new Error('No se encontró el certificado digital en la configuración');
      }

      if (config.certificatePassword === undefined || config.certificatePassword === null) {
        throw new Error('La contraseña del certificado digital es requerida');
      }

      const certificateValidation = await this.validateCertificatePayload(tenantId, {
        certificateBase64: config.certificateBase64,
        certificatePassword: config.certificatePassword,
      });

      // 2. Save RUC, company data AND certificate to empresa_config
      this.logger.log(`Saving all configuration to empresa_config...`);
      
      // Convert base64 certificate to Buffer for bytea storage
      const certificateBuffer = Buffer.from(config.certificateBase64.replace(/\s+/g, ''), 'base64');
      const certificateHexValue = `\\x${certificateBuffer.toString('hex')}`;
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
          certificado_pfx: certificateHexValue,
          certificado_password: config.certificatePassword,
          certificado_expira_en: certificateValidation.validTo.toISOString(),
          configuracion_completa: true,
          // Configuración de ventas
          tipo_empresa: config.tipo_empresa || 'MICRO',
          usar_flujo_logistica: config.usar_flujo_logistica !== undefined ? config.usar_flujo_logistica : false,
          gre_obligatorio: config.gre_obligatorio !== undefined ? config.gre_obligatorio : false,
          gre_automatico_habilitado: config.gre_automatico_habilitado !== undefined ? config.gre_automatico_habilitado : true,
          umbral_gre_automatico: config.umbral_gre_automatico || 700,
          // Configuración fiscal
          regimen_tributario: config.regimen_tributario,
          igv_porcentaje: config.igv_porcentaje || 18,
          retencion_renta_porcentaje: config.retencion_renta_porcentaje || 0,
          serie_factura: config.serie_factura,
          serie_boleta: config.serie_boleta,
          serie_nota_credito: config.serie_nota_credito,
          // Configuración OSE (opcional)
          ose_url: config.ose_url,
          ose_username: config.ose_username,
          ose_password: config.ose_password,
          ose_activo: config.ose_activo || false,
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

      try {
        const storedBuffer = normalizeCertificateInput(verifyData.certificado_pfx);
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
        parseCertificateBuffer(storedBuffer, verifyData.certificado_password || '');
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

