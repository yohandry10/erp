import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { isDeepStrictEqual } from 'util';

const object = (v: any) => !!v && typeof v === 'object' && !Array.isArray(v);
const uuid = (v: any) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const live = (v: any) => object(v) && ['cached', 'offline', 'queued', 'pending', 'from_cache'].every(k => v[k] === undefined || v[k] === false);
const money = (v: any) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && Number.isSafeInteger(Math.round(v * 100)) && Math.abs(v * 100 - Math.round(v * 100)) < 0.000001;
const date = (v: any) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;
// btrim de PostgreSQL: sólo espacios, en tiempo lineal.
const btrim = (v: string) => {
  let inicio = 0;
  let fin = v.length;
  while (inicio < fin && v[inicio] === ' ') inicio += 1;
  while (fin > inicio && v[fin - 1] === ' ') fin -= 1;
  return v.slice(inicio, fin);
};
const pgText = (v: string | undefined) => (v === undefined ? null : btrim(v) || null);
const fail = (): never => { throw new BadRequestException('No se pudo verificar el recibo original del ajuste CxC. Conserva la solicitud para confirmar su resultado.'); };
const original = (v: any) => {
  const value = Array.isArray(v) && v.length === 1 ? v[0] : v;
  if (!live(value) || value.success !== true || typeof value.idempotent !== 'boolean') fail();
  return value;
};
const sameResult = (rpc: any, ledger: any) => {
  if (!live(ledger) || ledger.success !== true || ledger.idempotent !== false) fail();
  const { idempotent: _replay, ...a } = rpc;
  const { idempotent: _first, ...b } = ledger;
  if (!isDeepStrictEqual(a, b)) fail();
};

// This is the exact jsonb::text of the four fixed string/null keys in 478.
export function cxcRescheduleFingerprint(cuentaId: string, dto: { nueva_fecha_vencimiento: string; motivo?: string; comentarios?: string }) {
  const json = '{"fecha": ' + JSON.stringify(dto.nueva_fecha_vencimiento) + ', "cxc_id": ' + JSON.stringify(cuentaId)
    + ', "motivo": ' + JSON.stringify(pgText(dto.motivo)) + ', "comentarios": ' + JSON.stringify(pgText(dto.comentarios)) + '}';
  return createHash('sha256').update(json).digest('hex');
}

export async function readCxcRescheduleReceipt(client: any, tenantId: string, actorId: string, cuentaId: string,
  dto: { nueva_fecha_vencimiento: string; motivo?: string; comentarios?: string }, key: string, raw: any) {
  const rpc = original(raw);
  if (![tenantId, actorId, cuentaId].every(uuid) || !date(dto.nueva_fecha_vencimiento) || key.length < 8 || key.length > 200
    || rpc.id !== cuentaId || !live(rpc.cuenta) || rpc.cuenta.id !== cuentaId || rpc.cuenta.tenant_id !== tenantId
    || rpc.cuenta.fecha_vencimiento !== dto.nueva_fecha_vencimiento || rpc.motivo !== pgText(dto.motivo)) fail();
  const { data: op, error } = await client.from('financial_master_operations').select('*')
    .eq('tenant_id', tenantId).eq('operation_type', 'CXC_REPROGRAM').eq('idempotency_key', key).maybeSingle();
  if (error || !live(op) || !uuid(op.id) || op.tenant_id !== tenantId || op.actor_id !== actorId || op.record_id !== cuentaId
    || op.operation_type !== 'CXC_REPROGRAM' || op.idempotency_key !== key || op.request_fingerprint !== cxcRescheduleFingerprint(cuentaId, dto)) fail();
  sameResult(rpc, op.result);
  return { ...rpc.cuenta, receipt: { version: 1, kind: 'CXC_REPROGRAM', operation_id: op.id, tenant_id: op.tenant_id,
    actor_id: op.actor_id, cuenta_id: op.record_id, idempotency_key: op.idempotency_key, request_fingerprint: op.request_fingerprint,
    request: { nueva_fecha_vencimiento: dto.nueva_fecha_vencimiento, motivo: pgText(dto.motivo), comentarios: pgText(dto.comentarios) },
    fecha_anterior: rpc.fecha_anterior, idempotent: rpc.idempotent } };
}

export async function readCxcNoteReceipt(client: any, tenantId: string, actorId: string, cuentaId: string, originId: string,
  request: { monto: number; codigo_motivo: string; motivo: string }, type: '07' | '91', key: string, raw: any) {
  const rpc = original(raw);
  if (![tenantId, actorId, cuentaId, originId].every(uuid) || !money(request.monto) || request.monto <= 0
    || rpc.documento_origen_id !== originId || rpc.tipo_documento !== type || !uuid(rpc.documento_id) || !uuid(rpc.cpe_id)
    || !uuid(rpc.event_id) || rpc.total !== request.monto || rpc.estado !== 'BORRADOR' || rpc.requiere_firma !== true
    || rpc.financial_effect_status !== 'PENDING_FISCAL_ACCEPTANCE' || rpc.cxc_reduction !== 0 || rpc.saldo_favor !== 0
    || rpc.cxc_id !== null || rpc.saldo_favor_id !== null || typeof rpc.serie !== 'string' || !rpc.serie.trim()
    || !/^\d+$/.test(String(rpc.numero)) || Number(rpc.numero) <= 0) fail();
  const { data: op, error } = await client.from('notas_referenciadas_operaciones').select('*')
    .eq('tenant_id', tenantId).eq('tipo_operacion', 'CREAR').eq('idempotency_key', key).maybeSingle();
  const p = op?.payload;
  if (error || !live(op) || !uuid(op.id) || op.tenant_id !== tenantId || op.actor_id !== actorId || op.tipo_operacion !== 'CREAR'
    || op.idempotency_key !== key || !/^[0-9a-f]{64}$/.test(op.fingerprint || '') || op.documento_origen_id !== originId
    || op.nota_documento_id !== rpc.documento_id || op.nota_cpe_id !== rpc.cpe_id || op.event_id !== rpc.event_id
    || !live(p) || p.version !== (type === '91' ? 529 : 1) || p.actor_id !== actorId || p.documento_origen_id !== originId || p.tipo_documento !== type
    || p.monto_total !== request.monto || p.codigo_motivo !== request.codigo_motivo || p.motivo !== pgText(request.motivo)) fail();
  sameResult(rpc, op.resultado);
  return { ...rpc, receipt: { version: 1, kind: 'CXC_CREDIT_NOTE_CREATE', operation_id: op.id, tenant_id: op.tenant_id,
    actor_id: op.actor_id, cuenta_id: cuentaId, documento_origen_id: op.documento_origen_id, idempotency_key: op.idempotency_key,
    request_fingerprint: op.fingerprint, request: { monto: request.monto, codigo_motivo: request.codigo_motivo, motivo: pgText(request.motivo) } } };
}
