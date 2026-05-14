import * as Joi from 'joi';

export interface AppEnvironment {
  NODE_ENV: string;
  PORT: number;
  LOG_LEVEL: string;
  JWT_EXPIRES_IN: string;
  JWT_REFRESH_EXPIRES_IN: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_ANON_KEY: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  JWT_SECRET: string;
  JWT_REFRESH_SECRET: string;
  ENCRYPTION_KEY?: string;
  DB_ENCRYPTION_KEY?: string;
  CERT_ENCRYPTION_KEY?: string;
  CERT_ENCRYPTION_KEY_OLD?: string;
  SESSION_SECRET: string;
  CSRF_SECRET: string;
  AUTH_SIGNATURE_SECRET: string;
  ALLOWED_ORIGINS?: string;
  HEALTH_TOKEN?: string;
  THROTTLE_LIMIT: number;
  THROTTLE_TTL: number;
  SUPABASE_FETCH_TIMEOUT_MS: number;
  SUPABASE_FETCH_MAX_RETRIES: number;
  SUPABASE_FETCH_RETRY_BASE_MS: number;
  SUPABASE_NETWORK_BACKOFF_MS: number;
  HASH_SALT_ROUNDS: number;
  POS_WORKER_JWT_SECRET?: string;
  WORKER_API_JWT_SECRET?: string;
  REDIS_HOST?: string;
  REDIS_PORT?: number;
  REDIS_PASSWORD?: string;
  REDIS_REQUIRED?: boolean;
  PFX_PATH?: string;
  PFX_PASS?: string;
  REQUIRE_REAL_FISCAL_CERTIFICATE?: boolean;
}

const secretPattern = /(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+=[\]{}|\\:;"'<>,.?/~`-])/;

const requiredInProduction = (schema: Joi.StringSchema) => Joi.when('NODE_ENV', {
  is: 'test',
  then: schema.optional(),
  otherwise: schema.required(),
});

export const envSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'staging', 'production').default('development'),
  PORT: Joi.number().port().default(3002),
  LOG_LEVEL: Joi.string().optional().default('info'),
  JWT_EXPIRES_IN: Joi.string().optional().default('8h'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().optional().default('7d'),

  SUPABASE_URL: requiredInProduction(Joi.string().uri()),
  SUPABASE_SERVICE_ROLE_KEY: requiredInProduction(
    Joi.string().min(32).pattern(secretPattern),
  ),
  SUPABASE_ANON_KEY: requiredInProduction(Joi.string().min(32)),
  HASH_SALT_ROUNDS: Joi.number().integer().min(8).max(20).default(12),
  NEXT_PUBLIC_SUPABASE_URL: Joi.string().uri().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: Joi.string().min(32).optional(),

  JWT_SECRET: requiredInProduction(
    Joi.string().min(32).pattern(secretPattern),
  ),
  JWT_REFRESH_SECRET: requiredInProduction(
    Joi.string().min(32),
  ),
  ENCRYPTION_KEY: Joi.string().min(32).optional(),
  DB_ENCRYPTION_KEY: requiredInProduction(Joi.string().min(32)),
  CERT_ENCRYPTION_KEY: Joi.string().allow('').min(32).optional(),
  CERT_ENCRYPTION_KEY_OLD: Joi.string().allow('').min(32).optional(),
  SESSION_SECRET: requiredInProduction(Joi.string().min(32)),
  CSRF_SECRET: requiredInProduction(Joi.string().min(32)),
  AUTH_SIGNATURE_SECRET: requiredInProduction(
    Joi.string().min(32).pattern(secretPattern),
  ),

  HEALTH_TOKEN: Joi.string().optional(),
  THROTTLE_LIMIT: Joi.number().integer().min(1).default(100),
  THROTTLE_TTL: Joi.number().integer().min(1).default(60000),
  SUPABASE_FETCH_TIMEOUT_MS: Joi.number().integer().min(500).max(60000).default(8000),
  SUPABASE_FETCH_MAX_RETRIES: Joi.number().integer().min(0).max(10).default(2),
  SUPABASE_FETCH_RETRY_BASE_MS: Joi.number().integer().min(25).default(250),
  SUPABASE_NETWORK_BACKOFF_MS: Joi.number().integer().min(1000).default(30000),
  ALLOWED_ORIGINS: Joi.string().optional(),
  POS_WORKER_JWT_SECRET: Joi.string().min(24).optional(),
  WORKER_API_JWT_SECRET: Joi.string().min(24).optional(),
  REDIS_HOST: Joi.string().allow('').optional(),
  REDIS_PORT: Joi.number().port().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').optional(),
  REDIS_REQUIRED: Joi.boolean().truthy('true').falsy('false').default(false),
  PFX_PATH: Joi.string().allow('').optional(),
  PFX_PASS: Joi.string().allow('').min(8).optional(),
  REQUIRE_REAL_FISCAL_CERTIFICATE: Joi.boolean().truthy('true').falsy('false').default(false),
}).custom((value, helpers) => {
  if (!value.ENCRYPTION_KEY && !value.CERT_ENCRYPTION_KEY) {
    return helpers.message({
      custom: 'Debe definir ENCRYPTION_KEY o CERT_ENCRYPTION_KEY.',
    });
  }

  const hasPfxPath = Boolean(value.PFX_PATH && value.PFX_PATH.trim());
  const hasPfxPass = Boolean(value.PFX_PASS && value.PFX_PASS.trim());

  if ((hasPfxPath || hasPfxPass) && !(hasPfxPath && hasPfxPass)) {
    return helpers.message({
      custom: 'Si se define PFX_PATH o PFX_PASS, ambos deben estar definidos.',
    });
  }

  if ((value.NODE_ENV === 'production' || value.REQUIRE_REAL_FISCAL_CERTIFICATE) && !(hasPfxPath && hasPfxPass)) {
    return helpers.message({
      custom: 'Produccion fiscal requiere PFX_PATH y PFX_PASS, o un certificado fiscal valido por tenant antes de emitir.',
    });
  }

  return value;
});
