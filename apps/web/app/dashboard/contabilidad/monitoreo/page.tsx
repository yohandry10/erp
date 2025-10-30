'use client'

import { useState, useEffect } from 'react'
import { Activity, CheckCircle, Clock, AlertTriangle, XCircle, RefreshCw } from 'lucide-react'

interface EventStats {
  pending: number
  processed: number
  processed_today: number
  failed: number
  dead_letter: number
  avg_processing_time_ms: number | null
}

interface EventoFallido {
  id: string
  event_id: string
  event_type: string
  error_message: string | null
  retry_count: number
  status: string
  created_at: string
}

interface AsientoPorTipo {
  tipo: string
  cantidad: number
}

export default function MonitoreoPage() {
  const [stats, setStats] = useState<EventStats>({
    pending: 0,
    processed: 0,
    processed_today: 0,
    failed: 0,
    dead_letter: 0,
    avg_processing_time_ms: null
  })
  const [eventosFallidos, setEventosFallidos] = useState<EventoFallido[]>([])
  const [asientosPorTipo, setAsientosPorTipo] = useState<AsientoPorTipo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    fetchData()
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [])

  const fetchData = async () => {
    try {
      setError(null)
      
      // Fetch statistics
      const statsResponse = await fetch('/api/contabilidad/eventos/estadisticas', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      if (statsResponse.ok) {
        const statsResult = await statsResponse.json()
        setStats(statsResult.data || stats)
      }

      // Fetch failed events
      const failedResponse = await fetch('/api/contabilidad/eventos/fallidos?limit=10', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      if (failedResponse.ok) {
        const failedResult = await failedResponse.json()
        setEventosFallidos(failedResult.data || [])
      }

      // Fetch asientos por tipo
      const asientosTipoResponse = await fetch('/api/contabilidad/asientos/estadisticas/por-tipo', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      if (asientosTipoResponse.ok) {
        const asientosTipoResult = await asientosTipoResponse.json()
        setAsientosPorTipo(asientosTipoResult.data || [])
      }
    } catch (err) {
      console.error('Error fetching monitoring data:', err)
      setError('Error al cargar datos de monitoreo')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const handleRefresh = () => {
    setRefreshing(true)
    fetchData()
  }

  const handleRetry = async (eventId: string) => {
    try {
      const response = await fetch(`/api/contabilidad/eventos/${eventId}/reintentar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        // Refresh data after retry
        fetchData()
      } else {
        console.error('Error retrying event')
      }
    } catch (err) {
      console.error('Error retrying event:', err)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleString('es-PE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getEventTypeLabel = (eventType: string) => {
    const labels: Record<string, string> = {
      'VentaFacturada': 'Venta Facturada',
      'CobroRegistrado': 'Cobro Registrado',
      'RecepcionRegistrada': 'Recepción Registrada',
      'PagoProveedorRegistrado': 'Pago Proveedor',
      'AjusteInventarioAplicado': 'Ajuste Inventario',
      'PlanillaLiquidada': 'Planilla Liquidada',
      'DepreciacionGenerada': 'Depreciación'
    }
    return labels[eventType] || eventType
  }

  const formatProcessingTime = (ms: number | null) => {
    if (ms === null || ms === undefined) {
      return 'N/A'
    }
    
    if (ms < 1000) {
      return `${ms}ms`
    } else if (ms < 60000) {
      return `${(ms / 1000).toFixed(1)}s`
    } else {
      const minutes = Math.floor(ms / 60000)
      const seconds = Math.floor((ms % 60000) / 1000)
      return `${minutes}m ${seconds}s`
    }
  }

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-header">
          <h1 className="dashboard-title">Monitoreo de Eventos Contables</h1>
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '3rem',
          color: '#6b7280'
        }}>
          <Activity className="animate-spin" size={24} style={{ marginRight: '0.5rem' }} />
          Cargando datos de monitoreo...
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1 className="dashboard-title">Monitoreo de Eventos Contables</h1>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 1rem',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: refreshing ? 'not-allowed' : 'pointer',
            opacity: refreshing ? 0.6 : 1
          }}
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {error && (
        <div style={{
          padding: '1rem',
          backgroundColor: '#fee2e2',
          border: '1px solid #fecaca',
          borderRadius: '0.375rem',
          color: '#991b1b',
          marginBottom: '1.5rem'
        }}>
          {error}
        </div>
      )}

      {/* Metrics Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1rem',
        marginBottom: '2rem'
      }}>
        {/* Eventos Pendientes */}
        <div style={{
          backgroundColor: 'white',
          padding: '1.5rem',
          borderRadius: '0.5rem',
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.875rem', color: '#6b7280', fontWeight: 500 }}>Eventos Pendientes</span>
            <Clock size={20} style={{ color: '#f59e0b' }} />
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#111827' }}>
            {stats.pending}
          </div>
        </div>

        {/* Eventos Procesados Hoy */}
        <div style={{
          backgroundColor: 'white',
          padding: '1.5rem',
          borderRadius: '0.5rem',
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.875rem', color: '#6b7280', fontWeight: 500 }}>Procesados Hoy</span>
            <CheckCircle size={20} style={{ color: '#10b981' }} />
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#111827' }}>
            {stats.processed_today}
          </div>
        </div>

        {/* Eventos con Error */}
        <div style={{
          backgroundColor: 'white',
          padding: '1.5rem',
          borderRadius: '0.5rem',
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.875rem', color: '#6b7280', fontWeight: 500 }}>Eventos con Error</span>
            <AlertTriangle size={20} style={{ color: '#ef4444' }} />
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#111827' }}>
            {stats.failed}
          </div>
          {stats.failed > 0 && (
            <div style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '0.25rem' }}>
              Requieren atención
            </div>
          )}
        </div>

        {/* Dead Letter */}
        <div style={{
          backgroundColor: 'white',
          padding: '1.5rem',
          borderRadius: '0.5rem',
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.875rem', color: '#6b7280', fontWeight: 500 }}>Dead Letter</span>
            <XCircle size={20} style={{ color: '#dc2626' }} />
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#111827' }}>
            {stats.dead_letter}
          </div>
          {stats.dead_letter > 0 && (
            <div style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: '0.25rem' }}>
              Fallidos permanentemente
            </div>
          )}
        </div>

        {/* Total Procesados */}
        <div style={{
          backgroundColor: 'white',
          padding: '1.5rem',
          borderRadius: '0.5rem',
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.875rem', color: '#6b7280', fontWeight: 500 }}>Total Procesados</span>
            <Activity size={20} style={{ color: '#3b82f6' }} />
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#111827' }}>
            {stats.processed}
          </div>
        </div>

        {/* Tiempo Promedio de Procesamiento */}
        <div style={{
          backgroundColor: 'white',
          padding: '1.5rem',
          borderRadius: '0.5rem',
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.875rem', color: '#6b7280', fontWeight: 500 }}>Tiempo Promedio</span>
            <Clock size={20} style={{ color: '#8b5cf6' }} />
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#111827' }}>
            {formatProcessingTime(stats.avg_processing_time_ms)}
          </div>
          {stats.avg_processing_time_ms !== null && (
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
              Tiempo de procesamiento
            </div>
          )}
        </div>
      </div>

      {/* Asientos Generados por Tipo */}
      {asientosPorTipo.length > 0 && (
        <div style={{
          backgroundColor: 'white',
          borderRadius: '0.5rem',
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
          overflow: 'hidden',
          marginBottom: '2rem'
        }}>
          <div style={{
            padding: '1rem 1.5rem',
            borderBottom: '1px solid #e5e7eb',
            backgroundColor: '#f9fafb'
          }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#111827' }}>
              Asientos Generados por Tipo
            </h2>
            <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
              Distribución de asientos contables según el tipo de evento
            </p>
          </div>

          <div style={{ padding: '1.5rem' }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '1rem'
            }}>
              {asientosPorTipo.map((item) => (
                <div
                  key={item.tipo}
                  style={{
                    padding: '1rem',
                    backgroundColor: '#f9fafb',
                    borderRadius: '0.375rem',
                    border: '1px solid #e5e7eb'
                  }}
                >
                  <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                    {getEventTypeLabel(item.tipo)}
                  </div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#111827' }}>
                    {item.cantidad}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                    asiento{item.cantidad !== 1 ? 's' : ''}
                  </div>
                </div>
              ))}
            </div>

            {/* Total */}
            <div style={{
              marginTop: '1.5rem',
              paddingTop: '1.5rem',
              borderTop: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#6b7280' }}>
                Total de Asientos Generados
              </span>
              <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#111827' }}>
                {asientosPorTipo.reduce((sum, item) => sum + item.cantidad, 0)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Failed Events Table */}
      {eventosFallidos.length > 0 && (
        <div style={{
          backgroundColor: 'white',
          borderRadius: '0.5rem',
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
          overflow: 'hidden'
        }}>
          <div style={{
            padding: '1rem 1.5rem',
            borderBottom: '1px solid #e5e7eb',
            backgroundColor: '#f9fafb'
          }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#111827' }}>
              Eventos Fallidos Recientes
            </h2>
            <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
              Últimos 10 eventos que requieren atención
            </p>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ backgroundColor: '#f9fafb' }}>
                <tr>
                  <th style={{ padding: '0.75rem 1.5rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Tipo de Evento
                  </th>
                  <th style={{ padding: '0.75rem 1.5rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Error
                  </th>
                  <th style={{ padding: '0.75rem 1.5rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Reintentos
                  </th>
                  <th style={{ padding: '0.75rem 1.5rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Fecha
                  </th>
                  <th style={{ padding: '0.75rem 1.5rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {eventosFallidos.map((evento) => (
                  <tr key={evento.id} style={{ borderTop: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', color: '#111827' }}>
                      {getEventTypeLabel(evento.event_type)}
                    </td>
                    <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', color: '#6b7280', maxWidth: '300px' }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {evento.error_message || 'Sin mensaje de error'}
                      </div>
                    </td>
                    <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', color: '#111827' }}>
                      <span style={{
                        padding: '0.25rem 0.5rem',
                        backgroundColor: evento.retry_count >= 3 ? '#fee2e2' : '#fef3c7',
                        color: evento.retry_count >= 3 ? '#991b1b' : '#92400e',
                        borderRadius: '0.25rem',
                        fontSize: '0.75rem',
                        fontWeight: 500
                      }}>
                        {evento.retry_count}/3
                      </span>
                    </td>
                    <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
                      {formatDate(evento.created_at)}
                    </td>
                    <td style={{ padding: '1rem 1.5rem' }}>
                      {evento.status === 'failed' && evento.retry_count < 3 && (
                        <button
                          onClick={() => handleRetry(evento.event_id)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            padding: '0.375rem 0.75rem',
                            backgroundColor: '#3b82f6',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.25rem',
                            fontSize: '0.75rem',
                            cursor: 'pointer'
                          }}
                        >
                          <RefreshCw size={12} />
                          Reintentar
                        </button>
                      )}
                      {(evento.status === 'dead_letter' || evento.retry_count >= 3) && (
                        <span style={{
                          fontSize: '0.75rem',
                          color: '#dc2626',
                          fontWeight: 500
                        }}>
                          Requiere intervención manual
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {eventosFallidos.length === 0 && stats.failed === 0 && (
        <div style={{
          backgroundColor: 'white',
          padding: '3rem',
          borderRadius: '0.5rem',
          border: '1px solid #e5e7eb',
          textAlign: 'center'
        }}>
          <CheckCircle size={48} style={{ color: '#10b981', margin: '0 auto 1rem' }} />
          <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#111827', marginBottom: '0.5rem' }}>
            ¡Todo en orden!
          </h3>
          <p style={{ color: '#6b7280' }}>
            No hay eventos fallidos en este momento
          </p>
        </div>
      )}
    </div>
  )
}
