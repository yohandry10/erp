'use client'

import { useEffect, useMemo, useState } from 'react'
import { useApi } from '@/hooks/use-api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from '@/components/ui/use-toast'
import { Badge } from '@/components/ui/badge'
import { Check, FileWarning, Loader2, AlertTriangle } from 'lucide-react'

interface SunatIncidencia {
  id: string
  documento: string
  estado: string
  fecha: string
  error: string | null
  tipo_documento: string
}

interface SunatTendencia {
  periodo: string
  aceptados: number
  rechazados: number
  observados: number
  pendientes: number
}

interface SunatResponse {
  total: number
  aceptados: number
  observados: number
  rechazados: number
  pendientes: number
  tasaRechazo: number
  tasaObservacion: number
  incidencias: SunatIncidencia[]
  tendencia: SunatTendencia[]
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

const statusColors: Record<string, string> = {
  ACEPTADO: 'bg-emerald-500/10 text-emerald-400',
  OBSERVADO: 'bg-amber-500/10 text-amber-400',
  RECHAZADO: 'bg-destructive/10 text-destructive',
  PENDIENTE: 'bg-muted text-foreground/85',
  EMITIDO: 'bg-primary/10 text-primary'
}

export default function SunatMetricsReport({ filters }: Props) {
  const { get } = useApi()
  const [data, setData] = useState<SunatResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters])

  const loadData = async () => {
    try {
      setLoading(true)
      const response = await get('/ventas/reportes/sunat-kpis', {
        params: filters
      })

      if (response?.success) {
        setData(response.data)
      } else {
        throw new Error('Respuesta inválida del servidor')
      }
    } catch (error) {
      console.error('Error cargando KPIs SUNAT:', error)
      toast({
        title: 'Error al cargar métricas SUNAT',
        description: 'No se pudieron obtener las tasas de aceptación y rechazo.',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const tendenciaRows = useMemo(() => data?.tendencia ?? [], [data])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>KPIs SUNAT</CardTitle>
          <CardDescription className="text-xs leading-snug">Evaluando respuestas de emisión electrónica…</CardDescription>
        </CardHeader>
        <CardContent className="py-12 flex flex-col items-center justify-center gap-2 text-foreground/80">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span>Consultando registros</span>
        </CardContent>
      </Card>
    )
  }

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>KPIs SUNAT</CardTitle>
          <CardDescription className="text-xs leading-snug">No se encontraron documentos en el periodo revisado</CardDescription>
        </CardHeader>
        <CardContent className="py-12 text-center text-muted-foreground">
          Ajusta los filtros para analizar la aceptación de comprobantes electrónicos.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card className="flex h-full flex-col">
          <CardHeader className="pb-2 space-y-1">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-start gap-2">
              <Check className="h-4 w-4 shrink-0" />
              Documentos aceptados
            </CardTitle>
            <CardDescription className="text-xs leading-snug">
              Total de comprobantes conformes en el periodo
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto">
            <p className="text-4xl font-semibold text-emerald-400">{data.aceptados}</p>
            <p className="text-sm text-muted-foreground mt-1">de {data.total} documentos emitidos</p>
          </CardContent>
        </Card>

        <Card className="flex h-full flex-col">
          <CardHeader className="pb-2 space-y-1">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-start gap-2">
              <FileWarning className="h-4 w-4 shrink-0" />
              Tasa de observación
            </CardTitle>
            <CardDescription className="text-xs leading-snug">
              Documentos observados respecto al total emitido
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto">
            <p className="text-4xl font-semibold text-amber-400">{data.tasaObservacion.toFixed(2)}%</p>
            <p className="text-sm text-muted-foreground mt-1">{data.observados} observados</p>
          </CardContent>
        </Card>

        <Card className="flex h-full flex-col">
          <CardHeader className="pb-2 space-y-1">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Tasa de rechazo
            </CardTitle>
            <CardDescription className="text-xs leading-snug">
              Documentos rechazados por SUNAT / OSE
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto">
            <p className="text-4xl font-semibold text-rose-400">{data.tasaRechazo.toFixed(2)}%</p>
            <p className="text-sm text-muted-foreground mt-1">{data.rechazados} rechazados</p>
          </CardContent>
        </Card>

        <Card className="flex h-full flex-col">
          <CardHeader className="pb-2 space-y-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pendientes</CardTitle>
            <CardDescription className="text-xs leading-snug">Documentos aún no aceptados ni rechazados</CardDescription>
          </CardHeader>
          <CardContent className="mt-auto">
            <p className="text-4xl font-semibold text-foreground">{data.pendientes}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {data.total > 0 ? ((data.pendientes / data.total) * 100).toFixed(2) : '0.00'}%
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Incidencias recientes</CardTitle>
          <CardDescription className="text-xs leading-snug">
            Detalle de documentos observados o rechazados para priorizar correcciones
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.incidencias.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No se registran incidencias en el periodo. Todos los envíos fueron aceptados.
            </div>
          ) : (
            data.incidencias.map((incidencia) => (
              <div
                key={incidencia.id}
                className="border border-border rounded-lg p-3 bg-card shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">{incidencia.documento}</p>
                    <p className="text-xs text-muted-foreground">
                      {incidencia.tipo_documento} &middot; {new Date(incidencia.fecha).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge className={statusColors[incidencia.estado] ?? 'bg-muted text-foreground/85'}>
                    {incidencia.estado}
                  </Badge>
                </div>
                {incidencia.error && (
                  <p className="text-xs text-destructive mt-2 border-l-2 border-rose-400 pl-2">
                    {incidencia.error}
                  </p>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tendencia mensual</CardTitle>
          <CardDescription className="text-xs leading-snug">Resumen mensual de estados de emisión electrónica</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/30">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-foreground/80">Periodo</th>
                <th className="px-3 py-2 text-right font-medium text-foreground/80">Aceptados</th>
                <th className="px-3 py-2 text-right font-medium text-foreground/80">Observados</th>
                <th className="px-3 py-2 text-right font-medium text-foreground/80">Rechazados</th>
                <th className="px-3 py-2 text-right font-medium text-foreground/80">Pendientes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tendenciaRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">
                    No hay historial disponible para el periodo solicitado.
                  </td>
                </tr>
              ) : (
                tendenciaRows.map((row) => (
                  <tr key={row.periodo} className="bg-card">
                    <td className="px-3 py-2 text-foreground/80 font-medium">{row.periodo}</td>
                    <td className="px-3 py-2 text-right text-foreground/80">{row.aceptados}</td>
                    <td className="px-3 py-2 text-right text-amber-400">{row.observados}</td>
                    <td className="px-3 py-2 text-right text-destructive">{row.rechazados}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{row.pendientes}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
