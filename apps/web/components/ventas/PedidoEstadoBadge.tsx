'use client'

import { EstadoPedido } from '@/types/ventas'
import {
  Clock,
  CheckCircle,
  Package,
  Truck,
  FileText,
  Receipt,
  CheckCheck,
  FileCheck,
  XCircle
} from 'lucide-react'

interface PedidoEstadoBadgeProps {
  estado: EstadoPedido
  showIcon?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export default function PedidoEstadoBadge({
  estado,
  showIcon = true,
  size = 'md'
}: PedidoEstadoBadgeProps) {
  const getEstadoConfig = (estado: EstadoPedido) => {
    const configs = {
      [EstadoPedido.PENDIENTE]: {
        label: 'Pendiente',
        color: 'bg-muted text-foreground border-border',
        icon: Clock
      },
      [EstadoPedido.PENDIENTE_APROBACION]: {
        label: 'Pendiente Aprobación',
        color: 'bg-amber-500/10 text-amber-400 border-orange-200',
        icon: Clock
      },
      [EstadoPedido.CONFIRMADO]: {
        label: 'Confirmado',
        color: 'bg-primary/10 text-primary border-blue-200',
        icon: CheckCircle
      },
      [EstadoPedido.EN_PREPARACION]: {
        label: 'En Preparación',
        color: 'bg-amber-500/10 text-amber-400 border-yellow-200',
        icon: Package
      },
      [EstadoPedido.LISTO_DESPACHO]: {
        label: 'Listo para Despacho',
        color: 'bg-violet-500/10 text-violet-400 border-purple-200',
        icon: Truck
      },
      [EstadoPedido.DESPACHO_PARCIAL]: {
        label: 'Despacho Parcial',
        color: 'bg-amber-500/10 text-amber-400 border-amber-200',
        icon: Truck
      },
      [EstadoPedido.LISTO_FACTURAR]: {
        label: 'Listo para Facturar',
        color: 'bg-primary/10 text-primary border-indigo-200',
        icon: FileText
      },
      [EstadoPedido.FACTURADO]: {
        label: 'Facturado',
        color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
        icon: Receipt
      },
      [EstadoPedido.COMPLETADO]: {
        label: 'Completado',
        color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
        icon: CheckCheck
      },
      [EstadoPedido.COMPLETADO_CON_GRE]: {
        label: 'Completado con GRE',
        color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
        icon: FileCheck
      },
      [EstadoPedido.CANCELADO]: {
        label: 'Cancelado',
        color: 'bg-destructive/10 text-destructive border-red-200',
        icon: XCircle
      }
    }
    return configs[estado] || configs[EstadoPedido.PENDIENTE]
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
