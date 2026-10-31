export interface InvoiceRegistrationRequest {
  proveedor_id: string; tipo_documento: string; numero_documento: string; serie: string;
  fecha_emision: string; fecha_vencimiento: string; condiciones_pago: string;
  subtotal: number; igv: number; total: number; moneda: string; tipo_cambio: number;
  destino_credito_fiscal: string; orden_id?: string; recepcion_id?: string;
  codigo_detraccion?: string; detraccion?: number; retencion?: number; percepcion?: number;
}
export interface InvoiceRegistrationScope { tenantId: string; actorId: string }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const id = (value: unknown): value is string => typeof value === 'string' && uuid.test(value)
const invalid = () => new Error('La respuesta no confirma este documento. Conservamos los datos; reintenta el mismo registro.')
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid()
  const row = value as Record<string, unknown>
  if (['offline', 'cached', 'queued', 'pending'].some(key => row[key] === true)) throw invalid()
  return row
}
function number(value: unknown): number {
  if (!(typeof value === 'number' || (typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value))) ||
      !Number.isFinite(Number(value)) || Number(value) < 0) throw invalid()
  return Number(value)
}
function money(value: unknown): number {
  const amount = number(value)
  if (!Number.isSafeInteger(Math.round(amount * 100)) || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6) throw invalid()
  return Math.round(amount * 100)
}
function sameMoney(actual: unknown, expected: number) { if (money(actual) !== money(expected)) throw invalid() }
function civil(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value
}
/** Full receipt of the invoice writer; credit notes use their separate adjustment writer. */
export function readInvoiceRegistration(value: unknown, request: InvoiceRegistrationRequest, scope: InvoiceRegistrationScope): { id: string } {
  const envelope = object(value)
  if (envelope.success !== true || !id(scope.tenantId) || !id(scope.actorId)) throw invalid()
  const row = object(envelope.data)
  const fiscal = object(row.fiscal_metadata)
  const rate = request.moneda === 'PEN' ? 1 : request.tipo_cambio
  const code = request.codigo_detraccion?.trim() || null
  const normalizedCode = code && /^\d{1,3}$/.test(code) ? code.padStart(3, '0') : code
  const key = `cxp:factura:${scope.tenantId}:${request.proveedor_id}:${request.numero_documento.trim().toUpperCase()}`.toLowerCase()
  if (!id(row.id) || row.tenant_id !== scope.tenantId || row.created_by !== scope.actorId || !id(row.event_id) ||
      row.proveedor_id !== request.proveedor_id || !id(request.proveedor_id) ||
      row.numero_documento !== request.numero_documento.trim().toUpperCase() || row.tipo_documento !== request.tipo_documento ||
      row.moneda !== request.moneda || row.orden_id !== (request.orden_id || null) || row.recepcion_id !== (request.recepcion_id || null) ||
      (request.orden_id && !id(request.orden_id)) || (request.recepcion_id && !id(request.recepcion_id)) ||
      row.fecha_emision !== request.fecha_emision || row.fecha_vencimiento !== request.fecha_vencimiento ||
      !civil(row.fecha_emision) || !civil(row.fecha_vencimiento) || row.fecha_vencimiento < row.fecha_emision ||
      row.condiciones_pago !== request.condiciones_pago || row.destino_credito_fiscal !== request.destino_credito_fiscal ||
      row.codigo_detraccion !== normalizedCode || row.idempotency_key !== key || typeof row.idempotent !== 'boolean' ||
      fiscal.serie !== (request.serie.trim() || null) || fiscal.fingerprint_version !== 1 ||
      typeof fiscal.request_fingerprint !== 'string' || !/^[0-9a-f]{64}$/i.test(fiscal.request_fingerprint) ||
      typeof row.created_at !== 'string' || !Number.isFinite(Date.parse(row.created_at)) ||
      !['PENDIENTE','PARCIAL','VENCIDA','PAGADA','ANULADA'].includes(String(row.estado))) throw invalid()
  for (const [field, expected] of [
    ['subtotal', request.subtotal], ['igv', request.igv], ['total', request.total],
    ['retencion_total', request.retencion || 0], ['percepcion_total', request.percepcion || 0],
    ['detraccion_total', request.detraccion || 0], ['anticipo_total', 0],
  ] as const) sameMoney(row[field], expected)
  if (money(row.total) <= 0 || money(row.subtotal) + money(row.igv) !== money(row.total) ||
      money(row.saldo) !== money(row.saldo_pendiente) ||
      money(row.saldo) > money(row.total) - money(row.retencion_total) - money(row.detraccion_total) + money(row.percepcion_total) ||
      (row.estado === 'PAGADA' && money(row.saldo) !== 0) ||
      (row.estado === 'PENDIENTE' && money(row.saldo) <= 0) ||
      number(row.tipo_cambio_origen) <= 0 || Math.abs(number(row.tipo_cambio_origen) - rate) > 1e-8 ||
      Math.abs(number(fiscal.tipo_cambio) - rate) > 1e-8) throw invalid()
  // Legacy receipts may lack this saved context; the immutable row fields above must still match.
  if (fiscal.request_context_540 !== undefined) {
    const context = object(fiscal.request_context_540)
    if (context.serie !== (request.serie.trim() || null) || context.fecha_emision !== request.fecha_emision ||
        context.destino_credito_fiscal !== request.destino_credito_fiscal || context.codigo_detraccion !== normalizedCode ||
        Math.abs(number(context.tipo_cambio_origen) - rate) > 1e-8) throw invalid()
  }
  return { id: row.id }
}
