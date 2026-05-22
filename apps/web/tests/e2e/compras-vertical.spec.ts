import { expect, test, APIResponse, Page, request as playwrightRequest, APIRequestContext } from '@playwright/test';
import { login, gotoAuthenticated } from './helpers/auth';
import { generateValidRucFromRunId, getAprobadorUserId } from './helpers/test-data';

type ApiEnvelope<T> = { success?: boolean; data?: T; message?: string; error?: string };

const runId = Date.now().toString().slice(-9);
// RUC válido SUNAT (módulo 11). El backend rechaza checksums inválidos —
// generar uno random sin calcular el dígito hacía fallar el test en ~91% de
// los runs. Helper espeja el algoritmo del backend.
const proveedorRuc = generateValidRucFromRunId(runId);
const ordenNumero = `OC-T06-${runId}`;
const productoCodigo = `T06-${runId}`;
const cantidadCompra = 6;
const cantidadDevolucion = 2;
const apiBaseURL = process.env.E2E_API_ORIGIN || 'http://localhost:13002';
const api = (path: string) => `/api${path}`;

function unwrap<T>(payload: ApiEnvelope<T> | T): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as ApiEnvelope<T>).data as T;
  }
  return payload as T;
}

async function parseOk<T>(response: APIResponse, label: string): Promise<T> {
  expect(response.ok(), `${label} debe responder 2xx, status=${response.status()}`).toBeTruthy();
  const body = (await response.json()) as ApiEnvelope<T> | T;
  if (body && typeof body === 'object' && 'success' in body) {
    expect((body as ApiEnvelope<T>).success, `${label} debe devolver success=true`).not.toBe(false);
  }
  return unwrap<T>(body);
}

async function expectStatus(response: APIResponse, expected: number, label: string): Promise<void> {
  expect(response.status(), label).toBe(expected);
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

test.describe('T06 Compras vertical completo', () => {
  test('compra real impacta inventario, kardex, CxP, SIRE y devolucion ajusta stock sin duplicar salida', async ({ page }) => {
    const browserFailures = await collectBrowserFailures(page);
    await login(page);
    const headers = await authHeaders(page);
    const apiContext = await playwrightRequest.newContext({
      baseURL: apiBaseURL,
      extraHTTPHeaders: headers,
      storageState: { cookies: [], origins: [] },
    });

    const almacenesResponse = await apiContext.get(api('/inventario/almacenes'));
    const almacenes = await parseOk<any[]>(almacenesResponse, 'listar almacenes');
    expect(almacenes.length, 'debe existir al menos un almacén operativo para recepcionar').toBeGreaterThan(0);
    const almacenId = almacenes[0].id;

    const proveedor = await parseOk<any>(
      await apiContext.post(api('/compras/proveedores'), {
        data: {
          ruc: proveedorRuc,
          razon_social: `Proveedor T06 ${runId} S.A.C.`,
          nombre_comercial: `Proveedor T06 ${runId}`,
          email: `proveedor-t06-${runId}@example.com`,
          telefono: '999888777',
          direccion: 'Av. Auditoria T06 123',
          contacto: 'Auditor Compras',
          condiciones_pago: 'CREDITO_30',
          dias_credito: 30,
          limite_credito: 50000,
        },
      }),
      'crear proveedor',
    );
    expect(proveedor.id).toBeTruthy();

    const producto = await parseOk<any>(
      await apiContext.post(api('/inventario/productos'), {
        data: {
          codigo: productoCodigo,
          nombre: `Producto Compras T06 ${runId}`,
          categoria: 'AUDITORIA',
          precio_compra: 42,
          precio_venta: 75,
          stock: 0,
          stock_minimo: 0,
          controla_stock: true,
          almacen_id: almacenId,
        },
      }),
      'crear producto',
    );
    expect(producto.id).toBeTruthy();

    const orden = await parseOk<any>(
      await apiContext.post(api('/compras/ordenes'), {
        data: {
          numero: ordenNumero,
          proveedor_id: proveedor.id,
          fecha_orden: new Date().toISOString(),
          fecha_entrega_esperada: new Date(Date.now() + 86400000).toISOString(),
          condiciones_pago: 'CREDITO_30',
          dias_credito: 30,
          almacen_destino_id: almacenId,
          estado: 'BORRADOR',
          observaciones: 'T06 compra vertical',
          detalles: [
            {
              producto_id: producto.id,
              descripcion: producto.nombre,
              cantidad: cantidadCompra,
              precio_unitario: 42,
            },
          ],
        },
      }),
      'crear orden de compra',
    );
    expect(orden.estado).toMatch(/BORRADOR|PENDIENTE|APROBACION|APROBADA/i);
    const detalleId = orden.detalles?.[0]?.id ?? orden.detalle?.[0]?.id;
    expect(detalleId, 'la orden debe devolver el detalle creado para recepcionar').toBeTruthy();

    // Segregación de funciones: el creador NO puede aprobar. Tomamos un user
    // distinto del tenant (creado por el demo seed como "aprobador-...").
    const aprobadorId = await getAprobadorUserId(apiContext);
    const aprobada = await parseOk<any>(
      await apiContext.post(api(`/compras/ordenes/${orden.id}/aprobar`), {
        data: {
          aprobador_id: aprobadorId,
          aprobador_nombre: 'Admin Auditor T06',
          comentarios: 'Aprobación funcional T06',
        },
      }),
      'aprobar orden de compra',
    );
    expect(aprobada.estado).toBe('APROBADA');

    await expectStatus(
      await apiContext.post(api(`/compras/recepciones/ordenes/${orden.id}`), {
        data: {
          orden_id: orden.id,
          almacen_id: almacenId,
          items: [
            {
              detalle_id: detalleId,
              cantidad_recibida: cantidadCompra + 1,
              calidad: 'OK',
              almacen_id: almacenId,
            },
          ],
        },
      }),
      400,
      'no debe recibir mas cantidad que la ordenada',
    );

    const recepcionBorrador = await parseOk<any>(
      await apiContext.post(api(`/compras/recepciones/ordenes/${orden.id}`), {
        data: {
          orden_id: orden.id,
          almacen_id: almacenId,
          observaciones: 'Recepción T06',
          items: [
            {
              detalle_id: detalleId,
              cantidad_recibida: cantidadCompra,
              calidad: 'OK',
              almacen_id: almacenId,
              lote: `LT-${runId}`,
            },
          ],
        },
      }),
      'crear recepcion',
    );
    expect(recepcionBorrador.estado).toBe('BORRADOR');
    const recepcionItem = recepcionBorrador.items?.[0];
    expect(recepcionItem?.id, 'la recepcion debe devolver item para devolución').toBeTruthy();

    const recepcionCerrada = await parseOk<any>(
      await apiContext.post(api(`/compras/recepciones/${recepcionBorrador.id}/cerrar`), {
        data: { observaciones: 'Cierre T06' },
      }),
      'cerrar recepcion',
    );
    expect(recepcionCerrada.estado).toBe('CERRADA');

    await expect.poll(async () => Number((await getProducto(apiContext, producto.id)).stock_actual || 0), {
      message: 'la recepción debe incrementar stock',
      timeout: 30000,
    }).toBe(cantidadCompra);

    const kardex = await parseOk<any[]>(
      await apiContext.get(api(`/inventario/kardex?productoId=${producto.id}&limit=20`)),
      'consultar kardex',
    );
    expect(kardex.some((mov) => mov.recepcionId === recepcionCerrada.id && mov.cantidad === cantidadCompra)).toBeTruthy();

    await expect.poll(async () => {
      const response = await apiContext.get(api(`/finanzas/cxp?proveedor_id=${proveedor.id}`));
      const data = await parseOk<any[]>(response, 'listar CxP');
      return data.find((item) => item.referencia_id === recepcionCerrada.id || item.numero_documento === recepcionCerrada.numero) ?? null;
    }, {
      message: 'el cierre de recepción debe crear CxP',
      timeout: 30000,
    }).not.toBeNull();

    const sire = await parseOk<any>(
      await apiContext.post(api('/sire/generar-reporte'), {
        data: {
          tipoReporte: 'REGISTRO_COMPRAS',
          periodo: new Date().toISOString().slice(0, 7),
        },
      }),
      'generar SIRE compras',
    );
    expect(sire.id, 'SIRE debe crear reporte de compras').toBeTruthy();

    await expectStatus(
      await apiContext.post(api('/compras/devoluciones'), {
        data: {
          recepcion_id: recepcionCerrada.id,
          orden_id: orden.id,
          proveedor_id: proveedor.id,
          motivo: 'DEFECTUOSO',
          items: [
            {
              recepcion_item_id: recepcionItem.id,
              producto_id: producto.id,
              descripcion: producto.nombre,
              cantidad: cantidadCompra + 1,
              precio_unitario: 42,
              almacen_id: almacenId,
              motivo_detalle: 'Cantidad inválida T06',
            },
          ],
        },
      }),
      400,
      'no debe devolver cantidad mayor a la recibida',
    );

    const devolucion = await parseOk<any>(
      await apiContext.post(api('/compras/devoluciones'), {
        data: {
          recepcion_id: recepcionCerrada.id,
          orden_id: orden.id,
          proveedor_id: proveedor.id,
          motivo: 'DEFECTUOSO',
          observaciones: 'Devolución T06',
          items: [
            {
              recepcion_item_id: recepcionItem.id,
              producto_id: producto.id,
              descripcion: producto.nombre,
              cantidad: cantidadDevolucion,
              precio_unitario: 42,
              almacen_id: almacenId,
              motivo_detalle: 'Validación vertical T06',
            },
          ],
        },
      }),
      'crear devolucion',
    );
    expect(devolucion.estado).toBe('PENDIENTE');

    const emitida = await parseOk<any>(
      await apiContext.post(api(`/compras/devoluciones/${devolucion.id}/emitir`)),
      'emitir devolucion',
    );
    expect(emitida.estado).toBe('EMITIDA');

    await expectStatus(
      await apiContext.post(api(`/compras/devoluciones/${devolucion.id}/emitir`)),
      400,
      'no debe duplicar devolución emitida por doble click/reintento',
    );

    await expect.poll(async () => Number((await getProducto(apiContext, producto.id)).stock_actual || 0), {
      message: 'la devolución emitida debe disminuir stock',
      timeout: 30000,
    }).toBe(cantidadCompra - cantidadDevolucion);

    const movimientos = await parseOk<any[]>(
      await apiContext.get(api('/inventario/movimientos?limit=100')),
      'listar movimientos inventario',
    );
    const salidasDevolucion = movimientos.filter(
      (mov) => mov.producto_id === producto.id &&
        (mov.referencia_id === devolucion.id || mov.referencia === devolucion.id) &&
        /DEVOLUCION_PROVEEDOR/i.test(`${mov.referencia_tipo ?? mov.referencia ?? mov.motivo ?? ''}`),
    );
    expect(salidasDevolucion.length, 'la devolución debe registrar una sola salida de inventario').toBe(1);

    await gotoAuthenticated(page, `/dashboard/compras/ordenes/${orden.id}`);
    await expect(page.getByRole('heading', { name: /Orden de Compra/ })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(ordenNumero, { exact: false })).toBeVisible();

    await gotoAuthenticated(page, `/dashboard/compras/recepciones/${recepcionCerrada.id}`);
    await expect(page.getByRole('heading', { name: /Recepción/ })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('heading', { name: new RegExp(recepcionCerrada.numero) })).toBeVisible();

    await gotoAuthenticated(page, `/dashboard/compras/devoluciones/${devolucion.id}`);
    await expect(page.locator('h1').filter({ hasText: new RegExp(devolucion.numero) })).toBeVisible({ timeout: 15000 });

    await expect(page.locator('body')).not.toContainText(/Cargando|Error fatal|Unhandled|Application error/i);
    expect(browserFailures).toEqual([]);
  });
});
