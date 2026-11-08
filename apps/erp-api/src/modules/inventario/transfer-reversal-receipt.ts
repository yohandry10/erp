import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import Decimal from 'decimal.js';

type RecordValue = Record<string, any>;
export interface TransferReversalContext {
  tenantId: string; actorId: string; operationId: string; key: string;
  payload: { tipo: 'TRANSFERENCIA'; fuente_id: string; actor_id: string; motivo: string; guia_remision_id: string | null };
  fingerprint: string;
}
export interface TransferReversalReceipt extends RecordValue {
  cantidad: string;
  idempotent: boolean;
  operation_identity: {
    version: 1; type: 'TRANSFERENCIA_REVERSA'; operation_id: string;
    source_operation_id: string; tenant_id: string; actor_id: string;
    idempotency_key: string; request_payload: TransferReversalContext['payload'];
    request_fingerprint: string; confirmed_at: string;
  };
}
const object = (v: any): v is RecordValue => !!v && typeof v === 'object' && !Array.isArray(v);
const uuid = (v: any): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const nullableUuid = (v: any) => v === null || uuid(v);
const live = (v: any): v is RecordValue => object(v) && ['cached', 'queued', 'offline', 'pending', 'from_cache'].every(k => v[k] === undefined || v[k] === false);
const date = (v: any) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));
const canonical = (v: any): string => JSON.stringify(v, (_k, x) => object(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x);
const btrim = (v: string) => {
  let from = 0, to = v.length;
  while (from < to && v[from] === ' ') from += 1;
  while (to > from && v[to - 1] === ' ') to -= 1;
  return v.slice(from, to);
};
const invalid = (): never => { throw new BadRequestException('La anulación requiere la transferencia original, un motivo y la misma clave de operación.'); };
const unknown = (): never => { throw new ServiceUnavailableException('No se pudo confirmar la anulación completa. Conserve sus datos para consultar el resultado original.'); };
const postgresText = (value: string) => !value.includes('\0') && Buffer.from(value, 'utf8').toString('utf8') === value;

export function normalizeTransferIdentity(tenantId: string, actorId: string, operationId: string) {
  if (![tenantId, actorId, operationId].every(uuid)) return invalid();
  return { tenantId: tenantId.toLowerCase(), actorId: actorId.toLowerCase(), operationId: operationId.toLowerCase() };
}

export function prepareTransferReversalContext(tenantId: string, actorId: string, operationId: string, key: string, body: any): TransferReversalContext {
  const identity = normalizeTransferIdentity(tenantId, actorId, operationId);
  const normalizedKey = typeof key === 'string' ? btrim(key) : '';
  const keyLength = Array.from(normalizedKey).length;
  if (typeof key !== 'string' || keyLength < 8 || keyLength > 180 || !postgresText(normalizedKey)
    || !object(body) || !Object.prototype.hasOwnProperty.call(body, 'motivo') || typeof body.motivo !== 'string'
    || Object.keys(body).some(k => !['motivo', 'guia_remision_id'].includes(k))) return invalid();
  const motivo = btrim(body.motivo);
  if (Array.from(motivo).length < 5 || Array.from(motivo).length > 500 || !motivo.trim() || !postgresText(motivo)
    || !(body.guia_remision_id === undefined || body.guia_remision_id === null || uuid(body.guia_remision_id))) return invalid();
  const payload = { tipo: 'TRANSFERENCIA' as const, fuente_id: identity.operationId, actor_id: identity.actorId,
    motivo, guia_remision_id: body.guia_remision_id == null ? null : body.guia_remision_id.toLowerCase() };
  // This request contains only strings/null. Match jsonb's UTF8 key order and
  // spacing, independently of JS property insertion order.
  const text = '{' + Object.keys(payload).sort((a, b) => Buffer.byteLength(a) - Buffer.byteLength(b) || Buffer.compare(Buffer.from(a), Buffer.from(b)))
    .map(k => JSON.stringify(k) + ': ' + JSON.stringify(payload[k as keyof typeof payload])).join(', ') + '}';
  return { ...identity, key: normalizedKey, payload,
    fingerprint: createHash('sha256').update(text).digest('hex') };
}

const decimal = (v: any, scale: number, positive = false) => typeof v === 'string'
  && new RegExp(`^\\d{1,${18 - scale}}(?:\\.\\d{1,${scale}})?$`).test(v)
  && (positive ? new Decimal(v).gt(0) : new Decimal(v).gte(0));
const frozen = ['moneda', 'moneda_base', 'tipo_cambio', 'costo_unitario', 'valor_total', 'valuacion_estado', 'lote', 'fecha_expiracion'] as const;
function physicalMovement(v: any, parent: any, type: 'SALIDA' | 'ENTRADA', reversed = false): v is RecordValue {
  const origin = reversed ? parent.reversa : parent;
  return live(v) && uuid(v.id) && v.tenant_id === parent.tenant_id && v.producto_id === parent.producto_id
    && v.tipo === type && v.cantidad === parent.cantidad && v.activo === true && v.estado === 'ACTIVO'
    && v.almacen_id === origin[type === 'SALIDA' ? 'almacen_origen_id' : 'almacen_destino_id']
    && nullableUuid(v.ubicacion_id) && v.ubicacion_id === origin[type === 'SALIDA' ? 'ubicacion_origen_id' : 'ubicacion_destino_id'];
}
function movement(v: any, parent: any, type: 'SALIDA' | 'ENTRADA', reversed = false): v is RecordValue {
  return physicalMovement(v, parent, type, reversed)
    && v.valuacion_estado === 'CONFIRMADA' && /^[A-Z]{3}$/.test(v.moneda) && /^[A-Z]{3}$/.test(v.moneda_base)
    && decimal(v.tipo_cambio, 6, true) && decimal(v.costo_unitario, 6) && decimal(v.valor_total, 2)
    && (v.lote === null || typeof v.lote === 'string') && (v.fecha_expiracion === null || date(v.fecha_expiracion));
}

function originalTransfer(d: any, tenantId: string, operationId: string): d is RecordValue {
  return live(d) && d.tipo === 'TRANSFERENCIA' && d.operacion_id === operationId && d.tenant_id === tenantId
    && uuid(d.producto_id) && uuid(d.actor_id) && date(d.created_at) && typeof d.motivo === 'string'
    && uuid(d.almacen_origen_id) && uuid(d.almacen_destino_id) && d.almacen_origen_id !== d.almacen_destino_id
    && decimal(d.cantidad, 6, true) && nullableUuid(d.ubicacion_origen_id) && nullableUuid(d.ubicacion_destino_id)
    && physicalMovement(d.movimiento_salida, d, 'SALIDA') && physicalMovement(d.movimiento_entrada, d, 'ENTRADA')
    && d.movimiento_salida.id !== d.movimiento_entrada.id
    && d.movimiento_salida.created_by === d.actor_id && d.movimiento_entrada.created_by === d.actor_id
    && d.movimiento_salida.referencia_tipo === 'TRANSFERENCIA_SALIDA' && d.movimiento_entrada.referencia_tipo === 'TRANSFERENCIA_ENTRADA'
    && d.movimiento_salida.referencia_id === operationId && d.movimiento_entrada.referencia_id === operationId;
}

/** A blocked preview never presents unconfirmed amounts as a completed receipt. */
export function bindTransferPreview(d: any, tenantId: string, operationId: string) {
  if (!originalTransfer(d, tenantId, operationId)) return unknown();
  if (d.reversa !== null || [d.movimiento_salida, d.movimiento_entrada].every(m => m.valuacion_estado === 'CONFIRMADA')) {
    return { ...bindTransferDetail(d, tenantId, operationId), reversal_check: {
      valuation_confirmed: true, already_reversed: d.reversa !== null, blocked_reason: null,
    } };
  }
  const states = [null, 'CONFIRMADA', 'PENDIENTE_COSTO', 'PENDIENTE_MONEDA', 'PENDIENTE_MONEDA_BASE', 'PENDIENTE_TIPO_CAMBIO'];
  if (![d.movimiento_salida, d.movimiento_entrada].every(m => states.includes(m.valuacion_estado))) return unknown();
  const safe = (m: RecordValue) => Object.fromEntries(['id', 'tenant_id', 'producto_id', 'tipo', 'cantidad', 'almacen_id', 'ubicacion_id',
    'referencia_tipo', 'referencia_id', 'created_by', 'estado', 'activo', 'valuacion_estado'].map(k => [k, m[k]]));
  return { operacion_id: d.operacion_id, tenant_id: d.tenant_id, tipo: d.tipo, producto_id: d.producto_id,
    actor_id: d.actor_id, created_at: d.created_at, motivo: d.motivo, cantidad: d.cantidad,
    almacen_origen_id: d.almacen_origen_id, almacen_destino_id: d.almacen_destino_id,
    ubicacion_origen_id: d.ubicacion_origen_id, ubicacion_destino_id: d.ubicacion_destino_id,
    movimiento_salida: safe(d.movimiento_salida), movimiento_entrada: safe(d.movimiento_entrada), reversa: null,
    reversal_check: { valuation_confirmed: false, already_reversed: false,
      blocked_reason: 'La valuación del traslado original está pendiente. No se puede anular hasta contar con su costo, moneda y tipo de cambio confirmados.' } };
}

/** Validate an atomic SQL read of the original transfer, reversal and both legs. */
export function bindTransferDetail(detail: any, tenantId: string, operationId: string) {
  const d = detail;
  if (!originalTransfer(d, tenantId, operationId) || !movement(d.movimiento_salida, d, 'SALIDA') || !movement(d.movimiento_entrada, d, 'ENTRADA')
    || frozen.slice(0, 6).some(k => d.movimiento_salida[k] !== d.movimiento_entrada[k])) return unknown();
  if (d.reversa !== null) {
    const r = d.reversa, stored = r?.resultado;
    if (!live(r) || !live(stored) || !uuid(r.id) || r.tenant_id !== tenantId || r.tipo !== 'TRANSFERENCIA' || r.fuente_id !== operationId
      || !uuid(r.actor_id) || typeof r.idempotency_key !== 'string' || !date(r.created_at) || !object(r.payload)
      || stored.success !== true || stored.estado !== 'COMPLETADA' || stored.tipo !== 'TRANSFERENCIA_REVERSA' || stored.idempotent !== false
      || stored.reversa_id !== r.id || stored.tenant_id !== tenantId || stored.actor_id !== r.actor_id || stored.operacion_origen_id !== operationId
      || stored.idempotency_key !== r.idempotency_key || stored.request_fingerprint !== r.fingerprint || canonical(stored.payload) !== canonical(r.payload)
      || stored.producto_id !== d.producto_id || stored.cantidad !== d.cantidad || stored.motivo !== r.motivo || stored.created_at !== r.created_at
      || stored.almacen_origen_id !== d.almacen_destino_id || stored.almacen_destino_id !== d.almacen_origen_id
      || stored.ubicacion_origen_id !== d.ubicacion_destino_id || stored.ubicacion_destino_id !== d.ubicacion_origen_id) return unknown();
    let ctx: TransferReversalContext;
    try {
      ctx = prepareTransferReversalContext(tenantId, r.actor_id, operationId, r.idempotency_key,
        { motivo: r.motivo, guia_remision_id: r.payload.guia_remision_id });
    } catch { return unknown(); }
    if (r.fingerprint !== ctx.fingerprint || canonical(r.payload) !== canonical(ctx.payload)) return unknown();
    const withRoute = { ...d, reversa: stored };
    if (!movement(r.movimiento_salida, withRoute, 'SALIDA', true) || !movement(r.movimiento_entrada, withRoute, 'ENTRADA', true)
      || r.movimiento_salida.id !== stored.movimiento_salida_id || r.movimiento_entrada.id !== stored.movimiento_entrada_id
      || r.movimiento_salida.id === r.movimiento_entrada.id) return unknown();
    for (const [current, original] of [[r.movimiento_salida, d.movimiento_entrada], [r.movimiento_entrada, d.movimiento_salida]]) {
      if (current.referencia_tipo !== 'TRANSFERENCIA_REVERSA' || current.referencia_id !== original.id || current.created_by !== r.actor_id
        || !object(current.metadata) || current.metadata.reversa_id !== r.id || current.metadata.source_movement_id !== original.id
        || frozen.some(k => current[k] !== original[k])) return unknown();
    }
    const route = stored.traslado_entre_establecimientos;
    if (!(route === null || live(route) && route.requiere_gre === true && route.motivo_traslado_sunat === '04'
      && uuid(route.sucursal_origen_id) && uuid(route.sucursal_destino_id) && route.sucursal_origen_id !== route.sucursal_destino_id
      && /^\d{4}$/.test(route.establecimiento_origen) && /^\d{4}$/.test(route.establecimiento_destino)
      && nullableUuid(route.guia_remision_id) && route.guia_remision_id === ctx.payload.guia_remision_id)) return unknown();
  }
  return d;
}

export function bindTransferReversalReceipt(rpc: any, detail: any, context: TransferReversalContext): TransferReversalReceipt {
  const d = bindTransferDetail(detail, context.tenantId, context.operationId), r = d.reversa;
  if (!live(rpc) || typeof rpc.idempotent !== 'boolean' || !r || r.actor_id !== context.actorId || r.idempotency_key !== context.key
    || r.fingerprint !== context.fingerprint || canonical(r.payload) !== canonical(context.payload)
    || canonical({ ...rpc, idempotent: false }) !== canonical(r.resultado)) return unknown();
  return { ...rpc, cantidad: rpc.cantidad, idempotent: rpc.idempotent, operation_identity: { version: 1, type: 'TRANSFERENCIA_REVERSA', operation_id: r.id,
    source_operation_id: context.operationId, tenant_id: context.tenantId, actor_id: context.actorId,
    idempotency_key: context.key, request_payload: context.payload, request_fingerprint: context.fingerprint, confirmed_at: r.created_at } };
}

export function bindTransferReversalResolution(value: any, context: TransferReversalContext) {
  if (!live(value)) return unknown();
  if (value.status === 'COMMITTED') {
    if (value.resolution !== undefined) return unknown();
    return { status: 'COMMITTED' as const, receipt: bindTransferReversalReceipt(value.receipt, value.detail, context), detail: value.detail };
  }
  if (value.status !== 'ABANDONED' || value.receipt !== undefined || value.detail !== undefined || !live(value.resolution)) return unknown();
  const r = value.resolution;
  if (!uuid(r.id) || r.type !== 'TRANSFERENCIA_REVERSA' || r.tenant_id !== context.tenantId || r.actor_id !== context.actorId
    || r.source_operation_id !== context.operationId || r.idempotency_key !== context.key || !date(r.confirmed_at)
    || r.request_fingerprint !== context.fingerprint || canonical(r.request_payload) !== canonical(context.payload)) return unknown();
  return { status: 'ABANDONED' as const, resolution: r };
}
