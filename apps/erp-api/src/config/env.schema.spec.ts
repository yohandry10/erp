import { envSchema } from './env.schema';

describe('env.schema', () => {
  const strongSecret = 'Ab1!'.repeat(10);

  const baseConfig = {
    NODE_ENV: 'production',
    DEPLOYMENT_ENV: 'PROD',
    EXPECTED_SUPABASE_PROJECT_REF: 'wypnbcptofqdmoynlonq',
    DEMO_API_ENABLED: false,
    PORT: 3002,
    LOG_LEVEL: 'info',
    SUPABASE_URL: 'https://wypnbcptofqdmoynlonq.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: strongSecret,
    SUPABASE_ANON_KEY: 'b'.repeat(40),
    JWT_SECRET: strongSecret,
    JWT_REFRESH_SECRET: 'C'.repeat(40),
    ENCRYPTION_KEY: 'd'.repeat(32),
    DB_ENCRYPTION_KEY: 'a'.repeat(32),
    SESSION_SECRET: 'e'.repeat(40),
    CSRF_SECRET: 'f'.repeat(40),
    AUTH_SIGNATURE_SECRET: strongSecret,
    REQUIRED_DATABASE_SCHEMA_VERSION: 534,
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

  it('exige la versión mínima de esquema en production', () => {
    const result = envSchema.validate({
      ...baseConfig,
      REQUIRED_DATABASE_SCHEMA_VERSION: undefined,
    });

    expect(result.error?.message).toContain('REQUIRED_DATABASE_SCHEMA_VERSION');
  });

  it('usa la última migración contractual como default fuera de production', () => {
    const result = envSchema.validate({
      ...baseConfig,
      NODE_ENV: 'test',
      REQUIRED_DATABASE_SCHEMA_VERSION: undefined,
    });

    expect(result.error).toBeUndefined();
    expect(result.value.REQUIRED_DATABASE_SCHEMA_VERSION).toBe(534);
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

  it('arranca en production sin certificado global: cada tenant sube el suyo', () => {
    const result = envSchema.validate({
      ...baseConfig,
      PFX_PATH: undefined,
      PFX_PASS: undefined,
    });

    expect(result.error).toBeUndefined();
  });

  it('exige el certificado global si se pide explicitamente', () => {
    const result = envSchema.validate({
      ...baseConfig,
      REQUIRE_REAL_FISCAL_CERTIFICATE: true,
      PFX_PATH: undefined,
      PFX_PASS: undefined,
    });

    expect(result.error?.message).toContain('REQUIRE_REAL_FISCAL_CERTIFICATE');
  });

  it('permite omitir certificado fiscal global en tests unitarios', () => {
    const result = envSchema.validate({
      ...baseConfig,
      NODE_ENV: 'test',
      PFX_PATH: undefined,
      PFX_PASS: undefined,
    });

    expect(result.error).toBeUndefined();
  });

  it('requiere RUC esperado para SUNAT produccion', () => {
    const result = envSchema.validate({
      ...baseConfig,
      SUNAT_ENVIRONMENT: 'produccion',
      EMPRESA_RUC: undefined,
      SUNAT_CERT_EXPECTED_RUC: undefined,
    });

    expect(result.error?.message).toContain('SUNAT produccion requiere SUNAT_CERT_EXPECTED_RUC');
  });

  it('acepta EMPRESA_RUC como RUC esperado en SUNAT produccion', () => {
    const result = envSchema.validate({
      ...baseConfig,
      SUNAT_ENVIRONMENT: 'produccion',
      EMPRESA_RUC: '20616053575',
    });

    expect(result.error).toBeUndefined();
    expect(result.value.EMPRESA_RUC).toBe('20616053575');
  });

  it('requiere razon documentada para confirmar mismatch de RUC del certificado', () => {
    const result = envSchema.validate({
      ...baseConfig,
      SUNAT_ENVIRONMENT: 'produccion',
      EMPRESA_RUC: '20616053575',
      SUNAT_CERT_RUC_MISMATCH_CONFIRMED: 'true',
      SUNAT_CERT_RUC_MISMATCH_REASON: '',
    });

    expect(result.error?.message).toContain('SUNAT_CERT_RUC_MISMATCH_CONFIRMED requiere');
  });

  it('requiere credenciales API SUNAT cuando GRE usa transporte REST', () => {
    const missingCredentials = envSchema.validate({
      ...baseConfig,
      SUNAT_GRE_TRANSPORT: 'rest',
    });
    const valid = envSchema.validate({
      ...baseConfig,
      SUNAT_GRE_TRANSPORT: 'rest',
      SUNAT_GRE_CLIENT_ID: 'client-id-gre',
      SUNAT_GRE_CLIENT_SECRET: 'example-gre-api-placeholder',
    });

    expect(missingCredentials.error?.message).toContain('SUNAT_GRE_TRANSPORT=rest requiere');
    expect(valid.error).toBeUndefined();
  });

  it('rechaza una URL Supabase distinta al project_ref esperado', () => {
    const result = envSchema.validate({
      ...baseConfig,
      SUPABASE_URL: 'https://zyxwvutsrqponmlkjihg.supabase.co',
    });

    expect(result.error?.message).toContain('sólo opera wypnbcptofqdmoynlonq');
  });

  it('permite habilitar demos en PROD, que es donde vive la prueba gratuita', () => {
    const result = envSchema.validate({
      ...baseConfig,
      DEMO_API_ENABLED: true,
    });

    expect(result.error).toBeUndefined();
    expect(result.value.DEMO_API_ENABLED).toBe(true);
  });

  it('deja las demos apagadas si nadie las enciende', () => {
    const { DEMO_API_ENABLED: _omitido, ...sinBandera } = baseConfig as Record<string, unknown>;
    const result = envSchema.validate(sinBandera);

    expect(result.error).toBeUndefined();
    expect(result.value.DEMO_API_ENABLED).toBe(false);
  });

  it('rechaza usar PROD con un proceso de desarrollo', () => {
    const result = envSchema.validate({
      ...baseConfig,
      NODE_ENV: 'development',
    });

    expect(result.error?.message).toContain('sólo admite NODE_ENV=production');
  });

  it('rechaza cualquier proyecto que no sea PROD aunque NODE_ENV sea test', () => {
    // `NODE_ENV=test` es el unico modo en el que el resto de reglas se relajan,
    // asi que es justo donde una base equivocada podria colarse.
    const result = envSchema.validate({
      ...baseConfig,
      NODE_ENV: 'test',
      DEPLOYMENT_ENV: 'PROD',
      EXPECTED_SUPABASE_PROJECT_REF: 'qwertyuiopasdfghjklz',
      SUPABASE_URL: 'https://qwertyuiopasdfghjklz.supabase.co',
    });

    expect(result.error?.message).toContain('sólo opera wypnbcptofqdmoynlonq');
  });

  it('rechaza cualquier project_ref distinto de PROD en runtime', () => {
    const result = envSchema.validate({
      ...baseConfig,
      EXPECTED_SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst',
      SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
    });

    expect(result.error?.message).toContain('wypnbcptofqdmoynlonq');
  });

  it('requiere declarar project_ref en production', () => {
    const result = envSchema.validate({
      ...baseConfig,
      EXPECTED_SUPABASE_PROJECT_REF: undefined,
    });

    expect(result.error?.message).toContain('exige EXPECTED_SUPABASE_PROJECT_REF');
  });
});
