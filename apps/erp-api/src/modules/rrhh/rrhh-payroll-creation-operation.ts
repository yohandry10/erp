import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { prepareCalculationOperation } from './rrhh-calculation-operation';
import { expectedPayrollCreateReceipt, assertPayrollCreateRpcReceipt, PayrollCreateReceiptContext } from './rrhh-payroll-create-receipt';

export interface PreparedPayrollCreationOperation {
  tenantId: string; actorId: string; key: string; childKey: string;
  request: Record<string, any>; planilla: Record<string, any>; receiptContext: PayrollCreateReceiptContext;
}
const object = (v: any) => !!v && typeof v === 'object' && !Array.isArray(v);
const uuid = (v: any): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const canonical = (v: any) => JSON.stringify(v, (_key, value) => object(value) ? Object.fromEntries(Object.keys(value).sort().map(k => [k, value[k]])) : value);
const unknown = (): never => { throw new ServiceUnavailableException('No se pudo confirmar el recibo de la solicitud original de alta y cálculo. Sus datos deben conservarse para conciliar.'); };
export function preparePayrollCreationOperation(data: any, tenantId: string, actorId: string): PreparedPayrollCreationOperation {
  if (!object(data) || Object.keys(data).some(k => !['periodo', 'observaciones', 'metadata', 'idempotency_key', 'calculo_idempotency_key', 'calculo_original', 'pais_codigo', 'moneda'].includes(k))
    || !uuid(data.idempotency_key) || !uuid(data.calculo_idempotency_key) || data.idempotency_key.toLowerCase() === data.calculo_idempotency_key.toLowerCase()
    || !object(data.calculo_original) || data.observaciones !== undefined && data.observaciones !== null && typeof data.observaciones !== 'string'
    || data.metadata !== undefined && data.metadata !== null && !object(data.metadata)) throw new BadRequestException('La solicitud original de alta y cálculo debe incluir dos UUID distintos y fuentes confirmadas');
  const metadata = { ...(data.metadata || {}), ...(data.observaciones ? { observaciones: data.observaciones.trim() } : {}) };
  const receiptContext = { tenantId, actorId, period: data.periodo, country: data.pais_codigo, currency: data.moneda, idempotencyKey: data.idempotency_key, metadata };
  expectedPayrollCreateReceipt(receiptContext);
  prepareCalculationOperation(data.calculo_idempotency_key, data.calculo_original, data.calculo_original.empleados, data.calculo_original.eps_cobertura);
  const request = JSON.parse(JSON.stringify(data));
  return { tenantId, actorId, key: data.idempotency_key.toLowerCase(), childKey: data.calculo_idempotency_key.toLowerCase(), request,
    planilla: { periodo: data.periodo, pais_codigo: data.pais_codigo, moneda: data.moneda, metadata }, receiptContext };
}
export function assertPayrollCreationOperation(value: any, context: PreparedPayrollCreationOperation) {
  const op = value?.creation_operation;
  const live = (v: any) => object(v) && ['cached', 'queued', 'offline', 'pending', 'from_cache'].every(k => v[k] === undefined || v[k] === false);
  if (!live(value) || value.success !== true || typeof value.idempotent !== 'boolean' || !live(op) || op.version !== 1
    || !['CREATE_WITH_CALCULATION', 'ABANDON_CREATION'].includes(op.action) || !uuid(op.operation_id)
    || !uuid(op.idempotency_key) || op.idempotency_key.toLowerCase() !== context.key
    || !uuid(op.calculation_key) || op.calculation_key.toLowerCase() !== context.childKey
    || typeof op.tenant_id !== 'string' || op.tenant_id.toLowerCase() !== context.tenantId.toLowerCase()
    || typeof op.actor_id !== 'string' || op.actor_id.toLowerCase() !== context.actorId.toLowerCase()
    || canonical(op.request) !== canonical(context.request) || !/^[0-9a-f]{64}$/.test(op.request_fingerprint || '')
    || typeof op.confirmed_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(op.confirmed_at) || !Number.isFinite(Date.parse(op.confirmed_at))) unknown();
  if (op.action === 'CREATE_WITH_CALCULATION') {
    if (!uuid(value.id) || !uuid(op.planilla_id) || op.planilla_id.toLowerCase() !== value.id.toLowerCase()
      || canonical(op.normalized_planilla) !== canonical(context.planilla)) unknown();
    assertPayrollCreateRpcReceipt(value, context.receiptContext);
  } else if (op.planilla_id !== null || ['id', 'tenant_id', 'periodo', 'pais_codigo', 'moneda', 'estado', 'estado_pago', 'metadata'].some(k => value[k] !== undefined)) unknown();
  return value;
}
