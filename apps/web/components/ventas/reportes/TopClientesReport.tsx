'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { TrendingUp, Eye } from 'lucide-react'
import { toast } from '@/components/ui/use-toast'

interface TopCliente {
  cliente_id: string
  cliente_nombre: string
  cliente_documento: string
  total_facturacion: number
  cantidad_pedidos: number
  cantidad_facturas: number
  ticket_promedio: number
  porcentaje_total: number
}

interface ReportFilters {
  fechaDesde: string
  fechaHasta: string
}

interface Props {
  filters: ReportFilters
}

export default function TopClientesReport({ filters }: Props) {
  const router = useRouter()
  const { get } = useApi()
  const [data, setData] = useState<TopCliente[]>([])
  const [loading, setLoading] = useState(true)
  const [topN, setTopN] = useState(10)

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const response = await get('/ventas/reportes/top-clientes', {
        params: { ...filters, limit: topN }
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
  }, [filters, get, topN])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleVerCliente = (clienteId: string) => {
    router.push(`/dashboard/ventas/clientes/${clienteId}`)
  }

  const totalFacturacion = data.reduce((sum, item) => sum + item.total_facturacion, 0)
  const maxFacturacion = Math.max(...data.map(item => item.total_facturacion), 1)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Top Clientes por Facturación
            </CardTitle>
            <CardDescription>
              Clientes con mayor volumen de ventas en el periodo
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant={topN === 10 ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTopN(10)}
            >
              Top 10
            </Button>
            <Button
              variant={topN === 20 ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTopN(20)}
            >
              Top 20
            </Button>
            <Button
              variant={topN === 50 ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTopN(50)}
            >
              Top 50
            </Button>
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
            <p className="text-lg font-medium">No hay datos disponibles</p>
            <p className="text-sm">Ajusta los filtros para ver resultados</p>
          </div>
        ) : (
          <>
            {/* Summary Card */}
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-4 mb-6">
              <p className="text-sm text-gray-600 font-medium">Facturación Total (Top {topN})</p>
              <p className="text-3xl font-bold text-gray-900">S/ {totalFacturacion.toFixed(2)}</p>
              <p className="text-xs text-gray-500 mt-1">
                Promedio por cliente: S/ {(totalFacturacion / data.length).toFixed(2)}
              </p>
            </div>

            {/* Visual Chart */}
            <div className="space-y-3 mb-6">
              <h3 className="text-sm font-medium text-gray-700">Distribución de Facturación</h3>
              {data.slice(0, 10).map((cliente, index) => (
                <div key={cliente.cliente_id} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">
                        {index + 1}
                      </span>
                      <span className="font-medium text-gray-700 truncate">
                        {cliente.cliente_nombre}
                      </span>
                    </div>
                    <span className="text-gray-600 font-medium ml-2 flex-shrink-0">
                      S/ {cliente.total_facturacion.toFixed(2)}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden ml-8">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-500"
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Detailed Table */}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ranking
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Cliente
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Documento
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Facturación
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      % Total
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Pedidos
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Facturas
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ticket Promedio
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {data.map((cliente, index) => (
                    <tr key={cliente.cliente_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 text-white font-bold text-sm">
                          {index + 1}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">
                          {cliente.cliente_nombre}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {cliente.cliente_documento}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="text-sm font-bold text-gray-900">
                          S/ {cliente.total_facturacion.toFixed(2)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="text-sm text-gray-900">
                          {cliente.porcentaje_total.toFixed(1)}%
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="text-sm text-gray-900">
                          {cliente.cantidad_pedidos}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="text-sm text-gray-900">
                          {cliente.cantidad_facturas}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="text-sm text-gray-900">
                          S/ {cliente.ticket_promedio.toFixed(2)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleVerCliente(cliente.cliente_id)}
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
