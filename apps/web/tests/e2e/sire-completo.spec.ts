import { APIRequestContext, APIResponse, Page, expect, request as playwrightRequest, test } from '@playwright/test';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { gotoAuthenticated, login } from './helpers/auth';
import { generateValidRucFromRunId, apiContextAsAprobador } from './helpers/test-data';

type ApiEnvelope<T> = { success?: boolean; data?: T; message?: string; error?: string };

const runId = Date.now().toString().slice(-9);
const apiBaseURL = process.env.E2E_API_ORIGIN || 'http://localhost:13002';
const api = (route: string) => `/api${route}`;
const periodoYear = 2030 + Number(runId.slice(-2)) % 20;
const periodoMonth = String((Number(runId.slice(-4, -2)) % 12) + 1).padStart(2, '0');
const periodoSire = `${periodoYear}-${periodoMonth}`;

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

async function authContext(page: Page): Promise<{ headers: Record<string, string>; tenantId: string }> {
  const accessToken = (await page.context().cookies()).find((cookie) => cookie.name === 'access_token')?.value;
  expect(accessToken, 'la sesión E2E debe tener access_token').toBeTruthy();
  const payload = JSON.parse(Buffer.from(accessToken!.split('.')[1], 'base64url').toString('utf8'));
  return { headers: { Authorization: `Bearer ${accessToken}` }, tenantId: payload.tenant_id };
}

function getSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  expect(url, 'SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL requerido para E2E SIRE').toBeTruthy();
  expect(key, 'SUPABASE_SERVICE_ROLE_KEY requerido para E2E SIRE').toBeTruthy();
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

function parseSireRows(content: string) {
  return content.split('\n').slice(1).filter((line) => line.trim()).map((line) => line.split('|'));
}

async function createSaleWithCpe(apiContext: APIRequestContext) {
  const clienteDocumento = runId.slice(-8);
  const cliente = await parseOk<any>(
    await apiContext.post(api('/ventas/clientes'), {
      data: {
        tipo: 'PERSONA',
        documento_tipo: 'DNI',
        documento_numero: clienteDocumento,
        razon_social: `Cliente SIRE T12 ${runId}`,
        direccion: 'Av. SIRE Ventas 1200',
        email: `cliente-sire-${runId}@example.com`,
      },
    }),
    'crear cliente SIRE',
  );

  const almacenes = await parseOk<any[]>(
    await apiContext.get(api('/inventario/almacenes')),
    'listar almacenes venta SIRE',
  );
  expect(almacenes.length, 'SIRE requiere almacén operativo').toBeGreaterThan(0);

  const producto = await parseOk<any>(
    await apiContext.post(api('/inventario/productos'), {
      data: {
        codigo: `SIRE-V-${runId}`,
        nombre: `Producto Venta SIRE ${runId}`,
        categoria: 'AUDITORIA',
        precio_compra: 50,
        precio_venta: 118,
        stock: 4,
        almacen_id: almacenes[0].id,
        stock_minimo: 0,
        controla_stock: true,
      },
    }),
    'crear producto venta SIRE',
  );

  const pedido = await parseOk<any>(
    await apiContext.post(api('/ventas/pedidos'), {
      data: {
        cliente_id: cliente.id,
        detalle: [{
          producto_id: producto.id,
          descripcion: producto.nombre,
          cantidad: 1,
          precio_unitario: 118,
        }],
        notas: 'Venta SIRE T12',
      },
    }),
    'crear pedido SIRE',
  );

  await parseOk<any>(
    await apiContext.post(api(`/ventas/pedidos/${pedido.id}/confirmar`), {
      data: { forzar_confirmacion: false },
    }),
    'confirmar pedido SIRE',
  );

  const documento = await parseOk<any>(
    await apiContext.post(api(`/ventas/pedidos/${pedido.id}/generar-documento`), {
      data: { tipo_documento: '03' },
    }),
    'generar venta con CPE para SIRE',
  );

  expect(documento.cpe?.id, 'la venta debe crear CPE').toBeTruthy();
  return documento;
}

async function createPurchaseWithCxp(apiContext: APIRequestContext) {
  const almacenes = await parseOk<any[]>(await apiContext.get(api('/inventario/almacenes')), 'listar almacenes SIRE');
  expect(almacenes.length, 'debe existir almacén para recepción SIRE').toBeGreaterThan(0);

  const proveedor = await parseOk<any>(
    await apiContext.post(api('/compras/proveedores'), {
      data: {
        ruc: generateValidRucFromRunId(`sire-${runId}`),
        razon_social: `Proveedor SIRE T12 ${runId} S.A.C.`,
        nombre_comercial: `Proveedor SIRE ${runId}`,
        email: `proveedor-sire-${runId}@example.com`,
        direccion: 'Av. SIRE Compras 1200',
        condiciones_pago: 'CREDITO_30',
        dias_credito: 30,
      },
    }),
    'crear proveedor SIRE',
  );

  const producto = await parseOk<any>(
    await apiContext.post(api('/inventario/productos'), {
      data: {
        codigo: `SIRE-C-${runId}`,
        nombre: `Producto Compra SIRE ${runId}`,
        categoria: 'AUDITORIA',
        precio_compra: 200,
        precio_venta: 260,
        stock: 0,
        stock_minimo: 0,
        controla_stock: true,
        almacen_id: almacenes[0].id,
      },
    }),
    'crear producto compra SIRE',
  );

  const orden = await parseOk<any>(
    await apiContext.post(api('/compras/ordenes'), {
      data: {
        numero: `OC-SIRE-${runId}`,
        proveedor_id: proveedor.id,
        fecha_orden: new Date().toISOString(),
        fecha_entrega_esperada: new Date(Date.now() + 86400000).toISOString(),
        condiciones_pago: 'CREDITO_30',
        dias_credito: 30,
        almacen_destino_id: almacenes[0].id,
        estado: 'BORRADOR',
        detalles: [{
          producto_id: producto.id,
          descripcion: producto.nombre,
          cantidad: 1,
          precio_unitario: 200,
        }],
      },
    }),
    'crear orden compra SIRE',
  );
  const detalleId = orden.detalles?.[0]?.id ?? orden.detalle?.[0]?.id;
  expect(detalleId, 'orden SIRE debe devolver detalle').toBeTruthy();

  // SEC-001 fix: aprobador autentica con su propio JWT.
  const aprobadorSireCtx = await apiContextAsAprobador();
  try {
    await parseOk<any>(
      await aprobadorSireCtx.post(api(`/compras/ordenes/${orden.id}/aprobar`), {
        data: { aprobador_nombre: 'Admin SIRE T12', comentarios: 'Aprobación SIRE T12' },
      }),
      'aprobar orden compra SIRE',
    );
  } finally {
    await aprobadorSireCtx.dispose();
  }

  const recepcion = await parseOk<any>(
    await apiContext.post(api(`/compras/recepciones/ordenes/${orden.id}`), {
      data: {
        orden_id: orden.id,
        almacen_id: almacenes[0].id,
        observaciones: 'Recepción SIRE T12',
        items: [{
          detalle_id: detalleId,
          cantidad_recibida: 1,
          calidad: 'OK',
          almacen_id: almacenes[0].id,
        }],
      },
    }),
    'crear recepción SIRE',
  );

  const cerrada = await parseOk<any>(
    await apiContext.post(api(`/compras/recepciones/${recepcion.id}/cerrar`), {
      data: { observaciones: 'Cierre recepción SIRE T12' },
    }),
    'cerrar recepción SIRE',
  );

  return { proveedor, recepcion: cerrada };
}

test.describe('T12 SIRE completo', () => {
  test.setTimeout(180000);

  test('SIRE refleja ventas CPE y compras CxP por periodo, totales, filtros, descarga y envío SUNAT mock', async ({ page }) => {
    const browserFailures = await collectBrowserFailures(page);
    await login(page);
    const { headers, tenantId } = await authContext(page);
    const supabase = getSupabase();
    const apiContext = await playwrightRequest.newContext({
      baseURL: apiBaseURL,
      extraHTTPHeaders: headers,
      storageState: { cookies: [], origins: [] },
    });

    const venta = await createSaleWithCpe(apiContext);
    const compra = await createPurchaseWithCxp(apiContext);

    const fechaVenta = `${periodoSire}-10T12:00:00.000Z`;
    const fechaCompra = `${periodoSire}-11T12:00:00.000Z`;
    const { error: cpeUpdateError } = await supabase
      .from('cpe')
      .update({ fecha_emision: fechaVenta })
      .eq('id', venta.cpe.id)
      .eq('tenant_id', tenantId);
    expect(cpeUpdateError?.message || '', 'alinear fecha CPE SIRE').toBe('');

    await expect.poll(async () => {
      const response = await apiContext.get(api(`/finanzas/cxp?proveedor_id=${compra.proveedor.id}`));
      const cxp = await parseOk<any[]>(response, 'listar CxP SIRE');
      return cxp.find((item) => item.referencia_id === compra.recepcion.id || item.numero_documento === compra.recepcion.numero) ?? null;
    }, {
      message: 'la compra debe crear CxP para SIRE',
      timeout: 30000,
    }).not.toBeNull();

    const cxpList = await parseOk<any[]>(
      await apiContext.get(api(`/finanzas/cxp?proveedor_id=${compra.proveedor.id}`)),
      'listar CxP SIRE final',
    );
    const cxp = cxpList.find((item) => item.referencia_id === compra.recepcion.id || item.numero_documento === compra.recepcion.numero);
    expect(cxp?.id, 'CxP de compra SIRE persistida').toBeTruthy();

    const { error: cxpUpdateError } = await supabase
      .from('cuentas_por_pagar')
      .update({
        fecha_emision: fechaCompra,
        fecha_vencimiento: `${periodoSire}-25T12:00:00.000Z`,
      })
      .eq('id', cxp.id)
      .eq('tenant_id', tenantId);
    expect(cxpUpdateError?.message || '', 'alinear fecha CxP SIRE').toBe('');

    const reporteVentas = await parseOk<any>(
      await apiContext.post(api('/sire/generar-reporte'), {
        data: { tipoReporte: 'REGISTRO_VENTAS', periodo: periodoSire },
      }),
      'generar SIRE ventas T12',
    );
    const reporteCompras = await parseOk<any>(
      await apiContext.post(api('/sire/generar-reporte'), {
        data: { tipoReporte: 'REGISTRO_COMPRAS', periodo: periodoSire },
      }),
      'generar SIRE compras T12',
    );
    expect(reporteVentas.id).toBeTruthy();
    expect(reporteCompras.id).toBeTruthy();

    await expect.poll(async () => {
      const response = await apiContext.get(api(`/sire/reportes?periodo=${periodoSire}`));
      const reportes = await parseOk<any[]>(response, 'listar reportes SIRE por periodo');
      return reportes.filter((item) => ['REG_VEN', 'REG_COM'].includes(item.tipo) && ['GENERADO', 'ENVIADO'].includes(item.estado)).length;
    }, {
      message: 'SIRE debe generar reportes de ventas y compras del periodo',
      timeout: 30000,
    }).toBe(2);

    const reportesPeriodo = (await parseOk<any[]>(
      await apiContext.get(api(`/sire/reportes?periodo=${periodoSire}`)),
      'listar reportes SIRE generados',
    )).filter((item) => ['REG_VEN', 'REG_COM'].includes(item.tipo) && ['GENERADO', 'ENVIADO'].includes(item.estado));

    const reporteVentasFinal = reportesPeriodo.find((item) => item.tipo === 'REG_VEN')!;
    const reporteComprasFinal = reportesPeriodo.find((item) => item.tipo === 'REG_COM')!;
    expect(Number(reporteVentasFinal.total_registros), 'SIRE ventas no debe quedar en cero con CPE válido').toBeGreaterThan(0);
    expect(Number(reporteComprasFinal.total_registros), 'SIRE compras no debe quedar en cero con CxP válido').toBeGreaterThan(0);

    const ventasContent = await parseOk<string>(
      await apiContext.get(api(`/sire/reportes/${reporteVentasFinal.id}/download`)),
      'descargar SIRE ventas',
    );
    const comprasContent = await parseOk<string>(
      await apiContext.get(api(`/sire/reportes/${reporteComprasFinal.id}/download`)),
      'descargar SIRE compras',
    );

    const ventaRows = parseSireRows(ventasContent);
    const compraRows = parseSireRows(comprasContent);
    expect(ventaRows.every((row) => row[1]?.startsWith(periodoSire)), 'ventas SIRE no debe mezclar periodos').toBeTruthy();
    expect(compraRows.every((row) => row[1]?.startsWith(periodoSire)), 'compras SIRE no debe mezclar periodos').toBeTruthy();
    expect(ventaRows.some((row) => row[3] === venta.cpe.serie && Number(row[4]) === Number(venta.cpe.numero) && Number(row[9]) > 0)).toBeTruthy();
    expect(compraRows.some((row) => row[2] === cxp.numero_documento && Number(row[6]) > 0)).toBeTruthy();

    const ventasFiltradas = await parseOk<any[]>(
      await apiContext.get(api(`/sire/reportes?periodo=${periodoSire}&tipoReporte=REGISTRO_VENTAS&estado=${reporteVentasFinal.estado}`)),
      'filtrar SIRE por periodo tipo estado',
    );
    expect(ventasFiltradas.every((item) => item.tipo === 'REG_VEN' && item.periodo === periodoSire && item.estado === reporteVentasFinal.estado)).toBeTruthy();

    if (reporteVentasFinal.estado === 'GENERADO') {
      await parseOk<any>(
        await apiContext.post(api(`/sire/reportes/${reporteVentasFinal.id}/enviar-sunat`)),
        'enviar SIRE ventas SUNAT mock',
      );
      const enviados = await parseOk<any[]>(
        await apiContext.get(api(`/sire/reportes?periodo=${periodoSire}&tipoReporte=REGISTRO_VENTAS&estado=ENVIADO`)),
        'listar SIRE enviados',
      );
      expect(enviados.some((item) => item.id === reporteVentasFinal.id)).toBeTruthy();
    }

    const stats = await parseOk<any>(await apiContext.get(api('/sire/stats')), 'stats SIRE');
    expect(stats.registrosTotales, 'stats SIRE debe reflejar registros reales').toBeGreaterThan(0);
    expect(stats.enviadosASunat + stats.pendientes, 'stats SIRE debe reflejar enviados/pendientes').toBeGreaterThan(0);

    await gotoAuthenticated(page, '/dashboard/sire');
    await expect(page.getByRole('heading', { name: /SIRE - Sistema de Registros Electr[oó]nicos/i })).toBeVisible({ timeout: 15000 });
    const periodoInput = page.locator('input[type="month"]');
    await periodoInput.evaluate((node, value) => {
      const input = node as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, periodoSire);
    await expect(periodoInput).toHaveValue(periodoSire);
    await page.getByRole('button', { name: /Actualizar/i }).click();
    await expect(page.locator('td', { hasText: periodoSire }).first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('td', { hasText: /Registro de Ventas|Registro de Compras/i }).first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('body')).not.toContainText(/Cargando reportes SIRE|Application error|Error fatal|Unhandled/i);
    expect(browserFailures).toEqual([]);
  });
});
