'use client'

import { useEffect, useMemo, useState } from 'react'
import { useApi } from '@/hooks/use-api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from '@/components/ui/use-toast'
import { ArrowDownRight, ArrowRight, ArrowUpRight, BarChart2, Loader2 } from 'lucide-react'

interface PipelineStage {
  cantidad: number
  valor: number
  estados: Record<string, number>
}

interface PipelineResponse {
  pipeline: {
    cotizaciones: PipelineStage
    pedidos: PipelineStage
    facturas: PipelineStage
  }
  conversiones: {
    cotizaciones_a_pedidos: number
    pedidos_a_facturas: number
    total: number
  }
  tendencia: Array<{ periodo: string; cotizaciones: number; pedidos: number; facturas: number }>
  periodo: {
    desde: string | null
    hasta: string | null
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

const currencyFormatter = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
  maximumFractionDigits: 2
})

export default function PipelineReport({ filters }: Props) {
  const { get } = useApi()
  const [data, setData] = useState<PipelineResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters])

  const loadData = async () => {
    try {
      setLoading(true)
      const response = await get('/ventas/reportes/pipeline', {
        params: filters
      })

      if (response?.success) {
        setData(response.data)
      } else {
        throw new Error('Respuesta inválida del servidor')
      }
    } catch (error) {
      console.error('Error cargando pipeline:', error)
      toast({
        title: 'Error al cargar pipeline',
        description: 'No se pudieron obtener las métricas del pipeline comercial.',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const conversionCards = useMemo(() => {
    if (!data) return []
    const items = [
      {
        label: 'Cotización → Pedido',
        value: data.conversiones.cotizaciones_a_pedidos,
        icon: data.conversiones.cotizaciones_a_pedidos >= 50 ? ArrowUpRight : ArrowDownRight,
        tone: data.conversiones.cotizaciones_a_pedidos >= 50 ? 'text-emerald-400' : 'text-amber-400'
      },
      {
        label: 'Pedido → Factura',
        value: data.conversiones.pedidos_a_facturas,
        icon: data.conversiones.pedidos_a_facturas >= 70 ? ArrowUpRight : ArrowRight,
        tone: data.conversiones.pedidos_a_facturas >= 70 ? 'text-primary' : 'text-foreground/80'
      },
      {
        label: 'Cotización → Factura',
        value: data.conversiones.total,
        icon: BarChart2,
        tone: 'text-violet-400'
      }
    ]
    return items
  }, [data])

  const tendenciaRows = useMemo(() => {
    if (!data?.tendencia) return []
    return data.tendencia
      .slice()
      .sort((a, b) => (a.periodo < b.periodo ? -1 : 1))
  }, [data])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Pipeline Comercial</CardTitle>
          <CardDescription>Analizando conversiones del flujo comercial…</CardDescription>
        </CardHeader>
        <CardContent className="py-12 flex flex-col items-center justify-center gap-2 text-foreground/80">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span>Procesando métricas</span>
        </CardContent>
      </Card>
    )
  }

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Pipeline Comercial</CardTitle>
          <CardDescription>No hay datos disponibles para el periodo seleccionado</CardDescription>
        </CardHeader>
        <CardContent className="py-12 text-center text-muted-foreground">
          Ajusta los filtros para visualizar información del pipeline comercial.
        </CardContent>
      </Card>
    )
  }

  const renderStageSummary = (titulo: string, stage: PipelineStage, tone: string) => (
    <Card className={tone}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-white font-medium">{titulo}</CardTitle>
        <CardDescription className="text-white/70">
          Total de registros y valor acumulado
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-white">
        <div>
          <p className="text-xs uppercase tracking-wide opacity-75">Cantidad</p>
          <p className="text-2xl font-semibold">{stage.cantidad}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide opacity-75">Valor</p>
          <p className="text-2xl font-semibold">{currencyFormatter.format(stage.valor)}</p>
        </div>
      </CardContent>
    </Card>
  )

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {renderStageSummary('Cotizaciones activas', data.pipeline.cotizaciones, 'bg-sky-600')}
        {renderStageSummary('Pedidos en pipeline', data.pipeline.pedidos, 'bg-indigo-600')}
        {renderStageSummary('Facturas emitidas', data.pipeline.facturas, 'bg-violet-600')}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Conversiones clave</CardTitle>
          <CardDescription>
            Porcentaje de oportunidades que avanzan al siguiente hito comercial
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {conversionCards.map((item) => {
              const Icon = item.icon
              return (
                <div
                  key={item.label}
                  className="border border-border rounded-lg p-4 bg-muted/30 flex items-center justify-between"
                >
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.label}</p>
                    <p className="text-3xl font-semibold text-foreground mt-1">
                      {item.value.toFixed(1)}%
                    </p>
                  </div>
                  <Icon className={`h-8 w-8 ${item.tone}`} />
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Estados por etapa</CardTitle>
            <CardDescription>Distribución de oportunidades por estado operativo</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {(['cotizaciones', 'pedidos', 'facturas'] as const).map((stageKey) => {
              const stage = data.pipeline[stageKey]
              return (
                <div key={stageKey}>
                  <p className="font-medium text-foreground/85 mb-2 capitalize">{stageKey}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(stage.estados).map(([estado, cantidad]) => (
                      <div
                        key={`${stageKey}-${estado}`}
                        className="rounded-md border border-border bg-card px-3 py-2 text-sm flex justify-between"
                      >
                        <span className="text-foreground/80">{estado}</span>
                        <span className="font-semibold text-foreground">{cantidad}</span>
                      </div>
                    ))}
                    {Object.keys(stage.estados).length === 0 && (
                      <div className="text-sm text-muted-foreground">Sin registros</div>
                    )}
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tendencia mensual</CardTitle>
            <CardDescription>Seguimiento de oportunidades por etapa en el tiempo</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-muted/30">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-foreground/80">Periodo</th>
                  <th className="px-3 py-2 text-right font-medium text-foreground/80">Cotizaciones</th>
                  <th className="px-3 py-2 text-right font-medium text-foreground/80">Pedidos</th>
                  <th className="px-3 py-2 text-right font-medium text-foreground/80">Facturas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tendenciaRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">
                      No hay datos de tendencia en el intervalo analizado.
                    </td>
                  </tr>
                ) : (
                  tendenciaRows.map((row) => (
                    <tr key={row.periodo}>
                      <td className="px-3 py-2 text-foreground/80">{row.periodo}</td>
                      <td className="px-3 py-2 text-right text-foreground font-medium">
                        {row.cotizaciones}
                      </td>
                      <td className="px-3 py-2 text-right text-foreground font-medium">
                        {row.pedidos}
                      </td>
                      <td className="px-3 py-2 text-right text-foreground font-medium">
                        {row.facturas}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
