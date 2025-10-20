'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002'

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

  const checkStatus = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      // Obtener token de sesión
      const supabase = createClientComponentClient()
      const { data: { session } } = await supabase.auth.getSession()
      
      const headers: HeadersInit = {
        'Content-Type': 'application/json'
      }
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }

      const response = await fetch(`${API_BASE_URL}/api/configuration/status`, { headers })
      
      if (!response.ok) {
        // Si es 404 o 500, asumir que no hay configuración
        console.warn('Configuration status not available, assuming incomplete')
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
      console.error('Error checking configuration status:', err)
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    checkStatus()
  }, [checkStatus])

  return {
    status,
    isLoading,
    error,
    refetch: checkStatus,
  }
}
