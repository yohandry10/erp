# Permission-Based Components

<!-- DOC-NAV:START -->
> Documentación canónica: `docs/README.md`. Estado vigente: `docs/CURRENT_STATE.md`.
<!-- DOC-NAV:END -->

This directory contains components for implementing permission-based access control in the frontend.

## Components

### ProtectedComponent

A wrapper component that only renders its children if the user has the required permission.

**Usage:**

```tsx
import { ProtectedComponent } from '@/components/auth/ProtectedComponent'

function MyPage() {
  return (
    <ProtectedComponent
      modulo="ventas"
      accion="create"
      recurso="facturas"
      fallback={<div>No tienes permiso para crear facturas</div>}
    >
      <CreateInvoiceButton />
    </ProtectedComponent>
  )
}
```

**Props:**

- `modulo` (string): Module name (e.g., 'ventas', 'compras', 'inventario')
- `accion` (string): Action name (e.g., 'create', 'read', 'update', 'delete', 'export')
- `recurso` (string): Resource name (e.g., 'clientes', 'productos', 'facturas')
- `children` (ReactNode): Content to render if permission is granted
- `fallback` (ReactNode, optional): Content to render if permission is denied
- `loadingFallback` (ReactNode, optional): Content to show while checking permissions
- `showFallbackWhileLoading` (boolean, optional): Show fallback during loading

### withPermission

Higher-order component version of ProtectedComponent.

**Usage:**

```tsx
import { withPermission } from '@/components/auth/ProtectedComponent'

const CreateButton = ({ onClick }) => (
  <button onClick={onClick}>Create Invoice</button>
)

const ProtectedCreateButton = withPermission(
  CreateButton,
  'ventas',
  'create',
  'facturas'
)

// Use it
<ProtectedCreateButton onClick={handleCreate} />
```

### PermissionSwitch

Renders different content based on permission status.

**Usage:**

```tsx
import { PermissionSwitch } from '@/components/auth/ProtectedComponent'

<PermissionSwitch
  modulo="ventas"
  accion="update"
  recurso="facturas"
  granted={<EditButton />}
  denied={<ViewOnlyButton />}
/>
```

## Hooks

See `/hooks/README.md` for documentation on `usePermission` and `useUserPermissions` hooks.

## Permission Structure

Permissions are defined with three components:

1. **modulo**: The module/feature area (e.g., 'ventas', 'compras', 'inventario', 'admin')
2. **accion**: The action being performed (e.g., 'create', 'read', 'update', 'delete', 'export')
3. **recurso**: The specific resource (e.g., 'facturas', 'productos', 'clientes', 'usuarios')

## Super-Admin Behavior

Super-admins automatically have all permissions and bypass permission checks. The components will always render the granted/children content for super-admins.

## Caching

Permissions are cached for 5 minutes to improve performance. The cache is automatically managed by the `usePermission` hook.

To manually clear the cache:

```tsx
import { clearPermissionCache } from '@/hooks/use-permission'

// Clear cache for specific user
clearPermissionCache(userId)

// Clear all cache
clearPermissionCache()
```
