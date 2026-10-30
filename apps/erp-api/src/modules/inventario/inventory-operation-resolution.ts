import { ServiceUnavailableException } from '@nestjs/common';
import { bindInventoryOperationReceipt, InventoryReceiptContext } from './inventory-operation-receipt';

const object = (v: any): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const uuid = (v: any) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const live = (v: any) => object(v) && ['cached', 'queued', 'offline', 'pending', 'from_cache'].every(k => v[k] === undefined || v[k] === false);
const exact = (v: any, fields: string[]) => object(v) && Object.keys(v).length === fields.length && fields.every(k => Object.prototype.hasOwnProperty.call(v, k));
const canonical = (v: any) => JSON.stringify(v, (_key, value) => object(value) ? Object.fromEntries(Object.keys(value).sort().map(k => [k, value[k]])) : value);
const unknown = (): never => { throw new ServiceUnavailableException('No se pudo confirmar la resolución completa de la operación original. Conserve sus datos para consultar el resultado.'); };

export function inventoryResolutionKind(r: any): 'COMMITTED' | 'ABANDONED' {
  if (!live(r) || r.success !== true) return unknown();
  if (r.resolution === 'COMMITTED' && exact(r, ['success', 'resolution', 'receipt']) && live(r.receipt) && r.receipt.idempotent === true) return 'COMMITTED';
  if (r.resolution === 'ABANDONED' && exact(r, ['success', 'resolution', 'idempotent', 'operation_identity']) && typeof r.idempotent === 'boolean') return 'ABANDONED';
  return unknown();
}

export function bindInventoryResolution(r: any, context: InventoryReceiptContext, ledger?: any) {
  if (inventoryResolutionKind(r) === 'COMMITTED') return { ...r, receipt: bindInventoryOperationReceipt(r.receipt, ledger, context) };
  const identity = r.operation_identity;
  if (!live(identity) || !exact(identity, ['version', 'action', 'operation_id', 'type', 'tenant_id', 'actor_id', 'idempotency_key', 'request_payload', 'request_fingerprint', 'confirmed_at'])
    || identity.version !== 1 || identity.action !== 'ABANDON_INVENTORY' || !uuid(identity.operation_id) || identity.type !== context.type
    || identity.tenant_id !== context.tenantId || identity.actor_id !== context.actorId || identity.idempotency_key !== context.key
    || !object(identity.request_payload) || canonical(identity.request_payload) !== canonical(context.payload)
    || typeof identity.request_fingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(identity.request_fingerprint)
    || typeof identity.confirmed_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(identity.confirmed_at) || !Number.isFinite(Date.parse(identity.confirmed_at))) return unknown();
  return r;
}
