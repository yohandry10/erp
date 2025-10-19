'use client'

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react'
import { customAuth } from '@/lib/auth-service'
import type { Tenant, User, TenantContextValue, JwtPayload } from './types'

// Create context
const TenantContext = createContext<TenantContextValue | undefined>(undefined)

// Helper function to decode JWT
function decodeJWT(token: string): JwtPayload | null {
  try {
    const base64Url = token.split('.')[1]
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    )
    return JSON.parse(jsonPayload)
  } catch (error) {
    console.error('Error decoding JWT:', error)
    return null
  }
}

// Provider component
export function TenantProvider({ children }: { children: ReactNode }) {
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Extract tenant and user from custom auth session
  const extractFromToken = useCallback(async (session: { access_token: string; user: any } | null) => {
    if (!session?.access_token) {
      setUser(null)
      setTenant(null)
      setLoading(false)
      return
    }

    try {
      const payload = decodeJWT(session.access_token)
      
      if (!payload) {
        throw new Error('Invalid JWT token')
      }

      // Set user from JWT payload
      const userData: User = {
        id: payload.sub,
        email: payload.email,
        nombre: payload.username || payload.email.split('@')[0],
        tenant_id: payload.tenant_id,
        is_super_admin: payload.is_super_admin || false,
        roles: payload.roles || [],
      }
      setUser(userData)

      // Fetch tenant details if tenant_id exists
      if (payload.tenant_id) {
        await fetchTenantDetails(payload.tenant_id)
      } else {
        setTenant(null)
      }

      setError(null)
    } catch (err) {
      console.error('Error extracting tenant from token:', err)
      setError(err instanceof Error ? err.message : 'Failed to extract tenant information')
      setUser(null)
      setTenant(null)
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch tenant details from API
  const fetchTenantDetails = async (tenantId: string) => {
    try {
      const { data: { session } } = await customAuth.getSession()
      
      if (!session?.access_token) {
        throw new Error('No active session')
      }

      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002'
      const response = await fetch(`${API_BASE_URL}/api/tenants/${tenantId}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        // If tenant endpoint doesn't exist yet, create a minimal tenant object
        console.warn('Tenant endpoint not available, using minimal tenant data')
        setTenant({
          id: tenantId,
          nombre: 'Default Tenant',
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
      console.error('Error fetching tenant details:', err)
      // Set minimal tenant data on error
      setTenant({
        id: tenantId,
        nombre: 'Default Tenant',
        email: '',
        pais: 'PE',
        moneda: 'PEN',
        estado: 'ACTIVO',
      })
    }
  }

  // Refresh tenant data
  const refreshTenant = useCallback(async () => {
    setLoading(true)
    try {
      const { data: { session } } = await customAuth.getSession()
      await extractFromToken(session)
    } catch (err) {
      console.error('Error refreshing tenant:', err)
      setError(err instanceof Error ? err.message : 'Failed to refresh tenant')
    } finally {
      setLoading(false)
    }
  }, [extractFromToken])

  // Switch tenant (super-admin only)
  const switchTenant = useCallback(async (targetTenantId: string) => {
    if (!user?.is_super_admin) {
      throw new Error('Only super-admins can switch tenants')
    }

    setLoading(true)
    setError(null)

    try {
      const { data: { session } } = await customAuth.getSession()
      
      if (!session?.access_token) {
        throw new Error('No active session')
      }

      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002'
      const response = await fetch(`${API_BASE_URL}/auth/switch-tenant`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tenant_id: targetTenantId }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || 'Failed to switch tenant')
      }

      const result = await response.json()
      const newToken = result.access_token || result.token

      if (!newToken) {
        throw new Error('No token received from switch-tenant endpoint')
      }

      // Update the session with new token
      await customAuth.setSession({
        access_token: newToken,
        refresh_token: session.refresh_token || '',
      })

      // Extract new tenant context from new token
      const newSession = await customAuth.getSession()
      await extractFromToken(newSession.data.session)

      // Reload application state
      if (typeof window !== 'undefined') {
        window.location.reload()
      }
    } catch (err) {
      console.error('Error switching tenant:', err)
      setError(err instanceof Error ? err.message : 'Failed to switch tenant')
      throw err
    } finally {
      setLoading(false)
    }
  }, [user, extractFromToken])

  // Initialize on mount and listen to auth changes
  useEffect(() => {
    // Get initial session from custom auth
    customAuth.getSession().then(({ data: { session } }) => {
      extractFromToken(session)
    })

    // Listen to auth state changes
    const { data: { subscription } } = customAuth.onAuthStateChange((_event, session) => {
      extractFromToken(session)
    })

    return () => subscription.unsubscribe()
  }, [extractFromToken])

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

// Custom hook to use tenant context
export function useTenant() {
  const context = useContext(TenantContext)
  if (context === undefined) {
    throw new Error('useTenant must be used within a TenantProvider')
  }
  return context
}
