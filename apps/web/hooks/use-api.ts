'use client'

import { useState, useCallback } from 'react'
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
  
  const { toast } = useToast()
  const { showErrorToast = true, showSuccessToast = false } = options

  const apiCall = useCallback(async (
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T | null> => {
    setState({ success: false, data: undefined })

    try {
      // ✅ CRÍTICO: Obtener token del localStorage (custom auth)
      let token: string | null = null
      
      if (typeof window !== 'undefined') {
        try {
          token = localStorage.getItem('access_token')
          
          // Debug solo en desarrollo
          if (process.env.NODE_ENV === 'development') {
            console.log('🔍 [useApi] Token status:', {
              hasToken: !!token,
              tokenLength: token?.length || 0,
              endpoint: endpoint
            })
          }
        } catch (localStorageError) {
          console.error('❌ [useApi] Error accediendo localStorage:', localStorageError)
        }
      }
      
      if (!token && typeof window !== 'undefined') {
        console.error('❌ [useApi] CRÍTICO: No se encontró token de autenticación en localStorage')
        console.error('❌ [useApi] Endpoint solicitado:', endpoint)
        console.error('❌ [useApi] Esto causará un 401 Unauthorized')
        
        // Intentar cargar sesión desde authService como fallback
        try {
          console.log('🔄 [useApi] Intentando recuperar token desde authService...')
          const { customAuth } = await import('@/lib/auth-service')
          const { data } = await customAuth.getSession()
          console.log('🔍 [useApi] Respuesta de getSession:', {
            hasData: !!data,
            hasSession: !!data?.session,
            hasToken: !!data?.session?.access_token
          })
          
          if (data?.session?.access_token) {
            console.log('✅ [useApi] Token recuperado desde authService')
            token = data.session.access_token
            // Guardar inmediatamente para próximas requests
            localStorage.setItem('access_token', token)
            console.log('✅ [useApi] Token guardado en localStorage')
          } else {
            console.warn('⚠️ [useApi] authService tampoco tiene token - usuario no autenticado')
            // Redirigir al login si estamos en el cliente y no estamos ya en login
            if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
              console.log('🔄 [useApi] Redirigiendo al login...')
              window.location.href = '/login'
              // Retornar null para evitar continuar con la request
              return null
            }
          }
        } catch (authError) {
          console.error('❌ [useApi] Error recuperando token desde authService:', authError)
          // Redirigir al login en caso de error también
          if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
            console.log('🔄 [useApi] Error al recuperar token, redirigiendo al login...')
            window.location.href = '/login'
            return null
          }
        }
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
        ...restOptions,
        headers,
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
  }, [toast, showErrorToast, showSuccessToast])

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
