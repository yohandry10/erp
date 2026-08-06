'use client'

import { useState, useCallback } from 'react'
import { useToast } from '@/components/ui/use-toast'
import { useAuth } from '@/contexts/AuthContext'
import { customAuth } from '@/lib/auth-service'
import { apiSucceeded, getApiErrorMessage, unwrapApiArray, unwrapApiData, unwrapApiObject } from '@/lib/api-contract'
import { buildApiUrl, normalizeApiEndpoint, withTrailingSlash } from '@/lib/api-url'
import { fetchWithOfflineSupport, isOfflineCachedResponse, isOfflineQueuedResponse } from '@/lib/offline-store'
import { INITIAL_ACTIVE_COUNTRY_ID, isInitialActiveCountryId } from '@/lib/initial-country'

interface ApiResponse<T> {
  data?: T
  message?: string
  success: boolean
}

interface UseApiOptions {
  showErrorToast?: boolean
  showSuccessToast?: boolean
  throwOnError?: boolean
  retries?: number
  timeoutMs?: number
}

// Params de query: aceptamos objetos tipados (sin index signature) para evitar casts en callers.
// Se normaliza a string en runtime.
type QueryParams = any

interface ApiRequestOptions extends RequestInit {
  params?: QueryParams
}

const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

// Evita que decenas de requests paralelas repitan la redirección cuando la
// demo expira: solo la primera navega a /demo/convert.
let demoExpiredRedirectInFlight = false

async function handleDemoExpired() {
  if (demoExpiredRedirectInFlight) return
  demoExpiredRedirectInFlight = true
  if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/demo')) {
    try {
      await customAuth.signOut()
    } catch {
      /* la sesión demo ya no es utilizable; continuamos igual */
    }
    window.location.href = '/demo?expired=1'
  }
}

function resolveMethod(options: ApiRequestOptions): string {
  return String(options.method || 'GET').toUpperCase()
}

function resolveAttempts(method: string, retries: number): number {
  // No reintentamos escrituras por defecto: si el servidor proceso la request
  // pero el cliente aborto por timeout, reintentar puede duplicar CPE/ventas/pagos.
  return IDEMPOTENT_METHODS.has(method) ? Math.max(1, retries) : 1
}

export function useApi<T = any>(options: UseApiOptions = {}) {
  const [state, setState] = useState<ApiResponse<T>>({
    success: false,
    data: undefined,
  })
  const [loading, setLoading] = useState(false)

  const { toast } = useToast()
  const { loading: authLoading, session } = useAuth()
  const {
    showErrorToast = true,
    showSuccessToast = false,
    throwOnError = false,
    retries = options.retries ?? 2,   // default 2 reintentos
    timeoutMs = options.timeoutMs ?? 12000, // default 12s
  } = options

  const apiCall = useCallback(async (
    endpoint: string,
    options: ApiRequestOptions = {}
  ): Promise<any> => {
    setState({ success: false, data: undefined })
    setLoading(true)

    try {
      let resolvedSession = session

      // Señal de "sesión lista" = presencia de user (hidratado del snapshot), NO del
      // access_token. Con auth por cookie de subdominio el token puede no estar en
      // memoria/snapshot y aún así la sesión es válida vía cookie HttpOnly. Usar user
      // preserva el fast-path en cold-load tanto en modo token como en modo cookie.
      // Si ya hay user hidratado procedemos sin esperar a AuthContext (la cookie/token
      // autentican igual); solo resolvemos vía getSession() cuando falta. Esto elimina
      // los sleeps fijos y el fetch redundante a /auth/profile en el arranque.
      // Un snapshot persistido puede pertenecer a la cuenta anterior. Mientras
      // AuthContext valida la cookie, obtener el perfil canónico antes de enviar
      // cualquier request evita mezclar el tenant viejo con el JWT actual.
      if (authLoading || !resolvedSession?.user) {
        if (authLoading) {
          console.log('⏳ [useApi] Esperando a que AuthContext termine de cargar...')
        }
        const { data } = await customAuth.getSession()
        resolvedSession = data.session || resolvedSession
      }

      // Agregar prefijo /api si el endpoint no lo tiene
      const normalizedEndpoint = normalizeApiEndpoint(endpoint)

      const buildUrl = (base: string, params?: QueryParams) => {
        const normalizedBase = withTrailingSlash(base)
        if (!params || Object.keys(params).length === 0) return normalizedBase
        const qs = new URLSearchParams()
        for (const [k, v] of Object.entries(params)) {
          if (v === undefined || v === null) continue
          qs.set(k, String(v))
        }
        const suffix = qs.toString()
        return suffix ? `${normalizedBase}?${suffix}` : normalizedBase
      }

      const baseUrl = buildApiUrl(normalizedEndpoint)
      const url = buildUrl(baseUrl, options.params)

      // Headers base - convertir options.headers a objeto plano si es necesario
      const optionsHeaders: Record<string, string> = {}
      const rawHeaders = options.headers
      const isFormDataBody = typeof FormData !== 'undefined' && options.body instanceof FormData

      if (rawHeaders instanceof Headers) {
        for (const [k, v] of rawHeaders.entries()) optionsHeaders[k] = v
      } else if (Array.isArray(rawHeaders)) {
        for (const [k, v] of rawHeaders) optionsHeaders[k] = v
      } else if (rawHeaders) {
        Object.assign(optionsHeaders, rawHeaders as Record<string, string>)
      }

      const headers: Record<string, string> = {
        ...(resolvedSession?.access_token ? { Authorization: `Bearer ${resolvedSession.access_token}` } : {}),
        ...optionsHeaders,
      }
      // No inferir X-Tenant-Id desde la caché del navegador. El backend deriva el
      // tenant del JWT/cookie. Un override sólo se envía si el caller lo especifica
      // explícitamente (caso superadmin), y el backend vuelve a validarlo.
      if (!isFormDataBody && !headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/json'
      }

      // Inyección automática del país inicial activo (Peru/SUNAT).
      try {
        if (typeof window !== 'undefined') {
          const storedCountryId = window.localStorage.getItem('selectedCountry')
          const countryId = isInitialActiveCountryId(storedCountryId)
            ? storedCountryId || INITIAL_ACTIVE_COUNTRY_ID
            : INITIAL_ACTIVE_COUNTRY_ID

          // Solo lo añadimos si el caller no lo envió ya
          if (!headers['x-country-id']) {
            headers['x-country-id'] = countryId
          }
        }
      } catch {
        /* no-op si localStorage no está disponible */
      }

      // Excluir headers/params de options para evitar conflictos
      const { headers: _, params: __, ...restOptions } = options

      const method = resolveMethod(options)
      const maxAttempts = resolveAttempts(method, retries)
      let attempt = 0
      let lastError: any = null
      while (attempt < maxAttempts) {
        attempt++
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), timeoutMs)

        try {
          const response = await fetchWithOfflineSupport(url, {
            cache: 'no-store', // evita servir 304/ETag y trae estado fresco
            ...restOptions,
            headers: {
              'Cache-Control': 'no-cache',
              ...headers,
            },
            credentials: 'include',
            mode: 'cors',
            signal: controller.signal,
          }, {
            endpoint: normalizedEndpoint,
            tenantId: resolvedSession?.user?.tenant_id,
            userId: resolvedSession?.user?.id,
          })
          clearTimeout(timer)

          // Handle 401 Unauthorized. Some module endpoints can return 401 for
          // permission gaps; only close the whole session if auth/profile also fails.
          if (response.status === 401) {
            const { data } = await customAuth.getSession()
            if (data.session) {
              throw new Error('No autorizado para consultar este recurso')
            }

            if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
              await customAuth.signOut()
              window.location.href = '/login'
            }
            throw new Error('Unauthorized - Session expired')
          }

          // Handle 403 Forbidden - show permission error
          if (response.status === 403) {
            const errorData = await response.json().catch(() => ({}))
            // Demo vencida: cortar aquí y llevar al usuario al flujo de
            // renovación/conversión en vez de dejar el dashboard en bucle de 403s.
            if (errorData.error === 'DEMO_EXPIRED') {
              await handleDemoExpired()
              throw new Error('Tu demo ha expirado. Crea una nueva demo o convierte tu cuenta.')
            }
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

          // Contrato de lectura:
          // - endpoints nuevos: { success, data, message }
          // - endpoints legacy: array/objeto crudo
          // `success: "false"` nunca se trata como truthy.
          const success = apiSucceeded(result)

          if (!success) {
            throw new Error(getApiErrorMessage(result, 'API call failed'))
          }

          const responseData = unwrapApiData<T>(result)
          setState({ success: true, data: responseData })

          if (showSuccessToast) {
            toast({
              title: 'Éxito',
              description: isOfflineQueuedResponse(response)
                ? 'Sin conexión: operación guardada para sincronizar.'
                : isOfflineCachedResponse(response)
                  ? 'Mostrando datos locales cacheados.'
                  : result?.message || 'Operación completada exitosamente',
            })
          }

          return result
        } catch (err) {
          clearTimeout(timer)
          lastError = err
          if (attempt >= maxAttempts) {
            throw err
          }
          // backoff simple
          await new Promise(res => setTimeout(res, 300 * attempt))
        }
      }

      if (lastError) throw lastError
      return null
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
    } finally {
      setLoading(false)
    }
  }, [toast, authLoading, session?.access_token, session?.user?.tenant_id, showErrorToast, showSuccessToast, retries, timeoutMs, throwOnError])

  // Métodos helper
  const get = useCallback((endpoint: string, reqOptions?: ApiRequestOptions) => {
    return apiCall(endpoint, { ...(reqOptions || {}), method: 'GET' })
  }, [apiCall])

  const post = useCallback((endpoint: string, data?: any, reqOptions?: ApiRequestOptions) => {
    return apiCall(endpoint, {
      ...(reqOptions || {}),
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    })
  }, [apiCall])

  const put = useCallback((endpoint: string, data?: any, reqOptions?: ApiRequestOptions) => {
    return apiCall(endpoint, {
      ...(reqOptions || {}),
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    })
  }, [apiCall])

  const del = useCallback((endpoint: string, reqOptions?: ApiRequestOptions) => {
    return apiCall(endpoint, { ...(reqOptions || {}), method: 'DELETE' })
  }, [apiCall])

  return {
    ...state,
    loading,
    get,
    post,
    put,
    del,
    delete: del,
    apiCall,
    request: apiCall,
    unwrap: unwrapApiData,
    unwrapArray: unwrapApiArray,
    unwrapObject: unwrapApiObject,
  }
}

// Hooks específicos
export function useApiCall<T = any>(options: UseApiOptions = {}) {
  return useApi<T>(options)
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
