'use client'

import { useState, useEffect } from 'react'
import { useApi } from '@/hooks/use-api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DollarSign, Clock, TrendingDown, TrendingUp } from 'lucide-react'
import { toast } from '@/components/ui/use-toast'

interface LeadTimeData {
  promedio_dias: number
  mediana_dias: number
  minimo_dias: number
  maximo_dias: number
  total_conversiones: number
  por_rango: {
    rango: string
    cantidad: number
    porcentaje: number
  }[]
  tendencia: {
    periodo: string
    promedio_dias: number
  }[]
}

interface ReportFilters {
  fechaDesde: string
  fechaHasta: string
}

interface Props {
  filters: ReportFilters
}

export default function LeadTimeReport({ filters }: Props) {
  const { get } = useApi()
  const [data, setData] = useState<LeadTimeData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [filters])

  const loadData = async () => {
    try {
      setLoading(true)
      const response = await get('/ventas/reportes/lead-time', {
        params: filters
      })
      
      if (response?.success) {
        setData(response.data)
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

  const getTendenciaIcon = () => {
    if (!data || data.tendencia.length < 2) return null
    
    const primero = data.tendencia[0].promedio_dias
    const ultimo = data.tendencia[data.tendencia.length - 1].promedio_dias
    
    if (ultimo < primero) {
      return <TrendingDown className="w-5 h-5 text-green-600" />
    } else if (ultimo > primero) {
      return <TrendingUp className="w-5 h-5 text-red-600" />
    }
    return null
  }

  const getTendenciaText = () => {
    if (!data || data.tendencia.length < 2) return 'Sin datos suficientes'
    
    const primero = data.tendencia[0].promedio_dias
    const ultimo = data.tendencia[data.tendencia.length - 1].promedio_dias
    const diferencia = Math.abs(ultimo - primero)
    
    if (ultimo < primero) {
      return `Mejora de ${diferencia.toFixed(1)} días`
    } else if (ultimo > primero) {
      return `Incremento de ${diferencia.toFixed(1)} días`
    }
    return 'Sin cambios'
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="w-5 h-5" />
          Lead Time Comercial
        </CardTitle>
        <CardDescription>
          Tiempo promedio desde cotización hasta factura emitida
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-gray-600">Cargando reporte...</p>
          </div>
        ) : !data || data.total_conversiones === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-lg font-medium">No hay datos disponibles</p>
            <p className="text-sm">No se encontraron conversiones de cotización a factura en el periodo</p>
          </div>
        ) : (
          <>
            {/* Main Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-4 h-4 text-blue-600" />
                  <p className="text-sm text-blue-600 font-medium">Promedio</p>
                </div>
                <p className="text-3xl font-bold text-blue-900">{data.promedio_dias.toFixed(1)}</p>
                <p className="text-xs text-blue-700">días</p>
              </div>

              <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-4 h-4 text-green-600" />
                  <p className="text-sm text-green-600 font-medium">Mediana</p>
                </div>
                <p className="text-3xl font-bold text-green-900">{data.mediana_dias.toFixed(1)}</p>
                <p className="text-xs text-green-700">días</p>
              </div>

              <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-4 h-4 text-purple-600" />
                  <p className="text-sm text-purple-600 font-medium">Mínimo</p>
                </div>
                <p className="text-3xl font-bold text-purple-900">{data.minimo_dias.toFixed(1)}</p>
                <p className="text-xs text-purple-700">días</p>
              </div>

              <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-4 h-4 text-orange-600" />
                  <p className="text-sm text-orange-600 font-medium">Máximo</p>
                </div>
                <p className="text-3xl font-bold text-orange-900">{data.maximo_dias.toFixed(1)}</p>
                <p className="text-xs text-orange-700">días</p>
              </div>
            </div>

            {/* Conversions Summary */}
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <p className="text-sm text-gray-600 font-medium">Total de Conversiones</p>
              <p className="text-2xl font-bold text-gray-900">{data.total_conversiones}</p>
              <p className="text-xs text-gray-500 mt-1">
                Cotizaciones convertidas a facturas en el periodo
              </p>
            </div>

            {/* Distribution by Range */}
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Distribución por Rango de Tiempo</h3>
              <div className="space-y-3">
                {data.por_rango.map((rango, index) => (
                  <div key={index} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-gray-700">{rango.rango}</span>
                      <span className="text-gray-600">
                        {rango.cantidad} conversiones ({rango.porcentaje.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-500"
                        style={{ width: `${rango.porcentaje}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Trend Analysis */}
            {data.tendencia.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-gray-700">Tendencia Temporal</h3>
                  <div className="flex items-center gap-2 text-sm">
                    {getTendenciaIcon()}
                    <span className="font-medium text-gray-700">{getTendenciaText()}</span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Periodo
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Promedio (días)
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {data.tendencia.map((item, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">{item.periodo}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <div className="text-sm font-medium text-gray-900">
                              {item.promedio_dias.toFixed(1)}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Insights */}
            <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="text-sm font-medium text-blue-900 mb-2">Insights</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• El lead time promedio es de {data.promedio_dias.toFixed(1)} días</li>
                <li>• El 50% de las conversiones ocurren en {data.mediana_dias.toFixed(1)} días o menos</li>
                {data.promedio_dias > 7 && (
                  <li>• Considera optimizar el proceso de seguimiento para reducir el tiempo de conversión</li>
                )}
                {data.promedio_dias <= 3 && (
                  <li>• Excelente velocidad de conversión, mantén este ritmo</li>
                )}
              </ul>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
