import * as crypto from 'node:crypto';
import { Logger } from '@nestjs/common';
import { PiiEncryptionService } from './pii-encryption.service';

const CURRENT = 'synthetic-pii-current-key-0123456789abcdef';
const PREVIOUS = 'synthetic-pii-previous-key-0123456789abcdef';
const SALT = 'synthetic-pii-search-salt-0123456789abcdef';
const make = (values: Record<string, unknown> = {}) => new PiiEncryptionService({ get: (key: string) => values[key] } as any);
const fixture = (secret: string, text: string) => {
  const iv = Buffer.from('000102030405060708090a0b', 'hex');
  const cipher = crypto.createCipheriv('aes-256-gcm', crypto.createHash('sha256').update(secret).digest(), iv);
  const encrypted = cipher.update(text, 'utf8', 'base64') + cipher.final('base64');
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted].join(':');
};

describe('PII AES-GCM: configuración explícita y tag de16bytes', () => {
  beforeEach(() => { for (const name of ['log', 'warn', 'error', 'debug'] as const) jest.spyOn(Logger.prototype, name).mockImplementation(() => {}); });
  afterEach(() => jest.restoreAllMocks());

  it('permite iniciar un proveedor sin uso, pero no cifrar con una clave por defecto', () => {
    const service = make();
    expect(() => service.encrypt('synthetic@example.test')).toThrow(/configurad|clave/i);
    expect(() => service.decrypt(fixture('default-key-change-in-production', 'synthetic'))).toThrow();
  });
  it.each(['short', ' '.repeat(32)])('rechaza una clave explícita inválida', key => {
    expect(() => make({ PII_ENCRYPTION_KEY: key, ENCRYPTION_KEY: CURRENT })).toThrow();
  });
  it('conserva la compatibilidad con ENCRYPTION_KEY y con cifrados anteriores de tag completo', () => {
    const service = make({ ENCRYPTION_KEY: CURRENT });
    expect(service.decrypt(fixture(CURRENT, 'áéí · synthetic@example.test'))).toBe('áéí · synthetic@example.test');
  });
  it('conserva prioridad de la clavePII explícita y rotación con la anterior', () => {
    const service = make({ PII_ENCRYPTION_KEY: CURRENT, ENCRYPTION_KEY: 'otra-clave-sintetica-0123456789abcdef', PII_ENCRYPTION_KEY_OLD: PREVIOUS });
    expect(service.decrypt(fixture(CURRENT, 'current'))).toBe('current');
    expect(service.decrypt(fixture(PREVIOUS, 'previous'))).toBe('previous');
    const updated = service.reEncrypt(fixture(PREVIOUS, 'previous'));
    expect(make({ ENCRYPTION_KEY: CURRENT }).decrypt(updated)).toBe('previous');
  });
  it.each(['a', 'ab', 'abc', 'á', '😀', 'synthetic@example.test'])('lee el formato anterior sin recifrar: %s', text => {
    expect(make({ ENCRYPTION_KEY: CURRENT }).decrypt(fixture(CURRENT, text))).toBe(text);
  });
  it('genera IV distinto de12bytes y tag de16bytes sin cambiar el formato', () => {
    const service = make({ ENCRYPTION_KEY: CURRENT });
    const first = service.encrypt('same synthetic text'), second = service.encrypt('same synthetic text');
    expect(first).not.toBe(second);
    const [iv, tag] = first.split(':');
    expect(Buffer.from(iv, 'base64')).toHaveLength(12); expect(Buffer.from(tag, 'base64')).toHaveLength(16);
    expect(service.decrypt(first)).toBe('same synthetic text');
  });
  it.each([4, 8, 12, 15])('rechaza tag truncado a%i bytes aunque coincida su prefijo', bytes => {
    const service = make({ ENCRYPTION_KEY: CURRENT });
    const parts = fixture(CURRENT, 'synthetic').split(':');
    parts[1] = Buffer.from(parts[1], 'base64').subarray(0, bytes).toString('base64');
    expect(() => service.decrypt(parts.join(':'))).toThrow();
  });
  it('rechaza tag alterado, IV incorrecto y base64 no canónico', () => {
    const service = make({ ENCRYPTION_KEY: CURRENT }), original = fixture(CURRENT, 'synthetic');
    const badTag = original.split(':'), tag = Buffer.from(badTag[1], 'base64'); tag[0] ^= 1; badTag[1] = tag.toString('base64');
    expect(() => service.decrypt(badTag.join(':'))).toThrow();
    const badIv = original.split(':'); badIv[0] = Buffer.alloc(8).toString('base64'); expect(() => service.decrypt(badIv.join(':'))).toThrow();
    const badBase64 = original.split(':'); badBase64[1] += '!'; expect(() => service.decrypt(badBase64.join(':'))).toThrow();
  });
  it('no descifra con una clave distinta ni una anterior incorrecta', () => {
    expect(() => make({ ENCRYPTION_KEY: CURRENT, PII_ENCRYPTION_KEY_OLD: PREVIOUS }).decrypt(fixture('different-synthetic-key-0123456789abcdef', 'synthetic'))).toThrow();
  });
  it('no genera hashes de búsqueda con un salt público por defecto', () => {
    expect(() => make({ ENCRYPTION_KEY: CURRENT }).generateSearchHash('synthetic@example.test')).toThrow();
  });
  it('mantiene el hash previo cuando el salt explícito es válido', () => {
    const service = make({ ENCRYPTION_KEY: CURRENT, PII_SEARCH_SALT: SALT });
    expect(service.generateSearchHash(' Synthetic@Example.Test ')).toBe(crypto.createHmac('sha256', SALT).update('synthetic@example.test').digest('hex').slice(0, 32));
  });
  it('las operaciones de campos válidos mantienen el objeto original', () => {
    const service = make({ ENCRYPTION_KEY: CURRENT, PII_SEARCH_SALT: SALT });
    const original = { email: 'synthetic@example.test', other: 'original' };
    const encrypted = service.encryptPiiFields(original, ['email']);
    expect(original.email).toBe('synthetic@example.test');
    expect(encrypted.email).not.toBe(original.email);
    expect(service.decryptPiiFields(encrypted, ['email']).email).toBe(original.email);
  });
});
