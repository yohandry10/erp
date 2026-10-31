import { ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import Decimal from 'decimal.js';
import { revaluationJsonbText } from './revaluation-registration-receipt';

const object = (v: any) => !!v && typeof v === 'object' && !Array.isArray(v);
const uuid = (v: any) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const live = (v: any) => object(v) && ['cached', 'queued', 'offline', 'pending', 'from_cache'].every(k => v[k] === undefined || v[k] === false);
const cents = (v: any) => typeof v === 'number' && Number.isFinite(v) && Number.isSafeInteger(Math.round(v * 100)) && Math.abs(v * 100 - Math.round(v * 100)) < 0.000001;
const timestamp = (v: any) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));
const civil = (v: any) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number(v.slice(0, 4)) >= 1 && Number.isFinite(Date.parse(v + 'T00:00:00Z')) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;
function payloadDate(v: any): string {
  if (typeof v !== 'string' || !civil(v.slice(0, 10)) || !(v.length === 10 || /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v)))) unknown();
  return v.slice(0, 10);
}
const trimmedNullable = (v: any) => v == null ? null : typeof v === 'string' ? v.trim() || null : unknown();
function unknown(): never { throw new ServiceUnavailableException('No se pudo confirmar el recibo completo de alta del activo. Conserve la solicitud y reintente con la misma clave.'); }

export function assetCreateFingerprint(payload: any) {
  return createHash('sha256').update(revaluationJsonbText({ entity: 'ASSET', action: 'CREATE', id: null, payload })).digest('hex');
}

/** The committed creation snapshot is immutable even after depreciation/update/retirement. */
export function confirmAssetCreateReceipt(request: { tenant: string; actor: string; key: string; payload: any }, result: any, ledger: any, current: any) {
  const { tenant, actor, key, payload } = request;
  if (!uuid(tenant) || !uuid(actor) || typeof key !== 'string' || key.trim().toLowerCase() !== key || key.length < 8 || key.length > 200 || !live(payload)) unknown();
  const fields = ['codigo', 'nombre', 'descripcion', 'fecha_adquisicion', 'valor_adquisicion', 'valor_residual', 'vida_util_meses', 'fecha_inicio_depreciacion', 'centro_costo_id'];
  if (Object.keys(payload).some(k => !fields.includes(k)) || typeof payload.codigo !== 'string' || !payload.codigo.trim() || typeof payload.nombre !== 'string' || !payload.nombre.trim() || !Number.isSafeInteger(payload.vida_util_meses) || payload.vida_util_meses < 1 || typeof payload.valor_adquisicion !== 'number' || !Number.isFinite(payload.valor_adquisicion) || payload.valor_adquisicion <= 0) unknown();
  const acquisitionDate = payloadDate(payload.fecha_adquisicion), residual = payload.valor_residual ?? 0, start = payloadDate(payload.fecha_inicio_depreciacion ?? payload.fecha_adquisicion), center = payload.centro_costo_id ?? null;
  if (typeof residual !== 'number' || !Number.isFinite(residual) || residual < 0 || residual > payload.valor_adquisicion || center !== null && !uuid(center)) unknown();
  const acquisitionRounded = new Decimal(payload.valor_adquisicion).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(), residualRounded = new Decimal(residual).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
  if (!cents(acquisitionRounded) || acquisitionRounded <= 0 || !cents(residualRounded)) unknown();
  if (!live(ledger) || !uuid(ledger.id) || ledger.tenant_id !== tenant || ledger.actor_id !== actor || ledger.operation_type !== 'ACCOUNTING_ASSET_CREATE' || ledger.idempotency_key !== key || !uuid(ledger.record_id) || ledger.request_fingerprint !== assetCreateFingerprint(payload) || !timestamp(ledger.created_at)) unknown();
  const receipt = ledger.result, record = receipt?.record;
  if (!live(receipt) || receipt.success !== true || receipt.entity !== 'ASSET' || receipt.action !== 'CREATE' || receipt.id !== ledger.record_id || receipt.idempotent !== false || !live(record)) unknown();
  if (record.id !== ledger.record_id || record.tenant_id !== tenant || record.created_by !== actor || !timestamp(record.created_at) || record.codigo !== payload.codigo.trim().toUpperCase() || record.nombre !== payload.nombre.trim() || record.descripcion !== trimmedNullable(payload.descripcion) || record.fecha_adquisicion !== acquisitionDate || record.fecha_inicio_depreciacion !== start || record.centro_costo_id !== center || record.metodo_depreciacion !== 'LINEAL' || record.situacion !== 'ACTIVO' || record.estado !== 'ACTIVO' || record.activo !== true || record.vida_util_meses !== payload.vida_util_meses || record.valor_adquisicion !== acquisitionRounded || record.valor_residual !== residualRounded || record.depreciacion_acumulada !== 0) unknown();
  if (!live(result) || ![result.valor_adquisicion, result.valor_residual, result.depreciacion_acumulada, result.valor_neto].every(cents) || revaluationJsonbText(result) !== revaluationJsonbText({ ...record, valor_neto: acquisitionRounded })) unknown();
  if (!live(current) || current.id !== record.id || current.tenant_id !== tenant || current.created_by !== actor || current.created_at !== record.created_at || current.codigo !== record.codigo || current.fecha_adquisicion !== record.fecha_adquisicion || current.fecha_inicio_depreciacion !== record.fecha_inicio_depreciacion || current.valor_adquisicion !== record.valor_adquisicion || current.metodo_depreciacion !== record.metodo_depreciacion || !['ACTIVO', 'DEPRECIADO', 'BAJA', 'VENDIDO'].includes(current.situacion)) unknown();
  return {
    complete: true, tenant_id: tenant, data: result,
    operation: { status: 'COMMITTED', type: 'ACCOUNTING_ASSET_CREATE', operation_id: ledger.id, tenant_id: tenant, actor_id: actor, idempotency_key: key, request_fingerprint: ledger.request_fingerprint, record_id: ledger.record_id, created_at: ledger.created_at, payload },
    asset: { id: current.id, tenant_id: tenant, codigo: current.codigo, situacion_actual: current.situacion, created_by: current.created_by, created_at: current.created_at },
  };
}
