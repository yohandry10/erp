'use client'

import { DollarSign, TrendingUp, TrendingDown } from 'lucide-react'
import PresupuestoEjecucionIndicator, { getEjecucionColor } from './PresupuestoEjecucionIndicator'

interface PresupuestoEjecucionCardProps {
  titulo: string
  subtitulo?: string
  montoPresupuestado: number
  montoEjecutado: number
  montoDisponible: number
  porcentajeEjecutado: number
  onClick?: () => void
}

export default function PresupuestoEjecucionCard({
  titulo,
  subtitulo,
  montoPresupuestado,
  montoEjecutado,
  montoDisponible,
  porcentajeEjecutado,
  onClick
}: PresupuestoEjecucionCardProps) {
  
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN',
      minimumFractionDigits: 2
    }).format(amount)
  }

  const isOverBudget = montoDisponible < 0

  return (
    <div
      onClick={onClick}
      style={{
        background: 'white',
        borderRadius: '12px',
        padding: '1.5rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.2s ease',
        border: `2px solid ${getEjecucionColor(porcentajeEjecutado)}20`
      }}
      onMouseEnter={(e) => {
        if (onClick) {
          e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)'
          e.currentTarget.style.transform = 'translateY(-2px)'
        }
      }}
      onMouseLeave={(e) => {
        if (onClick) {
          e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)'
          e.currentTarget.style.transform = 'translateY(0)'
        }
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <DollarSign size={18} style={{ color: getEjecucionColor(porcentajeEjecutado) }} />
            <h3 style={{ 
              margin: 0, 
              fontSize: '1rem', 
              fontWeight: '600', 
              color: '#111827',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {titulo}
            </h3>
          </div>
          {subtitulo && (
            <p style={{ 
              margin: 0, 
              fontSize: '0.75rem', 
              color: '#6b7280',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {subtitulo}
            </p>
          )}
        </div>
        <PresupuestoEjecucionIndicator
          porcentajeEjecutado={porcentajeEjecutado}
          size="sm"
          showLabel={true}
          showPercentage={false}
          showProgressBar={false}
        />
      </div>

      {/* Amounts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
        <div>
          <p style={{ margin: 0, fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
            Presupuestado
          </p>
          <p style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#111827' }}>
            {formatCurrency(montoPresupuestado)}
          </p>
        </div>
        <div>
          <p style={{ margin: 0, fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
            Ejecutado
          </p>
          <p style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: getEjecucionColor(porcentajeEjecutado) }}>
            {formatCurrency(montoEjecutado)}
          </p>
        </div>
      </div>

      {/* Progress Bar */}
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
            Ejecución
          </span>
          <span style={{ 
            fontSize: '0.875rem', 
            fontWeight: '700', 
            color: getEjecucionColor(porcentajeEjecutado)
          }}>
            {porcentajeEjecutado.toFixed(1)}%
          </span>
        </div>
        <div style={{
          width: '100%',
          height: '8px',
          background: '#e5e7eb',
          borderRadius: '9999px',
          overflow: 'hidden'
        }}>
          <div style={{
            width: `${Math.min(porcentajeEjecutado, 100)}%`,
            height: '100%',
            background: getEjecucionColor(porcentajeEjecutado),
            transition: 'width 0.3s ease'
          }} />
        </div>
      </div>

      {/* Available Amount */}
      <div style={{
        padding: '0.75rem',
        borderRadius: '8px',
        background: isOverBudget ? '#fee2e2' : '#d1fae5',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {isOverBudget ? (
            <TrendingUp size={16} style={{ color: '#dc2626' }} />
          ) : (
            <TrendingDown size={16} style={{ color: '#059669' }} />
          )}
          <span style={{ 
            fontSize: '0.75rem', 
            fontWeight: '600',
            color: isOverBudget ? '#991b1b' : '#065f46'
          }}>
            {isOverBudget ? 'Sobregiro' : 'Disponible'}
          </span>
        </div>
        <span style={{ 
          fontSize: '0.875rem', 
          fontWeight: '700',
          color: isOverBudget ? '#dc2626' : '#059669'
        }}>
          {formatCurrency(Math.abs(montoDisponible))}
        </span>
      </div>
    </div>
  )
}
