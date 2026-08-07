/**
 * E2E de alistamiento productivo.
 *
 * Ejecuta un flujo transaccional real contra API + Supabase:
 * compra -> recepcion -> inventario -> pedido -> logistica -> documento/CPE/CxC
 * -> GRE -> POS -> outbox/asientos.
 *
 * No se salta silenciosamente: si faltan API, credenciales o efectos reales, falla.
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

throw new Error(
  'E2E productivo con escritura retirado: está prohibido crear datos sintéticos en PROD y DEV está deshabilitado.',
);

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/web/.env.local'), override: false });

const API_BASE_URL = (process.env.API_BASE_URL || 'http://localhost:3002/api').replace(/\/$/, '');
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL || 'admin@erp.local';
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD || 'AdminProd2026!';
// SEC-001: aprobador requiere JWT propio para segregación de funciones.
const TEST_APROBADOR_EMAIL = process.env.TEST_APROBADOR_EMAIL;
const TEST_APROBADOR_PASSWORD = process.env.TEST_APROBADOR_PASSWORD;

type JsonObject = Record<string, any>;

function requiredEnv(name: string, value?: string): string {
  if (!value) {
    throw new Error(`Falta variable requerida para E2E productivo: ${name}`);
  }
  return value;
}

async function api(pathname: string, token: string, init: RequestInit = {}) {
  const response = await fetch(`${API_BASE_URL}${pathname}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  assert.ok(response.ok, `${init.method || 'GET'} ${pathname} HTTP ${response.status}: ${text}`);
  assert.notEqual(body?.success, false, `${init.method || 'GET'} ${pathname} devolvio success=false: ${body?.error || body?.message}`);
  return body;
}

async function login(email = TEST_USER_EMAIL, password = TEST_USER_PASSWORD) {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body: any = await response.json().catch(() => null);
  assert.ok(response.ok, `Login E2E fallo con HTTP ${response.status} para ${email}`);
  assert.ok(body?.access_token, 'Login E2E no devolvio access_token');
  assert.ok(body?.user?.tenant_id, 'Login E2E no devolvio tenant_id');
  return { token: body.access_token as string, user: body.user as JsonObject };
}

async function loginAprobador() {
  if (!TEST_APROBADOR_EMAIL || !TEST_APROBADOR_PASSWORD) {
    throw new Error(
      'SEC-001: TEST_APROBADOR_EMAIL y TEST_APROBADOR_PASSWORD requeridos. ' +
      'Obtener de la respuesta de POST /api/demo/create (aprobador_email, aprobador_password).',
    );
  }
  return login(TEST_APROBADOR_EMAIL, TEST_APROBADOR_PASSWORD);
}

function uniqueRuc(seed: string) {
  return `20${seed.padStart(9, '0').slice(-9)}`;
}

async function selectOrInsert(client: any, table: string, tenantId: string, insert: JsonObject, select = '*') {
  const { data: existing, error: selectError } = await client
    .from(table)
    .select(select)
    .eq('tenant_id', tenantId)
    .limit(1)
    .maybeSingle();
  if (selectError && selectError.code !== 'PGRST116') {
    throw new Error(`No se pudo consultar ${table}: ${selectError.message}`);
  }
  if (existing?.id) return existing;

  const { data, error } = await client.from(table).insert(insert).select(select).single();
  if (error) throw new Error(`No se pudo insertar ${table}: ${error.message}`);
  return data;
}

async function ensureRuntimeData(client: any, tenantId: string, userId: string) {
  const run = Date.now().toString().slice(-9);

  const { error: configUpdateError } = await client
    .from('empresa_config')
    .upsert({
      tenant_id: tenantId,
      ruc: uniqueRuc(run),
      razon_social: 'ERP E2E Production Readiness SAC',
      nombre_comercial: 'ERP E2E',
      email: `erp-e2e-${run}@example.com`,
      direccion: 'Av. Produccion 123',
      direccion_fiscal: 'Av. Produccion 123',
      pais: 'PE',
      moneda_defecto: 'PEN',
      configuracion_completa: true,
      usar_flujo_logistica: true,
      gre_automatico_habilitado: true,
      umbral_gre_automatico: 1,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id' });
  if (configUpdateError) {
    throw new Error(`No se pudo preparar empresa_config: ${configUpdateError.message}`);
  }

  const almacen = await selectOrInsert(client, 'almacenes', tenantId, {
    tenant_id: tenantId,
    codigo: `ALM-E2E-${run}`,
    nombre: 'Almacen E2E Produccion',
    estado: 'ACTIVO',
  });

  const cajaInsert = await client.from('cajas').insert({
    tenant_id: tenantId,
    codigo: `CAJA-E2E-${run}`,
    nombre: 'Caja E2E Produccion',
    estado: 'ACTIVO',
  }).select('*').single();
  if (cajaInsert.error) throw new Error(`No se pudo crear caja E2E: ${cajaInsert.error.message}`);

  const proveedorId = crypto.randomUUID();
  const proveedor = await client
    .from('proveedores')
    .insert({
      id: proveedorId,
      tenant_id: tenantId,
      ruc: uniqueRuc(String(Number(run) + 1)),
      documento_tipo: 'RUC',
      documento_numero: uniqueRuc(String(Number(run) + 1)),
      razon_social: `Proveedor E2E ${run} SAC`,
      nombre_comercial: `Proveedor E2E ${run}`,
      email: `proveedor-e2e-${run}@example.com`,
      condiciones_pago: 'CREDITO_30',
      dias_credito: 30,
      activo: true,
      estado: 'ACTIVO',
    })
    .select('*')
    .single();
  if (proveedor.error) throw new Error(`No se pudo crear proveedor E2E: ${proveedor.error.message}`);

  const productoId = crypto.randomUUID();
  const producto = await client
    .from('productos')
    .insert({
      id: productoId,
      tenant_id: tenantId,
      codigo: `PROD-E2E-${run}`,
      nombre: `Producto E2E ${run}`,
      descripcion: 'Producto creado por E2E productivo',
      precio: 100,
      precio_venta: 100,
      stock: 30,
      stock_reservado: 0,
      unidad_medida: 'NIU',
      activo: true,
      estado: 'ACTIVO',
    })
    .select('*')
    .single();
  if (producto.error) throw new Error(`No se pudo crear producto E2E: ${producto.error.message}`);

  const cliente = await client
    .from('clientes')
    .insert({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      tipo: 'PERSONA',
      documento_tipo: 'DNI',
      numero_documento: `7${run.slice(-7)}`,
      documento_numero: `7${run.slice(-7)}`,
      razon_social: `Cliente E2E ${run}`,
      direccion: 'Av. Cliente 456',
      activo: true,
      estado: 'ACTIVO',
    })
    .select('*')
    .single();
  if (cliente.error) throw new Error(`No se pudo crear cliente E2E: ${cliente.error.message}`);

  return {
    run,
    almacen,
    caja: cajaInsert.data,
    proveedor: proveedor.data,
    producto: producto.data,
    cliente: cliente.data,
    userId,
  };
}

async function assertRows(client: any, table: string, filter: (query: any) => any, message: string) {
  const { data, error } = await filter(client.from(table).select('id').limit(10));
  if (error) throw new Error(`${message}: ${error.message}`);
  assert.ok((data || []).length > 0, message);
}

async function main() {
  const { token, user } = await login();
  const tenantId = user.tenant_id;
  const supabase = createClient(
    requiredEnv('SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL),
    requiredEnv('SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE_KEY),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const data = await ensureRuntimeData(supabase, tenantId, user.id);

  const oc = await api('/compras/ordenes', token, {
    method: 'POST',
    body: JSON.stringify({
      numero: `OC-E2E-${data.run}`,
      proveedor_id: data.proveedor.id,
      fecha_orden: new Date().toISOString(),
      fecha_entrega_esperada: new Date(Date.now() + 86400000).toISOString(),
      condiciones_pago: 'CREDITO_30',
      dias_credito: 30,
      almacen_destino_id: data.almacen.id,
      observaciones: 'OC E2E productiva',
      detalles: [{ producto_id: data.producto.id, descripcion: data.producto.nombre, cantidad: 5, precio_unitario: 80 }],
    }),
  });
  const ocId = oc.data.id;
  const ocDetalleId = oc.data.detalles?.[0]?.id || oc.data.orden_compra_detalles?.[0]?.id;
  assert.ok(ocId, 'La OC debe devolver id');
  assert.ok(ocDetalleId, 'La OC debe devolver detalle id');

  // SEC-001 fix: aprobar con el JWT del aprobador (no del creador).
  const aprobador = await loginAprobador();
  await api(`/compras/ordenes/${ocId}/aprobar`, aprobador.token, {
    method: 'POST',
    body: JSON.stringify({ aprobador_nombre: aprobador.user.email, comentarios: 'Aprobacion E2E' }),
  });

  const recepcion = await api(`/compras/ordenes/${ocId}/recepciones`, token, {
    method: 'POST',
    body: JSON.stringify({
      orden_id: ocId,
      almacen_id: data.almacen.id,
      observaciones: 'Recepcion E2E',
      items: [{ detalle_id: ocDetalleId, cantidad_recibida: 5, calidad: 'OK', almacen_id: data.almacen.id }],
    }),
  });
  const recepcionId = recepcion.data?.id || recepcion.id;
  assert.ok(recepcionId, 'La recepcion debe devolver id');
  await api(`/compras/recepciones/${recepcionId}/cerrar`, token, {
    method: 'POST',
    body: JSON.stringify({ observaciones: 'Cierre recepcion E2E' }),
  });

  const pedido = await api('/ventas/pedidos', token, {
    method: 'POST',
    body: JSON.stringify({
      cliente_id: data.cliente.id,
      notas: 'Pedido E2E productivo',
      detalle: [{ producto_id: data.producto.id, descripcion: data.producto.nombre, cantidad: 2, precio_unitario: 100 }],
    }),
  });
  const pedidoId = pedido.data.id;
  const pedidoDetalleId = pedido.data.detalle?.[0]?.id || pedido.data.pedidos_venta_detalle?.[0]?.id;
  assert.ok(pedidoId, 'El pedido debe devolver id');
  assert.ok(pedidoDetalleId, 'El pedido debe devolver detalle id');

  await api(`/ventas/pedidos/${pedidoId}/confirmar`, token, {
    method: 'POST',
    body: JSON.stringify({ forzar_confirmacion: true }),
  });
  const pendientes = await api('/inventario/logistica/ordenes-pendientes', token);
  assert.ok(JSON.stringify(pendientes).includes(pedidoId), 'El pedido confirmado debe aparecer en ordenes pendientes');

  await api(`/inventario/logistica/${pedidoId}/preparar`, token, {
    method: 'POST',
    body: JSON.stringify({ responsable: user.email, ubicacion: 'E2E', items_preparados: [pedidoDetalleId] }),
  });
  await api(`/inventario/logistica/${pedidoId}/marcar-listo`, token, { method: 'POST', body: '{}' });
  const listos = await api('/inventario/logistica/listo-despacho', token);
  assert.ok(JSON.stringify(listos).includes(pedidoId), 'El pedido preparado debe aparecer listo para despacho');

  await api(`/inventario/logistica/${pedidoId}/confirmar-despacho`, token, {
    method: 'POST',
    body: JSON.stringify({
      almacen_id: data.almacen.id,
      items_despachados: [{ detalle_id: pedidoDetalleId, cantidad: 2, almacen_id: data.almacen.id }],
      transportista: 'Transporte E2E',
      placa: 'E2E-123',
      conductor: 'Conductor E2E',
      bultos: 1,
      peso_total: 1,
    }),
  });

  const documento = await api(`/ventas/pedidos/${pedidoId}/generar-documento`, token, {
    method: 'POST',
    body: JSON.stringify({ tipo_documento: '01' }),
  });
  assert.ok(documento.documento?.id, 'Debe generarse documento fiscal');
  assert.ok(documento.cpe?.id, 'Debe generarse CPE desde pedido');
  assert.ok(documento.cxc?.id, 'Debe generarse CxC desde pedido');

  const gre = await api('/gre/guias', token, {
    method: 'POST',
    body: JSON.stringify({
      destinatario: data.cliente.razon_social,
      direccionDestino: 'Av. Cliente 456',
      fechaTraslado: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      modalidad: 'TRANSPORTE_PRIVADO',
      motivo: 'VENTA',
      pesoTotal: 1,
      transportista: 'Transporte E2E',
      placaVehiculo: 'E2E-123',
      licenciaConducir: 'Q12345678',
      cpeRelacionado: documento.cpe.id,
      pedidoId,
      pedidoNumero: pedido.data.numero,
      idempotencyKey: `gre-e2e-${data.run}`,
    }),
  });
  assert.ok(gre.data?.id, 'Debe generarse GRE');
  assert.match(String(gre.data.estado), /FIRMADO|PENDIENTE|GENERADO/i, 'GRE debe quedar en estado operativo');

  const sesionActual = await api('/pos/sesion-caja', token);
  let sesionId = sesionActual.data?.id;
  if (!sesionId) {
    const cajaAbierta = await api('/pos/caja/abrir', token, {
      method: 'POST',
      body: JSON.stringify({ caja_id: data.caja.id, monto_inicial: 100, dispositivo: 'E2E' }),
    });
    sesionId = cajaAbierta.data?.id || cajaAbierta.data?.sesion_id;
  }
  assert.ok(sesionId, 'Debe abrirse sesion de caja');

  const pos = await api('/pos/venta', token, {
    method: 'POST',
    body: JSON.stringify({
      idempotency_key: `pos-e2e-${data.run}`,
      sesion_caja_id: sesionId,
      cliente_id: data.cliente.id,
      cliente_nombre: data.cliente.razon_social,
      cliente_documento: data.cliente.numero_documento || data.cliente.documento_numero,
      metodo_pago_id: 'efectivo',
      items: [{ producto_id: data.producto.id, cantidad: 1, precio_unitario: 100, subtotal: 100 }],
      subtotal: 100,
      impuestos: 18,
      total: 118,
      permite_venta_sin_stock: false,
    }),
  });
  const posVentaId = pos.venta_id || pos.data?.venta_id;
  assert.ok(posVentaId, 'Debe generarse venta POS real');

  await assertRows(supabase, 'cuentas_por_cobrar', (q) => q.eq('tenant_id', tenantId).eq('documento_id', documento.documento.id), 'Debe existir CxC del documento');
  await assertRows(supabase, 'cuentas_por_pagar', (q) => q.eq('tenant_id', tenantId).eq('orden_id', ocId), 'Debe existir CxP de la compra/recepcion');
  await assertRows(
    supabase,
    'movimientos_inventario',
    (q) => q
      .eq('tenant_id', tenantId)
      .eq('producto_id', data.producto.id)
      .eq('referencia_id', posVentaId)
      .eq('referencia_tipo', 'VENTA_POS')
      .eq('tipo', 'SALIDA'),
    'Debe existir Kardex real de salida POS',
  );
  await assertRows(supabase, 'outbox_events', (q) => q.eq('tenant_id', tenantId).in('aggregate_type', ['venta_pos', 'recepcion', 'cobro', 'pago']), 'Debe existir outbox de eventos criticos');
  await assertRows(supabase, 'asientos_contables', (q) => q.eq('tenant_id', tenantId), 'Debe existir al menos un asiento contable del tenant');

  console.log(JSON.stringify({
    ok: true,
    tenantId,
    ocId,
    recepcionId,
    pedidoId,
    documentoId: documento.documento.id,
    cpeId: documento.cpe.id,
    cxcId: documento.cxc.id,
    greId: gre.data.id,
    posVentaId,
  }, null, 2));
}

void main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});
