'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
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

  const loadPendientes = useCallback(async () => {
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
  }, [get])

  useEffect(() => {
    loadPendientes()
  }, [loadPendientes])

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
      <span className="inline-flex items-center py-1 px-3 rounded-full text-3 font-semibold"
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
        <div className="flex gap-4 items-center">
          <button
            onClick={loadPendientes}
            className="refresh-btn py-3 px-6"
            disabled={loading}
          >
            <RefreshCw size={16} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid grid-cols-[repeat(auto-fit,_minmax(250px,_1fr))] mb-8">
        <div className="stat-card">
          <div className="stat-header">
            <h3>PENDIENTES</h3>
            <Clock className="stat-icon text-amber-500" />
          </div>
          <div className="stat-value">{data.length}</div>
          <div className="stat-subtitle">Pedidos en espera</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>MONTO COMPROMETIDO</h3>
            <DollarSign className="stat-icon text-[#10b981]" />
          </div>
          <div className="stat-value text-5">
            {formatCurrency(totalPendiente)}
          </div>
          <div className="stat-subtitle">Total a aprobar</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>ÚLTIMA ACTUALIZACIÓN</h3>
            <FileText className="stat-icon text-blue-500" />
          </div>
          <div className="stat-value text-4">
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
            <div className="text-center p-12 text-gray-500">
              <CheckCircle2 size={48} className="text-[#10b981]" />
              <h3 className="text-[1.125rem] font-semibold mb-2">
                No hay pedidos pendientes de aprobación
              </h3>
              <p>Todos los pedidos han sido procesados o no hay pedidos que requieran aprobación.</p>
            </div>
          </div>
        ) : (
          <div className="activity-card">
            <div className="mb-6">
              <h2 className="text-5 font-semibold text-gray-900 mb-2">
                Pedidos Pendientes
              </h2>
              <p className="text-[0.875rem] text-gray-500">
                {data.length} {data.length === 1 ? 'pedido requiere' : 'pedidos requieren'} aprobación
              </p>
            </div>

            <div className="flex flex-col gap-6">
              {data.map((pedido) => (
                <div
                  key={pedido.id} className="p-6 bg-[rgba(255,_255,_255,_0.8)] border rounded-3 transition"
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
                  <div className="flex flex-col gap-6">
                    {/* Header del pedido */}
                    <div className="flex justify-between items-start flex-wrap gap-4">
                      <div className="flex-[1] min-w-0">
                        <div className="flex items-center gap-4 mb-3 flex-wrap">
                          <h3 className="text-5 font-bold text-gray-900">
                            {pedido.numero}
                          </h3>
                          {renderEstadoCredito(pedido.estado_credito)}
                          <span className="inline-flex items-center py-1.5 px-3 rounded-2 text-[0.875rem] font-semibold bg-[#f3f4f6] text-gray-700 border">
                            {formatCurrency(pedido.total)}
                          </span>
                        </div>
                        <p className="text-[0.875rem] text-gray-500 mb-2">
                          <strong>{pedido.cliente?.razon_social || 'Cliente no asignado'}</strong>
                          {pedido.cliente?.documento_numero && (
                            <span> · {pedido.cliente.documento_numero}</span>
                          )}
                        </p>
                        {pedido.created_at && (
                          <p className="text-3 text-gray-400">
                            Creado: {formatDate(pedido.created_at)}
                          </p>
                        )}
                      </div>

                      {/* Botones de acción */}
                      <div className="flex gap-3 flex-wrap">
                        <button
                          onClick={() => handleDecision(pedido, 'APROBADO')}
                          disabled={decidingId === pedido.id} className="py-3 px-6 rounded-2 border-0 text-white text-[0.875rem] font-semibold flex items-center gap-2 transition"
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
                          disabled={decidingId === pedido.id} className="py-3 px-6 rounded-2 border text-[0.875rem] font-semibold flex items-center gap-2 transition"
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
                      <div className="p-4 bg-[#fef3c7] border rounded-2">
                        <span className="block text-3 font-bold text-[#92400e] mb-3">
                          Motivos que requieren aprobación:
                        </span>
                        <ul className="m-0 pl-5 text-[0.875rem] text-[#78350f]">
                          {pedido.motivos.map((motivo, idx) => (
                            <li key={idx} className="mb-1">
                              {motivo}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Resumen de crédito */}
                    {pedido.resumen_credito && (
                      <div className="flex flex-wrap gap-3 p-4 bg-[#f3f4f6] rounded-2">
                        <span className="inline-flex items-center py-2 px-3 rounded-[6px] text-3 font-semibold bg-white text-gray-700 border">
                          Límite: {formatCurrency(pedido.resumen_credito.limite)}
                        </span>
                        <span className="inline-flex items-center py-2 px-3 rounded-[6px] text-3 font-semibold bg-white text-gray-700 border">
                          Pendiente: {formatCurrency(pedido.resumen_credito.pendiente)}
                        </span>
                        <span className="inline-flex items-center py-2 px-3 rounded-[6px] text-3 font-semibold">
                          {pedido.resumen_credito.tieneVencidos ? '⚠️ Con morosidad' : '✓ Sin morosidad'}
                        </span>
                        <span className="inline-flex items-center py-2 px-3 rounded-[6px] text-3 font-semibold bg-white text-gray-700 border">
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
