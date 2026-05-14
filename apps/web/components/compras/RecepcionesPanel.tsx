'use client'

import { useCallback, useEffect, useState } from 'react'
import { useApi } from '@/hooks/use-api'
import { Package, Calendar, User, CheckCircle, XCircle, AlertCircle, Eye } from 'lucide-react'

interface RecepcionItem {
  id: string
  producto_id: string
  cantidad_recibida: number
  calidad: string
  lote?: string
  serie?: string
  almacen_id?: string
  fecha_expiracion?: string
  observaciones?: string
}

interface Recepcion {
  id: string
  numero: string
  orden_id: string
  fecha_recepcion: string
  almacen_id: string
  estado: string
  observaciones?: string
  recibido_por?: string
  created_at: string
  recepcion_items?: RecepcionItem[]
}

interface RecepcionesPanelProps {
  ordenId: string
}

const ESTADOS_CONFIG: Record<string, {
  label: string
  color: string
  bgColor: string
  icon: any
}> = {
  BORRADOR: {
    label: 'Borrador',
    color: '#6b7280',
    bgColor: 'rgba(107, 114, 128, 0.1)',
    icon: AlertCircle
  },
  CERRADA: {
    label: 'Cerrada',
    color: '#10b981',
    bgColor: 'rgba(16, 185, 129, 0.1)',
    icon: CheckCircle
  },
  ANULADA: {
    label: 'Anulada',
    color: '#ef4444',
    bgColor: 'rgba(239, 68, 68, 0.1)',
    icon: XCircle
  }
}

const CALIDAD_CONFIG: Record<string, {
  label: string
  color: string
}> = {
  OK: {
    label: 'Aceptado',
    color: '#10b981'
  },
  OBSERVADO: {
    label: 'Observado',
    color: '#f59e0b'
  },
  RECHAZADO: {
    label: 'Rechazado',
    color: '#ef4444'
  }
}

export default function RecepcionesPanel({ ordenId }: RecepcionesPanelProps) {
  const { get } = useApi()
  const [recepciones, setRecepciones] = useState<Recepcion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedRecepcion, setExpandedRecepcion] = useState<string | null>(null)

  const loadRecepciones = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await get(`/api/compras/ordenes/${ordenId}/recepciones`)

      if (response?.success && response.data) {
        setRecepciones(response.data)
      } else {
        setError('No se pudieron cargar las recepciones')
      }
    } catch (err: any) {
      console.error('Error loading recepciones:', err)
      setError(err.message || 'Error al cargar las recepciones')
    } finally {
      setLoading(false)
    }
  }, [get, ordenId])

  useEffect(() => {
    loadRecepciones()
  }, [loadRecepciones])

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-PE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const getEstadoBadge = (estado: string) => {
    const config = ESTADOS_CONFIG[estado]
    if (!config) return null

    const Icon = config.icon

    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.375rem',
        padding: '0.25rem 0.75rem',
        borderRadius: '9999px',
        fontSize: '0.75rem',
        fontWeight: '600',
        background: config.bgColor,
        color: config.color
      }}>
        <Icon size={12} />
        {config.label}
      </span>
    )
  }

  const getCalidadBadge = (calidad: string) => {
    const config = CALIDAD_CONFIG[calidad]
    if (!config) return null

    return (
      <span style={{
        display: 'inline-block',
        padding: '0.125rem 0.5rem',
        borderRadius: '4px',
        fontSize: '0.75rem',
        fontWeight: '600',
        background: `${config.color}20`,
        color: config.color
      }}>
        {config.label}
      </span>
    )
  }

  const toggleRecepcion = (recepcionId: string) => {
    setExpandedRecepcion(expandedRecepcion === recepcionId ? null : recepcionId)
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
            <Package size={20} />
          </div>
          <h2 style={{ fontSize: '1.125rem', fontWeight: '700', color: 'var(--primary-800)', margin: 0 }}>
            Recepciones de Mercancía
          </h2>
        </div>
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--primary-400)' }}>
          <div className="loading-spinner" style={{ margin: '0 auto 1rem' }}></div>
          <p>Cargando recepciones...</p>
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
            <Package size={20} />
          </div>
          <h2 style={{ fontSize: '1.125rem', fontWeight: '700', color: 'var(--primary-800)', margin: 0 }}>
            Recepciones de Mercancía
          </h2>
        </div>
        <div style={{ textAlign: 'center', padding: '2rem', color: '#ef4444' }}>
          <AlertCircle size={32} style={{ margin: '0 auto 0.5rem' }} />
          <p>{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="activity-card">
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '1.5rem',
        paddingBottom: '1rem',
        borderBottom: '2px solid var(--primary-100)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
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
            <Package size={20} />
          </div>
          <h2 style={{ fontSize: '1.125rem', fontWeight: '700', color: 'var(--primary-800)', margin: 0 }}>
            Recepciones de Mercancía
          </h2>
        </div>
        <span style={{
          fontSize: '0.875rem',
          fontWeight: '600',
          color: 'var(--primary-600)',
          background: 'var(--primary-100)',
          padding: '0.25rem 0.75rem',
          borderRadius: '9999px'
        }}>
          {recepciones.length} {recepciones.length === 1 ? 'recepción' : 'recepciones'}
        </span>
      </div>

      {recepciones.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--primary-400)' }}>
          <Package size={48} style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
          <p style={{ fontSize: '0.875rem' }}>No hay recepciones registradas para esta orden</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {recepciones.map((recepcion) => (
            <div
              key={recepcion.id}
              style={{
                border: '1px solid var(--primary-200)',
                borderRadius: '8px',
                overflow: 'hidden',
                transition: 'all 0.2s ease'
              }}
            >
              {/* Recepcion Header */}
              <div
                onClick={() => toggleRecepcion(recepcion.id)}
                style={{
                  padding: '1rem',
                  background: expandedRecepcion === recepcion.id ? 'var(--primary-50)' : 'white',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'background 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  if (expandedRecepcion !== recepcion.id) {
                    e.currentTarget.style.background = 'var(--primary-50)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (expandedRecepcion !== recepcion.id) {
                    e.currentTarget.style.background = 'white'
                  }
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: 'var(--blue-100)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--blue-600)'
                  }}>
                    <Package size={18} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
                      <span style={{ fontSize: '0.875rem', fontWeight: '700', color: 'var(--primary-800)' }}>
                        {recepcion.numero}
                      </span>
                      {getEstadoBadge(recepcion.estado)}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.75rem', color: 'var(--primary-500)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Calendar size={12} />
                        {formatDate(recepcion.fecha_recepcion)}
                      </span>
                      {recepcion.recibido_por && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <User size={12} />
                          {recepcion.recibido_por}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <Eye
                  size={18}
                  style={{
                    color: 'var(--primary-400)',
                    transform: expandedRecepcion === recepcion.id ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s ease'
                  }}
                />
              </div>

              {/* Recepcion Details */}
              {expandedRecepcion === recepcion.id && (
                <div style={{
                  padding: '1rem',
                  background: 'var(--primary-25)',
                  borderTop: '1px solid var(--primary-200)'
                }}>
                  {recepcion.observaciones && (
                    <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'white', borderRadius: '6px' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--primary-500)', marginBottom: '0.25rem' }}>
                        Observaciones
                      </div>
                      <div style={{ fontSize: '0.875rem', color: 'var(--primary-700)' }}>
                        {recepcion.observaciones}
                      </div>
                    </div>
                  )}

                  {recepcion.recepcion_items && recepcion.recepcion_items.length > 0 && (
                    <div>
                      <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--primary-500)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Productos Recibidos ({recepcion.recepcion_items.length})
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {recepcion.recepcion_items.map((item) => (
                          <div
                            key={item.id}
                            style={{
                              padding: '0.75rem',
                              background: 'white',
                              borderRadius: '6px',
                              border: '1px solid var(--primary-100)'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--primary-800)', marginBottom: '0.25rem' }}>
                                  Producto ID: {item.producto_id}
                                </div>
                                <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', color: 'var(--primary-600)' }}>
                                  <span style={{ color: 'var(--emerald-600)' }}>
                                    Cantidad Recibida: <strong>{item.cantidad_recibida}</strong>
                                  </span>
                                </div>
                              </div>
                              {getCalidadBadge(item.calidad)}
                            </div>
                            {(item.lote || item.serie || item.observaciones) && (
                              <div style={{
                                display: 'flex',
                                gap: '1rem',
                                fontSize: '0.75rem',
                                color: 'var(--primary-500)',
                                paddingTop: '0.5rem',
                                borderTop: '1px solid var(--primary-100)'
                              }}>
                                {item.lote && <span>Lote: <strong>{item.lote}</strong></span>}
                                {item.serie && <span>Serie: <strong>{item.serie}</strong></span>}
                                {item.observaciones && <span>Obs: {item.observaciones}</span>}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
