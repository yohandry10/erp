import { APIRequestContext, APIResponse, Page, expect, request as playwrightRequest, test } from '@playwright/test';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { gotoAuthenticated, login } from './helpers/auth';
import { generateValidRucFromRunId, apiContextAsAprobador } from './helpers/test-data';

type ApiEnvelope<T> = { success?: boolean; data?: T; message?: string; error?: string };

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
  expect(url, 'SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL requerido para E2E Finanzas').toBeTruthy();
  expect(key, 'SUPABASE_SERVICE_ROLE_KEY requerido para E2E Finanzas').toBeTruthy();
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

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const today = () => new Date().toISOString().split('T')[0];
const futureDate = () => new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
const pastDate = () => new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
const cxcSaldo = (cuenta: any) => Number(cuenta.monto_pendiente ?? cuenta.saldo_pendiente ?? cuenta.saldo ?? 0);
const cxcTotal = (cuenta: any) => Number(cuenta.monto_total ?? cuenta.total ?? 0);

async function createBankAccount(apiContext: APIRequestContext) {
  return parseOk<any>(
    await apiContext.post(api('/finanzas/bancos/cuentas'), {
      data: {
        nombre: `Banco Finanzas T13 ${runId}`,
        banco: 'GENERICO',
        numero_cuenta: `T13-${runId}`,
        tipo_cuenta: 'CORRIENTE',
        moneda: 'PEN',
        saldo: 10000,
        permite_sobregiro: false,
        activa: true,
      },
    }),
    'crear cuenta bancaria T13',
  );
}

async function createSaleWithCxc(apiContext: APIRequestContext) {
  const cliente = await parseOk<any>(
    await apiContext.post(api('/ventas/clientes'), {
      data: {
        tipo: 'PERSONA',
        documento_tipo: 'DNI',
        documento_numero: runId.slice(-8),
        razon_social: `Cliente Finanzas T13 ${runId}`,
        direccion: 'Av. Finanzas Ventas 1300',
        email: `cliente-finanzas-${runId}@example.com`,
      },
    }),
    'crear cliente T13',
  );

  const producto = await parseOk<any>(
    await apiContext.post(api('/inventario/productos'), {
      data: {
        codigo: `FIN-V-${runId}`,
        nombre: `Producto Venta Finanzas ${runId}`,
        categoria: 'AUDITORIA',
        precio_compra: 40,
        precio_venta: 118,
        stock: 5,
        stock_minimo: 0,
        controla_stock: true,
      },
    }),
    'crear producto venta T13',
  );

  const pedido = await parseOk<any>(
    await apiContext.post(api('/ventas/pedidos'), {
      data: {
        cliente_id: cliente.id,
        detalle: [{ producto_id: producto.id, descripcion: producto.nombre, cantidad: 1, precio_unitario: 118 }],
        notas: 'Venta credito T13',
      },
    }),
    'crear pedido venta T13',
  );

  await parseOk<any>(
    await apiContext.post(api(`/ventas/pedidos/${pedido.id}/confirmar`), { data: { forzar_confirmacion: false } }),
    'confirmar pedido venta T13',
  );

  const documento = await parseOk<any>(
    await apiContext.post(api(`/ventas/pedidos/${pedido.id}/generar-documento`), { data: { tipo_documento: '03' } }),
    'generar documento venta credito T13',
  );
  expect(documento.cxc?.id, 'la venta a credito debe crear CxC').toBeTruthy();
  return { cliente, documento };
}

async function createPurchaseWithCxp(apiContext: APIRequestContext) {
  const almacenes = await parseOk<any[]>(await apiContext.get(api('/inventario/almacenes')), 'listar almacenes T13');
  expect(almacenes.length, 'debe existir almacen para compra T13').toBeGreaterThan(0);
  const almacenId = almacenes[0].id;

  const proveedor = await parseOk<any>(
    await apiContext.post(api('/compras/proveedores'), {
      data: {
        ruc: generateValidRucFromRunId(runId, '20'),
        razon_social: `Proveedor Finanzas T13 ${runId} S.A.C.`,
        nombre_comercial: `Proveedor Finanzas ${runId}`,
        email: `proveedor-finanzas-${runId}@example.com`,
        direccion: 'Av. Finanzas Compras 1300',
        condiciones_pago: 'CREDITO_30',
        dias_credito: 30,
      },
    }),
    'crear proveedor T13',
  );

  const producto = await parseOk<any>(
    await apiContext.post(api('/inventario/productos'), {
      data: {
        codigo: `FIN-C-${runId}`,
        nombre: `Producto Compra Finanzas ${runId}`,
        categoria: 'AUDITORIA',
        precio_compra: 200,
        precio_venta: 260,
        stock: 0,
        stock_minimo: 0,
        controla_stock: true,
        almacen_id: almacenId,
      },
    }),
    'crear producto compra T13',
  );

  const orden = await parseOk<any>(
    await apiContext.post(api('/compras/ordenes'), {
      data: {
        numero: `OC-FIN-${runId}`,
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
    'crear orden compra T13',
  );
  const detalleId = orden.detalles?.[0]?.id ?? orden.detalle?.[0]?.id;
  expect(detalleId, 'orden compra T13 debe devolver detalle').toBeTruthy();

  // SEC-001 fix: aprobador autentica con su propio JWT.
  const aprobadorCtx = await apiContextAsAprobador();
  try {
    await parseOk<any>(
      await aprobadorCtx.post(api(`/compras/ordenes/${orden.id}/aprobar`), {
        data: { aprobador_nombre: 'Admin Finanzas T13', comentarios: 'Aprobacion T13' },
      }),
      'aprobar orden compra T13',
    );
  } finally {
    await aprobadorCtx.dispose();
  }

  const recepcion = await parseOk<any>(
    await apiContext.post(api(`/compras/recepciones/ordenes/${orden.id}`), {
      data: {
        orden_id: orden.id,
        almacen_id: almacenId,
        observaciones: 'Recepcion Finanzas T13',
        items: [{ detalle_id: detalleId, cantidad_recibida: 1, calidad: 'OK', almacen_id: almacenId }],
      },
    }),
    'crear recepcion compra T13',
  );

  const cerrada = await parseOk<any>(
    await apiContext.post(api(`/compras/recepciones/${recepcion.id}/cerrar`), {
      data: { observaciones: 'Cierre recepcion Finanzas T13' },
    }),
    'cerrar recepcion compra T13',
  );

  await expect.poll(async () => {
    const data = await parseOk<any[]>(await apiContext.get(api(`/finanzas/cxp?proveedor_id=${proveedor.id}`)), 'listar CxP T13');
    return data.find((item) => item.referencia_id === cerrada.id || item.numero_documento === cerrada.numero) ?? null;
  }, { message: 'la compra a credito debe crear CxP', timeout: 30000 }).not.toBeNull();

  const cxps = await parseOk<any[]>(await apiContext.get(api(`/finanzas/cxp?proveedor_id=${proveedor.id}`)), 'listar CxP T13 final');
  const cxp = cxps.find((item) => item.referencia_id === cerrada.id || item.numero_documento === cerrada.numero);
  expect(cxp?.id, 'CxP de compra T13 persistida').toBeTruthy();
  return { proveedor, cxp };
}

async function ensureMetodoPago(supabase: SupabaseClient, tenantId: string) {
  const { data: existing, error: selectError } = await supabase
    .from('metodos_pago')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('codigo', 'efectivo')
    .limit(1)
    .maybeSingle();
  expect(selectError?.message || '', 'consultar metodo efectivo').toBe('');
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
  expect(error?.message || '', 'crear metodo efectivo').toBe('');
  return data;
}

async function createPosCashMovement(apiContext: APIRequestContext, supabase: SupabaseClient, tenantId: string) {
  await supabase.from('empresa_config').upsert({
    tenant_id: tenantId,
    ruc: `20${runId.padStart(9, '0').slice(-9)}`,
    razon_social: 'ERP Finanzas E2E SAC',
    nombre_comercial: 'ERP Finanzas E2E',
    email: `finanzas-e2e-${runId}@example.com`,
    direccion: 'Av. Finanzas POS 1300',
    direccion_fiscal: 'Av. Finanzas POS 1300',
    pais: 'PE',
    moneda_defecto: 'PEN',
    configuracion_completa: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'tenant_id' });

  const { data: caja, error: cajaError } = await supabase.from('cajas').insert({
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    codigo: `CAJA-FIN-${runId}`,
    nombre: `Caja Finanzas ${runId}`,
    estado: 'ACTIVO',
  }).select('*').single();
  expect(cajaError?.message || '', 'crear caja Finanzas T13').toBe('');

  const metodoPago = await ensureMetodoPago(supabase, tenantId);

  const { data: producto, error: productoError } = await supabase.from('productos').insert({
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    codigo: `POS-FIN-${runId}`,
    codigo_barras: `779${runId}`,
    nombre: `Producto POS Finanzas ${runId}`,
    categoria: 'AUDITORIA',
    precio: 50,
    precio_venta: 50,
    precio_unitario: 50,
    stock: '3',
    stock_actual: '3',
    stock_reservado: '0',
    stock_minimo: '0',
    unidad_medida: 'NIU',
    activo: true,
    estado: 'ACTIVO',
    controla_stock: true,
    es_servicio: false,
  }).select('*').single();
  expect(productoError?.message || '', 'crear producto POS Finanzas T13').toBe('');

  const sesionActual = await parseOk<any>(await apiContext.get(api('/pos/sesion-caja')), 'consultar sesion POS T13');
  let sesionId = sesionActual?.id;
  if (!sesionId) {
    const abierta = await parseOk<any>(
      await apiContext.post(api('/pos/caja/abrir'), {
        data: { caja_id: caja.id, monto_inicial: 100, dispositivo: `E2E-FIN-${runId}` },
      }),
      'abrir caja POS T13',
    );
    sesionId = abierta.id || abierta.sesion_id;
  }
  expect(sesionId, 'debe existir sesion POS para movimiento de caja').toBeTruthy();

  const venta = await parseOk<any>(
    await apiContext.post(api('/pos/venta'), {
      data: {
        idempotency_key: `pos-fin-${runId}`,
        sesion_caja_id: sesionId,
        cliente_nombre: `Cliente POS Finanzas ${runId}`,
        cliente_documento: `7${runId.slice(-7)}`,
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
    'procesar POS efectivo T13',
  );

  const { data: movimientosCaja, error: cajaMovError } = await supabase
    .from('movimientos_caja')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('referencia_tipo', 'venta_pos')
    .eq('referencia_documento', venta.venta_id);
  expect(cajaMovError?.message || '', 'consultar movimiento de caja POS T13').toBe('');
  expect(movimientosCaja || []).toHaveLength(1);
  expect(Number(movimientosCaja![0].monto)).toBe(59);
  return venta;
}

test.describe('T13 Finanzas completo', () => {
  test.setTimeout(600000);

  test('ventas, compras, POS, bancos y conciliacion cuadran saldos, estados y persistencia', async ({ page }) => {
    const browserFailures = await collectBrowserFailures(page);
    await login(page);
    const { headers, tenantId } = await authContext(page);
    const supabase = getSupabase();
    const apiContext = await playwrightRequest.newContext({
      baseURL: apiBaseURL,
      extraHTTPHeaders: headers,
      storageState: { cookies: [], origins: [] },
    });

    const cuenta = await createBankAccount(apiContext);
    const venta = await createSaleWithCxc(apiContext);
    const cxcId = venta.documento.cxc.id;

    await supabase.from('cuentas_por_cobrar').update({
      fecha_vencimiento: futureDate(),
      estado: 'PENDIENTE',
    }).eq('id', cxcId).eq('tenant_id', tenantId);

    const cxcNoVencida = await parseOk<any[]>(await apiContext.get(api(`/finanzas/cxc?cliente_id=${venta.cliente.id}&vencidas=false`)), 'CxC vencidas=false');
    expect(cxcNoVencida.some((item) => item.id === cxcId), 'vencidas=false no debe convertirse en true').toBeTruthy();
    const cxcVencidasAntes = await parseOk<any[]>(await apiContext.get(api(`/finanzas/cxc?cliente_id=${venta.cliente.id}&vencidas=true`)), 'CxC vencidas=true futuro');
    expect(cxcVencidasAntes.some((item) => item.id === cxcId), 'CxC futura no debe aparecer como vencida').toBeFalsy();

    const cxcInicial = await parseOk<any>(await apiContext.get(api(`/finanzas/cxc/${cxcId}`)), 'obtener CxC inicial');
    const totalCxc = cxcTotal(cxcInicial);
    const cobroParcial = round2(totalCxc * 0.4);
    const cxcParcial = await parseOk<any>(
      await apiContext.post(api(`/finanzas/cxc/${cxcId}/pagos`), {
        data: {
          monto: cobroParcial,
          fecha_pago: today(),
          metodo_pago: 'TRANSFERENCIA',
          cuenta_bancaria_id: cuenta.id,
          referencia: `CXC-P1-${runId}`,
        },
      }),
      'cobro parcial CxC T13',
    );
    expect(cxcParcial.estado).toBe('PARCIAL');
    expect(cxcSaldo(cxcParcial)).toBe(round2(totalCxc - cobroParcial));

    await expectStatus(
      await apiContext.post(api(`/finanzas/cxc/${cxcId}/pagos`), {
        data: { monto: round2(cxcSaldo(cxcParcial) + 1), fecha_pago: today(), metodo_pago: 'TRANSFERENCIA', referencia: `CXC-OVER-${runId}` },
      }),
      400,
      'no debe cobrar mas que el saldo CxC',
    );

    await expectStatus(
      await apiContext.post(api('/finanzas/cxc/00000000-0000-4000-8000-000000000013/pagos'), {
        data: { monto: 1, fecha_pago: today(), metodo_pago: 'TRANSFERENCIA', referencia: `CXC-NOEXISTE-${runId}` },
      }),
      404,
      'no debe cobrar CxC inexistente',
    );

    const cxcCancelada = await parseOk<any>(
      await apiContext.post(api(`/finanzas/cxc/${cxcId}/pagos`), {
        data: {
          monto: cxcSaldo(cxcParcial),
          fecha_pago: today(),
          metodo_pago: 'TRANSFERENCIA',
          cuenta_bancaria_id: cuenta.id,
          referencia: `CXC-P2-${runId}`,
        },
      }),
      'cobro total CxC T13',
    );
    expect(cxcCancelada.estado).toBe('CANCELADO');
    expect(cxcSaldo(cxcCancelada)).toBe(0);

    const compra = await createPurchaseWithCxp(apiContext);
    const cxpInicial = await parseOk<any>(await apiContext.get(api(`/finanzas/cxp/${compra.cxp.id}`)), 'obtener CxP inicial');
    const totalCxp = Number(cxpInicial.saldo);
    const pagoParcial = 50.25;
    const cxpParcial = await parseOk<any>(
      await apiContext.post(api(`/finanzas/cxp/${compra.cxp.id}/aplicar-pago`), {
        data: {
          monto: pagoParcial,
          fecha_pago: today(),
          metodo_pago: 'TRANSFERENCIA',
          cuenta_bancaria_id: cuenta.id,
          referencia: `CXP-P1-${runId}`,
        },
      }),
      'pago parcial CxP T13',
    );
    expect(cxpParcial.cxp?.estado ?? cxpParcial.estado).toBe('PARCIAL');
    expect(Number(cxpParcial.cxp?.saldo ?? cxpParcial.saldo)).toBe(round2(totalCxp - pagoParcial));

    await expectStatus(
      await apiContext.post(api(`/finanzas/cxp/${compra.cxp.id}/aplicar-pago`), {
        data: { monto: round2(Number(cxpParcial.cxp?.saldo ?? cxpParcial.saldo) + 1), fecha_pago: today(), metodo_pago: 'TRANSFERENCIA', referencia: `CXP-OVER-${runId}` },
      }),
      400,
      'no debe pagar mas que el saldo CxP',
    );

    const cxpPagada = await parseOk<any>(
      await apiContext.post(api(`/finanzas/cxp/${compra.cxp.id}/aplicar-pago`), {
        data: {
          monto: Number(cxpParcial.cxp?.saldo ?? cxpParcial.saldo),
          fecha_pago: today(),
          metodo_pago: 'TRANSFERENCIA',
          cuenta_bancaria_id: cuenta.id,
          referencia: `CXP-P2-${runId}`,
        },
      }),
      'pago total CxP T13',
    );
    expect(cxpPagada.cxp?.estado ?? cxpPagada.estado).toBe('PAGADA');
    expect(Number(cxpPagada.cxp?.saldo ?? cxpPagada.saldo)).toBe(0);

    const cxpVencida = await parseOk<any>(
      await apiContext.post(api('/finanzas/cxp'), {
        data: {
          proveedor_id: compra.proveedor.id,
          numero_documento: `VENC-FIN-${runId}`,
          fecha_emision: pastDate(),
          fecha_vencimiento: pastDate(),
          condiciones_pago: 'CREDITO_30',
          dias_credito: 30,
          subtotal: 100,
          igv: 18,
          total: 118,
          moneda: 'PEN',
          observaciones: 'CxP vencida para reporte Finanzas T13',
        },
      }),
      'crear CxP vencida para reporte T13',
    );
    const aging = await parseOk<any>(await apiContext.get(api(`/finanzas/cxp/aging?proveedor_id=${compra.proveedor.id}`)), 'reporte aging CxP');
    expect(
      aging.detalle?.some((item: any) => item.id === cxpVencida.id) ?? false,
      'aging debe reflejar la CxP vencida creada por el test',
    ).toBeTruthy();

    await createPosCashMovement(apiContext, supabase, tenantId);

    const autoMov = await parseOk<any>(
      await apiContext.post(api('/finanzas/bancos/movimientos'), {
        data: { cuenta_bancaria_id: cuenta.id, tipo: 'ABONO', monto: 77.77, fecha: today(), descripcion: 'Movimiento auto T13', referencia: `AUTO-${runId}` },
      }),
      'crear movimiento bancario automatico T13',
    );
    expect(Number(autoMov.monto)).toBe(77.77);

    const noConciliados = await parseOk<any[]>(
      await apiContext.get(api(`/finanzas/bancos/cuentas/${cuenta.id}/movimientos?conciliado=false&limit=100`)),
      'filtrar movimientos no conciliados',
    );
    expect(noConciliados.some((mov) => mov.id === autoMov.id), 'conciliado=false debe traer no conciliados').toBeTruthy();
    const conciliadosAntes = await parseOk<any[]>(
      await apiContext.get(api(`/finanzas/bancos/cuentas/${cuenta.id}/movimientos?conciliado=true&limit=100`)),
      'filtrar movimientos conciliados antes',
    );
    expect(conciliadosAntes.some((mov) => mov.id === autoMov.id), 'conciliado=true no debe traer no conciliados').toBeFalsy();

    const periodo = today().slice(0, 7);
    const conciliacion = await parseOk<any>(
      await apiContext.post(api('/finanzas/conciliacion'), {
        data: { cuenta_bancaria_id: cuenta.id, periodo, fecha_desde: today(), fecha_hasta: today() },
      }),
      'crear conciliacion T13',
    );
    await parseOk<any>(
      await apiContext.post(api(`/finanzas/conciliacion/${conciliacion.id}/importar-csv`), {
        data: {
          banco: 'GENERICO',
          contenidoCsv: [
            'Fecha,Descripcion,Referencia,Tipo,Monto',
            `${today()},Movimiento auto T13,AUTO-${runId},ABONO,77.77`,
            `${today()},Movimiento manual T13,MAN-EXT-${runId},CARGO,33.33`,
            `${today()},Movimiento mismatch T13,MISMATCH-EXT-${runId},ABONO,44.45`,
          ].join('\n'),
        },
      }),
      'importar extracto T13',
    );
    const matchAuto = await parseOk<any>(
      await apiContext.post(api(`/finanzas/conciliacion/${conciliacion.id}/match-automatico`), { data: { tolerancia_dias: 0 } }),
      'match automatico conciliacion T13',
    );
    expect(matchAuto.matches_realizados).toBeGreaterThanOrEqual(1);

    const manualMov = await parseOk<any>(
      await apiContext.post(api('/finanzas/bancos/movimientos'), {
        data: { cuenta_bancaria_id: cuenta.id, tipo: 'CARGO', monto: 33.33, fecha: today(), descripcion: 'Movimiento manual T13', referencia: `MAN-SYS-${runId}` },
      }),
      'crear movimiento manual T13',
    );
    const extractosPendientes = await parseOk<any[]>(
      await apiContext.get(api(`/finanzas/bancos/cuentas/${cuenta.id}/movimientos?conciliado=false&es_extracto=true&conciliacion_id=${conciliacion.id}&limit=100`)),
      'listar extractos pendientes manuales T13',
    );
    const manualExtracto = extractosPendientes.find((mov) => mov.referencia === `MAN-EXT-${runId}`);
    expect(manualExtracto?.id, 'debe existir extracto manual pendiente').toBeTruthy();

    await parseOk<any>(
      await apiContext.post(api(`/finanzas/conciliacion/${conciliacion.id}/marcar-item`), {
        data: { movimiento_sistema_id: manualMov.id, movimiento_extracto_id: manualExtracto.id },
      }),
      'conciliacion manual T13',
    );
    await expectStatus(
      await apiContext.post(api(`/finanzas/conciliacion/${conciliacion.id}/marcar-item`), {
        data: { movimiento_sistema_id: manualMov.id, movimiento_extracto_id: manualExtracto.id },
      }),
      400,
      'no debe conciliar movimiento ya conciliado',
    );

    const mismatchMov = await parseOk<any>(
      await apiContext.post(api('/finanzas/bancos/movimientos'), {
        data: {
          cuenta_bancaria_id: cuenta.id,
          tipo: 'ABONO',
          monto: 44.44,
          fecha: today(),
          descripcion: 'Movimiento mismatch T13',
          referencia: `MISMATCH-SYS-${runId}`,
        },
      }),
      'crear movimiento mismatch T13',
    );
    const extractosMismatch = await parseOk<any[]>(
      await apiContext.get(api(`/finanzas/bancos/cuentas/${cuenta.id}/movimientos?conciliado=false&es_extracto=true&conciliacion_id=${conciliacion.id}&limit=100`)),
      'listar extracto mismatch T13',
    );
    const mismatchExtracto = extractosMismatch.find((mov) => mov.referencia === `MISMATCH-EXT-${runId}`);
    expect(mismatchExtracto?.id, 'debe existir extracto mismatch pendiente').toBeTruthy();
    await expectStatus(
      await apiContext.post(api(`/finanzas/conciliacion/${conciliacion.id}/marcar-item`), {
        data: { movimiento_sistema_id: mismatchMov.id, movimiento_extracto_id: mismatchExtracto.id },
      }),
      400,
      'no debe conciliar montos distintos sin autorizacion explicita',
    );

    const conciliadosDespues = await parseOk<any[]>(
      await apiContext.get(api(`/finanzas/bancos/cuentas/${cuenta.id}/movimientos?conciliado=true&limit=100`)),
      'filtrar movimientos conciliados despues',
    );
    expect(conciliadosDespues.some((mov) => mov.id === autoMov.id)).toBeTruthy();
    expect(conciliadosDespues.some((mov) => mov.id === manualMov.id)).toBeTruthy();

    const saldos = await parseOk<any>(await apiContext.get(api('/finanzas/bancos/saldos')), 'reporte saldos bancarios T13');
    expect(saldos.total_cuentas).toBeGreaterThan(0);
    await parseOk<any[]>(await apiContext.get(api('/finanzas/conciliacion/pendientes')), 'reporte conciliaciones pendientes T13');
    await parseOk<any[]>(await apiContext.get(api('/finanzas/conciliacion/plantillas-csv')), 'plantillas CSV T13');
    await parseOk<any>(await apiContext.get(api('/finanzas/cxp/vencimientos?dias=90')), 'reporte vencimientos CxP T13');

    for (const route of [
      '/dashboard/finanzas/cxc',
      '/dashboard/finanzas/cxp',
      '/dashboard/finanzas/bancos',
      '/dashboard/finanzas/conciliacion',
      '/dashboard/finanzas/reportes',
    ]) {
      await gotoAuthenticated(page, route);
      await expect(page.locator('body')).not.toContainText(/Application error|Unhandled Runtime Error|Cargando.*$/i, { timeout: 30000 });
      await expect(page.locator('body')).toContainText(/Finanzas|Cuentas|Bancos|Conciliaci[oó]n|Reportes/i, { timeout: 20000 });
    }

    expect(browserFailures, 'consola/red sin errores fatales en UI Finanzas').toEqual([]);
  });
});
