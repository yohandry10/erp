'use client'

import { Clock, CheckCircle, XCircle, AlertCircle, Eye, DollarSign } from 'lucide-react'
import { useLocalizedMoney } from '@/hooks/use-localized-money'
import { getDaysUntilDue, getVencimientoText, parseDateLocal } from '@/lib/date-utils'

interface CxpCardProps {
  cuenta: {
    id: string
    numero_documento: string
    proveedor_id: string
    fecha_emision: string
    fecha_vencimiento: string
    estado: string
    total: number
    saldo: number
    moneda: string
    tipo_documento: string
    observaciones?: string
    proveedores?: {
      razon_social: string
      ruc: string
    }
  }
  onClick?: () => void
}

type EstadoCxp = 'PENDIENTE' | 'PARCIAL' | 'PAGADA' | 'VENCIDA' | 'ANULADA'

const ESTADOS_CONFIG: Record<EstadoCxp, {
  label: string
  color: string
  bgColor: string
  icon: any
}> = {
  PENDIENTE: {
    label: 'Pendiente',
    color: '#f59e0b',
    bgColor: 'rgba(245, 158, 11, 0.1)',
    icon: Clock
  },
  PARCIAL: {
    label: 'Parcial',
    color: '#3b82f6',
    bgColor: 'rgba(59, 130, 246, 0.1)',
    icon: AlertCircle
  },
  PAGADA: {
    label: 'Pagada',
    color: '#10b981',
    bgColor: 'rgba(16, 185, 129, 0.1)',
    icon: CheckCircle
  },
  VENCIDA: {
    label: 'Vencida',
    color: '#ef4444',
    bgColor: 'rgba(239, 68, 68, 0.1)',
    icon: XCircle
  },
  ANULADA: {
    label: 'Anulada',
    color: '#6b7280',
    bgColor: 'rgba(107, 114, 128, 0.1)',
    icon: XCircle
  }
}

export function CxpCard({ cuenta, onClick }: CxpCardProps) {
  const { country, taxIdLabel, formatCurrency } = useLocalizedMoney()
  const config = ESTADOS_CONFIG[cuenta.estado as EstadoCxp]
  const Icon = config?.icon || Clock

  const formatDate = (dateString: string) => {
    return parseDateLocal(dateString).toLocaleDateString(country.locale || 'es-PE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
  }

  const daysUntilDue = getDaysUntilDue(cuenta.fecha_vencimiento)
  const isOverdue = daysUntilDue < 0
  const isDueSoon = daysUntilDue >= 0 && daysUntilDue <= 7

  return (
    <div className="rounded-xl p-5 shadow border transition relative overflow-hidden"
      onMouseEnter={(e) => {
        if (onClick) {
          e.currentTarget.style.transform = 'translateY(-4px)'
          e.currentTarget.style.boxShadow = 'var(--shadow-xl)'
        }
      }}
      onMouseLeave={(e) => {
        if (onClick) {
          e.currentTarget.style.transform = 'translateY(0)'
          e.currentTarget.style.boxShadow = 'var(--shadow-md)'
        }
      }}
      onClick={onClick}
    >
      {/* Top Border Indicator */}
      <div className="absolute top-0 left-0 right-0 h-[4px]"
      />

      {/* Document Number */}
      <div className="mb-3">
        <div className="text-[0.875rem] font-bold text-[var(--primary-800)] mb-1">
          {cuenta.numero_documento}
        </div>
        <div className="text-xs text-[var(--primary-500)]">
          {cuenta.tipo_documento}
        </div>
      </div>

      {/* Provider */}
      <div className="mb-3">
        <div className="text-[0.875rem] font-semibold text-[var(--primary-700)] mb-1">
          {cuenta.proveedores?.razon_social || 'Proveedor N/A'}
        </div>
        {cuenta.proveedores?.ruc && (
          <div className="text-xs text-[var(--primary-500)]">
            {taxIdLabel}: {cuenta.proveedores.ruc}
          </div>
        )}
      </div>

      {/* Amounts */}
      <div className="rounded-lg p-3 mb-3"
      >
        <div className="flex justify-between mb-2">
          <div className="text-xs text-[var(--primary-600)]">
            Total
          </div>
          <div className="text-[0.875rem] font-bold text-[var(--primary-800)]">
            {formatCurrency(cuenta.total, cuenta.moneda)}
          </div>
        </div>
        <div className="flex justify-between">
          <div className="text-xs text-[var(--primary-600)]">
            Saldo
          </div>
          <div className="text-base font-bold">
            {formatCurrency(cuenta.saldo, cuenta.moneda)}
          </div>
        </div>
      </div>

      {/* Due Date */}
      <div className="flex items-center gap-2 text-xs mb-3">
        <Clock size={14} className="text-[var(--primary-500)]" />
        <div>
          <span className="text-[var(--primary-500)]">Vence: </span>
          <span className="font-medium text-[var(--primary-700)]">
            {formatDate(cuenta.fecha_vencimiento)}
          </span>
        </div>
      </div>

      {/* Overdue Warning */}
      {(isOverdue || isDueSoon) && cuenta.estado !== 'PAGADA' && cuenta.estado !== 'ANULADA' && (
        <div className="p-2 rounded-[6px] text-xs font-semibold mb-3 flex items-center gap-2">
          <AlertCircle size={14} />
          {getVencimientoText(cuenta.fecha_vencimiento)}
        </div>
      )}

      {/* Status Badge */}
      <div className="flex items-center justify-between pt-3 border-t">
        <span className="inline-flex items-center gap-1 py-1 px-3 rounded-full text-xs font-medium text-white">
          <Icon size={14} />
          {config?.label || cuenta.estado}
        </span>

        {onClick && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onClick()
            }} className="py-2 px-4 rounded-[6px] border-0 bg-[var(--blue-500)] text-white cursor-pointer text-xs font-semibold flex items-center gap-1 transition"
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--blue-600)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--blue-500)'
            }}
          >
            <Eye size={14} />
            Ver
          </button>
        )}
      </div>
    </div>
  )
}
