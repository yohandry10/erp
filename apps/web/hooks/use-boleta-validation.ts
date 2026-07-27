/**
 * Hook for validating boleta buyer-identification requirements.
 * Requirements: 15.4, 19.4
 */

import { useMemo } from 'react'
import { TipoDocumento } from '@/types/ventas'
import {
  validateBoletaBuyerIdentityRequirement,
  getBoletaWarningMessage,
  getBuyerIdentityActionMessage,
  BOLETA_GRE_THRESHOLD,
  type BoletaValidationResult
} from '@/lib/validations/boleta-validation'

export interface UseBoletaValidationResult {
  validation: BoletaValidationResult
  warningMessage: string | null
  actionMessage: string | null
  threshold: number
}

/**
 * Hook to validate boleta buyer-identification requirements.
 *
 * @param documentoTipo - Client's document type
 * @param total - Total amount of the sale
 * @returns Validation result and messages
 *
 * @example
 * ```tsx
 * const { validation, warningMessage } = useBoletaValidation(
 *   cliente.documento_tipo,
 *   pedido.total
 * )
 *
 * if (validation.requiresBuyerIdentity) {
 *   // Show buyer identity requirement alert
 * }
 * ```
 */
export function useBoletaValidation(
  documentoTipo: TipoDocumento | undefined,
  total: number
): UseBoletaValidationResult {
  const validation = useMemo(() => {
    if (!documentoTipo) {
      return {
        requiresBuyerIdentity: false,
        requiresGRE: false,
        threshold: BOLETA_GRE_THRESHOLD,
        total
      }
    }
    return validateBoletaBuyerIdentityRequirement(documentoTipo, total)
  }, [documentoTipo, total])

  const warningMessage = useMemo(() => {
    if (!documentoTipo) return null
    return getBoletaWarningMessage(documentoTipo, total)
  }, [documentoTipo, total])

  const actionMessage = useMemo(
    () => getBuyerIdentityActionMessage(validation.requiresBuyerIdentity),
    [validation.requiresBuyerIdentity]
  )

  return {
    validation,
    warningMessage,
    actionMessage,
    threshold: BOLETA_GRE_THRESHOLD
  }
}
