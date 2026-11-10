import { readAdjustmentConfirmation, readInventoryIntent, readTransferConfirmation, type InventoryIntent } from './inventory-operation-contract'
import { sameInventoryOperationReceipt, type InventoryReceiptScope } from './inventory-operation-identity'

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>
export function readInventoryArchivedReceipt(storage: Storage, intent: InventoryIntent, owner: InventoryReceiptScope) {
  readInventoryIntent(intent)
  const scope = `${owner.tenantId}.${owner.actorId}`
  const value = storage.getItem(`erp.inventory-operation-resolved.${scope}.${intent.payload.idempotency_key}`)
  if (value === null) return null
  const saved = JSON.parse(value)
  if (saved.version !== 1 || saved.scope !== scope || JSON.stringify(saved.intent) !== JSON.stringify(intent)) {
    throw new Error('El archivo no corresponde al intento original de inventario.')
  }
  return intent.mode === 'ajuste'
    ? readAdjustmentConfirmation({ success: true, data: saved.receipt }, intent.payload, owner)
    : readTransferConfirmation({ success: true, data: saved.receipt }, intent.payload, owner)
}

/** Una pestaña puede retirar el pendiente compartido antes de que la otra reciba su 201. */
export function archiveInventoryConfirmation(storage: Storage, intent: InventoryIntent, receipt: unknown, owner: InventoryReceiptScope) {
  const scope = `${owner.tenantId}.${owner.actorId}`, raw = JSON.stringify(intent)
  const key = `erp.inventory-operation-intent.${scope}`
  const archiveKey = `erp.inventory-operation-resolved.${scope}.${intent.payload.idempotency_key}`
  const confirmed = intent.mode === 'ajuste'
    ? readAdjustmentConfirmation({ success: true, data: receipt }, intent.payload, owner)
    : readTransferConfirmation({ success: true, data: receipt }, intent.payload, owner)
  const previous = readInventoryArchivedReceipt(storage, intent, owner)
  if (previous && !sameInventoryOperationReceipt(previous, confirmed)) throw new Error('El recibo archivado no coincide con la confirmación.')
  if (!previous) {
    storage.setItem(archiveKey, JSON.stringify({ version: 1, scope, intent, receipt: confirmed }))
    const saved = readInventoryArchivedReceipt(storage, intent, owner)
    if (!saved || !sameInventoryOperationReceipt(saved, confirmed)) throw new Error('No se pudo conservar el recibo completo.')
  }
  const pending = storage.getItem(key)
  if (pending !== null && pending !== raw) throw new Error('Otra operación está pendiente. Su intención se conserva.')
  if (pending === raw) storage.removeItem(key)
  if (storage.getItem(key) !== null) throw new Error('No se pudo retirar el pendiente confirmado.')
  return confirmed
}
