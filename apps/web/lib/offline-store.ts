import { invoke } from '@tauri-apps/api/core'
import { buildApiUrl } from './api-url'

export type OfflineRequestStatus = 'pending' | 'failed' | 'synced'

export interface HeaderPair {
  name: string
  value: string
}

const SENSITIVE_PERSISTED_HEADER_NAMES = new Set([
  'authorization',
  'cookie',
  'proxy-authorization',
  'set-cookie',
  'x-api-key',
  'x-access-token',
  'x-auth-token',
  'x-refresh-token',
])

function isSensitivePersistedHeader(name: string) {
  return SENSITIVE_PERSISTED_HEADER_NAMES.has(name.trim().toLowerCase())
}

function sanitizePersistedHeaders(headers: HeaderPair[]) {
  return headers.filter((header) => header.name && !isSensitivePersistedHeader(header.name))
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

interface SerializedFormDataPart {
  kind: 'field' | 'file'
  name: string
  value?: string
  filename?: string
  content_type?: string
  body_base64?: string
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

export interface BinaryLocalResponse {
  status: number
  body_base64: string
  headers: HeaderPair[]
  cached_at: number
}

export interface LocalIdMapping {
  local_id: string
  remote_id: string
  entity_type: string
  endpoint: string
  synced_at: number
  response_json?: string | null
}

interface ApiCacheEntry {
  url: string
  endpoint: string
  tenant_id?: string | null
  status: number
  statusText: string
  headers: HeaderPair[]
  body: string
  cached_at: number
}

const OUTBOX_KEY = 'erp.desktop.offline.outbox'
const CACHE_KEY = 'erp.desktop.offline.cache'
const SENSITIVE_OFFLINE_ERROR = 'Esta configuracion sensible requiere conexion en vivo y nunca se guarda en la cola offline.'
const CACHE_LIMIT = 120
const CACHE_ENTRY_BODY_LIMIT = 512 * 1024
const BINARY_CACHE_BODY_LIMIT = 8 * 1024 * 1024
const OFFLINE_MODE_CACHE_TTL = 5000
export const DEFAULT_LOCAL_FIRST_SNAPSHOT_ENDPOINTS = [
  '/api/dashboard/metrics',
  '/api/dashboard/stats',
  '/api/dashboard/activities',
  '/api/dashboard/recent-activity',
  '/api/pos/productos',
  '/api/pos/clientes',
  '/api/pos/metodos-pago',
  '/api/pos/empresa-config',
  '/api/pos/configuration-status',
  '/api/pos/sesion-caja',
  '/api/pos/ventas-recientes',
  '/api/pos/detalles-venta',
  '/api/configuration/gre-thresholds',
  '/api/configuration/context/country',
  '/api/configuracion-fiscal',
  '/api/validations/certificate',
  '/api/inventario/productos',
  '/api/inventario/almacenes',
  '/api/inventario/recepciones',
  '/api/inventario/kardex',
  '/api/inventario/logistica/ordenes-pendientes',
  '/api/inventario/logistica/listo-despacho',
  '/api/ventas/clientes',
  '/api/ventas/cotizaciones',
  '/api/ventas/pedidos',
  '/api/ventas/pedidos/aprobaciones/pendientes',
  '/api/ventas/reportes/fill-rate',
  '/api/ventas/reportes/cotizaciones-pendientes',
  '/api/ventas/reportes/cxc-aging',
  '/api/ventas/reportes/pedidos-por-estado',
  '/api/ventas/reportes/lead-time',
  '/api/ventas/reportes/pipeline',
  '/api/ventas/reportes/productos-mas-vendidos',
  '/api/ventas/reportes/sunat-kpis',
  '/api/ventas/reportes/top-clientes',
  '/api/ventas/reportes/ventas-por-cliente',
  '/api/compras/proveedores',
  '/api/compras/productos',
  '/api/compras/next-number',
  '/api/compras/ordenes',
  '/api/compras/cotizaciones',
  '/api/compras/recepciones',
  '/api/compras/devoluciones',
  '/api/compras/stats',
  '/api/rrhh/empleados',
  '/api/rrhh/departamentos',
  '/api/rrhh/planillas',
  '/api/rrhh/pagos',
  '/api/rrhh/contratos',
  '/api/rrhh/candidatos',
  '/api/rrhh/asistencia',
  '/api/rrhh/asistencias',
  '/api/finanzas/cuentas-bancarias',
  '/api/finanzas/cxc',
  '/api/finanzas/cxp',
  '/api/finanzas/tesoreria',
  '/api/finanzas/tesoreria/pagos',
  '/api/finanzas/bancos',
  '/api/finanzas/bancos/cuentas',
  '/api/finanzas/conciliacion/pendientes',
  '/api/finanzas/tesoreria/programacion',
  '/api/finanzas/tesoreria/flujo-caja',
  '/api/finanzas/cxp/vencimientos',
  '/api/finanzas/cxp/proveedores-mayor-deuda',
  '/api/finanzas/bancos/saldos',
  '/api/finanzas/bancos/movimientos/periodo',
  '/api/finanzas/conciliacion',
  '/api/contabilidad/asientos',
  '/api/contabilidad/asientos-contables',
  '/api/contabilidad/centros-costo',
  '/api/contabilidad/presupuestos',
  '/api/contabilidad/periodos',
  '/api/contabilidad/plan-cuentas',
  '/api/cpe/comprobantes',
  '/api/cotizaciones/lista',
  '/api/cotizaciones/stats',
  '/api/gre/guias',
  '/api/gre/reporte',
  '/api/sire/files',
  '/api/documentos',
  '/api/documentos/descargas',
  '/api/paises',
  '/api/paises/usuario/configuracion',
  '/api/notifications',
  '/api/notifications/unread',
  '/api/usuarios-sistema/me/permissions',
  '/api/tenants',
  '/api/cajas/sesiones',
  '/api/cajas/cortes',
  '/api/cajas/movimientos',
  '/api/cajas/retiros',
  '/api/cajas/saldo-esperado',
  '/api/cajas/cambios-turno',
  '/api/cajas',
]
const LOCAL_FIRST_EXCLUDED_PREFIXES = [
  '/api/auth',
  '/api/demo/convert-to-real',
  '/api/validations',
]
const LOCAL_FIRST_EXCLUDED_PATTERNS = [
  /\/descargar-/,
  /\/download\/?$/,
  /\/exportar\/?$/,
  /\/csv\/?$/,
  /\/excel\/?$/,
  /\/pdf\/?$/,
  /\/comprobante\/?$/,
  /\/validar-/,
  /\/validate-/,
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
    if (isSensitivePersistedHeader(name)) return
    pairs.push({ name, value })
  })
  return pairs
}

function pairsToHeaders(pairs: HeaderPair[]) {
  const headers = new Headers()
  for (const pair of pairs) {
    if (!pair.name || isSensitivePersistedHeader(pair.name)) continue
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
  if (!isBusinessLocalFirstEndpoint(normalized)) return false
  return true
}

function isLocalFirstWriteEndpoint(endpoint: string, method: string) {
  const normalized = localFirstEndpoint(endpoint)
  if (!isBusinessLocalFirstEndpoint(normalized)) return false
  if (!['POST', 'PUT', 'DELETE'].includes(method)) return false
  return true
}

function isBusinessLocalFirstEndpoint(endpoint: string) {
  if (!endpoint.startsWith('/api/') && !endpoint.startsWith('/')) return false
  if (LOCAL_FIRST_EXCLUDED_PREFIXES.some((prefix) => endpoint.startsWith(prefix))) return false
  if (LOCAL_FIRST_EXCLUDED_PATTERNS.some((pattern) => pattern.test(endpoint))) return false
  return true
}

function isDeferredValidationEndpoint(endpoint: string) {
  const normalized = localFirstEndpoint(endpoint)
  return normalized.startsWith('/api/validations/')
    || normalized.includes('/validar-')
    || normalized.includes('/validate-')
}

/**
 * La outbox es texto plano (localStorage en web y SQLite en escritorio). Una
 * configuracion fiscal puede incluir PFX, contrasena del certificado, PIN de
 * software DIAN y credenciales SUNAT/OSE/ARCA; por eso estas escrituras deben
 * fallar cerradas si no existe una respuesta en vivo del servidor.
 *
 * El filtro se aplica tanto al endpoint logico como a la URL defensivamente:
 * enqueueOfflineRequest tambien es API publica de este modulo.
 */
function isSensitiveNonQueueableEndpoint(endpoint: string, method: string) {
  const normalizedMethod = method.trim().toUpperCase()
  if (['GET', 'HEAD', 'OPTIONS'].includes(normalizedMethod)) return false

  const normalized = localFirstEndpoint(endpoint).trim().toLowerCase()
  const absolutePrefix = '^(?:https?:\\/\\/[^/]+)?'
  const hasSensitiveSegment = normalized
    .split(/[\/_-]/)
    .some((segment) => ['certificate', 'certificado', 'credential', 'credencial', 'pfx', 'secret'].includes(segment))
  return new RegExp(`${absolutePrefix}/api/configuration(?:/|$)`).test(normalized)
    || new RegExp(`${absolutePrefix}/configuration(?:/|$)`).test(normalized)
    || new RegExp(`${absolutePrefix}/api/configuracion(?:[-/]|$)`).test(normalized)
    || new RegExp(`${absolutePrefix}/configuracion(?:[-/]|$)`).test(normalized)
    || new RegExp(`${absolutePrefix}/api/auth(?:/|$)`).test(normalized)
    || new RegExp(`${absolutePrefix}/auth(?:/|$)`).test(normalized)
    || /\/demo\/convert-to-real(?:\/|$)/.test(normalized)
    || hasSensitiveSegment
}

function isSensitiveOfflineRequest(input: Pick<OfflineRequestInput, 'endpoint' | 'method' | 'url'>) {
  return isSensitiveNonQueueableEndpoint(input.endpoint, input.method)
    || isSensitiveNonQueueableEndpoint(input.url, input.method)
}

function sensitiveOfflineError() {
  return new Error(SENSITIVE_OFFLINE_ERROR)
}

function isLiveConnectivityTestEndpoint(endpoint: string) {
  const normalized = localFirstEndpoint(endpoint)
  return normalized === '/api/configuration/colombia/dian/test'
    || normalized === '/configuration/colombia/dian/test'
    || normalized === '/api/configuration/colombia/dian/habilitacion'
    || normalized === '/configuration/colombia/dian/habilitacion'
    || normalized === '/api/rrhh/configuracion-laboral/colombia/pila/test'
    || normalized === '/rrhh/configuracion-laboral/colombia/pila/test'
}

async function deferredValidationResponse(
  endpoint: string,
  init: RequestInit,
  meta: { endpoint: string; userId?: string | null; tenantId?: string | null },
  url: string,
  method: string,
) {
  const body = await offlineBodyToString(init.body)
  let payload: any = {}
  try {
    payload = body ? JSON.parse(body) : {}
  } catch {
    payload = {}
  }
  const normalized = localFirstEndpoint(endpoint)
  const data = normalized.includes('validar-documento')
    ? { valido: true, errores: [], offline: true, validacion_diferida: true }
    : normalized.includes('dni-lookup')
      ? { dni: payload.dni, offline: true, validacion_diferida: true }
      : {
          ...payload,
          offline: true,
          validacion_diferida: true,
          mensaje: 'Validacion externa pendiente de conexion',
        }
  const queued = await enqueueDeferredValidationRequest(url, init, meta, method, body)

  return new Response(JSON.stringify({
    success: true,
    offline: true,
    local_first: true,
    validation_deferred: true,
    queued: true,
    message: 'Validacion externa diferida hasta reconectar.',
    data: {
      ...data,
      offline_validation_queue_id: queued.id,
    },
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'x-erp-offline-cache': 'true',
      'x-erp-validation-deferred': 'true',
    },
  })
}

async function enqueueDeferredValidationRequest(
  url: string,
  init: RequestInit,
  meta: { endpoint: string; userId?: string | null; tenantId?: string | null },
  method: string,
  body: string | null,
) {
  const validationId = localId()
  const headers = headersToPairs(init.headers)
    .filter((header) => !header.name.toLowerCase().startsWith('x-erp-local-'))
  headers.push({ name: 'x-erp-local-id', value: validationId })
  headers.push({ name: 'x-erp-local-entity-type', value: 'external_validation' })
  headers.push({ name: 'x-erp-validation-deferred', value: 'true' })

  return enqueueOfflineRequest({
    endpoint: meta.endpoint,
    method,
    url,
    headers,
    body,
    tenant_id: meta.tenantId ?? null,
    user_id: meta.userId ?? null,
  })
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

function base64ToUint8Array(value: string) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

async function serializeFormData(body: FormData): Promise<string> {
  const parts: SerializedFormDataPart[] = []
  for (const [name, value] of body.entries()) {
    if (typeof value === 'string') {
      parts.push({ kind: 'field', name, value })
      continue
    }
    const file = value as File
    const buffer = await file.arrayBuffer()
    parts.push({
      kind: 'file',
      name,
      filename: file.name || 'archivo',
      content_type: file.type || 'application/octet-stream',
      body_base64: arrayBufferToBase64(buffer),
    })
  }
  return JSON.stringify({
    __erp_offline_formdata: true,
    parts,
  })
}

function serializedFormDataToBody(raw: string): FormData | null {
  try {
    const payload = JSON.parse(raw)
    if (!payload?.__erp_offline_formdata || !Array.isArray(payload.parts)) return null
    const formData = new FormData()
    for (const part of payload.parts as SerializedFormDataPart[]) {
      if (part.kind === 'field') {
        formData.append(part.name, part.value ?? '')
      } else if (part.kind === 'file' && part.body_base64) {
        const file = new File(
          [base64ToUint8Array(part.body_base64)],
          part.filename || 'archivo',
          { type: part.content_type || 'application/octet-stream' },
        )
        formData.append(part.name, file)
      }
    }
    return formData
  } catch {
    return null
  }
}

function responseFromBinaryLocal(local: BinaryLocalResponse) {
  const headers = pairsToHeaders(local.headers)
  headers.set('x-erp-offline-cache', 'true')
  headers.set('x-erp-offline-cached-at', String(local.cached_at))
  return new Response(base64ToUint8Array(local.body_base64), {
    status: local.status,
    statusText: local.status >= 200 && local.status < 300 ? 'OK' : 'Local Binary Cache',
    headers,
  })
}

async function readLocalFirstResponse(endpoint: string, url: string, tenantId?: string | null) {
  if (!isDesktopRuntime() || !isLocalFirstGetEndpoint(endpoint)) return null
  const normalizedEndpoint = localFirstEndpoint(endpoint)
  try {
    const local = await invoke<LocalFirstResponse | null>('get_local_first_response', {
      endpoint: normalizedEndpoint,
      url,
      tenantId: tenantId ?? null,
    })
    return local ? responseFromLocalFirst(local) : null
  } catch (error) {
    console.warn('[offline-store] No se pudo leer respuesta local-first:', error)
    return null
  }
}

async function readBinaryResponse(endpoint: string, url: string, tenantId?: string | null) {
  if (!isDesktopRuntime()) return null
  try {
    const local = await invoke<BinaryLocalResponse | null>('get_binary_response', {
      endpoint: localFirstEndpoint(endpoint),
      url,
      tenantId: tenantId ?? null,
    })
    return local ? responseFromBinaryLocal(local) : null
  } catch (error) {
    console.warn('[offline-store] No se pudo leer binario local:', error)
    return null
  }
}

async function hydrateLocalFirstResponse(url: string, endpoint: string, response: Response, tenantId?: string | null) {
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
      tenantId: tenantId ?? null,
    })
  } catch (error) {
    console.warn('[offline-store] No se pudo hidratar SQLite local-first:', error)
  }
}

async function hydrateBinaryResponse(url: string, endpoint: string, response: Response, tenantId?: string | null) {
  if (!isDesktopRuntime()) return
  if (!response.ok || response.status === 204) return

  const contentType = response.headers.get('Content-Type') || ''
  if (/application\/json|text\//i.test(contentType)) return

  const buffer = await response.arrayBuffer().catch(() => null)
  if (!buffer || buffer.byteLength === 0 || buffer.byteLength > BINARY_CACHE_BODY_LIMIT) return

  try {
    await invoke('cache_binary_response', {
      endpoint: localFirstEndpoint(endpoint),
      url,
      status: response.status,
      headers: headersToPairs(response.headers),
      bodyBase64: arrayBufferToBase64(buffer),
      tenantId: tenantId ?? null,
    })
  } catch (error) {
    console.warn('[offline-store] No se pudo hidratar binario local:', error)
  }
}

async function processLocalFirstWrite(
  url: string,
  init: RequestInit,
  meta: { endpoint: string; userId?: string | null; tenantId?: string | null },
  method: string,
) {
  if (!isDesktopRuntime() || !isLocalFirstWriteEndpoint(meta.endpoint, method)) return null
  const body = await offlineBodyToString(init.body)
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
  if (isSensitiveOfflineRequest(input)) throw sensitiveOfflineError()

  const safeInput = { ...input, headers: sanitizePersistedHeaders(input.headers || []) }
  if (isDesktopRuntime()) {
    return invoke<OfflineQueueItem>('enqueue_offline_request', { request: safeInput })
  }

  const queue = readJson<OfflineQueueItem[]>(OUTBOX_KEY, [])
  const timestamp = now()
  const item: OfflineQueueItem = {
    ...safeInput,
    id: localId(),
    method: safeInput.method.toUpperCase(),
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

export async function listOfflineRequests(tenantId?: string | null): Promise<OfflineQueueItem[]> {
  let queue: OfflineQueueItem[]
  if (isDesktopRuntime()) {
    queue = await invoke<OfflineQueueItem[]>('list_offline_requests')
  } else {
    queue = readJson<OfflineQueueItem[]>(OUTBOX_KEY, [])
  }
  const sensitiveItems = queue.filter(isSensitiveOfflineRequest)
  if (isDesktopRuntime()) {
    for (const item of sensitiveItems) {
      try {
        await invoke('delete_offline_request', { id: item.id })
      } catch (error) {
        console.warn('[offline-store] No se pudo purgar una configuracion sensible legacy:', error)
      }
    }
  }

  let changed = sensitiveItems.length > 0
  const sanitized = queue.filter((item) => !isSensitiveOfflineRequest(item)).map((item) => {
    const headers = sanitizePersistedHeaders(item.headers || [])
    changed ||= headers.length !== (item.headers || []).length
    return { ...item, headers }
  })
  if (changed && !isDesktopRuntime()) writeJson(OUTBOX_KEY, sanitized)
  return tenantId ? sanitized.filter((item) => item.tenant_id === tenantId) : sanitized
}

export async function listLocalIdMappings(): Promise<LocalIdMapping[]> {
  if (isDesktopRuntime()) {
    return invoke<LocalIdMapping[]>('list_local_id_mappings')
  }
  return []
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

export async function markOfflineRequestFailed(id: string, error: string, responseStatus?: number | null) {
  if (isDesktopRuntime()) {
    await invoke('mark_offline_request_failed', { id, error, responseStatus: responseStatus ?? null })
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
          response_status: responseStatus ?? item.response_status,
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

export async function getOfflineStatus(tenantId?: string | null): Promise<OfflineStatus> {
  if (isDesktopRuntime()) {
    const rawStatus = await invoke<OfflineStatus>('get_offline_status')
    if (!tenantId) return rawStatus
    const queue = await listOfflineRequests(tenantId)
    return {
      offline_mode: rawStatus.offline_mode,
      total: queue.length,
      pending: queue.filter((item) => item.status === 'pending').length,
      failed: queue.filter((item) => item.status === 'failed').length,
      synced: queue.filter((item) => item.status === 'synced').length,
    }
  }

  const queue = await listOfflineRequests(tenantId)
  return {
    offline_mode: typeof navigator !== 'undefined' ? !navigator.onLine : false,
    total: queue.length,
    pending: queue.filter((item) => item.status === 'pending').length,
    failed: queue.filter((item) => item.status === 'failed').length,
    synced: queue.filter((item) => item.status === 'synced').length,
  }
}

export async function cacheApiResponse(
  url: string,
  endpoint: string,
  response: Response,
  tenantId?: string | null,
) {
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
    tenant_id: tenantId ?? null,
    status: response.status,
    statusText: response.statusText,
    headers: headersToPairs(response.headers),
    body,
    cached_at: now(),
  }

  const next = [
    entry,
    ...cache.filter((item) => item.url !== url || item.tenant_id !== entry.tenant_id),
  ].slice(0, CACHE_LIMIT)
  writeJson(CACHE_KEY, next)
}

export async function readCachedApiResponse(
  url: string,
  tenantId?: string | null,
): Promise<Response | null> {
  const normalizedTenantId = tenantId ?? null
  const entry = readJson<ApiCacheEntry[]>(CACHE_KEY, []).find(
    (item) => item.url === url && (item.tenant_id ?? null) === normalizedTenantId,
  )
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

/**
 * Distingue un aborto del cliente (timeout de `use-api` o cancelación explícita)
 * de un fallo de red real. `fetch` rechaza con un `DOMException` de nombre
 * `AbortError`; en entornos sin `DOMException` se comprueba el nombre igual.
 */
function esAbortoDeCliente(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const nombre = (error as { name?: unknown }).name
  return nombre === 'AbortError' || nombre === 'TimeoutError'
}

function canQueue(method: string, body: BodyInit | null | undefined) {
  if (method === 'GET' || method === 'HEAD') return false
  if (typeof Blob !== 'undefined' && body instanceof Blob) return false
  if (body instanceof ArrayBuffer) return false
  if (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream) return false
  return true
}

async function offlineBodyToString(body: BodyInit | null | undefined): Promise<string | null> {
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    return serializeFormData(body)
  }
  return bodyToString(body)
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

function responseBodyFailureMessage(body: string) {
  if (!body) return null
  try {
    const payload = JSON.parse(body)
    if (payload && typeof payload === 'object' && payload.success === false) {
      return String(payload.message || payload.error || 'Respuesta de sincronizacion con success=false')
    }
  } catch {
    return null
  }
  return null
}

function buildLocalIdReplacementMap(mappings: LocalIdMapping[]) {
  const map = new Map<string, string>()
  for (const mapping of mappings) {
    if (mapping.local_id && mapping.remote_id && mapping.local_id !== mapping.remote_id) {
      map.set(mapping.local_id, mapping.remote_id)
    }
  }
  return map
}

function replaceLocalIdsInValue(value: any, replacements: Map<string, string>): any {
  if (typeof value === 'string') {
    return replacements.get(value) ?? value
  }
  if (Array.isArray(value)) {
    return value.map((item) => replaceLocalIdsInValue(item, replacements))
  }
  if (value && typeof value === 'object') {
    const next: Record<string, any> = {}
    for (const [key, item] of Object.entries(value)) {
      next[key] = replaceLocalIdsInValue(item, replacements)
    }
    return next
  }
  return value
}

function rewriteLocalIdsInBody(body: string | null | undefined, replacements: Map<string, string>) {
  if (!body || replacements.size === 0) return body
  try {
    const payload = JSON.parse(body)
    return JSON.stringify(replaceLocalIdsInValue(payload, replacements))
  } catch {
    return body
  }
}

function rewriteLocalIdsInEndpoint(endpoint: string, replacements: Map<string, string>) {
  if (!endpoint || replacements.size === 0) return endpoint
  let next = endpoint
  for (const [localId, remoteId] of replacements) {
    next = next.split(encodeURIComponent(localId)).join(encodeURIComponent(remoteId))
    next = next.split(localId).join(remoteId)
  }
  return next
}

export async function fetchWithOfflineSupport(
  url: string,
  init: RequestInit,
  meta: { endpoint: string; userId?: string | null; tenantId?: string | null },
) {
  const method = (init.method || 'GET').toUpperCase()
  const forceOffline = await isOfflineModeEnabled()

  if (forceOffline) {
    if (isSensitiveNonQueueableEndpoint(meta.endpoint, method)) {
      throw sensitiveOfflineError()
    }

    // Las validaciones y constancias fiscales externas no son trabajo
    // diferible: encolarlas podría registrar después una habilitación que el
    // usuario ya no está viendo o contra otra configuración.
    if (isLiveConnectivityTestEndpoint(meta.endpoint)) {
      throw new Error('Esta operación fiscal requiere conexión en vivo.')
    }
    if (isDeferredValidationEndpoint(meta.endpoint)) {
      return deferredValidationResponse(meta.endpoint, init, meta, url, method)
    }

    if (method === 'GET') {
      const localFirst = await readLocalFirstResponse(meta.endpoint, url, meta.tenantId)
      if (localFirst) return localFirst

      const binary = await readBinaryResponse(meta.endpoint, url, meta.tenantId)
      if (binary) return binary

      const cached = await readCachedApiResponse(url, meta.tenantId)
      if (cached) return cached
    }

    const localFirstWrite = await processLocalFirstWrite(url, init, meta, method)
    if (localFirstWrite) return localFirstWrite

    if (canQueue(method, init.body)) {
      const serializedBody = await offlineBodyToString(init.body)
      const item = await enqueueOfflineRequest({
        endpoint: meta.endpoint,
        method,
        url,
        headers: headersToPairs(init.headers),
        body: serializedBody,
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
      await hydrateLocalFirstResponse(url, meta.endpoint, response.clone(), meta.tenantId)
      await hydrateBinaryResponse(url, meta.endpoint, response.clone(), meta.tenantId)
      await cacheApiResponse(url, meta.endpoint, response.clone(), meta.tenantId)
    }
    return response
  } catch (error) {
    // Un timeout NO es estar sin conexión, y la diferencia importa mucho.
    //
    // `use-api` aborta la petición a los 12 s (30 s en el POS). Cuando eso ocurre
    // el servidor pudo perfectamente haberla recibido y procesado: lo único que se
    // perdió fue la respuesta. Tratarlo como desconexión y encolar la escritura
    // significa reenviarla más tarde y arriesgar un duplicado —una venta, un pago,
    // un CPE cobrados dos veces—, y encima devolver 202 con `success: true`, así
    // que quien llamó cree que terminó bien. El propio `use-api` comenta que no
    // reintenta escrituras por ese motivo; encolarlas por debajo lo contradecía.
    //
    // Un abort se propaga como el fallo que es. Sólo se encola cuando la petición
    // no llegó a salir, que es para lo que existe el modo offline.
    if (esAbortoDeCliente(error)) throw error

    if (isSensitiveNonQueueableEndpoint(meta.endpoint, method)) {
      throw sensitiveOfflineError()
    }

    // Una prueba de conectividad debe informar el fallo en vivo. Encolarla
    // produciría un falso positivo y podría repetir una operación diagnóstica.
    if (isLiveConnectivityTestEndpoint(meta.endpoint)) throw error

    if (isDeferredValidationEndpoint(meta.endpoint)) {
      return deferredValidationResponse(meta.endpoint, init, meta, url, method)
    }

    if (method === 'GET') {
      const localFirst = await readLocalFirstResponse(meta.endpoint, url, meta.tenantId)
      if (localFirst) return localFirst

      const binary = await readBinaryResponse(meta.endpoint, url, meta.tenantId)
      if (binary) return binary

      const cached = await readCachedApiResponse(url, meta.tenantId)
      if (cached) return cached
    }

    const localFirstWrite = await processLocalFirstWrite(url, init, meta, method)
    if (localFirstWrite) return localFirstWrite

    if (canQueue(method, init.body)) {
      const serializedBody = await offlineBodyToString(init.body)
      const item = await enqueueOfflineRequest({
        endpoint: meta.endpoint,
        method,
        url,
        headers: headersToPairs(init.headers),
        body: serializedBody,
        tenant_id: meta.tenantId ?? null,
        user_id: meta.userId ?? null,
      })
      return queuedResponse(item)
    }

    throw error
  }
}

export async function syncOfflineQueue(
  accessToken: string | null = null,
  tenantId?: string | null,
) {
  const queue = await listOfflineRequests(tenantId)
  const candidates = queue.filter((item) => item.status === 'pending' || item.status === 'failed')
  const results: Array<{ id: string; ok: boolean; status?: number; error?: string }> = []
  let idReplacements = buildLocalIdReplacementMap(await listLocalIdMappings())

  for (const item of candidates) {
    try {
      const rewrittenEndpoint = item.endpoint
        ? rewriteLocalIdsInEndpoint(item.endpoint, idReplacements)
        : item.endpoint
      const rewrittenUrl = rewriteLocalIdsInEndpoint(item.url, idReplacements)
      const rewrittenBody = rewriteLocalIdsInBody(item.body, idReplacements)
      const targetUrl = rewrittenEndpoint ? buildApiUrl(rewrittenEndpoint) : rewrittenUrl
      const formDataBody = rewrittenBody ? serializedFormDataToBody(rewrittenBody) : null
      const headers = pairsToHeaders(item.headers)
      if (accessToken?.trim()) {
        headers.set('Authorization', `Bearer ${accessToken.trim()}`)
      }
      if (formDataBody) {
        headers.delete('Content-Type')
        headers.delete('content-type')
      }
      const response = await fetch(targetUrl, {
        method: item.method,
        headers,
        body: formDataBody ?? rewrittenBody ?? undefined,
        credentials: 'include',
        mode: 'cors',
        cache: 'no-store',
      })
      const responseBody = await response.text().catch(() => '')
      const logicalError = response.ok ? responseBodyFailureMessage(responseBody) : null

      if (response.ok && !logicalError) {
        await markOfflineRequestSynced(item.id, response.status, responseBody)
        idReplacements = buildLocalIdReplacementMap(await listLocalIdMappings())
        results.push({ id: item.id, ok: true, status: response.status })
      } else {
        const error = logicalError || responseBody || `HTTP ${response.status}`
        await markOfflineRequestFailed(item.id, error, response.status)
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

export async function refreshLocalFirstSnapshots(
  endpoints: string[] = DEFAULT_LOCAL_FIRST_SNAPSHOT_ENDPOINTS,
  headers?: HeadersInit,
) {
  const results: Array<{ endpoint: string; ok: boolean; status?: number; error?: string }> = []
  const snapshotHeaders = new Headers(headers)
  const tenantId = snapshotHeaders.get('x-tenant-id') || snapshotHeaders.get('X-Tenant-Id')
  if (await isOfflineModeEnabled()) {
    return endpoints.map((endpoint) => ({
      endpoint,
      ok: false,
      error: 'Modo offline activo',
    }))
  }

  for (const endpoint of endpoints) {
    try {
      const url = buildApiUrl(endpoint)
      const response = await fetch(url, {
        method: 'GET',
        headers,
        credentials: 'include',
        mode: 'cors',
        cache: 'no-store',
      })
      if (response.ok) {
        await hydrateLocalFirstResponse(url, endpoint, response.clone(), tenantId)
        await hydrateBinaryResponse(url, endpoint, response.clone(), tenantId)
        await cacheApiResponse(url, endpoint, response.clone(), tenantId)
      }
      results.push({ endpoint, ok: response.ok, status: response.status })
    } catch (error) {
      results.push({
        endpoint,
        ok: false,
        error: error instanceof Error ? error.message : 'Error al actualizar snapshot local',
      })
    }
  }

  return results
}

declare global {
  interface Window {
    __TAURI__?: any
  }
}
