'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTenant } from '@/contexts/TenantContext'
import { useApi } from './use-api'

interface Permission {
  id: string
  tenant_id: string
  modulo: string
  accion: string
  recurso: string
  descripcion?: string
}

// Cache for permissions with TTL
interface PermissionCache {
  permissions: Permission[]
  timestamp: number
}

const CACHE_TTL = 5 * 60 * 1000 // 5 minutes
const permissionCache = new Map<string, PermissionCache>()

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
  const { get } = useApi({ showErrorToast: false })

  const checkPermission = useCallback(async () => {
    // Super-admins have all permissions
    if (isSuperAdmin) {
      setHasPermission(true)
      setLoading(false)
      return
    }

    // No user or tenant means no permission
    if (!user || !tenant) {
      setHasPermission(false)
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
        // Fetch permissions from API
        const response = await get(`/usuarios-sistema/${user.id}/permissions`)
        
        if (!response) {
          setHasPermission(false)
          setLoading(false)
          return
        }

        userPermissions = Array.isArray(response) ? response : (response.data || [])

        // Update cache
        permissionCache.set(cacheKey, {
          permissions: userPermissions,
          timestamp: now,
        })
      }

      // Check if user has the required permission
      const hasRequiredPermission = userPermissions.some(
        (permission) =>
          permission.modulo === modulo &&
          permission.accion === accion &&
          permission.recurso === recurso
      )

      setHasPermission(hasRequiredPermission)
    } catch (error) {
      console.error('Error checking permission:', error)
      setHasPermission(false)
    } finally {
      setLoading(false)
    }
  }, [user, tenant, isSuperAdmin, modulo, accion, recurso, get])

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
  const { get } = useApi({ showErrorToast: false })

  const fetchPermissions = useCallback(async () => {
    // Super-admins have all permissions (return empty array, check will be done elsewhere)
    if (isSuperAdmin) {
      setPermissions([])
      setLoading(false)
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

      // Fetch from API
      const response = await get(`/usuarios-sistema/${user.id}/permissions`)
      
      if (!response) {
        setPermissions([])
        setLoading(false)
        return
      }

      const userPermissions = Array.isArray(response) ? response : (response.data || [])
      setPermissions(userPermissions)

      // Update cache
      permissionCache.set(cacheKey, {
        permissions: userPermissions,
        timestamp: now,
      })
    } catch (error) {
      console.error('Error fetching permissions:', error)
      setPermissions([])
    } finally {
      setLoading(false)
    }
  }, [user, tenant, isSuperAdmin, get])

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
