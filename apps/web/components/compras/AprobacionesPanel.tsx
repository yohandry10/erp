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
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.375rem',
        padding: '0.375rem 0.75rem',
        borderRadius: '9999px',
        fontSize: '0.75rem',
        fontWeight: '600',
        background: config.bgColor,
        color: config.color,
        border: `1px solid ${config.color}40`
      }}>
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
      <div className="activity-card">
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          marginBottom: '1.5rem',
          paddingBottom: '1rem',
          borderBottom: '2px solid var(--primary-100)'
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: 'var(--blue-100)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--blue-600)'
          }}>
            <CheckCircle size={20} />
          </div>
          <h2 style={{ fontSize: '1.125rem', fontWeight: '700', color: 'var(--primary-800)', margin: 0 }}>
            Aprobaciones
          </h2>
        </div>
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--primary-400)' }}>
          <div className="loading-spinner" style={{ margin: '0 auto 1rem' }}></div>
          <p style={{ fontSize: '0.875rem' }}>Cargando aprobaciones...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="activity-card">
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          marginBottom: '1.5rem',
          paddingBottom: '1rem',
          borderBottom: '2px solid var(--primary-100)'
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: 'var(--blue-100)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--blue-600)'
          }}>
            <CheckCircle size={20} />
          </div>
          <h2 style={{ fontSize: '1.125rem', fontWeight: '700', color: 'var(--primary-800)', margin: 0 }}>
            Aprobaciones
          </h2>
        </div>
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--red-500)' }}>
          <AlertCircle size={32} style={{ margin: '0 auto 0.5rem' }} />
          <p style={{ fontSize: '0.875rem' }}>{error}</p>
        </div>
      </div>
    )
  }

  const pendientes = aprobaciones.filter(a => a.estado === 'PENDIENTE').length
  const aprobadas = aprobaciones.filter(a => a.estado === 'APROBADA').length
  const rechazadas = aprobaciones.filter(a => a.estado === 'RECHAZADA').length

  return (
    <div className="activity-card">
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        marginBottom: '1.5rem',
        paddingBottom: '1rem',
        borderBottom: '2px solid var(--primary-100)'
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          borderRadius: '10px',
          background: 'var(--blue-100)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--blue-600)'
        }}>
          <CheckCircle size={20} />
        </div>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: '700', color: 'var(--primary-800)', margin: 0 }}>
            Aprobaciones
          </h2>
          <p style={{ fontSize: '0.75rem', color: 'var(--primary-500)', margin: 0 }}>
            {aprobadas} de {aprobaciones.length} aprobadas
          </p>
        </div>
      </div>

      {/* Summary Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '0.75rem',
        marginBottom: '1.5rem'
      }}>
        <div style={{
          padding: '0.75rem',
          borderRadius: '8px',
          background: 'var(--amber-50)',
          border: '1px solid var(--amber-500)40'
        }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--amber-600)', marginBottom: '0.25rem' }}>
            Pendientes
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--amber-600)' }}>
            {pendientes}
          </div>
        </div>

        <div style={{
          padding: '0.75rem',
          borderRadius: '8px',
          background: 'var(--emerald-50)',
          border: '1px solid var(--emerald-500)40'
        }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--emerald-600)', marginBottom: '0.25rem' }}>
            Aprobadas
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--emerald-600)' }}>
            {aprobadas}
          </div>
        </div>

        <div style={{
          padding: '0.75rem',
          borderRadius: '8px',
          background: 'var(--red-500)10',
          border: '1px solid var(--red-500)40'
        }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--red-500)', marginBottom: '0.25rem' }}>
            Rechazadas
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--red-500)' }}>
            {rechazadas}
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      {aprobaciones.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.5rem'
          }}>
            <span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--primary-600)' }}>
              Progreso de Aprobación
            </span>
            <span style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--emerald-600)' }}>
              {((aprobadas / aprobaciones.length) * 100).toFixed(0)}%
            </span>
          </div>
          <div style={{
            width: '100%',
            height: '8px',
            background: 'var(--primary-100)',
            borderRadius: '9999px',
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${(aprobadas / aprobaciones.length) * 100}%`,
              height: '100%',
              background: rechazadas > 0
                ? 'linear-gradient(90deg, var(--red-500), var(--red-600))'
                : 'linear-gradient(90deg, var(--emerald-500), var(--emerald-600))',
              transition: 'width 0.3s ease'
            }} />
          </div>
        </div>
      )}

      {/* Approvals List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {aprobaciones.map((aprobacion) => (
          <div
            key={aprobacion.id}
            style={{
              padding: '1rem',
              borderRadius: '8px',
              background: 'var(--primary-50)',
              border: '1px solid var(--primary-200)',
              transition: 'all 0.2s ease'
            }}
          >
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: '0.75rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: 'var(--blue-100)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--blue-600)',
                  fontSize: '0.75rem',
                  fontWeight: '600'
                }}>
                  <User size={16} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--primary-800)' }}>
                    {aprobacion.aprobador_nombre}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--primary-500)' }}>
                    Nivel {aprobacion.nivel}
                  </div>
                </div>
              </div>
              {getEstadoBadge(aprobacion.estado)}
            </div>

            {aprobacion.fecha_aprobacion && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
                marginBottom: '0.5rem',
                fontSize: '0.75rem',
                color: 'var(--primary-600)'
              }}>
                <Calendar size={12} />
                {formatDate(aprobacion.fecha_aprobacion)}
              </div>
            )}

            {aprobacion.comentarios && (
              <div style={{
                marginTop: '0.75rem',
                padding: '0.75rem',
                borderRadius: '6px',
                background: 'white',
                border: '1px solid var(--primary-200)'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  marginBottom: '0.375rem',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  color: 'var(--primary-600)'
                }}>
                  <MessageSquare size={12} />
                  Comentarios
                </div>
                <p style={{
                  fontSize: '0.75rem',
                  color: 'var(--primary-700)',
                  margin: 0,
                  lineHeight: '1.5'
                }}>
                  {aprobacion.comentarios}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      {aprobaciones.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '2rem',
          color: 'var(--primary-400)',
          fontSize: '0.875rem'
        }}>
          No hay registros de aprobación para esta orden
        </div>
      )}
    </div>
  )
}
