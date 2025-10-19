'use client'

import { useState, useEffect } from 'react'
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
  const [data, setData] = useState<CotizacionPendiente[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [filters])

  const loadData = async () => {
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
  }

  const handleVerDetalle = (cotizacionId: string) => {
    router.push(`/dashboard/ventas/cotizaciones/${cotizacionId}`)
  }

  const getEstadoBadge = (estado: EstadoCotizacion) => {
    const colors = {
      [EstadoCotizacion.BORRADOR]: 'bg-gray-100 text-gray-800',
      [EstadoCotizacion.ENVIADA]: 'bg-blue-100 text-blue-800',
      [EstadoCotizacion.APROBADA]: 'bg-green-100 text-green-800',
      [EstadoCotizacion.RECHAZADA]: 'bg-red-100 text-red-800',
      [EstadoCotizacion.CONVERTIDA]: 'bg-purple-100 text-purple-800',
      [EstadoCotizacion.VENCIDA]: 'bg-orange-100 text-orange-800'
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
      return <span className="text-red-600 font-medium">Vencida</span>
    } else if (diasVigencia <= 3) {
      return <span className="text-orange-600 font-medium">Por vencer ({diasVigencia}d)</span>
    } else {
      return <span className="text-green-600">{diasVigencia} días</span>
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
            <p className="mt-2 text-gray-600">Cargando reporte...</p>
          </div>
        ) : data.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-lg font-medium">No hay cotizaciones pendientes</p>
            <p className="text-sm">Todas las cotizaciones han sido procesadas</p>
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-blue-50 rounded-lg p-4">
                <p className="text-sm text-blue-600 font-medium">Total Cotizaciones</p>
                <p className="text-2xl font-bold text-blue-900">{totalCotizaciones}</p>
              </div>
              <div className="bg-green-50 rounded-lg p-4">
                <p className="text-sm text-green-600 font-medium">Monto Total</p>
                <p className="text-2xl font-bold text-green-900">S/ {totalMonto.toFixed(2)}</p>
              </div>
              <div className="bg-orange-50 rounded-lg p-4">
                <p className="text-sm text-orange-600 font-medium">Por Vencer</p>
                <p className="text-2xl font-bold text-orange-900">{porVencer}</p>
              </div>
              <div className="bg-red-50 rounded-lg p-4">
                <p className="text-sm text-red-600 font-medium">Vencidas</p>
                <p className="text-2xl font-bold text-red-900">{vencidas}</p>
              </div>
            </div>

            {/* Alert for urgent items */}
            {(porVencer > 0 || vencidas > 0) && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
                <div>
                  <p className="font-medium text-yellow-900">Atención requerida</p>
                  <p className="text-sm text-yellow-700">
                    Hay {porVencer + vencidas} cotizaciones que requieren seguimiento urgente
                  </p>
                </div>
              </div>
            )}

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Número
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Cliente
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Fecha
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Vencimiento
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Vigencia
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Estado
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Probabilidad
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {data.map((cotizacion) => (
                    <tr key={cotizacion.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {cotizacion.numero}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {cotizacion.cliente_nombre}
                        </div>
                        <div className="text-xs text-gray-500">
                          {cotizacion.cliente_documento}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {format(new Date(cotizacion.fecha), 'dd/MM/yyyy', { locale: es })}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
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
                        <div className="text-sm font-medium text-gray-900">
                          S/ {cotizacion.total.toFixed(2)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {cotizacion.probabilidad ? (
                          <div className="text-sm font-medium text-gray-900">
                            {cotizacion.probabilidad}%
                          </div>
                        ) : (
                          <div className="text-sm text-gray-400">-</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleVerDetalle(cotizacion.id)}
                          className="text-blue-600 hover:text-blue-700"
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
