import path from 'path';
import { existsSync, readFileSync } from 'fs';
import { parse } from 'dotenv';

export const PROD_SUPABASE_PROJECT_REF = 'wypnbcptofqdmoynlonq';
export const MINIMUM_WORKER_SCHEMA_VERSION = 553;

export function loadWorkerEnvironment(cwd = process.cwd(), env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV === 'test') return;
  const paths = [
    path.resolve(cwd, 'apps/worker/.env.production'),
    path.resolve(cwd, '.env.production'),
    path.resolve(cwd, '../../.env.production'),
  ];
  for (const file of paths) {
    if (existsSync(file)) {
      try {
        const values = parse(readFileSync(file));
        for (const [key, value] of Object.entries(values)) {
          if (env[key] === undefined) env[key] = value;
        }
      } catch {
        throw new Error('No se pudo cargar la configuración productiva del worker');
      }
    }
  }
}

export type WorkerRuntimeConfig = {
  apiBase: string;
  healthPort: number;
  healthToken?: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  redisHost: string;
  redisPort: number;
  redisPassword?: string;
  workerJwtSecret: string;
  requiredSchemaVersion: number;
};


function requireEnv(env: NodeJS.ProcessEnv, name: string, minLength = 1): string {
  const value = env[name]?.trim();
  if (!value || value.length < minLength) {
    throw new Error(`${name} must be configured with at least ${minLength} characters`);
  }
  return value;
}

function parsePort(value: string | undefined, fallback: number, name: string): number {
  const raw = value?.trim();
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`${name} must be a valid TCP port`);
  }
  return parsed;
}

function parseUrl(value: string, name: string): string {
  try {
    return new URL(value).toString().replace(/\/$/, '');
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
}

export function loadWorkerRuntimeConfig(env: NodeJS.ProcessEnv): WorkerRuntimeConfig {
  if (env.NODE_ENV !== 'production' || env.DEPLOYMENT_ENV !== 'PROD') {
    throw new Error('El worker sólo admite NODE_ENV=production y DEPLOYMENT_ENV=PROD');
  }
  if (env.EXPECTED_SUPABASE_PROJECT_REF !== PROD_SUPABASE_PROJECT_REF) {
    throw new Error(`El worker exige EXPECTED_SUPABASE_PROJECT_REF=${PROD_SUPABASE_PROJECT_REF}`);
  }
  const supabaseUrl = parseUrl(requireEnv(env, 'SUPABASE_URL'), 'SUPABASE_URL');
  if (supabaseUrl !== `https://${PROD_SUPABASE_PROJECT_REF}.supabase.co`) {
    throw new Error('SUPABASE_URL del worker debe apuntar exclusivamente al proyecto PROD autorizado');
  }
  const apiUrl = requireEnv(env, 'ERP_API_URL');
  const requiredSchemaVersion = Number(requireEnv(env, 'REQUIRED_DATABASE_SCHEMA_VERSION'));
  if (!Number.isSafeInteger(requiredSchemaVersion) || requiredSchemaVersion < MINIMUM_WORKER_SCHEMA_VERSION) {
    throw new Error(`El worker exige REQUIRED_DATABASE_SCHEMA_VERSION >= ${MINIMUM_WORKER_SCHEMA_VERSION}`);
  }

  const healthToken = env.HEALTH_TOKEN?.trim();
  const redisPassword = env.REDIS_PASSWORD?.trim();

  return {
    apiBase: parseUrl(apiUrl, 'ERP_API_URL'),
    healthPort: parsePort(env.WORKER_PORT, 3050, 'WORKER_PORT'),
    healthToken: healthToken || undefined,
    supabaseUrl,
    supabaseServiceRoleKey: requireEnv(env, 'SUPABASE_SERVICE_ROLE_KEY'),
    redisHost: env.REDIS_HOST?.trim() || 'localhost',
    redisPort: parsePort(env.REDIS_PORT, 6379, 'REDIS_PORT'),
    redisPassword: redisPassword || undefined,
    workerJwtSecret: requireEnv(env, 'POS_WORKER_JWT_SECRET', 24),
    requiredSchemaVersion,
  };
}
