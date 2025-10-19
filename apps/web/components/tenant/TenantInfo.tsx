'use client'

import { useTenant } from '@/contexts/TenantContext'

/**
 * Example component demonstrating how to use the TenantContext
 * This component displays current tenant information and provides
 * tenant switching capability for super-admins
 */
export function TenantInfo() {
  const { tenant, user, isSuperAdmin, loading, error } = useTenant()

  if (loading) {
    return <div className="p-4 text-sm text-gray-500">Loading tenant information...</div>
  }

  if (error) {
    return <div className="p-4 text-sm text-red-500">Error: {error}</div>
  }

  if (!tenant || !user) {
    return <div className="p-4 text-sm text-gray-500">No tenant information available</div>
  }

  return (
    <div className="p-4 border rounded-lg bg-white shadow-sm">
      <h3 className="text-lg font-semibold mb-2">Tenant Information</h3>
      <div className="space-y-2 text-sm">
        <div>
          <span className="font-medium">Tenant:</span> {tenant.nombre}
        </div>
        <div>
          <span className="font-medium">User:</span> {user.nombre} ({user.email})
        </div>
        <div>
          <span className="font-medium">Roles:</span> {user.roles.join(', ') || 'None'}
        </div>
        {isSuperAdmin && (
          <div className="mt-2 pt-2 border-t">
            <span className="inline-block px-2 py-1 text-xs font-semibold text-white bg-purple-600 rounded">
              Super Admin
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
