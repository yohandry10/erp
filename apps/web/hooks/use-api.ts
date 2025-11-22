'use client'

import { useState, useCallback } from 'react'
import { useToast } from '@/components/ui/use-toast'
import { useAuth } from '@/contexts/AuthContext'

interface ApiResponse<T> {
  data?: T
  message?: string
  success: boolean
}

interface UseApiOptions {
  showErrorToast?: boolean
  showSuccessToast?: boolean
  throwOnError?: boolean
}

export function useApi<T = any>(options: UseApiOptions = {}) {
  const [state, setState] = useState<ApiResponse<T>>({
    success: false,
    data: undefined,
  })
  
  const { toast } = useToast()
  const { session, loading: authLoading } = useAuth()
  const { showErrorToast = true, showSuccessToast = false, throwOnError = false } = options

  const apiCall = useCallback(async (
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T | null> => {
    setState({ success: false, data: undefined })

    try {
      // ✅ CRÍTICO: Esperar a que AuthContext termine de cargar
      if (authLoading) {
        console.log('⏳ [useApi] Esperando a que AuthContext termine de cargar...')
        // Esperar un momento para que el contexto se inicialice
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      // ✅ SOLUCIÓN: Obtener token del contexto de autenticación (siempre sincronizado)
      const token = session?.access_token
      
      // Debug solo en desarrollo
      if (process.env.NODE_ENV === 'development') {
        console.log('🔍 [useApi] Token status:', {
          authLoading,
          hasSession: !!session,
          hasToken: !!token,
          tokenLength: token?.length || 0,
          endpoint: endpoint
        })
      }
      
      if (!token) {
        console.error('❌ [useApi] No hay sesión activa')
        console.error('❌ [useApi] Endpoint solicitado:', endpoint)
        console.error('❌ [useApi] AuthContext loading:', authLoading)
        
        // Redirigir al login si no estamos ya ahí
        if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
          console.log('🔄 [useApi] Redirigiendo al login...')
          window.location.href = '/login'
        }
        return null
      }
      
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002'
      // Agregar prefijo /api si el endpoint no lo tiene
      const normalizedEndpoint = endpoint.startsWith('/api') ? endpoint : `/api${endpoint}`
      const url = `${API_BASE_URL}${normalizedEndpoint}`
      
      // Headers base - convertir options.headers a objeto plano si es necesario
      const optionsHeaders = options.headers instanceof Headers 
        ? Object.fromEntries(options.headers.entries())
        : (options.headers || {})
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...optionsHeaders,
      }

      // Añadir token si existe (tiene prioridad sobre headers proporcionados)
      if (token) {
        headers.Authorization = `Bearer ${token}`
      }

      // Inyección automática del país (si existe en localStorage)
      try {
        if (typeof window !== 'undefined') {
          const storedCountryId = window.localStorage.getItem('selectedCountry')
          if (storedCountryId && /^\d+$/.test(storedCountryId)) {
            // Solo lo añadimos si el caller no lo envió ya
            if (!headers['x-country-id']) {
              headers['x-country-id'] = storedCountryId
            }
          }
        }
      } catch {
        /* no-op si localStorage no está disponible */
      }

      // Excluir headers de options para evitar conflictos
      const { headers: _, ...restOptions } = options
      
      const response = await fetch(url, {
        cache: 'no-store', // evita servir 304/ETag y trae estado fresco
        ...restOptions,
        headers: {
          'Cache-Control': 'no-cache',
          ...headers,
        },
        mode: 'cors',
      })

      // Handle 401 Unauthorized - redirect to login
      if (response.status === 401) {
        if (process.env.NODE_ENV === 'development') {
          console.error('❌ [useApi] 401 Unauthorized - Endpoint:', url);
        }
        
        // Limpiar sesión y redirigir al login
        if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
          localStorage.removeItem('access_token')
          localStorage.removeItem('user')
          window.location.href = '/login'
        }
        throw new Error('Unauthorized - Session expired')
      }

      // Handle 403 Forbidden - show permission error
      if (response.status === 403) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.message || 'You do not have permission to perform this action'
        throw new Error(errorMessage)
      }

      if (!response.ok) {
        // Intentar parsear JSON de error para propagar detalles (warnings, etc.)
        let errorData: any = null
        try {
          errorData = await response.json()
        } catch {
          /* ignore parse error */
        }

        const errorMessage =
          errorData?.message ||
          errorData?.error ||
          `HTTP error! status: ${response.status}`

        const err = new Error(errorMessage) as any
        if (errorData) {
          err.data = errorData
        }
        throw err
      }

      // Handle 204 No Content (DELETE success)
      if (response.status === 204) {
        setState({ success: true, data: undefined as any })
        if (showSuccessToast) {
          toast({
            title: 'Éxito',
            description: 'Operación completada exitosamente',
          })
        }
        return { success: true } as any
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

      if (throwOnError) {
        throw err
      }

      return null
    }
  }, [toast, session, authLoading, showErrorToast, showSuccessToast])

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
    del,
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
