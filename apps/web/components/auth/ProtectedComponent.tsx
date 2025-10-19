'use client'

import { ReactNode } from 'react'
import { usePermission } from '@/hooks/use-permission'
import { useTenant } from '@/contexts/TenantContext'

interface ProtectedComponentProps {
  /**
   * Module name (e.g., 'ventas', 'compras', 'inventario')
   */
  modulo: string
  
  /**
   * Action name (e.g., 'create', 'read', 'update', 'delete', 'export')
   */
  accion: string
  
  /**
   * Resource name (e.g., 'clientes', 'productos', 'facturas')
   */
  recurso: string
  
  /**
   * Content to render if permission is granted
   */
  children: ReactNode
  
  /**
   * Optional fallback content to render if permission is denied
   * If not provided, nothing will be rendered
   */
  fallback?: ReactNode
  
  /**
   * Optional loading content to show while checking permissions
   */
  loadingFallback?: ReactNode
  
  /**
   * If true, shows the fallback even during loading
   * Default: false
   */
  showFallbackWhileLoading?: boolean
}

/**
 * Component wrapper that only renders children if user has the required permission
 * 
 * @example
 * ```tsx
 * <ProtectedComponent 
 *   modulo="ventas" 
 *   accion="create" 
 *   recurso="facturas"
 *   fallback={<div>No tienes permiso para crear facturas</div>}
 * >
 *   <CreateInvoiceButton />
 * </ProtectedComponent>
 * ```
 */
export function ProtectedComponent({
  modulo,
  accion,
  recurso,
  children,
  fallback = null,
  loadingFallback = null,
  showFallbackWhileLoading = false,
}: ProtectedComponentProps) {
  const { hasPermission, loading } = usePermission(modulo, accion, recurso)
  const { isSuperAdmin } = useTenant()

  // Super-admins always have access
  if (isSuperAdmin) {
    return <>{children}</>
  }

  // Handle loading state
  if (loading) {
    if (showFallbackWhileLoading) {
      return <>{fallback}</>
    }
    return <>{loadingFallback}</>
  }

  // Render children if permission granted, otherwise render fallback
  return hasPermission ? <>{children}</> : <>{fallback}</>
}

/**
 * Higher-order component version of ProtectedComponent
 * Wraps a component and only renders it if user has permission
 * 
 * @example
 * ```tsx
 * const ProtectedButton = withPermission(
 *   CreateButton,
 *   'ventas',
 *   'create',
 *   'facturas'
 * )
 * ```
 */
export function withPermission<P extends object>(
  Component: React.ComponentType<P>,
  modulo: string,
  accion: string,
  recurso: string,
  fallback?: ReactNode
) {
  return function ProtectedComponentWrapper(props: P) {
    return (
      <ProtectedComponent
        modulo={modulo}
        accion={accion}
        recurso={recurso}
        fallback={fallback}
      >
        <Component {...props} />
      </ProtectedComponent>
    )
  }
}

/**
 * Component that renders different content based on permission
 * Useful for showing different UI states based on permissions
 * 
 * @example
 * ```tsx
 * <PermissionSwitch
 *   modulo="ventas"
 *   accion="update"
 *   recurso="facturas"
 *   granted={<EditButton />}
 *   denied={<ViewOnlyButton />}
 * />
 * ```
 */
export function PermissionSwitch({
  modulo,
  accion,
  recurso,
  granted,
  denied,
  loading: loadingContent = null,
}: {
  modulo: string
  accion: string
  recurso: string
  granted: ReactNode
  denied: ReactNode
  loading?: ReactNode
}) {
  const { hasPermission, loading } = usePermission(modulo, accion, recurso)
  const { isSuperAdmin } = useTenant()

  // Super-admins always see granted content
  if (isSuperAdmin) {
    return <>{granted}</>
  }

  if (loading) {
    return <>{loadingContent}</>
  }

  return hasPermission ? <>{granted}</> : <>{denied}</>
}
