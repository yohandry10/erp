import { APIRequestContext, APIResponse, Page, expect, request as playwrightRequest, test } from '@playwright/test';
import { gotoAuthenticated, login } from './helpers/auth';

type ApiEnvelope<T> = { success?: boolean; data?: T; message?: string; error?: string };

const runId = Date.now().toString().slice(-9);
const clienteDocumento = runId.slice(-8);
const productoCodigo = `T07-${runId}`;
const cantidadInicial = 8;
const cantidadVenta = 3;
const apiBaseURL = process.env.E2E_API_ORIGIN || 'http://localhost:13002';
const api = (path: string) => `/api${path}`;

function unwrap<T>(payload: ApiEnvelope<T> | T): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as ApiEnvelope<T>).data as T;
  }
  return payload as T;
}

async function parseOk<T>(response: APIResponse, label: string): Promise<T> {
  expect(response.ok(), `${label} debe responder 2xx, status=${response.status()}: ${await response.text()}`).toBeTruthy();
  const body = (await response.json()) as ApiEnvelope<T> | T;
  if (body && typeof body === 'object' && 'success' in body) {
    expect((body as ApiEnvelope<T>).success, `${label} debe devolver success=true`).not.toBe(false);
  }
  return unwrap<T>(body);
}

async function expectStatus(response: APIResponse, expected: number, label: string): Promise<void> {
  expect(response.status(), `${label}: ${await response.text()}`).toBe(expected);
}

async function authHeaders(page: Page): Promise<Record<string, string>> {
  const accessToken = (await page.context().cookies()).find((cookie) => cookie.name === 'access_token')?.value;
  expect(accessToken, 'la sesión E2E debe tener access_token').toBeTruthy();
  return { Authorization: `Bearer ${accessToken}` };
}

async function getProducto(apiContext: APIRequestContext, productoId: string): Promise<any> {
  const response = await apiContext.get(api('/inventario/productos'));
  const productos = await parseOk<any[]>(response, 'listar productos');
  const producto = productos.find((item) => item.id === productoId);
  expect(producto, 'el producto creado debe existir en inventario').toBeTruthy();
  return producto;
}

async function collectBrowserFailures(page: Page) {
  const failures: string[] = [];

  page.on('pageerror', (error) => {
    failures.push(`pageerror: ${error.message}`);
  });

  page.on('console', (message) => {
    if (message.type() === 'error') {
      failures.push(`console: ${message.text()}`);
    }
  });

  page.on('response', (response) => {
    const url = response.url();
    const status = response.status();
    if (status >= 500 || (status === 404 && /\/(_next|dashboard|api)\//.test(url))) {
      failures.push(`network: ${status} ${url}`);
    }
  });

  return failures;
}

test.describe('T07 Ventas vertical completo', () => {
  test.setTimeout(600000);

  test('venta real atraviesa cliente, cotizacion, pedido, inventario, CPE, CxC, contabilidad y SIRE', async ({ page }) => {
    const browserFailures = await collectBrowserFailures(page);
    await login(page);
    const headers = await authHeaders(page);

    const apiContext = await playwrightRequest.newContext({
      baseURL: apiBaseURL,
      extraHTTPHeaders: headers,
      storageState: { cookies: [], origins: [] },
    });

    const cliente = await parseOk<any>(
      await apiContext.post(api('/ventas/clientes'), {
        data: {
          tipo: 'PERSONA',
          documento_tipo: 'DNI',
          documento_numero: clienteDocumento,
          razon_social: `Cliente Ventas T07 ${runId}`,
          direccion: 'Av. Ventas Audit 777',
          email: `cliente-t07-${runId}@example.com`,
          telefono: '999777555',
        },
      }),
      'crear cliente',
    );
    expect(cliente.id).toBeTruthy();

    const almacenes = await parseOk<any[]>(
      await apiContext.get(api('/inventario/almacenes')),
      'listar almacenes para producto de venta',
    );
    expect(almacenes.length, 'debe existir al menos un almacén operativo').toBeGreaterThan(0);

    const producto = await parseOk<any>(
      await apiContext.post(api('/inventario/productos'), {
        data: {
          codigo: productoCodigo,
          nombre: `Producto Ventas T07 ${runId}`,
          categoria: 'AUDITORIA',
          precio_compra: 30,
          precio_venta: 90,
          stock: cantidadInicial,
          almacen_id: almacenes[0].id,
          stock_minimo: 0,
          controla_stock: true,
        },
      }),
      'crear producto con stock',
    );
    expect(Number(producto.stock_actual)).toBe(cantidadInicial);

    const cotizacion = await parseOk<any>(
      await apiContext.post(api('/ventas/cotizaciones'), {
        data: {
          cliente_id: cliente.id,
          fecha_vencimiento: new Date(Date.now() + 7 * 86400000).toISOString(),
          notas: 'Cotización T07 vertical',
          detalle: [
            {
              producto_id: producto.id,
              descripcion: producto.nombre,
              cantidad: cantidadVenta,
              precio_unitario: 90,
            },
          ],
        },
      }),
      'crear cotización',
    );
    expect(cotizacion.id).toBeTruthy();

    const expiredCotizacion = await parseOk<any>(
      await apiContext.post(api('/ventas/cotizaciones'), {
        data: {
          cliente_id: cliente.id,
          fecha_vencimiento: new Date(Date.now() - 86400000).toISOString(),
          notas: 'Cotización vencida T07',
          detalle: [
            {
              producto_id: producto.id,
              descripcion: producto.nombre,
              cantidad: 1,
              precio_unitario: 90,
            },
          ],
        },
      }),
      'crear cotización vencida',
    );

    await expectStatus(
      await apiContext.post(api(`/ventas/cotizaciones/${expiredCotizacion.id}/convertir-pedido`), {
        data: { notas: 'No debe convertir vencida' },
      }),
      400,
      'no debe convertir cotización vencida',
    );

    const conversion = await parseOk<any>(
      await apiContext.post(api(`/ventas/cotizaciones/${cotizacion.id}/convertir-pedido`), {
        data: { notas: 'Conversión T07' },
      }),
      'convertir cotización a pedido',
    );
    expect(conversion.pedido_id, 'la conversión debe devolver pedido_id real').toBeTruthy();

    const pedido = await parseOk<any>(
      await apiContext.get(api(`/ventas/pedidos/${conversion.pedido_id}`)),
      'obtener pedido convertido',
    );
    expect(pedido.cotizacion_id).toBe(cotizacion.id);
    expect(pedido.detalle?.[0]?.producto_id).toBe(producto.id);

    await expectStatus(
      await apiContext.post(api('/ventas/pedidos'), {
        data: {
          cliente_id: cliente.id,
          detalle: [
            {
              producto_id: producto.id,
              descripcion: producto.nombre,
              cantidad: cantidadInicial + 1,
              precio_unitario: 90,
            },
          ],
          notas: 'Pedido sin stock T07',
        },
      }),
      400,
      'no debe vender sin stock suficiente',
    );

    const confirmado = await parseOk<any>(
      await apiContext.post(api(`/ventas/pedidos/${pedido.id}/confirmar`), {
        data: { forzar_confirmacion: false },
      }),
      'confirmar pedido',
    );
    expect(confirmado.success).toBe(true);

    const stockTrasConfirmar = Number((await getProducto(apiContext, producto.id)).stock_actual || 0);
    expect(stockTrasConfirmar, 'confirmar no debe descontar stock real antes de facturar').toBe(cantidadInicial);

    const documento = await parseOk<any>(
      await apiContext.post(api(`/ventas/pedidos/${pedido.id}/generar-documento`), {
        data: { tipo_documento: '03' },
      }),
      'generar documento/CPE/CxC',
    );
    expect(documento.documento?.id, 'debe crear documento fiscal').toBeTruthy();
    expect(documento.cpe?.id, 'debe crear CPE').toBeTruthy();
    expect(documento.cxc?.id, 'debe crear CxC').toBeTruthy();
    const referenciaDocumento = `${documento.documento.serie}-${documento.documento.numero}`;

    await expectStatus(
      await apiContext.post(api(`/ventas/pedidos/${pedido.id}/generar-documento`), {
        data: { tipo_documento: '03' },
      }),
      400,
      'no debe duplicar venta/documento por doble click',
    );

    await expect.poll(async () => Number((await getProducto(apiContext, producto.id)).stock_actual || 0), {
      message: 'facturar debe descontar stock',
      timeout: 30000,
    }).toBe(cantidadInicial - cantidadVenta);

    const movimientos = await parseOk<any[]>(
      await apiContext.get(api('/inventario/movimientos?limit=100')),
      'listar movimientos inventario',
    );
    const salidasPedido = movimientos.filter(
      (mov) =>
        mov.producto_id === producto.id &&
        mov.referencia_id === pedido.id &&
        /PEDIDO/i.test(`${mov.referencia_tipo ?? ''}`) &&
        /SALIDA/i.test(`${mov.tipo ?? mov.tipo_movimiento ?? ''}`),
    );
    expect(salidasPedido.length, 'la venta debe registrar una sola salida de inventario').toBe(1);

    const kardex = await parseOk<any[]>(
      await apiContext.get(api(`/inventario/kardex?productoId=${producto.id}&limit=20`)),
      'consultar kardex',
    );
    expect(
      kardex.some((mov) => /SALIDA/i.test(`${mov.tipo ?? mov.tipoMovimiento ?? mov.tipo_movimiento ?? ''}`) && Number(mov.cantidad) === cantidadVenta),
      'Kardex debe incluir la salida de venta',
    ).toBeTruthy();

    const cxcList = await parseOk<any[]>(
      await apiContext.get(api(`/finanzas/cxc?cliente_id=${cliente.id}`)),
      'listar CxC de cliente',
    );
    expect(cxcList.some((cxc) => cxc.id === documento.cxc.id || cxc.documento_id === documento.documento.id)).toBeTruthy();

    await expect.poll(async () => {
      const response = await apiContext.get(api(`/contabilidad/asientos?referencia=${encodeURIComponent(referenciaDocumento)}`));
      const asientos = await parseOk<any[]>(response, 'listar asientos por referencia');
      return asientos.length;
    }, {
      message: 'la venta/CxC debe generar asiento contable',
      timeout: 90000,
    }).toBeGreaterThan(0);

    const sire = await parseOk<any>(
      await apiContext.post(api('/sire/generar-reporte'), {
        data: {
          tipoReporte: 'REGISTRO_VENTAS',
          periodo: new Date().toISOString().slice(0, 7),
        },
      }),
      'generar SIRE ventas',
    );
    expect(sire.id, 'SIRE debe crear o reutilizar reporte de ventas').toBeTruthy();

    const clientesSearch = await parseOk<any[]>(
      await apiContext.get(api(`/ventas/clientes?search=${clienteDocumento}`)),
      'buscar cliente',
    );
    expect(clientesSearch.some((item) => item.id === cliente.id)).toBeTruthy();

    const pedidosSearch = await parseOk<any[]>(
      await apiContext.get(api(`/ventas/pedidos?search=${encodeURIComponent(pedido.numero)}`)),
      'buscar pedido',
    );
    expect(pedidosSearch.some((item) => item.id === pedido.id)).toBeTruthy();

    await gotoAuthenticated(page, `/dashboard/ventas/clientes/${cliente.id}`);
    await expect(page.getByText(cliente.razon_social, { exact: false })).toBeVisible({ timeout: 15000 });

    await gotoAuthenticated(page, `/dashboard/ventas/cotizaciones/${cotizacion.id}`);
    await expect(page.getByText(cotizacion.numero, { exact: false })).toBeVisible({ timeout: 15000 });

    await gotoAuthenticated(page, `/dashboard/ventas/pedidos/${pedido.id}`);
    await expect(page.getByText(pedido.numero, { exact: false })).toBeVisible({ timeout: 15000 });

    await gotoAuthenticated(page, '/dashboard/ventas/pedidos');
    await expect(page.getByText(pedido.numero, { exact: false })).toBeVisible({ timeout: 15000 });

    await expect(page.locator('body')).not.toContainText(/Cargando|Error fatal|Unhandled|Application error/i);
    expect(browserFailures).toEqual([]);
  });
});
