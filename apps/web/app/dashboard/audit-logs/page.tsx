'use client'

import AuditLogsViewer from '@/components/audit/AuditLogsViewer'
import { useTenant } from '@/contexts/TenantContext'
import { AlertCircle } from 'lucide-react'

/**
 * Página de logs de auditoría
 * Accesible para: SuperAdmin y Admin del tenant
 */
export default function AuditLogsPage() {
  const { isSuperAdmin, user } = useTenant()
  
  // Verificar si el usuario es Admin del tenant
  const userRoles: string[] = user?.roles || []
  const isAdmin = userRoles.includes('ADMIN')
  
  // SuperAdmin o Admin del tenant pueden ver los logs
  const canViewAuditLogs = isSuperAdmin || isAdmin

  if (!canViewAuditLogs) {
    return (
      <div className="dashboard-container">
        <div className="activity-card">
          <div style={{ textAlign: 'center', padding: '3rem' }}>
            <AlertCircle size={48} style={{ margin: '0 auto 1rem', opacity: '0.5', color: '#6b7280' }} />
            <h3 style={{ marginBottom: '0.5rem', color: '#374151' }}>Acceso denegado</h3>
            <p style={{ color: '#6b7280' }}>No tienes permisos para ver los logs de auditoría.</p>
          </div>
        </div>
      </div>
    )
  }

  return <AuditLogsViewer />
}

