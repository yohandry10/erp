/**
 * Contrato HTTP real de PostgREST para 492.
 *
 * Sólo admite una instancia local efímera. Requiere que el caller cree un
 * tenant/actor fixture y suministre un JWT service_role de esa instancia.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { ChildProcess, spawn } from 'node:child_process';

const tenantId = required('POSTGREST_QA_TENANT_ID');
const actorId = required('POSTGREST_QA_ACTOR_ID');
let baseUrl = (process.env.POSTGREST_URL?.trim() || 'http://127.0.0.1:55435').replace(/\/$/, '');
let serviceRoleJwt = process.env.POSTGREST_SERVICE_ROLE_JWT?.trim() || '';
let localPostgrest: ChildProcess | null = null;
const host = new URL(baseUrl).hostname;

if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
  throw new Error(`El E2E 492 rechaza PostgREST no local: ${host}`);
}

type HttpResult = { status: number; data: any };

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta ${name} para E2E PostgREST 492`);
  return value;
}

function signServiceRoleJwt(secret: string): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({ role: 'service_role', exp: Math.floor(Date.now() / 1000) + 600 });
  const signature = crypto.createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}

async function startLocalPostgrestIfNeeded(): Promise<void> {
  if (serviceRoleJwt) return;
  const binary = required('POSTGREST_BINARY');
  const dbUri = required('POSTGREST_DB_URI');
  const secret = crypto.randomBytes(48).toString('base64url');
  serviceRoleJwt = signServiceRoleJwt(secret);
  const url = new URL(baseUrl);
  localPostgrest = spawn(binary, [], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PGRST_DB_URI: dbUri,
      PGRST_DB_SCHEMAS: 'public',
      PGRST_DB_ANON_ROLE: 'anon',
      PGRST_JWT_SECRET: secret,
      PGRST_SERVER_HOST: url.hostname,
      PGRST_SERVER_PORT: url.port || '3000',
    },
  });
  let stderr = '';
  localPostgrest.stderr?.on('data', (chunk) => { stderr += String(chunk); });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (localPostgrest.exitCode !== null) {
      throw new Error(`PostgREST local terminó antes de iniciar: ${stderr.slice(-1000)}`);
    }
    try {
      const response = await fetch(`${baseUrl}/`);
      if (response.ok) return;
    } catch { /* proceso aún iniciando */ }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`PostgREST local no quedó disponible: ${stderr.slice(-1000)}`);
}

async function call(
  path: string,
  options: { method?: string; body?: unknown; authenticated?: boolean } = {},
): Promise<HttpResult> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (options.authenticated !== false) {
    headers.authorization = `Bearer ${serviceRoleJwt}`;
  }
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'POST',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let data: any = text;
  try { data = text ? JSON.parse(text) : null; } catch { /* conservar texto */ }
  return { status: response.status, data };
}

async function main(): Promise<void> {
  await startLocalPostgrestIfNeeded();
  try {
  const suffix = crypto.randomUUID();
  let result = await call('/rpc/enqueue_outbox_event_tx', {
    authenticated: false,
    body: {
      p_event: {
        tenant_id: tenantId, event_type: 'verify.postgrest.anon',
        aggregate_type: 'verify', aggregate_id: suffix, payload: {},
      },
    },
  });
  assert.ok([401, 403, 404].includes(result.status), `anon enqueue HTTP ${result.status}`);

  result = await call('/rpc/outbox_runtime_health_492', {
    body: {
      // La instancia local puede contener fixtures válidos de otras suites;
      // aquí verificamos el contrato HTTP/ACL, no el umbral operativo de PROD
      // (ese umbral queda cubierto por AppController y el verificador SQL).
      p_max_claimable: 5000, p_max_oldest_seconds: 86400,
      p_max_dead_letter: 100, p_processing_stale_seconds: 900,
      p_required_schema_version: 492,
    },
  });
  assert.equal(result.status, 200);
  assert.equal(result.data?.ready, true, JSON.stringify(result.data));

  result = await call('/rpc/enqueue_outbox_event_tx', {
    body: {
      p_event: {
        tenant_id: tenantId, event_type: 'verify.postgrest.492',
        aggregate_type: 'verify', aggregate_id: suffix,
        idempotency_key: `verify-postgrest-492:${suffix}`, payload: { transport: 'http' },
      },
    },
  });
  assert.equal(result.status, 200);
  assert.ok(result.data?.id && result.data?.event_id);
  const rowId = result.data.id as string;

  result = await call('/rpc/claim_outbox_events_tx', {
    body: {
      p_worker: 'postgrest-e2e-492', p_limit: 1,
      p_event_types: ['verify.postgrest.492'], p_excluded_event_types: null,
      p_tenant_id: tenantId, p_max_retries: 3,
    },
  });
  assert.equal(result.status, 200);
  assert.equal(result.data?.length, 1);
  const claimToken = result.data[0].claim_token as string;
  assert.ok(claimToken);

  result = await call(`/outbox_events?id=eq.${rowId}`, {
    method: 'PATCH', body: { status: 'completed' },
  });
  assert.ok([401, 403].includes(result.status), `PATCH outbox HTTP ${result.status}`);

  result = await call('/rpc/complete_outbox_event_tx', {
    body: { p_id: rowId, p_claim_token: claimToken },
  });
  assert.equal(result.status, 200);
  assert.equal(result.data, true);

  result = await call('/rpc/gestionar_notificacion_tx', {
    body: {
      p_tenant_id: tenantId, p_actor_id: actorId, p_operacion: 'CREATE',
      p_payload: {
        usuario_id: actorId, tipo: 'system', severidad: 'info',
        titulo: 'PostgREST 492', mensaje: 'Contrato HTTP',
      },
    },
  });
  assert.equal(result.status, 200);
  const notificationId = result.data?.id as string;
  assert.ok(notificationId);

  result = await call(`/notificaciones?id=eq.${notificationId}`, {
    method: 'PATCH', body: { leida: true },
  });
  assert.ok([401, 403].includes(result.status), `PATCH notificación HTTP ${result.status}`);

  result = await call('/rpc/gestionar_notificacion_tx', {
    body: {
      p_tenant_id: tenantId, p_actor_id: actorId, p_operacion: 'DELETE',
      p_payload: { notification_id: notificationId },
    },
  });
  assert.equal(result.status, 200);
  assert.equal(result.data?.deleted, true);

  process.stdout.write('PostgREST runtime outbox 492: OK\n');
  } finally {
    localPostgrest?.kill();
  }
}

void main().catch((error) => {
  localPostgrest?.kill();
  console.error(error);
  process.exitCode = 1;
});
