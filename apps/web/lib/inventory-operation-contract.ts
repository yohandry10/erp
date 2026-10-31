import { confirmInventoryOperationIdentity,type InventoryReceiptScope } from './inventory-operation-identity'
export type InventoryProduct = { id: string; tenant_id:string; nombre: string; codigo?: string | null; activo: boolean; es_servicio: boolean; controla_stock: boolean }
export type InventoryWarehouse = { id: string; tenant_id:string; nombre: string; codigo?: string | null; activo: boolean }
export type AdjustmentIntent = { producto_id: string; almacen_id: string; delta: number; motivo: string; lote?: string; fecha_expiracion?: string; idempotency_key: string }
export type TransferIntent = { producto_id: string; almacen_origen_id: string; almacen_destino_id: string; cantidad: number; motivo: string; guia_remision_id?: string; idempotency_key: string }
export type InventoryIntent = { mode: 'ajuste'; payload: AdjustmentIntent } | { mode: 'transferencia'; payload: TransferIntent }
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
const invalid = (): never => { throw new Error('La información de inventario está incompleta. Reintenta para consultar datos actuales.') }
function liveData(response: any) {
  if (!response || response.success !== true || ['cached','offline','queued','pending','from_cache'].some(k=>(response[k]!==undefined&&response[k]!==false)||(response.data?.[k]!==undefined&&response.data[k]!==false)) || response.data?.sync_status === 'pending') return invalid()
  return response.data
}
function completeCatalog(response:any,tenant:string){
  const rows=liveData(response)
  if(!uuid(tenant)||response.complete!==true||response.tenant_id!==tenant||!Number.isSafeInteger(response.total)||response.total<0||!Array.isArray(rows)||response.total!==rows.length||new Set(rows.map((r:any)=>r?.id)).size!==rows.length||rows.some((r:any)=>!r||!uuid(r.id)||r.tenant_id!==tenant||['cached','offline','queued','pending'].some(k=>r[k]!==undefined&&r[k]!==false)))return invalid()
  return rows
}
function catalog(response: any, product: boolean,tenant:string) {
  const rows = completeCatalog(response,tenant)
  if(product&&response.include_sucursal!==false)return invalid()
  if (!Array.isArray(rows) || rows.some(row => !row || !uuid(row.id) || typeof row.nombre !== 'string' || !row.nombre.trim() || typeof row.activo !== 'boolean'
    || (product && (typeof row.es_servicio !== 'boolean' || typeof row.controla_stock !== 'boolean'))) || new Set(rows.map(row => row.id)).size !== rows.length) return invalid()
  return rows
}
export function readInventoryProducts(response: any,tenant:string): InventoryProduct[] { return catalog(response, true,tenant).filter(row => row.activo && !row.es_servicio && row.controla_stock) }
export function readInventoryWarehouses(response: any,tenant:string): InventoryWarehouse[] { return catalog(response, false,tenant).filter(row => row.activo) }
export function readInventoryGuides(response: any,tenant:string): { id: string; numero: string; estado: string; motivo: string }[] {
  const rows = completeCatalog(response,tenant)
  if (!Array.isArray(rows) || rows.some(row => !row || !uuid(row.id) || typeof row.numero !== 'string' || !row.numero.trim()
    || row.motivo !== 'TRASLADO_ENTRE_ESTABLECIMIENTOS' || !['FIRMADO','ENVIADO','ACEPTADO'].includes(row.estado))
    || new Set(rows.map(row => row.id)).size !== rows.length) return invalid()
  return rows.filter(row => row.motivo === 'TRASLADO_ENTRE_ESTABLECIMIENTOS' && ['FIRMADO','ENVIADO','ACEPTADO'].includes(row.estado))
}
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
export function readInventoryIntent(value: any): InventoryIntent | null {
  if (value === null) return null
  const plain = (v:any) => !!v && typeof v === 'object' && !Array.isArray(v)
  const p = value?.payload
  if (!plain(value) || Object.keys(value).length !== 2 || !['ajuste','transferencia'].includes(value.mode) || !plain(p)
    || !uuid(p.producto_id) || typeof p.motivo !== 'string' || p.motivo.trim().length < 3 || p.motivo.length > 500
    || typeof p.idempotency_key !== 'string' || !p.idempotency_key.startsWith(`inventario-${value.mode}:`)
    || !uuid(p.idempotency_key.slice(`inventario-${value.mode}:`.length))) return invalid()
  const exact = (allowed:string[],required:number) => Object.keys(p).length >= required && Object.keys(p).length <= allowed.length && Object.keys(p).every(k=>allowed.includes(k))
  if (value.mode === 'ajuste' && exact(['producto_id','almacen_id','delta','motivo','lote','fecha_expiracion','idempotency_key'],5)
    && (p.lote === undefined || (typeof p.lote === 'string' && p.lote.trim().length > 0 && p.lote.length <= 80))
    && (p.fecha_expiracion === undefined || (typeof p.lote === 'string' && typeof p.fecha_expiracion === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.fecha_expiracion)))
    && uuid(p.almacen_id) && finite(p.delta) && p.delta !== 0 && Math.abs(p.delta) <= 999999999999
    && Math.abs(p.delta * 1e6 - Math.round(p.delta * 1e6)) <= 0.000001) return value
  if (value.mode === 'transferencia' && exact(['producto_id','almacen_origen_id','almacen_destino_id','cantidad','motivo','idempotency_key','guia_remision_id'],6)
    && uuid(p.almacen_origen_id) && uuid(p.almacen_destino_id) && p.almacen_origen_id !== p.almacen_destino_id
    && finite(p.cantidad) && p.cantidad > 0 && p.cantidad <= 999999999999
    && Math.abs(p.cantidad * 1e6 - Math.round(p.cantidad * 1e6)) <= 0.000001
    && (!Object.prototype.hasOwnProperty.call(p,'guia_remision_id') || uuid(p.guia_remision_id))) return value
  return invalid()
}
export function inventoryOriginalReceiptEndpoint(intent: InventoryIntent) {
  if (!readInventoryIntent(intent)) return invalid()
  const params=new URLSearchParams(Object.entries(intent.payload).map(([key,value])=>[key,String(value)]))
  return `/inventario/${intent.mode==='ajuste'?'movimientos':'transferencias'}/recibo?${params.toString()}`
}
export function readAdjustmentConfirmation(response: any, intent: AdjustmentIntent,scope:InventoryReceiptScope) {
  const row = liveData(response)
  if (!row || row.success !== true || !uuid(row.operacion_id) || !uuid(row.movimiento_id) || !uuid(row.event_id)
    || row.producto_id !== intent.producto_id || row.almacen_id !== intent.almacen_id || row.delta !== intent.delta || row.cantidad !== Math.abs(intent.delta)
    || row.tipo !== (intent.delta > 0 ? 'SOBRANTE' : 'FALTANTE') || typeof row.idempotent !== 'boolean'
    || !finite(row.stock_nuevo) || row.stock_nuevo < 0 || !finite(row.costo_unitario) || row.costo_unitario < 0 || !finite(row.valor) || row.valor < 0
    || Math.abs(row.valor - Math.round((Math.abs(intent.delta) * row.costo_unitario + Number.EPSILON * Math.max(1, Math.abs(intent.delta) * row.costo_unitario)) * 100) / 100) > 0.000001) return invalid()
  confirmInventoryOperationIdentity(row,intent,'AJUSTE',scope)
  return row as { tipo: string; stock_nuevo: number; costo_unitario: number; valor: number; idempotent: boolean }
}
export function readTransferConfirmation(response: any, intent: TransferIntent,scope:InventoryReceiptScope) {
  const row = liveData(response)
  const traslado = row?.traslado_entre_establecimientos
  const validTransferMetadata = traslado === null || (traslado && typeof traslado === 'object' && !Array.isArray(traslado)
    && traslado.requiere_gre === true && uuid(traslado.sucursal_origen_id) && uuid(traslado.sucursal_destino_id)
    && traslado.sucursal_origen_id !== traslado.sucursal_destino_id && /^\d{4}$/.test(traslado.establecimiento_origen)
    && /^\d{4}$/.test(traslado.establecimiento_destino) && traslado.motivo_traslado_sunat === '04'
    && (traslado.guia_remision_id === null || uuid(traslado.guia_remision_id)))
  if (!row || row.success !== true || !uuid(row.operacion_id) || !uuid(row.movimiento_salida_id) || !uuid(row.movimiento_entrada_id)
    || row.movimiento_salida_id === row.movimiento_entrada_id || row.producto_id !== intent.producto_id || row.almacen_origen_id !== intent.almacen_origen_id
    || row.almacen_destino_id !== intent.almacen_destino_id || row.cantidad !== intent.cantidad || typeof row.idempotent !== 'boolean' || !validTransferMetadata) return invalid()
  confirmInventoryOperationIdentity(row,intent,'TRANSFERENCIA',scope)
  return row as { cantidad: number; idempotent: boolean }
}
