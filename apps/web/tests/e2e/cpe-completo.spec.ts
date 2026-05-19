import { APIRequestContext, APIResponse, Page, expect, request as playwrightRequest, test } from '@playwright/test';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { gotoAuthenticated, login } from './helpers/auth';

type ApiEnvelope<T> = { success?: boolean; data?: T; message?: string; error?: any };

const runId = Date.now().toString().slice(-9);
const qaPrefix = `QA-PROD-READY-${runId}`;
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

async function parseBody(response: APIResponse): Promise<any> {
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

async function expectRejected(response: APIResponse, label: string, pattern: RegExp): Promise<void> {
  const body = await parseBody(response);
  expect(response.status(), `${label}: ${JSON.stringify(body)}`).toBeGreaterThanOrEqual(400);
  expect(JSON.stringify(body), label).toMatch(pattern);
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
  expect(url, 'SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL requerido para E2E CPE').toBeTruthy();
  expect(key, 'SUPABASE_SERVICE_ROLE_KEY requerido para E2E CPE').toBeTruthy();
  return createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });
}

function cpePayload(overrides: Record<string, any> = {}) {
  const tipo = overrides.tipo_documento || '01';
  const serie = overrides.serie || (tipo === '03' ? 'B001' : 'F001');
  const numero = overrides.numero || Number(`9${runId.slice(-7)}`);
  const receptorTipo = overrides.tipo_documento_receptor || (tipo === '03' ? '1' : '6');
  const receptorDocumento = overrides.documento_receptor || (tipo === '03' ? runId.slice(-8) : `20${runId}`);
  return {
    tipo_documento: tipo,
    serie,
    numero,
    fecha_emision: new Date().toISOString(),
    fecha_vencimiento: new Date().toISOString(),
    moneda: 'PEN',
    ruc_emisor: '20100070970',
    razon_social_emisor: 'ERP DEMO S.A.C.',
    tipo_documento_receptor: receptorTipo,
    documento_receptor: receptorDocumento,
    razon_social_receptor: `${qaPrefix} Cliente CPE T10`,
    direccion_receptor: 'Av. Fiscal 100',
    items: [{
      codigo: `${qaPrefix}-CPE-T10`,
      descripcion: `${qaPrefix} Servicio CPE T10`,
      cantidad: 1,
      unidad: 'NIU',
      precio_unitario: 100,
      valor_venta: 100,
      igv: 18,
      precio_venta: 118,
    }],
    total_gravadas: 100,
    total_igv: 18,
    total_venta: 118,
    idempotency_key: `cpe-direct-${runId}-${tipo}`,
    ...overrides,
  };
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

async function ensureMetodoPago(supabase: SupabaseClient, tenantId: string) {
  const { data: existing, error: selectError } = await supabase
    .from('metodos_pago')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('codigo', 'efectivo')
    .maybeSingle();
  expect(selectError?.message || '', 'consultar método efectivo').toBe('');
  if (existing) return existing;

  const { data, error } = await supabase
    .from('metodos_pago')
    .insert({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      codigo: 'efectivo',
      nombre: 'Efectivo',
      tipo: 'EFECTIVO',
      activo: true,
      estado: 'ACTIVO',
    })
    .select('*')
    .single();
  expect(error?.message || '', 'crear método efectivo').toBe('');
  return data;
}

async function crearClienteFiscal(supabase: SupabaseClient, tenantId: string, payload: ReturnType<typeof cpePayload>) {
  const { data, error } = await supabase
    .from('clientes')
    .insert({
      tenant_id: tenantId,
      tipo: 'EMPRESA',
      tipo_documento: 'RUC',
      documento_tipo: 'RUC',
      razon_social: payload.razon_social_receptor,
      nombre: payload.razon_social_receptor,
      codigo: payload.documento_receptor,
      ruc: payload.documento_receptor,
      direccion: payload.direccion_receptor,
      email: null,
      activo: true,
      estado: 'ACTIVO',
    })
    .select('id')
    .single();

  expect(error?.message || '', 'crear cliente fiscal para CPE/CxC').toBe('');
  expect(data?.id, 'cliente fiscal creado').toBeTruthy();
  return data!.id as string;
}

async function prepararPos(supabase: SupabaseClient, tenantId: string) {
  const efectivo = await ensureMetodoPago(supabase, tenantId);
  const { data: caja, error: cajaError } = await supabase
    .from('cajas')
    .insert({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      codigo: `${qaPrefix}-CAJA-CPE`,
      nombre: `${qaPrefix} Caja CPE T10`,
      estado: 'ACTIVO',
    })
    .select('*')
    .single();
  expect(cajaError?.message || '', 'crear caja POS CPE').toBe('');

  const { data: producto, error: productoError } = await supabase
    .from('productos')
    .insert({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      codigo: `${qaPrefix}-POS-CPE`,
      codigo_barras: `77510${runId}`,
      nombre: `${qaPrefix} Producto POS CPE T10`,
      categoria: 'AUDITORIA',
      precio: 20,
      precio_venta: 20,
      precio_unitario: 20,
      stock: '5',
      stock_actual: '5',
      stock_reservado: '0',
      stock_minimo: '0',
      unidad_medida: 'NIU',
      activo: true,
      estado: 'ACTIVO',
      controla_stock: true,
      es_servicio: false,
    })
    .select('*')
    .single();
  expect(productoError?.message || '', 'crear producto POS CPE').toBe('');
  return { caja, efectivo, producto };
}

async function abrirCaja(apiContext: APIRequestContext, cajaId: string) {
  const sesionActual = await parseOk<any>(await apiContext.get(api('/pos/sesion-caja')), 'consultar sesión POS');
  if (sesionActual?.id) return sesionActual.id;
  const cajaAbierta = await parseOk<any>(
    await apiContext.post(api('/pos/caja/abrir'), {
      data: { caja_id: cajaId, monto_inicial: 100, dispositivo: `${qaPrefix}-E2E-CPE` },
    }),
    'abrir caja POS CPE',
  );
  return cajaAbierta.id || cajaAbierta.sesion_id;
}

test.describe('T10 CPE completo', () => {
  test.setTimeout(180000);

  test('CPE valida factura, boleta POS, listado, detalle, PDF, idempotencia y errores fiscales', async ({ page }) => {
    const browserFailures = await collectBrowserFailures(page);
    await login(page);
    const { headers, tenantId } = await authContext(page);
    const supabase = getSupabase();
    const apiContext = await playwrightRequest.newContext({
      baseURL: apiBaseURL,
      extraHTTPHeaders: headers,
      storageState: { cookies: [], origins: [] },
    });

    const facturaPayloadBase = cpePayload();
    const clienteFiscalId = await crearClienteFiscal(supabase, tenantId, facturaPayloadBase);
    const facturaPayload = { ...facturaPayloadBase, cliente_id: clienteFiscalId };
    const factura = await parseOk<any>(
      await apiContext.post(api('/cpe'), { data: facturaPayload }),
      'crear factura CPE directa',
    );
    expect(factura.id).toBeTruthy();
    expect(factura.serie).toBe(facturaPayload.serie);
    expect(Number(factura.numero)).toBe(facturaPayload.numero);
    expect(['FIRMADO', 'ENVIADO', 'ACEPTADO', 'RECHAZADO']).toContain(String(factura.estado));

    const facturaDuplicada = await parseOk<any>(
      await apiContext.post(api('/cpe'), { data: facturaPayload }),
      'crear factura CPE idempotente',
    );
    expect(facturaDuplicada.id).toBe(factura.id);

    await expectRejected(
      await apiContext.post(api('/cpe'), {
        data: cpePayload({ idempotency_key: `cpe-invalid-total-${runId}`, numero: facturaPayload.numero + 1, total_venta: 999 }),
      }),
      'rechazar totales inconsistentes',
      /Totales inconsistentes/i,
    );

    await expectRejected(
      await apiContext.post(api('/cpe'), {
        data: cpePayload({
          idempotency_key: `cpe-invalid-client-${runId}`,
          numero: facturaPayload.numero + 2,
          tipo_documento: '01',
          tipo_documento_receptor: '1',
          documento_receptor: runId.slice(-8),
        }),
      }),
      'rechazar factura con cliente inválido',
      /factura requiere receptor con RUC|RUC del receptor/i,
    );

    const detail = await parseOk<any>(
      await apiContext.get(api(`/cpe/comprobantes/${factura.id}`)),
      'detalle CPE',
    );
    expect(detail.id).toBe(factura.id);
    expect(detail.hash || detail.hash_firma || detail.xml_firmado).toBeTruthy();

    const list = await parseOk<any[]>(
      await apiContext.get(api(`/cpe/comprobantes?serie=${facturaPayload.serie}`)),
      'listado CPE',
    );
    expect(list.some((item) => item.id === factura.id)).toBeTruthy();

    const pdfResponse = await apiContext.get(api(`/cpe/comprobantes/${factura.id}/pdf`));
    expect(pdfResponse.ok(), `PDF debe responder OK: ${await pdfResponse.text()}`).toBeTruthy();
    expect(pdfResponse.headers()['content-type']).toContain('application/pdf');
    expect((await pdfResponse.body()).length, 'PDF debe tener contenido').toBeGreaterThan(1000);

    const assertAsientoContableUnico = async (sourceEventId: string | null | undefined) => {
      if (!sourceEventId) return { count: -1, hasDetails: false, error: 'source_event_id ausente' };
      const { data, error } = await supabase
        .from('asientos_contables')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('source_event_id', sourceEventId);
      if (error) return { count: -1, error: error.message, hasDetails: false };
      if ((data?.length ?? 0) !== 1) {
        return { count: data?.length ?? 0, hasDetails: false };
      }
      const { data: detalles, error: detallesError } = await supabase
        .from('detalle_asientos')
        .select('id')
        .eq('asiento_id', data![0].id)
        .limit(1);
      if (detallesError) return { count: 1, error: detallesError.message, hasDetails: false };
      return {
        count: data?.length ?? 0,
        hasDetails: Boolean(detalles?.length),
      };
    };

    const facturaAnulablePayload = cpePayload({
      idempotency_key: `cpe-anulable-${runId}`,
      numero: facturaPayload.numero + 3,
      documento_receptor: `21${runId}`,
      razon_social_receptor: `${qaPrefix} Cliente CPE anulable`,
    });
    const clienteAnulableId = await crearClienteFiscal(supabase, tenantId, facturaAnulablePayload);
    const facturaAnulable = await parseOk<any>(
      await apiContext.post(api('/cpe'), { data: { ...facturaAnulablePayload, cliente_id: clienteAnulableId } }),
      'crear factura CPE anulable',
    );
    const { data: cpeAnulableOriginalDb, error: cpeAnulableOriginalDbError } = await supabase
      .from('cpe')
      .select('id, event_id')
      .eq('tenant_id', tenantId)
      .eq('id', facturaAnulable.id)
      .single();
    expect(cpeAnulableOriginalDbError?.message || '', 'leer CPE anulable antes de anular').toBe('');
    await expect.poll(async () => {
      return assertAsientoContableUnico(cpeAnulableOriginalDb?.event_id);
    }, {
      message: 'CPE anulable debe tener asiento original antes de permitir anulación',
      timeout: 90000,
      intervals: [1000, 2000, 5000],
    }).toEqual({ count: 1, hasDetails: true });

    const anulacion = await parseOk<any>(
      await apiContext.post(api(`/cpe/${facturaAnulable.id}/anular`), {
        data: { motivo: `${qaPrefix} anulación controlada CASE-10` },
      }),
      'anular CPE firmado',
    );
    expect(anulacion.cpe_anulado?.estado || anulacion.estado).toMatch(/ANULADO/i);
    expect(anulacion.nota_credito?.id).toBeTruthy();
    await expectRejected(
      await apiContext.post(api(`/cpe/${facturaAnulable.id}/anular`), {
        data: { motivo: `${qaPrefix} doble anulación CASE-10` },
      }),
      'no debe duplicar anulación CPE',
      /ya está anulado|ya esta anulado|No se puede anular/i,
    );

    const envio1 = await parseOk<any>(
      await apiContext.post(api(`/cpe/${factura.id}/resend`), {
        headers: { 'idempotency-key': `send-${runId}` },
      }),
      'reintento envío CPE',
    );
    expect(envio1.message || envio1.data?.message || '').toMatch(/resent|enviado|success/i);

    const envio2 = await parseOk<any>(
      await apiContext.post(api(`/cpe/${factura.id}/resend`), {
        headers: { 'idempotency-key': `send-${runId}` },
      }),
      'reintento idempotente envío CPE',
    );
    expect(envio2.message || envio2.data?.message || '').toBeTruthy();

    const estado = await parseOk<any>(
      await apiContext.get(api(`/cpe/${factura.id}/status`)),
      'consultar estado fiscal CPE',
    );
    expect(estado.estado || estado.descripcionSunat).toBeTruthy();

    const { data: cpeDb, error: cpeDbError } = await supabase
      .from('cpe')
      .select('id, documento_id, cliente_id, estado, sunat_status, error_message, serie, numero, xml_firmado, hash_firma, event_id')
      .eq('tenant_id', tenantId)
      .eq('id', factura.id)
      .single();
    expect(cpeDbError?.message || '', 'leer CPE persistido').toBe('');
    expect(cpeDb?.xml_firmado || cpeDb?.hash_firma).toBeTruthy();
    expect(['FIRMADO', 'ENVIADO', 'ACEPTADO', 'RECHAZADO']).toContain(String(cpeDb?.estado));
    expect(cpeDb?.cliente_id, 'CPE debe conservar cliente_id para finanzas').toBe(clienteFiscalId);

    await expect.poll(async () => {
      const documentoId = cpeDb?.documento_id || factura.id;
      const { data, error } = await supabase
        .from('cuentas_por_cobrar')
        .select('id, cliente_id, documento_id, monto_total, monto_pendiente, estado')
        .eq('tenant_id', tenantId)
        .eq('documento_id', documentoId)
        .maybeSingle();
      if (error) return { ok: false, error: error.message };
      return {
        ok: Boolean(data?.id),
        cliente_id: data?.cliente_id,
        monto_total: Number(data?.monto_total || 0),
        monto_pendiente: Number(data?.monto_pendiente || 0),
        estado: data?.estado,
      };
    }, {
      message: 'Factura CPE debe generar CxC persistida con cliente y monto reales',
      timeout: 15000,
      intervals: [500, 1000, 2000],
    }).toMatchObject({
      ok: true,
      cliente_id: clienteFiscalId,
      monto_total: 118,
      monto_pendiente: 118,
    });

    await expect.poll(async () => {
      return assertAsientoContableUnico(cpeDb?.event_id);
    }, {
      message: 'CPE/CxC debe generar exactamente un asiento contable con detalle para el source_event_id fiscal',
      timeout: 90000,
      intervals: [1000, 2000, 5000],
    }).toEqual({ count: 1, hasDetails: true });

    const { data: cpeAnulableDb, error: cpeAnulableDbError } = await supabase
      .from('cpe')
      .select('id, event_id, estado, nota_credito_id')
      .eq('tenant_id', tenantId)
      .eq('id', facturaAnulable.id)
      .single();
    expect(cpeAnulableDbError?.message || '', 'leer CPE anulable persistido').toBe('');
    expect(String(cpeAnulableDb?.estado || '')).toMatch(/ANULADO/i);
    expect(cpeAnulableDb?.nota_credito_id).toBeTruthy();

    await expect.poll(async () => {
      return assertAsientoContableUnico(cpeAnulableDb?.event_id);
    }, {
      message: 'CPE anulable debe conservar exactamente un asiento contable para su CxC original',
      timeout: 90000,
      intervals: [1000, 2000, 5000],
    }).toEqual({ count: 1, hasDetails: true });

    const posData = await prepararPos(supabase, tenantId);
    const sesionCajaId = await abrirCaja(apiContext, posData.caja.id);
    const boletaPos = await parseOk<any>(
      await apiContext.post(api('/pos/venta'), {
        data: {
          idempotency_key: `pos-cpe-t10-${runId}`,
          sesion_caja_id: sesionCajaId,
          cliente_nombre: `${qaPrefix} Cliente POS CPE T10`,
          cliente_documento: runId.slice(-8),
          metodo_pago_id: posData.efectivo.id,
          items: [{
            producto_id: posData.producto.id,
            cantidad: 1,
            precio_unitario: 20,
            subtotal: 20,
            producto: { codigo: posData.producto.codigo, nombre: posData.producto.nombre, unidad_medida_sunat: 'NIU' },
          }],
          subtotal: 20,
          impuestos: 3.6,
          total: 23.6,
          comprobante: { tipo: '03', serie: 'B001' },
          permite_venta_sin_stock: true,
        },
      }),
      'crear boleta POS/CPE',
    );
    expect(boletaPos.numero_ticket).toMatch(/^B001-\d{8}$/);
    expect(boletaPos.cpe_id || boletaPos.factura_electronica || boletaPos.message).toBeTruthy();

    const { data: empresaConfig, error: empresaError } = await supabase
      .from('empresa_config')
      .select('certificado_pfx')
      .eq('tenant_id', tenantId)
      .single();
    expect(empresaError?.message || '', 'leer certificado tenant').toBe('');
    if (!empresaConfig?.certificado_pfx) {
      expect(
        cpeDb?.sunat_status || cpeDb?.error_message,
        'sin certificado tenant real debe quedar estado fiscal explícito, no silencio',
      ).toBeTruthy();
    }

    await gotoAuthenticated(page, '/dashboard/cpe');
    await expect(page.getByText(/Comprobantes de Pago Electrónicos|Comprobantes de Pago Electronicos/i)).toBeVisible({ timeout: 20000 });
    await expect(page.locator('body')).toContainText(new RegExp(facturaPayload.serie));
    await expect(page.locator('body')).not.toContainText(/Application error|Unhandled|Error fatal|Cargando país configurado/i);

    const facturaRow = page.locator('tr', { hasText: facturaPayload.razon_social_receptor });
    await expect(facturaRow, 'La factura creada debe aparecer en el listado CPE').toBeVisible({ timeout: 20000 });
    await facturaRow.getByRole('button', { name: 'Ver' }).click();
    await expect(page.getByRole('heading', { name: 'FACTURA ELECTRÓNICA' })).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(facturaPayload.documento_receptor)).toBeVisible();
    await expect(page.getByText('Hash de Seguridad')).toBeVisible();

    expect(browserFailures).toEqual([]);
    await apiContext.dispose();
  });
});
