import { APIRequestContext, APIResponse, expect, request as playwrightRequest, test } from '@playwright/test';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const apiBaseURL = process.env.E2E_API_ORIGIN || 'http://localhost:3002';
const api = (route: string) => `/api${route}`;
const runId = `${Date.now().toString().slice(-8)}-${crypto.randomUUID().slice(0, 8)}`;
const waitForAuthRateLimitWindow = () => new Promise((resolve) => setTimeout(resolve, 61000));

for (const envPath of [
  path.resolve(process.cwd(), '../../.env.local'),
  path.resolve(process.cwd(), '../../.env'),
  path.resolve(process.cwd(), '.env.local'),
  path.resolve(process.cwd(), '../erp-api/.env'),
]) {
  if (!fs.existsSync(envPath)) continue;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

type LoginResponse = {
  access_token: string;
  user: {
    id: string;
    tenant_id: string;
    roles?: Array<string | { nombre?: string }>;
  };
};

function getOperationalPassword(): string {
  // Prioridad: TEST_USER_PASSWORD explícito > DATABASE_URL > default seed.
  // Antes priorizaba DATABASE_URL, lo que rompía cuando el e2e corre con un
  // demo tenant (TEST_USER_EMAIL=demo-X@temp.local) pero DATABASE_URL apunta
  // a Supabase con otro password — el login fallaba con 401 y luego rate-limit.
  if (process.env.TEST_USER_PASSWORD) return process.env.TEST_USER_PASSWORD;
  if (process.env.DATABASE_URL) return decodeURIComponent(new URL(process.env.DATABASE_URL).password);
  return 'AdminProd2026!';
}

type RoleCase = {
  role: string;
  allow: string;
  deny: string;
};

const roleCases: RoleCase[] = [
  { role: 'GERENCIA', allow: '/analytics/ventas-tiempo?fecha_desde=2026-05-01&fecha_hasta=2026-05-16', deny: '/pos/sesion-caja' },
  { role: 'COMPRAS', allow: '/compras/proveedores', deny: '/audit-logs' },
  { role: 'ALMACEN', allow: '/inventario/productos', deny: '/finanzas/bancos/saldos' },
  { role: 'VENDEDOR', allow: '/ventas/clientes', deny: '/compras/proveedores' },
  { role: 'CAJERO', allow: '/pos/sesion-caja', deny: '/audit-logs' },
  { role: 'FINANZAS', allow: '/finanzas/bancos/saldos', deny: '/ventas/clientes' },
  { role: 'CONTADOR', allow: '/contabilidad/libro-diario', deny: '/pos/sesion-caja' },
  { role: 'RRHH', allow: '/rrhh/empleados', deny: '/finanzas/bancos/saldos' },
  { role: 'AUDITOR', allow: '/audit-logs', deny: '/pos/sesion-caja' },
];

function getSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  expect(url, 'SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL requerido para E2E roles').toBeTruthy();
  expect(key, 'SUPABASE_SERVICE_ROLE_KEY requerido para E2E roles').toBeTruthy();
  return createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function loginApi(email: string, password: string): Promise<LoginResponse> {
  const context = await playwrightRequest.newContext({ baseURL: apiBaseURL });
  try {
    let response = await context.post(api('/auth/login'), { data: { email, password } });
    if (response.status() === 429) {
      await waitForAuthRateLimitWindow();
      response = await context.post(api('/auth/login'), { data: { email, password } });
    }
    const text = await response.text();
    expect(response.ok(), `login ${email} debe responder 2xx, status=${response.status()}: ${text}`).toBe(true);
    return JSON.parse(text) as LoginResponse;
  } finally {
    await context.dispose();
  }
}

async function contextFor(token: string): Promise<APIRequestContext> {
  return playwrightRequest.newContext({
    baseURL: apiBaseURL,
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });
}

async function expect2xx(responsePromise: Promise<APIResponse>, label: string) {
  const response = await responsePromise;
  const text = await response.text();
  expect(response.ok(), `${label} debe permitir acceso, status=${response.status()}: ${text}`).toBe(true);
}

async function expect403(responsePromise: Promise<APIResponse>, label: string) {
  const response = await responsePromise;
  const text = await response.text();
  expect(response.status(), `${label} debe denegar con 403: ${text}`).toBe(403);
}

test.describe('RBAC operativo por roles diarios', () => {
  test.setTimeout(300000);

  test('roles diarios tienen permisos positivos y 403 reales en rutas ajenas', async () => {
    const admin = await loginApi(
      process.env.TEST_USER_EMAIL || 'admin@erp.local',
      getOperationalPassword(),
    );
    const tenantId = admin.user.tenant_id;
    expect(tenantId, 'admin debe devolver tenant_id').toBeTruthy();

    const supabase = getSupabase();
    const { data: roles, error: rolesError } = await supabase
      .from('roles')
      .select('id, nombre')
      .eq('tenant_id', tenantId)
      .in('nombre', roleCases.map((item) => item.role));
    expect(rolesError?.message || '', 'consultar roles operativos').toBe('');
    expect(roles?.length || 0, 'todos los roles operativos deben existir').toBe(roleCases.length);

    const roleByName = new Map((roles || []).map((role) => [role.nombre, role.id]));
    const adminContext = await contextFor(admin.access_token);
    const createdUserIds: string[] = [];

    for (const roleCase of roleCases) {
      const roleId = roleByName.get(roleCase.role);
      expect(roleId, `rol ${roleCase.role} debe existir`).toBeTruthy();

      const email = `rbac.${roleCase.role.toLowerCase()}.${runId}@erp.local`;
      const password = `Rbac${roleCase.role}${runId.replace(/[^a-zA-Z0-9]/g, '')}!1`;
      const createResponse = await adminContext.post(api('/usuarios-sistema/crear'), {
        data: {
          nombre: `RBAC ${roleCase.role} ${runId}`,
          email,
          password,
          rol_id: roleId,
          estado: 'ACTIVO',
        },
      });
      const createText = await createResponse.text();
      expect(createResponse.ok(), `crear usuario ${roleCase.role}: ${createText}`).toBe(true);
      const created = JSON.parse(createText);
      const createdUserId = created?.data?.id || created?.id;
      expect(createdUserId, `crear usuario ${roleCase.role} debe devolver id`).toBeTruthy();
      createdUserIds.push(createdUserId);

      const userLogin = await loginApi(email, password);
      const tokenRoles = (userLogin.user.roles || []).map((role) =>
        typeof role === 'string' ? role : role.nombre,
      );
      expect(tokenRoles, `token ${roleCase.role} debe incluir rol`).toContain(roleCase.role);
      const userContext = await contextFor(userLogin.access_token);
      await expect2xx(userContext.get(api(roleCase.allow)), `${roleCase.role} accede a ${roleCase.allow}`);
      await expect403(userContext.get(api(roleCase.deny)), `${roleCase.role} no accede a ${roleCase.deny}`);
      await userContext.dispose();
    }

    await adminContext.dispose();

    // Cleanup honesto: borrar los 9 usuarios RBAC creados para no acumular
    // en el demo entre runs (el demo tiene cap DEMO_MAX_USERS).
    if (createdUserIds.length) {
      try {
        await supabase.from('user_roles').delete().in('usuario_sistema_id', createdUserIds);
        await supabase.from('usuarios_sistema').delete().in('id', createdUserIds);
        await supabase.from('users').delete().in('id', createdUserIds);
      } catch (cleanupError) {
        console.warn('roles-operativos cleanup warning:', cleanupError);
      }
    }
  });
});
