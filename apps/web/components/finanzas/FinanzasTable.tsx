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
      <div className="flex min-h-48 items-center justify-center">
        <div className="inline-block size-8 animate-spin rounded-full border-[3px] border-muted border-t-primary"></div>
        <p>Cargando datos...</p>
      </div>
    )
  }

  return (
    <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl">
      <div className="overflow-auto">
        <table className="w-[100%]">
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key} className="p-4 font-semibold text-xs text-muted-foreground"
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
