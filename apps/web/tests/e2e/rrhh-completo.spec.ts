import { APIResponse, Page, expect, request as playwrightRequest, test } from '@playwright/test';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { gotoAuthenticated, login } from './helpers/auth';

type ApiEnvelope<T> = { success?: boolean; data?: T; message?: string; error?: string };

const runId = Date.now().toString().slice(-9);
const qaStamp = new Date().toISOString().replace(/\D/g, '').slice(0, 12);
const qaPrefix = `QA-PROD-READY-${qaStamp}-CASE17-${runId}`;
const apiBaseURL = process.env.E2E_API_ORIGIN || 'http://localhost:13002';
const api = (route: string) => `/api${route}`;
const today = () => new Date().toISOString().split('T')[0];
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

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
  expect(url, 'SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL requerido para E2E RRHH').toBeTruthy();
  expect(key, 'SUPABASE_SERVICE_ROLE_KEY requerido para E2E RRHH').toBeTruthy();
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

async function requireCuenta(supabase: SupabaseClient, tenantId: string, codigo: string) {
  const { data, error } = await supabase
    .from('plan_cuentas')
    .select('id, codigo, nombre')
    .eq('tenant_id', tenantId)
    .eq('codigo', codigo)
    .eq('activo', true)
    .maybeSingle();
  expect(error?.message || '', `consultar cuenta ${codigo}`).toBe('');
  expect(data?.id, `debe existir cuenta contable activa ${codigo}`).toBeTruthy();
  return data;
}

async function waitForAsientoByReference(supabase: SupabaseClient, tenantId: string, referencia: string) {
  let found: any = null;
  await expect.poll(async () => {
    const { data, error } = await supabase
      .from('asientos_contables')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('referencia', referencia)
      .order('created_at', { ascending: false })
      .limit(1);
    expect(error?.message || '', `buscar asiento ${referencia}`).toBe('');
    found = data?.[0] ?? null;
    return found?.id ?? '';
  }, { message: `asiento contable para ${referencia}`, timeout: 120000, intervals: [1000, 2000, 5000] }).not.toBe('');

  const { data: detalles, error: detallesError } = await supabase
    .from('detalle_asientos')
    .select('*')
    .eq('asiento_id', found.id);
  expect(detallesError?.message || '', `buscar detalle asiento ${referencia}`).toBe('');
  found.detalle_asientos = detalles || [];
  return found;
}

function expectAsientoCuadrado(asiento: any) {
  const detalles = asiento.detalle_asientos || [];
  expect(detalles.length, 'asiento RRHH debe tener detalle').toBeGreaterThanOrEqual(2);
  expect(Number(asiento.total_debe), 'asiento RRHH total debe').toBeGreaterThan(0);
  expect(Number(asiento.total_debe), 'asiento RRHH debe=haber').toBeCloseTo(Number(asiento.total_haber), 2);
  const totalDebe = round2(detalles.reduce((sum: number, item: any) => sum + Number(item.debe || 0), 0));
  const totalHaber = round2(detalles.reduce((sum: number, item: any) => sum + Number(item.haber || 0), 0));
  expect(totalDebe, 'detalle debe cuadra con cabecera').toBeCloseTo(Number(asiento.total_debe), 2);
  expect(totalHaber, 'detalle haber cuadra con cabecera').toBeCloseTo(Number(asiento.total_haber), 2);
}

test.describe('T15 RRHH completo', () => {
  test.setTimeout(420000);

  test('empleados, planilla, pagos, contabilidad y permisos basicos funcionan', async ({ page }) => {
    const browserFailures = await collectBrowserFailures(page);
    await login(page);
    const { headers, tenantId } = await authContext(page);
    const supabase = getSupabase();
    const apiContext = await playwrightRequest.newContext({
      baseURL: apiBaseURL,
      extraHTTPHeaders: headers,
      storageState: { cookies: [], origins: [] },
    });
    const publicResponse = await fetch(`${apiBaseURL}${api('/rrhh/empleados')}`, {
      headers: { cookie: '' },
    });
    expect(publicResponse.status, 'RRHH no debe cargar sin autenticacion').toBe(401);
    await expectStatus(
      await apiContext.post(api('/rrhh/empleados'), { data: { nombres: 'Sin', apellidos: 'Documento' } }),
      400,
      'no crear empleado sin documento',
    );

    const documento = `7${runId.slice(-7)}`;
    const empleado = await parseOk<any>(
      await apiContext.post(api('/rrhh/empleados'), {
        data: {
          nombres: `${qaPrefix} Empleado`,
          apellidos: 'Auditoria RRHH',
          tipo_documento: 'DNI',
          numero_documento: documento,
          email: `rrhh-case17-${runId}@example.com`,
          telefono: '999888777',
          puesto: 'Analista RRHH',
          fecha_ingreso: today(),
          estado: 'activo',
        },
      }),
      'crear empleado T15',
    );
    expect(empleado.id, 'empleado creado debe tener id').toBeTruthy();

    await expectStatus(
      await apiContext.post(api('/rrhh/empleados'), {
        data: {
          nombres: 'Duplicado',
          apellidos: 'Documento',
          tipo_documento: 'DNI',
          numero_documento: documento,
        },
      }),
      409,
      'no duplicar documento de identidad',
    );

    const empleadoEditado = await parseOk<any>(
      await apiContext.put(api(`/rrhh/empleados/${empleado.id}`), {
        data: { puesto: 'Coordinador RRHH', email: `rrhh-case17-editado-${runId}@example.com` },
      }),
      'editar empleado T15',
    );
    expect(empleadoEditado.puesto).toBe('Coordinador RRHH');

    const empleadoInactivo = await parseOk<any>(
      await apiContext.delete(api(`/rrhh/empleados/${empleado.id}`)),
      'inactivar empleado T15',
    );
    expect(empleadoInactivo.estado ?? empleadoInactivo.data?.estado).toBe('inactivo');

    const empleadoReactivado = await parseOk<any>(
      await apiContext.put(api(`/rrhh/empleados/${empleado.id}`), { data: { estado: 'activo' } }),
      'reactivar empleado T15',
    );
    expect(empleadoReactivado.estado).toBe('activo');

    const asistenciaEntrada = await parseOk<any>(
      await apiContext.post(api('/rrhh/asistencias/marcar'), {
        data: {
          empleado_id: empleado.id,
          fecha: today(),
          tipo: 'entrada',
          hora: '08:00',
        },
      }),
      'registrar entrada asistencia RRHH CASE17',
    );
    expect(asistenciaEntrada.id ?? asistenciaEntrada.data?.id, 'entrada asistencia debe persistir').toBeTruthy();

    const asistenciaSalida = await parseOk<any>(
      await apiContext.post(api('/rrhh/asistencias/marcar'), {
        data: {
          empleado_id: empleado.id,
          fecha: today(),
          tipo: 'salida',
          hora: '17:00',
        },
      }),
      'registrar salida asistencia RRHH CASE17',
    );
    expect(Number(asistenciaSalida.horas_trabajadas ?? asistenciaSalida.data?.horas_trabajadas), 'horas asistencia RRHH').toBeCloseTo(9, 2);

    await expectStatus(
      await apiContext.post(api('/rrhh/asistencias/marcar'), {
        data: {
          empleado_id: empleado.id,
          fecha: today(),
          tipo: 'entrada',
          hora: '08:05',
        },
      }),
      409,
      'no duplicar entrada asistencia RRHH',
    );

    const contrato = await parseOk<any>(
      await apiContext.post(api('/rrhh/contratos'), {
        data: {
          id_empleado: empleado.id,
          tipo_contrato: 'INDEFINIDO',
          fecha_inicio: today(),
          sueldo_bruto: 4200,
          moneda: 'PEN',
          regimen_pensionario: 'AFP',
          estado: 'vigente',
        },
      }),
      'crear contrato RRHH T15',
    );
    expect(contrato.id, 'contrato RRHH debe persistir').toBeTruthy();

    const conceptos = await parseOk<any[]>(await apiContext.get(api('/rrhh/conceptos')), 'listar conceptos planilla T15');
    expect(Array.isArray(conceptos), 'conceptos debe responder arreglo normalizado').toBeTruthy();

    await expectStatus(
      await apiContext.post(api('/rrhh/planillas'), { data: { estado: 'BORRADOR' } }),
      400,
      'no generar planilla sin periodo',
    );

    await requireCuenta(supabase, tenantId, '621');
    await requireCuenta(supabase, tenantId, '411');
    await requireCuenta(supabase, tenantId, '403');

    const year = 2100 + (Number(runId.slice(-4)) % 500);
    const month = String((Number(runId.slice(-2)) % 12) + 1).padStart(2, '0');
    const periodo = `${year}-${month}`;
    await supabase.from('periodos_contables').upsert({
      tenant_id: tenantId,
      anio: year,
      mes: Number(month),
      estado: 'ABIERTO',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id,anio,mes' });

    const planilla = await parseOk<any>(
      await apiContext.post(api('/rrhh/planillas'), {
        data: {
          periodo,
          tipo: 'MENSUAL',
          estado: 'CALCULADA',
          total_ingresos: 4200,
          total_descuentos: 520,
          total_aportes: 378,
          total_neto: 3680,
          estado_pago: 'PENDIENTE',
          asientos_generados: false,
        },
      }),
      'crear planilla T15',
    );
    expect(planilla.id, 'planilla T15 debe persistir').toBeTruthy();

    const empleadoPlanillaId = crypto.randomUUID();
    const { error: empleadoPlanillaError } = await supabase.from('empleado_planilla').insert({
      id: empleadoPlanillaId,
      tenant_id: tenantId,
      empleado_id: empleado.id,
      id_empleado: empleado.id,
      planilla_id: planilla.id,
      id_planilla: planilla.id,
      dias_trabajados: 30,
      total_ingresos: 4200,
      total_descuentos: 520,
      total_aportes: 378,
      neto_pagar: 3680,
      estado: 'CALCULADA',
    });
    expect(empleadoPlanillaError?.message || '', 'crear detalle empleado_planilla T15').toBe('');

    const pago = await parseOk<any>(
      await apiContext.post(api(`/rrhh/planillas/${planilla.id}/pagar-empleados`), {
        data: {
          empleados_ids: [empleadoPlanillaId],
          metodo_pago: 'transferencia',
          numero_operacion: `QA17-RRHH-${runId}`,
          observaciones: `${qaPrefix} Pago auditado`,
        },
      }),
      'pagar empleado de planilla T15',
    );
    expect(pago.empleados_pagados ?? pago.data?.empleados_pagados, 'pago debe procesar empleado').toBe(1);

    const { data: pagos, error: pagosError } = await supabase
      .from('rrhh_pagos')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('planilla_id', planilla.id)
      .eq('empleado_id', empleado.id);
    expect(pagosError?.message || '', 'consultar obligacion de pago RRHH T15').toBe('');
    expect(pagos || [], 'pago RRHH debe persistir obligacion/pago').toHaveLength(1);
    expect(Number(pagos![0].monto_neto), 'monto neto RRHH persistido').toBeCloseTo(3680, 2);

    const asientoRespuesta = await parseOk<any>(
      await apiContext.post(api(`/rrhh/planillas/${planilla.id}/generar-asientos`), { data: {} }),
      'generar asiento planilla T15',
    );
    expect(asientoRespuesta.asiento_id ?? asientoRespuesta.data?.asiento_id, 'respuesta asiento RRHH debe tener id').toBeTruthy();
    const asiento = await waitForAsientoByReference(supabase, tenantId, `PLANILLA-${planilla.id}`);
    expectAsientoCuadrado(asiento);

    await login(page);
    await gotoAuthenticated(page, '/dashboard/rrhh/');
    await expect(page.getByRole('heading', { name: /Recursos Humanos/i })).toBeVisible({ timeout: 30000 });
    const empleadoRow = page.locator('tr').filter({ hasText: qaPrefix });
    await expect(empleadoRow).toBeVisible({ timeout: 30000 });
    await expect(empleadoRow).toContainText('Coordinador RRHH');

    for (const route of ['/dashboard/rrhh/planillas/', '/dashboard/rrhh/pagos/', '/dashboard/rrhh/asistencia/']) {
      await gotoAuthenticated(page, route);
      await expect(page.locator('body')).not.toContainText(/Cargando datos de RRHH\.\.\.|Loading/i, { timeout: 30000 });
      await expect(page.locator('body')).not.toContainText(/Application error|Unhandled Runtime Error|Error: Hydration/i);
      const visibleText = (await page.locator('body').innerText()).trim();
      expect(visibleText.length, `${route} no debe quedar vacia`).toBeGreaterThan(40);
    }

    expect(browserFailures, `sin errores fatales de consola/red: ${browserFailures.join('\n')}`).toEqual([]);

    await apiContext.dispose();
  });
});
