import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { assertCalculationRpcReceipt } from './rrhh-calculation-receipt';

export interface CalculationOperationIntent { key: string; request: Record<string, any>; }
export interface CalculationOperationContext extends CalculationOperationIntent { tenantId: string; actorId: string; planillaId: string; }
const uuid = (value: any): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const object = (value: any) => !!value && typeof value === 'object' && !Array.isArray(value);
const unknown = (): never => { throw new ServiceUnavailableException('No se pudo confirmar la operación original de cálculo. Conserve la solicitud para conciliarla.'); };
function canonical(value: any): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (object(value)) return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return unknown();
}
export function prepareCalculationOperation(key: string, request: any, empleados: any[], eps?: any): CalculationOperationIntent {
  if (!uuid(key)) throw new BadRequestException('Idempotency-Key de cálculo debe ser un UUID explícito');
  const expected = { empleados, ...(eps !== undefined ? { eps_cobertura: eps } : {}) };
  if (!object(request) || canonical(request) !== canonical(expected) || !empleados?.length
    || !empleados.every(e => object(e) && uuid(e.empleado_id))
    || new Set(empleados.map(e => e.empleado_id.toLowerCase())).size !== empleados.length) {
    throw new BadRequestException('La intención debe conservar la solicitud original completa de cálculo');
  }
  return { key: key.toLowerCase(), request: JSON.parse(JSON.stringify(request)) };
}
export function assertCalculationOperation(value: any, context: CalculationOperationContext, computed?: any[]) {
  const op = value?.calculation_operation;
  if (!object(value) || value.success !== true || !uuid(value.planillaId) || value.planillaId.toLowerCase() !== context.planillaId.toLowerCase()
    || typeof value.idempotent !== 'boolean' || !object(op) || op.version !== 1 || !uuid(op.operation_id)
    || !uuid(op.idempotency_key) || op.idempotency_key.toLowerCase() !== context.key.toLowerCase()
    || !['CALCULATE', 'ABANDON_CALCULATION'].includes(op.action)
    || ![op.tenant_id, op.actor_id, op.planilla_id].every(uuid)
    || op.tenant_id.toLowerCase() !== context.tenantId.toLowerCase() || op.actor_id.toLowerCase() !== context.actorId.toLowerCase()
    || op.planilla_id.toLowerCase() !== context.planillaId.toLowerCase()
    || canonical(op.request) !== canonical(context.request) || !/^[0-9a-f]{64}$/.test(op.request_fingerprint)
    || typeof op.confirmed_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(op.confirmed_at) || !Number.isFinite(Date.parse(op.confirmed_at))
    || [value, op].some(v => ['cached', 'queued', 'offline', 'pending', 'from_cache'].some(k => v[k] !== undefined && v[k] !== false))) unknown();
  if (op.action === 'CALCULATE') {
    if (!['ORDINARY', 'GRATIFICATION', 'EPS'].includes(op.rpc_kind) || !Array.isArray(op.calculated_employees)
      || !op.calculated_employees.every(e => object(e) && uuid(e.empleado_id))
      || canonical(op.calculated_employees.map(e => e?.empleado_id?.toLowerCase()).sort())
        !== canonical(context.request.empleados.map((e: any) => e.empleado_id.toLowerCase()).sort())
      || (op.rpc_kind === 'EPS') !== object(op.eps_snapshot)
      || (op.rpc_kind !== 'EPS' && op.eps_snapshot !== null)
      || (computed && canonical(computed) !== canonical(op.calculated_employees))) unknown();
    for (const row of op.calculated_employees) {
      const original = context.request.empleados.find((e: any) => e.empleado_id.toLowerCase() === row.empleado_id.toLowerCase());
      if (!['dias_trabajados', 'horas_extras_25', 'horas_extras_35', 'tardanzas_minutos', 'faltas']
        .every(k => typeof row[k] === 'number' && Number.isFinite(row[k]) && row[k] === original[k])) unknown();
    }
    assertCalculationRpcReceipt(value, { tenantId: context.tenantId, actorId: context.actorId, planillaId: context.planillaId, empleados: op.calculated_employees });
  } else if (computed || ['totalEmpleados', 'totalIngresos', 'totalDescuentos', 'totalAportes', 'totalNeto'].some(k => value[k] !== undefined)) unknown();
  return value;
}
