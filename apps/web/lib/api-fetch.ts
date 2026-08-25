import { buildApiUrl, normalizeApiEndpoint, withTrailingSlash } from './api-url'
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
  // El tenant autoritativo viene del JWT/cookie. No copiar el tenant de un
  // snapshot local potencialmente obsoleto al header de autorización.

  // El API redirige con 308 toda ruta sin barra final. `useApi` ya la anade;
  // `fetchApi` no lo hacia, y como `TenantContext` y el banner de demo pasan por
  // aqui, cada carga de pagina pagaba dos redirecciones de ida y vuelta antes de
  // recibir un solo dato.
  return fetchWithOfflineSupport(buildApiUrl(withTrailingSlash(normalizedEndpoint)), {
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
