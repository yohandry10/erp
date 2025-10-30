'use client'

import { LucideIcon } from 'lucide-react'

interface ViewOption {
  value: string
  label: string
  icon: LucideIcon
}

interface FinanzasViewToggleProps {
  options: ViewOption[]
  value: string
  onChange: (value: string) => void
}

/**
 * Componente de toggle de vista consistente para Finanzas
 * Proporciona cambio uniforme entre diferentes vistas (lista, gráfico, etc.)
 */
export default function FinanzasViewToggle({
  options,
  value,
  onChange
}: FinanzasViewToggleProps) {
  return (
    <div style={{ 
      display: 'flex', 
      gap: '0.5rem',
      background: '#f3f4f6',
      padding: '0.25rem',
      borderRadius: '8px'
    }}>
      {options.map((option) => {
        const Icon = option.icon
        const isActive = value === option.value

        return (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              border: 'none',
              background: isActive ? 'white' : 'transparent',
              color: isActive ? '#3b82f6' : '#6b7280',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'all 0.2s ease',
              boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
            }}
          >
            <Icon size={16} />
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
