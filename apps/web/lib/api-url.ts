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

export function buildApiUrl(endpoint: string) {
  const normalized = normalizeApiEndpoint(endpoint)
  if (/^https?:\/\//i.test(normalized)) {
    return normalized
  }

  return `${getApiBaseUrl()}${normalized}`
}
