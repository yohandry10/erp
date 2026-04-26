import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * Servicio de Encriptación de PII (Personally Identifiable Information)
 * Q58: Encripta datos sensibles en reposo usando AES-256-GCM
 * 
 * Campos a encriptar:
 * - Email, teléfono, dirección (PII)
 * - Números de documento de identidad
 * - Datos bancarios
 */
@Injectable()
export class PiiEncryptionService {
  private readonly logger = new Logger(PiiEncryptionService.name);
  private readonly algorithm = 'aes-256-gcm';
  private readonly encryptionKey: Buffer;
  private readonly previousKey?: Buffer; // Para rotación de claves

  constructor(private readonly configService: ConfigService) {
    const keyString = this.configService.get<string>('PII_ENCRYPTION_KEY') 
      || this.configService.get<string>('ENCRYPTION_KEY');
    
    if (!keyString || keyString.length < 32) {
      this.logger.warn('⚠️ PII_ENCRYPTION_KEY no configurada o muy corta. Usando ENCRYPTION_KEY.');
    }

    this.encryptionKey = crypto.createHash('sha256')
      .update(keyString || 'default-key-change-in-production')
      .digest();

    // Clave anterior para rotación
    const previousKeyString = this.configService.get<string>('PII_ENCRYPTION_KEY_OLD');
    if (previousKeyString) {
      this.previousKey = crypto.createHash('sha256').update(previousKeyString).digest();
    }

    this.logger.log('🔐 PiiEncryptionService inicializado');
  }

  /**
   * Encripta un valor PII
   * Formato: iv:authTag:encrypted (base64)
   */
  encrypt(plaintext: string): string {
    if (!plaintext) return plaintext;

    try {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv);
      
      let encrypted = cipher.update(plaintext, 'utf8', 'base64');
      encrypted += cipher.final('base64');
      
      const authTag = cipher.getAuthTag();
      
      // Formato: iv:authTag:encrypted (todo en base64)
      return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
    } catch (error) {
      this.logger.error(`Error encriptando PII: ${error.message}`);
      throw new Error('Error encriptando datos sensibles');
    }
  }

  /**
   * Desencripta un valor PII
   * Soporta clave actual y anterior (para rotación)
   */
  decrypt(encryptedText: string): string {
    if (!encryptedText || !encryptedText.includes(':')) {
      return encryptedText; // No está encriptado
    }

    // Intentar con clave actual
    try {
      return this.decryptWithKey(encryptedText, this.encryptionKey);
    } catch (error) {
      // Si falla y hay clave anterior, intentar con ella
      if (this.previousKey) {
        try {
          const decrypted = this.decryptWithKey(encryptedText, this.previousKey);
          this.logger.debug('PII desencriptado con clave anterior (considerar re-encriptar)');
          return decrypted;
        } catch {
          // Ignorar, lanzar error original
        }
      }
      this.logger.error(`Error desencriptando PII: ${error.message}`);
      throw new Error('Error desencriptando datos sensibles');
    }
  }

  private decryptWithKey(encryptedText: string, key: Buffer): string {
    const parts = encryptedText.split(':');
    if (parts.length !== 3) {
      throw new Error('Formato de texto encriptado inválido');
    }

    const [ivBase64, authTagBase64, encrypted] = parts;
    const iv = Buffer.from(ivBase64, 'base64');
    const authTag = Buffer.from(authTagBase64, 'base64');
    
    const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  /**
   * Genera un hash de búsqueda para un valor PII
   * Permite buscar sin exponer el valor real
   */
  generateSearchHash(value: string): string {
    if (!value) return '';
    
    // Normalizar valor (lowercase, sin espacios)
    const normalized = value.toLowerCase().trim();
    
    // Generar hash con salt fijo (para búsquedas consistentes)
    const salt = this.configService.get<string>('PII_SEARCH_SALT') || 'pii-search-salt';
    
    return crypto.createHmac('sha256', salt)
      .update(normalized)
      .digest('hex')
      .substring(0, 32); // Solo primeros 32 chars
  }

  /**
   * Encripta un objeto con campos PII específicos
   */
  encryptPiiFields<T extends Record<string, any>>(
    data: T,
    piiFields: string[]
  ): T {
    const result: Record<string, any> = { ...data };
    
    for (const field of piiFields) {
      if (result[field] && typeof result[field] === 'string') {
        // Guardar hash de búsqueda si el campo es email o documento
        if (field === 'email' || field === 'numero_documento') {
          result[`${field}_hash`] = this.generateSearchHash(result[field]);
        }
        result[field] = this.encrypt(result[field]);
      }
    }
    
    return result as T;
  }

  /**
   * Desencripta un objeto con campos PII específicos
   */
  decryptPiiFields<T extends Record<string, any>>(
    data: T,
    piiFields: string[]
  ): T {
    const result: Record<string, any> = { ...data };
    
    for (const field of piiFields) {
      if (result[field] && typeof result[field] === 'string') {
        try {
          result[field] = this.decrypt(result[field]);
        } catch {
          // Si falla, dejar el valor como está (puede no estar encriptado)
        }
      }
    }
    
    return result as T;
  }

  /**
   * Lista de campos PII comunes que deben encriptarse
   */
  static readonly COMMON_PII_FIELDS = [
    'email',
    'telefono',
    'celular',
    'direccion',
    'numero_documento',
    'cuenta_bancaria',
    'tarjeta_credito',
  ];

  /**
   * Verifica si un valor está encriptado
   */
  isEncrypted(value: string): boolean {
    if (!value) return false;
    const parts = value.split(':');
    return parts.length === 3 && parts.every(p => p.length > 0);
  }

  /**
   * Re-encripta datos con la clave actual (para rotación de claves)
   */
  reEncrypt(encryptedText: string): string {
    const decrypted = this.decrypt(encryptedText);
    return this.encrypt(decrypted);
  }

  /**
   * Enmascara un valor PII para mostrar parcialmente
   * Ej: "juan@email.com" -> "j***@e***.com"
   */
  mask(value: string, type: 'email' | 'phone' | 'document' | 'card' = 'document'): string {
    if (!value) return '';

    switch (type) {
      case 'email': {
        const [local, domain] = value.split('@');
        if (!domain) return '***';
        const [domainName, ext] = domain.split('.');
        return `${local[0]}***@${domainName[0]}***.${ext || 'com'}`;
      }
      case 'phone':
        return value.length > 4 
          ? `***${value.slice(-4)}`
          : '***';
      case 'card':
        return value.length > 4
          ? `****-****-****-${value.slice(-4)}`
          : '****';
      case 'document':
      default:
        return value.length > 4
          ? `${value.slice(0, 2)}***${value.slice(-2)}`
          : '***';
    }
  }
}
