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
        <Icon className="stat-icon" style={{ color: iconColor }} />
      </div>
      <div 
        className="stat-value" 
        style={valueColor ? { color: valueColor, fontSize: typeof value === 'string' && value.length > 15 ? '1.5rem' : '3rem' } : undefined}
      >
        {value}
      </div>
      {subtitle && (
        <div className="stat-subtitle">
          {subtitle}
        </div>
      )}
      {trend && (
        <div style={{
          marginTop: '0.5rem',
          fontSize: '0.875rem',
          fontWeight: '600',
          color: trend.isPositive ? '#10b981' : '#ef4444',
          display: 'flex',
          alignItems: 'center',
          gap: '0.25rem'
        }}>
          {trend.isPositive ? '↑' : '↓'} {trend.value}
        </div>
      )}
    </div>
  )
}
