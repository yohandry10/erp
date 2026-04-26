/**
 * Hook for validating Boleta GRE requirements
 * Requirements: 15.4, 19.4
 */

import { useMemo } from 'react'
import { TipoDocumento } from '@/types/ventas'
import {
  validateBoletaGRERequirement,
  getBoletaWarningMessage,
  getGREActionMessage,
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
 * Hook to validate Boleta GRE requirements
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
 * if (validation.requiresGRE) {
 *   // Show GRE requirement alert
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
        requiresGRE: false,
        threshold: BOLETA_GRE_THRESHOLD,
        total
      }
    }
    return validateBoletaGRERequirement(documentoTipo, total)
  }, [documentoTipo, total])

  const warningMessage = useMemo(() => {
    if (!documentoTipo) return null
    return getBoletaWarningMessage(documentoTipo, total)
  }, [documentoTipo, total])

  const actionMessage = useMemo(
    () => getGREActionMessage(validation.requiresGRE),
    [validation.requiresGRE]
  )

  return {
    validation,
    warningMessage,
    actionMessage,
    threshold: BOLETA_GRE_THRESHOLD
  }
}
