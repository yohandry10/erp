import { APIResponse, Page, expect, request as playwrightRequest, test } from '@playwright/test';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { gotoAuthenticated, login } from './helpers/auth';

type ApiEnvelope<T> = { success?: boolean; data?: T; message?: string; error?: string };

const runId = Date.now().toString().slice(-9);
const apiBaseURL = process.env.E2E_API_ORIGIN || 'http://localhost:13002';
const api = (route: string) => `/api${route}`;
const today = () => new Date().toISOString().split('T')[0];
const futureNoDataDate = '2099-01-01';

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

async function expectStatus(response: APIResponse, expected: number, label: string): Promise<void> {
  const text = await response.text();
  expect(response.status(), `${label}: ${text}`).toBe(expected);
}

async function authContext(page: Page): Promise<{ headers: Record<string, string>; tenantId: string }> {
  const accessToken = (await page.context().cookies()).find((cookie) => cookie.name === 'access_token')?.value;
  expect(accessToken, 'la sesion E2E debe tener access_token').toBeTruthy();
  const payload = JSON.parse(Buffer.from(accessToken!.split('.')[1], 'base64url').toString('utf8'));
  return { headers: { Authorization: `Bearer ${accessToken}` }, tenantId: payload.tenant_id };
}

function getSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  expect(url, 'SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL requerido para E2E Analytics/Dashboard').toBeTruthy();
  expect(key, 'SUPABASE_SERVICE_ROLE_KEY requerido para E2E Analytics/Dashboard').toBeTruthy();
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
    if (status >= 500 || (status === 404 && /\/(_next|dashboard|api)\//.test(url))) {
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

test.describe('CASE-18 Analytics y Dashboard', () => {
  test.setTimeout(300000);

  test('dashboard y analytics reflejan datos reales por tenant y filtros de fecha', async ({ page }) => {
    const browserFailures = await collectBrowserFailures(page);
    await login(page);
    const { headers, tenantId } = await authContext(page);
    const supabase = getSupabase();
    const apiContext = await playwrightRequest.newContext({
      baseURL: apiBaseURL,
      extraHTTPHeaders: headers,
      storageState: { cookies: [], origins: [] },
    });

    await expectStatus(await apiContext.post(api('/dashboard/cache/invalidate'), { data: {} }), 201, 'invalidar cache inicial');
    const baseline = await parseOk<any>(await apiContext.get(api('/dashboard/stats')), 'baseline dashboard stats');

    const unique = `QA-PROD-READY-${new Date().toISOString().replace(/\D/g, '').slice(0, 12)}-CASE18-${runId}-${crypto.randomUUID().slice(0, 8)}`;
    const cpeTotal = 432.1;
    const ventaTotal = 321.9;
    const compraTotal = 210.5;
    const stockActual = 7;
    const precio = 13.25;

    const product = await insertRow(supabase, 'productos', {
      tenant_id: tenantId,
      codigo: `${unique}-PROD`,
      nombre: `Producto Analytics Dashboard ${unique}`,
      categoria: 'QA-PROD-READY-ANALYTICS-CASE18',
      precio,
      precio_venta: precio,
      stock_actual: stockActual,
      stock: stockActual,
      stock_minimo: 2,
      activo: true,
      estado: 'activo',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    expect(product.id, 'producto CASE-18 debe persistir').toBeTruthy();

    await insertRow(supabase, 'cpe', {
      tenant_id: tenantId,
      serie: 'F018',
      numero: Number(runId.slice(-6)),
      tipo_documento: '01',
      fecha_emision: today(),
      total: cpeTotal,
      total_venta: cpeTotal,
      total_gravadas: 366.19,
      total_igv: 65.91,
      estado: 'emitido',
      sunat_status: 'pendiente',
      idempotency_key: `${unique}-cpe`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await insertRow(supabase, 'ventas', {
      tenant_id: tenantId,
      fecha: new Date().toISOString(),
      total: ventaTotal,
      subtotal: 272.8,
      igv: 49.1,
      estado: 'COMPLETADA',
      referencia: unique,
      idempotency_key: `${unique}-venta`,
      activo: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await insertRow(supabase, 'ordenes_compra', {
      tenant_id: tenantId,
      numero: `${unique}-OC`,
      numero_orden: `${unique}-OC`,
      fecha_orden: new Date().toISOString(),
      total: compraTotal,
      subtotal: 178.39,
      igv: 32.11,
      estado: 'pendiente',
      moneda: 'PEN',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await insertRow(supabase, 'sire_files', {
      tenant_id: tenantId,
      filename: `${unique}-sire.txt`,
      tipo: `QA18${runId.slice(-5)}`,
      servicio: 'SIRE',
      periodo: today().slice(0, 7),
      period: today().slice(0, 7),
      total_registros: 1,
      estado: 'generado',
      status: 'generado',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const cliente = await insertRow(supabase, 'clientes', {
      tenant_id: tenantId,
      tipo: 'PERSONA',
      documento_tipo: 'DNI',
      documento_numero: runId.slice(-8),
      numero_documento: runId.slice(-8),
      nombres: 'Cliente',
      apellidos: `Analytics ${unique}`,
      razon_social: `Cliente Analytics ${unique}`,
      estado: 'activo',
      activo: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const documento = await insertRow(supabase, 'documentos', {
      tenant_id: tenantId,
      cliente_id: cliente.id,
      tipo_documento: '03',
      serie: 'B018',
      numero: runId.slice(-8),
      fecha_emision: today(),
      fecha_vencimiento: today(),
      subtotal: 272.8,
      impuesto_igv: 49.1,
      total: ventaTotal,
      moneda: 'PEN',
      receptor_documento: runId.slice(-8),
      receptor_numero_doc: runId.slice(-8),
      receptor_nombre: `Cliente Analytics ${unique}`,
      receptor_razon_social: `Cliente Analytics ${unique}`,
      receptor_tipo_doc: '1',
      estado: 'emitido',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await insertRow(supabase, 'cuentas_por_cobrar', {
      tenant_id: tenantId,
      cliente_id: cliente.id,
      documento_id: documento.id,
      numero: `${unique}-CXC`,
      fecha_emision: today(),
      fecha_vencimiento: today(),
      monto_total: ventaTotal,
      monto_pendiente: ventaTotal,
      saldo: ventaTotal,
      estado: 'pendiente',
      moneda: 'PEN',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const proveedor = await insertRow(supabase, 'proveedores', {
      tenant_id: tenantId,
      ruc: `20${runId.slice(-9)}`,
      razon_social: `Proveedor Analytics ${unique} SAC`,
      nombre_comercial: `Proveedor Analytics ${unique}`,
      estado: 'activo',
      activo: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await insertRow(supabase, 'cuentas_por_pagar', {
      tenant_id: tenantId,
      proveedor_id: proveedor.id,
      numero: `${unique}-CXP`,
      numero_documento: `${unique}-CXP`,
      fecha_emision: today(),
      fecha_vencimiento: today(),
      total: compraTotal,
      subtotal: 178.39,
      igv: 32.11,
      saldo: compraTotal,
      saldo_pendiente: compraTotal,
      estado: 'pendiente',
      moneda: 'PEN',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await expectStatus(await apiContext.post(api('/dashboard/cache/invalidate'), { data: {} }), 201, 'invalidar cache con datos CASE-18');
    const stats = await parseOk<any>(await apiContext.get(api('/dashboard/stats')), 'dashboard stats con datos CASE-18');
    expect(Number(stats.ventasMes), 'Dashboard debe reflejar CPE real del periodo').toBeGreaterThanOrEqual(Number(baseline.ventasMes) + cpeTotal - 0.01);
    expect(Number(stats.comprasMes), 'Dashboard debe reflejar OC real del periodo').toBeGreaterThanOrEqual(Number(baseline.comprasMes) + compraTotal - 0.01);
    expect(Number(stats.totalInventario), 'Dashboard debe contar producto real').toBeGreaterThanOrEqual(Number(baseline.totalInventario) + 1);
    expect(Number(stats.valorInventario), 'Dashboard debe valorizar stock_actual real').toBeGreaterThanOrEqual(Number(baseline.valorInventario) + precio * stockActual - 0.01);
    expect(Number(stats.totalSire), 'Dashboard debe contar SIRE real').toBeGreaterThanOrEqual(Number(baseline.totalSire) + 1);

    const activity = await parseOk<any[]>(await apiContext.get(api('/dashboard/activities')), 'dashboard activities con datos CASE-18');
    expect(activity.some((item) => String(item.description).includes(`${unique}-OC`)), 'actividad debe incluir OC creada').toBeTruthy();

    const ventasTiempo = await parseOk<any>(
      await apiContext.get(api(`/analytics/ventas-tiempo?fecha_desde=${today()}&fecha_hasta=${today()}`)),
      'analytics ventas-tiempo con rango CASE-18',
    );
    expect(Number(ventasTiempo.totales.ventasActuales), 'Analytics debe incluir venta creada en el rango').toBeGreaterThanOrEqual(ventaTotal);
    expect(ventasTiempo.labels.length, 'Analytics debe generar labels reales').toBeGreaterThan(0);

    const sinDatos = await parseOk<any>(
      await apiContext.get(api(`/analytics/ventas-tiempo?fecha_desde=${futureNoDataDate}&fecha_hasta=${futureNoDataDate}`)),
      'analytics periodo sin datos',
    );
    expect(Number(sinDatos.totales.ventasActuales), 'periodo sin datos debe ser cero').toBe(0);
    await expectStatus(
      await apiContext.get(api('/analytics/ventas-tiempo?fecha_desde=2026-99-99&fecha_hasta=2026-05-13')),
      400,
      'analytics rechaza fecha invalida',
    );

    const cxc = await parseOk<any>(await apiContext.get(api('/analytics/deudas-clientes')), 'analytics CxC');
    expect(Number(cxc.totales.totalPorCobrar), 'Analytics CxC debe reflejar CxC creada').toBeGreaterThanOrEqual(ventaTotal);
    const cxp = await parseOk<any>(await apiContext.get(api('/analytics/deudas-proveedores')), 'analytics CxP');
    expect(Number(cxp.totales.totalPorPagar), 'Analytics CxP debe reflejar CxP creada').toBeGreaterThanOrEqual(compraTotal);

    const publicResponse = await fetch(`${apiBaseURL}${api('/dashboard/stats')}`, { headers: { cookie: '' } });
    expect(publicResponse.status, 'Dashboard no debe responder sin autenticacion').toBe(401);

    await gotoAuthenticated(page, '/dashboard/');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('INGRESOS MENSUALES')).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/Cargando datos del dashboard|Application error|Unhandled Runtime Error/i);

    await gotoAuthenticated(page, '/dashboard/analytics/');
    await expect(page.getByRole('heading', { name: /Analytics Financiero/i })).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('Evolución de Ventas')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('body')).not.toContainText(/Sin datos para mostrarSin datos para mostrarSin datos para mostrar/i);
    await expect(page.locator('body')).not.toContainText(/Application error|Unhandled Runtime Error|Failed to compile/i);

    expect(browserFailures, `sin errores fatales de consola/red: ${browserFailures.join('\n')}`).toEqual([]);
    await apiContext.dispose();
  });

  test('analytics exporta CSV descargable con metricas reales', async ({ page }) => {
    await login(page);
    await gotoAuthenticated(page, '/dashboard/analytics/');
    await expect(page.getByRole('heading', { name: /Analytics Financiero/i })).toBeVisible({ timeout: 30000 });

    await page.getByLabel('Fecha desde').fill('2026-05-01');
    await page.getByLabel('Fecha hasta').fill('2026-05-15');
    await page.getByRole('button', { name: 'Aplicar' }).click();
    await expect(page.locator('body')).not.toContainText('Fecha inválida');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Exportar CSV' }).click(),
    ]);

    expect(download.suggestedFilename(), 'nombre de archivo CSV debe incluir rango aplicado').toBe(
      'analytics_2026-05-01_2026-05-15.csv',
    );

    const downloadPath = await download.path();
    expect(downloadPath, 'Playwright debe materializar el archivo descargado').toBeTruthy();
    const csv = fs.readFileSync(downloadPath!, 'utf8');

    expect(csv, 'CSV debe incluir cabecera').toContain('"metrica","valor"');
    for (const metric of [
      'ventas_actuales',
      'ventas_periodo_anterior',
      'cxc_total',
      'cxc_vencido',
      'cxp_total',
      'cxp_vencido',
      'liquidez',
      'rentabilidad',
    ]) {
      expect(csv, `CSV debe incluir metrica ${metric}`).toContain(`"${metric}"`);
    }
    expect(csv, 'CSV exportado no debe contener valores undefined/null').not.toMatch(/undefined|null/i);
  });
});
