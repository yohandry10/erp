'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApi } from '@/hooks/use-api'
import { CheckCircle2, AlertCircle, RefreshCw, XCircle, DollarSign, Clock, FileText } from 'lucide-react'
import { useCountryContext } from '@/hooks/use-country-context'

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

const toNumber = (value: unknown) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

const normalizePedidos = (raw: unknown): PedidoPendiente[] =>
  (Array.isArray(raw) ? raw : []).map((pedido: any) => ({
    ...pedido,
    id: pedido?.id || pedido?.numero || 'pedido',
    numero: pedido?.numero || 'N/A',
    total: toNumber(pedido?.total),
    motivos: Array.isArray(pedido?.motivos) ? pedido.motivos : [],
    resumen_credito: pedido?.resumen_credito
      ? {
          ...pedido.resumen_credito,
          limite: toNumber(pedido.resumen_credito.limite),
          pendiente: toNumber(pedido.resumen_credito.pendiente),
        }
      : null,
  }))

const estaBloqueadoPorCredito = (pedido: PedidoPendiente) =>
  String(pedido.estado_credito ?? '').toUpperCase() === 'BLOQUEADO'

export default function AprobacionesPage() {
  const country = useCountryContext()
  const formatCurrency = (value?: number) =>
    new Intl.NumberFormat(country.locale || 'es-PE', {
      style: 'currency',
      currency: country.moneda || 'PEN',
    }).format(toNumber(value))
  const { get, post } = useApi()
  const [loading, setLoading] = useState(true)
  const [decidingId, setDecidingId] = useState<string | null>(null)
  const [data, setData] = useState<PedidoPendiente[]>([])
  const [ultimaActualizacion, setUltimaActualizacion] = useState<Date | null>(null)

  const totalPendiente = useMemo(
    () => data.reduce((sum, pedido) => sum + (pedido.total || 0), 0),
    [data],
  )

  const loadPendientes = useCallback(async () => {
    try {
      setLoading(true)
      const response = await get('/ventas/pedidos/aprobaciones/pendientes')

      if (response?.success) {
        setData(normalizePedidos(response.data))
      } else if (Array.isArray(response)) {
        setData(normalizePedidos(response))
      } else {
        setData([])
      }
    } catch (error) {
      console.error('Error al cargar aprobaciones pendientes:', error)
      alert('Error: No se pudieron cargar los pedidos pendientes de aprobación')
    } finally {
      setUltimaActualizacion(new Date())
      setLoading(false)
    }
  }, [get])

  useEffect(() => {
    loadPendientes()
  }, [loadPendientes])

  const handleDecision = async (pedido: PedidoPendiente, decision: 'APROBADO' | 'RECHAZADO') => {
    if (estaBloqueadoPorCredito(pedido)) {
      alert(
        `El pedido ${pedido.numero} está bloqueado por crédito. Regulariza la cuenta del cliente antes de continuar; este bloqueo no admite aprobación comercial.`,
      )
      return
    }

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
      <span className="inline-flex items-center py-1 px-3 rounded-full text-xs font-semibold"
      >
        {estado}
      </span>
    )
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    if (Number.isNaN(date.getTime())) return '-'
    return date.toLocaleString('es-PE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
      {/* Header */}
      <div className="relative mb-8 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-lg backdrop-blur-xl before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary md:flex-row md:items-center md:p-8">
        <div>
          <h1 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground">Bandeja de Aprobaciones</h1>
          <p className="mt-2 text-base text-muted-foreground">
            Gestiona pedidos que requieren autorización por crédito, descuentos o límites configurados
          </p>
        </div>
        <div className="flex gap-4 items-center">
          <button
            onClick={loadPendientes}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-primary px-4 py-2.5 text-sm font-semibold leading-5 text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50 py-3 px-6"
            disabled={loading}
          >
            <RefreshCw size={16} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-5  mb-8">
        <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
          <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
            <h3>PENDIENTES</h3>
            <span className="inline-flex size-11 items-center justify-center rounded-xl bg-amber-500/15 text-amber-500">
              <Clock />
            </span>
          </div>
          <div className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none">{data.length}</div>
          <div className="mt-2 text-[0.8125rem] text-muted-foreground">Pedidos en espera</div>
        </div>

        <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
          <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
            <h3>MONTO COMPROMETIDO</h3>
            <span className="inline-flex size-11 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-500">
              <DollarSign />
            </span>
          </div>
          <div className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none text-xl">
            {formatCurrency(totalPendiente)}
          </div>
          <div className="mt-2 text-[0.8125rem] text-muted-foreground">Total a aprobar</div>
        </div>

        <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
          <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
            <h3>ÚLTIMA ACTUALIZACIÓN</h3>
            <span className="inline-flex size-11 items-center justify-center rounded-xl bg-blue-500/15 text-blue-500">
              <FileText />
            </span>
          </div>
          <div className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none text-base">
            {ultimaActualizacion?.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) ?? '--:--'}
          </div>
          <div className="mt-2 text-[0.8125rem] text-muted-foreground">{ultimaActualizacion?.toLocaleDateString('es-PE') ?? '-'}</div>
        </div>
      </div>

      {/* Pedidos Pendientes */}
      <div className="relative rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl">
        {loading ? (
          <div className="flex min-h-48 items-center justify-center">
            <div className="inline-block size-8 animate-spin rounded-full border-[3px] border-muted border-t-primary"></div>
            <p>Cargando pedidos pendientes...</p>
          </div>
        ) : data.length === 0 ? (
          <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl">
            <div className="text-center p-12 text-muted-foreground">
              <CheckCircle2 size={48} className="text-[#10b981]" />
              <h3 className="text-[1.125rem] font-semibold mb-2">
                No hay pedidos pendientes de aprobación
              </h3>
              <p>Todos los pedidos han sido procesados o no hay pedidos que requieran aprobación.</p>
            </div>
          </div>
        ) : (
          <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl">
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-foreground mb-2">
                Pedidos Pendientes
              </h2>
              <p className="text-[0.875rem] text-muted-foreground">
                {data.length} {data.length === 1 ? 'pedido requiere' : 'pedidos requieren'} aprobación
              </p>
            </div>

            <div className="flex flex-col gap-6">
              {data.map((pedido) => (
                <div
                  key={pedido.id} className="p-6 bg-card/80 border rounded-xl transition"
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
                          <h3 className="text-xl font-bold text-foreground">
                            {pedido.numero}
                          </h3>
                          {renderEstadoCredito(pedido.estado_credito)}
                          <span className="inline-flex items-center py-1.5 px-3 rounded-lg text-[0.875rem] font-semibold bg-muted text-foreground/85 border">
                            {formatCurrency(pedido.total)}
                          </span>
                        </div>
                        <p className="text-[0.875rem] text-muted-foreground mb-2">
                          <strong>{pedido.cliente?.razon_social || 'Cliente no asignado'}</strong>
                          {pedido.cliente?.documento_numero && (
                            <span> · {pedido.cliente.documento_numero}</span>
                          )}
                        </p>
                        {pedido.created_at && (
                          <p className="text-xs text-muted-foreground">
                            Creado: {formatDate(pedido.created_at)}
                          </p>
                        )}
                      </div>

                      {/* Botones de acción */}
                      {estaBloqueadoPorCredito(pedido) ? (
                        <div className="max-w-md rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                          Regulariza la cuenta por cobrar o el límite de crédito del cliente. Este bloqueo no se puede aprobar desde la bandeja comercial.
                        </div>
                      ) : (
                      <div className="flex gap-3 flex-wrap">
                        <button
                          onClick={() => handleDecision(pedido, 'APROBADO')}
                          disabled={decidingId === pedido.id} className="py-3 px-6 rounded-lg border-0 text-white text-[0.875rem] font-semibold flex items-center gap-2 transition"
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
                          disabled={decidingId === pedido.id} className="py-3 px-6 rounded-lg border text-[0.875rem] font-semibold flex items-center gap-2 transition"
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
                      )}
                    </div>

                    {/* Motivos */}
                    {pedido.motivos.length > 0 && (
                      <div className="p-4 bg-[#fef3c7] border rounded-lg">
                        <span className="block text-xs font-bold text-[#92400e] mb-3">
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
                      <div className="flex flex-wrap gap-3 p-4 bg-muted rounded-lg">
                        <span className="inline-flex items-center py-2 px-3 rounded-[6px] text-xs font-semibold bg-card text-foreground/85 border">
                          Límite: {formatCurrency(pedido.resumen_credito.limite)}
                        </span>
                        <span className="inline-flex items-center py-2 px-3 rounded-[6px] text-xs font-semibold bg-card text-foreground/85 border">
                          Pendiente: {formatCurrency(pedido.resumen_credito.pendiente)}
                        </span>
                        <span className="inline-flex items-center py-2 px-3 rounded-[6px] text-xs font-semibold">
                          {pedido.resumen_credito.tieneVencidos ? '⚠️ Con morosidad' : '✓ Sin morosidad'}
                        </span>
                        <span className="inline-flex items-center py-2 px-3 rounded-[6px] text-xs font-semibold bg-card text-foreground/85 border">
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
