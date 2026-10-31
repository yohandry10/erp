import { ServiceUnavailableException } from '@nestjs/common';
import Decimal from 'decimal.js';

export interface CalculationReceiptContext {
  planillaId: string; tenantId: string; actorId: string; empleados: any[];
}
const fields = [['totalIngresos', 'total_ingresos'], ['totalDescuentos', 'total_descuentos'],
  ['totalAportes', 'total_aportes'], ['totalNeto', 'neto_pagar']] as const;
const unknown = (): never => { throw new ServiceUnavailableException('No se pudo confirmar el recibo completo del cálculo. Conserve la solicitud y verifique la planilla antes de reintentar.'); };
const object = (value: any) => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: any) => typeof value === 'string' && !!value.trim();
const money = (value: any) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const live = (value: any) => object(value) && ['cached', 'queued', 'offline', 'pending', 'from_cache']
  .every(key => value[key] === undefined || value[key] === false);

/** Uses the same per-employee HALF_UP cents rounding as the existing RPC425. */
export function expectedCalculationReceipt(context: CalculationReceiptContext) {
  if (!context || ![context.planillaId, context.tenantId, context.actorId].every(text)
    || !Array.isArray(context.empleados) || !context.empleados.length) unknown();
  const ids = new Set<string>();
  for (const row of context.empleados) {
    if (!object(row) || !text(row.empleado_id) || ids.has(row.empleado_id.toLowerCase())) unknown();
    ids.add(row.empleado_id.toLowerCase());
    if (!fields.every(([, key]) => money(row[key]))) unknown();
  }
  const totals: Record<string, number> = { totalEmpleados: context.empleados.length };
  for (const [target, source] of fields) {
    const total = context.empleados.reduce((sum: Decimal, row: any) => sum.plus(new Decimal(row[source]).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)), new Decimal(0));
    if (!Number.isSafeInteger(total.times(100).toNumber())) unknown();
    totals[target] = total.toNumber();
  }
  return totals;
}

/** Full atomic-RPC confirmation bound to its scoped computed request; no durable browser-key claim. */
export function assertCalculationRpcReceipt(value: any, context: CalculationReceiptContext) {
  const expected = expectedCalculationReceipt(context);
  if (!live(value) || value.success !== true || !text(value.planillaId)
    || value.planillaId.toLowerCase() !== context.planillaId.toLowerCase()
    || typeof value.idempotent !== 'boolean' || !Number.isSafeInteger(value.totalEmpleados)
    || value.totalEmpleados !== expected.totalEmpleados) unknown();
  for (const [field, expectedId] of [['tenant_id', context.tenantId], ['actor_id', context.actorId]] as const) {
    if (value[field] !== undefined && (!text(value[field]) || value[field].toLowerCase() !== expectedId.toLowerCase())) unknown();
  }
  for (const [field] of fields) {
    if (!money(value[field]) || new Decimal(value[field]).decimalPlaces() > 2
      || !new Decimal(value[field]).equals(expected[field])) unknown();
  }
  return value;
}
