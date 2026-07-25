'use client'

import { useCallback, useEffect, useState } from 'react'
import { useApi } from '@/hooks/use-api'
import { Calendar, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { formatDate } from '@/lib/format-utils'

interface ConciliacionPendiente {
  id: string
  cuenta_bancaria_id: string
  cuenta_nombre: string
  banco: string
  numero_cuenta: string
  fecha_desde: string
  fecha_hasta: string
  estado: 'ABIERTA' | 'EN_PROCESO' | 'CERRADA'
  saldo_inicial: number
  saldo_final_sistema: number
  saldo_final_extracto: number
  diferencia: number
  moneda: string
  items_sistema: number
  items_extracto: number
  items_conciliados: number
  porcentaje_avance: number
  created_at: string
}

export default function ConciliacionesPendientesReport() {
  const { get } = useApi()
  const router = useRouter()
  const [conciliaciones, setConciliaciones] = useState<ConciliacionPendiente[]>([])
  const [loading, setLoading] = useState(true)

  const loadConciliaciones = useCallback(async () => {
    try {
      setLoading(true)
      const response = await get('/api/finanzas/conciliacion/pendientes')

      if (response?.success) {
        setConciliaciones(response.data || [])
      }
    } catch (error) {
      console.error('Error loading conciliaciones:', error)
    } finally {
      setLoading(false)
    }
  }, [get])

  useEffect(() => {
    loadConciliaciones()
  }, [loadConciliaciones])

  const formatCurrency = (amount: number, currency: string = 'PEN') => {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: currency,
    }).format(amount)
  }

  const getEstadoColor = (estado: string) => {
    switch (estado) {
      case 'ABIERTA':
        return { bg: 'rgba(59, 130, 246, 0.1)', color: '#2563eb' }
      case 'EN_PROCESO':
        return { bg: 'rgba(245, 158, 11, 0.1)', color: '#d97706' }
      case 'CERRADA':
        return { bg: 'rgba(16, 185, 129, 0.1)', color: '#059669' }
      default:
        return { bg: 'rgba(107, 114, 128, 0.1)', color: '#6b7280' }
    }
  }

  const getAvanceColor = (porcentaje: number) => {
    if (porcentaje >= 80) return '#10b981'
    if (porcentaje >= 50) return '#f59e0b'
    return '#ef4444'
  }

  if (loading) {
    return (
      <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl p-8 text-center">
        <div className="inline-block size-8 animate-spin rounded-full border-[3px] border-muted border-t-primary"></div>
        <p className="text-muted-foreground">Cargando conciliaciones pendientes...</p>
      </div>
    )
  }

  if (conciliaciones.length === 0) {
    return (
      <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl p-12 text-center">
        <CheckCircle2 size={48} className="text-[#10b981]" />
        <h3 className="text-[1.125rem] font-semibold mb-2 text-foreground/85">
          No hay conciliaciones pendientes
        </h3>
        <p className="text-muted-foreground">
          Todas las conciliaciones están cerradas
        </p>
      </div>
    )
  }

  return (
    <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl">
      {/* Header */}
      <div className="flex justify-between items-center mb-6 pb-4 border-b">
        <div className="flex items-center gap-3">
          <Calendar size={24} className="text-[#8b5cf6]" />
          <div>
            <h3 className="text-[1.125rem] font-semibold text-foreground">
              Conciliaciones Pendientes
            </h3>
            <p className="text-[0.875rem] text-muted-foreground mt-1">
              {conciliaciones.length} conciliación{conciliaciones.length !== 1 ? 'es' : ''} en proceso
            </p>
          </div>
        </div>
        <button
          onClick={loadConciliaciones} className="py-2 px-4 rounded-[6px] border bg-card cursor-pointer flex items-center gap-2 text-[0.875rem] font-medium"
        >
          <RefreshCw size={16} />
          Actualizar
        </button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-[repeat(auto-fit,_minmax(200px,_1fr))] gap-4 mb-8">
        <div className="p-4 rounded-lg text-white">
          <div className="text-xs font-semibold opacity-[0.9]">
            Total Pendientes
          </div>
          <div className="text-[1.75rem] font-bold mt-2">
            {conciliaciones.length}
          </div>
          <div className="text-[0.875rem] mt-1 opacity-[0.9]">
            Conciliaciones abiertas
          </div>
        </div>

        <div className="p-4 rounded-lg bg-[rgba(245,_158,_11,_0.1)] border">
          <div className="text-xs font-semibold text-[#92400e]">
            Avance Promedio
          </div>
          <div className="text-2xl font-bold mt-2 text-[#d97706]">
            {Math.round(conciliaciones.reduce((sum, c) => sum + c.porcentaje_avance, 0) / conciliaciones.length)}%
          </div>
          <div className="text-[0.875rem] mt-1 text-[#92400e]">
            De conciliación
          </div>
        </div>
      </div>

      {/* Conciliaciones List */}
      <div className="flex flex-col gap-4">
        {conciliaciones.map((conciliacion) => {
          const estadoStyle = getEstadoColor(conciliacion.estado)
          const avanceColor = getAvanceColor(conciliacion.porcentaje_avance)

          return (
            <div
              key={conciliacion.id}
              onClick={() => router.push(`/dashboard/finanzas/conciliacion/${conciliacion.id}`)} className="p-6 rounded-xl border bg-card cursor-pointer transition"
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'
                e.currentTarget.style.transform = 'translateY(-2px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = 'none'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              <div className="flex justify-between mb-4">
                <div>
                  <h4 className="text-base font-semibold text-foreground mb-1">
                    {conciliacion.cuenta_nombre}
                  </h4>
                  <p className="text-[0.875rem] text-muted-foreground">
                    {conciliacion.banco} • {conciliacion.numero_cuenta}
                  </p>
                </div>
                <span className="py-1 px-3 rounded-full text-xs font-semibold">
                  {conciliacion.estado}
                </span>
              </div>

              <div className="grid grid-cols-[repeat(auto-fit,_minmax(150px,_1fr))] gap-4 mb-4">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">
                    Período
                  </div>
                  <div className="text-[0.875rem] font-medium">
                    {formatDate(conciliacion.fecha_desde)} - {formatDate(conciliacion.fecha_hasta)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">
                    Diferencia
                  </div>
                  <div className="text-[0.875rem] font-semibold">
                    {formatCurrency(conciliacion.diferencia, conciliacion.moneda)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">
                    Items Conciliados
                  </div>
                  <div className="text-[0.875rem] font-medium">
                    {conciliacion.items_conciliados} de {conciliacion.items_sistema + conciliacion.items_extracto}
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-semibold text-muted-foreground">
                    Avance de Conciliación
                  </span>
                  <span className="text-[0.875rem] font-bold">
                    {conciliacion.porcentaje_avance.toFixed(0)}%
                  </span>
                </div>
                <div className="w-[100%] h-2 bg-[rgba(0,0,0,0.05)] rounded-full overflow-hidden">
                  <div className="h-[100%] transition" />
                </div>
              </div>

              {Math.abs(conciliacion.diferencia) > 0.01 && (
                <div className="mt-4 p-3 rounded-[6px] bg-destructive/10 flex items-center gap-2">
                  <AlertCircle size={16} className="text-destructive" />
                  <span className="text-xs text-destructive">
                    Hay diferencias sin resolver
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
