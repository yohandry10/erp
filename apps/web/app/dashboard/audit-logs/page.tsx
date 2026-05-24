'use client'

import AuditLogsViewer from '@/components/audit/AuditLogsViewer'
import { useTenant } from '@/contexts/TenantContext'
import { AlertCircle } from 'lucide-react'

/**
 * Página de logs de auditoría
 * Accesible únicamente para: SuperAdmin
 */
export default function AuditLogsPage() {
  const { isSuperAdmin, loading } = useTenant()

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="activity-card">
          <div className="loading">
            <div className="loading-spinner" />
            <p>Validando acceso...</p>
          </div>
        </div>
      </div>
    )
  }

  if (!isSuperAdmin) {
    return (
      <div className="dashboard-container">
        <div className="activity-card">
          <div className="p-12 text-center">
            <AlertCircle className="mx-auto mb-4 h-12 w-12 text-slate-500 opacity-50" />
            <h3 className="mb-2 text-lg font-semibold text-slate-700">Acceso denegado</h3>
            <p className="text-slate-500">No tienes permisos para ver los logs de auditoría.</p>
          </div>
        </div>
      </div>
    )
  }

  return <AuditLogsViewer />
}
