import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';

export interface PayrollCreateReceiptContext {
  tenantId: string; actorId: string; period: string; country: string; currency: string;
  idempotencyKey: string; metadata: Record<string, any>;
}
const uuid = (v: any): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const object = (v: any) => !!v && typeof v === 'object' && !Array.isArray(v);
const unknown = (): never => { throw new ServiceUnavailableException('No se pudo confirmar el recibo completo de creación. Conserve la solicitud original y su clave antes de reintentar.'); };
const owned = ['creada_por', 'creada_en'];
function canonical(value: any): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (object(value)) return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return unknown();
}
function metadataWithoutOwned(value: Record<string, any>) {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !owned.includes(key)));
}
export function expectedPayrollCreateReceipt(context: PayrollCreateReceiptContext) {
  if (!context || ![context.tenantId, context.actorId].every(uuid) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(context.period)
    || !['PE', 'AR', 'CO'].includes(context.country) || context.currency !== ({ PE: 'PEN', AR: 'ARS', CO: 'COP' } as Record<string,string>)[context.country]
    || !uuid(context.idempotencyKey) || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(context.idempotencyKey)
    || !object(context.metadata)) throw new BadRequestException('La empresa, el actor, el período, la moneda y la clave original de creación deben estar confirmados');
  canonical(context.metadata);
  return context;
}
/** Full immutable495 creation acknowledgment; does not claim UUID echo or private browser recovery. */
export function assertPayrollCreateRpcReceipt(value: any, context: PayrollCreateReceiptContext) {
  expectedPayrollCreateReceipt(context);
  if (!object(value) || value.success !== true || !uuid(value.id) || !uuid(value.tenant_id)
    || value.tenant_id.toLowerCase() !== context.tenantId.toLowerCase() || value.periodo !== context.period
    || value.pais_codigo !== context.country || value.moneda !== context.currency
    || value.estado !== 'borrador' || value.estado_pago !== 'pendiente' || typeof value.idempotent !== 'boolean'
    || ['cached', 'queued', 'offline', 'pending', 'from_cache'].some(k => value[k] !== undefined && value[k] !== false)
    || !object(value.metadata) || !uuid(value.metadata.creada_por) || value.metadata.creada_por.toLowerCase() !== context.actorId.toLowerCase()
    || typeof value.metadata.creada_en !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value.metadata.creada_en) || !Number.isFinite(Date.parse(value.metadata.creada_en))
    || canonical(metadataWithoutOwned(value.metadata)) !== canonical(metadataWithoutOwned(context.metadata))) unknown();
  return value;
}
