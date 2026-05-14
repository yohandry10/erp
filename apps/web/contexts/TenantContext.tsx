'use client'

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react'
import { customAuth } from '@/lib/auth-service'
import type { Tenant, User, TenantContextValue } from './types'
import type { Session } from '@/lib/auth-service'

const TenantContext = createContext<TenantContextValue | undefined>(undefined)

function buildMinimalTenantFromUser(user: User): Tenant {
  return {
    id: user.tenant_id,
    nombre: user.nombre || 'Mi Empresa',
    email: user.email,
    pais: 'PE',
    moneda: 'PEN',
    estado: 'ACTIVO',
  }
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTenantDetails = async (tenantId: string) => {
    try {
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002'
      const response = await fetch(`${API_BASE_URL}/api/tenants/${tenantId}`, {
        credentials: 'include',
      })

      if (!response.ok) {
        setTenant({
          id: tenantId,
          nombre: 'Mi Empresa',
          email: '',
          pais: 'PE',
          moneda: 'PEN',
          estado: 'ACTIVO',
        })
        return
      }

      const tenantData = await response.json()
      setTenant(tenantData.data || tenantData)
    } catch (err) {
      setTenant({
        id: tenantId,
        nombre: 'Mi Empresa',
        email: '',
        pais: 'PE',
        moneda: 'PEN',
        estado: 'ACTIVO',
      })
    }
  }

  const extractFromSession = useCallback(async (session: Session | null) => {
    if (!session?.user) {
      setUser(null)
      setTenant(null)
      setLoading(false)
      return
    }

    const currentUser = session.user

    if (!currentUser.tenant_id) {
      await customAuth.signOut()
      setUser(null)
      setTenant(null)
      setLoading(false)
      return
    }

    setUser({
      ...currentUser,
      nombre: currentUser.nombre || currentUser.email?.split('@')[0] || 'Usuario',
    })

    const minimalTenant = buildMinimalTenantFromUser(currentUser)
    setTenant(minimalTenant)

    if (currentUser.is_super_admin) {
      fetchTenantDetails(currentUser.tenant_id).catch((fetchError) => {
        console.warn('⚠️ [TenantContext] No se pudo obtener detalles completos del tenant:', fetchError)
      })
    }

    setError(null)
    setLoading(false)
  }, [])

  const refreshTenant = useCallback(async () => {
    setLoading(true)
    try {
      const { data: { session }, error } = await customAuth.getSession()
      if (error) {
        throw error
      }
      await extractFromSession(session)
    } catch (err) {
      console.error('Error refreshing tenant:', err)
      setError(err instanceof Error ? err.message : 'Failed to refresh tenant')
      setLoading(false)
    }
  }, [extractFromSession])

  const switchTenant = useCallback(async (targetTenantId: string) => {
    if (!user?.is_super_admin) {
      throw new Error('Only super-admins can switch tenants')
    }

    setLoading(true)
    setError(null)

    try {
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002'
      const response = await fetch(`${API_BASE_URL}/api/auth/switch-tenant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ targetTenantId }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || 'Failed to switch tenant')
      }

      await refreshTenant()
    } catch (err) {
      console.error('Error switching tenant:', err)
      setError(err instanceof Error ? err.message : 'Failed to switch tenant')
      throw err
    } finally {
      setLoading(false)
    }
  }, [user, refreshTenant])

  useEffect(() => {
    customAuth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        setLoading(false)
        setError(error.message)
        return
      }
      extractFromSession(session)
    })

    const { data: { subscription } } = customAuth.onAuthStateChange((_event, session) => {
      extractFromSession(session)
    })

    return () => subscription.unsubscribe()
  }, [extractFromSession])

  const value: TenantContextValue = {
    tenant,
    user,
    isSuperAdmin: user?.is_super_admin || false,
    loading,
    error,
    switchTenant,
    refreshTenant,
  }

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
}

export function useTenant() {
  const context = useContext(TenantContext)
  if (context === undefined) {
    throw new Error('useTenant must be used within a TenantProvider')
  }
  return context
}
