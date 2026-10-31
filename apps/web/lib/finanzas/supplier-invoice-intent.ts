import type { InvoiceRegistrationRequest, InvoiceRegistrationScope } from './supplier-invoice-registration'

export type SupplierInvoiceIntent = InvoiceRegistrationScope & {
  version: 1; createdAt: string;
  payload: InvoiceRegistrationRequest & { observaciones?: string };
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const text = (v: unknown): v is string => typeof v === 'string' && !!v.trim() && v === v.trim()
const money = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 &&
  Number.isSafeInteger(Math.round(v * 100)) && Math.abs(v * 100 - Math.round(v * 100)) < 1e-6
const civil = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(v)) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v
const fail = (): never => { throw new Error('No se pudo recuperar el registro pendiente. Sus datos se conservan y se bloquea otro registro.') }
export function supplierInvoiceIntentKey(scope: InvoiceRegistrationScope) {
  if (!uuid.test(scope.tenantId) || !uuid.test(scope.actorId)) return fail()
  return `erp.supplier-invoice.pending.v1.${scope.tenantId}:${scope.actorId}`
}
export function readSupplierInvoiceIntent(serialized: string | null, scope: InvoiceRegistrationScope): SupplierInvoiceIntent | null {
  supplierInvoiceIntentKey(scope)
  if (serialized === null) return null
  let intent: SupplierInvoiceIntent
  try { intent = JSON.parse(serialized) } catch { return fail() }
  const p = intent?.payload
  const keys = ['proveedor_id','tipo_documento','serie','numero_documento','fecha_emision','fecha_vencimiento','condiciones_pago','subtotal','igv','total','moneda','tipo_cambio','destino_credito_fiscal','orden_id','recepcion_id','codigo_detraccion','detraccion','retencion','percepcion','observaciones']
  if (!intent || Array.isArray(intent) || Object.keys(intent).some(k => !['version','tenantId','actorId','createdAt','payload'].includes(k)) ||
      intent.version !== 1 || intent.tenantId !== scope.tenantId || intent.actorId !== scope.actorId ||
      typeof intent.createdAt !== 'string' || !Number.isFinite(Date.parse(intent.createdAt)) ||
      !p || Array.isArray(p) || Object.keys(p).some(k => !keys.includes(k)) || !uuid.test(p.proveedor_id || '') ||
      !['FACTURA','NOTA_DEBITO','RECIBO_HONORARIOS'].includes(p.tipo_documento) ||
      typeof p.serie !== 'string' || p.serie !== p.serie.trim() || !text(p.numero_documento) ||
      !civil(p.fecha_emision) || !civil(p.fecha_vencimiento) || p.fecha_vencimiento < p.fecha_emision ||
      !['CONTADO','CREDITO_7','CREDITO_15','CREDITO_30','CREDITO_45','CREDITO_60','CREDITO_90'].includes(p.condiciones_pago) ||
      !['PEN','USD','EUR'].includes(p.moneda) || typeof p.tipo_cambio !== 'number' || !Number.isFinite(p.tipo_cambio) || p.tipo_cambio <= 0 ||
      (p.moneda === 'PEN' && p.tipo_cambio !== 1) || !['GRAVADAS','NO_GRAVADAS','COMUN'].includes(p.destino_credito_fiscal) ||
      !money(p.subtotal) || !money(p.igv) || !money(p.total) || p.total <= 0 || Math.round((p.subtotal + p.igv) * 100) !== Math.round(p.total * 100) ||
      ['orden_id','recepcion_id'].some(k => Object.hasOwn(p,k) && !uuid.test(p[k as 'orden_id' | 'recepcion_id'] || '')) ||
      ['detraccion','retencion','percepcion'].some(k => Object.hasOwn(p,k) && !money(p[k as 'detraccion' | 'retencion' | 'percepcion'])) ||
      ['codigo_detraccion','observaciones'].some(k => Object.hasOwn(p,k) && !text(p[k as 'codigo_detraccion' | 'observaciones'])) ||
      ((p.detraccion || 0) > 0 && !p.codigo_detraccion) ||
      Math.round((p.total - (p.detraccion || 0) - (p.retencion || 0) + (p.percepcion || 0)) * 100) < 0) return fail()
  return intent
}
