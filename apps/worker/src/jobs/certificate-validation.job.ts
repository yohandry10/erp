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

interface CertificateValidationResult {
  isValid: boolean;
  expiresAt?: Date;
  daysUntilExpiration?: number;
  errors: string[];
  warnings: string[];
}

/**
 * Validate certificate for a specific tenant
 */
async function validateTenantCertificate(tenantId: string): Promise<CertificateValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  let isValid = true;
  let expiresAt: Date | undefined;
  let daysUntilExpiration: number | undefined;

  try {
    // Get certificate from empresa_config
    const { data: empresa, error } = await supabase
      .from('empresa_config')
      .select('certificado_pfx, certificado_password, certificado_expira_en')
      .eq('tenant_id', tenantId)
      .single();

    if (error || !empresa) {
      logger.warn(`Certificate not found for tenant: ${tenantId}`);
      errors.push('No se encontró configuración de certificado para esta empresa');
      isValid = false;
      return { isValid, errors, warnings };
    }

    // Check certificate existence
    if (!empresa.certificado_pfx) {
      errors.push('No se ha cargado un certificado digital');
      isValid = false;
      return { isValid, errors, warnings };
    }

    // Check expiration date
    if (empresa.certificado_expira_en) {
      expiresAt = new Date(empresa.certificado_expira_en);
      const now = new Date();
      const diffTime = expiresAt.getTime() - now.getTime();
      daysUntilExpiration = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (daysUntilExpiration < 0) {
        errors.push(`El certificado digital ha vencido el ${expiresAt.toLocaleDateString()}`);
        isValid = false;
      } else if (daysUntilExpiration <= 30) {
        warnings.push(
          `El certificado digital vencerá en ${daysUntilExpiration} días (${expiresAt.toLocaleDateString()})`,
        );
      }
    }

    return {
      isValid,
      expiresAt,
      daysUntilExpiration,
      errors,
      warnings,
    };
  } catch (error) {
    logger.error(`Error validating certificate for tenant ${tenantId}:`, error);
    errors.push('Error al validar el certificado digital');
    return {
      isValid: false,
      errors,
      warnings,
    };
  }
}

/**
 * Create notification for certificate issues
 */
async function createCertificateNotification(
  tenantId: string,
  type: 'expiring' | 'expired',
  daysUntilExpiration?: number,
  expiresAt?: Date
): Promise<void> {
  try {
    let title: string;
    let message: string;
    let severity: 'warning' | 'error';
    let notificationType: string;

    if (type === 'expired') {
      title = 'Certificado Digital Vencido';
      message = `Su certificado digital ha vencido${expiresAt ? ` el ${expiresAt.toLocaleDateString()}` : ''}. No podrá emitir documentos electrónicos hasta que renueve su certificado.`;
      severity = 'error';
      notificationType = 'certificate_expired';
    } else {
      title = 'Certificado Digital Próximo a Vencer';
      message = `Su certificado digital vencerá en ${daysUntilExpiration} días${expiresAt ? ` (${expiresAt.toLocaleDateString()})` : ''}. Por favor, renueve su certificado para evitar interrupciones en la emisión de documentos.`;
      severity = 'warning';
      notificationType = 'certificate_expiring';
    }

    // Check if notification already exists for today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const { data: existingNotifications } = await supabase
      .from('notificaciones')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('tipo', notificationType)
      .gte('created_at', today.toISOString())
      .limit(1);

    if (existingNotifications && existingNotifications.length > 0) {
      logger.info(`Certificate notification already exists for tenant ${tenantId} today`);
      return;
    }

    // Create notification
    const { error } = await supabase
      .from('notificaciones')
      .insert({
        tenant_id: tenantId,
        tipo: notificationType,
        severidad: severity,
        titulo: title,
        mensaje: message,
        action_url: '/dashboard/wizard',
        action_label: 'Renovar Certificado',
        leida: false,
        created_at: new Date().toISOString()
      });

    if (error) {
      logger.error(`Error creating certificate notification for tenant ${tenantId}:`, error);
    } else {
      logger.info(`Certificate notification created for tenant ${tenantId}: ${type}`);
    }
  } catch (error) {
    logger.error(`Failed to create certificate notification for tenant ${tenantId}:`, error);
  }
}

/**
 * Update empresa_config with validation results
 */
async function updateEmpresaConfigValidation(
  tenantId: string,
  validationResult: CertificateValidationResult
): Promise<void> {
  try {
    const updateData: any = {
      fecha_validacion_certificado: new Date().toISOString(),
      ultima_validacion: new Date().toISOString(),
    };

    if (validationResult.expiresAt) {
      updateData.certificado_expira_en = validationResult.expiresAt.toISOString();
    }

    if (!validationResult.isValid || validationResult.warnings.length > 0) {
      updateData.errores_configuracion = {
        certificate: {
          errors: validationResult.errors,
          warnings: validationResult.warnings,
          lastChecked: new Date().toISOString()
        }
      };
    }

    const { error } = await supabase
      .from('empresa_config')
      .update(updateData)
      .eq('tenant_id', tenantId);

    if (error) {
      logger.error(`Error updating empresa_config for tenant ${tenantId}:`, error);
    } else {
      logger.info(`Updated empresa_config validation results for tenant ${tenantId}`);
    }
  } catch (error) {
    logger.error(`Failed to update empresa_config for tenant ${tenantId}:`, error);
  }
}

/**
 * Main job function: Validate certificates for all tenants
 */
export async function runCertificateValidationJob(): Promise<void> {
  logger.info('🔐 [Job] Starting certificate validation job...');

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

    logger.info(`Found ${tenants.length} active tenants to validate`);

    let validatedCount = 0;
    let expiringSoonCount = 0;
    let expiredCount = 0;
    let errorCount = 0;

    // Validate each tenant's certificate
    for (const tenant of tenants) {
      try {
        logger.info(`Validating certificate for tenant: ${tenant.nombre} (${tenant.id})`);
        
        const validationResult = await validateTenantCertificate(tenant.id);
        
        // Update empresa_config with validation results
        await updateEmpresaConfigValidation(tenant.id, validationResult);

        if (!validationResult.isValid) {
          // Certificate is expired
          if (validationResult.daysUntilExpiration !== undefined && validationResult.daysUntilExpiration < 0) {
            await createCertificateNotification(
              tenant.id,
              'expired',
              validationResult.daysUntilExpiration,
              validationResult.expiresAt
            );
            expiredCount++;
          }
          errorCount++;
        } else if (validationResult.warnings.length > 0) {
          // Certificate is expiring soon (< 30 days)
          if (validationResult.daysUntilExpiration !== undefined && validationResult.daysUntilExpiration <= 30) {
            await createCertificateNotification(
              tenant.id,
              'expiring',
              validationResult.daysUntilExpiration,
              validationResult.expiresAt
            );
            expiringSoonCount++;
          }
        }

        validatedCount++;
      } catch (error) {
        logger.error(`Error validating certificate for tenant ${tenant.id}:`, error);
        errorCount++;
      }
    }

    logger.info(`✅ [Job] Certificate validation job completed`);
    logger.info(`   - Tenants validated: ${validatedCount}/${tenants.length}`);
    logger.info(`   - Certificates expiring soon: ${expiringSoonCount}`);
    logger.info(`   - Certificates expired: ${expiredCount}`);
    logger.info(`   - Errors: ${errorCount}`);
  } catch (error) {
    logger.error('❌ [Job] Certificate validation job failed:', error);
    throw error;
  }
}
