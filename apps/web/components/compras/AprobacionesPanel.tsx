'use client'

import { useCallback, useEffect, useState } from 'react'
import { useApi } from '@/hooks/use-api'
import {
  CheckCircle,
  XCircle,
  Clock,
  User,
  MessageSquare,
  Calendar,
  AlertCircle
} from 'lucide-react'

interface Aprobacion {
  id: string
  orden_id: string
  nivel: number
  aprobador_id: string
  aprobador_nombre: string
  estado: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA'
  fecha_aprobacion?: string
  comentarios?: string
  created_at: string
}

interface AprobacionesPanelProps {
  ordenId: string
  estadoOrden: string
}

const ESTADO_CONFIG = {
  PENDIENTE: {
    label: 'Pendiente',
    color: '#f59e0b',
    bgColor: 'rgba(245, 158, 11, 0.1)',
    icon: Clock
  },
  APROBADA: {
    label: 'Aprobada',
    color: '#10b981',
    bgColor: 'rgba(16, 185, 129, 0.1)',
    icon: CheckCircle
  },
  RECHAZADA: {
    label: 'Rechazada',
    color: '#ef4444',
    bgColor: 'rgba(239, 68, 68, 0.1)',
    icon: XCircle
  }
}

export default function AprobacionesPanel({ ordenId, estadoOrden }: AprobacionesPanelProps) {
  const { get } = useApi()
  const [aprobaciones, setAprobaciones] = useState<Aprobacion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadAprobaciones = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await get(`/api/compras/ordenes/${ordenId}/aprobaciones`)

      if (response?.success && response.data) {
        setAprobaciones(response.data)
      } else {
        setError('No se pudieron cargar las aprobaciones')
      }
    } catch (err: any) {
      console.error('Error loading aprobaciones:', err)
      setError(err.message || 'Error al cargar las aprobaciones')
    } finally {
      setLoading(false)
    }
  }, [get, ordenId])

  useEffect(() => {
    loadAprobaciones()
  }, [loadAprobaciones])

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-PE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getEstadoBadge = (estado: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA') => {
    const config = ESTADO_CONFIG[estado]
    const Icon = config.icon

    return (
      <span className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-full text-xs font-semibold">
        <Icon size={14} />
        {config.label}
      </span>
    )
  }

  // No mostrar el panel si la orden no está en proceso de aprobación o no tiene aprobaciones
  if (!loading && aprobaciones.length === 0 && estadoOrden !== 'APROBACION') {
    return null
  }

  if (loading) {
    return (
      <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl">
        <div className="flex items-center gap-3 mb-6 pb-4">
          <div className="w-10 h-10 rounded-[0.625rem] bg-[var(--blue-100)] flex items-center justify-center text-[var(--blue-600)]">
            <CheckCircle size={20} />
          </div>
          <h2 className="text-[1.125rem] font-bold text-[var(--primary-800)] m-0">
            Aprobaciones
          </h2>
        </div>
        <div className="text-center p-8 text-[var(--primary-400)]">
          <div className="inline-block size-8 animate-spin rounded-full border-[3px] border-muted border-t-primary"></div>
          <p className="text-[0.875rem]">Cargando aprobaciones...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl">
        <div className="flex items-center gap-3 mb-6 pb-4">
          <div className="w-10 h-10 rounded-[0.625rem] bg-[var(--blue-100)] flex items-center justify-center text-[var(--blue-600)]">
            <CheckCircle size={20} />
          </div>
          <h2 className="text-[1.125rem] font-bold text-[var(--primary-800)] m-0">
            Aprobaciones
          </h2>
        </div>
        <div className="text-center p-8 text-[var(--red-500)]">
          <AlertCircle size={32} />
          <p className="text-[0.875rem]">{error}</p>
        </div>
      </div>
    )
  }

  const pendientes = aprobaciones.filter(a => a.estado === 'PENDIENTE').length
  const aprobadas = aprobaciones.filter(a => a.estado === 'APROBADA').length
  const rechazadas = aprobaciones.filter(a => a.estado === 'RECHAZADA').length

  return (
    <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl">
      <div className="flex items-center gap-3 mb-6 pb-4">
        <div className="w-10 h-10 rounded-[0.625rem] bg-[var(--blue-100)] flex items-center justify-center text-[var(--blue-600)]">
          <CheckCircle size={20} />
        </div>
        <div className="flex-[1]">
          <h2 className="text-[1.125rem] font-bold text-[var(--primary-800)] m-0">
            Aprobaciones
          </h2>
          <p className="text-xs text-[var(--primary-500)] m-0">
            {aprobadas} de {aprobaciones.length} aprobadas
          </p>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-[repeat(3,_1fr)] gap-3 mb-6">
        <div className="p-3 rounded-lg bg-[var(--amber-50)] border">
          <div className="text-xs text-[var(--amber-600)] mb-1">
            Pendientes
          </div>
          <div className="text-2xl font-bold text-[var(--amber-600)]">
            {pendientes}
          </div>
        </div>

        <div className="p-3 rounded-lg bg-[var(--emerald-50)] border">
          <div className="text-xs text-[var(--emerald-600)] mb-1">
            Aprobadas
          </div>
          <div className="text-2xl font-bold text-[var(--emerald-600)]">
            {aprobadas}
          </div>
        </div>

        <div className="p-3 rounded-lg bg-[var(--red-500)10] border">
          <div className="text-xs text-[var(--red-500)] mb-1">
            Rechazadas
          </div>
          <div className="text-2xl font-bold text-[var(--red-500)]">
            {rechazadas}
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      {aprobaciones.length > 0 && (
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-semibold text-[var(--primary-600)]">
              Progreso de Aprobación
            </span>
            <span className="text-xs font-bold text-[var(--emerald-600)]">
              {((aprobadas / aprobaciones.length) * 100).toFixed(0)}%
            </span>
          </div>
          <div className="w-[100%] h-2 bg-[var(--primary-100)] rounded-full overflow-hidden">
            <div className="h-[100%] transition" />
          </div>
        </div>
      )}

      {/* Approvals List */}
      <div className="flex flex-col gap-3">
        {aprobaciones.map((aprobacion) => (
          <div
            key={aprobacion.id} className="p-4 rounded-lg bg-[var(--primary-50)] border transition"
          >
            <div className="flex justify-between items-start mb-3">
              <div className="flex items-center gap-2 flex-[1]">
                <div className="w-8 h-8 rounded-full bg-[var(--blue-100)] flex items-center justify-center text-[var(--blue-600)] text-xs font-semibold">
                  <User size={16} />
                </div>
                <div className="flex-[1]">
                  <div className="text-[0.875rem] font-semibold text-[var(--primary-800)]">
                    {aprobacion.aprobador_nombre}
                  </div>
                  <div className="text-xs text-[var(--primary-500)]">
                    Nivel {aprobacion.nivel}
                  </div>
                </div>
              </div>
              {getEstadoBadge(aprobacion.estado)}
            </div>

            {aprobacion.fecha_aprobacion && (
              <div className="flex items-center gap-1.5 mb-2 text-xs text-[var(--primary-600)]">
                <Calendar size={12} />
                {formatDate(aprobacion.fecha_aprobacion)}
              </div>
            )}

            {aprobacion.comentarios && (
              <div className="mt-3 p-3 rounded-[6px] bg-card border">
                <div className="flex items-center gap-1.5 mb-1.5 text-xs font-semibold text-[var(--primary-600)]">
                  <MessageSquare size={12} />
                  Comentarios
                </div>
                <p className="text-xs text-[var(--primary-700)] m-0 leading-6">
                  {aprobacion.comentarios}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      {aprobaciones.length === 0 && (
        <div className="text-center p-8 text-[var(--primary-400)] text-[0.875rem]">
          No hay registros de aprobación para esta orden
        </div>
      )}
    </div>
  )
}
