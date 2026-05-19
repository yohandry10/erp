'use client'

import { useState, useCallback, useEffect } from 'react'
import { Activity, AlertTriangle, CheckCircle, Clock, RefreshCw, XCircle } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

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

const metricCards: Array<{
  key: keyof EventStats
  label: string
  helper?: string
  icon: typeof Activity
}> = [
  { key: 'pending', label: 'Eventos pendientes', helper: 'En cola contable', icon: Clock },
  { key: 'processed_today', label: 'Procesados hoy', helper: 'Ciclo actual', icon: CheckCircle },
  { key: 'failed', label: 'Eventos con error', helper: 'Requieren revisión', icon: AlertTriangle },
  { key: 'dead_letter', label: 'Dead letter', helper: 'Intervención manual', icon: XCircle },
  { key: 'processed', label: 'Total procesados', helper: 'Histórico operativo', icon: Activity },
  { key: 'avg_processing_time_ms', label: 'Tiempo promedio', helper: 'Latencia de procesamiento', icon: Clock },
]

export default function MonitoreoPage() {
  const [stats, setStats] = useState<EventStats>({
    pending: 0,
    processed: 0,
    processed_today: 0,
    failed: 0,
    dead_letter: 0,
    avg_processing_time_ms: null,
  })
  const [eventosFallidos, setEventosFallidos] = useState<EventoFallido[]>([])
  const [asientosPorTipo, setAsientosPorTipo] = useState<AsientoPorTipo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const { apiCall: apiGet } = useApi<any>({ retries: 2, timeoutMs: 12000, showErrorToast: false })

  const fetchData = useCallback(async () => {
    try {
      setError(null)
      const statsResult = await apiGet('/contabilidad/eventos/estadisticas')
      if (statsResult?.data) setStats(statsResult.data)

      const failedResult = await apiGet('/contabilidad/eventos/fallidos?limit=10')
      if (failedResult?.data) setEventosFallidos(failedResult.data || [])

      const asientosTipoResult = await apiGet('/contabilidad/asientos/estadisticas/por-tipo')
      if (asientosTipoResult?.data) setAsientosPorTipo(asientosTipoResult.data || [])
    } catch (err) {
      console.error('Error fetching monitoring data:', err)
      setError('Error al cargar datos de monitoreo')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [apiGet])

  const handleRefresh = () => {
    setRefreshing(true)
    fetchData()
  }

  const handleRetry = async (eventId: string) => {
    try {
      const response = await apiGet(`/contabilidad/eventos/${eventId}/reintentar`, { method: 'POST' })
      if (response?.success === false) {
        setError(response.message || 'Error al reintentar evento')
      }
      fetchData()
    } catch (err) {
      console.error('Error retrying event:', err)
    }
  }

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [fetchData])

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleString('es-PE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getEventTypeLabel = (eventType: string) => {
    const labels: Record<string, string> = {
      VentaFacturada: 'Venta Facturada',
      CobroRegistrado: 'Cobro Registrado',
      RecepcionRegistrada: 'Recepción Registrada',
      PagoProveedorRegistrado: 'Pago Proveedor',
      AjusteInventarioAplicado: 'Ajuste Inventario',
      PlanillaLiquidada: 'Planilla Liquidada',
      DepreciacionGenerada: 'Depreciación',
    }
    return labels[eventType] || eventType
  }

  const formatProcessingTime = (ms: number | null) => {
    if (ms === null || ms === undefined) return 'N/A'
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    const minutes = Math.floor(ms / 60000)
    const seconds = Math.floor((ms % 60000) / 1000)
    return `${minutes}m ${seconds}s`
  }

  const totalAsientos = asientosPorTipo.reduce((sum, item) => sum + item.cantidad, 0)

  const metricValue = (key: keyof EventStats) => {
    if (key === 'avg_processing_time_ms') return formatProcessingTime(stats.avg_processing_time_ms)
    return stats[key]
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-sky-950 to-slate-950 p-4 text-slate-100">
        <Card className="mx-auto max-w-[1500px] border-cyan-400/20 bg-slate-950/70 text-slate-100">
          <CardHeader className="border-b border-cyan-400/10">
            <CardTitle>Monitoreo de Eventos Contables</CardTitle>
          </CardHeader>
          <CardContent className="flex min-h-[180px] items-center justify-center gap-3 p-6">
            <Activity className="h-7 w-7 animate-spin text-cyan-200" />
            <span className="text-sm font-medium text-slate-300">Cargando datos de monitoreo...</span>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-sky-950 to-slate-950 p-4 text-slate-100">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <section className="rounded-2xl border border-cyan-400/20 bg-slate-950/70 px-5 py-4 shadow-2xl shadow-blue-950/20">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-2 inline-flex rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100">
                ERP Event Control
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-white">Monitoreo de Eventos Contables</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                Cola, asientos generados, reintentos y eventos que requieren intervención contable.
              </p>
            </div>
            <Button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="gap-2 bg-blue-600 text-white shadow-lg shadow-blue-950/30 hover:bg-blue-500"
            >
              <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
              Actualizar
            </Button>
          </div>
        </section>

        {error && (
          <div className="rounded-xl border border-blue-300/20 bg-blue-400/10 p-4 text-sm font-medium text-blue-50">
            {error}
          </div>
        )}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {metricCards.map(({ key, label, helper, icon: Icon }) => (
            <Card key={key} className="border-cyan-400/20 bg-slate-950/65 text-slate-100 shadow-xl shadow-blue-950/20">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold uppercase tracking-[0.14em] text-cyan-200/70">
                      {label}
                    </div>
                    <div className="mt-3 text-2xl font-bold text-white">{metricValue(key)}</div>
                    {helper && <div className="mt-1 text-xs text-slate-400">{helper}</div>}
                  </div>
                  <span className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-2 text-cyan-100">
                    <Icon className="h-5 w-5" />
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(420px,0.9fr)]">
          <Card className="border-cyan-400/20 bg-slate-950/65 text-slate-100 shadow-xl shadow-blue-950/20">
            <CardHeader className="border-b border-cyan-400/10 px-5 py-4">
              <CardTitle className="text-base text-white">Asientos generados por tipo</CardTitle>
              <p className="text-xs text-slate-400">Distribución según el evento operativo que originó contabilidad.</p>
            </CardHeader>
            <CardContent className="p-4">
              {asientosPorTipo.length > 0 ? (
                <div className="space-y-3">
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {asientosPorTipo.map((item) => (
                      <div key={item.tipo} className="rounded-xl border border-cyan-400/15 bg-white/[0.03] p-3">
                        <div className="truncate text-sm font-semibold text-slate-200">{getEventTypeLabel(item.tipo)}</div>
                        <div className="mt-2 text-2xl font-bold text-cyan-100">{item.cantidad}</div>
                        <div className="text-xs text-slate-500">asiento{item.cantidad !== 1 ? 's' : ''}</div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-cyan-400/15 bg-cyan-400/10 px-4 py-3">
                    <span className="text-sm font-semibold text-cyan-100">Total de asientos generados</span>
                    <span className="text-2xl font-bold text-white">{totalAsientos}</span>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-cyan-400/15 bg-white/[0.03] p-8 text-center text-sm text-slate-400">
                  No hay asientos clasificados por tipo en el periodo consultado.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-cyan-400/20 bg-slate-950/65 text-slate-100 shadow-xl shadow-blue-950/20">
            <CardHeader className="border-b border-cyan-400/10 px-5 py-4">
              <CardTitle className="text-base text-white">Estado de cola</CardTitle>
              <p className="text-xs text-slate-400">Señales para detectar fallos de procesamiento sin abrir logs técnicos.</p>
            </CardHeader>
            <CardContent className="space-y-3 p-4">
              {[
                ['Pendientes', stats.pending],
                ['Procesados hoy', stats.processed_today],
                ['Fallidos', stats.failed],
                ['Dead letter', stats.dead_letter],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between rounded-xl border border-cyan-400/15 bg-white/[0.03] px-4 py-3">
                  <span className="text-sm text-slate-300">{label}</span>
                  <span className="text-lg font-bold text-white">{value}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        {eventosFallidos.length > 0 ? (
          <Card className="border-cyan-400/20 bg-slate-950/65 text-slate-100 shadow-xl shadow-blue-950/20">
            <CardHeader className="border-b border-cyan-400/10 px-5 py-4">
              <CardTitle className="text-base text-white">Eventos fallidos recientes</CardTitle>
              <p className="text-xs text-slate-400">Últimos 10 eventos que requieren atención.</p>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full min-w-[900px] border-collapse text-sm">
                <thead className="bg-white/[0.04] text-xs uppercase tracking-[0.14em] text-cyan-200/70">
                  <tr>
                    <th className="px-5 py-3 text-left font-semibold">Tipo de evento</th>
                    <th className="px-5 py-3 text-left font-semibold">Error</th>
                    <th className="px-5 py-3 text-left font-semibold">Reintentos</th>
                    <th className="px-5 py-3 text-left font-semibold">Fecha</th>
                    <th className="px-5 py-3 text-left font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {eventosFallidos.map((evento) => (
                    <tr key={evento.id} className="border-t border-cyan-400/10">
                      <td className="px-5 py-4 font-medium text-white">{getEventTypeLabel(evento.event_type)}</td>
                      <td className="max-w-[320px] px-5 py-4 text-slate-300">
                        <div className="truncate">{evento.error_message || 'Sin mensaje de error'}</div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-100">
                          {evento.retry_count}/3
                        </span>
                      </td>
                      <td className="px-5 py-4 text-slate-400">{formatDate(evento.created_at)}</td>
                      <td className="px-5 py-4">
                        {evento.status === 'failed' && evento.retry_count < 3 ? (
                          <Button
                            type="button"
                            onClick={() => handleRetry(evento.event_id)}
                            size="sm"
                            className="gap-2 bg-blue-600 text-white hover:bg-blue-500"
                          >
                            <RefreshCw className="h-3 w-3" />
                            Reintentar
                          </Button>
                        ) : (
                          <span className="text-xs font-semibold text-blue-100">Requiere intervención manual</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-cyan-400/20 bg-slate-950/65 text-slate-100 shadow-xl shadow-blue-950/20">
            <CardContent className="flex items-center justify-center gap-4 p-8 text-center">
              <CheckCircle className="h-10 w-10 text-cyan-200" />
              <div className="text-left">
                <h3 className="text-lg font-semibold text-white">Todo en orden</h3>
                <p className="text-sm text-slate-400">No hay eventos fallidos en este momento.</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
