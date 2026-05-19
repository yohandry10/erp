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
      <span className="inline-flex items-center gap-1.5 py-1 px-3 rounded-full text-3 font-semibold">
        <Icon size={12} />
        {config.label}
      </span>
    )
  }

  const getCalidadBadge = (calidad: string) => {
    const config = CALIDAD_CONFIG[calidad]
    if (!config) return null

    return (
      <span className="inline-block py-0.5 px-2 rounded-[4px] text-3 font-semibold">
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
        <div className="flex items-center gap-3 mb-6 pb-4">
          <div className="w-10 h-10 rounded-2.5 bg-[var(--blue-100)] flex items-center justify-center text-[var(--blue-600)]">
            <Package size={20} />
          </div>
          <h2 className="text-[1.125rem] font-bold text-[var(--primary-800)] m-0">
            Recepciones de Mercancía
          </h2>
        </div>
        <div className="text-center p-8 text-[var(--primary-400)]">
          <div className="loading-spinner"></div>
          <p>Cargando recepciones...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="activity-card">
        <div className="flex items-center gap-3 mb-6 pb-4">
          <div className="w-10 h-10 rounded-2.5 bg-[var(--blue-100)] flex items-center justify-center text-[var(--blue-600)]">
            <Package size={20} />
          </div>
          <h2 className="text-[1.125rem] font-bold text-[var(--primary-800)] m-0">
            Recepciones de Mercancía
          </h2>
        </div>
        <div className="text-center p-8 text-red-500">
          <AlertCircle size={32} />
          <p>{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="activity-card">
      <div className="flex items-center justify-between mb-6 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2.5 bg-[var(--blue-100)] flex items-center justify-center text-[var(--blue-600)]">
            <Package size={20} />
          </div>
          <h2 className="text-[1.125rem] font-bold text-[var(--primary-800)] m-0">
            Recepciones de Mercancía
          </h2>
        </div>
        <span className="text-[0.875rem] font-semibold text-[var(--primary-600)] bg-[var(--primary-100)] py-1 px-3 rounded-full">
          {recepciones.length} {recepciones.length === 1 ? 'recepción' : 'recepciones'}
        </span>
      </div>

      {recepciones.length === 0 ? (
        <div className="text-center p-8 text-[var(--primary-400)]">
          <Package size={48} className="opacity-[0.3]" />
          <p className="text-[0.875rem]">No hay recepciones registradas para esta orden</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {recepciones.map((recepcion) => (
            <div
              key={recepcion.id} className="border rounded-2 overflow-hidden transition"
            >
              {/* Recepcion Header */}
              <div
                onClick={() => toggleRecepcion(recepcion.id)} className="p-4 cursor-pointer flex items-center justify-between transition"
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
                <div className="flex items-center gap-4 flex-[1]">
                  <div className="w-9 h-9 rounded-2 bg-[var(--blue-100)] flex items-center justify-center text-[var(--blue-600)]">
                    <Package size={18} />
                  </div>
                  <div className="flex-[1]">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-[0.875rem] font-bold text-[var(--primary-800)]">
                        {recepcion.numero}
                      </span>
                      {getEstadoBadge(recepcion.estado)}
                    </div>
                    <div className="flex items-center gap-4 text-3 text-[var(--primary-500)]">
                      <span className="flex items-center gap-1">
                        <Calendar size={12} />
                        {formatDate(recepcion.fecha_recepcion)}
                      </span>
                      {recepcion.recibido_por && (
                        <span className="flex items-center gap-1">
                          <User size={12} />
                          {recepcion.recibido_por}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <Eye
                  size={18} className="text-[var(--primary-400)] transition"
                />
              </div>

              {/* Recepcion Details */}
              {expandedRecepcion === recepcion.id && (
                <div className="p-4 bg-[var(--primary-25)] border-t">
                  {recepcion.observaciones && (
                    <div className="mb-4 p-3 bg-white rounded-[6px]">
                      <div className="text-3 font-semibold text-[var(--primary-500)] mb-1">
                        Observaciones
                      </div>
                      <div className="text-[0.875rem] text-[var(--primary-700)]">
                        {recepcion.observaciones}
                      </div>
                    </div>
                  )}

                  {recepcion.recepcion_items && recepcion.recepcion_items.length > 0 && (
                    <div>
                      <div className="text-3 font-semibold text-[var(--primary-500)] mb-3">
                        Productos Recibidos ({recepcion.recepcion_items.length})
                      </div>
                      <div className="flex flex-col gap-2">
                        {recepcion.recepcion_items.map((item) => (
                          <div
                            key={item.id} className="p-3 bg-white rounded-[6px] border"
                          >
                            <div className="flex justify-between mb-2">
                              <div className="flex-[1]">
                                <div className="text-[0.875rem] font-semibold text-[var(--primary-800)] mb-1">
                                  Producto ID: {item.producto_id}
                                </div>
                                <div className="flex gap-4 text-3 text-[var(--primary-600)]">
                                  <span className="text-[var(--emerald-600)]">
                                    Cantidad Recibida: <strong>{item.cantidad_recibida}</strong>
                                  </span>
                                </div>
                              </div>
                              {getCalidadBadge(item.calidad)}
                            </div>
                            {(item.lote || item.serie || item.observaciones) && (
                              <div className="flex gap-4 text-3 text-[var(--primary-500)] pt-2 border-t">
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
