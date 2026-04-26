'use client'

import { EstadoCotizacion } from '@/types/ventas'
import {
  FileEdit,
  Send,
  CheckCircle,
  XCircle,
  ArrowRightCircle,
  Clock
} from 'lucide-react'

interface CotizacionEstadoBadgeProps {
  estado: EstadoCotizacion
  showIcon?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export default function CotizacionEstadoBadge({
  estado,
  showIcon = true,
  size = 'md'
}: CotizacionEstadoBadgeProps) {
  const getEstadoConfig = (estado: EstadoCotizacion) => {
    const configs = {
      [EstadoCotizacion.BORRADOR]: {
        label: 'Borrador',
        color: 'bg-gray-100 text-gray-800 border-gray-200',
        icon: FileEdit
      },
      [EstadoCotizacion.ENVIADA]: {
        label: 'Enviada',
        color: 'bg-blue-100 text-blue-800 border-blue-200',
        icon: Send
      },
      [EstadoCotizacion.APROBADA]: {
        label: 'Aprobada',
        color: 'bg-green-100 text-green-800 border-green-200',
        icon: CheckCircle
      },
      [EstadoCotizacion.RECHAZADA]: {
        label: 'Rechazada',
        color: 'bg-red-100 text-red-800 border-red-200',
        icon: XCircle
      },
      [EstadoCotizacion.CONVERTIDA]: {
        label: 'Convertida',
        color: 'bg-purple-100 text-purple-800 border-purple-200',
        icon: ArrowRightCircle
      },
      [EstadoCotizacion.VENCIDA]: {
        label: 'Vencida',
        color: 'bg-orange-100 text-orange-800 border-orange-200',
        icon: Clock
      }
    }
    return configs[estado] || configs[EstadoCotizacion.BORRADOR]
  }

  const config = getEstadoConfig(estado)
  const Icon = config.icon

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
    lg: 'px-3 py-1.5 text-base'
  }

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-3.5 h-3.5',
    lg: 'w-4 h-4'
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium border ${config.color} ${sizeClasses[size]}`}
    >
      {showIcon && <Icon className={iconSizes[size]} />}
      {config.label}
    </span>
  )
}
