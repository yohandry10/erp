import { expect, request, test, type APIRequestContext, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

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

function getOperationalPassword(): string {
  // Prioridad: TEST_USER_PASSWORD explícito > DATABASE_URL > default seed.
  // El priorizar DATABASE_URL primero rompía cuando el e2e corre con un demo
  // tenant (TEST_USER_EMAIL=demo-XXX@temp.local) pero DATABASE_URL apunta a
  // Supabase con otro password → el login fallaba 401 + rate-limit en cascada.
  if (process.env.TEST_USER_PASSWORD) return process.env.TEST_USER_PASSWORD;
  if (process.env.DATABASE_URL) return decodeURIComponent(new URL(process.env.DATABASE_URL).password);
  return 'AdminProd2026!';
}

const adminAuthFile = path.join(__dirname, '.auth', 'admin.json');
const adminEmail = process.env.TEST_USER_EMAIL || 'admin@erp.local';
const adminPassword = getOperationalPassword();

type BrowserEvidence = {
  consoleErrors: string[];
  failedResponses: string[];
  chunkFailures: string[];
};

function getBaseURL(testInfo: { project: { use: Record<string, unknown> } }) {
  return String(testInfo.project.use.baseURL || process.env.BASE_URL || 'http://localhost:3001');
}

function getApiOrigin() {
  return process.env.E2E_API_ORIGIN || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';
}

function attachBrowserEvidence(page: Page): BrowserEvidence {
  const evidence: BrowserEvidence = {
    consoleErrors: [],
    failedResponses: [],
    chunkFailures: [],
  };

  page.on('console', (message) => {
    if (message.type() === 'error') {
      evidence.consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    evidence.consoleErrors.push(error.message);
  });
  page.on('response', (response) => {
    const url = response.url();
    if (response.status() >= 500) {
      evidence.failedResponses.push(`${response.status()} ${url}`);
    }
    if (url.includes('/_next/static/') && response.status() >= 400) {
      evidence.chunkFailures.push(`${response.status()} ${url}`);
    }
  });

  return evidence;
}

async function expectCleanBrowserEvidence(
  evidence: BrowserEvidence,
  options: { allowUnauthorizedResourceErrors?: boolean } = {},
) {
  expect(evidence.failedResponses, 'No debe haber 500 inesperados en la navegación').toEqual([]);
  expect(evidence.chunkFailures, 'No debe haber 404/errores de chunks de Next').toEqual([]);
  expect(
    evidence.consoleErrors.filter((message) => {
      if (message.includes('Download the React DevTools')) return false;
      if (
        options.allowUnauthorizedResourceErrors &&
        /Failed to load resource: the server responded with a status of 401/i.test(message)
      ) {
        return false;
      }
      return true;
    }),
    'No debe haber errores fatales en consola',
  ).toEqual([]);
}

async function expectDashboardReady(page: Page) {
  await expect(page).toHaveURL(/\/dashboard\/?(?:$|\?)/, { timeout: 30000 });
  await expect(page.locator('html[data-erp-hydrated="true"]')).toHaveCount(1, { timeout: 60000 });
  await expect(page.getByRole('button', { name: /^Iniciar Sesión$/i })).toBeHidden({ timeout: 60000 });
  await expect(page.locator('body')).toContainText(/Dashboard ejecutivo/i, { timeout: 60000 });

  const bodyText = await page.locator('body').innerText({ timeout: 15000 });
  expect(bodyText).not.toMatch(/Cargando país configurado/i);
  expect(bodyText).not.toMatch(/Redirigiendo al asistente de configuración/i);
  expect(bodyText).not.toMatch(/Cargando datos del dashboard/i);
  expect(bodyText).not.toMatch(/Application error|Internal Server Error|ChunkLoadError|Cannot find module/i);
}

async function closeTourIfVisible(page: Page) {
  const closeTour = page.getByRole('button', { name: /Cerrar tour/i });
  if (await closeTour.isVisible().catch(() => false)) {
    await closeTour.click();
    await expect(closeTour).toBeHidden({ timeout: 10000 });
  }
}

async function loginThroughUi(page: Page, email: string, password: string) {
  await page.goto('/login/', { waitUntil: 'networkidle' });
  await expect(page.getByText('Cargando países...')).toBeHidden({ timeout: 60000 });
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  const submitButton = page.getByRole('button', { name: /^Iniciar Sesión$/i });
  await expect(submitButton).toBeEnabled({ timeout: 30000 });
  await submitButton.click();
  await expectDashboardReady(page);
  await closeTourIfVisible(page);
}

async function adminContext(baseURL: string): Promise<APIRequestContext> {
  void baseURL;
  return request.newContext({
    baseURL: getApiOrigin(),
    storageState: adminAuthFile,
  });
}

async function createStandardUser(baseURL: string) {
  void baseURL;
  const aprobadorEmail = process.env.TEST_APROBADOR_EMAIL;
  const password = process.env.TEST_APROBADOR_PASSWORD;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  expect(aprobadorEmail, 'TEST_APROBADOR_EMAIL requerido para usuario estándar E2E').toBeTruthy();
  expect(password, 'TEST_APROBADOR_PASSWORD requerido para usuario estándar E2E').toBeTruthy();
  expect(supabaseUrl, 'SUPABASE_URL requerido para usuario estándar E2E').toBeTruthy();
  expect(serviceRoleKey, 'SUPABASE_SERVICE_ROLE_KEY requerido para usuario estándar E2E').toBeTruthy();

  const supabase = createClient(supabaseUrl!, serviceRoleKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: aprobador, error: userError } = await supabase
    .from('usuarios_sistema')
    .select('id, tenant_id, password_hash')
    .eq('email', aprobadorEmail!)
    .single();
  expect(userError?.message || '', 'resolver usuario aprobador E2E').toBe('');
  const email = `standard-auth-${aprobador!.tenant_id.slice(0, 8)}@temp.local`;

  let { data: user, error: standardUserError } = await supabase
    .from('usuarios_sistema')
    .select('id, tenant_id')
    .eq('email', email)
    .maybeSingle();
  expect(standardUserError?.message || '', 'consultar usuario estándar E2E').toBe('');

  if (!user) {
    const userId = crypto.randomUUID();
    const insertedUser = await supabase.from('usuarios_sistema').insert({
      id: userId,
      tenant_id: aprobador!.tenant_id,
      nombre: 'Usuario',
      apellido: 'Estándar E2E',
      email,
      nombre_usuario: `standard-${aprobador!.tenant_id.slice(0, 8)}`,
      password_hash: aprobador!.password_hash,
      activo: true,
      estado: 'ACTIVO',
      is_super_admin: false,
      is_demo_user: true,
      demo_email_temp: email,
    }).select('id, tenant_id').single();
    expect(insertedUser.error?.message || '', 'crear usuario estándar E2E').toBe('');
    user = insertedUser.data;

    const insertedDomainUser = await supabase.from('users').insert({
      id: userId,
      tenant_id: aprobador!.tenant_id,
      email,
      nombre: 'Usuario',
      apellido: 'Estándar E2E',
      activo: true,
      estado: 'ACTIVO',
    });
    expect(insertedDomainUser.error?.message || '', 'crear espejo de usuario estándar E2E').toBe('');
  }

  let { data: role, error: roleError } = await supabase
    .from('roles')
    .select('id')
    .eq('tenant_id', aprobador!.tenant_id)
    .eq('nombre', 'E2E_STANDARD_AUTH')
    .maybeSingle();
  expect(roleError?.message || '', 'consultar rol estándar E2E').toBe('');
  if (!role) {
    const inserted = await supabase.from('roles').insert({
      id: crypto.randomUUID(),
      tenant_id: aprobador!.tenant_id,
      nombre: 'E2E_STANDARD_AUTH',
      descripcion: 'Rol efímero sin permisos para QA de autenticación',
      is_system_role: false,
      activo: true,
    }).select('id').single();
    expect(inserted.error?.message || '', 'crear rol estándar E2E').toBe('');
    role = inserted.data;
  }

  const { error: deleteRolesError } = await supabase
    .from('user_roles')
    .delete()
    .eq('tenant_id', aprobador!.tenant_id)
    .eq('usuario_sistema_id', user!.id);
  expect(deleteRolesError?.message || '', 'limpiar roles del usuario estándar E2E').toBe('');
  const { error: assignRoleError } = await supabase.from('user_roles').insert({
    id: crypto.randomUUID(),
    tenant_id: aprobador!.tenant_id,
    usuario_sistema_id: user!.id,
    role_id: role!.id,
  });
  expect(assignRoleError?.message || '', 'asignar rol estándar E2E').toBe('');

  return { email, password: password!, id: user!.id as string };
}

async function loginApi(baseURL: string, email: string, password: string) {
  void baseURL;
  const api = await request.newContext({ baseURL: getApiOrigin() });
  const login = await api.post('/api/auth/login', { data: { email, password } });
  expect(login.ok(), `login API HTTP ${login.status()}: ${await login.text()}`).toBe(true);
  const body = await login.json().catch(() => ({}));
  const token = body.access_token || body.token || body.data?.access_token || body.data?.token;
  if (!token) return api;
  await api.dispose();
  return request.newContext({
    baseURL: getApiOrigin(),
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });
}

test.describe('Auth, sesión, país/empresa, wizard y permisos', () => {
  test('sin sesión redirige rutas protegidas a login y no deja pantalla en blanco', async ({ browser }, testInfo) => {
    const context = await browser.newContext({
      baseURL: getBaseURL(testInfo),
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    const evidence = attachBrowserEvidence(page);

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/login/, { timeout: 30000 });
    await expect(page.getByRole('button', { name: /^Iniciar Sesión$/i })).toBeVisible();
    await expect(page.locator('body')).toContainText(/\S/);

    await expectCleanBrowserEvidence(evidence, { allowUnauthorizedResourceErrors: true });
    await context.close();
  });

  test('admin inicia sesión por UI, persiste sesión, refresca token, redirige desde login y cierra sesión', async ({ browser }, testInfo) => {
    const baseURL = getBaseURL(testInfo);
    const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    const evidence = attachBrowserEvidence(page);

    await loginThroughUi(page, adminEmail, adminPassword);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expectDashboardReady(page);

    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await expectDashboardReady(page);

    const api = await request.newContext({
      baseURL: getApiOrigin(),
      storageState: await context.storageState(),
    });
    const refresh = await api.post('/api/auth/refresh');
    expect(refresh.ok(), `refresh de sesión HTTP ${refresh.status()}: ${await refresh.text()}`).toBe(true);
    const profile = await api.get('/api/auth/profile');
    expect(profile.ok(), `profile post-refresh HTTP ${profile.status()}: ${await profile.text()}`).toBe(true);
    await api.dispose();

    await page.getByRole('button', { name: /Cerrar Sesión/i }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 30000 });

    await expectCleanBrowserEvidence(evidence, { allowUnauthorizedResourceErrors: true });
    await context.close();
  });

  test('usuario estándar entra al dashboard sin falso wizard ni loader de país, pero no puede configurar', async ({ browser }, testInfo) => {
    const baseURL = getBaseURL(testInfo);
    const standardUser = await createStandardUser(baseURL);
    const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    const evidence = attachBrowserEvidence(page);

    await loginThroughUi(page, standardUser.email, standardUser.password);
    await expectDashboardReady(page);
    await expect(page).not.toHaveURL(/\/dashboard\/wizard/);

    const standardApi = await loginApi(baseURL, standardUser.email, standardUser.password);
    const status = await standardApi.get('/api/configuration/context/status');
    expect(status.ok(), `estado seguro de configuración HTTP ${status.status()}: ${await status.text()}`).toBe(true);
    const country = await standardApi.get('/api/configuration/context/country');
    expect(country.ok(), `contexto de país HTTP ${country.status()}: ${await country.text()}`).toBe(true);
    const countryBody = await country.json();
    expect(countryBody.data.pais).toBeTruthy();
    expect(countryBody.data.pais_id).toBeTruthy();

    const forbiddenWizardWrite = await standardApi.post('/api/configuration/wizard/step', {
      data: { pasoActual: 1, configuracionTemporal: { prueba: true } },
    });
    expect(forbiddenWizardWrite.status(), 'usuario sin permiso no debe guardar wizard').toBe(403);
    await standardApi.dispose();

    await expectCleanBrowserEvidence(evidence, { allowUnauthorizedResourceErrors: true });
    await context.close();
  });

  test('admin puede actualizar configuración de empresa y usuario estándar recibe 403 en escritura', async ({}, testInfo) => {
    const baseURL = getBaseURL(testInfo);
    const standardUser = await createStandardUser(baseURL);

    const adminApi = await adminContext(baseURL);
    const empresa = await adminApi.get('/api/configuration/empresa');
    expect(empresa.ok(), `lectura empresa admin HTTP ${empresa.status()}: ${await empresa.text()}`).toBe(true);
    const empresaBody = await empresa.json();
    expect(empresaBody.data.pais).toBeTruthy();
    expect(empresaBody.data.pais_id).toBeTruthy();

    const adminWrite = await adminApi.put('/api/configuration/empresa', {
      data: {
        pais: empresaBody.data.pais,
        pais_id: empresaBody.data.pais_id,
        razonSocial: empresaBody.data.razonSocial,
        ruc: empresaBody.data.ruc,
        direccion: empresaBody.data.direccion || 'Av. Produccion 123',
        monedaDefecto: empresaBody.data.monedaDefecto,
      },
    });
    expect(adminWrite.ok(), `admin debe poder configurar empresa HTTP ${adminWrite.status()}: ${await adminWrite.text()}`).toBe(
      true,
    );
    await adminApi.dispose();

    const standardApi = await loginApi(baseURL, standardUser.email, standardUser.password);
    const standardWrite = await standardApi.put('/api/configuration/empresa', {
      data: {
        pais: empresaBody.data.pais,
        pais_id: empresaBody.data.pais_id,
        razonSocial: empresaBody.data.razonSocial,
        ruc: empresaBody.data.ruc,
        direccion: empresaBody.data.direccion || 'Av. Produccion 123',
      },
    });
    expect(standardWrite.status(), 'usuario estándar sin permiso no debe actualizar empresa').toBe(403);
    await standardApi.dispose();
  });
});
