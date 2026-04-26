'use client'

import { ReactNode } from 'react'

interface FinanzasLayoutProps {
  children: ReactNode
  title: string
  subtitle: string
  actions?: ReactNode
  stats?: ReactNode
  filters?: ReactNode
  alerts?: ReactNode
}

/**
 * Layout consistente para todas las páginas del módulo Finanzas
 * Proporciona estructura uniforme con header, stats, filtros y contenido
 */
export default function FinanzasLayout({
  children,
  title,
  subtitle,
  actions,
  stats,
  filters,
  alerts
}: FinanzasLayoutProps) {
  return (
    <div className="dashboard-container">
      {/* Header consistente */}
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">{title}</h1>
          <p className="dashboard-subtitle">{subtitle}</p>
        </div>
        {actions && (
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {actions}
          </div>
        )}
      </div>

      {/* Stats section si se proporciona */}
      {stats && (
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', marginBottom: '2rem' }}>
          {stats}
        </div>
      )}

      {/* Alerts section si se proporciona */}
      {alerts && (
        <div style={{ marginBottom: '2rem' }}>
          {alerts}
        </div>
      )}

      {/* Filters section si se proporciona */}
      {filters && (
        <div className="activity-section" style={{ marginBottom: '2rem' }}>
          {filters}
        </div>
      )}

      {/* Contenido principal */}
      {children}
    </div>
  )
}
