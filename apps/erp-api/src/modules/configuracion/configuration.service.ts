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
} from './configuration.types';

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

      const pasosCompletados = existingProgress?.pasosCompletados || [];
      if (!pasosCompletados.includes(stepData.pasoActual)) {
        pasosCompletados.push(stepData.pasoActual);
      }

      const progressData = {
        tenant_id: tenantId,
        paso_actual: stepData.pasoActual,
        pasos_completados: pasosCompletados,
        configuracion_temporal: stepData.configuracionTemporal || existingProgress?.configuracionTemporal,
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
   * Calculate wizard completion percentage
   */
  calculateWizardCompletionPercentage(pasosCompletados: number[], totalSteps: number = 5): number {
    if (totalSteps === 0) return 0;
    return Math.round((pasosCompletados.length / totalSteps) * 100);
  }

  /**
   * Mark wizard as completed
   */
  async completeWizard(tenantId: string): Promise<void> {
    try {
      this.logger.log(`Completing wizard and saving configuration for tenant: ${tenantId}`);

      // 1. Get wizard progress with temporary configuration
      const progress = await this.getWizardProgress(tenantId);
      
      if (!progress || !progress.configuracionTemporal) {
        throw new Error('No se encontró configuración temporal para guardar');
      }

      const config = progress.configuracionTemporal;
      this.logger.log(`Configuration data to save:`, config);

      // 2. Save RUC, company data AND certificate to empresa_config
      this.logger.log(`Saving all configuration to empresa_config...`);
      
      // Convert base64 certificate to Buffer for bytea storage
      let certificateBuffer = null;
      if (config.certificateBase64) {
        certificateBuffer = Buffer.from(config.certificateBase64, 'base64');
      }
      
      const { error: empresaError } = await this.supabaseService
        .getClient()
        .from('empresa_config')
        .upsert({
          tenant_id: tenantId,
          ruc: config.ruc,
          razon_social: config.razonSocial,
          direccion_fiscal: config.direccion,
          certificado_pfx: certificateBuffer,
          certificado_password: config.certificatePassword,
          configuracion_completa: true,
          // Nuevos campos de configuración de ventas
          tipo_empresa: config.tipo_empresa || 'MICRO',
          usar_flujo_logistica: config.usar_flujo_logistica !== undefined ? config.usar_flujo_logistica : false,
          gre_obligatorio: config.gre_obligatorio !== undefined ? config.gre_obligatorio : false,
          gre_automatico_habilitado: config.gre_automatico_habilitado !== undefined ? config.gre_automatico_habilitado : true,
          umbral_gre_automatico: config.umbral_gre_automatico || 700,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'tenant_id'
        });

      if (empresaError) {
        this.logger.error(`Error saving empresa_config:`, empresaError);
        throw empresaError;
      }
      
      this.logger.log(`✅ All configuration saved to empresa_config`);


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
}
