import { APIResponse, Browser, Page, expect, request as playwrightRequest, test } from '@playwright/test';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { gotoAuthenticated, login } from './helpers/auth';
import { generateValidRucFromRunId } from './helpers/test-data';

type ApiEnvelope<T> = { success?: boolean; data?: T; message?: string; error?: string };
type AuditLog = {
  table_name: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  record_id?: string;
  user_id?: string;
  timestamp?: string;
  metadata?: Record<string, any>;
  new_values?: Record<string, any>;
};

const now = new Date();
const stamp = now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const runId = `${stamp}-${crypto.randomUUID().slice(0, 8)}`;
const prefix = `QA-PROD-READY-${runId}-CASE19`;
const apiBaseURL = process.env.E2E_API_ORIGIN || 'http://localhost:13012';
const api = (route: string) => `/api${route}`;

for (const envPath of [
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

function unwrap<T>(payload: ApiEnvelope<T> | T): T {
  if (payload && typeof payload === 'object' && 'data' in payload) return (payload as ApiEnvelope<T>).data as T;
  return payload as T;
}

async function parseOk<T>(response: APIResponse, label: string): Promise<T> {
  const text = await response.text();
  expect(response.ok(), `${label} debe responder 2xx, status=${response.status()}: ${text}`).toBeTruthy();
  const body = text ? (JSON.parse(text) as ApiEnvelope<T> | T) : ({} as T);
  if (body && typeof body === 'object' && 'success' in body) {
    expect((body as ApiEnvelope<T>).success, `${label} debe devolver success=true: ${text}`).not.toBe(false);
  }
  return unwrap<T>(body);
}

async function parseAudit(response: APIResponse, label: string): Promise<{ data: AuditLog[]; pagination?: any }> {
  const text = await response.text();
  expect(response.ok(), `${label} debe responder 2xx, status=${response.status()}: ${text}`).toBeTruthy();
  const body = text ? JSON.parse(text) : {};
  const payload = body?.data && body?.pagination ? body : body?.data;
  expect(Array.isArray(payload?.data), `${label} debe devolver data[]`).toBeTruthy();
  return payload;
}

async function expectNot2xx(response: APIResponse, label: string): Promise<void> {
  const text = await response.text();
  expect(response.status(), `${label} no debe ser 2xx: ${text}`).toBeGreaterThanOrEqual(400);
}

async function authContext(page: Page): Promise<{ headers: Record<string, string>; tenantId: string; userId: string }> {
  const accessToken = (await page.context().cookies()).find((cookie) => cookie.name === 'access_token')?.value;
  expect(accessToken, 'la sesion E2E debe tener access_token').toBeTruthy();
  const payload = JSON.parse(Buffer.from(accessToken!.split('.')[1], 'base64url').toString('utf8'));
  return {
    headers: { Authorization: `Bearer ${accessToken}` },
    tenantId: payload.tenant_id,
    userId: payload.sub,
  };
}

async function apiContextAsDemoAdmin() {
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;
  expect(email, 'TEST_USER_EMAIL requerido para aprobador alterno CASE19').toBeTruthy();
  expect(password, 'TEST_USER_PASSWORD requerido para aprobador alterno CASE19').toBeTruthy();
  const loginContext = await playwrightRequest.newContext({ baseURL: apiBaseURL });
  let response = await loginContext.post(api('/auth/login'), { data: { email, password } });
  if (response.status() === 429) {
    await new Promise((resolve) => setTimeout(resolve, 61000));
    response = await loginContext.post(api('/auth/login'), { data: { email, password } });
  }
  const text = await response.text();
  expect(response.ok(), `login aprobador alterno CASE19 HTTP ${response.status()}: ${text}`).toBe(true);
  const body = JSON.parse(text);
  const token = body.access_token || body.token || body.data?.access_token || body.data?.token;
  expect(token, 'login aprobador alterno CASE19 debe devolver token').toBeTruthy();
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  expect(payload.sub, 'JWT del aprobador alterno CASE19 debe contener sub').toBeTruthy();
  await loginContext.dispose();
  return {
    context: await playwrightRequest.newContext({
      baseURL: apiBaseURL,
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    }),
    userId: payload.sub as string,
  };
}

function getSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  expect(url, 'SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL requerido para E2E auditoria').toBeTruthy();
  expect(key, 'SUPABASE_SERVICE_ROLE_KEY requerido para E2E auditoria').toBeTruthy();
  return createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });
}

let ephemeralAuditRoleAssignment: { userId: string; roleId: string } | null = null;

async function ensurePrimaryAuditPermission(): Promise<void> {
  const email = process.env.TEST_APROBADOR_EMAIL;
  expect(email, 'TEST_APROBADOR_EMAIL requerido para principal de auditoría').toBeTruthy();
  const supabase = getSupabase();
  const { data: user, error: userError } = await supabase
    .from('usuarios_sistema')
    .select('id, tenant_id')
    .eq('email', email!)
    .single();
  expect(userError?.message || '', 'resolver principal de auditoría').toBe('');

  const { data: role, error: roleError } = await supabase
    .from('roles')
    .select('id')
    .eq('tenant_id', user!.tenant_id)
    .eq('nombre', 'AUDITOR')
    .single();
  expect(roleError?.message || '', 'resolver rol AUDITOR para CASE19').toBe('');

  const { data: existing, error: existingError } = await supabase
    .from('user_roles')
    .select('id')
    .eq('tenant_id', user!.tenant_id)
    .eq('usuario_sistema_id', user!.id)
    .eq('role_id', role!.id)
    .maybeSingle();
  expect(existingError?.message || '', 'consultar rol AUDITOR del principal CASE19').toBe('');
  if (existing) return;

  const { error: insertError } = await supabase.from('user_roles').insert({
    id: crypto.randomUUID(),
    tenant_id: user!.tenant_id,
    usuario_sistema_id: user!.id,
    role_id: role!.id,
  });
  expect(insertError?.message || '', 'asignar AUDITOR efímero al principal CASE19').toBe('');
  ephemeralAuditRoleAssignment = { userId: user!.id, roleId: role!.id };
}

async function restorePrimaryAuditPermission(): Promise<void> {
  if (!ephemeralAuditRoleAssignment) return;
  const supabase = getSupabase();
  const { error } = await supabase
    .from('user_roles')
    .delete()
    .eq('usuario_sistema_id', ephemeralAuditRoleAssignment.userId)
    .eq('role_id', ephemeralAuditRoleAssignment.roleId);
  expect(error?.message || '', 'retirar AUDITOR efímero del principal CASE19').toBe('');
  ephemeralAuditRoleAssignment = null;
}

async function insertRole(supabase: SupabaseClient, tenantId: string) {
  const { data, error } = await supabase
    .from('roles')
    .insert({
      tenant_id: tenantId,
      nombre: `CASE19_RESTRINGIDO_${runId}`,
      descripcion: 'Rol E2E CASE19 sin permisos de auditoria',
      is_system_role: false,
      activo: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single();
  expect(error?.message || '', 'crear rol restringido CASE19').toBe('');
  return data;
}

async function collectBrowserFailures(page: Page) {
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(`console: ${message.text()}`);
  });
  page.on('response', (response) => {
    const status = response.status();
    const url = response.url();
    if (status >= 500 || (status === 404 && /\/(_next|dashboard|api|backend\/api)\//.test(url))) {
      failures.push(`network: ${status} ${url}`);
    }
  });
  return failures;
}

async function expectAudit(
  apiContext: any,
  query: string,
  predicate: (log: AuditLog) => boolean,
  label: string,
): Promise<void> {
  await expect
    .poll(async () => {
      const audit = await parseAudit(await apiContext.get(api(`/audit-logs?${query}`)), label);
      return audit.data.find(predicate) ?? null;
    }, { timeout: 30000, intervals: [1000, 2000, 5000] })
    .not.toBeNull();
}

test.describe('CASE-19 Auditoria real', () => {
  test.setTimeout(600000);
  test.beforeAll(ensurePrimaryAuditPermission);
  test.afterAll(restorePrimaryAuditPermission);

  test('acciones criticas quedan trazadas y usuario limitado no puede leer ni mutar auditoria', async ({ page, browser }: { page: Page; browser: Browser }) => {
    const startDate = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await login(
      page,
      process.env.TEST_APROBADOR_EMAIL || 'admin@erp.local',
      process.env.TEST_APROBADOR_PASSWORD || 'AdminProd2026!',
      true,
    );
    const browserFailures = await collectBrowserFailures(page);
    const { headers, tenantId, userId } = await authContext(page);
    const supabase = getSupabase();
    const apiContext = await playwrightRequest.newContext({
      baseURL: apiBaseURL,
      extraHTTPHeaders: headers,
      storageState: { cookies: [], origins: [] },
    });

    const almacenes = await parseOk<any[]>(await apiContext.get(api('/inventario/almacenes')), 'listar almacenes');
    expect(almacenes.length, 'debe existir almacen operativo').toBeGreaterThan(0);
    const almacenId = almacenes[0].id;

    const role = await insertRole(supabase, tenantId);
    const restrictedEmail = `case19.${runId}@erp.local`;
    const restrictedPassword = `Case19${runId.replace(/[^a-zA-Z0-9]/g, '')}Aa1!`;
    const restrictedUser = await parseOk<any>(
      await apiContext.post(api('/usuarios-sistema/crear'), {
        data: {
          nombre: `${prefix} Usuario limitado`,
          email: restrictedEmail,
          telefono: '900019019',
          password: restrictedPassword,
          rol_id: role.id,
          estado: 'ACTIVO',
        },
      }),
      'crear usuario limitado CASE19',
    );

    const cliente = await parseOk<any>(
      await apiContext.post(api('/ventas/clientes'), {
        data: {
          tipo: 'PERSONA',
          documento_tipo: 'DNI',
          documento_numero: runId.replace(/\D/g, '').slice(-8).padStart(8, '1'),
          razon_social: `${prefix} Cliente`,
          direccion: 'Av. Auditoria 190',
          email: `cliente-case19-${runId}@example.com`,
          telefono: '999190190',
        },
      }),
      'crear cliente auditado',
    );
    await parseOk<any>(
      await apiContext.put(api(`/ventas/clientes/${cliente.id}`), {
        data: { telefono: '999190191', direccion: 'Av. Auditoria 191' },
      }),
      'editar cliente auditado',
    );

    const proveedor = await parseOk<any>(
      await apiContext.post(api('/compras/proveedores'), {
        data: {
          ruc: generateValidRucFromRunId(`auditoria-${runId}`),
          razon_social: `${prefix} Proveedor S.A.C.`,
          nombre_comercial: `${prefix} Proveedor`,
          email: `proveedor-case19-${runId}@example.com`,
          telefono: '988190190',
          direccion: 'Av. Auditoria Proveedor 190',
          contacto: 'Auditor CASE19',
          condiciones_pago: 'CREDITO_30',
          dias_credito: 30,
          limite_credito: 10000,
        },
      }),
      'crear proveedor auditado',
    );
    await parseOk<any>(
      await apiContext.put(api(`/compras/proveedores/${proveedor.id}`), {
        data: { telefono: '988190191', direccion: 'Av. Auditoria Proveedor 191' },
      }),
      'editar proveedor auditado',
    );

    const producto = await parseOk<any>(
      await apiContext.post(api('/inventario/productos'), {
        data: {
          codigo: `CASE19-${runId}`,
          nombre: `${prefix} Producto`,
          categoria: 'AUDITORIA',
          precio_compra: 31,
          precio_venta: 64,
          stock: 0,
          stock_minimo: 0,
          controla_stock: true,
          almacen_id: almacenId,
        },
      }),
      'crear producto CASE19',
    );

    const orden = await parseOk<any>(
      await apiContext.post(api('/compras/ordenes'), {
        data: {
          numero: `OC-CASE19-${runId}`,
          proveedor_id: proveedor.id,
          fecha_orden: new Date().toISOString(),
          fecha_entrega_esperada: new Date(Date.now() + 86400000).toISOString(),
          condiciones_pago: 'CREDITO_30',
          dias_credito: 30,
          almacen_destino_id: almacenId,
          estado: 'BORRADOR',
          observaciones: `${prefix} orden`,
          detalles: [{ producto_id: producto.id, descripcion: producto.nombre, cantidad: 3, precio_unitario: 31 }],
        },
      }),
      'crear orden auditada',
    );
    const detalleId = orden.detalles?.[0]?.id ?? orden.detalle?.[0]?.id;
    expect(detalleId, 'orden debe devolver detalle').toBeTruthy();

    // Segregación real: el demo admin aprueba la OC creada por el ADMIN usado
    // para auditar. Son dos identidades distintas del mismo tenant.
    const aprobador = await apiContextAsDemoAdmin();
    try {
      await parseOk<any>(
        await aprobador.context.post(api(`/compras/ordenes/${orden.id}/aprobar`), {
          data: { aprobador_nombre: 'Admin CASE19', comentarios: `${prefix} aprobacion` },
        }),
        'aprobar orden auditada',
      );
    } finally {
      await aprobador.context.dispose();
    }

    const recepcion = await parseOk<any>(
      await apiContext.post(api(`/compras/recepciones/ordenes/${orden.id}`), {
        data: {
          orden_id: orden.id,
          almacen_id: almacenId,
          observaciones: `${prefix} recepcion`,
          items: [{ detalle_id: detalleId, cantidad_recibida: 3, calidad: 'OK', almacen_id: almacenId }],
        },
      }),
      'crear recepcion auditada',
    );
    const recepcionItem = recepcion.items?.[0];
    expect(recepcionItem?.id, 'recepcion debe devolver item').toBeTruthy();
    await parseOk<any>(
      await apiContext.post(api(`/compras/recepciones/${recepcion.id}/cerrar`), {
        data: { observaciones: `${prefix} cierre recepcion` },
      }),
      'cerrar recepcion auditada',
    );

    const devolucion = await parseOk<any>(
      await apiContext.post(api('/compras/devoluciones'), {
        data: {
          recepcion_id: recepcion.id,
          orden_id: orden.id,
          proveedor_id: proveedor.id,
          motivo: 'DEFECTUOSO',
          observaciones: `${prefix} devolucion`,
          items: [{
            recepcion_item_id: recepcionItem.id,
            producto_id: producto.id,
            descripcion: producto.nombre,
            cantidad: 1,
            precio_unitario: 31,
            almacen_id: almacenId,
            motivo_detalle: 'Auditoria CASE19',
          }],
        },
      }),
      'crear devolucion auditada',
    );
    await parseOk<any>(await apiContext.post(api(`/compras/devoluciones/${devolucion.id}/emitir`)), 'emitir devolucion auditada');

    await expectAudit(apiContext, `table_name=auth_login_attempts&user_id=${userId}&start_date=${encodeURIComponent(startDate)}`, (log) => log.user_id === userId, 'auditoria login admin');
    await expectAudit(apiContext, `table_name=usuarios_sistema&user_id=${userId}&start_date=${encodeURIComponent(startDate)}`, (log) => log.record_id === restrictedUser.id, 'auditoria creacion usuario');
    await expectAudit(apiContext, `table_name=clientes&user_id=${userId}&start_date=${encodeURIComponent(startDate)}`, (log) => log.record_id === cliente.id && log.operation === 'INSERT', 'auditoria creacion cliente');
    await expectAudit(apiContext, `table_name=clientes&user_id=${userId}&start_date=${encodeURIComponent(startDate)}`, (log) => log.record_id === cliente.id && log.operation === 'UPDATE', 'auditoria edicion cliente');
    await expectAudit(apiContext, `table_name=proveedores&user_id=${userId}&start_date=${encodeURIComponent(startDate)}`, (log) => log.record_id === proveedor.id && log.operation === 'INSERT', 'auditoria creacion proveedor');
    await expectAudit(apiContext, `table_name=proveedores&user_id=${userId}&start_date=${encodeURIComponent(startDate)}`, (log) => log.record_id === proveedor.id && log.operation === 'UPDATE', 'auditoria edicion proveedor');
    await expectAudit(apiContext, `table_name=ordenes_compra&user_id=${aprobador.userId}&start_date=${encodeURIComponent(startDate)}`, (log) => log.record_id === orden.id && log.user_id === aprobador.userId && log.metadata?.accion === 'APROBAR', 'auditoria aprobacion compra');
    await expectAudit(apiContext, `table_name=recepciones&user_id=${userId}&start_date=${encodeURIComponent(startDate)}`, (log) => log.record_id === recepcion.id && log.metadata?.accion === 'CERRAR_RECEPCION', 'auditoria cierre recepcion');
    await expectAudit(apiContext, `table_name=devoluciones_proveedor&user_id=${userId}&start_date=${encodeURIComponent(startDate)}`, (log) => log.record_id === devolucion.id && log.metadata?.accion === 'CREAR_DEVOLUCION_PROVEEDOR', 'auditoria creacion devolucion');
    await expectAudit(apiContext, `table_name=devoluciones_proveedor&user_id=${userId}&start_date=${encodeURIComponent(startDate)}`, (log) => log.record_id === devolucion.id && log.metadata?.accion === 'EMITIR_DEVOLUCION_PROVEEDOR', 'auditoria emision devolucion');
    await expectAudit(apiContext, `table_name=eventos_pos&limit=20`, (log) => log.table_name === 'eventos_pos' && Boolean(log.record_id), 'auditoria POS unificada');
    await expectAudit(apiContext, `table_name=integration_logs&limit=50`, (log) => /CPE|GRE|SIRE|RECEPCION/i.test(JSON.stringify(log)), 'auditoria integraciones CPE/GRE/SIRE');

    const userFiltered = await parseAudit(
      await apiContext.get(api(`/audit-logs?user_id=${userId}&start_date=${encodeURIComponent(startDate)}&limit=100`)),
      'filtro global por usuario',
    );
    expect(userFiltered.data.length, 'filtro por usuario debe devolver eventos CASE19').toBeGreaterThan(0);
    expect(userFiltered.data.every((log) => !log.user_id || log.user_id === userId), 'filtro por usuario no debe mezclar otros usuarios').toBeTruthy();

    await gotoAuthenticated(page, '/dashboard/audit-logs/');
    await expect(page.getByRole('heading', { name: /Logs de Auditoría/i })).toBeVisible({ timeout: 30000 });
    await page.locator('select').filter({ has: page.locator('option[value="clientes"]') }).first().selectOption('clientes');
    await page.getByPlaceholder(/Buscar en logs/i).fill(cliente.id);
    await expect(page.locator('body')).toContainText('clientes', { timeout: 30000 });
    await expect(page.locator('body')).not.toContainText(/Application error|Unhandled Runtime Error|Failed to compile|Cargando logs de auditoría/i);

    const restrictedPage = await browser.newPage();
    await login(restrictedPage, restrictedEmail, restrictedPassword, true);
    const restrictedFailures = await collectBrowserFailures(restrictedPage);
    const restrictedAuth = await authContext(restrictedPage);
    const restrictedApi = await playwrightRequest.newContext({
      baseURL: apiBaseURL,
      extraHTTPHeaders: restrictedAuth.headers,
      storageState: { cookies: [], origins: [] },
    });
    await expectNot2xx(await restrictedApi.get(api('/audit-logs')), 'usuario limitado no lee auditoria');
    await expectNot2xx(await restrictedApi.put(api('/audit-logs')), 'usuario limitado no edita auditoria');
    await expectNot2xx(await restrictedApi.delete(api('/audit-logs/fake-id')), 'usuario limitado no borra auditoria');
    await gotoAuthenticated(restrictedPage, '/dashboard/audit-logs/');
    await expect(restrictedPage.getByRole('heading', { name: /Acceso denegado/i })).toBeVisible({ timeout: 30000 });

    expect(browserFailures, `admin sin errores fatales consola/red: ${browserFailures.join('\n')}`).toEqual([]);
    expect(restrictedFailures.filter((failure) => !/403 .*\/api\/audit-logs/.test(failure)), `usuario limitado sin errores fatales inesperados: ${restrictedFailures.join('\n')}`).toEqual([]);
    await restrictedApi.dispose();
    await restrictedPage.close();
    await apiContext.dispose();
  });
});
