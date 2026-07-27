'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTenant } from '@/contexts/TenantContext'
import { useAuth } from '@/contexts/AuthContext'
import { useApi } from './use-api'

interface Permission {
  id: string
  tenant_id: string
  modulo: string
  accion: string
  recurso: string | null
  descripcion?: string
}

const READ_EQUIVALENTS = ['read', 'ver', 'view', 'listar', 'consultar']
const WRITE_EQUIVALENTS = [
  'write',
  'crear',
  'create',
  'editar',
  'update',
  'actualizar',
  'modificar',
  'registrar',
  'generar',
  'emitir',
  'convertir_pedido',
  'generar_factura',
  'generar_nota_credito',
  'preparar',
  'despachar',
  'recepcionar',
  'resolver',
  'validar_ruc',
]
const DELETE_EQUIVALENTS = ['delete', 'eliminar', 'anular', 'cancelar']
const APPROVE_EQUIVALENTS = ['approve', 'aprobar', 'autorizar']
const MANAGE_EQUIVALENTS = ['manage', 'administrar', 'configurar']

const ACTION_EQUIVALENCE: Record<string, string[]> = {
  read: READ_EQUIVALENTS,
  ver: READ_EQUIVALENTS,
  view: READ_EQUIVALENTS,
  listar: READ_EQUIVALENTS,
  consultar: READ_EQUIVALENTS,
  write: WRITE_EQUIVALENTS,
  crear: WRITE_EQUIVALENTS,
  create: WRITE_EQUIVALENTS,
  editar: WRITE_EQUIVALENTS,
  update: WRITE_EQUIVALENTS,
  actualizar: WRITE_EQUIVALENTS,
  modificar: WRITE_EQUIVALENTS,
  registrar: WRITE_EQUIVALENTS,
  generar: WRITE_EQUIVALENTS,
  emitir: WRITE_EQUIVALENTS,
  convertir_pedido: WRITE_EQUIVALENTS,
  generar_factura: WRITE_EQUIVALENTS,
  generar_nota_credito: WRITE_EQUIVALENTS,
  preparar: WRITE_EQUIVALENTS,
  despachar: WRITE_EQUIVALENTS,
  recepcionar: WRITE_EQUIVALENTS,
  resolver: WRITE_EQUIVALENTS,
  validar_ruc: WRITE_EQUIVALENTS,
  delete: DELETE_EQUIVALENTS,
  eliminar: DELETE_EQUIVALENTS,
  anular: DELETE_EQUIVALENTS,
  cancelar: DELETE_EQUIVALENTS,
  approve: APPROVE_EQUIVALENTS,
  aprobar: APPROVE_EQUIVALENTS,
  autorizar: APPROVE_EQUIVALENTS,
  manage: MANAGE_EQUIVALENTS,
  administrar: MANAGE_EQUIVALENTS,
  configurar: MANAGE_EQUIVALENTS,
}

const normalize = (value?: string | null) => value?.trim().toLowerCase() ?? ''
const normalizeResource = (value?: string | null) => {
  const normalized = normalize(value)
  return normalized && normalized !== '__global__' ? normalized : '__global__'
}

const matchesAction = (permissionAction: string, requestedAction: string) => {
  const normalizedRequested = normalize(requestedAction)
  const normalizedPermission = normalize(permissionAction)
  if (!normalizedRequested || !normalizedPermission) {
    return false
  }

  const equivalents =
    ACTION_EQUIVALENCE[normalizedRequested] || [normalizedRequested]
  return equivalents.includes(normalizedPermission)
}

const matchesResource = (
  permissionResource: string | null | undefined,
  requestedResource?: string
) => {
  const normalizedPermission = normalizeResource(permissionResource)
  const normalizedRequested = normalizeResource(requestedResource ?? '')

  if (normalizedRequested === '__global__') {
    // Para recursos globales aceptamos permisos globales o comodín
    return (
      normalizedPermission === '__global__' || normalizedPermission === '*'
    )
  }

  if (normalizedPermission === '*' || normalizedPermission === normalizedRequested) {
    return true
  }

  // Si el permiso es global pero se solicita un recurso específico,
  // asumimos que todavía aplica (permiso amplio concedido).
  if (normalizedPermission === '__global__') {
    return true
  }

  return false
}

// Cache for permissions with TTL
interface PermissionCache {
  permissions: Permission[]
  timestamp: number
}

const CACHE_TTL = 5 * 60 * 1000 // 5 minutes
const OFFLINE_CACHE_TTL = 24 * 60 * 60 * 1000 // 24 horas para continuidad offline
const SENSITIVE_OFFLINE_CACHE_TTL = 8 * 60 * 60 * 1000 // ventana corta para acciones sensibles
const PERMISSION_STORAGE_KEY = 'erp.permissions.snapshot'
const permissionCache = new Map<string, PermissionCache>()
const SENSITIVE_ACTIONS = new Set([
  ...WRITE_EQUIVALENTS,
  ...DELETE_EQUIVALENTS,
  ...APPROVE_EQUIVALENTS,
  ...MANAGE_EQUIVALENTS,
])

// Track in-flight requests to prevent duplicate API calls
const pendingRequests = new Map<string, Promise<Permission[]>>()

function readStoredPermissionCache(cacheKey: string): PermissionCache | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(PERMISSION_STORAGE_KEY)
    const all = raw ? JSON.parse(raw) as Record<string, PermissionCache> : {}
    const cached = all[cacheKey]
    if (!cached || !Array.isArray(cached.permissions)) return null
    return cached
  } catch {
    return null
  }
}

function writeStoredPermissionCache(cacheKey: string, cache: PermissionCache) {
  if (typeof window === 'undefined') return
  try {
    const raw = window.localStorage.getItem(PERMISSION_STORAGE_KEY)
    const all = raw ? JSON.parse(raw) as Record<string, PermissionCache> : {}
    all[cacheKey] = cache
    window.localStorage.setItem(PERMISSION_STORAGE_KEY, JSON.stringify(all))
  } catch {
    /* cache offline best-effort */
  }
}

function getUsableStoredPermissions(cacheKey: string, requestedAction?: string) {
  const cached = readStoredPermissionCache(cacheKey)
  if (!cached) return null
  const normalizedAction = normalize(requestedAction)
  const ttl = normalizedAction && SENSITIVE_ACTIONS.has(normalizedAction)
    ? SENSITIVE_OFFLINE_CACHE_TTL
    : OFFLINE_CACHE_TTL
  if ((Date.now() - cached.timestamp) > ttl) return null
  permissionCache.set(cacheKey, cached)
  return cached.permissions
}

/**
 * Hook to check if the current user has a specific permission
 * @param modulo - Module name (e.g., 'ventas', 'compras', 'inventario')
 * @param accion - Action name (e.g., 'create', 'read', 'update', 'delete', 'export')
 * @param recurso - Resource name (e.g., 'clientes', 'productos', 'facturas')
 * @returns Object with hasPermission boolean and loading state
 */
export function usePermission(modulo: string, accion: string, recurso: string) {
  const [hasPermission, setHasPermission] = useState<boolean>(false)
  const [loading, setLoading] = useState<boolean>(true)
  const { user, tenant, isSuperAdmin } = useTenant()
  const { loading: authLoading } = useAuth()
  const { get } = useApi({ showErrorToast: false })

  const checkPermission = useCallback(async () => {
    // Super-admins have all permissions
    if (isSuperAdmin) {
      setHasPermission(true)
      setLoading(false)
      return
    }

    if (authLoading) {
      setLoading(true)
      return
    }

    // No user or tenant means no permission
    if (!user || !tenant) {
      setHasPermission(false)
      setLoading(false)
      return
    }

    // Empty permission strings mean no specific permission required
    if (!modulo && !accion && !recurso) {
      setHasPermission(true)
      setLoading(false)
      return
    }

    try {
      setLoading(true)

      // Check cache first
      const cacheKey = `${user.id}:${tenant.id}`
      const cached = permissionCache.get(cacheKey)
      const now = Date.now()

      let userPermissions: Permission[]

      if (cached && (now - cached.timestamp) < CACHE_TTL) {
        // Use cached permissions
        userPermissions = cached.permissions
      } else {
        // Check if there's already a pending request for this user
        const pendingRequest = pendingRequests.get(cacheKey)
        if (pendingRequest) {
          // Wait for the existing request instead of making a new one
          userPermissions = await pendingRequest
        } else {
          // Create new request and track it
          const fetchPromise = (async () => {
            console.log(`[usePermission] Fetching permissions for user ${user.id}`)
            const response = await get('/usuarios-sistema/me/permissions')

            if (!response) {
              console.warn(`[usePermission] No response from permissions API for user ${user.id}`)
              return getUsableStoredPermissions(cacheKey, accion) || []
            }

            const perms = Array.isArray(response) ? response : (response.data || [])
            console.log(`[usePermission] Fetched ${perms.length} permissions for user ${user.id}`)

            // Update cache
            const nextCache = {
              permissions: perms,
              timestamp: Date.now(),
            }
            permissionCache.set(cacheKey, nextCache)
            writeStoredPermissionCache(cacheKey, nextCache)

            return perms
          })()

          pendingRequests.set(cacheKey, fetchPromise)

          try {
            userPermissions = await fetchPromise
          } finally {
            // Clean up pending request after completion
            pendingRequests.delete(cacheKey)
          }
        }
      }

      const normalizedModule = normalize(modulo)
      const normalizedAction = normalize(accion)
      const normalizedResource = normalizeResource(recurso)

      // Check if user has the required permission (with alias support)
      const hasRequiredPermission = userPermissions.some((permission) => {
        if (normalize(permission.modulo) !== normalizedModule) {
          return false
        }

        if (!matchesAction(permission.accion, normalizedAction)) {
          return false
        }

        return matchesResource(permission.recurso, normalizedResource)
      })

      setHasPermission(hasRequiredPermission)
    } catch (error) {
      console.error('Error checking permission:', error)
      const cacheKey = user && tenant ? `${user.id}:${tenant.id}` : null
      const storedPermissions = cacheKey ? getUsableStoredPermissions(cacheKey, accion) : null
      if (storedPermissions) {
        const normalizedModule = normalize(modulo)
        const normalizedAction = normalize(accion)
        const normalizedResource = normalizeResource(recurso)
        setHasPermission(storedPermissions.some((permission) => (
          normalize(permission.modulo) === normalizedModule
          && matchesAction(permission.accion, normalizedAction)
          && matchesResource(permission.recurso, normalizedResource)
        )))
      } else {
        setHasPermission(false)
      }
    } finally {
      setLoading(false)
    }
  }, [user, tenant, isSuperAdmin, authLoading, modulo, accion, recurso, get])

  useEffect(() => {
    checkPermission()
  }, [checkPermission])

  return { hasPermission, loading }
}

/**
 * Hook to get all permissions for the current user
 * @returns Object with permissions array and loading state
 */
export function useUserPermissions() {
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const { user, tenant, isSuperAdmin } = useTenant()
  const { loading: authLoading } = useAuth()
  const { get } = useApi({ showErrorToast: false })

  const fetchPermissions = useCallback(async () => {
    // Super-admins have all permissions (return empty array, check will be done elsewhere)
    if (isSuperAdmin) {
      setPermissions([])
      setLoading(false)
      return
    }

    if (authLoading) {
      setLoading(true)
      return
    }

    if (!user || !tenant) {
      setPermissions([])
      setLoading(false)
      return
    }

    try {
      setLoading(true)

      // Check cache first
      const cacheKey = `${user.id}:${tenant.id}`
      const cached = permissionCache.get(cacheKey)
      const now = Date.now()

      if (cached && (now - cached.timestamp) < CACHE_TTL) {
        setPermissions(cached.permissions)
        setLoading(false)
        return
      }

      // Check if there's already a pending request
      const pendingRequest = pendingRequests.get(cacheKey)
      let userPermissions: Permission[]

      if (pendingRequest) {
        userPermissions = await pendingRequest
      } else {
        // Create new request
        const fetchPromise = (async () => {
          const response = await get('/usuarios-sistema/me/permissions')
          if (!response) return getUsableStoredPermissions(cacheKey) || []
          const perms = Array.isArray(response) ? response : (response.data || [])
          const nextCache = { permissions: perms, timestamp: Date.now() }
          permissionCache.set(cacheKey, nextCache)
          writeStoredPermissionCache(cacheKey, nextCache)
          return perms
        })()

        pendingRequests.set(cacheKey, fetchPromise)
        try {
          userPermissions = await fetchPromise
        } finally {
          pendingRequests.delete(cacheKey)
        }
      }

      setPermissions(userPermissions)
    } catch (error) {
      console.error('Error fetching permissions:', error)
      const storedPermissions = getUsableStoredPermissions(`${user.id}:${tenant.id}`)
      setPermissions(storedPermissions || [])
    } finally {
      setLoading(false)
    }
  }, [user, tenant, isSuperAdmin, authLoading, get])

  useEffect(() => {
    fetchPermissions()
  }, [fetchPermissions])

  return { permissions, loading, refetch: fetchPermissions }
}

/**
 * Clear permission cache for a specific user or all users
 * @param userId - Optional user ID to clear cache for specific user
 */
export function clearPermissionCache(userId?: string) {
  if (userId) {
    // Clear cache for specific user (all tenants)
    for (const key of permissionCache.keys()) {
      if (key.startsWith(`${userId}:`)) {
        permissionCache.delete(key)
      }
    }
  } else {
    // Clear all cache
    permissionCache.clear()
  }
}
