'use client'

import { useEffect, useMemo, useState } from 'react'
import { useApi } from '@/hooks/use-api'
import { CheckCircle2, AlertCircle, RefreshCw, XCircle, DollarSign, Clock, FileText } from 'lucide-react'

interface ClienteResumen {
  razon_social?: string
  documento_numero?: string
}

interface ResumenCredito {
  limite?: number
  pendiente?: number
  tieneVencidos?: boolean
  permiteMorosidad?: boolean
}

interface PedidoPendiente {
  id: string
  numero: string
  cliente?: ClienteResumen | null
  total: number
  created_at?: string
  estado_credito?: string
  motivo_requiere_aprobacion?: string | null
  motivos: string[]
  resumen_credito?: ResumenCredito | null
}

const ESTADO_CREDITO_COLOR: Record<string, { bg: string; text: string }> = {
  BLOQUEADO: { bg: 'rgba(239, 68, 68, 0.12)', text: '#dc2626' },
  REVISION: { bg: 'rgba(234, 179, 8, 0.15)', text: '#b45309' },
  APROBADO: { bg: 'rgba(34, 197, 94, 0.12)', text: '#15803d' },
  APROBADO_MANUAL: { bg: 'rgba(34, 197, 94, 0.12)', text: '#15803d' },
  OK: { bg: 'rgba(34, 197, 94, 0.12)', text: '#15803d' },
  SIN_EVALUAR: { bg: 'rgba(148, 163, 184, 0.12)', text: '#475569' },
}

function formatCurrency(value?: number) {
  if (value == null) return 'S/ 0.00'
  return `S/ ${value.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function AprobacionesPage() {
  const { get, post } = useApi()
  const [loading, setLoading] = useState(true)
  const [decidingId, setDecidingId] = useState<string | null>(null)
  const [data, setData] = useState<PedidoPendiente[]>([])

  const totalPendiente = useMemo(
    () => data.reduce((sum, pedido) => sum + (pedido.total || 0), 0),
    [data],
  )

  const loadPendientes = async () => {
    try {
      setLoading(true)
      const response = await get('/ventas/pedidos/aprobaciones/pendientes')

      if (response?.success) {
        setData(response.data || [])
      } else if (Array.isArray(response)) {
        setData(response as PedidoPendiente[])
      } else {
        setData([])
      }
    } catch (error) {
      console.error('Error al cargar aprobaciones pendientes:', error)
      alert('Error: No se pudieron cargar los pedidos pendientes de aprobación')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPendientes()
  }, [])

  const handleDecision = async (pedido: PedidoPendiente, decision: 'APROBADO' | 'RECHAZADO') => {
    const observaciones = window.prompt(
      `Ingresa una observación para ${decision === 'APROBADO' ? 'aprobar' : 'rechazar'} el pedido ${pedido.numero} (opcional):`,
    )

    try {
      setDecidingId(pedido.id)
      const response = await post(`/ventas/pedidos/${pedido.id}/aprobaciones/decision`, {
        decision,
        motivos: pedido.motivos,
        observaciones: observaciones || undefined,
      })

      if (response?.success) {
        alert(`El pedido ${pedido.numero} fue ${decision === 'APROBADO' ? 'aprobado' : 'rechazado'} correctamente`)
        loadPendientes()
      } else {
        throw new Error(response?.message || 'Operación no completada')
      }
    } catch (error) {
      console.error('Error registrando decisión:', error)
      alert('Error: No pudimos registrar la decisión de aprobación')
    } finally {
      setDecidingId(null)
    }
  }

  const renderEstadoCredito = (estado?: string) => {
    if (!estado) {
      estado = 'SIN_EVALUAR'
    }

    const style = ESTADO_CREDITO_COLOR[estado] || ESTADO_CREDITO_COLOR.SIN_EVALUAR
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '0.25rem 0.75rem',
          borderRadius: '9999px',
          backgroundColor: style.bg,
          color: style.text,
          fontSize: '0.75rem',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {estado}
      </span>
    )
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('es-PE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Bandeja de Aprobaciones</h1>
          <p className="dashboard-subtitle">
            Gestiona pedidos que requieren autorización por crédito, descuentos o límites configurados
          </p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button
            onClick={loadPendientes}
            className="refresh-btn"
            style={{ padding: '0.75rem 1.5rem' }}
            disabled={loading}
          >
            <RefreshCw size={16} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', marginBottom: '2rem' }}>
        <div className="stat-card">
          <div className="stat-header">
            <h3>PENDIENTES</h3>
            <Clock className="stat-icon" style={{ color: '#f59e0b' }} />
          </div>
          <div className="stat-value">{data.length}</div>
          <div className="stat-subtitle">Pedidos en espera</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>MONTO COMPROMETIDO</h3>
            <DollarSign className="stat-icon" style={{ color: '#10b981' }} />
          </div>
          <div className="stat-value" style={{ fontSize: '1.25rem' }}>
            {formatCurrency(totalPendiente)}
          </div>
          <div className="stat-subtitle">Total a aprobar</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>ÚLTIMA ACTUALIZACIÓN</h3>
            <FileText className="stat-icon" style={{ color: '#3b82f6' }} />
          </div>
          <div className="stat-value" style={{ fontSize: '1rem' }}>
            {new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div className="stat-subtitle">{new Date().toLocaleDateString('es-PE')}</div>
        </div>
      </div>

      {/* Pedidos Pendientes */}
      <div className="activity-section">
        {loading ? (
          <div className="loading">
            <div className="loading-spinner"></div>
            <p>Cargando pedidos pendientes...</p>
          </div>
        ) : data.length === 0 ? (
          <div className="activity-card">
            <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
              <CheckCircle2 size={48} style={{ margin: '0 auto 1rem', color: '#10b981' }} />
              <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                No hay pedidos pendientes de aprobación
              </h3>
              <p>Todos los pedidos han sido procesados o no hay pedidos que requieran aprobación.</p>
            </div>
          </div>
        ) : (
          <div className="activity-card">
            <div style={{ marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#111827', marginBottom: '0.5rem' }}>
                Pedidos Pendientes
              </h2>
              <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                {data.length} {data.length === 1 ? 'pedido requiere' : 'pedidos requieren'} aprobación
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {data.map((pedido) => (
                <div
                  key={pedido.id}
                  style={{
                    padding: '1.5rem',
                    background: 'rgba(255, 255, 255, 0.8)',
                    border: '1px solid #e5e7eb',
                    borderRadius: '12px',
                    transition: 'all 0.3s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#3b82f6'
                    e.currentTarget.style.boxShadow = '0 4px 6px rgba(59, 130, 246, 0.1)'
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.95)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#e5e7eb'
                    e.currentTarget.style.boxShadow = 'none'
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.8)'
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {/* Header del pedido */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                          <h3 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#111827', fontFamily: 'monospace' }}>
                            {pedido.numero}
                          </h3>
                          {renderEstadoCredito(pedido.estado_credito)}
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '0.375rem 0.75rem',
                            borderRadius: '8px',
                            fontSize: '0.875rem',
                            fontWeight: '600',
                            background: '#f3f4f6',
                            color: '#374151',
                            border: '1px solid #e5e7eb'
                          }}>
                            {formatCurrency(pedido.total)}
                          </span>
                        </div>
                        <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                          <strong>{pedido.cliente?.razon_social || 'Cliente no asignado'}</strong>
                          {pedido.cliente?.documento_numero && (
                            <span> · {pedido.cliente.documento_numero}</span>
                          )}
                        </p>
                        {pedido.created_at && (
                          <p style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                            Creado: {formatDate(pedido.created_at)}
                          </p>
                        )}
                      </div>

                      {/* Botones de acción */}
                      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <button
                          onClick={() => handleDecision(pedido, 'APROBADO')}
                          disabled={decidingId === pedido.id}
                          style={{
                            padding: '0.75rem 1.5rem',
                            borderRadius: '8px',
                            border: 'none',
                            background: decidingId === pedido.id ? '#9ca3af' : '#10b981',
                            color: 'white',
                            cursor: decidingId === pedido.id ? 'not-allowed' : 'pointer',
                            fontSize: '0.875rem',
                            fontWeight: '600',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            transition: 'all 0.2s ease',
                            opacity: decidingId === pedido.id ? 0.6 : 1
                          }}
                          onMouseEnter={(e) => {
                            if (decidingId !== pedido.id) {
                              e.currentTarget.style.background = '#059669'
                              e.currentTarget.style.transform = 'translateY(-2px)'
                              e.currentTarget.style.boxShadow = '0 4px 6px rgba(16, 185, 129, 0.3)'
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (decidingId !== pedido.id) {
                              e.currentTarget.style.background = '#10b981'
                              e.currentTarget.style.transform = 'translateY(0)'
                              e.currentTarget.style.boxShadow = 'none'
                            }
                          }}
                        >
                          <CheckCircle2 size={16} />
                          Aprobar
                        </button>
                        <button
                          onClick={() => handleDecision(pedido, 'RECHAZADO')}
                          disabled={decidingId === pedido.id}
                          style={{
                            padding: '0.75rem 1.5rem',
                            borderRadius: '8px',
                            border: '1px solid #fecaca',
                            background: decidingId === pedido.id ? '#f3f4f6' : 'white',
                            color: decidingId === pedido.id ? '#9ca3af' : '#dc2626',
                            cursor: decidingId === pedido.id ? 'not-allowed' : 'pointer',
                            fontSize: '0.875rem',
                            fontWeight: '600',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            transition: 'all 0.2s ease',
                            opacity: decidingId === pedido.id ? 0.6 : 1
                          }}
                          onMouseEnter={(e) => {
                            if (decidingId !== pedido.id) {
                              e.currentTarget.style.background = '#fef2f2'
                              e.currentTarget.style.borderColor = '#fca5a5'
                              e.currentTarget.style.transform = 'translateY(-2px)'
                              e.currentTarget.style.boxShadow = '0 4px 6px rgba(239, 68, 68, 0.1)'
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (decidingId !== pedido.id) {
                              e.currentTarget.style.background = 'white'
                              e.currentTarget.style.borderColor = '#fecaca'
                              e.currentTarget.style.transform = 'translateY(0)'
                              e.currentTarget.style.boxShadow = 'none'
                            }
                          }}
                        >
                          <XCircle size={16} />
                          Rechazar
                        </button>
                      </div>
                    </div>

                    {/* Motivos */}
                    {pedido.motivos.length > 0 && (
                      <div style={{
                        padding: '1rem',
                        background: '#fef3c7',
                        border: '1px solid #fde68a',
                        borderRadius: '8px'
                      }}>
                        <span style={{
                          display: 'block',
                          fontSize: '0.75rem',
                          fontWeight: '700',
                          color: '#92400e',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          marginBottom: '0.75rem'
                        }}>
                          Motivos que requieren aprobación:
                        </span>
                        <ul style={{
                          margin: 0,
                          paddingLeft: '1.25rem',
                          fontSize: '0.875rem',
                          color: '#78350f',
                          listStyleType: 'disc'
                        }}>
                          {pedido.motivos.map((motivo, idx) => (
                            <li key={idx} style={{ marginBottom: '0.25rem' }}>
                              {motivo}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Resumen de crédito */}
                    {pedido.resumen_credito && (
                      <div style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '0.75rem',
                        padding: '1rem',
                        background: '#f3f4f6',
                        borderRadius: '8px'
                      }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '0.5rem 0.75rem',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          background: 'white',
                          color: '#374151',
                          border: '1px solid #e5e7eb'
                        }}>
                          Límite: {formatCurrency(pedido.resumen_credito.limite)}
                        </span>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '0.5rem 0.75rem',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          background: 'white',
                          color: '#374151',
                          border: '1px solid #e5e7eb'
                        }}>
                          Pendiente: {formatCurrency(pedido.resumen_credito.pendiente)}
                        </span>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '0.5rem 0.75rem',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          background: pedido.resumen_credito.tieneVencidos ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                          color: pedido.resumen_credito.tieneVencidos ? '#dc2626' : '#059669',
                          border: `1px solid ${pedido.resumen_credito.tieneVencidos ? '#fecaca' : '#d1fae5'}`
                        }}>
                          {pedido.resumen_credito.tieneVencidos ? '⚠️ Con morosidad' : '✓ Sin morosidad'}
                        </span>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '0.5rem 0.75rem',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          background: 'white',
                          color: '#374151',
                          border: '1px solid #e5e7eb'
                        }}>
                          {pedido.resumen_credito.permiteMorosidad ? 'Permite mora' : 'No permite mora'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
