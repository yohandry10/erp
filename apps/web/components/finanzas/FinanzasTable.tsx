'use client'

import { ReactNode } from 'react'

interface Column {
  key: string
  label: string
  align?: 'left' | 'center' | 'right'
  width?: string
}

interface FinanzasTableProps {
  columns: Column[]
  children: ReactNode
  loading?: boolean
  emptyState?: ReactNode
}

/**
 * Componente de tabla consistente para Finanzas
 * Proporciona estructura uniforme para tablas de datos
 */
export default function FinanzasTable({
  columns,
  children,
  loading = false,
  emptyState
}: FinanzasTableProps) {
  if (loading) {
    return (
      <div className="loading">
        <div className="loading-spinner"></div>
        <p>Cargando datos...</p>
      </div>
    )
  }

  return (
    <div className="activity-card">
      <div style={{ overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid rgba(0,0,0,0.1)' }}>
              {columns.map((column) => (
                <th
                  key={column.key}
                  style={{
                    textAlign: column.align || 'left',
                    padding: '1rem',
                    fontWeight: '600',
                    fontSize: '0.75rem',
                    textTransform: 'uppercase',
                    color: '#6b7280',
                    width: column.width
                  }}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {children}
          </tbody>
        </table>
      </div>
      {!children && emptyState && emptyState}
    </div>
  )
}
