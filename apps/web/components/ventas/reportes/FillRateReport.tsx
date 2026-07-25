'use client'

import { useEffect, useMemo, useState } from 'react'
import { useApi } from '@/hooks/use-api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from '@/components/ui/use-toast'
import { CalendarClock, CheckCircle2, Clock3, Loader2, PackageMinus, Truck } from 'lucide-react'

interface BackorderDetalle {
  pedido_id: string
  pedido_numero: string
  detalle_id: string
  cantidad_pendiente: number
  prioridad: number
  proxima_fecha_compromiso: string | null
  estado: string
}

interface FillRateDetalle {
  pedido_id: string
  numero: string
  estado: string
  solicitado: number
  entregado: number
  fillRate: number
  tracking_estado?: string | null
  diasHastaEntrega: number | null
  dentroDeSla: boolean | null
  pendiente_backorder_total?: number
  pendientes_backorder?: BackorderDetalle[]
}

interface FillRateResponse {
  resumen: {
    pedidosAnalizados: number
    pedidosEntregados: number
    totalSolicitado: number
    totalEntregado: number
    fillRate: number
    otif: number
    pedidosConBackorder: number
    unidadesPendientesBackorder: number
  }
  incidencias: {
    pedidosSinEntrega: number
    pedidosFueraSla: number
  }
  detalle: FillRateDetalle[]
  backorders: {
    pedidosConPendiente: number
    unidadesPendientes: number
    topPrioritarios: BackorderDetalle[]
  }
}

interface ReportFilters {
  fechaDesde: string
  fechaHasta: string
  cliente?: string
  estado?: string
}

interface Props {
  filters: ReportFilters
}

const numberFormatter = new Intl.NumberFormat('es-PE', {
  maximumFractionDigits: 2
})

export default function FillRateReport({ filters }: Props) {
  const { get } = useApi()
  const [data, setData] = useState<FillRateResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters])

  const loadData = async () => {
    try {
      setLoading(true)
      const response = await get('/ventas/reportes/fill-rate', {
        params: filters
      })

      if (response?.success) {
        setData(response.data)
      } else {
        throw new Error('Respuesta inválida del servidor')
      }
    } catch (error) {
      console.error('Error cargando fill-rate:', error)
      toast({
        title: 'Error al cargar logística',
        description: 'No se pudieron obtener las métricas de fill-rate y OTIF.',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const topIncidencias = useMemo(() => {
    if (!data?.detalle) return []
    return data.detalle
      .filter((item) => item.solicitado > 0 && item.entregado < item.solicitado)
      .sort((a, b) => a.fillRate - b.fillRate)
      .slice(0, 10)
  }, [data])

  const topBackorders = useMemo(() => {
    return data?.backorders?.topPrioritarios ?? []
  }, [data])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Fill-rate &amp; OTIF</CardTitle>
          <CardDescription>Evaluando entregas en el periodo seleccionado…</CardDescription>
        </CardHeader>
        <CardContent className="py-12 flex flex-col items-center justify-center gap-2 text-foreground/80">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span>Calculando métricas logísticas</span>
        </CardContent>
      </Card>
    )
  }

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Fill-rate &amp; OTIF</CardTitle>
          <CardDescription>No se hallaron pedidos en el intervalo indicado</CardDescription>
        </CardHeader>
        <CardContent className="py-12 text-center text-muted-foreground">
          Ajusta los filtros o confirma que existan registros confirmados en el periodo.
        </CardContent>
      </Card>
    )
  }

  const { resumen, incidencias } = data

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card className="bg-emerald-600 text-white">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5" />
              Fill-rate global
            </CardTitle>
            <CardDescription className="text-emerald-400 dark:text-emerald-200">
              Porcentaje de unidades entregadas sobre lo solicitado
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-semibold">{resumen.fillRate.toFixed(1)}%</p>
            <p className="text-sm text-emerald-400 dark:text-emerald-200 mt-1">
              {numberFormatter.format(resumen.totalEntregado)} unidades entregadas de{' '}
              {numberFormatter.format(resumen.totalSolicitado)}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-indigo-600 text-white">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Truck className="h-5 w-5" />
              OTIF (On Time In Full)
            </CardTitle>
            <CardDescription className="text-indigo-100">
              Entregas completas dentro del SLA definido
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-semibold">{resumen.otif.toFixed(1)}%</p>
            <p className="text-sm text-indigo-100 mt-1">
              {resumen.pedidosEntregados - incidencias.pedidosFueraSla} de {resumen.pedidosEntregados}{' '}
              envíos dentro del SLA
            </p>
          </CardContent>
        </Card>

        <Card className="bg-sky-600 text-white">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <CalendarClock className="h-5 w-5" />
              Backorders pendientes
            </CardTitle>
            <CardDescription className="text-primary dark:text-sky-200">
              Líneas reagendadas a seguimiento
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-semibold">{resumen.pedidosConBackorder}</p>
            <p className="text-sm text-primary dark:text-sky-200 mt-1">
              {numberFormatter.format(resumen.unidadesPendientesBackorder)} uds pendientes
            </p>
          </CardContent>
        </Card>

        <Card className="bg-amber-500 text-white">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <PackageMinus className="h-5 w-5" />
              Pedidos sin entrega
            </CardTitle>
            <CardDescription className="text-amber-400 dark:text-amber-200">
              Pedidos confirmados sin salidas registradas
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-semibold">{incidencias.pedidosSinEntrega}</p>
            <p className="text-sm text-amber-400 dark:text-amber-200 mt-1">
              de {resumen.pedidosAnalizados} pedidos analizados
            </p>
          </CardContent>
        </Card>

        <Card className="bg-rose-500 text-white">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Clock3 className="h-5 w-5" />
              Fuera de SLA
            </CardTitle>
            <CardDescription className="text-destructive dark:text-rose-200">
              Entregas completas con retraso
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-semibold">{incidencias.pedidosFueraSla}</p>
            <p className="text-sm text-destructive dark:text-rose-200 mt-1">
              SLA estándar considerado: 5 días calendario
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Detalle de entregas</CardTitle>
          <CardDescription>
            Pedidos con menor nivel de cumplimiento para seguimiento operativo
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-muted/30">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-foreground/80">Pedido</th>
                <th className="px-3 py-2 text-left font-medium text-foreground/80">Estado</th>
                <th className="px-3 py-2 text-right font-medium text-foreground/80">Solicitado</th>
                <th className="px-3 py-2 text-right font-medium text-foreground/80">Entregado</th>
                <th className="px-3 py-2 text-right font-medium text-foreground/80">Fill-rate</th>
                <th className="px-3 py-2 text-right font-medium text-foreground/80">Pendiente BO</th>
                <th className="px-3 py-2 text-left font-medium text-foreground/80">Compromisos</th>
                <th className="px-3 py-2 text-left font-medium text-foreground/80">Tracking</th>
                <th className="px-3 py-2 text-right font-medium text-foreground/80">Días entrega</th>
                <th className="px-3 py-2 text-center font-medium text-foreground/80">SLA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {topIncidencias.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-6 text-center text-muted-foreground">
                    No hay incidentes registrados en el periodo. ¡Buen trabajo del equipo logístico!
                  </td>
                </tr>
              ) : (
                topIncidencias.map((item) => (
                  <tr key={item.pedido_id} className="bg-card">
                    <td className="px-3 py-2 font-medium text-foreground/85">{item.numero}</td>
                    <td className="px-3 py-2 text-foreground/80">{item.estado}</td>
                    <td className="px-3 py-2 text-right text-foreground/80">
                      {numberFormatter.format(item.solicitado)}
                    </td>
                    <td className="px-3 py-2 text-right text-foreground/80">
                      {numberFormatter.format(item.entregado)}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-destructive">
                      {item.fillRate.toFixed(1)}%
                    </td>
                    <td className="px-3 py-2 text-right text-foreground/80">
                      {numberFormatter.format(item.pendiente_backorder_total ?? 0)}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {item.pendientes_backorder && item.pendientes_backorder.length > 0 ? (
                        <div className="space-y-1">
                          {item.pendientes_backorder.map((pendiente) => (
                            <div key={`${pendiente.detalle_id}-${pendiente.proxima_fecha_compromiso}`} className="flex items-center justify-between text-xs text-muted-foreground">
                              <span className="font-medium text-foreground/80">
                                {numberFormatter.format(pendiente.cantidad_pendiente)} uds
                              </span>
                              <span>
                                {pendiente.proxima_fecha_compromiso
                                  ? new Date(pendiente.proxima_fecha_compromiso).toLocaleDateString('es-PE')
                                  : 'Sin fecha'}
                              </span>
                              <span className="px-2 py-0.5 rounded-full bg-muted text-foreground/80">
                                P{pendiente.prioridad}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span>—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {item.tracking_estado ?? 'Sin tracking'}
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      {item.diasHastaEntrega != null ? `${item.diasHastaEntrega} días` : '—'}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {item.dentroDeSla == null ? (
                        <span className="px-2 py-1 text-xs rounded-full bg-muted text-foreground/80">
                          N/D
                        </span>
                      ) : item.dentroDeSla ? (
                        <span className="px-2 py-1 text-xs rounded-full bg-emerald-500/10 text-emerald-400">
                          Dentro
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs rounded-full bg-destructive/10 text-destructive">
                          Fuera
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
      </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Backorders prioritarios</CardTitle>
          <CardDescription>
            Próximos compromisos de despacho y líneas pendientes a vigilar
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {topBackorders.length === 0 ? (
            <div className="py-6 text-center text-muted-foreground text-sm">
              No hay backorders reprogramados en el periodo seleccionado.
            </div>
          ) : (
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-muted/30">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-foreground/80">Pedido</th>
                  <th className="px-3 py-2 text-left font-medium text-foreground/80">Detalle</th>
                  <th className="px-3 py-2 text-right font-medium text-foreground/80">Pendiente</th>
                  <th className="px-3 py-2 text-center font-medium text-foreground/80">Prioridad</th>
                  <th className="px-3 py-2 text-left font-medium text-foreground/80">Compromiso</th>
                  <th className="px-3 py-2 text-left font-medium text-foreground/80">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {topBackorders.map((item) => (
                  <tr key={`${item.pedido_id}-${item.detalle_id}-${item.proxima_fecha_compromiso}`} className="bg-card">
                    <td className="px-3 py-2 font-medium text-foreground/85">{item.pedido_numero}</td>
                    <td className="px-3 py-2 text-muted-foreground text-xs">{item.detalle_id}</td>
                    <td className="px-3 py-2 text-right text-foreground/80">
                      {numberFormatter.format(item.cantidad_pendiente)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className="px-2 py-0.5 rounded-full bg-muted text-foreground/80">
                        P{item.prioridad}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-foreground/80">
                      {item.proxima_fecha_compromiso
                        ? new Date(item.proxima_fecha_compromiso).toLocaleDateString('es-PE')
                        : 'Sin fecha'}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{item.estado}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
