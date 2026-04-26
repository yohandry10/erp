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
    // Si no hay sesión, limpiar estado y salir
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

      // Validar expiración del token
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        console.log('ℹ️ Token expirado, limpiando sesión')
        await customAuth.signOut()
        setUser(null)
        setTenant(null)
        setLoading(false)
        return
      }

      // Validar que el token tenga tenant_id
      if (!payload.tenant_id) {
        console.warn('⚠️ Token sin tenant_id - usuario no puede acceder al sistema')
        await customAuth.signOut()
        setUser(null)
        setTenant(null)
        setLoading(false)
        return
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

      // Set tenant from JWT payload (minimal data for regular users)
      // Only super-admins need to fetch full tenant details via API
      // IMPORTANTE: Establecer datos mínimos primero para evitar que el componente quede sin tenant
      const minimalTenant: Tenant = {
        id: payload.tenant_id,
        nombre: payload.tenant_name || 'Mi Empresa',
        email: payload.email,
        pais: 'PE',
        moneda: 'PEN',
        estado: 'ACTIVO',
      }
      setTenant(minimalTenant)
      
      if (payload.is_super_admin) {
        // Super-admins can fetch full tenant details (opcional, no bloquea si falla)
        // Hacer esto de forma no bloqueante - si falla, ya tenemos datos mínimos
        fetchTenantDetails(payload.tenant_id, session.access_token).catch((fetchError) => {
          // No hacer nada - ya tenemos datos mínimos establecidos arriba
          console.warn('⚠️ [TenantContext] No se pudo obtener detalles completos del tenant, usando datos mínimos:', fetchError)
        })
      }

      setError(null)
    } catch (err) {
      console.error('❌ [TenantContext] Error extracting tenant from token:', err)
      
      const errorMessage = err instanceof Error ? err.message : 'Failed to extract tenant information'
      setError(errorMessage)
      
      // Solo hacer signOut si el error indica que la sesión es realmente inválida
      // (por ejemplo, JWT malformado, token expirado, etc.)
      // NO limpiar sesión por errores de red o 404 en fetchTenantDetails
      if (errorMessage.includes('JWT') || errorMessage.includes('expired') || errorMessage.includes('invalid token') || errorMessage.includes('Token')) {
        console.warn('⚠️ [TenantContext] Sesión inválida detectada (error crítico), limpiando...')
        await customAuth.signOut()
        setUser(null)
        setTenant(null)
      } else {
        // Para otros errores (red, 404, etc.), usar datos mínimos y continuar
        // NO limpiar la sesión por errores no críticos
        console.warn('⚠️ [TenantContext] Error no crítico, usando datos mínimos del tenant')
        console.warn('⚠️ [TenantContext] NO se limpiará la sesión - esto permite que el usuario continúe')
        
        // Intentar establecer datos mínimos si tenemos información del payload
        // (puede que payload esté disponible aunque haya habido un error en fetchTenantDetails)
        try {
          if (session?.access_token) {
            // Intentar decodificar el token de nuevo para obtener datos mínimos
            const parts = session.access_token.split('.')
            if (parts.length === 3) {
              const decoded = JSON.parse(atob(parts[1]))
              if (decoded.tenant_id) {
                setTenant({
                  id: decoded.tenant_id,
                  nombre: 'Mi Empresa',
                  email: decoded.email || '',
                  pais: 'PE',
                  moneda: 'PEN',
                  estado: 'ACTIVO',
                })
                setUser({
                  id: decoded.sub,
                  email: decoded.email,
                  nombre: decoded.username || decoded.email?.split('@')[0] || 'Usuario',
                  tenant_id: decoded.tenant_id,
                  is_super_admin: decoded.is_super_admin || false,
                  roles: decoded.roles || [],
                })
              }
            }
          }
        } catch (decodeError) {
          console.error('❌ [TenantContext] Error decodificando token para datos mínimos:', decodeError)
          // Si no podemos obtener datos mínimos, entonces sí hacer signOut
          await customAuth.signOut()
          setUser(null)
          setTenant(null)
        }
      }
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch tenant details from API (solo para super-admins con sesión activa)
  const fetchTenantDetails = async (tenantId: string, accessToken: string) => {
    try {
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002'
      const response = await fetch(`${API_BASE_URL}/api/tenants/${tenantId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        // Si es 401, el token es inválido - usar datos mínimos sin warning
        if (response.status === 401) {
          console.log('ℹ️ Token inválido o expirado, usando datos mínimos del tenant')
        } else {
          console.warn(`⚠️ No se pudo obtener detalles del tenant ${tenantId} (${response.status}), usando datos mínimos`)
        }
        
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
      // Error de red u otro - usar datos mínimos silenciosamente
      console.log('ℹ️ No se pudo conectar con el servidor, usando datos mínimos del tenant')
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
      const refreshToken = (session as any)?.refresh_token || ''
      await customAuth.setSession({
        access_token: newToken,
        refresh_token: refreshToken,
      })

      // Extract new tenant context from new token
      const newSession = await customAuth.getSession()
      await extractFromToken(newSession.data.session)

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
