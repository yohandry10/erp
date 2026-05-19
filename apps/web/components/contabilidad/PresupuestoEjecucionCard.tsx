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
      onClick={onClick} className="bg-white rounded-3 p-6 shadow transition"
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
      <div className="flex justify-between items-start mb-4">
        <div className="flex-[1]">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign size={18} />
            <h3 className="m-0 text-4 font-semibold text-gray-900 overflow-hidden text-ellipsis whitespace-nowrap">
              {titulo}
            </h3>
          </div>
          {subtitulo && (
            <p className="m-0 text-3 text-gray-500 overflow-hidden text-ellipsis whitespace-nowrap">
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
      <div className="grid grid-cols-[1fr_1fr] gap-4 mb-4">
        <div>
          <p className="m-0 text-3 text-gray-500 mb-1">
            Presupuestado
          </p>
          <p className="m-0 text-4 font-bold text-gray-900">
            {formatCurrency(montoPresupuestado)}
          </p>
        </div>
        <div>
          <p className="m-0 text-3 text-gray-500 mb-1">
            Ejecutado
          </p>
          <p className="m-0 text-4 font-bold">
            {formatCurrency(montoEjecutado)}
          </p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-3 text-gray-500">
            Ejecución
          </span>
          <span className="text-[0.875rem] font-bold">
            {porcentajeEjecutado.toFixed(1)}%
          </span>
        </div>
        <div className="w-[100%] h-2 bg-[#e5e7eb] rounded-full overflow-hidden">
          <div className="h-[100%] transition" />
        </div>
      </div>

      {/* Available Amount */}
      <div className="p-3 rounded-2 flex justify-between items-center">
        <div className="flex items-center gap-2">
          {isOverBudget ? (
            <TrendingUp size={16} className="text-red-600" />
          ) : (
            <TrendingDown size={16} className="text-emerald-600" />
          )}
          <span className="text-3 font-semibold">
            {isOverBudget ? 'Sobregiro' : 'Disponible'}
          </span>
        </div>
        <span className="text-[0.875rem] font-bold">
          {formatCurrency(Math.abs(montoDisponible))}
        </span>
      </div>
    </div>
  )
}
