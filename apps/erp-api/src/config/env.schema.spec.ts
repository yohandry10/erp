import { envSchema } from './env.schema';

describe('env.schema', () => {
  const strongSecret = 'Ab1!'.repeat(10);

  const baseConfig = {
    NODE_ENV: 'production',
    PORT: 3002,
    LOG_LEVEL: 'info',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: strongSecret,
    SUPABASE_ANON_KEY: 'b'.repeat(40),
    JWT_SECRET: strongSecret,
    JWT_REFRESH_SECRET: 'C'.repeat(40),
    ENCRYPTION_KEY: 'd'.repeat(32),
    DB_ENCRYPTION_KEY: 'a'.repeat(32),
    SESSION_SECRET: 'e'.repeat(40),
    CSRF_SECRET: 'f'.repeat(40),
    AUTH_SIGNATURE_SECRET: strongSecret,
    PFX_PATH: '/secure/certs/fiscal.pfx',
    PFX_PASS: 'securepass',
  };

  it('falla cuando falta una variable crítica', () => {
    const result = envSchema.validate({
      ...baseConfig,
      JWT_SECRET: undefined,
    });

    expect(result.error).toBeDefined();
  });

  it('falla cuando falta DB_ENCRYPTION_KEY en ambientes no-test', () => {
    const result = envSchema.validate({
      ...baseConfig,
      DB_ENCRYPTION_KEY: undefined,
      NODE_ENV: 'production',
    });

    expect(result.error).toBeDefined();
  });

  it('falla con secreto JWT demasiado débil', () => {
    const result = envSchema.validate({
      ...baseConfig,
      JWT_SECRET: 'abc123',
    });

    expect(result.error).toBeDefined();
  });

  it('aplica default de PORT', () => {
    const result = envSchema.validate({
      ...baseConfig,
      PORT: undefined,
      NODE_ENV: 'development',
      JWT_SECRET: strongSecret,
      JWT_REFRESH_SECRET: 'C'.repeat(40),
    });

    expect(result.error).toBeUndefined();
    expect(result.value.PORT).toBe(3002);
  });

  it('aplica default de THROTTLE_TTL en milisegundos', () => {
    const result = envSchema.validate({
      ...baseConfig,
      THROTTLE_TTL: undefined,
    });

    expect(result.error).toBeUndefined();
    expect(result.value.THROTTLE_TTL).toBe(60000);
  });

  it('valida NODE_ENV', () => {
    const result = envSchema.validate({
      ...baseConfig,
      NODE_ENV: 'production',
      SUPABASE_FETCH_TIMEOUT_MS: 7000,
    });

    expect(result.error).toBeUndefined();
    expect(result.value.NODE_ENV).toBe('production');
  });

  it('acepta configuración mínima sin ENCRYPTION_KEY si existe CERT_ENCRYPTION_KEY', () => {
    const result = envSchema.validate({
      ...baseConfig,
      ENCRYPTION_KEY: undefined,
      DB_ENCRYPTION_KEY: 'a'.repeat(32),
      CERT_ENCRYPTION_KEY: 'd'.repeat(32),
    });

    expect(result.error).toBeUndefined();
  });

  it('requiere PFX_PATH y PFX_PASS en conjunto', () => {
    const onlyPath = envSchema.validate({
      ...baseConfig,
      PFX_PATH: '/tmp/pfx.pfx',
      PFX_PASS: undefined,
    });

    const onlyPass = envSchema.validate({
      ...baseConfig,
      PFX_PATH: undefined,
      PFX_PASS: 'secretpass',
    });

    expect(onlyPath.error).toBeDefined();
    expect(onlyPass.error).toBeDefined();
  });

  it('requiere certificado fiscal real en production', () => {
    const result = envSchema.validate({
      ...baseConfig,
      PFX_PATH: undefined,
      PFX_PASS: undefined,
    });

    expect(result.error).toBeDefined();
  });

  it('permite omitir certificado fiscal global en development', () => {
    const result = envSchema.validate({
      ...baseConfig,
      NODE_ENV: 'development',
      PFX_PATH: undefined,
      PFX_PASS: undefined,
    });

    expect(result.error).toBeUndefined();
  });
}); 
