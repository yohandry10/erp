'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FileText, Eye, AlertCircle } from 'lucide-react'
import { toast } from '@/components/ui/use-toast'
import { format, differenceInDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { EstadoCotizacion } from '@/types/ventas'
import { useCountryContext } from '@/hooks/use-country-context'

interface CotizacionPendiente {
  id: string
  numero: string
  cliente_nombre: string
  cliente_documento: string
  fecha: string
  fecha_vencimiento: string | null
  estado: EstadoCotizacion
  total: number
  dias_vigencia: number
  probabilidad?: number
}

interface ReportFilters {
  fechaDesde: string
  fechaHasta: string
  cliente?: string
}

interface Props {
  filters: ReportFilters
}

export default function CotizacionesPendientesReport({ filters }: Props) {
  const router = useRouter()
  const { get } = useApi()
  const country = useCountryContext()
  const currencySymbol = country.simboloMoneda || (country.paisCodigo === 'PE' ? 'S/' : '$')
  const [data, setData] = useState<CotizacionPendiente[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const response = await get('/ventas/reportes/cotizaciones-pendientes', {
        params: filters
      })

      if (response?.success) {
        setData(response.data || [])
      }
    } catch (error) {
      console.error('Error loading report:', error)
      toast({
        title: 'Error',
        description: 'No se pudo cargar el reporte',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }, [filters, get])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleVerDetalle = (cotizacionId: string) => {
    router.push(`/dashboard/ventas/cotizaciones/${cotizacionId}`)
  }

  const getEstadoBadge = (estado: EstadoCotizacion) => {
    const colors = {
      [EstadoCotizacion.BORRADOR]: 'bg-muted text-foreground',
      [EstadoCotizacion.ENVIADA]: 'bg-primary/10 text-primary',
      [EstadoCotizacion.APROBADA]: 'bg-emerald-500/10 text-emerald-400',
      [EstadoCotizacion.RECHAZADA]: 'bg-destructive/10 text-destructive',
      [EstadoCotizacion.CONVERTIDA]: 'bg-primary/10 text-primary',
      [EstadoCotizacion.VENCIDA]: 'bg-amber-500/10 text-amber-400'
    }

    const labels = {
      [EstadoCotizacion.BORRADOR]: 'Borrador',
      [EstadoCotizacion.ENVIADA]: 'Enviada',
      [EstadoCotizacion.APROBADA]: 'Aprobada',
      [EstadoCotizacion.RECHAZADA]: 'Rechazada',
      [EstadoCotizacion.CONVERTIDA]: 'Convertida',
      [EstadoCotizacion.VENCIDA]: 'Vencida'
    }

    return (
      <Badge className={colors[estado]}>
        {labels[estado]}
      </Badge>
    )
  }

  const getVigenciaStatus = (diasVigencia: number) => {
    if (diasVigencia < 0) {
      return <span className="text-destructive font-medium">Vencida</span>
    } else if (diasVigencia <= 3) {
      return <span className="text-amber-400 font-medium">Por vencer ({diasVigencia}d)</span>
    } else {
      return <span className="text-emerald-400">{diasVigencia} días</span>
    }
  }

  const totalCotizaciones = data.length
  const totalMonto = data.reduce((sum, item) => sum + item.total, 0)
  const porVencer = data.filter(c => c.dias_vigencia >= 0 && c.dias_vigencia <= 3).length
  const vencidas = data.filter(c => c.dias_vigencia < 0).length

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Cotizaciones Pendientes
            </CardTitle>
            <CardDescription>
              Cotizaciones en estado BORRADOR o ENVIADA que requieren seguimiento
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-foreground/80">Cargando reporte...</p>
          </div>
        ) : data.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-lg font-medium">No hay cotizaciones pendientes</p>
            <p className="text-sm">Todas las cotizaciones han sido procesadas</p>
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-primary/10 rounded-lg p-4">
                <p className="text-sm text-primary font-medium">Total Cotizaciones</p>
                <p className="text-2xl font-bold text-primary">{totalCotizaciones}</p>
              </div>
              <div className="rounded-lg border border-border/70 bg-muted/40 p-4">
                <p className="text-sm text-emerald-400 font-medium">Monto Total</p>
                <p className="text-2xl font-bold text-emerald-400">{currencySymbol} {totalMonto.toFixed(2)}</p>
              </div>
              <div className="rounded-lg border border-border/70 bg-muted/40 p-4">
                <p className="text-sm text-amber-400 font-medium">Por Vencer</p>
                <p className="text-2xl font-bold text-amber-400">{porVencer}</p>
              </div>
              <div className="bg-destructive/10 rounded-lg p-4">
                <p className="text-sm text-destructive font-medium">Vencidas</p>
                <p className="text-2xl font-bold text-destructive">{vencidas}</p>
              </div>
            </div>

            {/* Alert for urgent items */}
            {(porVencer > 0 || vencidas > 0) && (
              <div className="bg-amber-500/10 border border-border rounded-lg p-4 mb-6 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-400 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-400">Atención requerida</p>
                  <p className="text-sm text-amber-400">
                    Hay {porVencer + vencidas} cotizaciones que requieren seguimiento urgente
                  </p>
                </div>
              </div>
            )}

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Número
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Cliente
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Fecha
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Vencimiento
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Vigencia
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Estado
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Total
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Probabilidad
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-card divide-y divide-border">
                  {data.map((cotizacion) => (
                    <tr key={cotizacion.id} className="hover:bg-muted/30">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-foreground">
                          {cotizacion.numero}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-foreground">
                          {cotizacion.cliente_nombre}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {cotizacion.cliente_documento}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-foreground">
                          {format(new Date(cotizacion.fecha), 'dd/MM/yyyy', { locale: es })}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-foreground">
                          {cotizacion.fecha_vencimiento
                            ? format(new Date(cotizacion.fecha_vencimiento), 'dd/MM/yyyy', { locale: es })
                            : 'Sin fecha'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm">
                          {getVigenciaStatus(cotizacion.dias_vigencia)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getEstadoBadge(cotizacion.estado)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="text-sm font-medium text-foreground">
                          {currencySymbol} {cotizacion.total.toFixed(2)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {cotizacion.probabilidad ? (
                          <div className="text-sm font-medium text-foreground">
                            {cotizacion.probabilidad}%
                          </div>
                        ) : (
                          <div className="text-sm text-muted-foreground">-</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleVerDetalle(cotizacion.id)}
                          className="text-primary hover:text-primary"
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          Ver
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
