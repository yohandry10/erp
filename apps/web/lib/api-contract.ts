export type ApiEnvelope<T = unknown> = {
  success?: boolean | 'true' | 'false'
  data?: T
  message?: string
  error?: string
}

export function isApiEnvelope(value: unknown): value is ApiEnvelope {
  return Boolean(
    value &&
      typeof value === 'object' &&
      ('success' in value || 'data' in value || 'message' in value || 'error' in value),
  )
}

export function apiSucceeded(value: unknown): boolean {
  if (!isApiEnvelope(value) || value.success === undefined) return true
  return value.success === true || value.success === 'true'
}

export function unwrapApiData<T = unknown>(value: unknown, fallback?: T): T {
  if (isApiEnvelope(value) && 'data' in value) {
    return (value.data === undefined ? fallback : value.data) as T
  }

  return (value === undefined || value === null ? fallback : value) as T
}

export function unwrapApiArray<T = unknown>(value: unknown): T[] {
  const data = unwrapApiData<unknown>(value, [])
  if (
    data &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    Array.isArray((data as { data?: unknown }).data)
  ) {
    return (data as { data: T[] }).data
  }
  return Array.isArray(data) ? (data as T[]) : []
}

export function unwrapApiObject<T extends object>(value: unknown, fallback: T): T {
  const data = unwrapApiData<unknown>(value, fallback)
  return data && typeof data === 'object' && !Array.isArray(data) ? (data as T) : fallback
}

export function parseApiBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true') return true
    if (normalized === 'false') return false
  }
  if (typeof value === 'number') return value !== 0
  return false
}

export function parseApiDateOnly(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }

  if (typeof value !== 'string' || value.trim() === '') return null

  const trimmed = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10)
}

export function getApiErrorMessage(value: unknown, fallback = 'Error de API'): string {
  if (isApiEnvelope(value)) {
    const message = value.message || value.error
    if (typeof message === 'string' && message.trim()) return message
  }
  return fallback
}
