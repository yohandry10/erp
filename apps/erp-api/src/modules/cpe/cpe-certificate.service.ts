import { BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CertificateOwnershipError, SigningOptions, XmlSigner } from '@erp-suite/crypto';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { normalizeCertificateInput } from '../../shared/utils/certificate.utils';
import * as crypto from 'crypto';

/** Resuelve, descifra y valida el certificado de firma de un tenant. */
export class CpeCertificateService {
  private readonly logger = new Logger(CpeCertificateService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly configService: ConfigService,
  ) {}

async getXmlSigner(tenantId: string): Promise<XmlSigner> {
    try {
      // Obtener certificado del tenant desde la BD
      const { data: empresa, error } = await this.supabaseService.getClient()
        .from('empresa_config')
        .select('ruc, certificado_pfx, certificado_password, sunat_environment, sunat_cert_expected_ruc, sunat_cert_ruc_mismatch_confirmed')
        .eq('tenant_id', tenantId)
        .single();
      const typedEmpresa = empresa as any;
      if (!error && typedEmpresa && typedEmpresa.certificado_pfx) {
        console.log('🔐 Usando certificado del tenant:', tenantId);

        const certificadoBuffer = this.normalizeCertificateBuffer(typedEmpresa.certificado_pfx, typedEmpresa.certificado_password);

        if (!certificadoBuffer || certificadoBuffer.length === 0) {
          this.logger.warn(
            `El certificado almacenado para el tenant ${tenantId} no tiene un formato válido (string/base64/Buffer). Se intentará fallback de configuración global.`,
          );
        } else {
          // Crear XmlSigner con el certificado del tenant
          try {
            return new XmlSigner({
              pfxBuffer: certificadoBuffer, // Buffer del certificado
              pfxPassword: this.decryptText(typedEmpresa.certificado_password) || '',
              ...this.getCertificateRucGuardOptions(typedEmpresa),
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
      console.warn('⚠️ Error obteniendo certificado del tenant:', error.message);
    }

    const demoSignerConfig = this.resolveDemoSignerConfig(tenantId);
    this.logger.warn(`🔐 Usando certificado de configuración global para tenant ${tenantId}`);

    return new XmlSigner(demoSignerConfig);
  }

private resolveDemoSignerConfig(tenantId: string): SigningOptions {
    const pfxPath = this.configService.get<string>('PFX_PATH');
    const pfxPassword = this.configService.get<string>('PFX_PASS');

    if (!pfxPath || !pfxPassword) {
      throw new BadRequestException(
        `No hay configuración de certificado fiscal para el tenant ${tenantId}. ` +
          'Configure PFX_PATH y PFX_PASS para fallback global o cargue el certificado del tenant.',
      );
    }

    return { pfxPath, pfxPassword, ...this.getCertificateRucGuardOptions() };
  }

private getCertificateRucGuardOptions(empresa?: any): Partial<SigningOptions> {
    const sunatEnvironment = empresa?.sunat_environment || this.configService.get<string>('SUNAT_ENVIRONMENT', 'homologacion');
    const mismatchConfirmed =
      empresa?.sunat_cert_ruc_mismatch_confirmed === true ||
      this.configService.get<string | boolean>('SUNAT_CERT_RUC_MISMATCH_CONFIRMED') === true ||
      this.configService.get<string | boolean>('SUNAT_CERT_RUC_MISMATCH_CONFIRMED') === 'true';

    return {
      expectedRuc:
        empresa?.sunat_cert_expected_ruc ||
        empresa?.ruc ||
        this.configService.get<string>('SUNAT_CERT_EXPECTED_RUC') ||
        this.configService.get<string>('EMPRESA_RUC'),
      enforceRucInCertificate: sunatEnvironment === 'produccion',
      allowRucMismatchWithConfirmation: mismatchConfirmed,
      // En homologación el demo tiene que poder emitir sin certificado real; en
      // producción no. Firmar con un autofirmado cuando el PFX del cliente no
      // carga —clave mal tecleada, fichero corrupto— produciria un comprobante
      // que SUNAT rechaza y un emisor convencido de haber usado el suyo.
      allowDemoFallback: sunatEnvironment !== 'produccion',
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
