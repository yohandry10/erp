'use client'

import { LucideIcon } from 'lucide-react'

interface FinanzasEmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  action?: {
    label: string
    onClick: () => void
    icon?: LucideIcon
  }
}

/**
 * Componente de estado vacío consistente para Finanzas
 * Proporciona visualización uniforme cuando no hay datos
 */
export default function FinanzasEmptyState({
  icon: Icon,
  title,
  description,
  action
}: FinanzasEmptyStateProps) {
  const ActionIcon = action?.icon

  return (
    <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
      <Icon size={48} style={{ margin: '0 auto 1rem', color: '#9ca3af' }} />
      <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.5rem', color: '#374151' }}>
        {title}
      </h3>
      <p style={{ marginBottom: action ? '1.5rem' : '0', color: '#6b7280' }}>
        {description}
      </p>
      {action && (
        <button
          onClick={action.onClick}
          style={{
            padding: '0.75rem 1.5rem',
            borderRadius: '8px',
            border: 'none',
            background: '#3b82f6',
            color: 'white',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: '600',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#2563eb'
            e.currentTarget.style.transform = 'translateY(-2px)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#3b82f6'
            e.currentTarget.style.transform = 'translateY(0)'
          }}
        >
          {ActionIcon && <ActionIcon size={16} />}
          {action.label}
        </button>
      )}
    </div>
  )
}
