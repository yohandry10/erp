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
    email: string;
    tenant_id: string;
    is_super_admin: boolean;
    roles?: Array<string | { nombre?: string }>;
  };
};

type CreatedTenant = {
  tenantId: string;
  adminEmail: string;
};

const expectedRolePermissions = new Map([
  ['ADMIN', 195],
  ['CONTADOR', 64],
  ['VENDEDOR', 51],
  ['CAJERO', 35],
  ['COMPRAS', 33],
  ['ALMACEN', 23],
  ['FINANZAS', 23],
  ['GERENCIA', 20],
  ['AUDITOR', 18],
  ['RRHH', 3],
]);

function getSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  expect(url, 'SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL requerido').toBeTruthy();
  expect(key, 'SUPABASE_SERVICE_ROLE_KEY requerido').toBeTruthy();
  return createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });
}

function getOperationalPassword(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) return decodeURIComponent(new URL(databaseUrl).password);
  expect(process.env.TEST_USER_PASSWORD, 'DATABASE_URL o TEST_USER_PASSWORD requerido').toBeTruthy();
  return process.env.TEST_USER_PASSWORD!;
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

function uniqueRuc(): string {
  return `20${Math.floor(100000000 + Math.random() * 899999999)}`;
}

async function createTenant(context: APIRequestContext, label: string, password: string): Promise<CreatedTenant> {
  const slug = `${label.toLowerCase()}-${runId}`.replace(/[^a-z0-9-]/g, '');
  const adminEmail = `admin.${slug}@erp.local`;
  const response = await context.post(api('/tenants'), {
    data: {
      ruc: uniqueRuc(),
      razon_social: `QA Tenant ${label} ${runId} SAC`,
      nombre_comercial: `QA ${label} ${runId}`,
      direccion: `Av QA ${label} 123 Lima`,
      pais_id: 1,
      email: `tenant.${slug}@erp.local`,
      telefono: '999888777',
      tipo_empresa: 'MICRO',
      usar_flujo_logistica: true,
      gre_obligatorio: false,
      gre_automatico_habilitado: false,
      admin_email: adminEmail,
      admin_nombre: `Admin ${label}`,
      admin_apellido: 'Gate21',
      admin_password: password,
    },
  });
  const text = await response.text();
  expect(response.ok(), `crear tenant ${label}: ${text}`).toBe(true);
  const body = JSON.parse(text);
  expect(body?.data?.tenant?.tenant_id, `tenant ${label} debe devolver tenant_id`).toBeTruthy();
  expect(body?.data?.adminUser?.email).toBe(adminEmail);
  return { tenantId: body.data.tenant.tenant_id, adminEmail };
}

async function validateTenantRbac(supabase: SupabaseClient, tenantId: string) {
  const { data: roles, error: rolesError } = await supabase
    .from('roles')
    .select('id, nombre')
    .eq('tenant_id', tenantId)
    .order('nombre');
  expect(rolesError?.message || '', 'consultar roles tenant nuevo').toBe('');
  expect((roles || []).map((role) => role.nombre).sort()).toEqual([...expectedRolePermissions.keys()].sort());

  const { count: permissionCount, error: permError } = await supabase
    .from('permisos')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);
  expect(permError?.message || '', 'consultar permisos tenant nuevo').toBe('');
  expect(permissionCount).toBe(195);

  for (const [roleName, expectedCount] of expectedRolePermissions) {
    const roleId = roles?.find((role) => role.nombre === roleName)?.id;
    expect(roleId, `rol ${roleName} debe existir`).toBeTruthy();
    const { count, error } = await supabase
      .from('rol_permisos')
      .select('permiso_id', { count: 'exact', head: true })
      .eq('role_id', roleId);
    expect(error?.message || '', `consultar permisos de ${roleName}`).toBe('');
    expect(count, `permisos de ${roleName}`).toBe(expectedCount);
  }

  const rrhhRoleId = roles?.find((role) => role.nombre === 'RRHH')?.id;
  const { data: rrhhFinance, error: rrhhFinanceError } = await supabase
    .from('rol_permisos')
    .select('permiso_id, permisos!inner(codigo)')
    .eq('role_id', rrhhRoleId)
    .eq('permisos.codigo', 'finanzas.read');
  expect(rrhhFinanceError?.message || '', 'consultar finanzas.read en RRHH').toBe('');
  expect(rrhhFinance || [], 'RRHH no debe tener finanzas.read').toHaveLength(0);
}

async function createCliente(context: APIRequestContext, label: string): Promise<string> {
  const response = await context.post(api('/ventas/clientes'), {
    data: {
      tipo: 'EMPRESA',
      documento_tipo: 'RUC',
      documento_numero: uniqueRuc(),
      razon_social: `Cliente ${label} ${runId}`,
      direccion: `Dir ${label}`,
      email: `cliente.${label.toLowerCase()}.${runId}@erp.local`,
    },
  });
  const text = await response.text();
  expect(response.ok(), `crear cliente ${label}: ${text}`).toBe(true);
  const body = JSON.parse(text);
  expect(body?.id, `cliente ${label} debe devolver id`).toBeTruthy();
  return body.id;
}

async function createOperationalUser(
  context: APIRequestContext,
  supabase: SupabaseClient,
  tenantId: string,
  roleName: string,
  password: string,
): Promise<string> {
  const { data: role, error } = await supabase
    .from('roles')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('nombre', roleName)
    .single();
  expect(error?.message || '', `consultar rol ${roleName}`).toBe('');
  expect(role?.id, `rol ${roleName} debe existir`).toBeTruthy();
  const roleId = role!.id;

  const email = `${roleName.toLowerCase()}.${tenantId.slice(0, 8)}.${runId}@erp.local`;
  const response = await context.post(api('/usuarios-sistema/crear'), {
    data: {
      nombre: roleName,
      email,
      password,
      rol_id: roleId,
      estado: 'ACTIVO',
    },
  });
  const text = await response.text();
  expect(response.ok(), `crear usuario ${roleName}: ${text}`).toBe(true);
  return email;
}

async function status(responsePromise: Promise<APIResponse>): Promise<number> {
  const response = await responsePromise;
  await response.dispose();
  return response.status();
}

test.describe('Gate 21 superadmin tenant RBAC RLS', () => {
  test.setTimeout(420000);

  test('tenant nuevo nace operable, con RBAC limpio y aislamiento RLS por API', async () => {
    const password = getOperationalPassword();
    const supabase = getSupabase();

    const superadmin = await loginApi(process.env.TEST_USER_EMAIL || 'admin@erp.local', password);
    expect(superadmin.user.is_super_admin, 'superadmin debe autenticar con flag real').toBe(true);
    const superContext = await contextFor(superadmin.access_token);

    const tenantA = await createTenant(superContext, 'A', password);
    const tenantB = await createTenant(superContext, 'B', password);

    await validateTenantRbac(supabase, tenantA.tenantId);
    await validateTenantRbac(supabase, tenantB.tenantId);

    const adminA = await loginApi(tenantA.adminEmail, password);
    const adminB = await loginApi(tenantB.adminEmail, password);
    expect(adminA.user.is_super_admin).toBe(false);
    expect(adminB.user.is_super_admin).toBe(false);
    expect(adminA.user.tenant_id).toBe(tenantA.tenantId);
    expect(adminB.user.tenant_id).toBe(tenantB.tenantId);

    const contextA = await contextFor(adminA.access_token);
    const contextB = await contextFor(adminB.access_token);
    const vendedorEmail = await createOperationalUser(contextA, supabase, tenantA.tenantId, 'VENDEDOR', password);
    const vendedor = await loginApi(vendedorEmail, password);
    const vendedorRoles = (vendedor.user.roles || []).map((role) =>
      typeof role === 'string' ? role : role.nombre,
    );
    expect(vendedorRoles).toContain('VENDEDOR');
    const vendedorContext = await contextFor(vendedor.access_token);
    expect(await status(vendedorContext.get(api('/ventas/clientes'))), 'VENDEDOR tenant nuevo accede a ventas/clientes').toBe(200);
    expect(await status(vendedorContext.get(api('/compras/proveedores'))), 'VENDEDOR tenant nuevo no accede a compras/proveedores').toBe(403);

    const clienteA = await createCliente(contextA, 'A');
    const clienteB = await createCliente(contextB, 'B');

    expect(await status(contextA.get(api(`/ventas/clientes/${clienteA}`))), 'admin A lee cliente A').toBe(200);
    expect(await status(contextA.get(api(`/ventas/clientes/${clienteB}`))), 'admin A no lee cliente B por ID directo').toBe(404);
    expect(await status(contextB.get(api(`/ventas/clientes/${clienteB}`))), 'admin B lee cliente B').toBe(200);
    expect(await status(contextB.get(api(`/ventas/clientes/${clienteA}`))), 'admin B no lee cliente A por ID directo').toBe(404);
    expect(await status(contextA.get(api('/tenants'))), 'admin A no lista tenants globales').toBe(403);
    expect(await status(contextB.get(api('/tenants'))), 'admin B no lista tenants globales').toBe(403);
    expect(await status(superContext.get(api('/tenants'))), 'superadmin lista tenants globales').toBe(200);

    await vendedorContext.dispose();
    await contextA.dispose();
    await contextB.dispose();
    await superContext.dispose();
  });
});
