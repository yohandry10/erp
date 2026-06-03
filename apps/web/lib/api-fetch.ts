import { buildApiUrl, normalizeApiEndpoint } from './api-url'
import { customAuth } from './auth-service'
import { fetchWithOfflineSupport } from './offline-store'

export async function fetchApi(endpoint: string, options: RequestInit = {}) {
  const normalizedEndpoint = normalizeApiEndpoint(endpoint)
  const headers = new Headers(options.headers)
  const hasBody = options.body !== undefined && options.body !== null
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData
  // Lectura sincrónica del token/sesión cacheada: NO dispara /auth/profile por request.
  // La validación/refresh de sesión vive en AuthContext.loadSession y use-api.
  const { session, accessToken } = customAuth.getCachedSession()
  const token = accessToken ?? session?.access_token

  if (hasBody && !isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  if (!headers.has('Authorization')) {
    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
    }
  }

  return fetchWithOfflineSupport(buildApiUrl(normalizedEndpoint), {
    credentials: 'include',
    mode: 'cors',
    cache: 'no-store',
    ...options,
    headers,
  }, {
    endpoint: normalizedEndpoint,
    tenantId: session?.user?.tenant_id,
    userId: session?.user?.id,
  })
}
