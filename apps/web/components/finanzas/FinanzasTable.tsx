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
      <div className="overflow-auto">
        <table className="w-[100%]">
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key} className="p-4 font-semibold text-3 text-gray-500"
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
