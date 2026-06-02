import { invoke } from '@tauri-apps/api/core'
import { buildApiUrl } from './api-url'

export type OfflineRequestStatus = 'pending' | 'failed' | 'synced'

export interface HeaderPair {
  name: string
  value: string
}

export interface OfflineRequestInput {
  endpoint: string
  method: string
  url: string
  headers: HeaderPair[]
  body?: string | null
  tenant_id?: string | null
  user_id?: string | null
}

export interface OfflineQueueItem extends OfflineRequestInput {
  id: string
  status: OfflineRequestStatus
  attempts: number
  created_at: number
  updated_at: number
  last_error?: string | null
  response_status?: number | null
  response_body?: string | null
}

export interface OfflineStatus {
  offline_mode: boolean
  total: number
  pending: number
  failed: number
  synced: number
}

export interface LocalFirstResponse {
  status: number
  body: string
  headers: HeaderPair[]
}

interface ApiCacheEntry {
  url: string
  endpoint: string
  status: number
  statusText: string
  headers: HeaderPair[]
  body: string
  cached_at: number
}

const OUTBOX_KEY = 'erp.desktop.offline.outbox'
const CACHE_KEY = 'erp.desktop.offline.cache'
const CACHE_LIMIT = 120
const CACHE_ENTRY_BODY_LIMIT = 512 * 1024
const OFFLINE_MODE_CACHE_TTL = 5000
const LOCAL_FIRST_GET_ENDPOINTS = new Set([
  '/api/pos/productos',
  '/api/pos/clientes',
  '/api/pos/metodos-pago',
  '/api/pos/empresa-config',
  '/api/pos/ventas-recientes',
  '/api/pos/sesion-caja',
  '/api/cajas',
  '/api/inventario/productos',
  '/api/inventario/almacenes',
  '/api/inventario/movimientos',
  '/api/inventario/stats',
  '/api/ventas/clientes',
  '/api/ventas/cotizaciones',
  '/api/ventas/pedidos',
])
const LOCAL_FIRST_WRITE_ENDPOINTS = [
  /^\/api\/pos\/venta$/,
  /^\/api\/cajas\/[^/]+\/apertura$/,
  /^\/api\/cajas\/[^/]+\/cierre$/,
  /^\/api\/inventario\/productos$/,
  /^\/api\/inventario\/productos\/[^/]+$/,
  /^\/api\/ventas\/clientes$/,
  /^\/api\/ventas\/clientes\/[^/]+$/,
  /^\/api\/ventas\/cotizaciones$/,
  /^\/api\/ventas\/cotizaciones\/[^/]+$/,
  /^\/api\/cotizaciones\/crear$/,
  /^\/api\/ventas\/pedidos$/,
  /^\/api\/ventas\/pedidos\/[^/]+$/,
]

let offlineModeCache: { value: boolean; expiresAt: number } | null = null

// Invalida el cache de offline_mode para que el siguiente fetch lo recompute.
// Se llama en cambios de conectividad y cuando el usuario togglea offline_mode,
// para que el TTL ampliado (5s) no retrase la reaccion a esos eventos.
export function invalidateOfflineModeCache() {
  offlineModeCache = null
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('online', invalidateOfflineModeCache)
  window.addEventListener('offline', invalidateOfflineModeCache)
}

export function isDesktopRuntime() {
  return typeof window !== 'undefined' && Boolean(window.__TAURI__)
}

function now() {
  return Date.now()
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson<T>(key: string, value: T) {
  if (typeof window === 'undefined') return true
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch (error) {
    console.warn(`[offline-store] No se pudo escribir ${key}:`, error)
    return false
  }
}

function localId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `offline-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function headersToPairs(headers: HeadersInit | undefined): HeaderPair[] {
  const normalized = new Headers(headers)
  const pairs: HeaderPair[] = []
  normalized.forEach((value, name) => {
    if (name.toLowerCase() === 'cookie') return
    pairs.push({ name, value })
  })
  return pairs
}

function pairsToHeaders(pairs: HeaderPair[]) {
  const headers = new Headers()
  for (const pair of pairs) {
    if (!pair.name || pair.name.toLowerCase() === 'cookie') continue
    headers.set(pair.name, pair.value)
  }
  return headers
}

function localFirstEndpoint(endpoint: string) {
  const [path] = endpoint.split('?')
  return path.replace(/\/+$/, '')
}

function isLocalFirstGetEndpoint(endpoint: string) {
  const normalized = localFirstEndpoint(endpoint)
  return LOCAL_FIRST_GET_ENDPOINTS.has(normalized)
    || /^\/api\/inventario\/productos\/[^/]+$/.test(normalized)
    || /^\/api\/ventas\/clientes\/[^/]+$/.test(normalized)
    || /^\/api\/ventas\/cotizaciones\/[^/]+$/.test(normalized)
    || /^\/api\/ventas\/pedidos\/[^/]+$/.test(normalized)
}

function isLocalFirstWriteEndpoint(endpoint: string, method: string) {
  const normalized = localFirstEndpoint(endpoint)
  if (!['POST', 'PUT', 'DELETE'].includes(method)) return false
  return LOCAL_FIRST_WRITE_ENDPOINTS.some((pattern) => pattern.test(normalized))
}

function responseFromLocalFirst(local: LocalFirstResponse) {
  const headers = pairsToHeaders(local.headers)
  headers.set('x-erp-local-first', 'true')
  headers.set('x-erp-offline-cache', 'true')
  return new Response(local.body, {
    status: local.status,
    statusText: local.status >= 200 && local.status < 300 ? 'OK' : 'Local First',
    headers,
  })
}

async function readLocalFirstResponse(endpoint: string, url: string) {
  if (!isDesktopRuntime() || !isLocalFirstGetEndpoint(endpoint)) return null
  const normalizedEndpoint = localFirstEndpoint(endpoint)
  try {
    const local = await invoke<LocalFirstResponse | null>('get_local_first_response', { endpoint: normalizedEndpoint, url })
    return local ? responseFromLocalFirst(local) : null
  } catch (error) {
    console.warn('[offline-store] No se pudo leer respuesta local-first:', error)
    return null
  }
}

async function hydrateLocalFirstResponse(url: string, endpoint: string, response: Response) {
  if (!isDesktopRuntime() || !isLocalFirstGetEndpoint(endpoint)) return
  if (!response.ok || response.status === 204) return

  const contentType = response.headers.get('Content-Type') || ''
  if (!/application\/json|text\//i.test(contentType)) return

  const body = await response.text().catch(() => '')
  if (!body) return

  try {
    await invoke('hydrate_local_first_response', {
      endpoint: localFirstEndpoint(endpoint),
      url,
      status: response.status,
      headers: headersToPairs(response.headers),
      body,
    })
  } catch (error) {
    console.warn('[offline-store] No se pudo hidratar SQLite local-first:', error)
  }
}

async function processLocalFirstWrite(
  url: string,
  init: RequestInit,
  meta: { endpoint: string; userId?: string | null; tenantId?: string | null },
  method: string,
) {
  if (!isDesktopRuntime() || !isLocalFirstWriteEndpoint(meta.endpoint, method)) return null
  const body = bodyToString(init.body)
  if (body === null && init.body !== null && init.body !== undefined) return null

  const local = await invoke<LocalFirstResponse>('process_local_first_write', {
    request: {
      endpoint: localFirstEndpoint(meta.endpoint),
      method,
      url,
      headers: headersToPairs(init.headers),
      body,
      tenant_id: meta.tenantId ?? null,
      user_id: meta.userId ?? null,
    },
  })
  return responseFromLocalFirst(local)
}

export async function enqueueOfflineRequest(input: OfflineRequestInput): Promise<OfflineQueueItem> {
  if (isDesktopRuntime()) {
    return invoke<OfflineQueueItem>('enqueue_offline_request', { request: input })
  }

  const queue = readJson<OfflineQueueItem[]>(OUTBOX_KEY, [])
  const timestamp = now()
  const item: OfflineQueueItem = {
    ...input,
    id: localId(),
    method: input.method.toUpperCase(),
    status: 'pending',
    attempts: 0,
    created_at: timestamp,
    updated_at: timestamp,
    last_error: null,
    response_status: null,
    response_body: null,
  }
  queue.push(item)
  if (!writeJson(OUTBOX_KEY, queue)) {
    throw new Error('No se pudo persistir la cola offline local')
  }
  return item
}

export async function listOfflineRequests(): Promise<OfflineQueueItem[]> {
  if (isDesktopRuntime()) {
    return invoke<OfflineQueueItem[]>('list_offline_requests')
  }
  return readJson<OfflineQueueItem[]>(OUTBOX_KEY, [])
}

export async function markOfflineRequestSynced(
  id: string,
  responseStatus: number,
  responseBody?: string | null,
) {
  if (isDesktopRuntime()) {
    await invoke('mark_offline_request_synced', {
      id,
      responseStatus,
      responseBody: responseBody ?? null,
    })
    return
  }

  const queue = readJson<OfflineQueueItem[]>(OUTBOX_KEY, [])
  if (!writeJson(OUTBOX_KEY, queue.map((item) => (
    item.id === id
      ? {
          ...item,
          status: 'synced' as const,
          response_status: responseStatus,
          response_body: responseBody ?? null,
          last_error: null,
          updated_at: now(),
        }
      : item
  )))) {
    throw new Error('No se pudo persistir el cambio de estado offline')
  }
}

export async function markOfflineRequestFailed(id: string, error: string) {
  if (isDesktopRuntime()) {
    await invoke('mark_offline_request_failed', { id, error })
    return
  }

  const queue = readJson<OfflineQueueItem[]>(OUTBOX_KEY, [])
  if (!writeJson(OUTBOX_KEY, queue.map((item) => (
    item.id === id
      ? {
          ...item,
          status: 'failed' as const,
          attempts: item.attempts + 1,
          last_error: error,
          updated_at: now(),
        }
      : item
  )))) {
    throw new Error('No se pudo persistir el fallo offline')
  }
}

export async function deleteOfflineRequest(id: string) {
  if (isDesktopRuntime()) {
    await invoke('delete_offline_request', { id })
    return
  }

  if (!writeJson(OUTBOX_KEY, readJson<OfflineQueueItem[]>(OUTBOX_KEY, []).filter((item) => item.id !== id))) {
    throw new Error('No se pudo eliminar la operacion offline')
  }
}

export async function getOfflineStatus(): Promise<OfflineStatus> {
  if (isDesktopRuntime()) {
    return invoke<OfflineStatus>('get_offline_status')
  }

  const queue = readJson<OfflineQueueItem[]>(OUTBOX_KEY, [])
  return {
    offline_mode: typeof navigator !== 'undefined' ? !navigator.onLine : false,
    total: queue.length,
    pending: queue.filter((item) => item.status === 'pending').length,
    failed: queue.filter((item) => item.status === 'failed').length,
    synced: queue.filter((item) => item.status === 'synced').length,
  }
}

export async function cacheApiResponse(url: string, endpoint: string, response: Response) {
  if (response.status === 204) return
  const contentType = response.headers.get('Content-Type') || ''
  if (!/application\/json|text\//i.test(contentType)) return

  const body = await response.text().catch(() => '')
  if (!body) return
  if (body.length > CACHE_ENTRY_BODY_LIMIT) return

  const cache = readJson<ApiCacheEntry[]>(CACHE_KEY, [])
  const entry: ApiCacheEntry = {
    url,
    endpoint,
    status: response.status,
    statusText: response.statusText,
    headers: headersToPairs(response.headers),
    body,
    cached_at: now(),
  }

  const next = [entry, ...cache.filter((item) => item.url !== url)].slice(0, CACHE_LIMIT)
  writeJson(CACHE_KEY, next)
}

export async function readCachedApiResponse(url: string): Promise<Response | null> {
  const entry = readJson<ApiCacheEntry[]>(CACHE_KEY, []).find((item) => item.url === url)
  if (!entry) return null

  const headers = pairsToHeaders(entry.headers)
  headers.set('x-erp-offline-cache', 'true')
  headers.set('x-erp-offline-cached-at', String(entry.cached_at))

  return new Response(entry.body, {
    status: entry.status,
    statusText: entry.statusText || 'OK',
    headers,
  })
}

export function isOfflineQueuedResponse(response: Response) {
  return response.headers.get('x-erp-offline-queued') === 'true'
}

export function isOfflineCachedResponse(response: Response) {
  return response.headers.get('x-erp-offline-cache') === 'true'
}

function bodyToString(body: BodyInit | null | undefined): string | null {
  if (body === undefined || body === null) return null
  if (typeof body === 'string') return body
  if (body instanceof URLSearchParams) return body.toString()
  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    return null
  }
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    return null
  }
  if (body instanceof ArrayBuffer) {
    return null
  }
  return null
}

function canQueue(method: string, body: BodyInit | null | undefined) {
  if (method === 'GET' || method === 'HEAD') return false
  if (typeof FormData !== 'undefined' && body instanceof FormData) return false
  if (typeof Blob !== 'undefined' && body instanceof Blob) return false
  return true
}

async function isOfflineModeEnabled() {
  if (typeof window === 'undefined') return false

  const timestamp = now()
  if (offlineModeCache && offlineModeCache.expiresAt > timestamp) {
    return offlineModeCache.value
  }

  try {
    const status = await getOfflineStatus()
    const value = status.offline_mode || (typeof navigator !== 'undefined' && !navigator.onLine)
    offlineModeCache = { value, expiresAt: timestamp + OFFLINE_MODE_CACHE_TTL }
    return value
  } catch {
    const value = typeof navigator !== 'undefined' && !navigator.onLine
    offlineModeCache = { value, expiresAt: timestamp + OFFLINE_MODE_CACHE_TTL }
    return value
  }
}

function queuedResponse(item: OfflineQueueItem) {
  return new Response(JSON.stringify({
    success: true,
    offline: true,
    queued: true,
    message: 'Sin conexion: operacion guardada en cola local para sincronizar.',
    data: {
      offline_queue_id: item.id,
      status: item.status,
    },
  }), {
    status: 202,
    headers: {
      'Content-Type': 'application/json',
      'x-erp-offline-queued': 'true',
      'x-erp-offline-id': item.id,
    },
  })
}

export async function fetchWithOfflineSupport(
  url: string,
  init: RequestInit,
  meta: { endpoint: string; userId?: string | null; tenantId?: string | null },
) {
  const method = (init.method || 'GET').toUpperCase()
  const forceOffline = await isOfflineModeEnabled()

  if (forceOffline) {
    if (method === 'GET') {
      const localFirst = await readLocalFirstResponse(meta.endpoint, url)
      if (localFirst) return localFirst

      const cached = await readCachedApiResponse(url)
      if (cached) return cached
    }

    const localFirstWrite = await processLocalFirstWrite(url, init, meta, method)
    if (localFirstWrite) return localFirstWrite

    if (canQueue(method, init.body)) {
      const item = await enqueueOfflineRequest({
        endpoint: meta.endpoint,
        method,
        url,
        headers: headersToPairs(init.headers),
        body: bodyToString(init.body),
        tenant_id: meta.tenantId ?? null,
        user_id: meta.userId ?? null,
      })
      return queuedResponse(item)
    }

    throw new Error('Modo offline activo y no existe cache local para esta solicitud.')
  }

  try {
    const response = await fetch(url, init)
    if (method === 'GET' && response.ok) {
      await hydrateLocalFirstResponse(url, meta.endpoint, response.clone())
      await cacheApiResponse(url, meta.endpoint, response.clone())
    }
    return response
  } catch (error) {
    if (method === 'GET') {
      const localFirst = await readLocalFirstResponse(meta.endpoint, url)
      if (localFirst) return localFirst

      const cached = await readCachedApiResponse(url)
      if (cached) return cached
    }

    const localFirstWrite = await processLocalFirstWrite(url, init, meta, method)
    if (localFirstWrite) return localFirstWrite

    if (canQueue(method, init.body)) {
      const item = await enqueueOfflineRequest({
        endpoint: meta.endpoint,
        method,
        url,
        headers: headersToPairs(init.headers),
        body: bodyToString(init.body),
        tenant_id: meta.tenantId ?? null,
        user_id: meta.userId ?? null,
      })
      return queuedResponse(item)
    }

    throw error
  }
}

export async function syncOfflineQueue() {
  const queue = await listOfflineRequests()
  const candidates = queue.filter((item) => item.status === 'pending' || item.status === 'failed')
  const results: Array<{ id: string; ok: boolean; status?: number; error?: string }> = []

  for (const item of candidates) {
    try {
      const targetUrl = item.endpoint ? buildApiUrl(item.endpoint) : item.url
      const response = await fetch(targetUrl, {
        method: item.method,
        headers: pairsToHeaders(item.headers),
        body: item.body ?? undefined,
        credentials: 'include',
        mode: 'cors',
        cache: 'no-store',
      })
      const responseBody = await response.text().catch(() => '')

      if (response.ok) {
        await markOfflineRequestSynced(item.id, response.status, responseBody)
        results.push({ id: item.id, ok: true, status: response.status })
      } else {
        const error = responseBody || `HTTP ${response.status}`
        await markOfflineRequestFailed(item.id, error)
        results.push({ id: item.id, ok: false, status: response.status, error })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error de sincronizacion offline'
      await markOfflineRequestFailed(item.id, message)
      results.push({ id: item.id, ok: false, error: message })
    }
  }

  return results
}

declare global {
  interface Window {
    __TAURI__?: any
  }
}
