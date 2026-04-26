/**
 * Shared types for TenantContext
 * Export these types for use in other components
 */

export interface Tenant {
  id: string
  nombre: string
  ruc?: string
  email: string
  pais: string
  moneda: string
  estado: 'ACTIVO' | 'INACTIVO' | 'SUSPENDIDO' | 'PRUEBA'
}

export interface User {
  id: string
  email: string
  nombre: string
  apellido?: string
  tenant_id: string
  is_super_admin: boolean
  roles: string[]
}

export interface TenantContextValue {
  tenant: Tenant | null
  user: User | null
  isSuperAdmin: boolean
  loading: boolean
  error: string | null
  switchTenant: (tenantId: string) => Promise<void>
  refreshTenant: () => Promise<void>
}

export interface JwtPayload {
  sub: string
  email: string
  username?: string
  tenant_id: string
  tenant_name?: string
  roles: string[]
  is_super_admin: boolean
  iat: number
  exp: number
}
