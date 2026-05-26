'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { useTenant } from '@/contexts/TenantContext'
import { fetchApi } from '@/lib/api-fetch'

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

const SUPER_ADMIN_STATUS: ConfigurationStatus = {
  isComplete: true,
  completionPercentage: 100,
  missingItems: [],
  certificate: { exists: true, isValid: true },
  ruc: { isConfigured: true, missingFields: [] },
}

const EMPTY_STATUS: ConfigurationStatus = {
  isComplete: false,
  completionPercentage: 0,
  missingItems: ['Certificado digital', 'RUC', 'Razón Social', 'Dirección'],
  certificate: { exists: false, isValid: false },
  ruc: { isConfigured: false, missingFields: ['RUC', 'Razón Social'] },
}

async function fetchConfigurationStatus(): Promise<ConfigurationStatus> {
  const response = await fetchApi('/api/configuration/context/status/', {
    headers: { 'Content-Type': 'application/json' },
    mode: 'cors',
    credentials: 'include',
    cache: 'no-store',
  })

  if (!response.ok) {
    // El backend devuelve 404/500 si todavía no hay configuración: lo tratamos
    // como "incompleto" en lugar de error, para no bloquear el dashboard.
    console.warn('[useConfigurationStatus] Backend respondió', response.status, '— asumimos config incompleta')
    return EMPTY_STATUS
  }

  const data = await response.json()
  return data?.success ? (data.data as ConfigurationStatus) : EMPTY_STATUS
}

export const CONFIGURATION_STATUS_QUERY_KEY = ['configuration', 'context', 'status'] as const

/**
 * Estado de configuración del tenant (certificado, RUC, etc.).
 *
 * Cacheado con TanStack Query: el endpoint tarda ~3.3s contra Supabase (hace
 * 4-5 queries secuenciales) y los datos solo cambian cuando el usuario completa
 * pasos del wizard. Comparte respuesta entre ConfigurationBanner, dashboard
 * principal, sidebar, etc.
 *
 * Super-admins se cortocircuitan a estado "completo" sin tocar la red.
 */
export function useConfigurationStatus() {
  const queryClient = useQueryClient()
  const { isSuperAdmin, loading: tenantLoading } = useTenant()

  const { data, isLoading, error } = useQuery({
    queryKey: CONFIGURATION_STATUS_QUERY_KEY,
    queryFn: fetchConfigurationStatus,
    // No correr mientras se carga el tenant ni para super-admins.
    enabled: !tenantLoading && isSuperAdmin !== true,
    staleTime: 2 * 60 * 1000, // 2 min: cambia tras completar pasos del wizard
    gcTime: 30 * 60 * 1000,
    retry: 1,
  })

  // Invalida la cache para forzar refetch en el próximo render que use el hook.
  // Se llama desde el wizard tras guardar configuración para que el banner se
  // actualice inmediatamente.
  const refetch = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: CONFIGURATION_STATUS_QUERY_KEY })
  }, [queryClient])

  if (isSuperAdmin === true) {
    return { status: SUPER_ADMIN_STATUS, isLoading: false, error: null, refetch }
  }

  return {
    status: data ?? null,
    isLoading: tenantLoading || isLoading,
    error: error instanceof Error ? error.message : null,
    refetch,
  }
}
