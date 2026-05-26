import { buildApiUrl } from './api-url'
import { customAuth } from './auth-service'
import { fetchWithOfflineSupport } from './offline-store'

export async function fetchApi(endpoint: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers)
  const hasBody = options.body !== undefined && options.body !== null
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData
  const { data } = await customAuth.getSession()

  if (hasBody && !isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  if (!headers.has('Authorization')) {
    if (data.session?.access_token) {
      headers.set('Authorization', `Bearer ${data.session.access_token}`)
    }
  }

  return fetchWithOfflineSupport(buildApiUrl(endpoint), {
    credentials: 'include',
    mode: 'cors',
    cache: 'no-store',
    ...options,
    headers,
  }, {
    endpoint,
    tenantId: data.session?.user?.tenant_id,
    userId: data.session?.user?.id,
  })
}
