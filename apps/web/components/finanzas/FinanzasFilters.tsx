'use client'

import { ReactNode } from 'react'
import { XCircle, Download } from 'lucide-react'

interface FinanzasFiltersProps {
  children: ReactNode
  isActive: boolean
  onClear: () => void
  onExport?: () => void
  showExport?: boolean
}

/**
 * Componente de filtros consistente para Finanzas
 * Proporciona estructura uniforme para filtros con botones de acción
 */
export default function FinanzasFilters({
  children,
  isActive,
  onClear,
  onExport,
  showExport = true
}: FinanzasFiltersProps) {
  return (
    <div className="flex gap-4 flex-wrap items-end">
      {children}
      
      {isActive && (
        <button
          onClick={onClear} className="py-3 px-4 rounded-2 border bg-white cursor-pointer flex items-center gap-2 text-[0.875rem] font-medium text-red-500 transition"
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#fee2e2'
            e.currentTarget.style.borderColor = '#ef4444'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'white'
            e.currentTarget.style.borderColor = '#d1d5db'
          }}
        >
          <XCircle size={16} />
          Limpiar Filtros
        </button>
      )}

      {showExport && onExport && (
        <button
          onClick={onExport} className="py-3 px-4 rounded-2 border bg-white cursor-pointer flex items-center gap-2 text-[0.875rem] font-medium text-gray-700 transition"
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#f3f4f6'
            e.currentTarget.style.borderColor = '#9ca3af'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'white'
            e.currentTarget.style.borderColor = '#d1d5db'
          }}
        >
          <Download size={16} />
          Exportar
        </button>
      )}
    </div>
  )
}
