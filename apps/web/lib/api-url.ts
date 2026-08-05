const DEFAULT_API_BASE_URL = 'http://localhost:3002'

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '')
}

export function getApiBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim()
  return trimTrailingSlash(configured || DEFAULT_API_BASE_URL)
}

export function normalizeApiEndpoint(endpoint: string) {
  if (/^https?:\/\//i.test(endpoint)) {
    return endpoint
  }

  if (endpoint.startsWith('/backend/api/')) {
    return endpoint.replace(/^\/backend/, '')
  }

  if (endpoint.startsWith('/backend/')) {
    return endpoint.replace(/^\/backend/, '')
  }

  return endpoint.startsWith('/api') ? endpoint : `/api${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`
}

export function withTrailingSlash(url: string) {
  const [path, query] = url.split('?')
  const normalizedPath = path.endsWith('/') ? path : `${path}/`
  return query === undefined ? normalizedPath : `${normalizedPath}?${query}`
}

function shouldUseSameOriginProxy() {
  if (typeof window === 'undefined') return false
  if (process.env.NEXT_PUBLIC_API_PROXY === 'false') return false

  // Tauri no tiene un servidor Next capaz de resolver /backend. En navegador,
  // en cambio, el proxy mismo-origen es obligatorio para que la cookie HttpOnly
  // pertenezca al dominio de la aplicación y el middleware pueda verla.
  return !('__TAURI_INTERNALS__' in window)
}

export function buildApiUrl(endpoint: string) {
  const normalized = normalizeApiEndpoint(endpoint)
  if (/^https?:\/\//i.test(normalized)) {
    return normalized
  }

  if (shouldUseSameOriginProxy()) {
    return `/backend${normalized}`
  }

  return `${getApiBaseUrl()}${normalized}`
}
