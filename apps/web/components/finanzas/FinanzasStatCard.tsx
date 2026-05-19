'use client'

import { LucideIcon } from 'lucide-react'

interface FinanzasStatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: LucideIcon
  iconColor?: string
  valueColor?: string
  trend?: {
    value: string
    isPositive: boolean
  }
}

/**
 * Componente de tarjeta de estadística consistente para Finanzas
 * Proporciona visualización uniforme de métricas clave
 */
export default function FinanzasStatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconColor = '#3b82f6',
  valueColor,
  trend
}: FinanzasStatCardProps) {
  return (
    <div className="stat-card">
      <div className="stat-header">
        <h3>{title}</h3>
        <Icon className="stat-icon" />
      </div>
      <div 
        className="stat-value"
      >
        {value}
      </div>
      {subtitle && (
        <div className="stat-subtitle">
          {subtitle}
        </div>
      )}
      {trend && (
        <div className="mt-2 text-[0.875rem] font-semibold flex items-center gap-1">
          {trend.isPositive ? '↑' : '↓'} {trend.value}
        </div>
      )}
    </div>
  )
}
