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
          <div className="flex gap-4 items-center flex-wrap">
            {actions}
          </div>
        )}
      </div>

      {/* Stats section si se proporciona */}
      {stats && (
        <div className="stats-grid grid-cols-[repeat(auto-fit,_minmax(250px,_1fr))] mb-8">
          {stats}
        </div>
      )}

      {/* Alerts section si se proporciona */}
      {alerts && (
        <div className="mb-8">
          {alerts}
        </div>
      )}

      {/* Filters section si se proporciona */}
      {filters && (
        <div className="activity-section mb-8">
          {filters}
        </div>
      )}

      {/* Contenido principal */}
      {children}
    </div>
  )
}
