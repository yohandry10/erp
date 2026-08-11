import { APIResponse, Browser, Page, expect, request as playwrightRequest, test } from '@playwright/test';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { gotoAuthenticated, login } from './helpers/auth';

type ApiEnvelope<T> = { success?: boolean; data?: T; message?: string; error?: string };

const runId = `${Date.now().toString().slice(-8)}-${crypto.randomUUID().slice(0, 8)}`;
const apiBaseURL = process.env.E2E_API_ORIGIN || 'http://localhost:13002';
const api = (route: string) => `/api${route}`;

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

async function expectStatus(response: APIResponse, expected: number, label: string): Promise<void> {
  const text = await response.text();
  expect(response.status(), `${label}: ${text}`).toBe(expected);
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

function getSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  expect(url, 'SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL requerido para E2E usuarios').toBeTruthy();
  expect(key, 'SUPABASE_SERVICE_ROLE_KEY requerido para E2E usuarios').toBeTruthy();
  return createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });
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

async function insertRow(supabase: SupabaseClient, table: string, row: Record<string, any>) {
  const { data, error } = await supabase.from(table).insert(row).select('*').single();
  expect(error?.message || '', `insertar ${table}`).toBe('');
  return data;
}

test.describe('T17 Usuarios, permisos, auditoria y configuracion', () => {
  test.setTimeout(300000);

  test('admin crea/edita/inactiva usuario; usuario restringido no accede; auditoria y configuracion quedan trazables', async ({ page, browser }) => {
    const browserFailures = await collectBrowserFailures(page);
    await login(page);
    const { headers, tenantId } = await authContext(page);
    const supabase = getSupabase();
    const apiContext = await playwrightRequest.newContext({
      baseURL: apiBaseURL,
      extraHTTPHeaders: headers,
      storageState: { cookies: [], origins: [] },
    });

    const restrictedRole = await insertRow(supabase, 'roles', {
      tenant_id: tenantId,
      nombre: `T17_RESTRINGIDO_${runId}`,
      descripcion: 'Rol E2E sin permisos funcionales',
      is_system_role: false,
      activo: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const email = `t17.${runId}@erp.local`;
    const password = `T17Pwd${runId.replace(/[^a-zA-Z0-9]/g, '')}Aa1!`;
    const createdUser = await parseOk<any>(
      await apiContext.post(api('/usuarios-sistema/crear'), {
        data: {
          nombre: `Usuario T17 ${runId}`,
          email,
          telefono: '900000017',
          password,
          rol_id: restrictedRole.id,
          estado: 'ACTIVO',
        },
      }),
      'crear usuario restringido',
    );
    expect(createdUser.id, 'usuario creado debe devolver id real').toBeTruthy();

    const { data: persistedCreated, error: createdError } = await supabase
      .from('usuarios_sistema')
      .select('id, email, password_hash, estado, activo')
      .eq('id', createdUser.id)
      .single();
    expect(createdError?.message || '', 'usuario debe persistir en usuarios_sistema').toBe('');
    expect(persistedCreated, 'usuario creado debe existir en BD').toBeTruthy();
    expect(persistedCreated!.password_hash, 'usuario creado desde UI/API debe poder autenticarse con password_hash').toBeTruthy();
    expect(String(persistedCreated!.estado).toUpperCase()).toBe('ACTIVO');
    expect(persistedCreated!.activo).toBe(true);

    const updatedUser = await parseOk<any>(
      await apiContext.put(api(`/usuarios-sistema/${createdUser.id}`), {
        data: {
          nombre: `Usuario T17 Editado ${runId}`,
          telefono: '900000018',
          rol_id: restrictedRole.id,
          estado: 'ACTIVO',
        },
      }),
      'editar usuario restringido',
    );
    expect(updatedUser.nombre).toContain('Editado');

    const restrictedPage = await browser.newPage();
    await login(restrictedPage, email, password, true);
    const restrictedFailures = await collectBrowserFailures(restrictedPage);
    const restrictedAuth = await authContext(restrictedPage);
    const restrictedApi = await playwrightRequest.newContext({
      baseURL: apiBaseURL,
      extraHTTPHeaders: restrictedAuth.headers,
      storageState: { cookies: [], origins: [] },
    });

    await expectStatus(
      await restrictedApi.get(api('/usuarios-sistema/')),
      403,
      'usuario sin permiso no lista usuarios',
    );
    await expectStatus(
      await restrictedApi.post(api('/usuarios-sistema/crear'), {
        data: {
          nombre: 'Escalada',
          email: `escala.${runId}@erp.local`,
          password: 'Escala12345!',
          rol_id: restrictedRole.id,
        },
      }),
      403,
      'usuario sin permiso no crea usuarios',
    );
    await expectStatus(
      await restrictedApi.put(api('/configuration/empresa'), { data: { pais_id: 'no-valido' } }),
      403,
      'usuario sin permiso no cambia configuracion',
    );
    await expectStatus(
      await restrictedApi.get(api('/audit-logs')),
      403,
      'usuario normal no lee auditoria',
    );

    await gotoAuthenticated(restrictedPage, '/dashboard/usuarios/');
    await expect(restrictedPage.getByRole('heading', { name: /Acceso denegado/i })).toBeVisible({ timeout: 30000 });
    await expect(restrictedPage.getByRole('button', { name: /Nuevo Usuario/i })).toHaveCount(0);

    await parseOk<any>(
      await apiContext.put(api(`/usuarios-sistema/${createdUser.id}/estado`), {
        data: { estado: 'INACTIVO' },
      }),
      'inactivar usuario restringido',
    );
    const { data: persistedInactive, error: inactiveError } = await supabase
      .from('usuarios_sistema')
      .select('estado, activo')
      .eq('id', createdUser.id)
      .single();
    expect(inactiveError?.message || '', 'usuario inactivo debe persistir').toBe('');
    expect(persistedInactive, 'usuario inactivado debe existir en BD').toBeTruthy();
    expect(String(persistedInactive!.estado).toUpperCase()).toBe('INACTIVO');
    expect(persistedInactive!.activo).toBe(false);

    const currentEmpresa = await parseOk<any>(await apiContext.get(api('/configuration/empresa')), 'leer configuracion empresa');
    await expectStatus(
      await apiContext.put(api('/configuration/empresa'), { data: { pais_id: 'no-valido' } }),
      400,
      'configuracion invalida responde 400',
    );
    if (currentEmpresa?.pais_id) {
      await parseOk<any>(
        await apiContext.put(api('/configuration/empresa'), {
          headers: { 'Idempotency-Key': `configuration-empresa-${runId}` },
          data: {
            pais_id: currentEmpresa.pais_id,
            telefono: `T17-${runId.slice(0, 8)}`,
          },
        }),
        'actualizar configuracion empresa valida',
      );
    }

    await expect
      .poll(async () => {
        const { count } = await supabase
          .from('audit_log')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('table_name', 'usuarios_sistema')
          .eq('record_id', createdUser.id);
        return count || 0;
      }, { timeout: 30000, intervals: [1000, 2000, 5000] })
      .toBeGreaterThanOrEqual(3);

    await expect
      .poll(async () => {
        const { count } = await supabase
          .from('audit_log')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('table_name', 'empresa_config');
        return count || 0;
      }, { timeout: 30000, intervals: [1000, 2000, 5000] })
      .toBeGreaterThanOrEqual(currentEmpresa?.pais_id ? 1 : 0);

    await gotoAuthenticated(page, '/dashboard/usuarios/');
    await expect(page.getByRole('heading', { name: /Gestión de Usuarios/i })).toBeVisible({ timeout: 30000 });
    // La lista de usuarios carga async desde el backend; el spinner "Cargando
    // usuarios..." puede aparecer 3-5s. Esperamos primero a que termine y
    // luego asertamos el nombre editado. Default timeout (5s) no alcanza.
    await expect(page.locator('body')).not.toContainText('Cargando usuarios...', { timeout: 30000 });
    await expect(page.locator('body')).toContainText(`Usuario T17 Editado ${runId}`, { timeout: 15000 });
    await gotoAuthenticated(page, '/dashboard/audit-logs/');
    // La página /audit-logs solo expone contenido a super_admin. Un admin de
    // tenant (incluido el del demo) ve "Acceso denegado" — comportamiento
    // correcto. El test valida ambas variantes: o se carga el viewer o se
    // muestra el aviso de permisos. Ninguno debe lanzar error de runtime.
    await expect(
      page.getByRole('heading', { name: /Logs de Auditoría|Acceso denegado/i }),
    ).toBeVisible({ timeout: 30000 });
    await expect(page.locator('body')).not.toContainText(/Application error|Unhandled Runtime Error|Failed to compile/i);

    expect(browserFailures, `admin sin errores fatales consola/red: ${browserFailures.join('\n')}`).toEqual([]);
    // El usuario restringido visita /dashboard/usuarios y la UI dispara
    // múltiples fetches que el backend responde con 403 correctamente
    // (usuarios-sistema, configuration, audit-logs, permisos del menú, etc.).
    // El browser loggea cada una como `console: Failed to load resource: the
    // server responded with a status of 403 (Forbidden)` — sin URL en el texto.
    // Esos 403 son la SEÑAL CORRECTA de RBAC funcionando, no un bug.
    // Solo deben fallar 500s, errores de compilación, o pageerrors reales.
    const restrictedRealFailures = restrictedFailures.filter((failure) => {
      // 403s genéricos del browser ("Failed to load resource ... 403") son OK.
      if (/Failed to load resource.*403/i.test(failure)) return false;
      // Errores de red 403 explícitos contra endpoints conocidos también OK.
      if (/403 .*\/api\/(usuarios-sistema|configuration|audit-logs|permisos)/i.test(failure)) return false;
      return true;
    });
    expect(restrictedRealFailures, `usuario restringido sin errores fatales inesperados: ${restrictedFailures.join('\n')}`).toEqual([]);
    await restrictedApi.dispose();
    await restrictedPage.close();
    await apiContext.dispose();

    // Cleanup honesto: hard-delete del usuario y rol creados para que el demo
    // no acumule usuarios entre runs y bloquee el límite DEMO_MAX_USERS.
    // El demo se reusa entre suites; sin cleanup hit-eamos el cap rápido.
    try {
      await supabase.from('user_roles').delete().eq('usuario_sistema_id', createdUser.id);
      await supabase.from('usuarios_sistema').delete().eq('id', createdUser.id);
      await supabase.from('users').delete().eq('id', createdUser.id);
      await supabase.from('roles').delete().eq('id', restrictedRole.id);
    } catch (cleanupError) {
      // No fallar el test por errores de cleanup; loguear y seguir.
      console.warn('T17 cleanup warning:', cleanupError);
    }
  });
});
