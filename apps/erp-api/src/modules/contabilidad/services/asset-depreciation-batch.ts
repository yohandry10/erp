import { ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'crypto';
import { revaluationJsonbText } from './revaluation-registration-receipt';

export const depreciationSource = (a: any) => ({ id: a.id, tenant_id: a.tenant_id, codigo: a.codigo,
  valor_adquisicion: a.valor_adquisicion, valor_residual: a.valor_residual, vida_util_meses: a.vida_util_meses,
  depreciacion_acumulada: a.depreciacion_acumulada, fecha_inicio_depreciacion: a.fecha_inicio_depreciacion ?? a.fecha_adquisicion,
  centro_costo_id: a.centro_costo_id ?? null });
const object = (v: any) => !!v && typeof v === 'object' && !Array.isArray(v);
const uuid = (v: any) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const live = (v: any) => object(v) && ['cached','queued','offline','pending','from_cache'].every(k => v[k] === undefined || v[k] === false);
const cents = (v: any) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && Number.isSafeInteger(Math.round(v*100)) && Math.abs(v*100-Math.round(v*100)) < 0.000001;
function unknown(): never { throw new ServiceUnavailableException('No se pudo confirmar el recibo completo del lote de depreciación. Conserve la solicitud y reintente con la misma clave.'); }
export function confirmDepreciationBatch(v: any, tenant: string, actor: string, key: string, request: { anio: number; mes: number }) {
  const op = v?.operation, d = v?.data, periodo = `${request.anio}-${String(request.mes).padStart(2,'0')}`;
  if (!live(v) || v.success !== true || v.complete !== true || v.tenant_id !== tenant || typeof v.idempotent !== 'boolean' || !live(op) || !live(d)) unknown();
  if (op.status !== 'COMMITTED' || op.type !== 'ACCOUNTING_ASSET_DEPRECIATION_BATCH' || !uuid(op.operation_id) || op.tenant_id !== tenant || op.actor_id !== actor || op.idempotency_key !== key || revaluationJsonbText(op.request) !== revaluationJsonbText(request) || op.request_fingerprint !== createHash('sha256').update(revaluationJsonbText(request)).digest('hex') || typeof op.created_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(op.created_at) || !Number.isFinite(Date.parse(op.created_at))) unknown();
  if (d.periodo !== periodo || !Array.isArray(d.cuotas) || !Array.isArray(d.omitidos) || !Number.isSafeInteger(op.snapshot_count) || op.snapshot_count !== d.cuotas.length+d.omitidos.length || !Number.isSafeInteger(d.activos_depreciados) || d.activos_depreciados !== d.cuotas.length || !cents(d.total_depreciado)) unknown();
  const assets = new Set<string>(), ids = new Set<string>(), events = new Set<string>(), outboxes = new Set<string>(); let total = 0;
  for (const row of d.cuotas) {
    const dep = row?.depreciacion, out = row?.outbox;
    if (!live(row) || !uuid(row.activo_id) || typeof row.codigo !== 'string' || !row.codigo.trim() || assets.has(row.activo_id) || !live(dep) || !live(out)) unknown();
    if (!uuid(dep.id) || ids.has(dep.id) || dep.tenant_id !== tenant || dep.activo_id !== row.activo_id || dep.created_by !== actor || dep.periodo !== periodo || dep.fecha_depreciacion !== new Date(Date.UTC(request.anio,request.mes,0)).toISOString().slice(0,10) || ![dep.monto_depreciacion,dep.depreciacion_acumulada,dep.valor_neto].every(cents) || dep.monto_depreciacion <= 0 || dep.depreciacion_acumulada < dep.monto_depreciacion || out.depreciacionId !== dep.id || !uuid(out.eventId) || !uuid(out.outboxId) || outboxes.has(out.outboxId) || events.has(out.eventId) || out.idempotencyKey !== `depreciacion.generada:${tenant}:${dep.id}`) unknown();
    assets.add(row.activo_id);ids.add(dep.id);events.add(out.eventId);outboxes.add(out.outboxId);total += Math.round(dep.monto_depreciacion*100);
  }
  for (const row of d.omitidos) {
    if (!live(row) || !uuid(row.activo_id) || typeof row.codigo !== 'string' || !row.codigo.trim() || assets.has(row.activo_id) || !['ALREADY_REGISTERED','OUTSIDE_USEFUL_LIFE_OR_RESIDUAL'].includes(row.motivo) || row.motivo === 'ALREADY_REGISTERED' && !uuid(row.depreciacion_id)) unknown();
    assets.add(row.activo_id);
  }
  if (!Number.isSafeInteger(total) || total !== Math.round(d.total_depreciado*100)) unknown();
  return v;
}
