'use client'

import { useState, useCallback } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useToast } from '@/components/ui/use-toast'

interface ApiResponse<T> {
  data: T
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
      // Get current session for auth token
      const { data: { session } } = await supabase.auth.getSession()
      
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
      const url = `${apiUrl}${endpoint}`
      
      console.log('🌐 API URL:', apiUrl)
      console.log('🔗 Full URL:', url)
      console.log('📦 Request Options:', options)

      // Default headers
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...options.headers,
      }

      // Add authorization header if session exists
      if (session?.access_token) {
        (headers as Record<string, string>).Authorization = `Bearer ${session.access_token}`
        console.log('🔐 Auth token added')
      } else {
        console.log('⚠️ No auth token available')
      }

      console.log('📡 Making request...')
      const response = await fetch(url, {
        ...options,
        headers,
        mode: 'cors', // Explicitly set CORS mode
      })

      console.log('📨 Response status:', response.status)
      console.log('📨 Response ok:', response.ok)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('❌ HTTP Error Response:', errorText)
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`)
      }

      const result: any = await response.json()
      console.log('✅ Response data:', result)
      
      // Verificar success en el nivel correcto
      const success = result.success === true || result.success === 'true'
      
      if (!success) {
        console.error('❌ API response indicates failure:', result)
        throw new Error(result.message || result.error || 'API call failed')
      }

      // Para el estado interno, guardamos los datos
      const responseData = result.data !== undefined ? result.data : result
      setState({ success: true, data: responseData })
      
      if (showSuccessToast) {
        toast({
          title: "Éxito",
          description: result.message || "Operación completada exitosamente",
        })
      }

      // IMPORTANTE: Devolver el objeto completo con success para que el frontend pueda verificarlo
      return result
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      console.error('❌ API call failed:', err)
      console.error('❌ Error message:', errorMessage)
      console.error('❌ Full error object:', err)
      
      setState({ success: false, data: undefined })
      
      if (showErrorToast) {
        toast({
          variant: "destructive",
          title: "Error de API",
          description: errorMessage,
        })
      }

      return null
    }
  }, [supabase, toast, showErrorToast, showSuccessToast])

  // Helper methods for different HTTP methods
  const get = useCallback((endpoint: string) => {
    return apiCall(endpoint, { method: 'GET' })
  }, [apiCall])

  const post = useCallback((endpoint: string, data?: any) => {
    console.log('📤 POST request to:', endpoint, 'with data:', data)
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

// Specific hooks for common operations
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