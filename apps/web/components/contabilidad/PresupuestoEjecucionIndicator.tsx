'use client'

import { AlertCircle, AlertTriangle, CheckCircle } from 'lucide-react'

interface PresupuestoEjecucionIndicatorProps {
  porcentajeEjecutado: number
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
  showPercentage?: boolean
  showProgressBar?: boolean
}

export default function PresupuestoEjecucionIndicator({
  porcentajeEjecutado,
  size = 'md',
  showLabel = true,
  showPercentage = true,
  showProgressBar = false
}: PresupuestoEjecucionIndicatorProps) {
  
  // Determine status based on percentage
  const getStatus = () => {
    if (porcentajeEjecutado >= 100) return 'sobregiro'
    if (porcentajeEjecutado >= 90) return 'advertencia'
    return 'normal'
  }

  const status = getStatus()

  // Color configurations
  const colors = {
    normal: {
      bg: '#10b981',
      bgLight: '#d1fae5',
      text: '#065f46',
      icon: CheckCircle
    },
    advertencia: {
      bg: '#f59e0b',
      bgLight: '#fef3c7',
      text: '#92400e',
      icon: AlertTriangle
    },
    sobregiro: {
      bg: '#ef4444',
      bgLight: '#fee2e2',
      text: '#991b1b',
      icon: AlertCircle
    }
  }

  const config = colors[status]
  const Icon = config.icon

  // Size configurations
  const sizes = {
    sm: {
      badge: '0.25rem 0.5rem',
      fontSize: '0.625rem',
      iconSize: 10,
      progressHeight: '4px',
      progressWidth: '60px'
    },
    md: {
      badge: '0.375rem 0.75rem',
      fontSize: '0.75rem',
      iconSize: 12,
      progressHeight: '6px',
      progressWidth: '100px'
    },
    lg: {
      badge: '0.5rem 1rem',
      fontSize: '0.875rem',
      iconSize: 16,
      progressHeight: '8px',
      progressWidth: '120px'
    }
  }

  const sizeConfig = sizes[size]

  // Labels
  const labels = {
    normal: 'Normal',
    advertencia: 'Advertencia',
    sobregiro: 'Sobregiro'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
      {/* Badge with label */}
      {showLabel && (
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.375rem',
          padding: sizeConfig.badge,
          borderRadius: '9999px',
          fontSize: sizeConfig.fontSize,
          fontWeight: '600',
          background: config.bg,
          color: 'white'
        }}>
          <Icon size={sizeConfig.iconSize} />
          {labels[status]}
        </span>
      )}

      {/* Percentage display */}
      {showPercentage && (
        <div style={{
          fontSize: sizeConfig.fontSize,
          fontWeight: '700',
          color: config.bg
        }}>
          {porcentajeEjecutado.toFixed(1)}%
        </div>
      )}

      {/* Progress bar */}
      {showProgressBar && (
        <div style={{
          width: sizeConfig.progressWidth,
          height: sizeConfig.progressHeight,
          background: '#e5e7eb',
          borderRadius: '9999px',
          overflow: 'hidden'
        }}>
          <div style={{
            width: `${Math.min(porcentajeEjecutado, 100)}%`,
            height: '100%',
            background: config.bg,
            transition: 'width 0.3s ease'
          }} />
        </div>
      )}
    </div>
  )
}

// Export helper function to get color by percentage
export function getEjecucionColor(porcentajeEjecutado: number): string {
  if (porcentajeEjecutado >= 100) return '#ef4444' // red
  if (porcentajeEjecutado >= 90) return '#f59e0b' // yellow
  return '#10b981' // green
}

// Export helper function to get status
export function getEjecucionStatus(porcentajeEjecutado: number): 'normal' | 'advertencia' | 'sobregiro' {
  if (porcentajeEjecutado >= 100) return 'sobregiro'
  if (porcentajeEjecutado >= 90) return 'advertencia'
  return 'normal'
}
