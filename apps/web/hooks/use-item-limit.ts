/**
 * Hook for validating item limits in Cotizaciones and Pedidos
 * Requirements: 15.3, 19.5
 */

import { useMemo } from 'react'
import {
  validateItemLimit,
  canAddMoreItems,
  getRemainingItemsCount,
  getItemLimitWarning,
  MAX_ITEMS_PER_DOCUMENT,
  type ItemLimitValidationResult
} from '@/lib/validations/item-limit'

export interface UseItemLimitResult {
  validation: ItemLimitValidationResult
  canAddMore: boolean
  remainingCount: number
  warningMessage: string | null
  maxItems: number
}

/**
 * Hook to validate and manage item limits for documents
 * 
 * @param currentItemCount - Current number of items in the document
 * @returns Validation result and helper functions
 * 
 * @example
 * ```tsx
 * const { validation, canAddMore, warningMessage } = useItemLimit(items.length)
 * 
 * if (!canAddMore) {
 *   toast.error(validation.message)
 * }
 * ```
 */
export function useItemLimit(currentItemCount: number): UseItemLimitResult {
  const validation = useMemo(
    () => validateItemLimit(currentItemCount),
    [currentItemCount]
  )

  const canAddMore = useMemo(
    () => canAddMoreItems(currentItemCount),
    [currentItemCount]
  )

  const remainingCount = useMemo(
    () => getRemainingItemsCount(currentItemCount),
    [currentItemCount]
  )

  const warningMessage = useMemo(
    () => getItemLimitWarning(currentItemCount),
    [currentItemCount]
  )

  return {
    validation,
    canAddMore,
    remainingCount,
    warningMessage,
    maxItems: MAX_ITEMS_PER_DOCUMENT
  }
}
