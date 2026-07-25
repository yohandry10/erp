import { APIRequestContext, APIResponse, Page, expect, request as playwrightRequest, test } from '@playwright/test';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { gotoAuthenticated, login } from './helpers/auth';

type ApiEnvelope<T> = { success?: boolean; data?: T; message?: string; error?: any };

const runId = Date.now().toString().slice(-9);
const apiBaseURL = process.env.E2E_API_ORIGIN || 'http://localhost:13002';
const api = (path: string) => `/api${path}`;

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
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as ApiEnvelope<T>).data as T;
  }
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

async function parseBody(response: APIResponse): Promise<any> {
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

async function authHeaders(page: Page): Promise<Record<string, string>> {
  const accessToken = (await page.context().cookies()).find((cookie) => cookie.name === 'access_token')?.value;
  expect(accessToken, 'la sesión E2E debe tener access_token').toBeTruthy();
  return { Authorization: `Bearer ${accessToken}` };
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

function getSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  expect(url, 'SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL requerido para E2E POS').toBeTruthy();
  expect(key, 'SUPABASE_SERVICE_ROLE_KEY requerido para E2E POS').toBeTruthy();
  return createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function ensureMetodoPago(supabase: SupabaseClient, tenantId: string, codigo: string, tipo: string, nombre: string) {
  const { data: existing, error: selectError } = await supabase
    .from('metodos_pago')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('codigo', codigo)
    .limit(1)
    .maybeSingle();
  expect(selectError?.message || '', `consultar método ${codigo}`).toBe('');
  if (existing) return existing;

  const { data, error } = await supabase
    .from('metodos_pago')
    .insert({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      codigo,
      nombre,
      tipo,
      activo: true,
      estado: 'ACTIVO',
    })
    .select('*')
    .single();
  expect(error?.message || '', `crear método ${codigo}`).toBe('');
  return data;
}

async function prepararDatos(supabase: SupabaseClient, tenantId: string) {
  await supabase.from('empresa_config').upsert({
    tenant_id: tenantId,
    ruc: `20${runId.padStart(9, '0').slice(-9)}`,
    razon_social: 'ERP POS E2E SAC',
    nombre_comercial: 'ERP POS E2E',
    email: `pos-e2e-${runId}@example.com`,
    direccion: 'Av. POS 123',
    direccion_fiscal: 'Av. POS 123',
    pais: 'PE',
    moneda_defecto: 'PEN',
    configuracion_completa: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'tenant_id' });

  const { data: almacen, error: almacenError } = await supabase
    .from('almacenes')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('activo', true)
    .order('es_principal', { ascending: false })
    .limit(1)
    .single();
  expect(almacenError?.message || '', 'consultar almacén POS').toBe('');
  expect(almacen?.id, 'debe existir un almacén operativo para POS').toBeTruthy();

  const { data: caja, error: cajaError } = await supabase.from('cajas').insert({
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    almacen_id: almacen!.id,
    codigo: `CAJA-POS-${runId}`,
    nombre: `Caja POS ${runId}`,
    estado: 'ACTIVO',
  }).select('*').single();
  expect(cajaError?.message || '', 'crear caja POS').toBe('');

  const efectivo = await ensureMetodoPago(supabase, tenantId, 'efectivo', 'EFECTIVO', 'Efectivo');
  const tarjeta = await ensureMetodoPago(supabase, tenantId, 'tarjeta', 'TARJETA', 'Tarjeta');

  const { data: cliente, error: clienteError } = await supabase.from('clientes').insert({
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    tipo: 'PERSONA',
    documento_tipo: 'DNI',
    tipo_documento: 'DNI',
    documento_numero: `7${runId.slice(-7)}`,
    numero_documento: `7${runId.slice(-7)}`,
    razon_social: `Cliente POS ${runId}`,
    direccion: 'Av. Cliente POS 456',
    activo: true,
    estado: 'ACTIVO',
  }).select('*').single();
  expect(clienteError?.message || '', 'crear cliente POS').toBe('');

  const productoId = crypto.randomUUID();
  const { data: producto, error: productoError } = await supabase.from('productos').insert({
    id: productoId,
    tenant_id: tenantId,
    codigo: `POS-${runId}`,
    codigo_barras: `775${runId}`,
    nombre: `Producto POS ${runId}`,
    categoria: 'AUDITORIA',
    precio: 40,
    precio_venta: 40,
    precio_unitario: 40,
    stock_minimo: '0',
    unidad_medida: 'NIU',
    activo: true,
    estado: 'ACTIVO',
    controla_stock: true,
    es_servicio: false,
  }).select('*').single();
  expect(productoError?.message || '', 'crear producto POS').toBe('');

  const { error: stockError } = await supabase.rpc('aplicar_movimiento_inventario_tx', {
    p_tenant_id: tenantId,
    p_producto_id: producto!.id,
    p_almacen_id: almacen!.id,
    p_tipo: 'ENTRADA',
    p_cantidad: 6,
    p_referencia_tipo: 'QA_POS_E2E',
    p_referencia_id: crypto.randomUUID(),
    p_notas: 'Stock inicial controlado para POS vertical',
    p_created_by: 'playwright',
    p_metadata: { source: 'pos-vertical.spec.ts', run_id: runId },
  });
  expect(stockError?.message || '', 'cargar stock por ledger para POS').toBe('');

  const { data: sinStock, error: sinStockError } = await supabase.from('productos').insert({
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    codigo: `POS-SIN-${runId}`,
    nombre: `Producto sin stock POS ${runId}`,
    categoria: 'AUDITORIA',
    precio: 20,
    precio_venta: 20,
    precio_unitario: 20,
    stock_minimo: '0',
    unidad_medida: 'NIU',
    activo: true,
    estado: 'ACTIVO',
    controla_stock: true,
    es_servicio: false,
  }).select('*').single();
  expect(sinStockError?.message || '', 'crear producto sin stock POS').toBe('');

  const { data: inactivo, error: inactivoError } = await supabase.from('productos').insert({
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    codigo: `POS-INACT-${runId}`,
    nombre: `Producto inactivo POS ${runId}`,
    categoria: 'AUDITORIA',
    precio: 20,
    precio_venta: 20,
    precio_unitario: 20,
    stock_minimo: '0',
    unidad_medida: 'NIU',
    activo: false,
    estado: 'INACTIVO',
    controla_stock: true,
    es_servicio: false,
  }).select('*').single();
  expect(inactivoError?.message || '', 'crear producto inactivo POS').toBe('');

  return { caja, efectivo, tarjeta, cliente, producto, sinStock, inactivo };
}

async function abrirCaja(apiContext: APIRequestContext, cajaId: string) {
  const sesionActual = await parseOk<any>(await apiContext.get(api('/pos/sesion-caja')), 'consultar sesión POS');
  if (sesionActual?.id) {
    return sesionActual.id;
  }

  const response = await apiContext.post(api('/pos/caja/abrir'), {
    data: { caja_id: cajaId, monto_inicial: 100, dispositivo: `E2E-POS-${runId}` },
  });
  const cajaAbierta = await parseOk<any>(response, 'abrir caja POS');
  expect(cajaAbierta.id || cajaAbierta.sesion_id, 'debe devolver sesión de caja').toBeTruthy();
  return cajaAbierta.id || cajaAbierta.sesion_id;
}

test.describe('T08 POS vertical completo', () => {
  test.setTimeout(600000);

  test('venta POS valida ticket, pagos, stock, Kardex, CPE/cola, caja y asiento', async ({ page }) => {
    const browserFailures = await collectBrowserFailures(page);
    await login(page);
    const headers = await authHeaders(page);
    const supabase = getSupabase();

    const apiContext = await playwrightRequest.newContext({
      baseURL: apiBaseURL,
      extraHTTPHeaders: headers,
      storageState: { cookies: [], origins: [] },
    });

    const me = await parseOk<any>(await apiContext.get(api('/auth/profile')), 'obtener usuario actual');
    const tenantId = me.user?.tenant_id || me.tenant_id;
    expect(tenantId, 'auth/me debe devolver tenant_id').toBeTruthy();

    const data = await prepararDatos(supabase, tenantId);
    let sesionId = await abrirCaja(apiContext, data.caja.id);

    await gotoAuthenticated(page, '/dashboard/pos');
    const abrirCajaButton = page.getByRole('button', { name: /Abrir Caja Registradora/i });
    const debeAbrirCaja = await abrirCajaButton.waitFor({ state: 'visible', timeout: 10000 })
      .then(() => true)
      .catch(() => false);
    if (debeAbrirCaja) {
      await abrirCajaButton.click();
      await page.getByLabel(/Monto inicial/i).fill('100');
      await page.getByRole('button', { name: /Confirmar/i }).click();

      const sesionAbierta = await parseOk<any>(
        await apiContext.get(api('/pos/sesion-caja')),
        'consultar sesión POS abierta desde UI',
      );
      expect(sesionAbierta?.id, 'la apertura de caja desde UI debe crear una sesión activa').toBeTruthy();
      sesionId = sesionAbierta.id;
    }

    await expect(page.getByRole('heading', { name: 'Punto de venta' })).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('heading', { name: 'Venta actual' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ventas del día' })).toBeVisible();
    const modoCajaButton = page.getByRole('button', { name: 'Modo caja' });
    await expect(modoCajaButton).toBeVisible();
    await modoCajaButton.click();
    await expect(page.getByRole('button', { name: 'Salir de modo caja' })).toBeVisible();
    await page.keyboard.press('F2');
    await expect(page.getByRole('combobox', { name: 'Buscar productos' })).toBeFocused();
    await page.keyboard.press('F4');
    await expect(page.getByRole('textbox', { name: 'Código de barras' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(modoCajaButton).toBeVisible();
    await expect(page.getByRole('button', { name: 'Guardar' })).toHaveCount(0);
    await expect(page.getByText(data.producto.codigo, { exact: false })).toBeVisible({ timeout: 20000 });
    await expect(page.locator('body')).not.toContainText(/Cargando|Application error|Unhandled|Error fatal/i);

    const sinStockResponse = await apiContext.post(api('/pos/venta'), {
      data: {
        idempotency_key: `pos-sin-stock-${runId}`,
        sesion_caja_id: sesionId,
        cliente_id: data.cliente.id,
        cliente_nombre: data.cliente.razon_social,
        cliente_documento: data.cliente.numero_documento,
        metodo_pago_id: data.efectivo.id,
        items: [{ producto_id: data.sinStock.id, cantidad: 1, precio_unitario: 20, subtotal: 20 }],
        subtotal: 20,
        impuestos: 3.6,
        total: 23.6,
        permite_venta_sin_stock: false,
      },
    });
    const sinStockBody = await parseBody(sinStockResponse);
    expect(sinStockBody.success, JSON.stringify(sinStockBody)).toBe(false);
    expect(JSON.stringify(sinStockBody)).toMatch(/Stock insuficiente/i);

    const inactivoResponse = await apiContext.post(api('/pos/venta'), {
      data: {
        idempotency_key: `pos-inactivo-${runId}`,
        sesion_caja_id: sesionId,
        cliente_id: data.cliente.id,
        cliente_nombre: data.cliente.razon_social,
        cliente_documento: data.cliente.numero_documento,
        metodo_pago_id: data.efectivo.id,
        items: [{ producto_id: data.inactivo.id, cantidad: 1, precio_unitario: 20, subtotal: 20 }],
        subtotal: 20,
        impuestos: 3.6,
        total: 23.6,
        permite_venta_sin_stock: false,
      },
    });
    const inactivoBody = await parseBody(inactivoResponse);
    expect(inactivoBody.success, JSON.stringify(inactivoBody)).toBe(false);
    expect(JSON.stringify(inactivoBody)).toMatch(/Producto inactivo/i);

    const venta = await parseOk<any>(
      await apiContext.post(api('/pos/venta'), {
        data: {
          idempotency_key: `pos-ok-${runId}`,
          sesion_caja_id: sesionId,
          cliente_id: data.cliente.id,
          cliente_nombre: data.cliente.razon_social,
          cliente_documento: data.cliente.numero_documento,
          pagos: [
            { metodo_pago_id: data.efectivo.id, monto: 60 },
            { metodo_pago_id: data.tarjeta.id, monto: 74.52, referencia: `TAR-${runId}` },
          ],
          items: [{
            producto_id: data.producto.id,
            cantidad: 3,
            precio_unitario: 40,
            descuento_porcentaje: 5,
            descuento_monto: 6,
            subtotal: 114,
            producto: { codigo: data.producto.codigo, nombre: data.producto.nombre, unidad_medida_sunat: 'NIU' },
          }],
          subtotal: 114,
          impuestos: 20.52,
          total: 134.52,
          comprobante: { tipo: '03', serie: 'B001' },
          permite_venta_sin_stock: false,
        },
      }),
      'procesar venta POS con pago mixto',
    );
    expect(venta.venta_id).toBeTruthy();
    expect(venta.numero_ticket).toMatch(/^B001-\d{8}$/);
    expect(venta.factura_electronica || venta.message).toBeTruthy();

    const ventaDuplicada = await parseOk<any>(
      await apiContext.post(api('/pos/venta'), {
        data: {
          idempotency_key: `pos-ok-${runId}`,
          sesion_caja_id: sesionId,
          cliente_id: data.cliente.id,
          cliente_nombre: data.cliente.razon_social,
          cliente_documento: data.cliente.numero_documento,
          metodo_pago_id: data.efectivo.id,
          items: [{ producto_id: data.producto.id, cantidad: 3, precio_unitario: 40, subtotal: 120 }],
          subtotal: 120,
          impuestos: 21.6,
          total: 141.6,
          permite_venta_sin_stock: false,
        },
      }),
      'reintento idempotente POS',
    );
    expect(ventaDuplicada.venta_id).toBe(venta.venta_id);

    // El endpoint es GET (consulta los detalles de una venta por id), no POST.
    // El test tenía POST con body redundante — error de método HTTP.
    const detalles = await parseOk<any[]>(
      await apiContext.get(api(`/pos/detalles-venta/${venta.venta_id}`)),
      'detalle POS persistido',
    );
    expect(detalles).toHaveLength(1);
    expect(Number(detalles[0].cantidad)).toBe(3);
    expect(detalles[0].producto_id).toBe(data.producto.id);

    const { data: productoDb, error: productoDbError } = await supabase
      .from('productos')
      .select('stock_actual')
      .eq('id', data.producto.id)
      .eq('tenant_id', tenantId)
      .single();
    expect(productoDbError?.message || '', 'consultar stock posterior POS').toBe('');
    expect(productoDb, 'producto POS debe existir tras venta').toBeTruthy();
    const productoPersistido = productoDb!;
    expect(Number(productoPersistido.stock_actual)).toBe(3);

    const { data: movimientos, error: movimientosError } = await supabase
      .from('movimientos_inventario')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('producto_id', data.producto.id)
      .eq('referencia_id', venta.venta_id)
      .eq('referencia_tipo', 'VENTA_POS')
      .eq('tipo', 'SALIDA');
    expect(movimientosError?.message || '', 'consultar movimiento POS').toBe('');
    expect(movimientos || []).toHaveLength(1);
    expect(Number(movimientos![0].cantidad)).toBe(3);

    const kardex = await parseOk<any[]>(
      await apiContext.get(api(`/inventario/kardex?productoId=${data.producto.id}&limit=20`)),
      'kardex POS',
    );
    expect(kardex.some((mov) => /VENTA_POS/i.test(`${mov.referenciaTipo ?? mov.referencia_tipo ?? mov.documento ?? ''}`))).toBeTruthy();

    const { data: pagos, error: pagosError } = await supabase
      .from('ventas_pos_pagos')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('venta_pos_id', venta.venta_id);
    expect(pagosError?.message || '', 'consultar pagos POS').toBe('');
    expect(pagos || []).toHaveLength(2);

    const { data: cajaMovimientos, error: cajaError } = await supabase
      .from('movimientos_caja')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('referencia_tipo', 'venta_pos')
      .eq('referencia_documento', venta.venta_id);
    expect(cajaError?.message || '', 'consultar movimiento caja POS').toBe('');
    expect(cajaMovimientos || []).toHaveLength(1);
    expect(Number(cajaMovimientos![0].monto)).toBe(60);

    const { data: ventaDb, error: ventaDbError } = await supabase
      .from('ventas_pos')
      .select('id, numero_ticket, cpe_pendiente, cpe_data')
      .eq('tenant_id', tenantId)
      .eq('id', venta.venta_id)
      .single();
    expect(ventaDbError?.message || '', 'consultar venta POS').toBe('');
    expect(ventaDb, 'venta POS debe persistir').toBeTruthy();
    const ventaPersistida = ventaDb!;
    expect(ventaPersistida.numero_ticket).toBe(venta.numero_ticket);
    expect(venta.cpe_id || venta.factura_electronica || ventaPersistida.cpe_pendiente).toBeTruthy();

    await expect.poll(async () => {
      const response = await apiContext.get(api(`/contabilidad/asientos?referencia=${encodeURIComponent(venta.numero_ticket)}`));
      const asientos = await parseOk<any[]>(response, 'listar asientos POS por referencia');
      return asientos.length;
    }, {
      message: 'venta POS debe generar asiento contable si corresponde',
      timeout: 90000,
    }).toBeGreaterThan(0);

    await gotoAuthenticated(page, '/dashboard/pos');
    await page.getByRole('button', { name: 'Ventas del día' }).click();
    await expect(page.getByRole('dialog', { name: 'Ventas del día' })).toBeVisible();
    await expect(page.getByText(venta.numero_ticket, { exact: false }).first()).toBeVisible({ timeout: 20000 });
    await gotoAuthenticated(page, '/dashboard/inventario/kardex');
    await expect(page.locator('body')).toContainText(/Kardex|Movimientos/i, { timeout: 20000 });
    await gotoAuthenticated(page, '/dashboard/cpe');
    await expect(page.locator('body')).toContainText(/Comprobantes|CPE/i, { timeout: 20000 });
    await gotoAuthenticated(page, '/dashboard/cajas');
    await expect(page.locator('body')).toContainText(/Caja|Sesiones|Movimientos/i, { timeout: 20000 });

    await expect(page.locator('body')).not.toContainText(/Application error|Unhandled|Error fatal/i);
    expect(browserFailures).toEqual([]);
  });
});
