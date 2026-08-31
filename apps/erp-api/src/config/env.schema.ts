import * as Joi from 'joi';
import { MINIMUM_DATABASE_SCHEMA_VERSION } from './database-schema-version';

export interface AppEnvironment {
  NODE_ENV: string;
  DEPLOYMENT_ENV: 'PROD';
  EXPECTED_SUPABASE_PROJECT_REF?: string;
  DEMO_API_ENABLED: boolean;
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
  OUTBOX_WORKER_CRON_ENABLED?: boolean;
  ACCOUNTING_OUTBOX_WORKER_CRON_ENABLED?: boolean;
  OUTBOX_READY_MAX_CLAIMABLE?: number;
  OUTBOX_READY_MAX_OLDEST_SECONDS?: number;
  OUTBOX_READY_MAX_DEAD_LETTER?: number;
  OUTBOX_READY_STALE_SECONDS?: number;
  REQUIRED_DATABASE_SCHEMA_VERSION?: number;
  APP_VERSION?: string;
  APP_COMMIT_SHA?: string;
  APP_BUILD_DATE?: string;
  PFX_PATH?: string;
  PFX_PASS?: string;
  REQUIRE_REAL_FISCAL_CERTIFICATE?: boolean;
  EMPRESA_RUC?: string;
  SUNAT_ENVIRONMENT?: 'homologacion' | 'produccion' | 'sandbox';
  SUNAT_CPE_URL?: string;
  SUNAT_GRE_URL?: string;
  SUNAT_GRE_TRANSPORT?: 'soap' | 'rest';
  SUNAT_GRE_REST_BASE_URL?: string;
  SUNAT_GRE_AUTH_URL?: string;
  SUNAT_GRE_CLIENT_ID?: string;
  SUNAT_GRE_CLIENT_SECRET?: string;
  SUNAT_SUMMARY_URL?: string;
  SUNAT_QUERY_URL?: string;
  SUNAT_USERNAME?: string;
  SUNAT_PASSWORD?: string;
  SUNAT_CERT_EXPECTED_RUC?: string;
  SUNAT_CERT_RUC_MISMATCH_CONFIRMED?: boolean;
  SUNAT_CERT_RUC_MISMATCH_REASON?: string;
  OSE_URL?: string;
  OSE_USERNAME?: string;
  OSE_USUARIO?: string;
  OSE_PASSWORD?: string;
}

const secretPattern = /(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+=[\]{}|\\:;"'<>,.?/~`-])/;
export const PROD_SUPABASE_PROJECT_REF = 'wypnbcptofqdmoynlonq';

/**
 * Un secreto de servidor no lo teclea nadie: lo genera una maquina y se guarda
 * en el gestor de secretos del entorno. Exigirle "una mayuscula y un simbolo"
 * es una regla de contrasenas humanas mal aplicada: rechaza 64 caracteres
 * hexadecimales —256 bits de entropia— y acepta "Aa1!" repetido ocho veces.
 *
 * Se aceptan dos formas: suficientemente largo para venir de un generador, o
 * mas corto pero con mezcla de tipos, para los que todavia se escriban a mano.
 */
const LONGITUD_SECRETO_GENERADO = 44;
const secretoDeServidor = Joi.alternatives().try(
  Joi.string().min(LONGITUD_SECRETO_GENERADO),
  Joi.string().min(32).pattern(secretPattern),
);

const requiredInProduction = (schema: Joi.StringSchema | Joi.AlternativesSchema) =>
  Joi.when('NODE_ENV', {
    is: 'test',
    then: schema.optional(),
    otherwise: schema.required(),
  });

export const envSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'staging', 'production').default('development'),
  // Contrato operativo: este repositorio sólo puede ejecutar el ERP contra
  // PROD. DEV quedó retirado y se rechaza incluso si alguien conserva un .env
  // antiguo. Los tests unitarios no necesitan una base remota.
  DEPLOYMENT_ENV: Joi.string().valid('PROD').default('PROD'),
  EXPECTED_SUPABASE_PROJECT_REF: Joi.string().pattern(/^[a-z]{20}$/).optional(),
  // La prueba gratuita vive en producción a propósito: el cliente prueba con su
  // cuenta y, al activarla, conserva lo que cargó. Sigue apagada por defecto,
  // así que hay que encenderla a mano en el entorno donde se quiera ofrecer.
  DEMO_API_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),
  PORT: Joi.number().port().default(3002),
  LOG_LEVEL: Joi.string().optional().default('info'),
  JWT_EXPIRES_IN: Joi.string().optional().default('8h'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().optional().default('7d'),

  SUPABASE_URL: requiredInProduction(Joi.string().uri()),
  SUPABASE_SERVICE_ROLE_KEY: requiredInProduction(
    secretoDeServidor,
  ),
  SUPABASE_ANON_KEY: requiredInProduction(Joi.string().min(32)),
  HASH_SALT_ROUNDS: Joi.number().integer().min(8).max(20).default(12),
  NEXT_PUBLIC_SUPABASE_URL: Joi.string().uri().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: Joi.string().min(32).optional(),

  JWT_SECRET: requiredInProduction(
    secretoDeServidor,
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
    secretoDeServidor,
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
  OUTBOX_WORKER_CRON_ENABLED: Joi.boolean().truthy('true').falsy('false').default(true),
  ACCOUNTING_OUTBOX_WORKER_CRON_ENABLED: Joi.boolean().truthy('true').falsy('false').default(true),
  OUTBOX_READY_MAX_CLAIMABLE: Joi.number().integer().min(0).default(5000),
  OUTBOX_READY_MAX_OLDEST_SECONDS: Joi.number().integer().min(0).default(900),
  OUTBOX_READY_MAX_DEAD_LETTER: Joi.number().integer().min(0).default(100),
  OUTBOX_READY_STALE_SECONDS: Joi.number().integer().min(1).default(900),
  REQUIRED_DATABASE_SCHEMA_VERSION: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.number().integer().min(1).required(),
    otherwise: Joi.number().integer().min(1).default(MINIMUM_DATABASE_SCHEMA_VERSION),
  }),
  APP_VERSION: Joi.string().max(100).optional(),
  APP_COMMIT_SHA: Joi.string().max(100).optional(),
  APP_BUILD_DATE: Joi.string().isoDate().optional(),
  PFX_PATH: Joi.string().allow('').optional(),
  PFX_PASS: Joi.string().allow('').min(8).optional(),
  REQUIRE_REAL_FISCAL_CERTIFICATE: Joi.boolean().truthy('true').falsy('false').default(false),
  EMPRESA_RUC: Joi.string().pattern(/^\d{11}$/).allow('').optional(),
  SUNAT_ENVIRONMENT: Joi.string().valid('homologacion', 'produccion', 'sandbox').default('homologacion'),
  SUNAT_CPE_URL: Joi.string().uri().allow('').optional(),
  SUNAT_GRE_URL: Joi.string().uri().allow('').optional(),
  SUNAT_GRE_TRANSPORT: Joi.string().valid('soap', 'rest').default('soap'),
  SUNAT_GRE_REST_BASE_URL: Joi.string().uri().allow('').optional(),
  SUNAT_GRE_AUTH_URL: Joi.string().uri().allow('').optional(),
  SUNAT_GRE_CLIENT_ID: Joi.string().allow('').optional(),
  SUNAT_GRE_CLIENT_SECRET: Joi.string().allow('').optional(),
  SUNAT_SUMMARY_URL: Joi.string().uri().allow('').optional(),
  SUNAT_QUERY_URL: Joi.string().uri().allow('').optional(),
  SUNAT_USERNAME: Joi.string().allow('').optional(),
  SUNAT_PASSWORD: Joi.string().allow('').optional(),
  SUNAT_CERT_EXPECTED_RUC: Joi.string().pattern(/^\d{11}$/).allow('').optional(),
  SUNAT_CERT_RUC_MISMATCH_CONFIRMED: Joi.boolean().truthy('true').falsy('false').default(false),
  SUNAT_CERT_RUC_MISMATCH_REASON: Joi.string().allow('').optional(),
  OSE_URL: Joi.string().uri().allow('').optional(),
  OSE_USERNAME: Joi.string().allow('').optional(),
  OSE_USUARIO: Joi.string().allow('').optional(),
  OSE_PASSWORD: Joi.string().allow('').optional(),
}).custom((value, helpers) => {
  const actualProjectRef = value.SUPABASE_URL
    ? new URL(value.SUPABASE_URL).hostname.split('.')[0]
    : undefined;

  // Este repositorio opera un solo proyecto de Supabase. La comprobación va antes
  // que cualquier otra y **también bajo NODE_ENV=test**, que es el único modo en
  // el que el resto de reglas se relajan.
  //
  // Antes esto era una lista negra con el identificador del proyecto DEV
  // retirado. Una lista negra protege de lo que ya conoces: si mañana aparece un
  // cuarto proyecto, no lo cubre. Y obligaba a conservar el nombre de DEV en el
  // código, la configuración del frontend, dos pruebas y tres documentos. Una
  // lista blanca protege de todo lo que no sea PROD y no necesita nombrar nada.
  if (actualProjectRef && actualProjectRef !== PROD_SUPABASE_PROJECT_REF) {
    return helpers.message({
      custom: `SUPABASE_URL apunta al proyecto ${actualProjectRef}; este repositorio sólo opera ${PROD_SUPABASE_PROJECT_REF}.`,
    });
  }

  if (
    value.EXPECTED_SUPABASE_PROJECT_REF &&
    value.EXPECTED_SUPABASE_PROJECT_REF !== PROD_SUPABASE_PROJECT_REF
  ) {
    return helpers.message({
      custom: `EXPECTED_SUPABASE_PROJECT_REF declara ${value.EXPECTED_SUPABASE_PROJECT_REF}; este repositorio sólo opera ${PROD_SUPABASE_PROJECT_REF}.`,
    });
  }

  if (value.NODE_ENV !== 'test') {
    if (value.NODE_ENV !== 'production' || value.DEPLOYMENT_ENV !== 'PROD') {
      return helpers.message({
        custom: 'El runtime operativo sólo admite NODE_ENV=production y DEPLOYMENT_ENV=PROD.',
      });
    }
    if (value.EXPECTED_SUPABASE_PROJECT_REF !== PROD_SUPABASE_PROJECT_REF) {
      return helpers.message({
        custom: `El runtime operativo exige EXPECTED_SUPABASE_PROJECT_REF=${PROD_SUPABASE_PROJECT_REF}.`,
      });
    }
    if (actualProjectRef !== PROD_SUPABASE_PROJECT_REF) {
      return helpers.message({
        custom: `SUPABASE_URL debe apuntar exclusivamente a PROD (${PROD_SUPABASE_PROJECT_REF}).`,
      });
    }
  }

  if (value.EXPECTED_SUPABASE_PROJECT_REF && actualProjectRef !== value.EXPECTED_SUPABASE_PROJECT_REF) {
    return helpers.message({
      custom: `SUPABASE_URL apunta a ${actualProjectRef || 'un host desconocido'}, no al EXPECTED_SUPABASE_PROJECT_REF declarado.`,
    });
  }

  if (value.NODE_ENV === 'production' && !value.EXPECTED_SUPABASE_PROJECT_REF) {
    return helpers.message({
      custom: 'NODE_ENV=production requiere EXPECTED_SUPABASE_PROJECT_REF.',
    });
  }

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

  // Un SaaS multi-tenant no tiene un certificado fiscal global: cada cliente
  // sube el suyo y la emision ya se niega si el certificado no es del RUC que
  // firma (ver CertificateOwnershipError; no hay fallback silencioso). Exigirlo
  // al arrancar hacia imposible desplegar en produccion. Queda como opcion
  // explicita para instalaciones de una sola empresa con certificado propio.
  if (value.REQUIRE_REAL_FISCAL_CERTIFICATE && !(hasPfxPath && hasPfxPass)) {
    return helpers.message({
      custom: 'REQUIRE_REAL_FISCAL_CERTIFICATE exige PFX_PATH y PFX_PASS.',
    });
  }

  if (value.SUNAT_ENVIRONMENT === 'produccion') {
    const expectedRuc = value.SUNAT_CERT_EXPECTED_RUC || value.EMPRESA_RUC;
    if (!expectedRuc || !/^\d{11}$/.test(expectedRuc)) {
      return helpers.message({
        custom: 'SUNAT produccion requiere SUNAT_CERT_EXPECTED_RUC o EMPRESA_RUC con 11 digitos.',
      });
    }

    if (value.SUNAT_CERT_RUC_MISMATCH_CONFIRMED && !value.SUNAT_CERT_RUC_MISMATCH_REASON?.trim()) {
      return helpers.message({
        custom: 'SUNAT_CERT_RUC_MISMATCH_CONFIRMED requiere SUNAT_CERT_RUC_MISMATCH_REASON con referencia escrita del proveedor/SUNAT.',
      });
    }
  }

  if (value.SUNAT_GRE_TRANSPORT === 'rest') {
    if (!value.SUNAT_GRE_CLIENT_ID?.trim() || !value.SUNAT_GRE_CLIENT_SECRET?.trim()) {
      return helpers.message({
        custom: 'SUNAT_GRE_TRANSPORT=rest requiere SUNAT_GRE_CLIENT_ID y SUNAT_GRE_CLIENT_SECRET de API SUNAT GRE.',
      });
    }
  }

  return value;
});
