import { APIRequestContext, APIResponse, Page, expect, request as playwrightRequest, test } from '@playwright/test';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { gotoAuthenticated, login } from './helpers/auth';
import { generateValidRucFromRunId, apiContextAsAprobador } from './helpers/test-data';

type ApiEnvelope<T> = { success?: boolean; data?: T; message?: string; error?: string };

const runId = Date.now().toString().slice(-9);
const qaStamp = new Date().toISOString().replace(/\D/g, '').slice(0, 12);
const qaPrefix = `QA-PROD-READY-${qaStamp}-CASE16-${runId}`;
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
  expect(url, 'SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL requerido para E2E Contabilidad').toBeTruthy();
  expect(key, 'SUPABASE_SERVICE_ROLE_KEY requerido para E2E Contabilidad').toBeTruthy();
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

async function requireCuenta(supabase: SupabaseClient, tenantId: string, codigo: string): Promise<{ id: string; codigo: string; nombre: string }> {
  const { data, error } = await supabase
    .from('plan_cuentas')
    .select('id, codigo, nombre')
    .eq('tenant_id', tenantId)
    .eq('codigo', codigo)
    .eq('activo', true)
    .maybeSingle();
  expect(error?.message || '', `consultar cuenta ${codigo}`).toBe('');
  expect(data?.id, `debe existir cuenta contable activa ${codigo}`).toBeTruthy();
  return data as { id: string; codigo: string; nombre: string };
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
      .limit(2);
    expect(error?.message || '', `buscar asiento ${referencia}`).toBe('');
    found = data?.[0] ?? null;
    if (!found) {
      const { data: eventos, error: eventosError } = await supabase
        .from('outbox_events')
        .select('event_id, payload, created_at')
        .eq('tenant_id', tenantId)
        .filter('payload->>referencia', 'eq', referencia)
        .order('created_at', { ascending: false })
        .limit(5);
      expect(eventosError?.message || '', `buscar evento contable ${referencia}`).toBe('');
      const sourceEventIds = (eventos || [])
        .flatMap((evento: any) => [evento.event_id, evento.payload?.eventId])
        .filter(Boolean);
      if (sourceEventIds.length > 0) {
        const { data: bySource, error: sourceError } = await supabase
          .from('asientos_contables')
          .select('*')
          .eq('tenant_id', tenantId)
          .in('source_event_id', sourceEventIds)
          .order('created_at', { ascending: false })
          .limit(2);
        expect(sourceError?.message || '', `buscar asiento por evento ${referencia}`).toBe('');
        found = bySource?.[0] ?? null;
      }
    }
    return found?.id ?? '';
  }, { message: `asiento contable para ${referencia}`, timeout: 180000, intervals: [1000, 2000, 5000, 10000] }).not.toBe('');
  const { data: detalles, error: detallesError } = await supabase
    .from('detalle_asientos')
    .select('*')
    .eq('asiento_id', found.id);
  expect(detallesError?.message || '', `buscar detalle asiento ${referencia}`).toBe('');
  found.detalle_asientos = detalles || [];
  return found;
}

function expectAsientoCuadrado(asiento: any, label: string) {
  const detalles = asiento.detalle_asientos ?? asiento.detalles ?? [];
  expect(asiento.id, `${label} debe tener id`).toBeTruthy();
  expect(detalles.length, `${label} debe tener detalle`).toBeGreaterThanOrEqual(2);
  expect(Number(asiento.total_debe), `${label} total debe`).toBeGreaterThan(0);
  expect(Number(asiento.total_debe), `${label} debe=haber`).toBeCloseTo(Number(asiento.total_haber), 2);
  const debeDetalle = round2(detalles.reduce((sum: number, item: any) => sum + Number(item.debe || 0), 0));
  const haberDetalle = round2(detalles.reduce((sum: number, item: any) => sum + Number(item.haber || 0), 0));
  expect(debeDetalle, `${label} detalle debe cuadra con cabecera`).toBeCloseTo(Number(asiento.total_debe), 2);
  expect(haberDetalle, `${label} detalle haber cuadra con cabecera`).toBeCloseTo(Number(asiento.total_haber), 2);
}

async function createBankAccount(apiContext: APIRequestContext) {
  return parseOk<any>(
    await apiContext.post(api('/finanzas/bancos/cuentas'), {
      data: {
        nombre: `${qaPrefix} Banco Contabilidad`,
        banco: 'GENERICO',
        numero_cuenta: `T14-${runId}`,
        tipo_cuenta: 'CORRIENTE',
        moneda: 'PEN',
        saldo: 10000,
        activa: true,
      },
    }),
    'crear cuenta bancaria T14',
  );
}

async function createSaleWithCxc(apiContext: APIRequestContext) {
  const cliente = await parseOk<any>(
    await apiContext.post(api('/ventas/clientes'), {
      data: {
        tipo: 'PERSONA',
        documento_tipo: 'DNI',
        documento_numero: runId.slice(-8),
        razon_social: `${qaPrefix} Cliente Contabilidad`,
        direccion: 'Av. Contabilidad Ventas 1400',
        email: `cliente-conta-${runId}@example.com`,
      },
    }),
    'crear cliente T14',
  );

  const almacenes = await parseOk<any[]>(
    await apiContext.get(api('/inventario/almacenes')),
    'listar almacenes venta T14',
  );
  expect(almacenes.length, 'T14 requiere almacén operativo').toBeGreaterThan(0);

  const producto = await parseOk<any>(
    await apiContext.post(api('/inventario/productos'), {
      data: {
        codigo: `CON-V-${runId}`,
        nombre: `${qaPrefix} Producto Venta Contabilidad`,
        categoria: 'AUDITORIA',
        precio_compra: 40,
        precio_venta: 118,
        stock: 4,
        almacen_id: almacenes[0].id,
        stock_minimo: 0,
        controla_stock: true,
      },
    }),
    'crear producto venta T14',
  );

  const pedido = await parseOk<any>(
    await apiContext.post(api('/ventas/pedidos'), {
      data: {
        cliente_id: cliente.id,
        detalle: [{ producto_id: producto.id, descripcion: producto.nombre, cantidad: 1, precio_unitario: 118 }],
        notas: 'Venta credito T14',
      },
    }),
    'crear pedido venta T14',
  );

  await parseOk<any>(
    await apiContext.post(api(`/ventas/pedidos/${pedido.id}/confirmar`), { data: {} }),
    'confirmar pedido T14',
  );

  const documento = await parseOk<any>(
    await apiContext.post(api(`/ventas/pedidos/${pedido.id}/generar-documento`), { data: { tipo_documento: '03' } }),
    'generar documento venta T14',
  );
  const referencia = `${documento.documento.serie}-${documento.documento.numero}`;
  expect(documento.cxc?.id, 'venta T14 debe crear CxC').toBeTruthy();
  return { cliente, documento, referencia };
}

async function createPurchaseWithCxp(apiContext: APIRequestContext) {
  const almacenes = await parseOk<any[]>(await apiContext.get(api('/inventario/almacenes')), 'listar almacenes T14');
  expect(almacenes.length, 'debe existir almacen para compra T14').toBeGreaterThan(0);
  const almacenId = almacenes[0].id;

  const proveedor = await parseOk<any>(
    await apiContext.post(api('/compras/proveedores'), {
      data: {
        ruc: generateValidRucFromRunId(`conta-proveedor-${runId}`),
        razon_social: `${qaPrefix} Proveedor Contabilidad S.A.C.`,
        nombre_comercial: `${qaPrefix} Proveedor Conta`,
        email: `proveedor-conta-${runId}@example.com`,
        direccion: 'Av. Contabilidad Compras 1400',
        condiciones_pago: 'CREDITO_30',
        dias_credito: 30,
      },
    }),
    'crear proveedor T14',
  );

  const producto = await parseOk<any>(
    await apiContext.post(api('/inventario/productos'), {
      data: {
        codigo: `CON-C-${runId}`,
        nombre: `${qaPrefix} Producto Compra Contabilidad`,
        categoria: 'AUDITORIA',
        precio_compra: 200,
        precio_venta: 260,
        stock: 0,
        stock_minimo: 0,
        controla_stock: true,
        almacen_id: almacenId,
      },
    }),
    'crear producto compra T14',
  );

  const orden = await parseOk<any>(
    await apiContext.post(api('/compras/ordenes'), {
      data: {
        numero: `OC-CON-${runId}`,
        proveedor_id: proveedor.id,
        fecha_orden: new Date().toISOString(),
        fecha_entrega_esperada: new Date(Date.now() + 86400000).toISOString(),
        condiciones_pago: 'CREDITO_30',
        dias_credito: 30,
        almacen_destino_id: almacenId,
        estado: 'BORRADOR',
        detalles: [{ producto_id: producto.id, descripcion: producto.nombre, cantidad: 1, precio_unitario: 200 }],
      },
    }),
    'crear orden compra T14',
  );
  const detalleId = orden.detalles?.[0]?.id ?? orden.detalle?.[0]?.id;
  expect(detalleId, 'orden compra T14 debe devolver detalle').toBeTruthy();

  // SEC-001 fix: aprobador autentica con su propio JWT.
  const aprobadorContaCtx = await apiContextAsAprobador();
  try {
    await parseOk<any>(
      await aprobadorContaCtx.post(api(`/compras/ordenes/${orden.id}/aprobar`), {
        data: { aprobador_nombre: 'Admin Contabilidad T14', comentarios: 'Aprobacion T14' },
      }),
      'aprobar orden compra T14',
    );
  } finally {
    await aprobadorContaCtx.dispose();
  }

  const recepcion = await parseOk<any>(
    await apiContext.post(api(`/compras/recepciones/ordenes/${orden.id}`), {
      data: {
        orden_id: orden.id,
        idempotency_key: `recepcion:${runId}:contabilidad`,
        almacen_id: almacenId,
        observaciones: 'Recepcion Contabilidad T14',
        items: [{ detalle_id: detalleId, cantidad_recibida: 1, calidad: 'OK', almacen_id: almacenId }],
      },
    }),
    'crear recepcion T14',
  );

  const cerrada = await parseOk<any>(
    await apiContext.post(api(`/compras/recepciones/${recepcion.id}/cerrar`), {
      data: { observaciones: 'Cierre recepcion Contabilidad T14' },
    }),
    'cerrar recepcion T14',
  );

  const numeroFactura = `F001-CON-${runId}`;
  const cxpCreada = await parseOk<any>(
    await apiContext.post(api('/finanzas/cxp'), {
      data: {
        proveedor_id: proveedor.id,
        orden_id: orden.id,
        recepcion_id: cerrada.id,
        tipo_documento: 'FACTURA',
        serie: 'F001',
        numero_documento: numeroFactura,
        fecha_emision: new Date().toISOString().slice(0, 10),
        condiciones_pago: 'CREDITO_30',
        subtotal: 200,
        igv: 36,
        total: 236,
        moneda: 'PEN',
        tipo_cambio: 1,
        referencia_tipo: 'RECEPCION',
        referencia_id: cerrada.id,
      },
    }),
    'registrar factura proveedor T14',
  );

  await expect.poll(async () => {
    const data = await parseOk<any[]>(await apiContext.get(api(`/finanzas/cxp?proveedor_id=${proveedor.id}`)), 'listar CxP T14');
    return data.find((item) => item.id === cxpCreada.id && item.recepcion_id === cerrada.id)?.id ?? '';
  }, { message: 'compra T14 debe crear CxP', timeout: 30000 }).not.toBe('');

  const cxps = await parseOk<any[]>(await apiContext.get(api(`/finanzas/cxp?proveedor_id=${proveedor.id}`)), 'listar CxP T14 final');
  const cxp = cxps.find((item) => item.id === cxpCreada.id && item.recepcion_id === cerrada.id);
  expect(cxp?.id, 'CxP de compra T14 persistida').toBeTruthy();
  return { proveedor, cxp, referencia: numeroFactura };
}

async function ensureMetodoPago(supabase: SupabaseClient, tenantId: string) {
  const { data: existing, error: selectError } = await supabase
    .from('metodos_pago')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('codigo', 'efectivo')
    .limit(1)
    .maybeSingle();
  expect(selectError?.message || '', 'consultar metodo efectivo T14').toBe('');
  if (existing) return existing;

  const { data, error } = await supabase.from('metodos_pago').insert({
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    codigo: 'efectivo',
    nombre: 'Efectivo',
    tipo: 'EFECTIVO',
    activo: true,
    estado: 'ACTIVO',
  }).select('*').single();
  expect(error?.message || '', 'crear metodo efectivo T14').toBe('');
  return data;
}

async function createPosSale(apiContext: APIRequestContext, supabase: SupabaseClient, tenantId: string) {
  await supabase.from('empresa_config').upsert({
    tenant_id: tenantId,
    ruc: generateValidRucFromRunId(`conta-empresa-${runId}`),
    razon_social: `${qaPrefix} ERP Contabilidad E2E SAC`,
    nombre_comercial: `${qaPrefix} ERP Contabilidad E2E`,
    email: `contabilidad-e2e-${runId}@example.com`,
    direccion: 'Av. Contabilidad POS 1400',
    direccion_fiscal: 'Av. Contabilidad POS 1400',
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
  expect(almacenError?.message || '', 'consultar almacen POS Contabilidad T14').toBe('');
  expect(almacen?.id, 'debe existir almacen POS Contabilidad T14').toBeTruthy();

  const { data: caja, error: cajaError } = await supabase.from('cajas').insert({
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    almacen_id: almacen!.id,
    codigo: `CAJA-CON-${runId}`,
    nombre: `${qaPrefix} Caja Contabilidad`,
    estado: 'ACTIVO',
  }).select('*').single();
  expect(cajaError?.message || '', 'crear caja Contabilidad T14').toBe('');

  const metodoPago = await ensureMetodoPago(supabase, tenantId);

  const { data: producto, error: productoError } = await supabase.from('productos').insert({
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    codigo: `POS-CON-${runId}`,
    codigo_barras: `778${runId}`,
    nombre: `${qaPrefix} Producto POS Contabilidad`,
    categoria: 'AUDITORIA',
    precio: 50,
    precio_venta: 50,
    precio_unitario: 50,
    precio_compra: 30,
    stock_minimo: '0',
    unidad_medida: 'NIU',
    activo: true,
    estado: 'ACTIVO',
    controla_stock: true,
    es_servicio: false,
  }).select('*').single();
  expect(productoError?.message || '', 'crear producto POS Contabilidad T14').toBe('');

  const { error: stockError } = await supabase.rpc('aplicar_movimiento_inventario_tx', {
    p_tenant_id: tenantId,
    p_producto_id: producto!.id,
    p_almacen_id: almacen!.id,
    p_tipo: 'ENTRADA',
    p_cantidad: 3,
    p_referencia_tipo: 'QA_CONTABILIDAD_E2E',
    p_referencia_id: crypto.randomUUID(),
    p_notas: 'Stock controlado para flujo POS/Contabilidad E2E',
    p_created_by: 'playwright',
    p_metadata: { source: 'contabilidad-completo.spec.ts', run_id: runId },
  });
  expect(stockError?.message || '', 'cargar stock por ledger POS Contabilidad T14').toBe('');

  const sesionActual = await parseOk<any>(await apiContext.get(api('/pos/sesion-caja')), 'consultar sesion POS T14');
  let sesionId = sesionActual?.id;
  if (!sesionId) {
    const abierta = await parseOk<any>(
      await apiContext.post(api('/pos/caja/abrir'), {
        data: { caja_id: caja.id, monto_inicial: 100, dispositivo: `E2E-CON-${runId}` },
      }),
      'abrir caja POS T14',
    );
    sesionId = abierta.id || abierta.sesion_id;
  }
  expect(sesionId, 'debe existir sesion POS T14').toBeTruthy();

  const venta = await parseOk<any>(
    await apiContext.post(api('/pos/venta'), {
      data: {
        idempotency_key: `pos-con-${runId}`,
        sesion_caja_id: sesionId,
        cliente_nombre: `${qaPrefix} Cliente POS Contabilidad`,
        cliente_documento: `6${runId.slice(-7)}`,
        metodo_pago_id: metodoPago.id,
        items: [{
          producto_id: producto.id,
          cantidad: 1,
          precio_unitario: 50,
          subtotal: 50,
          producto: { codigo: producto.codigo, nombre: producto.nombre, unidad_medida_sunat: 'NIU' },
        }],
        subtotal: 50,
        impuestos: 9,
        total: 59,
        comprobante: { tipo: '03', serie: 'B001' },
        permite_venta_sin_stock: false,
      },
    }),
    'procesar POS Contabilidad T14',
  );
  return { venta, referencia: String(venta.numero_ticket) };
}

async function createPayroll(supabase: SupabaseClient, tenantId: string, apiContext: APIRequestContext) {
  const periodo = `2048-${String((Number(runId.slice(-2)) % 12) + 1).padStart(2, '0')}`;
  const [anio, mes] = periodo.split('-').map(Number);
  await supabase.from('periodos_contables').upsert({
    tenant_id: tenantId,
    anio,
    mes,
    estado: 'ABIERTO',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'tenant_id,anio,mes' });

  const planillaId = crypto.randomUUID();
  const { error: planillaError } = await supabase.from('planillas').insert({
    id: planillaId,
    tenant_id: tenantId,
    periodo,
    estado: 'CALCULADA',
    total_aportes: 100,
    total_ingresos: 1000,
    total_descuentos: 100,
    total_neto: 900,
    asientos_generados: 'false',
  });
  expect(planillaError?.message || '', 'crear planilla T14').toBe('');

  const { error: empleadoPlanillaError } = await supabase.from('empleado_planilla').insert({
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    planilla_id: planillaId,
    id_planilla: planillaId,
    total_ingresos: 1000,
    total_descuentos: 100,
    total_aportes: 100,
    neto_pagar: 900,
    estado_pago: 'pendiente',
    estado: 'CALCULADA',
  });
  expect(empleadoPlanillaError?.message || '', 'crear empleado_planilla T14').toBe('');

  const primera = await parseOk<any>(
    await apiContext.post(api(`/rrhh/planillas/${planillaId}/aprobar`), { data: {} }),
    'aprobar y encolar devengo RRHH T14',
  );
  const segunda = await parseOk<any>(
    await apiContext.post(api(`/rrhh/planillas/${planillaId}/aprobar`), { data: {} }),
    'reintentar aprobación RRHH T14',
  );
  expect(segunda.eventId ?? segunda.data?.eventId).toBe(primera.eventId ?? primera.data?.eventId);

  const asiento = await waitForAsientoByReference(supabase, tenantId, `PLANILLA-${planillaId}`);

  const { data: asientos, error: asientosError } = await supabase
    .from('asientos_contables')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('referencia', `PLANILLA-${planillaId}`);
  expect(asientosError?.message || '', 'consultar duplicados RRHH T14').toBe('');
  expect(asientos || [], 'reintento RRHH no debe duplicar asiento').toHaveLength(1);

  return { referencia: `PLANILLA-${planillaId}`, periodo, asientoId: asiento.id };
}

test.describe('T14 Contabilidad completo', () => {
  test.setTimeout(600000);

  test('operaciones economicas generan asientos, libros y periodos coherentes', async ({ page }) => {
    const browserFailures = await collectBrowserFailures(page);
    await login(page);
    const { headers, tenantId } = await authContext(page);
    const supabase = getSupabase();
    const apiContext = await playwrightRequest.newContext({
      baseURL: apiBaseURL,
      extraHTTPHeaders: headers,
      storageState: { cookies: [], origins: [] },
    });

    const cuenta10 = await requireCuenta(supabase, tenantId, '10');
    const cuenta12 = await requireCuenta(supabase, tenantId, '12');
    await requireCuenta(supabase, tenantId, '20');
    await requireCuenta(supabase, tenantId, '40');
    await requireCuenta(supabase, tenantId, '42');
    await requireCuenta(supabase, tenantId, '70');
    await requireCuenta(supabase, tenantId, '621');
    await requireCuenta(supabase, tenantId, '411');
    await requireCuenta(supabase, tenantId, '403');

    const cuenta = await createBankAccount(apiContext);
    const venta = await createSaleWithCxc(apiContext);
    const asientoVenta = await waitForAsientoByReference(supabase, tenantId, venta.referencia);
    expectAsientoCuadrado(asientoVenta, 'asiento venta');

    const cxcInicial = await parseOk<any>(await apiContext.get(api(`/finanzas/cxc/${venta.documento.cxc.id}`)), 'obtener CxC T14');
    const cobroRef = `CXC-CON-${runId}`;
    const cobro = await parseOk<any>(
      await apiContext.post(api(`/finanzas/cxc/${venta.documento.cxc.id}/pagos`), {
        data: {
          monto: Number(cxcInicial.monto_pendiente ?? cxcInicial.saldo_pendiente ?? cxcInicial.total),
          fecha_pago: today(),
          metodo_pago: 'TRANSFERENCIA',
          cuenta_bancaria_id: cuenta.id,
          referencia: cobroRef,
        },
      }),
      'cobro cliente T14',
    );
    expect(cobro.estado).toBe('CANCELADO');
    expectAsientoCuadrado(await waitForAsientoByReference(supabase, tenantId, cobroRef), 'asiento cobro cliente');

    const compra = await createPurchaseWithCxp(apiContext);
    expectAsientoCuadrado(await waitForAsientoByReference(supabase, tenantId, compra.referencia), 'asiento compra');

    const cxpInicial = await parseOk<any>(await apiContext.get(api(`/finanzas/cxp/${compra.cxp.id}`)), 'obtener CxP T14');
    const pagoRef = `CXP-CON-${runId}`;
    const pago = await parseOk<any>(
      await apiContext.post(api(`/finanzas/cxp/${compra.cxp.id}/aplicar-pago`), {
        data: {
          monto: Number(cxpInicial.saldo),
          fecha_pago: today(),
          metodo_pago: 'TRANSFERENCIA',
          cuenta_bancaria_id: cuenta.id,
          referencia: pagoRef,
        },
      }),
      'pago proveedor T14',
    );
    expect(pago.cxp?.estado ?? pago.estado).toBe('PAGADA');
    expectAsientoCuadrado(await waitForAsientoByReference(supabase, tenantId, pagoRef), 'asiento pago proveedor');
    expect(pago.movimiento_bancario?.id, 'pago proveedor debe crear movimiento bancario conciliable').toBeTruthy();

    const conciliacion = await parseOk<any>(
      await apiContext.post(api('/finanzas/conciliacion'), {
        data: {
          cuenta_bancaria_id: cuenta.id,
          periodo: today().slice(0, 7),
          fecha_desde: today(),
          fecha_hasta: today(),
        },
      }),
      'crear conciliacion T14',
    );
    const extractoCsv = [
      'Fecha,Descripcion,Referencia,Tipo,Monto',
      `${today()},Pago proveedor T14,${pagoRef},CARGO,${Number(cxpInicial.saldo)}`,
    ].join('\n');
    await parseOk<any>(
      await apiContext.post(api(`/finanzas/conciliacion/${conciliacion.id}/importar-csv`), {
        data: {
          banco: 'GENERICO',
          contenidoCsv: extractoCsv,
        },
      }),
      'importar extracto conciliacion T14',
    );
    const matchConciliacion = await parseOk<any>(
      await apiContext.post(api(`/finanzas/conciliacion/${conciliacion.id}/match-automatico`), {
        data: { tolerancia_dias: 0 },
      }),
      'match automatico conciliacion T14',
    );
    expect(matchConciliacion.matches_realizados, 'conciliacion debe vincular movimiento bancario real').toBeGreaterThanOrEqual(1);
    const { data: movimientoConciliado, error: movimientoConciliadoError } = await supabase
      .from('movimientos_bancarios')
      .select('id, conciliado, conciliacion_id')
      .eq('id', pago.movimiento_bancario.id)
      .eq('tenant_id', tenantId)
      .single();
    expect(movimientoConciliadoError?.message || '', 'consultar movimiento conciliado T14').toBe('');
    expect(movimientoConciliado?.conciliado, 'movimiento bancario debe quedar conciliado').toBe(true);
    expect(movimientoConciliado?.conciliacion_id, 'movimiento bancario debe vincular conciliacion').toBe(conciliacion.id);

    const pos = await createPosSale(apiContext, supabase, tenantId);
    expectAsientoCuadrado(await waitForAsientoByReference(supabase, tenantId, pos.referencia), 'asiento POS');

    const planilla = await createPayroll(supabase, tenantId, apiContext);
    expectAsientoCuadrado(await waitForAsientoByReference(supabase, tenantId, planilla.referencia), 'asiento RRHH');

    const manualRef = `MAN-CON-${runId}`;
    const manual = await parseOk<any>(
      await apiContext.post(api('/contabilidad/asiento-contable'), {
        data: {
          fecha: today(),
          concepto: 'Asiento manual balanceado T14',
          referencia: manualRef,
          detalles: [
            { cuenta_id: cuenta10.id, debe: 10, haber: 0, concepto: 'Debe manual T14' },
            { cuenta_id: cuenta12.id, debe: 0, haber: 10, concepto: 'Haber manual T14' },
          ],
        },
      }),
      'crear asiento manual T14',
    );
    expectAsientoCuadrado(manual, 'asiento manual');

    const reversoRef = `REV-${manualRef}`;
    const reverso = await parseOk<any>(
      await apiContext.post(api('/contabilidad/asiento-contable'), {
        data: {
          fecha: today(),
          concepto: `Reverso ${manualRef}`,
          referencia: reversoRef,
          detalles: [
            { cuenta_id: cuenta10.id, debe: 0, haber: 10, concepto: 'Reverso haber T14' },
            { cuenta_id: cuenta12.id, debe: 10, haber: 0, concepto: 'Reverso debe T14' },
          ],
        },
      }),
      'crear reverso manual T14',
    );
    expectAsientoCuadrado(reverso, 'asiento reverso');

    await expectStatus(
      await apiContext.post(api('/contabilidad/asiento-contable'), {
        data: {
          fecha: today(),
          concepto: 'Asiento descuadrado T14',
          referencia: `BAD-CON-${runId}`,
          detalles: [
            { cuenta_id: cuenta10.id, debe: 10, haber: 0, concepto: 'Debe descuadrado' },
            { cuenta_id: cuenta12.id, debe: 0, haber: 9, concepto: 'Haber descuadrado' },
          ],
        },
      }),
      400,
      'no debe permitir asiento descuadrado',
    );

    const closedYear = 2049;
    const closedMonth = (Number(runId.slice(-2)) % 12) + 1;
    const { error: limpiarPeriodoError } = await supabase
      .from('periodos_contables')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('anio', closedYear)
      .eq('mes', closedMonth);
    expect(limpiarPeriodoError?.message || '', 'limpiar periodo cerrado T14').toBe('');
    const { error: periodoCerradoError } = await supabase.from('periodos_contables').insert({
      tenant_id: tenantId,
      anio: closedYear,
      mes: closedMonth,
      estado: 'CERRADO',
      updated_at: new Date().toISOString(),
    });
    expect(periodoCerradoError?.message || '', 'crear periodo cerrado T14').toBe('');
    await expectStatus(
      await apiContext.post(api('/contabilidad/asiento-contable'), {
        data: {
          fecha: `${closedYear}-${String(closedMonth).padStart(2, '0')}-15`,
          concepto: 'Asiento periodo cerrado T14',
          referencia: `CLOSED-CON-${runId}`,
          detalles: [
            { cuenta_id: cuenta10.id, debe: 10, haber: 0, concepto: 'Debe cerrado' },
            { cuenta_id: cuenta12.id, debe: 0, haber: 10, concepto: 'Haber cerrado' },
          ],
        },
      }),
      400,
      'no debe registrar en periodo cerrado',
    );

    const libroDiario = await parseOk<any>(await apiContext.get(api('/contabilidad/libro-diario')), 'libro diario T14');
    expect(libroDiario.totalAsientos).toBeGreaterThan(0);
    expect(libroDiario.asientos.some((asiento: any) => asiento.referencia === venta.referencia)).toBeTruthy();

    const libroMayor = await parseOk<any[]>(
      await apiContext.get(api(`/contabilidad/libro-mayor-completo?fechaDesde=${today()}&fechaHasta=${today()}`)),
      'libro mayor completo T14',
    );
    expect(libroMayor.length).toBeGreaterThan(0);
    expect(libroMayor.some((cuentaMayor: any) => cuentaMayor.movimientos?.some((mov: any) => {
      const asiento = Array.isArray(mov.asientos_contables) ? mov.asientos_contables[0] : mov.asientos_contables;
      return mov.asiento_id === manual.id || asiento?.referencia === manualRef;
    }))).toBeTruthy();

    const balance = await parseOk<any>(await apiContext.get(api(`/contabilidad/balance-comprobacion?anio=${new Date().getFullYear()}&mes=${new Date().getMonth() + 1}`)), 'balance comprobacion T14');
    expect(balance.totales.cuadrado, 'balance de comprobacion debe cuadrar').toBe(true);

    const asientosListado = await parseOk<any[]>(
      await apiContext.get(api(`/contabilidad/asientos-contables?referencia=${venta.referencia}`)),
      'listar asientos por referencia T14',
    );
    expect(asientosListado.some((asiento) => asiento.referencia === venta.referencia), 'listado debe preservar documento origen').toBeTruthy();

    for (const route of [
      '/dashboard/contabilidad',
      '/dashboard/contabilidad/asientos',
      '/dashboard/contabilidad/estados',
      '/dashboard/contabilidad/periodos',
    ]) {
      await gotoAuthenticated(page, route);
      await expect(page.locator('body')).not.toContainText(/Application error|Unhandled Runtime Error|Verificando autenticación\.\.\.|Cargando.*$/i, { timeout: 30000 });
      await expect(page.locator('body')).toContainText(/Contabilidad|Asientos|Estados|Periodo|Balance/i, { timeout: 20000 });
    }

    expect(browserFailures, 'consola/red sin errores fatales en UI Contabilidad').toEqual([]);
  });
});
