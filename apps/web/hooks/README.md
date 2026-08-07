# Custom Hooks

<!-- DOC-NAV:START -->
> Documentación canónica: `docs/README.md`. Estado vigente: `docs/CURRENT_STATE.md`.
<!-- DOC-NAV:END -->

This directory contains custom React hooks for the application.

## Permission Hooks

### usePermission

Hook to check if the current user has a specific permission.

**Usage:**

```tsx
import { usePermission } from '@/hooks/use-permission'

function CreateInvoiceButton() {
  const { hasPermission, loading } = usePermission('ventas', 'create', 'facturas')

  if (loading) {
    return <div>Loading...</div>
  }

  if (!hasPermission) {
    return null
  }

  return <button>Create Invoice</button>
}
```

**Parameters:**

- `modulo` (string): Module name (e.g., 'ventas', 'compras', 'inventario')
- `accion` (string): Action name (e.g., 'create', 'read', 'update', 'delete', 'export')
- `recurso` (string): Resource name (e.g., 'clientes', 'productos', 'facturas')

**Returns:**

- `hasPermission` (boolean): Whether the user has the permission
- `loading` (boolean): Whether the permission check is in progress

### useUserPermissions

Hook to get all permissions for the current user.

**Usage:**

```tsx
import { useUserPermissions } from '@/hooks/use-permission'

function PermissionsList() {
  const { permissions, loading, refetch } = useUserPermissions()

  if (loading) {
    return <div>Loading permissions...</div>
  }

  return (
    <div>
      <h2>Your Permissions</h2>
      <ul>
        {permissions.map(p => (
          <li key={p.id}>
            {p.modulo} - {p.accion} - {p.recurso}
          </li>
        ))}
      </ul>
      <button onClick={refetch}>Refresh</button>
    </div>
  )
}
```

**Returns:**

- `permissions` (Permission[]): Array of user permissions
- `loading` (boolean): Whether permissions are being fetched
- `refetch` (function): Function to manually refetch permissions

### clearPermissionCache

Utility function to clear the permission cache.

**Usage:**

```tsx
import { clearPermissionCache } from '@/hooks/use-permission'

// Clear cache for specific user
clearPermissionCache(userId)

// Clear all cache
clearPermissionCache()
```

## API Hooks

### useApi

Main hook for making API calls with automatic authentication and error handling.

**Usage:**

```tsx
import { useApi } from '@/hooks/use-api'

function MyComponent() {
  const { get, post, put, delete: del, request } = useApi()

  const fetchData = async () => {
    const data = await get('/api/endpoint')
    console.log(data)
  }

  const createData = async () => {
    const result = await post('/api/endpoint', { name: 'Test' })
    console.log(result)
  }

  return <button onClick={fetchData}>Fetch</button>
}
```

**Features:**

- Automatic JWT token inclusion
- Automatic tenant context (from JWT)
- 401 Unauthorized handling (redirects to login)
- 403 Forbidden handling (shows permission error)
- Configurable toast notifications
- Country context injection (x-country-id header)

**Options:**

```tsx
const api = useApi({
  showErrorToast: true,   // Show toast on error (default: true)
  showSuccessToast: false // Show toast on success (default: false)
})
```

**Methods:**

- `get(endpoint)`: GET request
- `post(endpoint, data)`: POST request
- `put(endpoint, data)`: PUT request
- `delete(endpoint)`: DELETE request
- `request(endpoint, options)`: Custom request with full options

### useApiCall

Alias for `useApi` with default options.

### useCpeApi

Pre-configured API hook for CPE operations with success toasts enabled.

### useAuthApi

Pre-configured API hook for authentication operations with error toasts only.

## Error Handling

The API hooks automatically handle common errors:

- **401 Unauthorized**: Clears session and redirects to login
- **403 Forbidden**: Shows permission error message
- **Other errors**: Shows error toast (if enabled)

## Caching

Permission checks are cached for 5 minutes to reduce API calls and improve performance. The cache is automatically managed and can be manually cleared using `clearPermissionCache()`.

## Super-Admin Behavior

Super-admins automatically have all permissions. The `usePermission` hook will immediately return `hasPermission: true` for super-admins without making an API call.
