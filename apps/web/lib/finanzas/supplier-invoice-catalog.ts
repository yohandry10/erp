export interface SupplierInvoiceCatalogScope { tenantId: string; actorId: string }
export interface InvoiceSupplier { id: string; razon_social: string; ruc?: string | null }
export interface InvoiceReceipt {
  id: string; numero: string; orden_id: string | null; fecha_recepcion: string;
  orden: { id: string; numero: string; proveedor: { id: string } } | null;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const id = (v: unknown): v is string => typeof v === 'string' && uuid.test(v)
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
const invalid = () => new Error('El catálogo está incompleto o no corresponde a esta empresa. Reintenta la consulta.')
function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw invalid()
  const row = v as Record<string, unknown>
  if (['offline', 'cached', 'queued', 'pending'].some(k => row[k] === true)) throw invalid()
  return row
}
function rows(value: unknown, scope: SupplierInvoiceCatalogScope, allowArray: boolean) {
  if (!id(scope.tenantId) || !id(scope.actorId)) throw invalid()
  let data: unknown[]
  if (Array.isArray(value) && allowArray) data = value
  else {
    const envelope = object(value)
    if (envelope.success !== true || !Array.isArray(envelope.data) || envelope.count !== envelope.data.length) throw invalid()
    data = envelope.data
  }
  const ids = new Set<string>()
  return data.map(v => {
    const row = object(v)
    if (!id(row.id) || ids.has(row.id) || row.tenant_id !== scope.tenantId) throw invalid()
    ids.add(row.id)
    return row
  })
}
export function readInvoiceSuppliers(value: unknown, scope: SupplierInvoiceCatalogScope): InvoiceSupplier[] {
  return rows(value, scope, false).map(row => {
    if (row.activo !== true || !text(row.razon_social) ||
        (row.ruc !== null && row.ruc !== undefined && typeof row.ruc !== 'string')) throw invalid()
    return row as unknown as InvoiceSupplier
  })
}
export function readInvoiceReceipts(value: unknown, scope: SupplierInvoiceCatalogScope): InvoiceReceipt[] {
  return rows(value, scope, true).map(row => {
    if (row.estado !== 'CERRADA' || !text(row.numero) || typeof row.fecha_recepcion !== 'string' ||
        !Number.isFinite(Date.parse(row.fecha_recepcion))) throw invalid()
    const day = row.fecha_recepcion.slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || new Date(day + 'T00:00:00Z').toISOString().slice(0, 10) !== day) throw invalid()
    if (row.orden_id === null && row.orden === null) return row as unknown as InvoiceReceipt
    const order = object(row.orden)
    const supplier = object(order.proveedor)
    if (!id(row.orden_id) || order.id !== row.orden_id || !text(order.numero) || !id(supplier.id)) throw invalid()
    return row as unknown as InvoiceReceipt
  })
}
