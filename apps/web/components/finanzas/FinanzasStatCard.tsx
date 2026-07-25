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
    <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
      <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
        <h3>{title}</h3>
        <Icon className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary" />
      </div>
      <div
        className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none"
      >
        {value}
      </div>
      {subtitle && (
        <div className="mt-2 text-[0.8125rem] text-muted-foreground">
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
