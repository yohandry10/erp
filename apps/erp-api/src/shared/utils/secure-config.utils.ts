import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { normalizeCertificateInput } from './certificate.utils';

export function getSecretKeys(configService: ConfigService): Buffer[] {
  const keys: Buffer[] = [];
  const main =
    configService.get<string>('CERT_ENCRYPTION_KEY') ??
    configService.get<string>('ENCRYPTION_KEY');
  const old = configService.get<string>('CERT_ENCRYPTION_KEY_OLD');

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

export function encryptBuffer(configService: ConfigService, data: Buffer): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getSecretKeys(configService)[0], iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]);
}

export function encryptText(configService: ConfigService, text: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getSecretKeys(configService)[0], iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptBuffer(configService: ConfigService, input: any): Buffer | null {
  const raw = normalizeCertificateInput(input);
  if (!raw || raw.length < 28) {
    return raw;
  }

  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const data = raw.subarray(28);

  for (const key of getSecretKeys(configService)) {
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(data), decipher.final()]);
    } catch {
      /* try next key */
    }
  }

  return raw;
}

export function decryptText(configService: ConfigService, input: string | null | undefined): string {
  if (!input) {
    return '';
  }

  const raw = Buffer.from(input, 'base64');
  if (raw.length < 28) {
    return input;
  }

  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const data = raw.subarray(28);

  for (const key of getSecretKeys(configService)) {
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    } catch {
      /* try next key */
    }
  }

  return input;
}
