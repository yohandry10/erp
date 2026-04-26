/**
 * Item Limit Warning Component
 * Requirements: 15.3, 19.5
 * 
 * Displays a warning when approaching or reaching the 999 item limit
 */

'use client'

import { AlertTriangle, XCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useItemLimit } from '@/hooks/use-item-limit'

interface ItemLimitWarningProps {
  itemCount: number
  className?: string
}

export function ItemLimitWarning({ itemCount, className }: ItemLimitWarningProps) {
  const { validation, warningMessage, remainingCount } = useItemLimit(itemCount)

  // Don't show anything if we're not close to the limit
  if (!warningMessage) {
    return null
  }

  // Determine severity based on remaining items
  const isError = !validation.isValid
  const isWarning = remainingCount <= 10 && remainingCount > 0

  return (
    <Alert
      variant={isError ? 'destructive' : 'default'}
      className={className}
    >
      {isError ? (
        <XCircle className="h-4 w-4" />
      ) : (
        <AlertTriangle className="h-4 w-4" />
      )}
      <AlertDescription>
        {warningMessage}
        {isWarning && (
          <div className="mt-1 text-sm">
            Actualmente tiene {itemCount} de {validation.maxCount} ítems permitidos.
          </div>
        )}
        {isError && (
          <div className="mt-1 text-sm">
            Para agregar más productos, debe eliminar algunos ítems existentes o crear un nuevo documento.
          </div>
        )}
      </AlertDescription>
    </Alert>
  )
}

/**
 * Inline badge showing item count with color coding
 */
interface ItemCountBadgeProps {
  itemCount: number
  className?: string
}

export function ItemCountBadge({ itemCount, className }: ItemCountBadgeProps) {
  const { validation, remainingCount } = useItemLimit(itemCount)

  // Determine color based on remaining items
  let colorClass = 'bg-gray-100 text-gray-700'
  if (!validation.isValid) {
    colorClass = 'bg-red-100 text-red-700'
  } else if (remainingCount <= 10) {
    colorClass = 'bg-yellow-100 text-yellow-700'
  } else if (remainingCount <= 50) {
    colorClass = 'bg-blue-100 text-blue-700'
  }

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colorClass} ${className}`}
    >
      {itemCount} / {validation.maxCount} ítems
    </span>
  )
}
