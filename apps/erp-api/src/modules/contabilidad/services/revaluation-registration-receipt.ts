import { ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import Decimal from 'decimal.js';

const object = (v: any) => !!v && typeof v === 'object' && !Array.isArray(v);
const uuid = (v: any) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const live = (v: any) => object(v) && ['cached', 'queued', 'offline', 'pending', 'from_cache'].every(k => v[k] === undefined || v[k] === false);
const cents = (v: any) => typeof v === 'number' && Number.isFinite(v) && Number.isSafeInteger(Math.round(v * 100)) && Math.abs(v * 100 - Math.round(v * 100)) < 0.000001;
const timestamp = (v: any) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));
const journalNumber = (v: any) => (typeof v === 'number' || typeof v === 'string' && /^[1-9]\d*$/.test(v)) && Number.isSafeInteger(Number(v)) && Number(v) > 0;
function unknown(): never { throw new ServiceUnavailableException('No se pudo confirmar el recibo completo de revaluación. Conserve la intención y reintente con la misma clave.'); }

/** jsonb text ordering/spacing and normalized JSON number notation used by SQL477. */
export function revaluationJsonbText(v: any): string {
  if (v === null) return 'null';
  if (typeof v === 'string' || typeof v === 'boolean') return JSON.stringify(v);
  if (typeof v === 'number' && Number.isFinite(v)) return new Decimal(v).toFixed();
  if (Array.isArray(v)) return '[' + v.map(revaluationJsonbText).join(', ') + ']';
  if (object(v)) return '{' + Object.keys(v).sort((a, b) => Buffer.byteLength(a) - Buffer.byteLength(b) || Buffer.compare(Buffer.from(a), Buffer.from(b))).map(k => JSON.stringify(k) + ': ' + revaluationJsonbText(v[k])).join(', ') + '}';
  unknown();
}
export function revaluationRequestFingerprint(fecha: string, simulacion: any, concepto?: string) {
  return createHash('sha256').update(revaluationJsonbText({ fecha, simulacion, concepto: concepto ?? null })).digest('hex');
}
const sortedPositions = (rows: any[]) => [...rows].sort((a, b) => String(a.tipo).localeCompare(String(b.tipo), 'en') || String(a.documento_id).localeCompare(String(b.documento_id), 'en'));
function normalized(v: any) {
  if (!live(v) || !Array.isArray(v.posiciones)) unknown();
  if (v.excluidas !== undefined && !Array.isArray(v.excluidas)) unknown();
  return { ...v, posiciones: sortedPositions(v.posiciones), ...(v.excluidas !== undefined ? { excluidas: sortedPositions(v.excluidas) } : {}) };
}
export function confirmRevaluationRegistrationReceipt(request: { tenant: string; actor: string; key: string; fecha: string; simulacion: any; concepto?: string }, result: any, ledger: any, journal: any) {
  const { tenant, actor, key, fecha, simulacion, concepto } = request;
  if (!uuid(tenant) || !uuid(actor) || typeof key !== 'string' || key.trim() !== key || key.length < 8 || key.length > 200 || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !live(result) || !uuid(result.asiento_id) || !journalNumber(result.numero_asiento)) unknown();
  const reviewed = normalized(simulacion), receipt = normalized(result);
  if (reviewed.fecha !== fecha || typeof reviewed.moneda_local !== 'string' || !/^[A-Z]{3}$/.test(reviewed.moneda_local) || !reviewed.posiciones.length || ![reviewed.total_ganancia, reviewed.total_perdida, reviewed.diferencia_neta].every(cents)) unknown();
  const seen = new Set<string>(); let gain = 0, loss = 0;
  for (const p of reviewed.posiciones) {
    const identity = `${p?.tipo}:${p?.documento_id}`;
    if (!live(p) || !['CXC', 'CXP'].includes(p.tipo) || !uuid(p.documento_id) || seen.has(identity) || typeof p.moneda !== 'string' || !/^[A-Z]{3}$/.test(p.moneda) || p.moneda === reviewed.moneda_local || ![p.saldo_moneda_origen, p.valor_contabilizado, p.valor_a_cierre, p.diferencia].every(cents) || p.saldo_moneda_origen <= 0 || p.valor_contabilizado < 0 || p.valor_a_cierre < 0 || p.diferencia === 0 || ![p.tipo_cambio_origen, p.tipo_cambio_cierre].every(v => typeof v === 'number' && Number.isFinite(v) && v > 0) || Math.round(p.diferencia * 100) !== (Math.round(p.valor_a_cierre * 100) - Math.round(p.valor_contabilizado * 100)) * (p.tipo === 'CXC' ? 1 : -1)) unknown();
    seen.add(identity); if (p.diferencia > 0) gain += Math.round(p.diferencia * 100); else loss -= Math.round(p.diferencia * 100);
    if (new Decimal(p.saldo_moneda_origen).mul(p.tipo_cambio_origen).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber() !== p.valor_contabilizado || new Decimal(p.saldo_moneda_origen).mul(p.tipo_cambio_cierre).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber() !== p.valor_a_cierre) unknown();
  }
  for (const p of reviewed.excluidas ?? []) {
    const identity = `${p?.tipo}:${p?.documento_id}`;
    if (!live(p) || !['CXC', 'CXP'].includes(p.tipo) || !uuid(p.documento_id) || seen.has(identity) || typeof p.motivo !== 'string' || !p.motivo.trim()) unknown(); seen.add(identity);
  }
  if (!Number.isSafeInteger(gain) || !Number.isSafeInteger(loss) || Math.round(reviewed.total_ganancia * 100) !== gain || Math.round(reviewed.total_perdida * 100) !== loss || Math.round(reviewed.diferencia_neta * 100) !== gain - loss) unknown();
  if (revaluationJsonbText(receipt) !== revaluationJsonbText({ ...reviewed, asiento_id: result.asiento_id, numero_asiento: result.numero_asiento })) unknown();
  if (!live(ledger) || !uuid(ledger.id) || ledger.tenant_id !== tenant || ledger.actor_id !== actor || ledger.operation_type !== 'FX_REVALUATION' || ledger.idempotency_key !== key || ledger.record_id !== result.asiento_id || ledger.request_fingerprint !== revaluationRequestFingerprint(fecha, simulacion, concepto) || !timestamp(ledger.created_at) || revaluationJsonbText(normalized(ledger.result)) !== revaluationJsonbText(receipt)) unknown();
  if (!live(journal) || journal.id !== result.asiento_id || journal.tenant_id !== tenant || journal.created_by !== actor || journal.confirmado_por !== actor || !timestamp(journal.confirmado_en) || !['CONFIRMADO', 'ANULADO'].includes(journal.estado) || journal.origen !== 'REVALUACION_MONEDA' || journal.tipo_asiento !== 'AJUSTE' || !journalNumber(journal.numero_asiento) || Number(journal.numero_asiento) !== Number(result.numero_asiento) || Date.parse(journal.fecha) !== Date.parse(fecha + 'T00:00:00Z') || journal.concepto !== (concepto?.trim() || 'Diferencia de cambio no realizada al ' + fecha) || !object(journal.metadata) || !Array.isArray(journal.metadata.revaluacion_posiciones) || revaluationJsonbText(sortedPositions(journal.metadata.revaluacion_posiciones)) !== revaluationJsonbText(reviewed.posiciones)) unknown();
  return {
    complete: true, tenant_id: tenant, data: result,
    operation: { status: 'COMMITTED', type: 'FX_REVALUATION', operation_id: ledger.id, tenant_id: tenant, actor_id: actor, idempotency_key: key, request_fingerprint: ledger.request_fingerprint, record_id: ledger.record_id, created_at: ledger.created_at, payload: { fecha, simulacion, concepto: concepto ?? null } },
    journal: { id: journal.id, tenant_id: tenant, numero_asiento: journal.numero_asiento, fecha: journal.fecha, estado_actual: journal.estado, origen: journal.origen, tipo_asiento: journal.tipo_asiento, created_by: journal.created_by, confirmado_por: journal.confirmado_por, confirmado_en: journal.confirmado_en, concepto: journal.concepto },
  };
}
