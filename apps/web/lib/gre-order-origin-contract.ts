const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const nonempty = (value: unknown) => typeof value === 'string' && value.trim().length > 0
const positive = (value: unknown) => (typeof value === 'number' || typeof value === 'string' && value.trim() !== '') && Number.isFinite(Number(value)) && Number(value) > 0

/** Preparar una GRE requiere el pedido, destinatario y detalle de esa empresa. */
export function greOrderOrigin(response: any, orderId: string, tenantId: string): any {
  const order = response?.data
  const client = order?.cliente ?? order?.clientes
  if (!uuid.test(orderId) || !uuid.test(tenantId)
    || response?.success !== true || response.offline || response.pending || response.queued
    || !order || order.offline || order.pending || order.queued
    || order.id !== orderId || order.tenant_id !== tenantId || !nonempty(order.numero)
    || !uuid.test(order.cliente_id || '') || !client || client.id !== order.cliente_id || client.tenant_id !== tenantId
    || !nonempty(client.razon_social || client.nombre_comercial)
    || !nonempty(client.documento_tipo || client.tipo_documento)
    || !nonempty(client.documento_numero || client.numero_documento || client.ruc)
    || !Array.isArray(order.detalle) || order.detalle.length === 0
    || order.detalle.some((item: any) => !item || !uuid.test(item.id || '') || item.pedido_id !== orderId || item.tenant_id !== tenantId
      || !nonempty(item.descripcion) || !positive(item.cantidad))
    || new Set(order.detalle.map((item: any) => item.id)).size !== order.detalle.length) {
    throw new Error('No se pudo confirmar el pedido de origen completo. Reintente la consulta.')
  }
  return order
}
