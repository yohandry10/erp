import { BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CertificateOwnershipError, SigningOptions, XmlSigner } from '@erp-suite/crypto';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { normalizeCertificateInput } from '../../shared/utils/certificate.utils';
import {
  canUseRuntimeDemoCertificate,
  loadRuntimeDemoCertificate,
} from '../../shared/utils/demo-certificate.utils';
import * as crypto from 'crypto';
import { validateArgentinaCuit } from '../paises/initial-country';

/** Resuelve, descifra y valida el certificado de firma de un tenant. */
export class CpeCertificateService {
  private readonly logger = new Logger(CpeCertificateService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly configService: ConfigService,
  ) {}

async getXmlSigner(tenantId: string): Promise<XmlSigner> {
    let empresaConfig: any = null;
    try {
      // Obtener certificado del tenant desde la BD
      const { data: empresa, error } = await this.supabaseService.getClient()
        .from('empresa_config')
        .select('ruc, pais, is_demo, certificado_pfx, certificado_password, sunat_environment, sunat_cert_expected_ruc, sunat_cert_ruc_mismatch_confirmed, arca_environment, arca_cuit_representada, dian_environment')
        .eq('tenant_id', tenantId)
        .single();
      const typedEmpresa = empresa as any;
      if (error) {
        const readError: any = new Error(
          `No se pudo leer la configuración fiscal del tenant ${tenantId}: ${error.message}`,
        );
        readError.esErrorLecturaTenant = true;
        throw readError;
      }
      if (!typedEmpresa) {
        const readError: any = new Error(
          `No existe configuración fiscal para el tenant ${tenantId}`,
        );
        readError.esErrorLecturaTenant = true;
        throw readError;
      }
      empresaConfig = typedEmpresa;
      if (typedEmpresa.certificado_pfx) {
        console.log('🔐 Usando certificado del tenant:', tenantId);

        const certificadoBuffer = this.normalizeCertificateBuffer(typedEmpresa.certificado_pfx, typedEmpresa.certificado_password);

        if (!certificadoBuffer || certificadoBuffer.length === 0) {
          this.logger.warn(
            `El certificado almacenado para el tenant ${tenantId} no tiene un formato válido (string/base64/Buffer). La emisión se bloqueará.`,
          );
        } else {
          // Crear XmlSigner con el certificado del tenant
          try {
            return new XmlSigner({
              pfxBuffer: certificadoBuffer, // Buffer del certificado
              pfxPassword: this.decryptText(typedEmpresa.certificado_password) || '',
              ...this.getCertificateRucGuardOptions(typedEmpresa),
              allowDemoFallback: false,
            });
          } catch (error: any) {
            // Se marca el origen para que el catch exterior no lo confunda con
            // un fallo de lectura y lo derive al certificado global.
            error.esCertificadoDelTenant = true;
            throw error;
          }
        }
      }
    } catch (error) {
      // Si el tenant tiene certificado propio y falla, el problema es ese
      // certificado: caer al global lo haria firmar con uno ajeno sin avisar,
      // que es peor que no emitir. Solo se sigue al fallback cuando el fallo es
      // de lectura, no del certificado en si.
      if (error instanceof CertificateOwnershipError) {
        throw new BadRequestException(error.message);
      }
      if (error?.esCertificadoDelTenant) {
        throw new BadRequestException(
          `El certificado cargado para este tenant no se pudo usar: ${error.message}`,
        );
      }
      if (error?.esErrorLecturaTenant) {
        throw new BadRequestException(error.message);
      }
      console.warn('⚠️ Error obteniendo certificado del tenant:', error.message);
    }

    if (canUseRuntimeDemoCertificate(empresaConfig)) {
      try {
        const demoCertificate = loadRuntimeDemoCertificate(this.configService);
        this.logger.warn(
          `Usando certificado fiscal simulado para el tenant demo ${tenantId}; no es válido para producción`,
        );
        return new XmlSigner({
          pfxBuffer: demoCertificate.pfxBuffer,
          pfxPassword: demoCertificate.pfxPassword,
          ...this.getCertificateRucGuardOptions(empresaConfig),
          allowDemoFallback: false,
        });
      } catch (error) {
        this.logger.error(
          `No se pudo cargar el certificado fiscal simulado para el tenant demo ${tenantId}`,
          error,
        );
        throw new BadRequestException(
          'El certificado fiscal simulado de la demo no está disponible.',
        );
      }
    }

    if (empresaConfig?.is_demo === true) {
      throw new BadRequestException(
        'La demo no puede usar un certificado simulado con la configuración fiscal actual.',
      );
    }

    throw new BadRequestException(
      `No hay configuración de certificado fiscal para el tenant ${tenantId}. ` +
        'Cargue el certificado propio del contribuyente.',
    );
  }

private getCertificateRucGuardOptions(empresa?: any): Partial<SigningOptions> {
    const isTenantScoped = Boolean(empresa);
    const country = isTenantScoped
      ? String(empresa.pais || 'PE').trim().toUpperCase()
      : 'PE';
    if (!['PE', 'AR', 'CO'].includes(country)) {
      throw new BadRequestException('El país del tenant no admite firma fiscal en este ERP.');
    }

    const environment = isTenantScoped
      ? String(
          country === 'AR'
            ? empresa.arca_environment
            : country === 'CO'
              ? empresa.dian_environment
              : empresa.sunat_environment,
        ).trim().toLowerCase()
      : this.configService.get<string>('SUNAT_ENVIRONMENT', 'homologacion');
    if (
      isTenantScoped &&
      environment !== 'homologacion' &&
      environment !== 'produccion'
    ) {
      const authority = country === 'AR' ? 'ARCA' : country === 'CO' ? 'DIAN' : 'SUNAT';
      throw new BadRequestException(
        `El ambiente ${authority} del tenant debe ser homologacion o produccion.`,
      );
    }

    const rawTaxId = String(
      country === 'AR'
        ? empresa?.arca_cuit_representada || empresa?.ruc || ''
        : country === 'PE'
          ? empresa?.sunat_cert_expected_ruc || empresa?.ruc || ''
          : empresa?.ruc || '',
    ).trim();
    const tenantTaxId = rawTaxId.replace(/\D/g, '');
    const taxIdValid = country === 'PE'
      ? /^\d{11}$/.test(tenantTaxId)
      : country === 'AR'
        ? validateArgentinaCuit(tenantTaxId)
        : /^\d{9,11}$/.test(tenantTaxId);
    if (isTenantScoped && !taxIdValid) {
      const label = country === 'AR' ? 'CUIT' : country === 'CO' ? 'NIT' : 'RUC';
      throw new BadRequestException(
        `El tenant debe configurar su propio ${label} antes de usar un certificado fiscal.`,
      );
    }
    const mismatchConfirmed = isTenantScoped
      ? country === 'PE' && empresa.sunat_cert_ruc_mismatch_confirmed === true
      : this.configService.get<string | boolean>('SUNAT_CERT_RUC_MISMATCH_CONFIRMED') === true ||
        this.configService.get<string | boolean>('SUNAT_CERT_RUC_MISMATCH_CONFIRMED') === 'true';

    const authority = country === 'AR' ? 'ARCA' : country === 'CO' ? 'DIAN' : 'SUNAT';
    const taxIdLabel = country === 'AR' ? 'CUIT' : country === 'CO' ? 'NIT' : 'RUC';

    return {
      expectedTaxId: isTenantScoped
        ? tenantTaxId
        : this.configService.get<string>('SUNAT_CERT_EXPECTED_RUC') ||
          this.configService.get<string>('EMPRESA_RUC'),
      taxIdLabel,
      fiscalAuthority: authority,
      enforceRucInCertificate: environment === 'produccion',
      allowRucMismatchWithConfirmation: mismatchConfirmed,
      // En homologación el demo tiene que poder emitir sin certificado real; en
      // producción no. Firmar con un autofirmado cuando el PFX del cliente no
      // carga —clave mal tecleada, fichero corrupto— produciria un comprobante
      // que SUNAT rechaza y un emisor convencido de haber usado el suyo.
      allowDemoFallback: environment !== 'produccion',
    };
  }

private normalizeCertificateBuffer(certificado: any, _encryptedPassword?: string): Buffer | null {
    const buffer = this.decryptCertificate(certificado);

    if (!buffer) {
      this.logger.warn('Formato de certificado no soportado o vacío');
    }

    return buffer;
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
      return normalizeCertificateInput(input); // fallback
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

    this.logger.warn('⚠️ No se pudo descifrar certificado con las claves configuradas, se usará valor crudo.');
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

    this.logger.warn('⚠️ No se pudo descifrar contraseña de certificado, se usará tal cual.');
    return input;
  }
}
