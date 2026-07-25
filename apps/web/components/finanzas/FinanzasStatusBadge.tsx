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
      <span className="inline-flex items-center gap-1 py-1 px-3 rounded-full text-xs font-medium bg-gray-500 text-white">
        {status}
      </span>
    )
  }

  const Icon = statusConfig.icon

  return (
    <span className="inline-flex items-center gap-1 py-1 px-3 rounded-full text-xs font-medium text-white">
      {Icon && <Icon size={14} />}
      {statusConfig.label}
    </span>
  )
}
