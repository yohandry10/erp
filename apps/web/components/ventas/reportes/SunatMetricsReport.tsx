'use client'

import { useEffect, useMemo, useState } from 'react'
import { useApi } from '@/hooks/use-api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from '@/components/ui/use-toast'
import { Badge } from '@/components/ui/badge'
import { Check, FileWarning, Loader2, TriangleAlert } from 'lucide-react'

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
  ACEPTADO: 'bg-emerald-100 text-emerald-700',
  OBSERVADO: 'bg-amber-100 text-amber-700',
  RECHAZADO: 'bg-rose-100 text-rose-700',
  PENDIENTE: 'bg-slate-100 text-slate-700',
  EMITIDO: 'bg-blue-100 text-blue-700'
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
          <CardDescription>Evaluando respuestas de emisión electrónica…</CardDescription>
        </CardHeader>
        <CardContent className="py-12 flex flex-col items-center justify-center gap-2 text-slate-600">
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
          <CardDescription>No se encontraron documentos en el periodo revisado</CardDescription>
        </CardHeader>
        <CardContent className="py-12 text-center text-slate-500">
          Ajusta los filtros para analizar la aceptación de comprobantes electrónicos.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-emerald-600 text-white">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Check className="h-5 w-5" />
              Documentos aceptados
            </CardTitle>
            <CardDescription className="text-emerald-100">
              Total de comprobantes conformes en el periodo
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-semibold">{data.aceptados}</p>
            <p className="text-sm text-emerald-100 mt-1">de {data.total} documentos emitidos</p>
          </CardContent>
        </Card>

        <Card className="bg-amber-500 text-white">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <FileWarning className="h-5 w-5" />
              Tasa de observación
            </CardTitle>
            <CardDescription className="text-amber-100">
              Documentos observados respecto al total emitido
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-semibold">{data.tasaObservacion.toFixed(2)}%</p>
            <p className="text-sm text-amber-100 mt-1">{data.observados} observados</p>
          </CardContent>
        </Card>

        <Card className="bg-rose-500 text-white">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <TriangleAlert className="h-5 w-5" />
              Tasa de rechazo
            </CardTitle>
            <CardDescription className="text-rose-100">
              Documentos rechazados por SUNAT / OSE
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-semibold">{data.tasaRechazo.toFixed(2)}%</p>
            <p className="text-sm text-rose-100 mt-1">{data.rechazados} rechazados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium text-slate-700">Pendientes</CardTitle>
            <CardDescription>Documentos aún no aceptados ni rechazados</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-semibold text-slate-900">{data.pendientes}</p>
            <p className="text-sm text-slate-500 mt-1">
              {data.total > 0 ? ((data.pendientes / data.total) * 100).toFixed(2) : '0.00'}%
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Incidencias recientes</CardTitle>
          <CardDescription>
            Detalle de documentos observados o rechazados para priorizar correcciones
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.incidencias.length === 0 ? (
            <div className="text-sm text-slate-500">
              No se registran incidencias en el periodo. Todos los envíos fueron aceptados.
            </div>
          ) : (
            data.incidencias.map((incidencia) => (
              <div
                key={incidencia.id}
                className="border border-slate-200 rounded-lg p-3 bg-white shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{incidencia.documento}</p>
                    <p className="text-xs text-slate-500">
                      {incidencia.tipo_documento} &middot; {new Date(incidencia.fecha).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge className={statusColors[incidencia.estado] ?? 'bg-slate-200 text-slate-700'}>
                    {incidencia.estado}
                  </Badge>
                </div>
                {incidencia.error && (
                  <p className="text-xs text-rose-600 mt-2 border-l-2 border-rose-400 pl-2">
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
          <CardDescription>Resumen mensual de estados de emisión electrónica</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-slate-600">Periodo</th>
                <th className="px-3 py-2 text-right font-medium text-slate-600">Aceptados</th>
                <th className="px-3 py-2 text-right font-medium text-slate-600">Observados</th>
                <th className="px-3 py-2 text-right font-medium text-slate-600">Rechazados</th>
                <th className="px-3 py-2 text-right font-medium text-slate-600">Pendientes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tendenciaRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-slate-500">
                    No hay historial disponible para el periodo solicitado.
                  </td>
                </tr>
              ) : (
                tendenciaRows.map((row) => (
                  <tr key={row.periodo} className="bg-white">
                    <td className="px-3 py-2 text-slate-600 font-medium">{row.periodo}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{row.aceptados}</td>
                    <td className="px-3 py-2 text-right text-amber-600">{row.observados}</td>
                    <td className="px-3 py-2 text-right text-rose-600">{row.rechazados}</td>
                    <td className="px-3 py-2 text-right text-slate-500">{row.pendientes}</td>
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
