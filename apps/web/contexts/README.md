# TenantContext

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `frontend_local`.
>
> Leer tambien: `docs/START_HERE.md`, `docs/00_coordination/FLOW_STATUS.md`.
>
> Regla: si este documento contradice codigo verificado o docs canonicos, prevalecen codigo actual + `START_HERE` + `CURRENT_STATE` + `FLOW_STATUS`.
<!-- DOC-NAV:END -->

The TenantContext provides tenant and user information throughout the application, extracted from JWT tokens. It supports multi-tenant isolation and super-admin tenant switching.

## Features

- **Automatic JWT Parsing**: Extracts tenant_id, user info, and roles from JWT tokens
- **Tenant Information**: Fetches and caches tenant details
- **Super-Admin Support**: Allows super-admins to switch between tenants
- **Session Management**: Automatically updates when authentication state changes
- **Error Handling**: Graceful fallbacks when tenant API is not available

## Usage

### Basic Usage

```tsx
'use client'

import { useTenant } from '@/contexts/TenantContext'

export function MyComponent() {
  const { tenant, user, isSuperAdmin, loading, error } = useTenant()

  if (loading) return <div>Loading...</div>
  if (error) return <div>Error: {error}</div>

  return (
    <div>
      <h1>Welcome {user?.nombre}</h1>
      <p>Tenant: {tenant?.nombre}</p>
      {isSuperAdmin && <p>You are a super admin!</p>}
    </div>
  )
}
```

### Tenant Switching (Super-Admin Only)

```tsx
'use client'

import { useTenant } from '@/contexts/TenantContext'
import { useState } from 'react'

export function TenantSwitcher() {
  const { isSuperAdmin, switchTenant, tenant } = useTenant()
  const [targetTenantId, setTargetTenantId] = useState('')

  if (!isSuperAdmin) return null

  const handleSwitch = async () => {
    try {
      await switchTenant(targetTenantId)
      // Page will reload automatically after successful switch
    } catch (error) {
      console.error('Failed to switch tenant:', error)
    }
  }

  return (
    <div>
      <p>Current Tenant: {tenant?.nombre}</p>
      <input
        type="text"
        value={targetTenantId}
        onChange={(e) => setTargetTenantId(e.target.value)}
        placeholder="Enter tenant ID"
      />
      <button onClick={handleSwitch}>Switch Tenant</button>
    </div>
  )
}
```

### Refreshing Tenant Data

```tsx
'use client'

import { useTenant } from '@/contexts/TenantContext'

export function RefreshButton() {
  const { refreshTenant } = useTenant()

  return (
    <button onClick={refreshTenant}>
      Refresh Tenant Info
    </button>
  )
}
```

## Context Value

The `useTenant()` hook returns:

```typescript
interface TenantContextValue {
  tenant: Tenant | null           // Current tenant information
  user: User | null                // Current user information
  isSuperAdmin: boolean            // Whether user is a super-admin
  loading: boolean                 // Loading state
  error: string | null             // Error message if any
  switchTenant: (tenantId: string) => Promise<void>  // Switch tenant (super-admin only)
  refreshTenant: () => Promise<void>                 // Refresh tenant data
}
```

## Types

### Tenant

```typescript
interface Tenant {
  id: string
  nombre: string
  ruc?: string
  email: string
  pais: string
  moneda: string
  estado: 'ACTIVO' | 'INACTIVO' | 'SUSPENDIDO' | 'PRUEBA'
}
```

### User

```typescript
interface User {
  id: string
  email: string
  nombre: string
  apellido?: string
  tenant_id: string
  is_super_admin: boolean
  roles: string[]
}
```

## JWT Payload Structure

The TenantContext expects JWT tokens with the following structure:

```typescript
interface JwtPayload {
  sub: string              // User ID
  email: string            // User email
  username?: string        // User name
  tenant_id: string        // Tenant ID
  roles: string[]          // User roles
  is_super_admin: boolean  // Super-admin flag
  iat: number              // Issued at
  exp: number              // Expiration
}
```

## Integration

The TenantProvider is already integrated in the root layout (`app/layout.tsx`):

```tsx
<SessionProvider session={null}>
  <TenantProvider>
    {children}
  </TenantProvider>
</SessionProvider>
```

The TenantProvider must be inside the SessionProvider to access authentication state.

## API Requirements

The TenantContext expects the following API endpoints:

1. **GET /tenants/:id** - Fetch tenant details (optional, graceful fallback if not available)
2. **POST /auth/switch-tenant** - Switch tenant for super-admins
   - Request body: `{ tenant_id: string }`
   - Response: `{ access_token: string }` or `{ token: string }`

## Error Handling

The context handles errors gracefully:

- If JWT decoding fails, user and tenant are set to null
- If tenant API is not available, a minimal tenant object is created
- If tenant switching fails, an error is thrown and can be caught by the caller
- All errors are logged to the console for debugging

## Notes

- The context automatically updates when the authentication state changes
- Tenant switching triggers a page reload to ensure all state is refreshed
- The tenant API endpoint is optional during development - the context will work with minimal data
- All API calls use the JWT token from the current session for authentication
