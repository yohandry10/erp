'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTenant } from '@/contexts/TenantContext'

const API_BASE_URL = '/backend'

export interface ConfigurationStatus {
  isComplete: boolean
  completionPercentage: number
  missingItems: string[]
  certificate: {
    exists: boolean
    isValid: boolean
    expiresAt?: Date
  }
  ruc: {
    isConfigured: boolean
    missingFields: string[]
  }
}

export function useConfigurationStatus() {
  const [status, setStatus] = useState<ConfigurationStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { isSuperAdmin, loading: tenantLoading } = useTenant()

  const checkStatus = useCallback(async (signal?: AbortSignal) => {
    try {
      setIsLoading(true)
      setError(null)

      // SUPER ADMINS DON'T NEED CONFIGURATION - ALWAYS COMPLETE
      if (isSuperAdmin === true) {
        console.log('[useConfigurationStatus] Super admin detected - returning complete status')
        setStatus({
          isComplete: true,
          completionPercentage: 100,
          missingItems: [],
          certificate: {
            exists: true,
            isValid: true
          },
          ruc: {
            isConfigured: true,
            missingFields: []
          }
        })
        setIsLoading(false)
        return
      }

      const response = await fetch(`${API_BASE_URL}/api/configuration/context/status/`, {
        headers: {
          'Content-Type': 'application/json',
        },
        mode: 'cors',
        credentials: 'include',
        signal,
      })

      if (!response.ok) {
        // Si es 404 o 500, asumir que no hay configuración
        console.warn('[useConfigurationStatus] Configuration status not available, assuming incomplete')
        setStatus({
          isComplete: false,
          completionPercentage: 0,
          missingItems: ['Certificado digital', 'RUC', 'Razón Social', 'Dirección'],
          certificate: {
            exists: false,
            isValid: false
          },
          ruc: {
            isConfigured: false,
            missingFields: ['RUC', 'Razón Social']
          }
        })
        return
      }

      const data = await response.json()

      if (data.success) {
        setStatus(data.data)
      } else {
        // Si hay error, asumir configuración incompleta
        setStatus({
          isComplete: false,
          completionPercentage: 0,
          missingItems: ['Certificado digital', 'RUC', 'Razón Social', 'Dirección'],
          certificate: {
            exists: false,
            isValid: false
          },
          ruc: {
            isConfigured: false,
            missingFields: ['RUC', 'Razón Social']
          }
        })
      }
    } catch (err) {
      if (signal?.aborted) {
        return
      }
      console.warn('[useConfigurationStatus] Error checking configuration status:', err)
      setError(err instanceof Error ? err.message : 'Error desconocido')
      // En caso de error, asumir configuración incompleta en lugar de fallar
      setStatus({
        isComplete: false,
        completionPercentage: 0,
        missingItems: ['Certificado digital', 'RUC', 'Razón Social', 'Dirección'],
        certificate: {
          exists: false,
          isValid: false
        },
        ruc: {
          isConfigured: false,
          missingFields: ['RUC', 'Razón Social']
        }
      })
    } finally {
      if (!signal?.aborted) {
        setIsLoading(false)
      }
    }
  }, [isSuperAdmin])

  useEffect(() => {
    // Don't check status if still loading tenant data
    if (tenantLoading) {
      return
    }
    const controller = new AbortController()
    checkStatus(controller.signal)
    return () => controller.abort()
  }, [checkStatus, tenantLoading, isSuperAdmin])

  return {
    status,
    isLoading,
    error,
    refetch: checkStatus,
  }
}
