import { APIRequestContext, APIResponse, Page, expect, request as playwrightRequest, test } from '@playwright/test';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { gotoAuthenticated, login } from './helpers/auth';
import { generateValidRucFromRunId, apiContextAsAprobador } from './helpers/test-data';

type ApiEnvelope<T> = { success?: boolean; data?: T; message?: string; error?: any };

const runId = Date.now().toString().slice(-9);
const apiBaseURL = process.env.E2E_API_ORIGIN || 'http://localhost:13002';
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

async function expectStatus(response: APIResponse, expected: number, label: string): Promise<void> {
  const text = await response.text();
  expect(response.status(), `${label}: ${text}`).toBe(expected);
}

async function expectStatusIn(response: APIResponse, expected: number[], label: string): Promise<void> {
  const text = await response.text();
  expect(expected, `${label}: ${text}`).toContain(response.status());
}

async function parseBody(response: APIResponse): Promise<any> {
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

async function authContext(page: Page): Promise<{ headers: Record<string, string>; tenantId: string; userId: string }> {
  const accessToken = (await page.context().cookies()).find((cookie) => cookie.name === 'access_token')?.value;
  expect(accessToken, 'la sesión E2E debe tener access_token').toBeTruthy();
  const payload = JSON.parse(Buffer.from(accessToken!.split('.')[1], 'base64url').toString('utf8'));
  expect(payload.tenant_id, 'el JWT debe incluir tenant_id').toBeTruthy();
  return {
    headers: { Authorization: `Bearer ${accessToken}` },
    tenantId: payload.tenant_id,
    userId: payload.sub || payload.user_id || 'e2e',
  };
}

function getSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  expect(url, 'SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL requerido para E2E inventario').toBeTruthy();
  expect(key, 'SUPABASE_SERVICE_ROLE_KEY requerido para E2E inventario').toBeTruthy();
  return createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function setLogisticaConfig(
  supabase: SupabaseClient,
  apiContext: APIRequestContext,
  tenantId: string,
  values: {
    usar_flujo_logistica: boolean;
    habilitar_multialmacen: boolean;
    requiere_ubicaciones_inventario: boolean;
    requiere_lotes_series: boolean;
  },
) {
  const { error } = await supabase
    .from('empresa_config')
    .update(values)
    .eq('tenant_id', tenantId);
  expect(error?.message || '', 'actualizar configuración logística').toBe('');
  await parseOk(
    await apiContext.put(api('/configuration/empresa'), {
      headers: { 'Idempotency-Key': `configuration-logistics-${runId}` },
      data: { usar_flujo_logistica: values.usar_flujo_logistica },
    }),
    'invalidar configuración logística mediante API',
  );
}

async function getProducto(apiContext: APIRequestContext, productoId: string): Promise<any> {
  const productos = await parseOk<any[]>(
    await apiContext.get(api('/inventario/productos?includeSucursal=true')),
    'listar productos inventario',
  );
  const producto = productos.find((item) => item.id === productoId);
  expect(producto, 'producto creado debe existir en inventario').toBeTruthy();
  return producto;
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

test.describe('T09 Inventario y logística', () => {
  test.setTimeout(600000);

  test('inventario refleja compras, POS y despacho logístico con Kardex y estados UI claros', async ({ page }) => {
    const browserFailures = await collectBrowserFailures(page);
    await login(page);
    const { headers, tenantId } = await authContext(page);
    const supabase = getSupabase();
    const apiContext = await playwrightRequest.newContext({
      baseURL: apiBaseURL,
      extraHTTPHeaders: headers,
      storageState: { cookies: [], origins: [] },
    });

    const { data: originalConfig, error: configError } = await supabase
      .from('empresa_config')
      .select('usar_flujo_logistica, habilitar_multialmacen, requiere_ubicaciones_inventario, requiere_lotes_series')
      .eq('tenant_id', tenantId)
      .single();
    expect(configError?.message || '', 'leer configuración logística original').toBe('');

    try {
      const almacenes = await parseOk<any[]>(
        await apiContext.get(api('/inventario/almacenes')),
        'listar almacenes',
      );
      expect(almacenes.length, 'debe existir al menos un almacén operativo').toBeGreaterThan(0);
      const almacenId = almacenes[0].id;

      await setLogisticaConfig(supabase, apiContext, tenantId, {
        usar_flujo_logistica: false,
        habilitar_multialmacen: false,
        requiere_ubicaciones_inventario: false,
        requiere_lotes_series: false,
      });

      const ordenesDisabled = await parseOk<any[]>(
        await apiContext.get(api('/inventario/logistica/ordenes-pendientes')),
        'listar órdenes pendientes con logística deshabilitada',
      );
      expect(ordenesDisabled, 'logística deshabilitada debe devolver lista vacía controlada').toEqual([]);

      await gotoAuthenticated(page, '/dashboard/inventario/logistica/ordenes-pendientes');
      // El provider de configuración vive en el layout del dashboard. La
      // mutación de prueba se hace por service role y no emite la invalidación
      // que sí ejecuta el endpoint de configuración, por lo que recargamos para
      // comprobar el estado persistido real.
      await page.reload({ waitUntil: 'domcontentloaded' });
      // La UI muestra el componente LogisticsDisabledState con título
      // "Activa logística para preparar pedidos". El test buscaba texto literal
      // "Flujo de logística desactivado" que no existe — fix de regex.
      await expect(page.getByText(/Activa logística|Activar flujo logístico|flujo logístico/i).first()).toBeVisible({ timeout: 15000 });
      await expect(page.locator('body')).not.toContainText(/Application error|Unhandled|Error fatal/i);

      await setLogisticaConfig(supabase, apiContext, tenantId, {
        usar_flujo_logistica: true,
        habilitar_multialmacen: false,
        requiere_ubicaciones_inventario: false,
        requiere_lotes_series: false,
      });

      const proveedor = await parseOk<any>(
        await apiContext.post(api('/compras/proveedores'), {
          data: {
            ruc: generateValidRucFromRunId(`inv-${runId}`),
            razon_social: `Proveedor Inventario T09 ${runId}`,
            email: `proveedor-t09-${runId}@example.com`,
            telefono: '999111222',
            direccion: 'Av. Inventario 900',
            condiciones_pago: 'CREDITO_30',
            dias_credito: 30,
          },
        }),
        'crear proveedor T09',
      );

      const producto = await parseOk<any>(
        await apiContext.post(api('/inventario/productos'), {
          data: {
            codigo: `T09-${runId}`,
            nombre: `Producto Inventario T09 ${runId}`,
            categoria: 'AUDITORIA',
            precio_compra: 25,
            precio_venta: 55,
            stock: 0,
            stock_minimo: 0,
            controla_stock: true,
            almacen_id: almacenId,
          },
        }),
        'crear producto T09',
      );
      expect(Number(producto.stock_actual)).toBe(0);

      const orden = await parseOk<any>(
        await apiContext.post(api('/compras/ordenes'), {
          data: {
            numero: `OC-T09-${runId}`,
            proveedor_id: proveedor.id,
            fecha_orden: new Date().toISOString(),
            fecha_entrega_esperada: new Date(Date.now() + 86400000).toISOString(),
            condiciones_pago: 'CREDITO_30',
            almacen_destino_id: almacenId,
            estado: 'BORRADOR',
            detalles: [{
              producto_id: producto.id,
              descripcion: producto.nombre,
              cantidad: 9,
              precio_unitario: 25,
            }],
          },
        }),
        'crear orden compra T09',
      );
      const detalleOrdenId = orden.detalles?.[0]?.id ?? orden.detalle?.[0]?.id;
      expect(detalleOrdenId, 'orden debe devolver detalle para recepción').toBeTruthy();

      // Segregación de funciones (SEC-001 fix): el aprobador autentica con su
      // propio JWT. aprobador_id ya no se acepta en el body.
      const aprobadorCtx = await apiContextAsAprobador();
      try {
        await parseOk<any>(
          await aprobadorCtx.post(api(`/compras/ordenes/${orden.id}/aprobar`), {
            data: {
              aprobador_nombre: 'Admin T09',
              comentarios: 'Aprobación inventario T09',
            },
          }),
          'aprobar orden T09',
        );
      } finally {
        await aprobadorCtx.dispose();
      }

      const recepcionBorrador = await parseOk<any>(
        await apiContext.post(api(`/compras/recepciones/ordenes/${orden.id}`), {
          data: {
            orden_id: orden.id,
            idempotency_key: `recepcion:${runId}:inventario`,
            almacen_id: almacenId,
            observaciones: 'Recepción inventario T09',
            items: [{
              detalle_id: detalleOrdenId,
              cantidad_recibida: 9,
              calidad: 'OK',
              almacen_id: almacenId,
              lote: `LT-T09-${runId}`,
            }],
          },
        }),
        'crear recepción T09',
      );
      const recepcionItem = recepcionBorrador.items?.[0];
      expect(recepcionItem?.id, 'recepción debe devolver item').toBeTruthy();

      const recepcion = await parseOk<any>(
        await apiContext.post(api(`/compras/recepciones/${recepcionBorrador.id}/cerrar`), {
          data: { observaciones: 'Cierre recepción inventario T09' },
        }),
        'cerrar recepción T09',
      );
      expect(recepcion.estado).toBe('CERRADA');

      await expect.poll(async () => Number((await getProducto(apiContext, producto.id)).stock_actual || 0), {
        message: 'recepción debe incrementar stock',
        timeout: 30000,
      }).toBe(9);

      const kardexEntrada = await parseOk<any[]>(
        await apiContext.get(api(`/inventario/kardex?productoId=${producto.id}&limit=30`)),
        'kardex tras recepción',
      );
      expect(kardexEntrada.some((mov) => Number(mov.cantidad) === 9 && /ENTRADA/i.test(`${mov.tipo ?? mov.tipoMovimiento ?? ''}`))).toBeTruthy();

      const devolucion = await parseOk<any>(
        await apiContext.post(api('/compras/devoluciones'), {
          data: {
            recepcion_id: recepcion.id,
            orden_id: orden.id,
            proveedor_id: proveedor.id,
            motivo: 'DEFECTUOSO',
            observaciones: 'Devolución inventario T09',
            items: [{
              recepcion_item_id: recepcionItem.id,
              producto_id: producto.id,
              descripcion: producto.nombre,
              cantidad: 2,
              precio_unitario: 25,
              almacen_id: almacenId,
              motivo_detalle: 'Prueba T09',
            }],
          },
        }),
        'crear devolución compra T09',
      );
      await parseOk<any>(
        await apiContext.post(api(`/compras/devoluciones/${devolucion.id}/emitir`)),
        'emitir devolución compra T09',
      );

      await expect.poll(async () => Number((await getProducto(apiContext, producto.id)).stock_actual || 0), {
        message: 'devolución de compra debe reducir stock',
        timeout: 30000,
      }).toBe(7);

      const cliente = await parseOk<any>(
        await apiContext.post(api('/ventas/clientes'), {
          data: {
            tipo: 'PERSONA',
            documento_tipo: 'DNI',
            documento_numero: runId.slice(-8),
            razon_social: `Cliente Inventario T09 ${runId}`,
            direccion: 'Av. Logística 901',
            email: `cliente-t09-${runId}@example.com`,
          },
        }),
        'crear cliente T09',
      );

      await expectStatus(
        await apiContext.post(api('/ventas/pedidos'), {
          data: {
            cliente_id: cliente.id,
            detalle: [{
              producto_id: producto.id,
              descripcion: producto.nombre,
              cantidad: 8,
              precio_unitario: 55,
            }],
            notas: 'Pedido sin stock T09',
          },
        }),
        400,
        'no debe permitir pedido con stock insuficiente',
      );

      const pedido = await parseOk<any>(
        await apiContext.post(api('/ventas/pedidos'), {
          data: {
            cliente_id: cliente.id,
            detalle: [{
              producto_id: producto.id,
              descripcion: producto.nombre,
              cantidad: 3,
              precio_unitario: 55,
            }],
            notas: 'Pedido logística T09',
          },
        }),
        'crear pedido logística T09',
      );
      const pedidoDetalleId = pedido.detalle?.[0]?.id ?? pedido.detalles?.[0]?.id;
      expect(pedidoDetalleId, 'pedido debe devolver detalle para logística').toBeTruthy();

      await parseOk<any>(
        await apiContext.post(api(`/ventas/pedidos/${pedido.id}/confirmar`), {
          data: {},
        }),
        'confirmar pedido T09',
      );

      const pendientes = await parseOk<any[]>(
        await apiContext.get(api('/inventario/logistica/ordenes-pendientes')),
        'listar órdenes de preparación',
      );
      expect(pendientes.some((item) => item.id === pedido.id)).toBeTruthy();

      await expectStatus(
        await apiContext.post(api(`/inventario/logistica/${pedido.id}/confirmar-despacho`), {
          data: { almacen_id: almacenId, items_despachados: [{ detalle_id: pedidoDetalleId, cantidad: 3 }] },
        }),
        400,
        'no debe despachar pedido sin preparación/listo',
      );

      await parseOk<any>(
        await apiContext.post(api(`/inventario/logistica/${pedido.id}/preparar`), {
          data: { notas: 'Preparación T09', responsable: 'Admin T09' },
        }),
        'preparar pedido T09',
      );

      await parseOk<any>(
        await apiContext.post(api(`/inventario/logistica/${pedido.id}/marcar-listo`)),
        'marcar listo despacho T09',
      );

      const listos = await parseOk<any[]>(
        await apiContext.get(api('/inventario/logistica/listo-despacho')),
        'listar listo para despacho',
      );
      expect(listos.some((item) => item.id === pedido.id)).toBeTruthy();

      const invalidUuid = '00000000-0000-4000-8000-000000000009';
      await setLogisticaConfig(supabase, apiContext, tenantId, {
        usar_flujo_logistica: true,
        habilitar_multialmacen: true,
        requiere_ubicaciones_inventario: false,
        requiere_lotes_series: false,
      });
      await expectStatusIn(
        await apiContext.post(api(`/inventario/logistica/${pedido.id}/confirmar-despacho`), {
          data: { almacen_id: invalidUuid, items_despachados: [{ detalle_id: pedidoDetalleId, cantidad: 3 }] },
        }),
        [400, 404],
        'no debe mover stock desde almacén inválido',
      );
      await setLogisticaConfig(supabase, apiContext, tenantId, {
        usar_flujo_logistica: true,
        habilitar_multialmacen: false,
        requiere_ubicaciones_inventario: false,
        requiere_lotes_series: false,
      });

      await parseOk<any>(
        await apiContext.post(api(`/inventario/logistica/${pedido.id}/confirmar-despacho`), {
          data: {
            almacen_id: almacenId,
            items_despachados: [{ detalle_id: pedidoDetalleId, cantidad: 3 }],
            notas: 'Despacho T09',
          },
        }),
        'confirmar despacho T09',
      );

      await expect.poll(async () => Number((await getProducto(apiContext, producto.id)).stock_actual || 0), {
        message: 'despacho debe reducir stock real',
        timeout: 30000,
      }).toBe(4);

      const movimientos = await parseOk<any[]>(
        await apiContext.get(api('/inventario/movimientos?limit=150')),
        'listar movimientos inventario T09',
      );
      expect(movimientos.some((mov) => mov.producto_id === producto.id && /DEVOLUCION_PROVEEDOR/i.test(`${mov.referencia_tipo ?? mov.motivo ?? ''}`))).toBeTruthy();
      expect(movimientos.some((mov) => mov.producto_id === producto.id && mov.referencia_id === pedido.id && /SALIDA/i.test(`${mov.tipo ?? ''}`))).toBeTruthy();

      const kardexFinal = await parseOk<any[]>(
        await apiContext.get(api(`/inventario/kardex?productoId=${producto.id}&limit=50`)),
        'kardex final T09',
      );
      expect(kardexFinal.some((mov) => Number(mov.cantidad) === 2 && /SALIDA/i.test(`${mov.tipo ?? mov.tipoMovimiento ?? ''}`))).toBeTruthy();
      expect(kardexFinal.some((mov) => Number(mov.cantidad) === 3 && /SALIDA/i.test(`${mov.tipo ?? mov.tipoMovimiento ?? ''}`))).toBeTruthy();

      const stats = await parseOk<any>(
        await apiContext.get(api('/inventario/stats')),
        'resumen inventario',
      );
      expect(Number(stats.totalProductos ?? stats.productos ?? 0)).toBeGreaterThan(0);

      const { data: existencias, error: existenciasError } = await supabase
        .from('producto_existencias')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('producto_id', producto.id)
        .eq('almacen_id', almacenId);
      expect(existenciasError?.message || '', 'consultar stock por almacén').toBe('');
      expect(Array.isArray(existencias), 'stock por almacén debe ser consultable').toBeTruthy();

      for (const route of [
        '/dashboard/inventario',
        '/dashboard/inventario/almacenes',
        '/dashboard/inventario/recepciones',
        '/dashboard/inventario/kardex',
        '/dashboard/inventario/logistica/ordenes-pendientes',
        '/dashboard/inventario/logistica/listo-despacho',
      ]) {
        await gotoAuthenticated(page, route);
        const body = page.locator('body');
        await expect(body).not.toHaveText(/^\s*$/);
        await expect(body).not.toContainText(/Application error|Unhandled|Error fatal/i);
        await expect(body).not.toContainText(/Cargando país configurado|Cargando pais configurado/i);
      }

      expect(browserFailures).toEqual([]);
    } finally {
      if (originalConfig) {
        await setLogisticaConfig(supabase, apiContext, tenantId, {
          usar_flujo_logistica: Boolean(originalConfig.usar_flujo_logistica),
          habilitar_multialmacen: Boolean(originalConfig.habilitar_multialmacen),
          requiere_ubicaciones_inventario: Boolean(originalConfig.requiere_ubicaciones_inventario),
          requiere_lotes_series: Boolean(originalConfig.requiere_lotes_series),
        });
      }
      await apiContext.dispose();
    }
  });
});
