'use client'

import { useState, useEffect, useCallback } from 'react'

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

      const response = await fetch(`${API_BASE_URL}/api/configuration/status`)
      
      if (!response.ok) {
        throw new Error('Error al verificar el estado de configuración')
      }

      const data = await response.json()
      
      if (data.success) {
        setStatus(data.data)
      } else {
        throw new Error(data.message || 'Error desconocido')
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
