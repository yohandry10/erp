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
    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
      {children}
      
      {isActive && (
        <button
          onClick={onClear}
          style={{
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            border: '1px solid #d1d5db',
            background: 'white',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.875rem',
            fontWeight: '500',
            color: '#ef4444',
            transition: 'all 0.2s ease'
          }}
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
          onClick={onExport}
          style={{
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            border: '1px solid #d1d5db',
            background: 'white',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.875rem',
            fontWeight: '500',
            color: '#374151',
            transition: 'all 0.2s ease'
          }}
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
