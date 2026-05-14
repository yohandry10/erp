'use client'

import { useCallback, useEffect, useState } from 'react'
import { useApi } from '@/hooks/use-api'
import { Calendar, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-PE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    })
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
      <div className="activity-card" style={{ padding: '2rem', textAlign: 'center' }}>
        <div className="loading-spinner" style={{ margin: '0 auto 1rem' }}></div>
        <p style={{ color: '#6b7280' }}>Cargando conciliaciones pendientes...</p>
      </div>
    )
  }

  if (conciliaciones.length === 0) {
    return (
      <div className="activity-card" style={{ padding: '3rem', textAlign: 'center' }}>
        <CheckCircle2 size={48} style={{ margin: '0 auto 1rem', color: '#10b981' }} />
        <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.5rem', color: '#374151' }}>
          No hay conciliaciones pendientes
        </h3>
        <p style={{ color: '#6b7280' }}>
          Todas las conciliaciones están cerradas
        </p>
      </div>
    )
  }

  return (
    <div className="activity-card">
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '1.5rem',
        paddingBottom: '1rem',
        borderBottom: '1px solid rgba(0,0,0,0.1)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Calendar size={24} style={{ color: '#8b5cf6' }} />
          <div>
            <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#111827' }}>
              Conciliaciones Pendientes
            </h3>
            <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
              {conciliaciones.length} conciliación{conciliaciones.length !== 1 ? 'es' : ''} en proceso
            </p>
          </div>
        </div>
        <button
          onClick={loadConciliaciones}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            border: '1px solid #d1d5db',
            background: 'white',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.875rem',
            fontWeight: '500'
          }}
        >
          <RefreshCw size={16} />
          Actualizar
        </button>
      </div>

      {/* Summary Stats */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1rem',
        marginBottom: '2rem'
      }}>
        <div style={{
          padding: '1rem',
          borderRadius: '8px',
          background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
          color: 'white'
        }}>
          <div style={{ fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase', opacity: 0.9 }}>
            Total Pendientes
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: '700', marginTop: '0.5rem' }}>
            {conciliaciones.length}
          </div>
          <div style={{ fontSize: '0.875rem', marginTop: '0.25rem', opacity: 0.9 }}>
            Conciliaciones abiertas
          </div>
        </div>

        <div style={{
          padding: '1rem',
          borderRadius: '8px',
          background: 'rgba(245, 158, 11, 0.1)',
          border: '1px solid rgba(245, 158, 11, 0.2)'
        }}>
          <div style={{ fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase', color: '#92400e' }}>
            Avance Promedio
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', marginTop: '0.5rem', color: '#d97706' }}>
            {Math.round(conciliaciones.reduce((sum, c) => sum + c.porcentaje_avance, 0) / conciliaciones.length)}%
          </div>
          <div style={{ fontSize: '0.875rem', marginTop: '0.25rem', color: '#92400e' }}>
            De conciliación
          </div>
        </div>
      </div>

      {/* Conciliaciones List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {conciliaciones.map((conciliacion) => {
          const estadoStyle = getEstadoColor(conciliacion.estado)
          const avanceColor = getAvanceColor(conciliacion.porcentaje_avance)
          
          return (
            <div
              key={conciliacion.id}
              onClick={() => router.push(`/dashboard/finanzas/conciliacion/${conciliacion.id}`)}
              style={{
                padding: '1.5rem',
                borderRadius: '12px',
                border: '1px solid rgba(0,0,0,0.1)',
                background: 'white',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'
                e.currentTarget.style.transform = 'translateY(-2px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = 'none'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                <div>
                  <h4 style={{ fontSize: '1rem', fontWeight: '600', color: '#111827', marginBottom: '0.25rem' }}>
                    {conciliacion.cuenta_nombre}
                  </h4>
                  <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                    {conciliacion.banco} • {conciliacion.numero_cuenta}
                  </p>
                </div>
                <span style={{
                  padding: '0.25rem 0.75rem',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  background: estadoStyle.bg,
                  color: estadoStyle.color
                }}>
                  {conciliacion.estado}
                </span>
              </div>

              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: '1rem',
                marginBottom: '1rem'
              }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                    Período
                  </div>
                  <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>
                    {formatDate(conciliacion.fecha_desde)} - {formatDate(conciliacion.fecha_hasta)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                    Diferencia
                  </div>
                  <div style={{ 
                    fontSize: '0.875rem', 
                    fontWeight: '600',
                    color: Math.abs(conciliacion.diferencia) > 0.01 ? '#ef4444' : '#10b981'
                  }}>
                    {formatCurrency(conciliacion.diferencia, conciliacion.moneda)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                    Items Conciliados
                  </div>
                  <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>
                    {conciliacion.items_conciliados} de {conciliacion.items_sistema + conciliacion.items_extracto}
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div>
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  marginBottom: '0.5rem'
                }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#6b7280' }}>
                    Avance de Conciliación
                  </span>
                  <span style={{ fontSize: '0.875rem', fontWeight: '700', color: avanceColor }}>
                    {conciliacion.porcentaje_avance.toFixed(0)}%
                  </span>
                </div>
                <div style={{
                  width: '100%',
                  height: '8px',
                  background: 'rgba(0,0,0,0.05)',
                  borderRadius: '9999px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${conciliacion.porcentaje_avance}%`,
                    height: '100%',
                    background: avanceColor,
                    transition: 'width 0.5s ease'
                  }} />
                </div>
              </div>

              {Math.abs(conciliacion.diferencia) > 0.01 && (
                <div style={{
                  marginTop: '1rem',
                  padding: '0.75rem',
                  borderRadius: '6px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  <AlertCircle size={16} style={{ color: '#dc2626' }} />
                  <span style={{ fontSize: '0.75rem', color: '#991b1b' }}>
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
