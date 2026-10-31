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
  user_id?: string | null
  status: number
  statusText: string
  headers: HeaderPair[]
  body: string
  cached_at: number
}

const OUTBOX_KEY = 'erp.desktop.offline.outbox'
const CACHE_KEY = 'erp.desktop.offline.cache'
const cacheAuthorizationRevisions = new Map<string, number>()
function cacheAuthorizationRevision(userId?: string | null) {
  return userId ? cacheAuthorizationRevisions.get(userId) ?? 0 : 0
}
const SENSITIVE_OFFLINE_ERROR = 'Esta configuracion sensible requiere conexion en vivo y nunca se guarda en la cola offline.'
const FISCAL_OFFLINE_ERROR = 'La emision fiscal requiere conexion en vivo. No se guarda en la cola offline ni se considera emitida.'
const PAYROLL_PAYMENT_OFFLINE_ERROR = 'El pago laboral requiere confirmacion en vivo. No se guarda en la cola offline; conserve la referencia y reintente para confirmar la misma operacion.'
const CACHE_LIMIT = 120
const CACHE_ENTRY_BODY_LIMIT = 512 * 1024
const BINARY_CACHE_BODY_LIMIT = 8 * 1024 * 1024
const OFFLINE_MODE_CACHE_TTL = 5000
export const DEFAULT_LOCAL_FIRST_SNAPSHOT_ENDPOINTS = [
  '/api/dashboard/stats',
  '/api/dashboard/activities',
  '/api/pos/productos',
  '/api/pos/clientes',
  '/api/pos/metodos-pago',
  '/api/pos/empresa-config',
  '/api/pos/configuration-status',
  '/api/pos/sesion-caja',
  '/api/pos/ventas-recientes',
  '/api/configuration/gre-thresholds',
  '/api/configuration/context/country',
  '/api/configuracion-fiscal',
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
  '/api/finanzas/cxc',
  '/api/finanzas/cxp',
  '/api/finanzas/tesoreria/pagos',
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
  '/api/gre/guias',
  '/api/gre/reporte',
  '/api/paises',
  '/api/notifications',
  '/api/notifications/unread',
  '/api/usuarios-sistema/me/permissions',
  '/api/tenants/me',
  '/api/cajas/sesiones',
  '/api/cajas/cortes',
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
  return typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || Boolean(window.__TAURI__))
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

function offlineEndpointPath(endpoint: string) {
  const withoutQuery = endpoint.split(/[?#]/)[0]?.trim() || ''
  const schemeIndex = withoutQuery.indexOf('://')
  if (schemeIndex < 0) return withoutQuery.replace(/\/+$/, '').toLowerCase()

  const pathIndex = withoutQuery.indexOf('/', schemeIndex + 3)
  return (pathIndex < 0 ? '/' : withoutQuery.slice(pathIndex)).replace(/\/+$/, '').toLowerCase()
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
    // Los compromisos contractuales se validan contra saldos y versiones vivos.
    // Nunca sincronizar una decisión de cronograma después, fuera de su contexto.
    || /\/(?:api\/)?ventas\/contratos(?:\/|$)/.test(normalized)
    // Reservas y regularizaciones por lote dependen de saldos vivos.
    || /\/(?:api\/)?inventario\/lotes(?:\/|$)/.test(normalized)
    || /\/(?:api\/)?alertas(?:\/|$)/.test(normalized)
    // Un corte del tablero y una credencial BI se registran en línea o no se registran.
    || /\/(?:api\/)?(?:reportes\/suministro|integraciones\/bi)(?:\/|$)/.test(normalized)
    // Una migración se ensaya e importa en línea, con su lote y conciliación.
    || /\/(?:api\/)?migration(?:\/|$)/.test(normalized)
    || /\/demo\/convert-to-real(?:\/|$)/.test(normalized)
    // El alta y la edición de empresas son de plataforma: encoladas, el modal se
    // cerraba como si hubieran terminado, sin credenciales, y el envío real quedaba
    // para cuando la cola se sincronizara.
    || new RegExp(`${absolutePrefix}/api/tenants(?:/|$)`).test(normalized)
    || new RegExp(`${absolutePrefix}/tenants(?:/|$)`).test(normalized)
    || hasSensitiveSegment
}

function isSensitiveOfflineRequest(input: Pick<OfflineRequestInput, 'endpoint' | 'method' | 'url'>) {
  return isSensitiveNonQueueableEndpoint(input.endpoint, input.method)
    || isSensitiveNonQueueableEndpoint(input.url, input.method)
}

function isPayrollPaymentOfflineRequest(input: Pick<OfflineRequestInput, 'endpoint' | 'method' | 'url'>) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(input.method.trim().toUpperCase())) return false
  const isPayment = (endpoint: string) => /^\/(?:api\/)?rrhh\/(?:planillas\/[^/]+\/pagar(?:-empleados)?|liquidaciones\/[^/]+\/(?:pagar|pago\/revertir)|cts\/depositos\/[^/]+\/depositar)$/.test(offlineEndpointPath(endpoint))
  return isPayment(offlineEndpointPath(input.endpoint).replace(/^\/backend(?=\/)/, '')) || isPayment(offlineEndpointPath(input.url).replace(/^\/backend(?=\/)/, ''))
}

function isPayrollCreationOfflineRequest(input: Pick<OfflineRequestInput, 'endpoint' | 'method' | 'url'>) {
  const method=input.method.trim().toUpperCase()
  if (['GET','HEAD','OPTIONS'].includes(method)) return false
  return [input.endpoint,input.url].some(endpoint=>{
    const path=offlineEndpointPath(endpoint).replace(/^\/backend(?=\/)/,'')
    return /^\/(?:api\/)?rrhh\/planillas\/crear-con-calculo(?:\/resolver)?$/.test(path)
      || method==='POST' && /^\/(?:api\/)?rrhh\/planillas$/.test(path)
  })
}

function isPayrollCalculationOfflineRequest(input: Pick<OfflineRequestInput, 'endpoint' | 'method' | 'url'>) {
  if (['GET','HEAD','OPTIONS'].includes(input.method.trim().toUpperCase())) return false
  return [input.endpoint,input.url].some(endpoint => /^\/(?:api\/)?rrhh\/planillas\/[^/]+\/calcular(?:-personalizada)?(?:\/resolver)?$/.test(offlineEndpointPath(endpoint).replace(/^\/backend(?=\/)/,'')))
}

function isPayrollApprovalOfflineRequest(input: Pick<OfflineRequestInput, 'endpoint' | 'method' | 'url' | 'body'>) {
  const method = input.method.trim().toUpperCase()
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return false
  let legacyApproval = false
  try { legacyApproval = method === 'PUT' && String(JSON.parse(input.body || '{}')?.estado || '').trim().toLowerCase() === 'aprobada' } catch { /* DTO inválido: no se declara una aprobación. */ }
  return [input.endpoint, input.url].some(endpoint => {
    const path = offlineEndpointPath(endpoint).replace(/^\/backend(?=\/)/, '')
    return /^\/(?:api\/)?rrhh\/planillas\/[^/]+\/aprobar$/.test(path)
      || legacyApproval && /^\/(?:api\/)?rrhh\/planillas\/[^/]+$/.test(path)
  })
}

function isTreasuryBatchOfflineRequest(input: Pick<OfflineRequestInput, 'endpoint' | 'method' | 'url'>) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(input.method.trim().toUpperCase())) return false
  return [input.endpoint, input.url].some(endpoint => /^\/(?:api\/)?finanzas\/tesoreria\/lote$/.test(offlineEndpointPath(endpoint)))
}

function isCxpPaymentOfflineRequest(input: Pick<OfflineRequestInput, 'endpoint' | 'method' | 'url'>) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(input.method.trim().toUpperCase())) return false
  return [input.endpoint, input.url].some(endpoint => /^\/(?:api\/)?finanzas\/cxp\/[^/]+\/aplicar-pago$/.test(offlineEndpointPath(endpoint)))
}

function isCxcManualConfirmationRequest(input: Pick<OfflineRequestInput, 'endpoint' | 'method' | 'url'>) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(input.method.trim().toUpperCase())) return false
  return [input.endpoint, input.url].some(endpoint => /^\/(?:backend\/)?(?:api\/)?finanzas\/cxc\/[^/]+\/(?:pagos|reprogramar|notas-credito)$/.test(offlineEndpointPath(endpoint)))
}

function isSupplierInvoiceOfflineRequest(input: Pick<OfflineRequestInput, 'endpoint' | 'method' | 'url'>) {
  if (input.method.trim().toUpperCase() !== 'POST') return false
  return [input.endpoint, input.url].some(endpoint => /^\/(?:backend\/)?(?:api\/)?finanzas\/cxp$/.test(offlineEndpointPath(endpoint)))
}

function isEmployeeRequestOfflineOperation(input: Pick<OfflineRequestInput, 'endpoint' | 'method' | 'url'>) {
  const method = input.method.trim().toUpperCase()
  return [input.endpoint, input.url].some(endpoint => {
    const path = offlineEndpointPath(endpoint).replace(/^\/backend(?=\/)/, '')
    return method === 'POST' && /^\/(?:api\/)?rrhh\/solicitudes$/.test(path)
      || method === 'PUT' && /^\/(?:api\/)?rrhh\/solicitudes\/[^/]+\/(?:aprobar|rechazar)$/.test(path)
  })
}

function isPurchaseOrderCreateOfflineRequest(input: Pick<OfflineRequestInput, 'endpoint' | 'method' | 'url'>) {
  return input.method.trim().toUpperCase() === 'POST' && [input.endpoint,input.url].some(endpoint =>
    /^\/(?:backend\/)?(?:api\/)?compras\/ordenes$/.test(offlineEndpointPath(endpoint)))
}

function isPurchaseReceiptOfflineRequest(input: Pick<OfflineRequestInput, 'endpoint' | 'method' | 'url'>) {
  return input.method.trim().toUpperCase() === 'POST' && [input.endpoint,input.url].some(endpoint =>
    /^\/(?:backend\/)?(?:api\/)?compras\/recepciones\/(?:ordenes\/[^/]+|[^/]+\/cerrar)$/.test(offlineEndpointPath(endpoint)))
}

function isProductCreateOfflineRequest(input: Pick<OfflineRequestInput, 'endpoint' | 'method' | 'url'>) {
  const method = input.method.trim().toUpperCase()
  return [input.endpoint,input.url].some(endpoint => {
    const path = offlineEndpointPath(endpoint).replace(/^\/backend(?=\/)/,'').replace(/^\/api(?=\/)/,'')
    return method === 'POST' && /^\/inventario\/productos(?:\/[^/]+\/imagen)?$/.test(path)
      || method === 'PUT' && /^\/inventario\/productos\/[^/]+$/.test(path)
      || method === 'DELETE' && /^\/inventario\/productos\/[^/]+(?:\/imagen)?$/.test(path)
  })
}

function isDeferredAccrueOfflineRequest(input: Pick<OfflineRequestInput, 'endpoint' | 'method' | 'url'>) {
  return input.method.trim().toUpperCase() === 'POST' && [input.endpoint, input.url].some(endpoint =>
    /^\/(?:backend\/)?(?:api\/)?contabilidad\/diferidos\/devengar$/.test(offlineEndpointPath(endpoint)))
}

function isDeferredCancelOfflineRequest(input: Pick<OfflineRequestInput, 'endpoint' | 'method' | 'url'>) {
  return input.method.trim().toUpperCase() === 'DELETE' && [input.endpoint, input.url].some(endpoint =>
    /^\/(?:backend\/)?(?:api\/)?contabilidad\/diferidos\/(?!devengar$)[^/]+$/.test(offlineEndpointPath(endpoint)))
}

function isAssetLifecycleManualRequest(input: Pick<OfflineRequestInput, 'endpoint' | 'method' | 'url'>) {
 const method=input.method.trim().toUpperCase()
 return [input.endpoint,input.url].some(value=>{
  const p=offlineEndpointPath(value).replace(/^\/backend(?=\/)/,'').replace(/^\/api(?=\/)/,'')
  return method==='PUT'&&p!=='/contabilidad/activos-fijos/depreciar'&&/^\/contabilidad\/activos-fijos\/[^/]+$/.test(p)||method==='POST'&&/^\/contabilidad\/activos-fijos\/[^/]+\/baja$/.test(p)
 })
}

function isDepreciationBatchOfflineRequest(input: Pick<OfflineRequestInput, 'endpoint' | 'method' | 'url'>) {
 return input.method.trim().toUpperCase()==='POST'&&[input.endpoint,input.url].some(endpoint=>/^\/(?:backend\/)?(?:api\/)?contabilidad\/activos-fijos\/depreciar$/.test(offlineEndpointPath(endpoint)))
}

function isAssetCreateOfflineRequest(input: Pick<OfflineRequestInput, 'endpoint' | 'method' | 'url'>) {
  return input.method.trim().toUpperCase() === 'POST' && [input.endpoint,input.url].some(endpoint=>
    /^\/(?:backend\/)?(?:api\/)?contabilidad\/activos-fijos$/.test(offlineEndpointPath(endpoint)))
}

function isRevaluationRegistrationOfflineRequest(input: Pick<OfflineRequestInput, 'endpoint' | 'method' | 'url'>) {
  return input.method.trim().toUpperCase() === 'POST' && [input.endpoint,input.url].some(endpoint=>
    /^\/(?:backend\/)?(?:api\/)?contabilidad\/revaluacion$/.test(offlineEndpointPath(endpoint)))
}

function isDeferredCreateOfflineRequest(input: Pick<OfflineRequestInput, 'endpoint' | 'method' | 'url'>) {
  return input.method.trim().toUpperCase() === 'POST' && [input.endpoint, input.url].some(endpoint =>
    /^\/(?:backend\/)?(?:api\/)?contabilidad\/diferidos$/.test(offlineEndpointPath(endpoint)))
}

function isSalesDeliveryOfflineRequest(input: Pick<OfflineRequestInput, 'endpoint' | 'method' | 'url'>) {
  return input.method.trim().toUpperCase() === 'POST' && [input.endpoint, input.url].some(endpoint =>
    /^\/(?:backend\/)?(?:api\/)?inventario\/logistica\/[^/]+\/registrar-entrega$/.test(offlineEndpointPath(endpoint)))
}

function isInvoiceGenerationOfflineRequest(input: Pick<OfflineRequestInput, 'endpoint' | 'method' | 'url'>) {
  return input.method.trim().toUpperCase() === 'POST' && [input.endpoint, input.url].some(endpoint =>
    /^\/(?:backend\/)?(?:api\/)?ventas\/pedidos\/[^/]+\/generar-factura$/.test(offlineEndpointPath(endpoint)))
}

function isAccountingPeriodProvisionOfflineRequest(input: Pick<OfflineRequestInput, 'endpoint' | 'method' | 'url'>) {
  return input.method.trim().toUpperCase() === 'POST' && [input.endpoint, input.url].some(endpoint =>
    /^\/(?:backend\/)?(?:api\/)?contabilidad\/periodos\/[^/]+\/provision-cobranza-dudosa$/.test(offlineEndpointPath(endpoint)))
}

function isAccountingPeriodTransitionOfflineRequest(input: Pick<OfflineRequestInput, 'endpoint' | 'method' | 'url'>) {
  return input.method.trim().toUpperCase() === 'POST' && [input.endpoint, input.url].some(endpoint =>
    /^\/(?:backend\/)?(?:api\/)?contabilidad\/periodos\/[^/]+\/(?:cerrar|reabrir)$/.test(offlineEndpointPath(endpoint)))
}

function isBudgetDeleteOfflineRequest(input: Pick<OfflineRequestInput, 'endpoint' | 'method' | 'url'>) {
  return input.method.trim().toUpperCase() === 'DELETE' && [input.endpoint, input.url].some(endpoint =>
    /^\/(?:backend\/)?(?:api\/)?contabilidad\/presupuestos\/[^/]+$/.test(offlineEndpointPath(endpoint)))
}

function isBudgetUpdateOfflineRequest(input: Pick<OfflineRequestInput, 'endpoint' | 'method' | 'url'>) {
  const method=input.method.trim().toUpperCase()
  return [input.endpoint,input.url].some(endpoint=>
    (method==='PUT' && /^\/(?:backend\/)?(?:api\/)?contabilidad\/presupuestos\/[^/]+$/.test(offlineEndpointPath(endpoint)))
    || (method==='POST' && /^\/(?:backend\/)?(?:api\/)?contabilidad\/presupuestos\/[^/]+\/resolver-edicion$/.test(offlineEndpointPath(endpoint))))
}

function isBudgetCreateOfflineRequest(input: Pick<OfflineRequestInput, 'endpoint' | 'method' | 'url'>) {
  return input.method.trim().toUpperCase() === 'POST' && [input.endpoint, input.url].some(endpoint =>
    /^\/(?:backend\/)?(?:api\/)?contabilidad\/presupuestos$/.test(offlineEndpointPath(endpoint)))
}

function isAccountingPeriodCreateOfflineRequest(input: Pick<OfflineRequestInput, 'endpoint' | 'method' | 'url'>) {
  return input.method.trim().toUpperCase() === 'POST' && [input.endpoint, input.url].some(endpoint =>
    /^\/(?:backend\/)?(?:api\/)?contabilidad\/periodos$/.test(offlineEndpointPath(endpoint)))
}

// A closure preview is a server read, never an external validation to replay.
function isAccountingPeriodPreviewOfflineRequest(input: Pick<OfflineRequestInput, 'endpoint' | 'method' | 'url'>) {
  if (!['GET', 'HEAD'].includes(input.method.trim().toUpperCase())) return false
  return [input.endpoint, input.url].some(endpoint => /^\/(?:backend\/)?(?:api\/)?contabilidad\/periodos\/[^/]+\/validar-cierre$/.test(offlineEndpointPath(endpoint)))
}

function isCashOperationOfflineRequest(input: Pick<OfflineRequestInput, 'endpoint' | 'method' | 'url'>) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(input.method.trim().toUpperCase())) return false
  const cashOperation = /^\/(?:api\/)?cajas\/(?:[^/]+\/(?:apertura|cierre)|validar-cierre\/[^/]+|cerrar\/[^/]+|retiros\/[^/]+(?:\/conciliar)?|cambio-turno\/(?:iniciar|completar|cancelar)\/[^/]+|movimientos\/manual\/[^/]+|sesiones\/[^/]+\/cierre-administrativo)$/
  return [input.endpoint, input.url].some(endpoint => cashOperation.test(offlineEndpointPath(endpoint)))
}

function isInventoryOperationOfflineRequest(input: Pick<OfflineRequestInput, 'endpoint' | 'method' | 'url'>) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(input.method.trim().toUpperCase())) return false
  return [input.endpoint, input.url].some(endpoint => /^\/(?:api\/)?inventario\/(?:movimientos|transferencias)(?:\/resolver)?$/.test(offlineEndpointPath(endpoint).replace(/^\/backend(?=\/|$)/, '')))
}

function isGreOperationOfflineRequest(input: Pick<OfflineRequestInput, 'endpoint' | 'method' | 'url'>) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(input.method.trim().toUpperCase())) return false
  return [input.endpoint, input.url].some(endpoint => /^\/(?:api\/)?gre(?:\/|$)/.test(offlineEndpointPath(endpoint)))
}

function isDocumentFiscalManualRequest(input: Pick<OfflineRequestInput, 'endpoint' | 'method' | 'url'>) {
  if (input.method.trim().toUpperCase() !== 'POST') return false
  return [input.endpoint, input.url].some(value =>
    /^\/(?:backend\/)?(?:api\/)?documentos\/[^/]+\/(?:generar-xml|enviar-sunat)$/.test(offlineEndpointPath(value)))
}

function isFiscalEmissionEndpoint(endpoint: string, method: string) {
  const normalizedMethod = method.trim().toUpperCase()
  if (['GET', 'HEAD', 'OPTIONS'].includes(normalizedMethod)) return false

  const path = offlineEndpointPath(endpoint)
  return path === '/api/cpe'
    || path.startsWith('/api/cpe/')
    || path === '/cpe'
    || path.startsWith('/cpe/')
}

function isPosFiscalIntent(
  input: Pick<OfflineRequestInput, 'endpoint' | 'method' | 'url' | 'body'>,
) {
  const normalizedMethod = input.method.trim().toUpperCase()
  if (normalizedMethod !== 'POST') return false
  const endpointPath = offlineEndpointPath(input.endpoint)
  const urlPath = offlineEndpointPath(input.url)
  if (endpointPath !== '/api/pos/venta' && urlPath !== '/api/pos/venta') return false

  try {
    const payload = input.body ? JSON.parse(input.body) : null
    return payload?.emitir_cpe === true
      || ['01', '03', '07', '08'].includes(String(payload?.tipo_comprobante || '').toUpperCase())
  } catch {
    // Una intención POS ilegible no es segura para diferir: el backend vivo
    // debe validar el DTO antes de que exista cualquier efecto local.
    return true
  }
}

function isFiscalOfflineRequest(
  input: Pick<OfflineRequestInput, 'endpoint' | 'method' | 'url' | 'body'>,
) {
  return isFiscalEmissionEndpoint(input.endpoint, input.method)
    || isFiscalEmissionEndpoint(input.url, input.method)
    || isPosFiscalIntent(input)
}

function isNonQueueableOfflineRequest(
  input: Pick<OfflineRequestInput, 'endpoint' | 'method' | 'url' | 'body'>,
) {
  return isSensitiveOfflineRequest(input) || isFiscalOfflineRequest(input)
}

function sensitiveOfflineError() {
  return new Error(SENSITIVE_OFFLINE_ERROR)
}

function fiscalOfflineError() {
  return new Error(FISCAL_OFFLINE_ERROR)
}

async function nonQueueableOfflineError(
  endpoint: string,
  url: string,
  method: string,
  body: BodyInit | null | undefined,
) {
  if (isSensitiveOfflineRequest({ endpoint, url, method })) return sensitiveOfflineError()
  if (isDocumentFiscalManualRequest({ endpoint, url, method })) return fiscalOfflineError()
  if (isPayrollPaymentOfflineRequest({ endpoint, url, method })) return new Error(PAYROLL_PAYMENT_OFFLINE_ERROR)
  if (isPayrollCreationOfflineRequest({ endpoint, url, method })) return new Error('El alta de planilla y su conciliación requieren confirmación del servidor. La solicitud original de alta y cálculo se conserva para continuar o conciliar con conexión.')
  if (isPayrollCalculationOfflineRequest({ endpoint, url, method })) return new Error('El cálculo y su conciliación requieren confirmación del servidor. La solicitud original se conserva para un reintento manual con conexión.')
  const approvalBody = method.trim().toUpperCase() === 'PUT' && [endpoint, url].some(value =>
    /^\/(?:backend\/)?(?:api\/)?rrhh\/planillas\/[^/]+$/.test(offlineEndpointPath(value)))
    ? typeof body === 'string' ? body : await offlineBodyToString(body) : null
  if (isPayrollApprovalOfflineRequest({ endpoint, url, method, body: approvalBody })) return new Error('La aprobación de planilla requiere confirmación del servidor. Reintenta la aprobación pendiente con conexión.')
  if (isTreasuryBatchOfflineRequest({ endpoint, url, method })) return new Error('El pago masivo requiere confirmación del servidor. Conserva el formulario y reintenta con conexión.')
  if (isCxpPaymentOfflineRequest({ endpoint, url, method })) return new Error('El pago requiere confirmación del servidor. Reintenta el pago pendiente con conexión.')
  if (isCxcManualConfirmationRequest({ endpoint, url, method })) return new Error('El cobro o ajuste CxC requiere confirmación del servidor. Conserva la solicitud original para reintentar con conexión.')
  if (isSupplierInvoiceOfflineRequest({ endpoint, url, method })) return new Error('El documento requiere confirmación del servidor. Reintenta el registro pendiente con conexión.')
  if (isEmployeeRequestOfflineOperation({ endpoint, url, method })) return new Error('La solicitud requiere confirmación del servidor. Reintenta la operación pendiente con conexión.')
  if (isPurchaseOrderCreateOfflineRequest({ endpoint, url, method })) return new Error('La orden requiere confirmación del servidor. Reintenta la orden pendiente con conexión.')
  if (isPurchaseReceiptOfflineRequest({ endpoint, url, method })) return new Error('La recepción requiere confirmación del servidor. Reintenta la recepción pendiente con conexión.')
  if (isProductCreateOfflineRequest({ endpoint, url, method })) return new Error('El producto requiere confirmación del servidor. Reintenta el producto pendiente con conexión.')
  if (isDeferredAccrueOfflineRequest({ endpoint, url, method })) return new Error('El devengo requiere verificar el asiento y el período pendiente con conexión.')
  if (isDeferredCancelOfflineRequest({ endpoint, url, method })) return new Error('La cancelación del diferido requiere confirmación del servidor. Reintenta la cancelación pendiente con conexión.')
  if (isRevaluationRegistrationOfflineRequest({ endpoint, url, method })) return new Error('El registro de revaluación requiere confirmación del servidor. Reintenta la misma intención pendiente con conexión.')
  if(isAssetLifecycleManualRequest({endpoint,url,method}))return new Error('La edición o baja del activo requiere confirmación del servidor. Se conserva su solicitud original para un reintento manual con conexión.')
  if (isDepreciationBatchOfflineRequest({ endpoint, url, method })) return new Error('La depreciación requiere confirmación del servidor. Reintenta el lote original con conexión.')
  if (isAssetCreateOfflineRequest({ endpoint, url, method })) return new Error('El alta de activo requiere confirmación del servidor. Reintenta la misma solicitud pendiente con conexión.')
  if (isDeferredCreateOfflineRequest({ endpoint, url, method })) return new Error('El alta del diferido requiere confirmación del servidor. Reintenta el alta pendiente con conexión.')
  if (isSalesDeliveryOfflineRequest({ endpoint, url, method })) return new Error('La entrega requiere confirmación del servidor. Reintenta la entrega pendiente con conexión.')
  if (isInvoiceGenerationOfflineRequest({ endpoint, url, method })) return new Error('La generación del comprobante requiere confirmación del servidor. Verifica la generación pendiente con conexión.')
  if (isAccountingPeriodProvisionOfflineRequest({ endpoint, url, method })) return new Error('La estimación requiere confirmación del servidor. Verifica el resultado con conexión antes de reintentar.')
  if (isAccountingPeriodTransitionOfflineRequest({ endpoint, url, method })) return new Error('La transición del período requiere confirmación del servidor. Verifica la transición pendiente con conexión.')
  if (isBudgetDeleteOfflineRequest({ endpoint, url, method })) return new Error('La baja del presupuesto requiere confirmación del servidor. Reintenta la baja pendiente con conexión.')
  if (isBudgetUpdateOfflineRequest({ endpoint, url, method })) return new Error('La edición del presupuesto requiere confirmación del servidor. Reintenta la edición pendiente con conexión.')
  if (isBudgetCreateOfflineRequest({ endpoint, url, method })) return new Error('El alta del presupuesto requiere confirmación del servidor. Reintenta el alta pendiente con conexión.')
  if (isAccountingPeriodCreateOfflineRequest({ endpoint, url, method })) return new Error('La creación del período requiere confirmación del servidor. Reintenta la creación pendiente con conexión.')
  if (isAccountingPeriodPreviewOfflineRequest({ endpoint, url, method })) return new Error('La validación de cierre requiere una lectura en vivo. Reintenta la consulta con conexión.')
  if (isCashOperationOfflineRequest({ endpoint, url, method })) return new Error('La operación de caja requiere confirmación del servidor. Conserva el formulario y reintenta con conexión.')
  if (isInventoryOperationOfflineRequest({ endpoint, url, method })) return new Error('La operación de inventario requiere confirmación del servidor. Conserva el intento y reintenta con conexión.')
  if (isGreOperationOfflineRequest({ endpoint, url, method })) return new Error('La acción de GRE requiere confirmación del servidor. Conserva el intento y reintenta con conexión.')

  const serializedBody = offlineEndpointPath(endpoint) === '/api/pos/venta'
    || offlineEndpointPath(url) === '/api/pos/venta'
    ? await offlineBodyToString(body)
    : null
  if (isFiscalOfflineRequest({ endpoint, url, method, body: serializedBody })) return fiscalOfflineError()
  return null
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

function nativeActorScope(tenantId?: string | null) {
  const snapshot = readJson<{ user?: { id?: string; tenant_id?: string } }>('erp.auth.session.snapshot', {})
  const user = snapshot?.user
  if (!user?.id || !user.tenant_id || tenantId && tenantId !== user.tenant_id) return null
  return { tenantId: user.tenant_id, userId: user.id }
}

function requiredNativeActorScope() {
  const scope = nativeActorScope()
  if (!scope) throw new Error('No hay empresa o usuario activos para la cola local')
  return scope
}

type QueueActorScope = NonNullable<ReturnType<typeof nativeActorScope>>

function isQueueOwner(item: OfflineQueueItem, scope: QueueActorScope) {
  return item.tenant_id === scope.tenantId && item.user_id === scope.userId
}

function nativeReadAuthorization(tenantId?: string | null, userId?: string | null) {
  if (!isDesktopRuntime() || !tenantId || !userId) return null
  const key = `erp.native.read-authorization.${tenantId}.${userId}`
  let value = readJson<string | null>(key, null)
  if (!value) { value = localId(); if (!writeJson(key, value)) return null }
  return { tenantId, userId, authorization: value }
}

async function readLocalFirstResponse(endpoint: string, url: string, tenantId?: string | null, userId?: string | null) {
  const scope = nativeReadAuthorization(tenantId, userId)
  if (!isDesktopRuntime() || !scope || !isLocalFirstGetEndpoint(endpoint)) return null
  const normalizedEndpoint = localFirstEndpoint(endpoint)
  try {
    const local = await invoke<LocalFirstResponse | null>('get_local_first_response', {
      endpoint: normalizedEndpoint,
      url,
      ...scope,
    })
    return local ? responseFromLocalFirst(local) : null
  } catch (error) {
    console.warn('[offline-store] No se pudo leer respuesta local-first:', error)
    return null
  }
}

async function readBinaryResponse(endpoint: string, url: string, tenantId?: string | null, userId?: string | null) {
  const scope = nativeReadAuthorization(tenantId, userId)
  if (!isDesktopRuntime() || !scope) return null
  try {
    const local = await invoke<BinaryLocalResponse | null>('get_binary_response', {
      endpoint: localFirstEndpoint(endpoint),
      url,
      ...scope,
    })
    return local ? responseFromBinaryLocal(local) : null
  } catch (error) {
    console.warn('[offline-store] No se pudo leer binario local:', error)
    return null
  }
}

async function hydrateLocalFirstResponse(url: string, endpoint: string, response: Response, scope: ReturnType<typeof nativeReadAuthorization>) {
  if (!isDesktopRuntime() || !scope || !isLocalFirstGetEndpoint(endpoint)) return
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
      ...scope,
    })
  } catch (error) {
    console.warn('[offline-store] No se pudo hidratar SQLite local-first:', error)
  }
}

async function hydrateBinaryResponse(url: string, endpoint: string, response: Response, scope: ReturnType<typeof nativeReadAuthorization>) {
  if (!isDesktopRuntime() || !scope) return
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
      ...scope,
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
  if (isAccountingPeriodProvisionOfflineRequest(input)) throw new Error('La estimación requiere confirmación del servidor. Verifica el resultado con conexión antes de reintentar.')
  if (isAccountingPeriodTransitionOfflineRequest(input)) throw new Error('La transición del período requiere confirmación del servidor. Verifica la transición pendiente con conexión.')
  if (isBudgetDeleteOfflineRequest(input)) throw new Error('La baja del presupuesto requiere confirmación del servidor. Reintenta la baja pendiente con conexión.')
  if (isBudgetUpdateOfflineRequest(input)) throw new Error('La edición del presupuesto requiere confirmación del servidor. Reintenta la edición pendiente con conexión.')
  if (isBudgetCreateOfflineRequest(input)) throw new Error('El alta del presupuesto requiere confirmación del servidor. Reintenta el alta pendiente con conexión.')
  if (isAccountingPeriodCreateOfflineRequest(input)) throw new Error('La creación del período requiere confirmación del servidor. Reintenta la creación pendiente con conexión.')
  if (isAccountingPeriodPreviewOfflineRequest(input)) throw new Error('La validación de cierre requiere una lectura en vivo. Reintenta la consulta con conexión.')
  if (isSensitiveOfflineRequest(input)) throw sensitiveOfflineError()
  if (isDocumentFiscalManualRequest(input)) throw fiscalOfflineError()
  if (isFiscalOfflineRequest(input)) throw fiscalOfflineError()
  if (isPayrollPaymentOfflineRequest(input)) throw new Error(PAYROLL_PAYMENT_OFFLINE_ERROR)
  if (isPayrollApprovalOfflineRequest(input)) throw new Error('La aprobación de planilla requiere confirmación del servidor. Reintenta la aprobación pendiente con conexión.')
  if (isPayrollCreationOfflineRequest(input)) throw new Error('El alta de planilla y su conciliación requieren confirmación del servidor. La solicitud original de alta y cálculo se conserva para continuar o conciliar con conexión.')
  if (isPayrollCalculationOfflineRequest(input)) throw new Error('El cálculo y su conciliación requieren confirmación del servidor. La solicitud original se conserva para un reintento manual con conexión.')
  if (isTreasuryBatchOfflineRequest(input)) throw new Error('El pago masivo requiere confirmación del servidor.')
  if (isCxpPaymentOfflineRequest(input)) throw new Error('El pago requiere confirmación del servidor. Reintenta el pago pendiente con conexión.')
  if (isCxcManualConfirmationRequest(input)) throw new Error('El cobro o ajuste CxC requiere confirmación del servidor. Conserva la solicitud original para reintentar con conexión.')
  if (isSupplierInvoiceOfflineRequest(input)) throw new Error('El documento requiere confirmación del servidor. Reintenta el registro pendiente con conexión.')
  if (isEmployeeRequestOfflineOperation(input)) throw new Error('La solicitud requiere confirmación del servidor. Reintenta la operación pendiente con conexión.')
  if (isPurchaseOrderCreateOfflineRequest(input)) throw new Error('La orden requiere confirmación del servidor. Reintenta la orden pendiente con conexión.')
  if (isPurchaseReceiptOfflineRequest(input)) throw new Error('La recepción requiere confirmación del servidor. Reintenta la recepción pendiente con conexión.')
  if (isProductCreateOfflineRequest(input)) throw new Error('El producto requiere confirmación del servidor. Reintenta el producto pendiente con conexión.')
  if (isDeferredAccrueOfflineRequest(input)) throw new Error('El devengo requiere verificar el asiento y el período pendiente con conexión.')
  if (isDeferredCancelOfflineRequest(input)) throw new Error('La cancelación del diferido requiere confirmación del servidor. Reintenta la cancelación pendiente con conexión.')
  if (isRevaluationRegistrationOfflineRequest(input)) throw new Error('El registro de revaluación requiere confirmación del servidor. Reintenta la misma intención pendiente con conexión.')
  if(isAssetLifecycleManualRequest(input))throw new Error('La edición o baja del activo requiere confirmación del servidor. Se conserva su solicitud original para un reintento manual con conexión.')
  if (isDepreciationBatchOfflineRequest(input)) throw new Error('La depreciación requiere confirmación del servidor. Reintenta el lote original con conexión.')
  if (isAssetCreateOfflineRequest(input)) throw new Error('El alta de activo requiere confirmación del servidor. Reintenta la misma solicitud pendiente con conexión.')
  if (isDeferredCreateOfflineRequest(input)) throw new Error('El alta del diferido requiere confirmación del servidor. Reintenta el alta pendiente con conexión.')
  if (isSalesDeliveryOfflineRequest(input)) throw new Error('La entrega requiere confirmación del servidor. Reintenta la entrega pendiente con conexión.')
  if (isInvoiceGenerationOfflineRequest(input)) throw new Error('La generación del comprobante requiere confirmación del servidor.')
  if (isCashOperationOfflineRequest(input)) throw new Error('La operación de caja requiere confirmación del servidor.')
  if (isInventoryOperationOfflineRequest(input)) throw new Error('La operación de inventario requiere confirmación del servidor.')
  if (isGreOperationOfflineRequest(input)) throw new Error('La acción de GRE requiere confirmación del servidor.')

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
  const scope = nativeActorScope(tenantId)
  if (!scope) return []
  const queue = await listActorOfflineRequests(scope)
  const active = nativeActorScope(tenantId)
  return active?.userId === scope.userId && active.tenantId === scope.tenantId ? queue : []
}

async function listActorOfflineRequests(scope: QueueActorScope): Promise<OfflineQueueItem[]> {
  let queue: OfflineQueueItem[]
  if (isDesktopRuntime()) {
    queue = await invoke<OfflineQueueItem[]>('list_offline_requests', scope)
  } else {
    queue = readJson<OfflineQueueItem[]>(OUTBOX_KEY, [])
  }
  const owned = queue.filter((item) => isQueueOwner(item, scope))
  const sensitiveItems = owned.filter(isNonQueueableOfflineRequest)
  if (isDesktopRuntime()) {
    for (const item of sensitiveItems) {
      try {
        await invoke('delete_offline_request', { id: item.id, ...scope })
      } catch (error) {
        console.warn('[offline-store] No se pudo purgar una configuracion sensible legacy:', error)
      }
    }
  }

  let changed = sensitiveItems.length > 0
  const sanitized = owned.filter((item) => !isNonQueueableOfflineRequest(item)).map((item) => {
    const headers = sanitizePersistedHeaders(item.headers || [])
    changed ||= headers.length !== (item.headers || []).length
    return { ...item, headers }
  })
  if (changed && !isDesktopRuntime()) {
    const byId = new Map(sanitized.map((item) => [item.id, item]))
    writeJson(OUTBOX_KEY, queue.flatMap((item) => (
      !isQueueOwner(item, scope) ? [item] : byId.has(item.id) ? [byId.get(item.id)!] : []
    )))
  }
  return sanitized
}

export async function listLocalIdMappings(): Promise<LocalIdMapping[]> {
  const scope = nativeActorScope()
  if (!scope) return []
  const mappings = await listActorLocalIdMappings(scope)
  const active = nativeActorScope()
  return active?.userId === scope.userId && active.tenantId === scope.tenantId ? mappings : []
}

async function listActorLocalIdMappings(scope: QueueActorScope): Promise<LocalIdMapping[]> {
  if (isDesktopRuntime()) {
    return invoke<LocalIdMapping[]>('list_local_id_mappings', scope)
  }
  return []
}

export async function markOfflineRequestSynced(
  id: string,
  responseStatus: number,
  responseBody?: string | null,
) {
  return markActorOfflineRequestSynced(requiredNativeActorScope(), id, responseStatus, responseBody)
}

async function markActorOfflineRequestSynced(
  scope: QueueActorScope, id: string, responseStatus: number, responseBody?: string | null,
) {
  if (isDesktopRuntime()) {
    await invoke('mark_offline_request_synced', {
      ...scope,
      id,
      responseStatus,
      responseBody: responseBody ?? null,
    })
    return
  }

  const queue = readJson<OfflineQueueItem[]>(OUTBOX_KEY, [])
  if (!queue.some((item) => item.id === id && isQueueOwner(item, scope))) throw new Error('No existe la operación offline para este usuario')
  if (!writeJson(OUTBOX_KEY, queue.map((item) => (
    item.id === id && isQueueOwner(item, scope)
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
  return markActorOfflineRequestFailed(requiredNativeActorScope(), id, error, responseStatus)
}

async function markActorOfflineRequestFailed(scope: QueueActorScope, id: string, error: string, responseStatus?: number | null) {
  if (isDesktopRuntime()) {
    await invoke('mark_offline_request_failed', { id, error, responseStatus: responseStatus ?? null, ...scope })
    return
  }

  const queue = readJson<OfflineQueueItem[]>(OUTBOX_KEY, [])
  if (!queue.some((item) => item.id === id && isQueueOwner(item, scope))) throw new Error('No existe la operación offline para este usuario')
  if (!writeJson(OUTBOX_KEY, queue.map((item) => (
    item.id === id && isQueueOwner(item, scope)
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
  const scope = requiredNativeActorScope()
  if (isDesktopRuntime()) {
    await invoke('delete_offline_request', { id, ...scope })
    return
  }

  const queue = readJson<OfflineQueueItem[]>(OUTBOX_KEY, [])
  if (!queue.some((item) => item.id === id && isQueueOwner(item, scope))) throw new Error('No existe la operación offline para este usuario')
  if (!writeJson(OUTBOX_KEY, queue.filter((item) => item.id !== id || !isQueueOwner(item, scope)))) {
    throw new Error('No se pudo eliminar la operacion offline')
  }
}

export async function getOfflineStatus(tenantId?: string | null): Promise<OfflineStatus> {
  if (isDesktopRuntime()) {
    const rawStatus = await invoke<OfflineStatus>('get_offline_status', nativeActorScope(tenantId) ?? { tenantId: null, userId: null })
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
  userId?: string | null,
  authorizationRevision = cacheAuthorizationRevision(userId),
) {
  if (!tenantId || !userId) return
  if (response.status === 204) return
  const contentType = response.headers.get('Content-Type') || ''
  if (!/application\/json|text\//i.test(contentType)) return

  const body = await response.text().catch(() => '')
  if (!body) return
  if (body.length > CACHE_ENTRY_BODY_LIMIT) return
  if (authorizationRevision !== cacheAuthorizationRevision(userId)) return

  const cache = readJson<ApiCacheEntry[]>(CACHE_KEY, [])
  const entry: ApiCacheEntry = {
    url,
    endpoint,
    tenant_id: tenantId ?? null,
    user_id: userId,
    status: response.status,
    statusText: response.statusText,
    headers: headersToPairs(response.headers),
    body,
    cached_at: now(),
  }

  const next = [
    entry,
    ...cache.filter((item) => item.url !== url || item.tenant_id !== entry.tenant_id || item.user_id !== entry.user_id),
  ].slice(0, CACHE_LIMIT)
  writeJson(CACHE_KEY, next)
}

export async function clearCachedApiResponses(userId?: string | null, tenantId?: string | null) {
  if (!userId) return
  cacheAuthorizationRevisions.set(userId, cacheAuthorizationRevision(userId) + 1)
  const entries = readJson<ApiCacheEntry[]>(CACHE_KEY, [])
  writeJson(CACHE_KEY, Array.isArray(entries)
    ? entries.filter((entry) => entry?.user_id && entry.user_id !== userId)
    : [])
  if (isDesktopRuntime() && tenantId) {
    const scope = { tenantId, userId, authorization: localId() }
    if (!writeJson(`erp.native.read-authorization.${tenantId}.${userId}`, scope.authorization)) throw new Error('No se pudo invalidar la autorización local')
    await invoke('invalidate_local_read_cache', scope)
  }
}

export async function readCachedApiResponse(
  url: string,
  tenantId?: string | null,
  userId?: string | null,
): Promise<Response | null> {
  if (!tenantId || !userId) return null
  const entry = readJson<ApiCacheEntry[]>(CACHE_KEY, []).find(
    (item) => item.url === url && item.tenant_id === tenantId && item.user_id === userId,
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
  // La misma clave viaja en el primer envío y en la cola si se pierde el ACK.
  // Generarla durante el replay no protegería un COMMIT anterior ya confirmado.
  if (isCustomerUpdateRequest(meta.endpoint, method)) {
    const headers = new Headers(init.headers)
    if (!headers.has('Idempotency-Key')) headers.set('Idempotency-Key', localId())
    init = { ...init, headers }
  }
  const authorizationRevision = cacheAuthorizationRevision(meta.userId)
  const nativeScope = nativeReadAuthorization(meta.tenantId, meta.userId)
  const forceOffline = await isOfflineModeEnabled()

  if (forceOffline) {
    const policyError = await nonQueueableOfflineError(meta.endpoint, url, method, init.body)
    if (policyError) throw policyError

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
      const localFirst = await readLocalFirstResponse(meta.endpoint, url, meta.tenantId, meta.userId)
      if (localFirst) return localFirst

      const binary = await readBinaryResponse(meta.endpoint, url, meta.tenantId, meta.userId)
      if (binary) return binary

      const cached = await readCachedApiResponse(url, meta.tenantId, meta.userId)
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
    if (response.status === 401 || response.status === 403) {
      await clearCachedApiResponses(meta.userId, meta.tenantId)
    }
    if (method === 'GET' && response.ok) {
      if (authorizationRevision === cacheAuthorizationRevision(meta.userId)) {
        await hydrateLocalFirstResponse(url, meta.endpoint, response.clone(), nativeScope)
        await hydrateBinaryResponse(url, meta.endpoint, response.clone(), nativeScope)
        await cacheApiResponse(url, meta.endpoint, response.clone(), meta.tenantId, meta.userId, authorizationRevision)
      }
      if (authorizationRevision !== cacheAuthorizationRevision(meta.userId)) {
        return new Response(JSON.stringify({ success: false, message: 'El acceso cambió durante la consulta. Vuelve a consultar los datos.' }), {
          status: 409,
          headers: { 'Content-Type': 'application/json', 'x-erp-authorization-changed': 'true' },
        })
      }
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

    const policyError = await nonQueueableOfflineError(meta.endpoint, url, method, init.body)
    if (policyError) throw policyError

    // Una prueba de conectividad debe informar el fallo en vivo. Encolarla
    // produciría un falso positivo y podría repetir una operación diagnóstica.
    if (isLiveConnectivityTestEndpoint(meta.endpoint)) throw error

    if (isDeferredValidationEndpoint(meta.endpoint)) {
      return deferredValidationResponse(meta.endpoint, init, meta, url, method)
    }

    if (method === 'GET') {
      const localFirst = await readLocalFirstResponse(meta.endpoint, url, meta.tenantId, meta.userId)
      if (localFirst) return localFirst

      const binary = await readBinaryResponse(meta.endpoint, url, meta.tenantId, meta.userId)
      if (binary) return binary

      const cached = await readCachedApiResponse(url, meta.tenantId, meta.userId)
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
  const scope = nativeActorScope(tenantId)
  if (!scope) return []
  const authorizationRevision = cacheAuthorizationRevision(scope.userId)
  const queue = await listActorOfflineRequests(scope)
  const candidates = queue.filter((item) => item.status === 'pending' || item.status === 'failed')
  const results: Array<{ id: string; ok: boolean; status?: number; error?: string }> = []
  let idReplacements = buildLocalIdReplacementMap(await listActorLocalIdMappings(scope))

  for (const item of candidates) {
    const active = nativeActorScope()
    if (!active || active.tenantId !== scope.tenantId || active.userId !== scope.userId
      || authorizationRevision !== cacheAuthorizationRevision(scope.userId)) break
    try {
      const rewrittenEndpoint = item.endpoint
        ? rewriteLocalIdsInEndpoint(item.endpoint, idReplacements)
        : item.endpoint
      const rewrittenUrl = rewriteLocalIdsInEndpoint(item.url, idReplacements)
      const rewrittenBody = backendQueueBody(item, rewriteLocalIdsInBody(item.body, idReplacements))
      if (isDocumentFiscalManualRequest({ ...item, endpoint: rewrittenEndpoint, url: rewrittenUrl })) throw new Error('La firma o el envío fiscal requiere confirmación manual en vivo. Se conserva la solicitud original sin reenviarla automáticamente.')
      if (isCxcManualConfirmationRequest({ ...item, endpoint: rewrittenEndpoint, url: rewrittenUrl })) throw new Error('El cobro o ajuste CxC requiere confirmación manual del servidor. Se conserva la solicitud original sin reenviarla automáticamente.')
      if(isAssetLifecycleManualRequest({...item,endpoint:rewrittenEndpoint,url:rewrittenUrl}))throw new Error('La edición o baja del activo requiere confirmación manual. Se conserva la solicitud original sin reenviarla automáticamente.')
      if (isDepreciationBatchOfflineRequest({ ...item, endpoint: rewrittenEndpoint, url: rewrittenUrl })) throw new Error('La depreciación requiere confirmación manual del servidor. Se conserva la solicitud original sin reenviarla automáticamente.')
      if (isPayrollApprovalOfflineRequest({ ...item, endpoint: rewrittenEndpoint, url: rewrittenUrl, body: rewrittenBody })) throw new Error('La aprobación de planilla requiere confirmación manual del servidor. Se conserva el pendiente para conciliación.')
      if (isPayrollCreationOfflineRequest({ ...item, endpoint: rewrittenEndpoint, url: rewrittenUrl })) throw new Error('El alta de planilla y su conciliación requieren confirmación del servidor. La solicitud original de alta y cálculo se conserva para continuar o conciliar con conexión.')
      if (isPayrollCalculationOfflineRequest({ ...item, endpoint: rewrittenEndpoint, url: rewrittenUrl })) throw new Error('El cálculo y su conciliación requieren confirmación manual del servidor. Se conserva el pendiente para conciliación.')
      const targetUrl = rewrittenEndpoint ? buildApiUrl(rewrittenEndpoint) : rewrittenUrl
      const formDataBody = rewrittenBody ? serializedFormDataToBody(rewrittenBody) : null
      const headers = pairsToHeaders(item.headers)
      if (isCustomerUpdateRequest(item.endpoint, item.method) && !headers.has('Idempotency-Key')) {
        throw new Error('La edición antigua no tiene clave de operación. Concilia el resultado con el servidor antes de reenviarla; se conserva la solicitud original.')
      }
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
        // El ACK pertenece a la solicitud que salió. Un cambio de sesión no
        // puede moverlo a la cola del nuevo actor ni provocar otro envío.
        await markActorOfflineRequestSynced(scope, item.id, response.status, responseBody)
        idReplacements = buildLocalIdReplacementMap(await listActorLocalIdMappings(scope))
        results.push({ id: item.id, ok: true, status: response.status })
      } else {
        const error = logicalError || responseBody || `HTTP ${response.status}`
        await markActorOfflineRequestFailed(scope, item.id, error, response.status)
        results.push({ id: item.id, ok: false, status: response.status, error })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error de sincronizacion offline'
      await markActorOfflineRequestFailed(scope, item.id, message)
      results.push({ id: item.id, ok: false, error: message })
    }
  }

  return results
}

function isCustomerUpdateRequest(endpoint: string, method: string) {
  return method.toUpperCase() === 'PUT' && /(?:^|\/)api\/ventas\/clientes\/[^/]+$/.test(offlineEndpointPath(endpoint))
}

function backendQueueBody(item: OfflineQueueItem, body: string | null | undefined) {
  const nativeCustomer = item.headers.some(header => header.name.toLowerCase() === 'x-erp-local-entity-type' && header.value === 'customer')
  const customer = nativeCustomer && /^\/api\/ventas\/clientes(?:\/|$)/.test(localFirstEndpoint(item.endpoint))
  const payrollPayment = isPayrollPaymentOfflineRequest(item) || isTreasuryBatchOfflineRequest(item)
  if ((!customer && !payrollPayment) || !body) return body
  try {
    const payload = JSON.parse(body)
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return body
    // Compatibilidad con pendientes creados por versiones anteriores: conservar
    // la intención durable y enviar sólo el contrato admitido por el DTO.
    for (const field of ['local_id', 'external_id', 'offline_entity_type']) delete payload[field]
    // Una intención de pago antigua se confirma con su misma clave; quitarla
    // convertiría la recuperación explícita en otra operación.
    if (customer) delete payload.idempotency_key
    return JSON.stringify(payload)
  } catch { return body }
}

export async function refreshLocalFirstSnapshots(
  endpoints: string[] = DEFAULT_LOCAL_FIRST_SNAPSHOT_ENDPOINTS,
  headers?: HeadersInit,
  tenantId?: string | null,
  userId?: string | null,
) {
  const results: Array<{ endpoint: string; ok: boolean; status?: number; error?: string }> = []
  // Scope local obtenido de la sesión; el servidor sigue resolviendo el tenant
  // desde el JWT. Nunca almacenar snapshots de sesión bajo un scope anónimo.
  if (!tenantId || !userId) {
    return endpoints.map((endpoint) => ({ endpoint, ok: false, error: 'No hay empresa o usuario activos' }))
  }
  if (await isOfflineModeEnabled()) {
    return endpoints.map((endpoint) => ({
      endpoint,
      ok: false,
      error: 'Modo offline activo',
    }))
  }

  for (const endpoint of endpoints) {
    try {
      const authorizationRevision = cacheAuthorizationRevision(userId)
      const nativeScope = nativeReadAuthorization(tenantId, userId)
      const url = buildApiUrl(endpoint)
      const response = await fetch(url, {
        method: 'GET',
        headers,
        credentials: 'include',
        mode: 'cors',
        cache: 'no-store',
      })
      if (response.status === 401 || response.status === 403) await clearCachedApiResponses(userId, tenantId)
      if (response.ok) {
        await hydrateLocalFirstResponse(url, endpoint, response.clone(), nativeScope)
        await hydrateBinaryResponse(url, endpoint, response.clone(), nativeScope)
        await cacheApiResponse(url, endpoint, response.clone(), tenantId, userId, authorizationRevision)
      }
      results.push(authorizationRevision !== cacheAuthorizationRevision(userId) && response.ok
        ? { endpoint, ok: false, error: 'El acceso cambió durante la consulta. Vuelve a consultar los datos.' }
        : { endpoint, ok: response.ok, status: response.status })
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
