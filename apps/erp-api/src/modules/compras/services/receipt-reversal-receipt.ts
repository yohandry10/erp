import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import Decimal from 'decimal.js';

type RecordValue = Record<string, any>;
export interface ReceiptReversalContext {
  tenantId: string; actorId: string; receiptId: string; key: string; fingerprint: string;
  payload: { tipo: 'RECEPCION'; fuente_id: string; actor_id: string; motivo: string; fecha_contable: string };
}
export interface ReceiptReversalReceipt extends RecordValue {
  idempotent: boolean;
  contabilidad: { estado: 'PENDIENTE'; event_id: string; original_event_id: string };
  operation_identity: { version: 1; type: 'RECEPCION_REVERSA'; operation_id: string; source_operation_id: string;
    tenant_id: string; actor_id: string; idempotency_key: string; request_payload: ReceiptReversalContext['payload'];
    request_fingerprint: string; confirmed_at: string };
}
const object = (v: any): v is RecordValue => !!v && typeof v === 'object' && !Array.isArray(v);
const uuid = (v: any): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const nullableUuid = (v: any) => v === null || uuid(v);
const live = (v: any): v is RecordValue => object(v) && ['cached', 'queued', 'offline', 'pending', 'from_cache'].every(k => v[k] === undefined || v[k] === false);
const canonical = (v: any): string => JSON.stringify(v, (_key, x) => object(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x);
const btrim = (v: string) => {
  let from = 0, to = v.length;
  while (from < to && v[from] === ' ') from += 1;
  while (to > from && v[to - 1] === ' ') to -= 1;
  return v.slice(from, to);
};
const postgresText = (v: string) => !v.includes('\0') && Buffer.from(v, 'utf8').toString('utf8') === v;
const timestamp = (v: any) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));
const civilDate = (v: any) => typeof v === 'string' && /^(?:20\d{2}|2100)-\d{2}-\d{2}$/.test(v)
  && Number.isFinite(Date.parse(v + 'T00:00:00Z')) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;
const invalid = (): never => { throw new BadRequestException('La anulación requiere la recepción, el motivo, la fecha contable y la clave originales.'); };
const unknown = (): never => { throw new ServiceUnavailableException('No se pudo confirmar la anulación completa. Conserve la intención original para consultar su resultado.'); };
const decimal = (v: any, scale: number, positive = false) => typeof v === 'string' && new RegExp(`^\\d{1,${18 - scale}}(?:\\.\\d{1,${scale}})?$`).test(v)
  && (positive ? new Decimal(v).gt(0) : new Decimal(v).gte(0));
const uniqueIds = (values: any[]) => values.every(uuid) && new Set(values).size === values.length;

export function prepareReceiptReversalContext(tenantId: string, actorId: string, receiptId: string, key: string, body: any): ReceiptReversalContext {
  if (![tenantId, actorId, receiptId].every(uuid) || typeof key !== 'string' || !postgresText(key) || !object(body)
    || !['motivo', 'fecha_contable'].every(k => Object.prototype.hasOwnProperty.call(body, k))
    || Object.keys(body).some(k => !['motivo', 'fecha_contable'].includes(k)) || typeof body.motivo !== 'string') return invalid();
  const normalizedKey = btrim(key), motivo = btrim(body.motivo);
  if (Array.from(normalizedKey).length < 8 || Array.from(normalizedKey).length > 180 || !postgresText(motivo)
    || Array.from(motivo).length < 5 || Array.from(motivo).length > 500 || !motivo.trim() || !civilDate(body.fecha_contable)) return invalid();
  const payload = { tipo: 'RECEPCION' as const, fuente_id: receiptId.toLowerCase(), actor_id: actorId.toLowerCase(), motivo, fecha_contable: body.fecha_contable };
  const text = '{' + Object.keys(payload).sort((a, b) => Buffer.byteLength(a) - Buffer.byteLength(b) || Buffer.compare(Buffer.from(a), Buffer.from(b)))
    .map(k => JSON.stringify(k) + ': ' + JSON.stringify(payload[k as keyof typeof payload])).join(', ') + '}';
  return { tenantId: tenantId.toLowerCase(), actorId: actorId.toLowerCase(), receiptId: receiptId.toLowerCase(), key: normalizedKey, payload,
    fingerprint: createHash('sha256').update(text).digest('hex') };
}

function movement(v: any, tenantId: string, type: string): v is RecordValue {
  return live(v) && uuid(v.id) && v.tenant_id === tenantId && uuid(v.producto_id) && uuid(v.almacen_id) && nullableUuid(v.ubicacion_id)
    && v.tipo === type && v.activo === true && v.estado === 'ACTIVO' && decimal(v.cantidad, 6, true)
    && v.valuacion_estado === 'CONFIRMADA' && /^[A-Z]{3}$/.test(v.moneda) && /^[A-Z]{3}$/.test(v.moneda_base)
    && decimal(v.tipo_cambio, 6, true) && decimal(v.costo_unitario, 6) && decimal(v.valor_total, 2)
    && (v.lote === null || typeof v.lote === 'string') && (v.fecha_expiracion === null || timestamp(v.fecha_expiracion)) && live(v.metadata);
}

/** SQL detail binds every opposite movement to the immutable original ledger. */
export function bindReceiptReversalReceipt(rpc: any, detail: any, context: ReceiptReversalContext): ReceiptReversalReceipt {
  if (!live(rpc) || !live(detail) || !live(detail.reversa) || !live(detail.recepcion)) return unknown();
  const r = detail.reversa, receipt = detail.recepcion, stored = r.resultado, snapshot = r.fuente_snapshot;
  if (!live(stored) || !live(snapshot) || !uuid(r.id) || r.tipo !== 'RECEPCION' || r.tenant_id !== context.tenantId || r.fuente_id !== context.receiptId
    || r.actor_id !== context.actorId || r.idempotency_key !== context.key || r.fingerprint !== context.fingerprint
    || canonical(r.payload) !== canonical(context.payload) || r.motivo !== context.payload.motivo || !timestamp(r.created_at)
    || typeof rpc.idempotent !== 'boolean' || canonical({ ...rpc, idempotent: false }) !== canonical(stored)
    || stored.idempotent !== false || stored.success !== true || stored.tipo !== 'RECEPCION_REVERSA' || stored.estado !== 'ANULADA'
    || stored.reversa_id !== r.id || stored.tenant_id !== context.tenantId || stored.actor_id !== context.actorId || stored.recepcion_id !== context.receiptId
    || stored.idempotency_key !== context.key || stored.request_fingerprint !== context.fingerprint || canonical(stored.payload) !== canonical(context.payload)
    || stored.motivo !== context.payload.motivo || stored.fecha_contable !== context.payload.fecha_contable || stored.created_at !== r.created_at
    || !uuid(stored.orden_id) || !['APROBADA', 'PARCIAL', 'RECIBIDA'].includes(stored.orden_estado)
    || receipt.id !== context.receiptId || receipt.tenant_id !== context.tenantId || receipt.orden_id !== stored.orden_id || receipt.estado !== 'ANULADA'
    || receipt.inventario_reversa_id !== r.id || receipt.anulado_por !== context.actorId || receipt.updated_by !== context.actorId
    || receipt.anulado_at !== r.created_at || receipt.motivo_anulacion !== context.payload.motivo
    || !live(snapshot.recepcion) || snapshot.recepcion.id !== context.receiptId || snapshot.recepcion.tenant_id !== context.tenantId
    || snapshot.recepcion.orden_id !== stored.orden_id || snapshot.recepcion.estado !== 'CERRADA'
    || !live(stored.contabilidad) || stored.contabilidad.estado !== 'PENDIENTE' || !uuid(stored.contabilidad.event_id) || !uuid(stored.contabilidad.original_event_id)
    || stored.contabilidad.event_id === stored.contabilidad.original_event_id || !live(snapshot.evento_origen)
    || snapshot.evento_origen.event_id !== stored.contabilidad.original_event_id || snapshot.evento_origen.tenant_id !== context.tenantId
    || snapshot.evento_origen.aggregate_id !== context.receiptId || !['recepcion.registrada', 'RecepcionRegistrada'].includes(snapshot.evento_origen.event_type)
    || snapshot.evento_origen.payload?.recepcionId !== context.receiptId || snapshot.evento_origen.payload?.ordenId !== stored.orden_id
    || snapshot.evento_origen.payload?.tenantId !== context.tenantId) return unknown();
  const items = detail.items, sources = detail.movimientos_origen, opposites = detail.movimientos_reversa, summaries = stored.movimientos;
  if (![items, detail.items_origen, sources, opposites, summaries, r.movimientos_origen, snapshot.items].every(Array.isArray) || items.length === 0
    || canonical(items) !== canonical(detail.items_origen)
    || !uniqueIds(items.map(i => i?.id)) || !uniqueIds(sources.map(m => m?.id)) || !uniqueIds(opposites.map(m => m?.id))
    || !uniqueIds(summaries.map(m => m?.id)) || !uniqueIds(r.movimientos_origen) || !uniqueIds(snapshot.items.map(i => i?.id))
    || snapshot.items.length !== items.length || sources.length !== opposites.length || summaries.length !== opposites.length
    || r.movimientos_origen.length !== sources.length || sources.some(m => !r.movimientos_origen.includes(m.id))
    || snapshot.items.some(i => !items.some(current => current.id === i.id))) return unknown();
  for (const item of items) {
    if (!live(item) || item.tenant_id !== context.tenantId || item.recepcion_id !== context.receiptId || !uuid(item.producto_id) || !uuid(item.detalle_id)
      || !decimal(item.cantidad_recibida, 6, true) || !['OK', 'OBSERVADO', 'RECHAZADO'].includes(item.calidad) || !live(item.metadata)
      || typeof item.metadata.es_servicio !== 'boolean' || typeof item.metadata.controla_stock !== 'boolean') return unknown();
    const legs = sources.filter(m => m.referencia_id === item.id);
    const physical = item.calidad !== 'RECHAZADO' && !item.metadata.es_servicio && item.metadata.controla_stock;
    if (legs.length !== (physical ? 1 : 0)) return unknown();
    if (physical) {
      const source = legs[0];
      if (!movement(source, context.tenantId, 'ENTRADA') || source.referencia_tipo !== 'RECEPCION' || source.producto_id !== item.producto_id
        || source.almacen_id !== item.almacen_id || source.ubicacion_id !== item.ubicacion_id || !new Decimal(source.cantidad).eq(item.cantidad_recibida)
        || source.metadata.recepcion_id !== context.receiptId) return unknown();
    }
  }
  for (const source of sources) {
    const legs = opposites.filter(m => m?.referencia_id === source.id), rows = summaries.filter(m => m?.source_movement_id === source.id);
    if (!items.some(i => i.id === source.referencia_id) || legs.length !== 1 || rows.length !== 1) return unknown();
    const opposite = legs[0], row = rows[0];
    if (!movement(opposite, context.tenantId, 'SALIDA') || opposite.referencia_tipo !== 'RECEPCION_REVERSA' || opposite.created_by !== context.actorId
      || opposite.metadata.reversa_id !== r.id || opposite.metadata.source_movement_id !== source.id || opposite.metadata.recepcion_id !== context.receiptId
      || opposite.id === source.id || row.id !== opposite.id || row.producto_id !== opposite.producto_id || row.almacen_id !== opposite.almacen_id
      || row.ubicacion_id !== opposite.ubicacion_id || row.cantidad !== opposite.cantidad
      || ['producto_id', 'almacen_id', 'ubicacion_id', 'cantidad', 'moneda', 'moneda_base', 'tipo_cambio', 'costo_unitario', 'valor_total', 'lote', 'fecha_expiracion']
        .some(k => opposite[k] !== source[k])) return unknown();
  }
  return { ...rpc, idempotent: rpc.idempotent, contabilidad: { estado: 'PENDIENTE',
    event_id: stored.contabilidad.event_id, original_event_id: stored.contabilidad.original_event_id },
    operation_identity: { version: 1, type: 'RECEPCION_REVERSA', operation_id: r.id, source_operation_id: context.receiptId,
    tenant_id: context.tenantId, actor_id: context.actorId, idempotency_key: context.key, request_payload: context.payload,
    request_fingerprint: context.fingerprint, confirmed_at: r.created_at } };
}

export function bindReceiptReversalResolution(value: any, context: ReceiptReversalContext) {
  if (!live(value)) return unknown();
  if (value.status === 'COMMITTED') {
    if (value.resolution !== undefined) return unknown();
    return { status: 'COMMITTED' as const, receipt: bindReceiptReversalReceipt(value.receipt, value.detail, context) };
  }
  if (value.status !== 'ABANDONED' || value.receipt !== undefined || value.detail !== undefined || !live(value.resolution)) return unknown();
  const r = value.resolution;
  if (!uuid(r.id) || r.type !== 'RECEPCION_REVERSA' || r.tenant_id !== context.tenantId || r.actor_id !== context.actorId
    || r.source_operation_id !== context.receiptId || r.idempotency_key !== context.key || !timestamp(r.confirmed_at)
    || r.request_fingerprint !== context.fingerprint || canonical(r.request_payload) !== canonical(context.payload)) return unknown();
  return { status: 'ABANDONED' as const, resolution: r };
}
