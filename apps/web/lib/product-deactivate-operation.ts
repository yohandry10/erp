import { confirmProductUpdateSource, type ProductSnapshot } from './product-update-operation'

export type ProductDeactivateScope = { tenantId: string; actorId: string }
export type ProductDeactivateSnapshot = ProductSnapshot & Record<string, unknown>
export type ProductDeactivateIntent = ProductDeactivateScope & {
  version: 1; createdAt: string; idempotencyKey: string; body: ''; snapshot: ProductDeactivateSnapshot
}
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v)
const live = (v: unknown) => object(v) && ['offline', 'cached', 'queued', 'pending'].every(k => v[k] === undefined || v[k] === false)
const canonical = (v: any): any => Array.isArray(v) ? v.map(canonical) : object(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v
const same = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))
const timestamp = (v: unknown): v is string => typeof v === 'string'
  && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(v)
  && Number.isFinite(Date.parse(v)) && new Date(v.slice(0, 10) + 'T00:00:00Z').toISOString().slice(0, 10) === v.slice(0, 10)
function invalid(): never { throw new Error('No se pudo verificar la baja pendiente del producto. Se conserva para revisar y reintentar con conexión.') }

export function productDeactivateIntentKey(scope: ProductDeactivateScope) {
  if (!uuid(scope.tenantId) || !uuid(scope.actorId)) invalid()
  return `erp.product.deactivate.pending.v1.${scope.tenantId}:${scope.actorId}`
}
function snapshot(value: unknown, scope: ProductDeactivateScope, productId: string) {
  if (!uuid(productId) || !live(value)) invalid()
  const base = confirmProductUpdateSource({ success: true, data: value }, { ...scope, productId })
  if (!object(value)) invalid()
  const textFields = ['ruc', 'sku', 'pais', 'tipo', 'external_id', 'subcategoria', 'tipo_operacion', 'clasificador_sunat']
  const moneyFields = ['costo', 'precio', 'precio_especial', 'precio_unitario', 'precio_mayorista', 'costo_promedio_base']
  const extraFields = [...textFields, ...moneyFields, 'favorito', 'metadata', 'producto_id']
  if (!extraFields.every(k => Object.hasOwn(value, k))
    || !textFields.every(k => value[k] === null || typeof value[k] === 'string')
    || !moneyFields.every(k => value[k] === null || typeof value[k] === 'number' && Number.isFinite(value[k]) && value[k] >= 0
      && value[k] <= 999999999999 && (k === 'costo_promedio_base' || Math.abs(value[k] * 1e6 - Math.round(value[k] * 1e6)) <= 0.000001))
    || !(value.favorito === null || typeof value.favorito === 'boolean')
    || !(value.producto_id === null || uuid(value.producto_id))) invalid()
  return { ...base, ...Object.fromEntries(extraFields.map(k => [k, value[k]])) } as ProductDeactivateSnapshot
}
export function readProductDeactivateCatalog(value: unknown, scope: ProductDeactivateScope) {
  productDeactivateIntentKey(scope)
  if (!live(value) || !object(value) || value.success !== true || !Array.isArray(value.data)) invalid()
  const rows: ProductDeactivateSnapshot[] = value.data.map((row: any) => snapshot(row, scope, row?.id))
  if (new Set(rows.map(row => row.id)).size !== rows.length) invalid()
  return rows
}
export function readProductDeactivateCandidate(value: unknown, scope: ProductDeactivateScope, productId: string, selected: ProductSnapshot) {
  productDeactivateIntentKey(scope)
  if (!live(value) || !object(value) || value.success !== true) invalid()
  const row = snapshot(value.data, scope, productId)
  if (!same(row, snapshot(selected, scope, productId))) throw new Error('El producto cambió desde la consulta. Actualice el catálogo antes de darlo de baja.')
  if (!row.activo || row.stock_actual !== 0 || row.stock_reservado !== 0) throw new Error('Sólo puede dar de baja un producto activo sin stock ni reservas.')
  return row
}
export function newProductDeactivateIntent(row: ProductSnapshot, scope: ProductDeactivateScope): ProductDeactivateIntent {
  productDeactivateIntentKey(scope)
  const original = snapshot(row, scope, row.id)
  if (!same(row, original) || !original.activo || original.stock_actual !== 0 || original.stock_reservado !== 0) invalid()
  return { version: 1, ...scope, createdAt: new Date().toISOString(),
    idempotencyKey: `inventory-product-deactivate:${original.id}:${crypto.randomUUID()}`, body: '', snapshot: original }
}
export function readProductDeactivateIntent(raw: string, scope: ProductDeactivateScope): ProductDeactivateIntent {
  try {
    productDeactivateIntentKey(scope)
    if (typeof raw !== 'string' || raw.length > 131072) invalid()
    const v = JSON.parse(raw)
    const fields = ['version', 'tenantId', 'actorId', 'createdAt', 'idempotencyKey', 'body', 'snapshot']
    if (!object(v) || Object.keys(v).length !== fields.length || !fields.every(k => Object.hasOwn(v, k))
      || v.version !== 1 || v.tenantId !== scope.tenantId || v.actorId !== scope.actorId
      || !timestamp(v.createdAt) || v.body !== '' || !object(v.snapshot)) invalid()
    const row = snapshot(v.snapshot, scope, v.snapshot.id)
    const prefix = `inventory-product-deactivate:${row.id}:`
    if (!same(v.snapshot, row) || !row.activo || row.stock_actual !== 0 || row.stock_reservado !== 0
      || typeof v.idempotencyKey !== 'string' || !v.idempotencyKey.startsWith(prefix)
      || !uuid(v.idempotencyKey.slice(prefix.length))) invalid()
    return v as ProductDeactivateIntent
  } catch { invalid() }
}
export function confirmProductDeactivated(value: unknown, intent: ProductDeactivateIntent) {
  const i = readProductDeactivateIntent(JSON.stringify(intent), intent)
  if (!live(value) || !object(value) || value.success !== true || !live(value.data)
    || typeof value.data.idempotent !== 'boolean' || !uuid(value.data.operation_id)
    || value.data.already_inactive !== undefined && value.data.already_inactive !== false) invalid()
  const row = snapshot(value.data, i, i.snapshot.id)
  if (row.activo || row.estado !== 'INACTIVO' || row.updated_by !== i.actorId
    || Date.parse(row.updated_at) < Date.parse(i.snapshot.updated_at)) invalid()
  const expected = { ...i.snapshot, activo: false, estado: 'INACTIVO', updated_by: i.actorId, updated_at: row.updated_at }
  if (!same(row, expected)) invalid()
  return row
}
