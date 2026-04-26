'use client'

import { Clock, CheckCircle, XCircle, AlertCircle, Eye, DollarSign } from 'lucide-react'

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
  const config = ESTADOS_CONFIG[cuenta.estado as EstadoCxp]
  const Icon = config?.icon || Clock

  const formatCurrency = (amount: number, moneda: string = 'PEN') => {
    const currency = moneda === 'USD' ? 'USD' : 'PEN'
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: currency,
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-PE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
  }

  const getDaysUntilDue = (vencimiento: string) => {
    const today = new Date()
    const dueDate = new Date(vencimiento)
    const diffTime = dueDate.getTime() - today.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays
  }

  const daysUntilDue = getDaysUntilDue(cuenta.fecha_vencimiento)
  const isOverdue = daysUntilDue < 0
  const isDueSoon = daysUntilDue >= 0 && daysUntilDue <= 7

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)',
        backdropFilter: 'blur(20px) saturate(180%)',
        borderRadius: '12px',
        padding: '1.25rem',
        boxShadow: 'var(--shadow-md)',
        border: '1px solid rgba(255, 255, 255, 0.3)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        position: 'relative',
        overflow: 'hidden'
      }}
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
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '4px',
          background: config?.color || '#6b7280',
          borderRadius: '12px 12px 0 0'
        }}
      />

      {/* Document Number */}
      <div style={{ marginBottom: '0.75rem' }}>
        <div style={{
          fontSize: '0.875rem',
          fontWeight: '700',
          color: 'var(--primary-800)',
          fontFamily: 'monospace',
          marginBottom: '0.25rem'
        }}>
          {cuenta.numero_documento}
        </div>
        <div style={{
          fontSize: '0.75rem',
          color: 'var(--primary-500)'
        }}>
          {cuenta.tipo_documento}
        </div>
      </div>

      {/* Provider */}
      <div style={{ marginBottom: '0.75rem' }}>
        <div style={{
          fontSize: '0.875rem',
          fontWeight: '600',
          color: 'var(--primary-700)',
          marginBottom: '0.25rem'
        }}>
          {cuenta.proveedores?.razon_social || 'Proveedor N/A'}
        </div>
        {cuenta.proveedores?.ruc && (
          <div style={{
            fontSize: '0.75rem',
            color: 'var(--primary-500)'
          }}>
            RUC: {cuenta.proveedores.ruc}
          </div>
        )}
      </div>

      {/* Amounts */}
      <div
        style={{
          background: config?.bgColor || 'rgba(107, 114, 128, 0.1)',
          borderRadius: '8px',
          padding: '0.75rem',
          marginBottom: '0.75rem'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <div style={{
            fontSize: '0.75rem',
            color: 'var(--primary-600)'
          }}>
            Total
          </div>
          <div style={{
            fontSize: '0.875rem',
            fontWeight: '700',
            color: 'var(--primary-800)'
          }}>
            {formatCurrency(cuenta.total, cuenta.moneda)}
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div style={{
            fontSize: '0.75rem',
            color: 'var(--primary-600)'
          }}>
            Saldo
          </div>
          <div style={{
            fontSize: '1rem',
            fontWeight: '700',
            color: cuenta.saldo > 0 ? '#ef4444' : '#10b981'
          }}>
            {formatCurrency(cuenta.saldo, cuenta.moneda)}
          </div>
        </div>
      </div>

      {/* Due Date */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        fontSize: '0.75rem',
        marginBottom: '0.75rem'
      }}>
        <Clock size={14} style={{ color: 'var(--primary-500)' }} />
        <div>
          <span style={{ color: 'var(--primary-500)' }}>Vence: </span>
          <span style={{ fontWeight: '500', color: 'var(--primary-700)' }}>
            {formatDate(cuenta.fecha_vencimiento)}
          </span>
        </div>
      </div>

      {/* Overdue Warning */}
      {(isOverdue || isDueSoon) && cuenta.estado !== 'PAGADA' && cuenta.estado !== 'ANULADA' && (
        <div style={{
          background: isOverdue ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)',
          color: isOverdue ? '#ef4444' : '#f59e0b',
          padding: '0.5rem',
          borderRadius: '6px',
          fontSize: '0.75rem',
          fontWeight: '600',
          marginBottom: '0.75rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <AlertCircle size={14} />
          {isOverdue 
            ? `Vencido hace ${Math.abs(daysUntilDue)} días`
            : `Vence en ${daysUntilDue} días`
          }
        </div>
      )}

      {/* Status Badge */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: '0.75rem',
        borderTop: '1px solid var(--primary-200)'
      }}>
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.25rem',
          padding: '0.25rem 0.75rem',
          borderRadius: '9999px',
          fontSize: '0.75rem',
          fontWeight: '500',
          background: config?.color || '#6b7280',
          color: 'white'
        }}>
          <Icon size={14} />
          {config?.label || cuenta.estado}
        </span>

        {onClick && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onClick()
            }}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              border: 'none',
              background: 'var(--blue-500)',
              color: 'white',
              cursor: 'pointer',
              fontSize: '0.75rem',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
              transition: 'all 0.2s ease'
            }}
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
