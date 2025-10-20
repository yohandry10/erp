import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import {
  CertificateValidationResult,
  RucValidationResult,
  DocumentValidationResult,
  ValidationError,
  ValidationWarning,
  ValidationErrorCode,
  ValidateDocumentDto,
} from './validation.types';

@Injectable()
export class ValidationService {
  private readonly logger = new Logger(ValidationService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Validate certificate existence, format, and expiration
   */
  async validateCertificate(tenantId: string): Promise<CertificateValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let isValid = true;
    let expiresAt: Date | undefined;
    let daysUntilExpiration: number | undefined;

    try {
      // Get certificate from empresa_config
      const { data: empresa, error } = await this.supabaseService
        .getClient()
        .from('empresa_config')
        .select('certificado_pfx, certificado_password, certificado_expira_en')
        .eq('tenant_id', tenantId)
        .single();

      if (error || !empresa) {
        this.logger.warn(`Certificate not found for tenant: ${tenantId}`);
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

      // Validate certificate format (should be Buffer/binary data or base64 string)
      if (!Buffer.isBuffer(empresa.certificado_pfx) && typeof empresa.certificado_pfx !== 'string') {
        errors.push('El formato del certificado no es válido (debe ser PFX/P12)');
        isValid = false;
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

      // Check password existence
      if (!empresa.certificado_password) {
        warnings.push('No se ha configurado la contraseña del certificado');
      }

      this.logger.log(
        `Certificate validation for tenant ${tenantId}: ${isValid ? 'VALID' : 'INVALID'}`,
      );

      return {
        isValid,
        expiresAt,
        daysUntilExpiration,
        errors,
        warnings,
      };
    } catch (error) {
      this.logger.error(`Error validating certificate for tenant ${tenantId}:`, error);
      errors.push('Error al validar el certificado digital');
      return {
        isValid: false,
        errors,
        warnings,
      };
    }
  }

  /**
   * Validate RUC configuration completeness and format
   */
  async validateRucConfiguration(tenantId: string): Promise<RucValidationResult> {
    const errors: string[] = [];
    const missingFields: string[] = [];
    let isValid = true;

    try {
      // Get empresa configuration
      const { data: empresa, error } = await this.supabaseService
        .getClient()
        .from('empresa_config')
        .select('ruc, razon_social, direccion')
        .eq('tenant_id', tenantId)
        .single();

      if (error || !empresa) {
        this.logger.warn(`Empresa config not found for tenant: ${tenantId}`);
        errors.push('No se encontró configuración de empresa');
        isValid = false;
        return { isValid, missingFields, errors };
      }

      // Check required fields
      if (!empresa.ruc || empresa.ruc.trim() === '') {
        missingFields.push('RUC');
        isValid = false;
      } else {
        // Validate RUC format (11 digits for Peru)
        const rucPattern = /^\d{11}$/;
        if (!rucPattern.test(empresa.ruc)) {
          errors.push('El RUC debe tener exactamente 11 dígitos numéricos');
          isValid = false;
        }
      }

      if (!empresa.razon_social || empresa.razon_social.trim() === '') {
        missingFields.push('Razón Social');
        isValid = false;
      }

      if (!empresa.direccion || empresa.direccion.trim() === '') {
        missingFields.push('Dirección');
        isValid = false;
      }

      if (missingFields.length > 0) {
        errors.push(`Campos requeridos faltantes: ${missingFields.join(', ')}`);
      }

      this.logger.log(
        `RUC validation for tenant ${tenantId}: ${isValid ? 'VALID' : 'INVALID'}`,
      );

      return {
        isValid,
        missingFields,
        errors,
      };
    } catch (error) {
      this.logger.error(`Error validating RUC for tenant ${tenantId}:`, error);
      errors.push('Error al validar la configuración del RUC');
      return {
        isValid: false,
        missingFields,
        errors,
      };
    }
  }

  /**
   * Validate document before emission according to SUNAT rules
   */
  async validateDocumentBeforeEmission(
    document: ValidateDocumentDto,
  ): Promise<DocumentValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    let isValid = true;

    try {
      // Validate item count (max 999 items per SUNAT)
      if (document.items && document.items.length > 999) {
        errors.push({
          field: 'items',
          code: ValidationErrorCode.ITEMS_LIMIT_EXCEEDED,
          message: `El documento excede el límite de 999 items permitidos por SUNAT (actual: ${document.items.length})`,
          severity: 'error',
        });
        isValid = false;
      }

      // Validate amount limits according to SUNAT rules
      // For boletas: max S/ 700 without customer identification
      // For facturas: no specific limit but validate reasonable amounts
      if (document.total) {
        const maxAmount = 999999999.99; // Maximum amount supported by SUNAT
        if (document.total > maxAmount) {
          errors.push({
            field: 'total',
            code: ValidationErrorCode.AMOUNT_LIMIT_EXCEEDED,
            message: `El monto total excede el límite máximo permitido por SUNAT (S/ ${maxAmount.toFixed(2)})`,
            severity: 'error',
          });
          isValid = false;
        }

        if (document.total < 0) {
          errors.push({
            field: 'total',
            code: ValidationErrorCode.AMOUNT_LIMIT_EXCEEDED,
            message: 'El monto total no puede ser negativo',
            severity: 'error',
          });
          isValid = false;
        }
      }

      // Validate serie format (4 alphanumeric characters)
      if (document.serie) {
        const seriePattern = /^[A-Z0-9]{4}$/;
        if (!seriePattern.test(document.serie)) {
          errors.push({
            field: 'serie',
            code: ValidationErrorCode.INVALID_SERIE_FORMAT,
            message: 'La serie debe tener exactamente 4 caracteres alfanuméricos en mayúsculas (ej: F001, B001)',
            severity: 'error',
          });
          isValid = false;
        }
      }

      // Validate correlative number format (max 8 digits)
      if (document.correlativo) {
        const correlativoStr = document.correlativo.toString();
        if (!/^\d+$/.test(correlativoStr)) {
          errors.push({
            field: 'correlativo',
            code: ValidationErrorCode.INVALID_CORRELATIVE_FORMAT,
            message: 'El número correlativo debe ser numérico',
            severity: 'error',
          });
          isValid = false;
        } else if (correlativoStr.length > 8) {
          errors.push({
            field: 'correlativo',
            code: ValidationErrorCode.INVALID_CORRELATIVE_FORMAT,
            message: 'El número correlativo no puede exceder 8 dígitos',
            severity: 'error',
          });
          isValid = false;
        }
      }

      // Add warnings for edge cases
      if (document.items && document.items.length > 500) {
        warnings.push({
          field: 'items',
          code: 'DOC_WARN_001',
          message: `El documento tiene ${document.items.length} items. Considere dividir en múltiples documentos para mejor rendimiento`,
        });
      }

      this.logger.log(
        `Document validation: ${isValid ? 'VALID' : 'INVALID'} (${errors.length} errors, ${warnings.length} warnings)`,
      );

      return {
        isValid,
        errors,
        warnings,
      };
    } catch (error) {
      this.logger.error('Error validating document:', error);
      errors.push({
        field: 'general',
        code: 'DOC_ERROR_001',
        message: 'Error al validar el documento',
        severity: 'error',
      });
      return {
        isValid: false,
        errors,
        warnings,
      };
    }
  }

  /**
   * Get overall validation status for a tenant
   */
  async getValidationStatus(tenantId: string) {
    const certificate = await this.validateCertificate(tenantId);
    const ruc = await this.validateRucConfiguration(tenantId);

    let overallStatus: 'complete' | 'incomplete' | 'warning' = 'complete';

    if (!certificate.isValid || !ruc.isValid) {
      overallStatus = 'incomplete';
    } else if (certificate.warnings.length > 0) {
      overallStatus = 'warning';
    }

    return {
      certificate,
      ruc,
      overallStatus,
    };
  }
}
