#!/usr/bin/env node

const apiUrl = (process.env.LOAD_TEST_API_URL || 'http://localhost:3002').replace(/\/+$/, '');
const durationMs = Number(process.env.LOAD_TEST_DURATION_MS || 60000);
const concurrency = Number(process.env.LOAD_TEST_CONCURRENCY || 8);
const timeoutMs = Number(process.env.LOAD_TEST_TIMEOUT_MS || 15000);
const outputFile = process.env.LOAD_TEST_OUTPUT || '';
const email = process.env.LOAD_TEST_EMAIL || '';
const password = process.env.LOAD_TEST_PASSWORD || '';

const publicEndpoints = [
  { method: 'GET', path: '/api/health/live', name: 'health_live', weight: 4 },
  { method: 'GET', path: '/api/health/ready', name: 'health_ready', weight: 3 },
  { method: 'GET', path: '/api/health/version', name: 'health_version', weight: 1 },
  { method: 'GET', path: '/api/info', name: 'api_info', weight: 1 },
];

const authenticatedEndpoints = [
  { method: 'GET', path: '/api/auth/profile', name: 'auth_profile', weight: 2 },
  { method: 'GET', path: '/api/dashboard/stats', name: 'dashboard_stats', weight: 5 },
  { method: 'GET', path: '/api/dashboard/activities', name: 'dashboard_activities', weight: 4 },
  { method: 'GET', path: '/api/configuration/context/status', name: 'configuration_context_status', weight: 3 },
  { method: 'GET', path: '/api/notifications/unread', name: 'notifications_unread', weight: 3 },
  { method: 'GET', path: '/api/ventas/clientes?limit=10&page=1', name: 'ventas_clientes', weight: 2 },
  { method: 'GET', path: '/api/ventas/pedidos?limit=10&page=1', name: 'ventas_pedidos', weight: 2 },
  { method: 'GET', path: '/api/ventas/cotizaciones?limit=10&page=1', name: 'ventas_cotizaciones', weight: 2 },
  { method: 'GET', path: '/api/compras/ordenes?limit=10&page=1', name: 'compras_ordenes', weight: 2 },
  { method: 'GET', path: '/api/compras/proveedores?limit=10&page=1', name: 'compras_proveedores', weight: 2 },
  { method: 'GET', path: '/api/inventario/productos?limit=10&page=1', name: 'inventario_productos', weight: 2 },
  { method: 'GET', path: '/api/inventario/stats', name: 'inventario_stats', weight: 2 },
  { method: 'GET', path: '/api/cpe?limit=10&page=1', name: 'cpe_list', weight: 2 },
  { method: 'GET', path: '/api/cpe/stats', name: 'cpe_stats', weight: 2 },
  { method: 'GET', path: '/api/finanzas/bancos/cuentas', name: 'finanzas_bancos_cuentas', weight: 2 },
  { method: 'GET', path: '/api/finanzas/cxc?limit=10&page=1', name: 'finanzas_cxc', weight: 2 },
  { method: 'GET', path: '/api/finanzas/cxp?limit=10&page=1', name: 'finanzas_cxp', weight: 2 },
];

const samples = [];
const statusCounts = new Map();
const errorCounts = new Map();
let authenticated = false;
let token = '';

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

function increment(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function buildWeightedPool(endpoints) {
  return endpoints.flatMap((endpoint) => Array.from({ length: endpoint.weight }, () => endpoint));
}

function pick(pool) {
  return pool[Math.floor(Math.random() * pool.length)];
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function login() {
  if (!email || !password) return;

  const started = performance.now();
  const response = await fetchWithTimeout(`${apiUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const latencyMs = performance.now() - started;
  const body = await response.json().catch(() => ({}));

  if (!response.ok || !body?.access_token) {
    samples.push({
      name: 'auth_login',
      method: 'POST',
      path: '/api/auth/login',
      status: response.status,
      latencyMs,
      ok: false,
      error: body?.message || response.statusText || 'login_failed',
    });
    return;
  }

  token = body.access_token;
  authenticated = true;
  samples.push({
    name: 'auth_login',
    method: 'POST',
    path: '/api/auth/login',
    status: response.status,
    latencyMs,
    ok: true,
  });
}

async function requestEndpoint(endpoint) {
  const headers = { accept: 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;

  const started = performance.now();
  let status = 0;
  let error = '';

  try {
    const response = await fetchWithTimeout(`${apiUrl}${endpoint.path}`, {
      method: endpoint.method,
      headers,
    });
    status = response.status;
    await response.arrayBuffer().catch(() => undefined);
  } catch (err) {
    error = err?.name === 'AbortError' ? 'timeout' : err?.message || 'request_failed';
  }

  const latencyMs = performance.now() - started;
  const ok = status >= 200 && status < 400 && !error;
  samples.push({
    name: endpoint.name,
    method: endpoint.method,
    path: endpoint.path,
    status,
    latencyMs,
    ok,
    error,
  });

  increment(statusCounts, status || error || 'unknown');
  if (error) increment(errorCounts, error);
  if (status === 429) increment(errorCounts, 'http_429');
  if (status >= 500) increment(errorCounts, 'http_5xx');
}

function summarizeEndpoint(name, endpointSamples) {
  const latencies = endpointSamples.map((sample) => sample.latencyMs);
  const statuses = {};
  for (const sample of endpointSamples) {
    const key = String(sample.status || sample.error || 'unknown');
    statuses[key] = (statuses[key] || 0) + 1;
  }

  return {
    name,
    requests: endpointSamples.length,
    ok: endpointSamples.filter((sample) => sample.ok).length,
    errors: endpointSamples.filter((sample) => !sample.ok).length,
    p50Ms: Math.round(percentile(latencies, 50)),
    p95Ms: Math.round(percentile(latencies, 95)),
    p99Ms: Math.round(percentile(latencies, 99)),
    maxMs: Math.round(Math.max(0, ...latencies)),
    statuses,
  };
}

function summarize() {
  const latencies = samples.map((sample) => sample.latencyMs);
  const grouped = new Map();
  for (const sample of samples) {
    if (!grouped.has(sample.name)) grouped.set(sample.name, []);
    grouped.get(sample.name).push(sample);
  }

  return {
    apiUrl,
    startedAt: new Date(Date.now() - durationMs).toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs,
    concurrency,
    authenticated,
    requests: samples.length,
    ok: samples.filter((sample) => sample.ok).length,
    errors: samples.filter((sample) => !sample.ok).length,
    rps: Number((samples.length / (durationMs / 1000)).toFixed(2)),
    p50Ms: Math.round(percentile(latencies, 50)),
    p95Ms: Math.round(percentile(latencies, 95)),
    p99Ms: Math.round(percentile(latencies, 99)),
    maxMs: Math.round(Math.max(0, ...latencies)),
    statusCounts: Object.fromEntries(statusCounts),
    errorCounts: Object.fromEntries(errorCounts),
    endpoints: [...grouped.entries()]
      .map(([name, endpointSamples]) => summarizeEndpoint(name, endpointSamples))
      .sort((a, b) => b.requests - a.requests),
  };
}

async function main() {
  await login();

  const endpoints = authenticated
    ? [...publicEndpoints, ...authenticatedEndpoints]
    : publicEndpoints;
  const pool = buildWeightedPool(endpoints);
  const endsAt = Date.now() + durationMs;

  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (Date.now() < endsAt) {
        await requestEndpoint(pick(pool));
      }
    }),
  );

  const result = summarize();
  const json = `${JSON.stringify(result, null, 2)}\n`;
  process.stdout.write(json);

  if (outputFile) {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(outputFile, json, 'utf8');
  }

  const unacceptableErrors = result.errorCounts.http_5xx || result.errorCounts.http_429 || 0;
  process.exitCode = unacceptableErrors > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
