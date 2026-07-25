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
    <div className="text-center p-12 text-muted-foreground">
      <Icon size={48} className="text-muted-foreground" />
      <h3 className="text-[1.125rem] font-semibold mb-2 text-foreground/85">
        {title}
      </h3>
      <p className="text-muted-foreground">
        {description}
      </p>
      {action && (
        <button
          onClick={action.onClick} className="py-3 px-6 rounded-lg border-0 bg-blue-500 text-white cursor-pointer text-[0.875rem] font-semibold inline-flex items-center gap-2 transition"
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
