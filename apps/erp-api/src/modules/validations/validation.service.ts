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
  ValidateDniLookupDto,
  DniLookupResult,
} from './validation.types';
import { ColombiaValidationService } from './colombia-validation.service';
import { normalizeCertificateInput, parseCertificateBuffer } from '../../shared/utils/certificate.utils';
import { verificarTitularidadCertificado } from '../../shared/utils/certificado-ruc-peru.util';
import * as crypto from 'crypto';
import { ApiPeruService } from './apiperu.service';
import { ConfigService } from '@nestjs/config';
import { validateArgentinaCuit } from '../paises/initial-country';

@Injectable()
export class ValidationService {
  private readonly logger = new Logger(ValidationService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly colombiaValidationService: ColombiaValidationService,
    private readonly apiPeruService: ApiPeruService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Validate certificate existence, format, and expiration
   */
  async validateCertificate(tenantId: string): Promise<CertificateValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let isValid = true;
    let expiresAt: Date | undefined;
    let daysUntilExpiration: number | undefined;
    let rucMatches: boolean | undefined;
    let rucsEnCertificado: string[] = [];

    try {
      // Get certificate from empresa_config
      const { data: empresa, error } = await this.supabaseService
        .getClient()
        .from('empresa_config')
        .select('certificado_pfx, certificado_password, certificado_expira_en, ruc, pais, sunat_cert_expected_ruc, sunat_environment, arca_cuit_representada, arca_environment')
        .eq('tenant_id', tenantId)
        .single();

      if (error || !empresa) {
        this.logger.warn(`Certificate not found for tenant: ${tenantId}`);
        errors.push('No se encontró configuración de certificado para esta empresa');
        isValid = false;
        return { isValid, errors, warnings };
      }

      const certificadoBuffer = this.decryptCertificate(empresa.certificado_pfx);

      this.logger.log(
        `[ValidationService] certificado_pfx type=${typeof empresa.certificado_pfx} bufferLength=${
          certificadoBuffer?.length ?? 'null'
        } for tenant ${tenantId}`,
      );

      if (!certificadoBuffer) {
        errors.push('No se ha cargado un certificado digital válido');
        isValid = false;
        return { isValid, errors, warnings };
      }

      const password = this.decryptText(empresa.certificado_password);

      try {
        const metadata = parseCertificateBuffer(certificadoBuffer, password || '');
        expiresAt = metadata.validTo;

        // Que cargue y no este vencido no basta: SUNAT solo acepta el
        // certificado del contribuyente que emite. Sin esta comprobacion el
        // estado daba "valido" a un certificado de otro titular.
        const esArgentina = String(empresa.pais || '').toUpperCase() === 'AR';
        const rucEmisor = esArgentina
          ? empresa.arca_cuit_representada || empresa.ruc || null
          : empresa.sunat_cert_expected_ruc || empresa.ruc || null;
        const titularidad = esArgentina
          ? (() => {
              const candidates = metadata.subject.match(/(?<!\d)\d{11}(?!\d)/g) ?? [];
              const ids = [...new Set(candidates.filter(validateArgentinaCuit))];
              const coincide = Boolean(
                rucEmisor && ids.includes(String(rucEmisor).replace(/\D/g, '')),
              );
              return {
                coincide,
                rucsEnCertificado: ids,
                error: coincide
                  ? undefined
                  : 'El certificado no declara el CUIT representado ante ARCA.',
              };
            })()
          : verificarTitularidadCertificado(metadata.subject, rucEmisor);
        rucMatches = titularidad.coincide;
        rucsEnCertificado = titularidad.rucsEnCertificado;

        if (!titularidad.coincide) {
          // Misma politica que el preflight de emision: en homologacion se
          // avisa y se deja seguir probando, porque no se emite nada real;
          // en produccion es requisito duro y bloquea.
          const enProduccion = String(
            esArgentina ? empresa.arca_environment : empresa.sunat_environment,
          ).trim().toLowerCase() === 'produccion';

          if (enProduccion) {
            errors.push(titularidad.error as string);
            isValid = false;
          } else {
            warnings.push(`${titularidad.error} Se permite seguir en homologacion, pero produccion quedara bloqueada.`);
          }
        }

        const now = new Date();
        const diffTime = metadata.validTo.getTime() - now.getTime();
        daysUntilExpiration = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (daysUntilExpiration < 0) {
          errors.push(`El certificado digital ha vencido el ${metadata.validTo.toLocaleDateString()}`);
          isValid = false;
        } else if (daysUntilExpiration <= 30) {
          warnings.push(
            `El certificado digital vencerá en ${daysUntilExpiration} días (${metadata.validTo.toLocaleDateString()})`,
          );
        }
      } catch (certError) {
        this.logger.error(`Error leyendo certificado para tenant ${tenantId}:`, certError);
        errors.push(
          certError instanceof Error ? certError.message : 'No se pudo validar el certificado digital',
        );
        isValid = false;
      }

      this.logger.log(
        `Certificate validation for tenant ${tenantId}: ${isValid ? 'VALID' : 'INVALID'}`,
      );

      return {
        isValid,
        expiresAt,
        daysUntilExpiration,
        rucMatches,
        rucsEnCertificado,
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

  private getCertKeys(): Buffer[] {
    const keys: Buffer[] = [];
    const main =
      this.configService.get<string>('CERT_ENCRYPTION_KEY') ??
      this.configService.get<string>('ENCRYPTION_KEY');
    const old = this.configService.get<string>('CERT_ENCRYPTION_KEY_OLD');

    if (main && main.length >= 32) {
      keys.push(crypto.createHash('sha256').update(main).digest());
    }
    if (old && old.length >= 32) {
      keys.push(crypto.createHash('sha256').update(old).digest());
    }

    if (!keys.length) {
      throw new Error('CERT_ENCRYPTION_KEY no configurada o demasiado corta (min 32 chars)');
    }
    return keys;
  }

  private decryptCertificate(input: any): Buffer | null {
    const raw = normalizeCertificateInput(input);
    if (!raw || raw.length < 12 + 16) {
      return normalizeCertificateInput(input); // fallback si no está cifrado
    }

    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const data = raw.subarray(28);

    const keys = this.getCertKeys();
    for (const key of keys) {
      try {
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
        return decrypted;
      } catch {
        /* intentar siguiente clave */
      }
    }

    this.logger.warn('⚠️ No se pudo descifrar certificado, se usará valor crudo.');
    return normalizeCertificateInput(input);
  }

  private decryptText(input: string | null | undefined): string {
    if (!input) return '';
    const raw = Buffer.from(input, 'base64');
    if (raw.length < 12 + 16) return input;
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const data = raw.subarray(28);

    const keys = this.getCertKeys();
    for (const key of keys) {
      try {
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        const decrypted = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
        return decrypted;
      } catch {
        /* intentar siguiente clave */
      }
    }

    this.logger.warn('⚠️ No se pudo descifrar contraseña, se usará tal cual.');
    return input;
  }

  /**
   * Consulta DNI vía ApiPeru.dev (padrón público)
   */
  async lookupDni(dto: ValidateDniLookupDto): Promise<DniLookupResult> {
    return this.apiPeruService.lookupDni(dto.dni);
  }

  /**
   * Validate RUC/NIT configuration completeness and format (multi-country support)
   */
  async validateRucConfiguration(tenantId: string): Promise<RucValidationResult> {
    const errors: string[] = [];
    const missingFields: string[] = [];
    let isValid = true;

    try {
      // Single roundtrip a Supabase: con la FK empresa_config.pais_id → paises.id
      // (migración 171), podemos embeber el join. Antes eran 2 queries
      // secuenciales (~2s contra Supabase remoto); ahora es 1 (~1s).
      const { data: empresa, error } = await this.supabaseService
        .getClient()
        .from('empresa_config')
        .select('ruc, razon_social, direccion_fiscal, pais_id, paises:paises!empresa_config_pais_id_fkey(codigo_iso, nombre)')
        .eq('tenant_id', tenantId)
        .single();

      if (error || !empresa) {
        this.logger.warn(`Empresa config not found for tenant: ${tenantId}`);
        errors.push('No se encontró configuración de empresa');
        isValid = false;
        return { isValid, missingFields, errors };
      }

      // `paises` viene como objeto (single FK) o null si pais_id es null/orphan.
      const paisEmbed = (empresa as any).paises as { codigo_iso?: string; nombre?: string } | null;
      const paisCodigo = paisEmbed?.codigo_iso || 'PE'; // Default to Peru

      // Check required fields
      if (!empresa.ruc || empresa.ruc.trim() === '') {
        missingFields.push(
          paisCodigo === 'PE' ? 'RUC' : paisCodigo === 'AR' ? 'CUIT' : 'NIT',
        );
        isValid = false;
      } else {
        // Validate RUC/NIT format based on country
        const validationResult = this.validateTaxIdFormat(empresa.ruc, paisCodigo);
        if (!validationResult.isValid) {
          errors.push(validationResult.error);
          isValid = false;
        }
      }

      if (!empresa.razon_social || empresa.razon_social.trim() === '') {
        missingFields.push('Razón Social');
        isValid = false;
      }

      const direccionFiscal = empresa.direccion_fiscal?.trim();

      if (!direccionFiscal) {
        missingFields.push('Dirección Fiscal');
        isValid = false;
      }

      if (missingFields.length > 0) {
        errors.push(`Campos requeridos faltantes: ${missingFields.join(', ')}`);
      }

      this.logger.log(
        `Tax ID validation for tenant ${tenantId} (${paisCodigo}): ${isValid ? 'VALID' : 'INVALID'}`,
      );

      return {
        isValid,
        missingFields,
        errors,
      };
    } catch (error) {
      this.logger.error(`Error validating tax ID for tenant ${tenantId}:`, error);
      errors.push('Error al validar la configuración fiscal');
      return {
        isValid: false,
        missingFields,
        errors,
      };
    }
  }

  /**
   * Validate tax ID format based on country
   */
  private validateTaxIdFormat(taxId: string, countryCode: string): { isValid: boolean; error?: string } {
    switch (countryCode) {
      case 'PE': // Peru - RUC
        const rucPattern = /^\d{11}$/;
        if (!rucPattern.test(taxId)) {
          return { isValid: false, error: 'El RUC debe tener exactamente 11 dígitos numéricos' };
        }
        return { isValid: true };

      case 'CO': // Colombia - NIT (use dedicated service)
        return this.colombiaValidationService.validateNIT(taxId);

      case 'AR':
        return validateArgentinaCuit(taxId)
          ? { isValid: true }
          : { isValid: false, error: 'El CUIT debe tener 11 dígitos y dígito verificador válido' };

      case 'CL': // Chile - RUT
        const rutPattern = /^\d{7,8}-[\dkK]$/;
        if (!rutPattern.test(taxId)) {
          return { isValid: false, error: 'El RUT debe tener formato 12345678-9 o 12345678-K' };
        }
        return { isValid: true };

      case 'MX': // Mexico - RFC
        const rfcPattern = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;
        if (!rfcPattern.test(taxId)) {
          return { isValid: false, error: 'El RFC debe tener formato válido (ej: ABC123456XYZ)' };
        }
        return { isValid: true };

      default:
        // For unknown countries, just check it's not empty
        return { isValid: taxId.length > 0 };
    }
  }

  /**
   * Validate document before emission according to fiscal rules (multi-country support)
   */
  async validateDocumentBeforeEmission(
    document: ValidateDocumentDto,
    tenantId?: string,
  ): Promise<DocumentValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    let isValid = true;

    try {
      // Get country-specific limits if tenantId provided
      let maxItems = 999; // Default SUNAT limit
      let maxAmount = 999999999.99; // Default SUNAT limit
      let fiscalAuthority = 'SUNAT';

      if (tenantId) {
        const { data: empresa } = await this.supabaseService
          .getClient()
          .from('empresa_config')
          .select('pais_id')
          .eq('tenant_id', tenantId)
          .single();

        if (empresa?.pais_id) {
          const { data: config } = await this.supabaseService
            .getClient()
            .from('configuracion_fiscal')
            .select('max_items_por_documento, monto_maximo_documento')
            .eq('pais_id', empresa.pais_id)
            .single();

          if (config) {
            maxItems = config.max_items_por_documento || maxItems;
            maxAmount = config.monto_maximo_documento || maxAmount;
          }

          // Get country name for messages
          const { data: pais } = await this.supabaseService
            .getClient()
            .from('paises')
            .select('codigo_iso')
            .eq('id', empresa.pais_id)
            .single();

          fiscalAuthority =
            pais?.codigo_iso === 'CO'
              ? 'DIAN'
              : pais?.codigo_iso === 'AR'
                ? 'ARCA'
                : 'SUNAT';
        }
      }

      // Validate item count
      if (document.items && document.items.length > maxItems) {
        errors.push({
          field: 'items',
          code: ValidationErrorCode.ITEMS_LIMIT_EXCEEDED,
          message: `El documento excede el límite de ${maxItems} items permitidos por ${fiscalAuthority} (actual: ${document.items.length})`,
          severity: 'error',
        });
        isValid = false;
      }

      // Validate amount limits
      if (document.total) {
        if (document.total > maxAmount) {
          errors.push({
            field: 'total',
            code: ValidationErrorCode.AMOUNT_LIMIT_EXCEEDED,
            message: `El monto total excede el límite máximo permitido por ${fiscalAuthority} (${maxAmount.toFixed(2)})`,
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
