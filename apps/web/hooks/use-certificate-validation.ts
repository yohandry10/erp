/**
 * Hook for validating digital certificate
 * Requirements: 15.5, 19.6, 19.7
 */

import { useState, useEffect, useCallback } from 'react'
import { useApi } from './use-api'
import {
  validateCertificateResponse,
  getCertificateStatus,
  getCertificateErrorMessage,
  getCertificateWarningMessage,
  getCertificateActionMessage,
  type CertificateValidationResult,
  type CertificateStatus
} from '@/lib/validations/certificate-validation'

export interface UseCertificateValidationResult {
  validation: CertificateValidationResult | null
  status: CertificateStatus
  isLoading: boolean
  error: string | null
  canProceed: boolean
  errorMessage: string | null
  warningMessage: string | null
  actionMessage: string | null
  refetch: () => Promise<void>
}

/**
 * Hook to validate digital certificate before generating invoices
 * 
 * @param autoFetch - Whether to automatically fetch validation on mount
 * @returns Certificate validation result and status
 * 
 * @example
 * ```tsx
 * const { validation, canProceed, errorMessage } = useCertificateValidation()
 * 
 * if (!canProceed) {
 *   toast.error(errorMessage)
 *   return
 * }
 * 
 * // Proceed with invoice generation
 * ```
 */
export function useCertificateValidation(
  autoFetch: boolean = true
): UseCertificateValidationResult {
  const api = useApi()
  const [validation, setValidation] = useState<CertificateValidationResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchValidation = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      // Call backend validation endpoint
      const response = await api.get<CertificateValidationResult>(
        '/api/validations/certificate'
      )

      setValidation(response)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error al validar certificado'
      setError(errorMessage)
      
      // Set a default invalid validation
      setValidation({
        isValid: false,
        errors: [errorMessage],
        warnings: []
      })
    } finally {
      setIsLoading(false)
    }
  }, [api])

  useEffect(() => {
    if (autoFetch) {
      fetchValidation()
    }
  }, [autoFetch, fetchValidation])

  const status = getCertificateStatus(validation)
  
  const validationResponse = validation 
    ? validateCertificateResponse(validation)
    : { canProceed: false, message: '', severity: 'error' as const }

  const errorMessage = validation 
    ? getCertificateErrorMessage(validation.errors)
    : null

  const warningMessage = validation
    ? getCertificateWarningMessage(validation.warnings)
    : null

  const actionMessage = getCertificateActionMessage(validation)

  return {
    validation,
    status,
    isLoading,
    error,
    canProceed: validationResponse.canProceed,
    errorMessage,
    warningMessage,
    actionMessage,
    refetch: fetchValidation
  }
}
