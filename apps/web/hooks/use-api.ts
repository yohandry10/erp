'use client'

import { useState, useCallback } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useToast } from '@/components/ui/use-toast'

interface ApiResponse<T> {
  data?: T
  message?: string
  success: boolean
}

interface UseApiOptions {
  showErrorToast?: boolean
  showSuccessToast?: boolean
}

export function useApi<T = any>(options: UseApiOptions = {}) {
  const [state, setState] = useState<ApiResponse<T>>({
    success: false,
    data: undefined,
  })
  
  const supabase = createClientComponentClient()
  const { toast } = useToast()
  const { showErrorToast = true, showSuccessToast = false } = options

  const apiCall = useCallback(async (
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T | null> => {
    setState({ success: false, data: undefined })

    try {
      // Sesión actual para el token
      const { data: { session } } = await supabase.auth.getSession()
      
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002'
      const url = `${API_BASE_URL}${endpoint}`
      
      // Headers base
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      }

      // Añadir token si existe
      if (session?.access_token) {
        (headers as Record<string, string>).Authorization = `Bearer ${session.access_token}`
      }

      // Inyección automática del país (si existe en localStorage)
      try {
        if (typeof window !== 'undefined') {
          const storedCountryId = window.localStorage.getItem('selectedCountry')
          if (storedCountryId && /^\d+$/.test(storedCountryId)) {
            // Solo lo añadimos si el caller no lo envió ya
            if (!(headers as Record<string, string>)['x-country-id']) {
              ;(headers as Record<string, string>)['x-country-id'] = storedCountryId
            }
          }
        }
      } catch {
        /* no-op si localStorage no está disponible */
      }

      const response = await fetch(url, {
        ...options,
        headers,
        mode: 'cors',
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`)
      }

      const result: any = await response.json()
      
      // Heurística de éxito
      const hasData = result?.id || result?.data || Array.isArray(result)
      const success = result?.success === true || result?.success === 'true' || hasData
      
      if (!success && result?.error) {
        throw new Error(result.message || result.error || 'API call failed')
      }

      const responseData = result?.data !== undefined ? result.data : result
      setState({ success: true, data: responseData })
      
      if (showSuccessToast) {
        toast({
          title: 'Éxito',
          description: result?.message || 'Operación completada exitosamente',
        })
      }

      return result
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setState({ success: false, data: undefined })
      
      if (showErrorToast) {
        toast({
          variant: 'destructive',
          title: 'Error de API',
          description: errorMessage,
        })
      }

      return null
    }
  }, [supabase, toast, showErrorToast, showSuccessToast])

  // Métodos helper
  const get = useCallback((endpoint: string) => {
    return apiCall(endpoint, { method: 'GET' })
  }, [apiCall])

  const post = useCallback((endpoint: string, data?: any) => {
    return apiCall(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    })
  }, [apiCall])

  const put = useCallback((endpoint: string, data?: any) => {
    return apiCall(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    })
  }, [apiCall])

  const del = useCallback((endpoint: string) => {
    return apiCall(endpoint, { method: 'DELETE' })
  }, [apiCall])

  return {
    ...state,
    get,
    post,
    put,
    delete: del,
    request: apiCall,
  }
}

// Hooks específicos
export function useApiCall<T = any>() {
  return useApi<T>()
}

export function useCpeApi() {
  return useApi({
    showErrorToast: true,
    showSuccessToast: true,
  })
}

export function useAuthApi() {
  return useApi({
    showErrorToast: true,
    showSuccessToast: false,
  })
}
