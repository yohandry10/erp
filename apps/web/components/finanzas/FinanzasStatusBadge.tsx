'use client'

import { LucideIcon } from 'lucide-react'

interface StatusConfig {
  label: string
  color: string
  icon?: LucideIcon
}

interface FinanzasStatusBadgeProps {
  status: string
  config: Record<string, StatusConfig>
}

/**
 * Componente de badge de estado consistente para Finanzas
 * Proporciona visualización uniforme de estados
 */
export default function FinanzasStatusBadge({
  status,
  config
}: FinanzasStatusBadgeProps) {
  const statusConfig = config[status]
  
  if (!statusConfig) {
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        padding: '0.25rem 0.75rem',
        borderRadius: '9999px',
        fontSize: '0.75rem',
        fontWeight: '500',
        background: '#6b7280',
        color: 'white'
      }}>
        {status}
      </span>
    )
  }

  const Icon = statusConfig.icon

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.25rem',
      padding: '0.25rem 0.75rem',
      borderRadius: '9999px',
      fontSize: '0.75rem',
      fontWeight: '500',
      background: statusConfig.color,
      color: 'white'
    }}>
      {Icon && <Icon size={14} />}
      {statusConfig.label}
    </span>
  )
}
