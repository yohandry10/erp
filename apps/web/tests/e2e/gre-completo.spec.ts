import { APIResponse, Page, expect, request as playwrightRequest, test } from '@playwright/test';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { gotoAuthenticated, login } from './helpers/auth';

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

async function expectRejected(response: APIResponse, label: string, pattern: RegExp): Promise<void> {
  const text = await response.text();
  expect(response.status(), `${label}: ${text}`).toBeGreaterThanOrEqual(400);
  expect(text, label).toMatch(pattern);
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
  expect(url, 'SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL requerido para E2E GRE').toBeTruthy();
  expect(key, 'SUPABASE_SERVICE_ROLE_KEY requerido para E2E GRE').toBeTruthy();
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

test.describe('T11 GRE completo', () => {
  test('GRE conecta pedido, detalle, logística, PDF, idempotencia, errores y UI', async ({ page }) => {
    const browserFailures = await collectBrowserFailures(page);
    await login(page);
    const { headers, tenantId } = await authContext(page);
    const supabase = getSupabase();
    const apiContext = await playwrightRequest.newContext({
      baseURL: apiBaseURL,
      extraHTTPHeaders: headers,
      storageState: { cookies: [], origins: [] },
    });

    const cliente = await parseOk<any>(
      await apiContext.post(api('/ventas/clientes'), {
        data: {
          tipo: 'EMPRESA',
          documento_tipo: 'RUC',
          documento_numero: `20${runId}`,
          razon_social: `Cliente GRE T11 ${runId}`,
          direccion: 'Av. Logistica GRE 123',
          email: `gre-t11-${runId}@example.com`,
        },
      }),
      'crear cliente GRE',
    );

    const producto = await parseOk<any>(
      await apiContext.post(api('/inventario/productos'), {
        data: {
          codigo: `GRE-T11-${runId}`,
          nombre: `Producto GRE T11 ${runId}`,
          categoria: 'AUDITORIA',
          precio_compra: 30,
          precio_venta: 80,
          stock: 10,
          stock_minimo: 0,
          controla_stock: true,
        },
      }),
      'crear producto GRE',
    );
    const stockAntes = Number(producto.stock_actual ?? producto.stock ?? 0);

    const pedido = await parseOk<any>(
      await apiContext.post(api('/ventas/pedidos'), {
        data: {
          cliente_id: cliente.id,
          detalle: [{
            producto_id: producto.id,
            descripcion: producto.nombre,
            cantidad: 2,
            precio_unitario: 80,
          }],
          notas: 'Pedido origen GRE T11',
        },
      }),
      'crear pedido origen GRE',
    );
    expect(pedido.id).toBeTruthy();

    await expectRejected(
      await apiContext.post(api('/gre/guias'), {
        data: {
          destinatario: '',
          direccionDestino: 'Av. Sin destinatario',
          fechaTraslado: new Date(Date.now() + 86400000).toISOString(),
          modalidad: 'TRANSPORTE_PUBLICO',
          motivo: 'VENTA',
          pesoTotal: 1,
          transportista: 'Transportes GRE',
          idempotencyKey: `gre-invalid-required-${runId}`,
        },
      }),
      'no debe emitir GRE sin datos obligatorios',
      /destinatario|falta/i,
    );

    await expectRejected(
      await apiContext.post(api('/gre/guias'), {
        data: {
          destinatario: cliente.razon_social,
          direccionDestino: cliente.direccion,
          fechaTraslado: new Date(Date.now() + 86400000).toISOString(),
          modalidad: 'TRANSPORTE_PUBLICO',
          motivo: 'VENTA',
          pesoTotal: 0,
          transportista: 'Transportes GRE',
          idempotencyKey: `gre-invalid-qty-${runId}`,
        },
      }),
      'no debe emitir GRE con cantidad/peso inválido',
      /peso total|mayor a cero/i,
    );

    await expectRejected(
      await apiContext.post(api('/gre/guias'), {
        data: {
          destinatario: cliente.razon_social,
          direccionDestino: cliente.direccion,
          fechaTraslado: new Date(Date.now() + 86400000).toISOString(),
          modalidad: 'TRANSPORTE_PUBLICO',
          motivo: 'VENTA',
          pesoTotal: 3,
          transportista: 'Transportes GRE',
          pedidoId: '11111111-1111-4111-8111-111111111111',
          idempotencyKey: `gre-invalid-origin-${runId}`,
        },
      }),
      'no debe emitir GRE con documento origen inexistente',
      /pedido no existe|documento origen/i,
    );

    const grePayload = {
      destinatario: cliente.razon_social,
      direccionDestino: cliente.direccion,
      fechaTraslado: new Date(Date.now() + 86400000).toISOString(),
      modalidad: 'TRANSPORTE_PRIVADO',
      motivo: 'VENTA',
      pesoTotal: 7.5,
      placaVehiculo: `T${runId.slice(-5)}`,
      licenciaConducir: `Q${runId.slice(-8)}`,
      pedidoId: pedido.id,
      pedidoNumero: pedido.numero,
      despachosAsociados: [`DESP-T11-${runId}`],
      datosAdicionales: {
        destinatarioDocumentoTipo: '6',
        destinatarioDocumento: `20${runId}`,
      },
      observaciones: `GRE T11 desde despacho ${runId}`,
      idempotencyKey: `gre-t11-${tenantId}-${runId}`,
    };

    const gre = await parseOk<any>(
      await apiContext.post(api('/gre/guias'), { data: grePayload }),
      'crear GRE desde pedido/despacho',
    );
    expect(gre.id).toBeTruthy();
    expect(gre.numero).toMatch(/^T001-\d{8}$/);
    expect(['FIRMADO', 'BORRADOR', 'ERROR']).toContain(String(gre.estado));
    expect(gre.idempotencyKey).toBe(grePayload.idempotencyKey);

    const greDuplicada = await parseOk<any>(
      await apiContext.post(api('/gre/guias'), { data: grePayload }),
      'crear GRE idempotente',
    );
    expect(greDuplicada.id).toBe(gre.id);

    const detalle = await parseOk<any>(
      await apiContext.get(api(`/gre/guias/${gre.id}`)),
      'obtener detalle GRE',
    );
    expect(detalle.destinatario).toBe(cliente.razon_social);
    expect(detalle.hashGre || detalle.sunatStatus || detalle.estado).toBeTruthy();

    const pdf = await apiContext.get(api(`/gre/guias/${gre.id}/pdf`));
    const pdfText = await pdf.text();
    expect(pdf.ok(), `representación impresa GRE debe responder 2xx: ${pdfText}`).toBeTruthy();
    expect(pdfText).toContain('GUIA DE REMISION ELECTRONICA');

    const estadoSunat = await parseOk<any>(
      await apiContext.get(api(`/gre/guias/${gre.id}/estado-sunat`)),
      'consultar estado GRE',
    );
    expect(estadoSunat.estado || estadoSunat.descripcionSunat || estadoSunat.mensaje).toBeTruthy();

    const envioInvalido = await apiContext.post(api(`/gre/guias/${gre.id}/enviar-sunat`), {
      headers: { 'idempotency-key': `gre-send-${runId}` },
    });
    if (String(gre.estado) !== 'FIRMADO') {
      await expectRejected(envioInvalido, 'no debe enviar a SUNAT si no está FIRMADO', /FIRMADO|estado/i);
    } else {
      const envio = await parseOk<any>(envioInvalido, 'enviar GRE FIRMADA a SUNAT/mock');
      expect(envio.id).toBe(gre.id);
      expect(envio.timestamp).toBeTruthy();
    }

    const { data: greDb, error: greDbError } = await supabase
      .from('gre_guias')
      .select('id, venta_id, movimiento_inventario_id, estado, sunat_status, xml_firmado, hash_gre, error_message, idempotency_key, datos_adicionales')
      .eq('tenant_id', tenantId)
      .eq('id', gre.id)
      .single();
    expect(greDbError?.message || '', 'leer GRE persistida').toBe('');
    expect(greDb?.idempotency_key).toBe(grePayload.idempotencyKey);
    expect(greDb?.xml_firmado || greDb?.hash_gre || greDb?.error_message).toBeTruthy();
    expect(JSON.stringify(greDb?.datos_adicionales || {})).toContain(`DESP-T11-${runId}`);

    const { data: greDetalles, error: greDetallesError } = await supabase
      .from('gre_detalles')
      .select('producto_id, cantidad')
      .eq('tenant_id', tenantId)
      .eq('gre_id', gre.id);
    expect(greDetallesError?.message || '', 'leer detalle GRE').toBe('');
    expect(greDetalles?.some((item) => item.producto_id === producto.id && Number(item.cantidad) === 2)).toBeTruthy();

    const { data: pedidoGre, error: pedidoGreError } = await supabase
      .from('pedido_gres')
      .select('pedido_id, gre_id, estado')
      .eq('tenant_id', tenantId)
      .eq('pedido_id', pedido.id)
      .eq('gre_id', gre.id)
      .maybeSingle();
    expect(pedidoGreError?.message || '', 'leer vínculo pedido-GRE').toBe('');
    expect(pedidoGre?.gre_id).toBe(gre.id);

    const productoTrasGre = await parseOk<any[]>(
      await apiContext.get(api('/inventario/productos')),
      'listar productos tras GRE',
    );
    const stockDespues = Number(productoTrasGre.find((item) => item.id === producto.id)?.stock_actual ?? 0);
    expect(stockDespues, 'crear GRE documental no debe alterar stock').toBe(stockAntes);

    const lista = await parseOk<any[]>(
      await apiContext.get(api('/gre/guias')),
      'listar GRE',
    );
    expect(lista.some((item) => item.id === gre.id)).toBeTruthy();

    await gotoAuthenticated(page, '/dashboard/gre');
    await expect(page.getByText(/Guías de Remisión Electrónica|Guias de Remision Electronica/i)).toBeVisible({ timeout: 20000 });
    await expect(page.locator('body')).toContainText(gre.numero);
    const greRow = page.locator('tr').filter({ hasText: gre.numero });
    await expect(greRow, 'La GRE creada debe aparecer en el listado').toBeVisible({ timeout: 20000 });
    await greRow.getByRole('button', { name: 'Ver' }).click();
    await expect(page.getByRole('heading', { name: 'GUÍA DE REMISIÓN ELECTRÓNICA' })).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(cliente.razon_social)).toBeVisible();
    await expect(page.getByText(gre.numero)).toBeVisible();

    expect(browserFailures).toEqual([]);
    await apiContext.dispose();
  });
});
