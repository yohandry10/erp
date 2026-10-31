export interface OrderHistoryScope { orderId: string; tenantId: string; actorId: string }
export interface OrderApproval {
  id: string; tenant_id: string; orden_id: string; nivel: number;
  aprobador_id: string; aprobador_nombre: string;
  estado: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';
  fecha_aprobacion: string | null; comentarios: string | null; created_at: string;
}
export interface OrderReceiptItem {
  id: string; producto_id: string; cantidad_recibida: number;
  calidad: 'OK' | 'OBSERVADO' | 'RECHAZADO'; almacen_id: string | null;
  lote?: string | null; serie?: string | null; fecha_expiracion?: string | null;
  observaciones?: string | null;
}
export interface OrderReceipt {
  id: string; tenant_id: string; orden_id: string; numero: string;
  fecha_recepcion: string; estado: 'BORRADOR' | 'CERRADA' | 'ANULADA';
  created_by: string; created_at: string; observaciones?: string | null;
  recibido_por?: string; recepcion_items: OrderReceiptItem[];
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const invalid = () => new Error('El historial de la orden está incompleto o no corresponde a esta empresa. Reintenta la consulta.');
const validId = (v: unknown): v is string => typeof v === 'string' && uuid.test(v);
const date = (v: unknown): v is string => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(v) ||
      !Number.isFinite(Date.parse(v))) return false;
  const day = v.slice(0, 10);
  return new Date(day + 'T00:00:00Z').toISOString().slice(0, 10) === day;
};
function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw invalid();
  const r = v as Record<string, unknown>;
  if (['offline', 'cached', 'queued', 'pending'].some(k => r[k] === true)) throw invalid();
  return r;
}
function rows(value: unknown, scope: OrderHistoryScope) {
  if (!validId(scope.orderId) || !validId(scope.tenantId) || !validId(scope.actorId)) throw invalid();
  const r = object(value);
  if (r.success !== true || !Array.isArray(r.data) || r.count !== r.data.length) throw invalid();
  const ids = new Set<string>();
  return r.data.map(v => {
    const row = object(v);
    if (!validId(row.id) || ids.has(row.id) || row.orden_id !== scope.orderId || row.tenant_id !== scope.tenantId ||
        !date(row.created_at)) throw invalid();
    ids.add(row.id);return row;
  });
}
export function readOrderApprovals(value: unknown, scope: OrderHistoryScope,
  approvedActor?: string | null, approvedAt?: string | null): OrderApproval[] {
  const result = rows(value, scope).map(row => {
    if (!validId(row.aprobador_id) || typeof row.aprobador_nombre !== 'string' || !row.aprobador_nombre.trim() ||
        !Number.isInteger(row.nivel) || Number(row.nivel) < 1 ||
        !['PENDIENTE', 'APROBADA', 'RECHAZADA'].includes(String(row.estado)) ||
        (row.estado !== 'PENDIENTE' && !date(row.fecha_aprobacion)) ||
        (row.estado === 'PENDIENTE' && row.fecha_aprobacion !== null && !date(row.fecha_aprobacion)) ||
        (row.comentarios !== null && typeof row.comentarios !== 'string')) throw invalid();
    return row as unknown as OrderApproval;
  });
  if (approvedActor || approvedAt) {
    if (!validId(approvedActor) || !date(approvedAt) || !result.some(row => row.estado === 'APROBADA' &&
        row.aprobador_id === approvedActor && row.fecha_aprobacion === approvedAt)) throw invalid();
  }
  return result;
}
export function readOrderReceipts(value: unknown, scope: OrderHistoryScope, hasReceivedItems = false): OrderReceipt[] {
  const itemIds = new Set<string>();
  const result = rows(value, scope).map(row => {
    if (typeof row.numero !== 'string' || !row.numero.trim() || !date(row.fecha_recepcion) ||
        !validId(row.created_by) || !['BORRADOR', 'CERRADA', 'ANULADA'].includes(String(row.estado)) ||
        !Array.isArray(row.recepcion_items) || row.recepcion_items.length === 0 ||
        (row.observaciones !== null && row.observaciones !== undefined && typeof row.observaciones !== 'string') ||
        (row.estado === 'CERRADA' && (!validId(row.cerrado_por) || !date(row.cerrado_at)))) throw invalid();
    for (const v of row.recepcion_items) {
      const item = object(v);
      // Los servicios y bienes sin control de stock guardan almacén null en la RPC.
      if (!validId(item.id) || itemIds.has(item.id) || !validId(item.producto_id) ||
          (item.almacen_id !== null && !validId(item.almacen_id)) ||
          typeof item.cantidad_recibida !== 'number' || !Number.isFinite(item.cantidad_recibida) || item.cantidad_recibida <= 0 ||
          !['OK', 'OBSERVADO', 'RECHAZADO'].includes(String(item.calidad)) ||
          ['lote', 'serie', 'observaciones'].some(k => item[k] !== undefined && item[k] !== null && typeof item[k] !== 'string') ||
          (item.fecha_expiracion !== undefined && item.fecha_expiracion !== null && !date(item.fecha_expiracion))) throw invalid();
      itemIds.add(item.id);
    }
    return row as unknown as OrderReceipt;
  });
  if (hasReceivedItems && !result.some(row => row.estado === 'CERRADA')) throw invalid();
  return result;
}
