/**
 * Item Limit Validation for Cotizaciones and Pedidos
 * Requirements: 15.3, 19.5
 * 
 * SUNAT requires that electronic documents (CPE) cannot exceed 999 items
 */

export const MAX_ITEMS_PER_DOCUMENT = 999

export interface ItemLimitValidationResult {
  isValid: boolean
  currentCount: number
  maxCount: number
  message?: string
}

/**
 * Validates if the number of items exceeds the SUNAT limit
 */
export function validateItemLimit(itemCount: number): ItemLimitValidationResult {
  const isValid = itemCount <= MAX_ITEMS_PER_DOCUMENT

  return {
    isValid,
    currentCount: itemCount,
    maxCount: MAX_ITEMS_PER_DOCUMENT,
    message: isValid 
      ? undefined 
      : `No puede superar ${MAX_ITEMS_PER_DOCUMENT} ítems por documento. Actualmente tiene ${itemCount} ítems.`
  }
}

/**
 * Checks if adding more items would exceed the limit
 */
export function canAddMoreItems(currentCount: number, itemsToAdd: number = 1): boolean {
  return (currentCount + itemsToAdd) <= MAX_ITEMS_PER_DOCUMENT
}

/**
 * Gets the remaining items that can be added
 */
export function getRemainingItemsCount(currentCount: number): number {
  return Math.max(0, MAX_ITEMS_PER_DOCUMENT - currentCount)
}

/**
 * Gets a warning message when approaching the limit
 */
export function getItemLimitWarning(currentCount: number): string | null {
  const remaining = getRemainingItemsCount(currentCount)
  
  // Show warning when less than 10 items remaining
  if (remaining <= 10 && remaining > 0) {
    return `Advertencia: Solo puede agregar ${remaining} ítems más`
  }
  
  // Show error when limit reached
  if (remaining === 0) {
    return `Ha alcanzado el límite máximo de ${MAX_ITEMS_PER_DOCUMENT} ítems`
  }
  
  return null
}
