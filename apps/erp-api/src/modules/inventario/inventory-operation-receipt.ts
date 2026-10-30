import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import Decimal from 'decimal.js';

export interface InventoryReceiptContext {
  tenantId: string; actorId: string; key: string; type: 'AJUSTE' | 'TRANSFERENCIA'; payload: Record<string, any>;
}
const object = (v: any): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const uuid = (v: any): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const finite = (v: any): v is number => typeof v === 'number' && Number.isFinite(v);
const canonical = (v: any) => JSON.stringify(v, (_key, value) => object(value) ? Object.fromEntries(Object.keys(value).sort().map(k => [k, value[k]])) : value);
const live = (v: any) => object(v) && ['cached', 'queued', 'offline', 'pending', 'from_cache'].every(k => v[k] === undefined || v[k] === false);
const trim = (v: string) => v.replace(/^ +| +$/g, ''); // PostgreSQL btrim(text), preserving the existing canonical request.
const unknown = (): never => { throw new ServiceUnavailableException('No se pudo confirmar el recibo completo de la operación original de inventario. Conserve sus datos para recuperar el resultado.'); };
const invalid = (): never => { throw new BadRequestException('La operación de inventario requiere identidad y datos originales confirmados'); };
const id = (v: any) => uuid(v) ? v.toLowerCase() : invalid();
const optionalId = (v: any) => v === undefined || v === null ? null : id(v);
const optionalText = (v: any) => v === undefined || v === null || v === '' ? null : typeof v === 'string' ? trim(v) || null : invalid();
function quantity(v: any, positive: boolean) {
  if (!finite(v) || Math.abs(v) > 999999999999 || (positive ? v <= 0 : v === 0)) return invalid();
  const result = new Decimal(v).toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toNumber();
  if (result === 0) return invalid();
  return result;
}
function date(v: any) {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(v)) return invalid();
  const day = v.slice(0, 10), parsed = new Date(day + 'T00:00:00.000Z');
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) return invalid();
  return day;
}
export function prepareInventoryReceiptContext(tenantId: string, actorId: string, key: string, type: 'AJUSTE' | 'TRANSFERENCIA', payload: any): InventoryReceiptContext {
  if (!uuid(tenantId) || !uuid(actorId) || !object(payload) || typeof key !== 'string' || trim(key).length < 8 || trim(key).length > 180
    || typeof payload.motivo !== 'string' || !trim(payload.motivo) || trim(payload.motivo).length > 500) return invalid();
  let original: Record<string, any>;
  if (type === 'AJUSTE') original = { producto_id: id(payload.producto_id), almacen_id: id(payload.almacen_id), ubicacion_id: optionalId(payload.ubicacion_id),
    centro_costo_id: optionalId(payload.centro_costo_id), delta: quantity(payload.delta, false), motivo: trim(payload.motivo) };
  else if (type === 'TRANSFERENCIA') {
    original = { producto_id: id(payload.producto_id), almacen_origen_id: id(payload.almacen_origen_id), almacen_destino_id: id(payload.almacen_destino_id),
      ubicacion_origen_id: optionalId(payload.ubicacion_origen_id), ubicacion_destino_id: optionalId(payload.ubicacion_destino_id), cantidad: quantity(payload.cantidad, true),
      motivo: trim(payload.motivo), lote: optionalText(payload.lote), fecha_expiracion: date(payload.fecha_expiracion), guia_remision_id: optionalId(payload.guia_remision_id) };
    if (original.almacen_origen_id === original.almacen_destino_id) return invalid();
  } else return invalid();
  return { tenantId: tenantId.toLowerCase(), actorId: actorId.toLowerCase(), key: trim(key), type, payload: original };
}
const dbNumber = (v: any) => finite(v) ? v : typeof v === 'string' && /^-?\d+(?:\.\d+)?$/.test(v) && Number.isFinite(Number(v)) ? Number(v) : NaN;
const withoutIdempotent = (v: any) => Object.fromEntries(Object.entries(v).filter(([k]) => k !== 'idempotent'));
export function bindInventoryOperationReceipt(rpcReceipt: any, ledger: any, context: InventoryReceiptContext) {
  const r = rpcReceipt, stored = ledger?.resultado, p = context.payload;
  if (!live(r) || r.success !== true || typeof r.idempotent !== 'boolean' || !live(ledger) || !live(stored) || stored.success !== true || stored.idempotent !== false
    || !uuid(ledger.id) || r.operacion_id !== ledger.id || ledger.tenant_id !== context.tenantId || ledger.actor_id !== context.actorId
    || ledger.tipo !== context.type || ledger.idempotency_key !== context.key || !/^[0-9a-f]{64}$/.test(ledger.fingerprint || '')
    || !object(ledger.metadata) || canonical(ledger.metadata.payload) !== canonical(p) || ledger.producto_id !== p.producto_id || ledger.motivo !== p.motivo
    || typeof ledger.created_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(ledger.created_at) || !Number.isFinite(Date.parse(ledger.created_at))
    || canonical(withoutIdempotent(r)) !== canonical(withoutIdempotent(stored))) return unknown();
  if (context.type === 'AJUSTE') {
    const movement = p.delta > 0 ? ledger.movimiento_entrada_id : ledger.movimiento_salida_id;
    if (!uuid(movement) || !uuid(ledger.event_id) || r.movimiento_id !== movement || r.event_id !== ledger.event_id
      || (p.delta > 0 ? ledger.movimiento_salida_id : ledger.movimiento_entrada_id) !== null
      || ledger.almacen_origen_id !== p.almacen_id || ledger.almacen_destino_id !== null || ledger.ubicacion_origen_id !== p.ubicacion_id || ledger.ubicacion_destino_id !== null
      || dbNumber(ledger.delta) !== p.delta || dbNumber(ledger.cantidad) !== Math.abs(p.delta) || r.producto_id !== p.producto_id || r.almacen_id !== p.almacen_id
      || r.delta !== p.delta || r.cantidad !== Math.abs(p.delta) || r.tipo !== (p.delta > 0 ? 'SOBRANTE' : 'FALTANTE')
      || !finite(r.stock_nuevo) || r.stock_nuevo < 0 || !finite(r.costo_unitario) || r.costo_unitario < 0 || new Decimal(r.costo_unitario).toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toNumber() !== dbNumber(ledger.costo_unitario)
      || !finite(r.valor) || r.valor < 0 || r.valor !== new Decimal(Math.abs(p.delta)).times(r.costo_unitario).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber()) return unknown();
  } else {
    const transfer = r.traslado_entre_establecimientos;
    if (!uuid(ledger.movimiento_salida_id) || !uuid(ledger.movimiento_entrada_id) || ledger.movimiento_salida_id === ledger.movimiento_entrada_id
      || r.movimiento_salida_id !== ledger.movimiento_salida_id || r.movimiento_entrada_id !== ledger.movimiento_entrada_id || ledger.event_id !== null || ledger.delta !== null
      || ledger.almacen_origen_id !== p.almacen_origen_id || ledger.almacen_destino_id !== p.almacen_destino_id
      || ledger.ubicacion_origen_id !== p.ubicacion_origen_id || ledger.ubicacion_destino_id !== p.ubicacion_destino_id
      || dbNumber(ledger.cantidad) !== p.cantidad || r.producto_id !== p.producto_id || r.almacen_origen_id !== p.almacen_origen_id || r.almacen_destino_id !== p.almacen_destino_id || r.cantidad !== p.cantidad
      || !(transfer === null || live(transfer) && transfer.requiere_gre === true && uuid(transfer.sucursal_origen_id) && uuid(transfer.sucursal_destino_id)
        && transfer.sucursal_origen_id !== transfer.sucursal_destino_id && /^\d{4}$/.test(transfer.establecimiento_origen) && /^\d{4}$/.test(transfer.establecimiento_destino)
        && transfer.motivo_traslado_sunat === '04' && (transfer.guia_remision_id === null || uuid(transfer.guia_remision_id))
        && transfer.guia_remision_id === p.guia_remision_id)) return unknown();
  }
  return { ...r, operation_identity: { version: 1, operation_id: ledger.id, type: ledger.tipo, tenant_id: ledger.tenant_id, actor_id: ledger.actor_id,
    idempotency_key: ledger.idempotency_key, request_payload: ledger.metadata.payload, request_fingerprint: ledger.fingerprint, confirmed_at: ledger.created_at } };
}
