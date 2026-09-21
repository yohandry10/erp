/** API Nest real con PostgreSQL/PostgREST efímeros. Nunca carga .env ni secretos operativos. */
import 'reflect-metadata';
import { createHmac } from 'node:crypto';
import { URL } from 'node:url';

if (process.env.E2E_EPHEMERAL_LOCAL_DB !== '1') throw new Error('Se exige E2E_EPHEMERAL_LOCAL_DB=1');
const restUrl = new URL(process.env.LOCAL_POSTGREST_URL || 'http://127.0.0.1:55447');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(restUrl.hostname)) throw new Error('PostgREST debe ser local');
const port = Number(process.env.LOCAL_API_PORT || 3122);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Puerto local inválido');
const webUrl = new URL(process.env.LOCAL_WEB_URL || 'http://127.0.0.1:3121');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(webUrl.hostname)) throw new Error('La web debe ser local');

// La configuración Joi del runtime conserva su contrato PROD-only. El test no
// configura un destino Supabase operativo: inyecta la dependencia local explícita.
for (const name of Object.keys(process.env)) {
  if (/^(SUPABASE_|NEXT_PUBLIC_SUPABASE_|EXPECTED_SUPABASE_|SUNAT_|OSE_|SMTP_|PFX_|CERTIFICATE_|STRIPE_|SIRE_|DIAN_|ARCA_|REDIS_)/.test(name)) delete process.env[name];
}
Object.assign(process.env, {
  NODE_ENV: 'test', DEPLOYMENT_ENV: 'PROD',
  FRONTEND_URL: webUrl.origin,
  ALLOWED_ORIGINS: webUrl.origin,
  ENCRYPTION_KEY: 'local-integration-encryption-key-20260905-only',
  JWT_SECRET: 'local-api-integration-jwt-key-20260905-never-production',
  JWT_REFRESH_SECRET: 'local-api-refresh-jwt-key-20260905-never-production',
  SESSION_SECRET: 'local-api-session-key-20260905-never-production',
  CSRF_SECRET: 'local-api-csrf-key-20260905-never-production',
  AUTH_SIGNATURE_SECRET: 'local-api-signature-key-20260905-never-production',
  REDIS_REQUIRED: 'false', BACKGROUND_JOBS_ENABLED: 'false',
  OUTBOX_WORKER_CRON_ENABLED: 'false', ACCOUNTING_OUTBOX_WORKER_CRON_ENABLED: 'false',
  DEMO_API_ENABLED: 'false', LOG_LEVEL: 'warn',
});

const localHost = (host: string) => ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(host);
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (!localHost(url.hostname)) throw new Error('Transporte externo bloqueado en prueba integrada local');
  if (url.origin === restUrl.origin && url.pathname.startsWith('/rest/v1/')) {
    url.pathname = url.pathname.slice('/rest/v1'.length);
    const redirectedInput = input instanceof Request ? new Request(url, input) : url;
    return nativeFetch(redirectedInput, { ...init, redirect: 'error' });
  }
  return nativeFetch(input, { ...init, redirect: 'error' });
};
for (const protocol of ['node:http', 'node:https']) {
  const transport = require(protocol);
  const nativeRequest = transport.request;
  transport.request = function (...args: any[]) {
    const options = args[0];
    const host = typeof options === 'string' || options instanceof URL
      ? new URL(options).hostname : options.hostname || options.host || 'localhost';
    if (!localHost(String(host).split(':')[0]) && host !== '::1' && host !== '[::1]') {
      throw new Error('Transporte externo bloqueado en prueba integrada local');
    }
    return nativeRequest.apply(this, args);
  };
}

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const jwtPayload = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ role: 'service_role', exp: Math.floor(Date.now() / 1000) + 7200 })}`;
const serviceJwt = `${jwtPayload}.${createHmac('sha256', 'local-integration-key-only-never-production-20260905').update(jwtPayload).digest('base64url')}`;

async function main() {
  const { Test } = await import('@nestjs/testing');
  const { ConfigService } = await import('@nestjs/config');
  const { ValidationPipe, ConsoleLogger } = await import('@nestjs/common');
  const { AppModule } = await import('../../../src/app.module');
  const { SupabaseService } = await import('../../../src/shared/supabase/supabase.service');
  const { TenantContextService } = await import('../../../src/shared/tenant/tenant-context.service');
  const { GlobalExceptionFilter } = await import('../../../src/common/filters/global-exception.filter');
  const { migrationBodyParser } = await import('../../../src/modules/migration/migration-body-parser');
  const { ContabilidadEventsListener } = await import('../../../src/modules/contabilidad/listeners/contabilidad-events.listener');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .setLogger(new ConsoleLogger({ logLevels: ['error', 'warn'] }))
    .overrideProvider('REDIS_CLIENT').useValue(null)
    .overrideProvider(SupabaseService).useFactory({
      inject: [TenantContextService, ConfigService],
      factory: (context: InstanceType<typeof TenantContextService>, config: InstanceType<typeof ConfigService>) => {
        const localConfig = { get: (key: string, fallback?: unknown) => {
          if (key === 'SUPABASE_URL') return restUrl.origin;
          if (key === 'SUPABASE_SERVICE_ROLE_KEY' || key === 'SUPABASE_ANON_KEY') return serviceJwt;
          return config.get(key, fallback);
        } };
        return new SupabaseService(context, localConfig as any);
      },
    }).compile();
  const accounting = moduleRef.get(ContabilidadEventsListener);
  // La prueba decide cuándo consumir el outbox y puede observar primero la
  // transacción de venta. El procesador invocado sigue siendo el servicio real.
  accounting.onApplicationBootstrap = () => undefined;
  if (process.argv.includes('--accounting-once')) {
    try { await accounting.procesarEventosPendientes(); }
    finally { await moduleRef.close(); }
    process.stdout.write('LOCAL_ACCOUNTING_BATCH_FINISHED\n');
    return;
  }
  const app = moduleRef.createNestApplication({ logger: ['error', 'warn'] });
  app.use('/api/migration', migrationBodyParser());
  app.setGlobalPrefix('api');
  app.enableCors({ origin: webUrl.origin, credentials: true });
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, transformOptions: { enableImplicitConversion: true } }));
  await app.listen(port, '127.0.0.1');
  process.stdout.write(`LOCAL_INTEGRATED_API_READY http://127.0.0.1:${port}\n`);
  const shutdown = async () => { await app.close(); process.exit(0); };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
