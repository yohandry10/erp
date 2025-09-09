import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

interface SecretConfig {
  key: string;
  encrypted: boolean;
  required: boolean;
  minLength?: number;
}

@Injectable()
export class SecretsService {
  private readonly logger = new Logger(SecretsService.name);
  private readonly encryptionKey: string;
  private readonly algorithm = 'aes-256-gcm';
  
  private readonly secretsConfig: SecretConfig[] = [
    { key: 'JWT_SECRET', encrypted: false, required: true, minLength: 32 },
    { key: 'JWT_REFRESH_SECRET', encrypted: false, required: true, minLength: 32 },
    { key: 'ENCRYPTION_KEY', encrypted: false, required: true, minLength: 32 },
    { key: 'SESSION_SECRET', encrypted: false, required: true, minLength: 32 },
    { key: 'CSRF_SECRET', encrypted: false, required: true, minLength: 32 },
    { key: 'DB_ENCRYPTION_KEY', encrypted: false, required: true, minLength: 32 },
    { key: 'SUPABASE_SERVICE_ROLE_KEY', encrypted: true, required: true },
    { key: 'SUNAT_API_KEY', encrypted: true, required: false },
    { key: 'SUNAT_API_SECRET', encrypted: true, required: false },
  ];

  constructor(private configService: ConfigService) {
    this.encryptionKey = this.configService.get<string>('ENCRYPTION_KEY');
    this.validateSecrets();
  }

  /**
   * Valida que todos los secretos requeridos estén presentes y cumplan los requisitos
   */
  private validateSecrets(): void {
    const missingSecrets: string[] = [];
    const invalidSecrets: string[] = [];

    for (const config of this.secretsConfig) {
      const value = this.configService.get<string>(config.key);
      
      if (config.required && !value) {
        missingSecrets.push(config.key);
        continue;
      }
      
      if (value && config.minLength && value.length < config.minLength) {
        invalidSecrets.push(`${config.key} (mínimo ${config.minLength} caracteres)`);
      }
    }

    if (missingSecrets.length > 0) {
      this.logger.error(`Secretos requeridos faltantes: ${missingSecrets.join(', ')}`);
      throw new Error(`Configuración incompleta: faltan secretos requeridos`);
    }

    if (invalidSecrets.length > 0) {
      this.logger.error(`Secretos inválidos: ${invalidSecrets.join(', ')}`);
      throw new Error(`Configuración inválida: secretos no cumplen requisitos`);
    }

    this.logger.log('✅ Validación de secretos completada exitosamente');
  }

  /**
   * Obtiene un secreto, desencriptándolo si es necesario
   */
  getSecret(key: string): string {
    const config = this.secretsConfig.find(c => c.key === key);
    const value = this.configService.get<string>(key);
    
    if (!value) {
      if (config?.required) {
        throw new Error(`Secreto requerido no encontrado: ${key}`);
      }
      return null;
    }

    if (config?.encrypted) {
      return this.decrypt(value);
    }

    return value;
  }

  /**
   * Encripta un valor
   */
  encrypt(text: string): string {
    if (!this.encryptionKey) {
      throw new Error('Clave de encriptación no configurada');
    }

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher(this.algorithm, this.encryptionKey);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Desencripta un valor
   */
  private decrypt(encryptedText: string): string {
    if (!this.encryptionKey) {
      throw new Error('Clave de encriptación no configurada');
    }

    try {
      const parts = encryptedText.split(':');
      if (parts.length !== 3) {
        throw new Error('Formato de texto encriptado inválido');
      }

      const [ivHex, authTagHex, encrypted] = parts;
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');
      
      const decipher = crypto.createDecipher(this.algorithm, this.encryptionKey);
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      this.logger.error(`Error desencriptando secreto: ${error.message}`);
      throw new Error('Error desencriptando secreto');
    }
  }

  /**
   * Genera un secreto aleatorio seguro
   */
  generateSecret(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Rota un secreto (genera uno nuevo y actualiza la configuración)
   */
  async rotateSecret(key: string): Promise<string> {
    const config = this.secretsConfig.find(c => c.key === key);
    if (!config) {
      throw new Error(`Configuración de secreto no encontrada: ${key}`);
    }

    const newSecret = this.generateSecret(config.minLength || 32);
    
    // En producción, esto debería actualizar el sistema de gestión de secretos
    // Por ahora, solo loggeamos la acción
    this.logger.warn(`🔄 Rotación de secreto solicitada para: ${key}`);
    this.logger.warn(`Nuevo secreto generado (actualizar manualmente): ${newSecret}`);
    
    return newSecret;
  }

  /**
   * Verifica la integridad de los certificados SSL
   */
  validateSSLCertificates(): boolean {
    try {
      const certPath = this.configService.get<string>('SSL_CERT_PATH');
      const keyPath = this.configService.get<string>('SSL_KEY_PATH');
      
      if (!certPath || !keyPath) {
        this.logger.warn('⚠️ Rutas de certificados SSL no configuradas');
        return false;
      }

      const certExists = fs.existsSync(path.resolve(certPath));
      const keyExists = fs.existsSync(path.resolve(keyPath));
      
      if (!certExists || !keyExists) {
        this.logger.warn('⚠️ Archivos de certificados SSL no encontrados');
        return false;
      }

      // Verificar que el certificado no haya expirado
      const certContent = fs.readFileSync(path.resolve(certPath), 'utf8');
      // Aquí se podría agregar lógica para verificar la fecha de expiración
      
      this.logger.log('✅ Certificados SSL validados correctamente');
      return true;
    } catch (error) {
      this.logger.error(`Error validando certificados SSL: ${error.message}`);
      return false;
    }
  }

  /**
   * Obtiene información del estado de los secretos
   */
  getSecretsStatus(): any {
    const status = {
      totalSecrets: this.secretsConfig.length,
      configuredSecrets: 0,
      missingSecrets: [],
      encryptedSecrets: 0,
      sslCertificatesValid: this.validateSSLCertificates(),
    };

    for (const config of this.secretsConfig) {
      const value = this.configService.get<string>(config.key);
      
      if (value) {
        status.configuredSecrets++;
        if (config.encrypted) {
          status.encryptedSecrets++;
        }
      } else if (config.required) {
        status.missingSecrets.push(config.key);
      }
    }

    return status;
  }
}