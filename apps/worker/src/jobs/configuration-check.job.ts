import { createClient } from '@supabase/supabase-js';
import winston from 'winston';

// Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    }),
  ],
});

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface ConfigurationStatus {
  isComplete: boolean;
  completionPercentage: number;
  missingItems: string[];
  certificate: {
    exists: boolean;
    isValid: boolean;
    expiresAt?: Date;
  };
  ruc: {
    isConfigured: boolean;
    missingFields: string[];
  };
}

/**
 * Check configuration completeness for a specific tenant
 */
async function checkTenantConfiguration(tenantId: string): Promise<ConfigurationStatus> {
  const missingItems: string[] = [];
  let completionPercentage = 0;
  const totalChecks = 5; // Total number of configuration checks
  let completedChecks = 0;

  try {
    // Get empresa configuration
    const { data: empresa, error } = await supabase
      .from('empresa_config')
      .select('ruc, razon_social, direccion, certificado_pfx, certificado_expira_en')
      .eq('tenant_id', tenantId)
      .single();

    if (error || !empresa) {
      logger.warn(`Empresa config not found for tenant: ${tenantId}`);
      return {
        isComplete: false,
        completionPercentage: 0,
        missingItems: ['Configuración de empresa no encontrada'],
        certificate: {
          exists: false,
          isValid: false,
        },
        ruc: {
          isConfigured: false,
          missingFields: ['RUC', 'Razón Social', 'Dirección'],
        },
      };
    }

    // Check RUC
    const rucMissingFields: string[] = [];
    if (!empresa.ruc || empresa.ruc.trim() === '') {
      missingItems.push('RUC');
      rucMissingFields.push('RUC');
    } else {
      // Validate RUC format (11 digits for Peru)
      const rucPattern = /^\d{11}$/;
      if (rucPattern.test(empresa.ruc)) {
        completedChecks++;
      } else {
        missingItems.push('RUC válido (debe tener 11 dígitos)');
        rucMissingFields.push('RUC válido');
      }
    }

    // Check Razón Social
    if (!empresa.razon_social || empresa.razon_social.trim() === '') {
      missingItems.push('Razón Social');
      rucMissingFields.push('Razón Social');
    } else {
      completedChecks++;
    }

    // Check Dirección
    if (!empresa.direccion || empresa.direccion.trim() === '') {
      missingItems.push('Dirección');
      rucMissingFields.push('Dirección');
    } else {
      completedChecks++;
    }

    // Check Certificate existence
    const certificateExists = !!empresa.certificado_pfx;
    if (certificateExists) {
      completedChecks++;
    } else {
      missingItems.push('Certificado Digital');
    }

    // Check Certificate validity
    let certificateIsValid = false;
    let certificateExpiresAt: Date | undefined;
    
    if (certificateExists && empresa.certificado_expira_en) {
      certificateExpiresAt = new Date(empresa.certificado_expira_en);
      const now = new Date();
      const diffTime = certificateExpiresAt.getTime() - now.getTime();
      const daysUntilExpiration = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (daysUntilExpiration >= 0) {
        certificateIsValid = true;
        completedChecks++;
      } else {
        missingItems.push('Certificado Digital válido (vencido)');
      }
    } else if (certificateExists) {
      // Certificate exists but no expiration date
      completedChecks++;
      certificateIsValid = true;
    }

    completionPercentage = Math.round((completedChecks / totalChecks) * 100);

    return {
      isComplete: completedChecks === totalChecks,
      completionPercentage,
      missingItems,
      certificate: {
        exists: certificateExists,
        isValid: certificateIsValid,
        expiresAt: certificateExpiresAt,
      },
      ruc: {
        isConfigured: rucMissingFields.length === 0,
        missingFields: rucMissingFields,
      },
    };
  } catch (error) {
    logger.error(`Error checking configuration for tenant ${tenantId}:`, error);
    return {
      isComplete: false,
      completionPercentage: 0,
      missingItems: ['Error al verificar configuración'],
      certificate: {
        exists: false,
        isValid: false,
      },
      ruc: {
        isConfigured: false,
        missingFields: [],
      },
    };
  }
}

/**
 * Create notification for incomplete configuration
 */
async function createConfigurationNotification(
  tenantId: string,
  configStatus: ConfigurationStatus
): Promise<void> {
  try {
    // Check if notification already exists for today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const { data: existingNotifications } = await supabase
      .from('notificaciones')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('tipo', 'configuration_incomplete')
      .gte('created_at', today.toISOString())
      .limit(1);

    if (existingNotifications && existingNotifications.length > 0) {
      logger.info(`Configuration notification already exists for tenant ${tenantId} today`);
      return;
    }

    const title = 'Configuración Incompleta';
    const message = `Su configuración está ${configStatus.completionPercentage}% completa. Faltan: ${configStatus.missingItems.join(', ')}. Complete la configuración para poder emitir documentos electrónicos.`;

    // Create notification
    const { error } = await supabase
      .from('notificaciones')
      .insert({
        tenant_id: tenantId,
        tipo: 'configuration_incomplete',
        severidad: 'warning',
        titulo: title,
        mensaje: message,
        action_url: '/dashboard/wizard',
        action_label: 'Completar Configuración',
        leida: false,
        created_at: new Date().toISOString()
      });

    if (error) {
      logger.error(`Error creating configuration notification for tenant ${tenantId}:`, error);
    } else {
      logger.info(`Configuration notification created for tenant ${tenantId}`);
    }
  } catch (error) {
    logger.error(`Failed to create configuration notification for tenant ${tenantId}:`, error);
  }
}

/**
 * Update empresa_config with configuration status
 */
async function updateEmpresaConfigStatus(
  tenantId: string,
  configStatus: ConfigurationStatus
): Promise<void> {
  try {
    const updateData: any = {
      configuracion_completa: configStatus.isComplete,
      ultima_validacion: new Date().toISOString(),
    };

    if (!configStatus.isComplete) {
      updateData.errores_configuracion = {
        configuration: {
          completionPercentage: configStatus.completionPercentage,
          missingItems: configStatus.missingItems,
          lastChecked: new Date().toISOString()
        }
      };
    } else {
      // Clear errors if configuration is complete
      updateData.errores_configuracion = null;
    }

    const { error } = await supabase
      .from('empresa_config')
      .update(updateData)
      .eq('tenant_id', tenantId);

    if (error) {
      logger.error(`Error updating empresa_config status for tenant ${tenantId}:`, error);
    } else {
      logger.info(`Updated empresa_config status for tenant ${tenantId}: ${configStatus.isComplete ? 'COMPLETE' : 'INCOMPLETE'}`);
    }
  } catch (error) {
    logger.error(`Failed to update empresa_config status for tenant ${tenantId}:`, error);
  }
}

/**
 * Main job function: Check configuration completeness for all tenants
 */
export async function runConfigurationCheckJob(): Promise<void> {
  logger.info('⚙️ [Job] Starting configuration check job...');

  try {
    // Get all active tenants
    const { data: tenants, error } = await supabase
      .from('tenants')
      .select('id, nombre')
      .eq('activo', true);

    if (error) {
      logger.error('Error fetching tenants:', error);
      return;
    }

    if (!tenants || tenants.length === 0) {
      logger.info('No active tenants found');
      return;
    }

    logger.info(`Found ${tenants.length} active tenants to check`);

    let checkedCount = 0;
    let completeCount = 0;
    let incompleteCount = 0;
    let errorCount = 0;

    // Check each tenant's configuration
    for (const tenant of tenants) {
      try {
        logger.info(`Checking configuration for tenant: ${tenant.nombre} (${tenant.id})`);
        
        const configStatus = await checkTenantConfiguration(tenant.id);
        
        // Update empresa_config with configuration status
        await updateEmpresaConfigStatus(tenant.id, configStatus);

        if (!configStatus.isComplete) {
          // Create notification for incomplete configuration
          await createConfigurationNotification(tenant.id, configStatus);
          incompleteCount++;
        } else {
          completeCount++;
        }

        checkedCount++;
      } catch (error) {
        logger.error(`Error checking configuration for tenant ${tenant.id}:`, error);
        errorCount++;
      }
    }

    logger.info(`✅ [Job] Configuration check job completed`);
    logger.info(`   - Tenants checked: ${checkedCount}/${tenants.length}`);
    logger.info(`   - Complete configurations: ${completeCount}`);
    logger.info(`   - Incomplete configurations: ${incompleteCount}`);
    logger.info(`   - Errors: ${errorCount}`);
  } catch (error) {
    logger.error('❌ [Job] Configuration check job failed:', error);
    throw error;
  }
}
