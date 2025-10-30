'use client'

import AuditLogsViewer from '@/components/audit/AuditLogsViewer'
import { ProtectedComponent } from '@/components/auth/ProtectedComponent'
import { AlertCircle } from 'lucide-react'

/**
 * Página de logs de auditoría
 * Requiere permiso 'security.audit.read'
 */
export default function AuditLogsPage() {
  return (
    <ProtectedComponent
      permission="security.audit.read"
      fallback={
        <div className="dashboard-container">
          <div className="activity-card">
            <div className="activity-empty">
              <AlertCircle size={48} style={{ margin: '0 auto 1rem', opacity: '0.5' }} />
              <h3>Acceso denegado</h3>
              <p>No tienes permisos para ver los logs de auditoría.</p>
            </div>
          </div>
        </div>
      }
    >
      <AuditLogsViewer />
    </ProtectedComponent>
  )
}

