'use client'

import { useCallback, useEffect, useState } from 'react'
import { useApi } from '@/hooks/use-api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart3 } from 'lucide-react'
import { toast } from '@/components/ui/use-toast'
import { EstadoPedido } from '@/types/ventas'

interface PedidoPorEstado {
  estado: EstadoPedido
  cantidad: number
  total: number
  porcentaje: number
}

interface ReportFilters {
  fechaDesde: string
  fechaHasta: string
  cliente?: string
}

interface Props {
  filters: ReportFilters
}

const ESTADO_COLORS: Record<EstadoPedido, string> = {
  [EstadoPedido.PENDIENTE]: '#FCD34D',
  [EstadoPedido.PENDIENTE_APROBACION]: '#FDBA74',
  [EstadoPedido.CONFIRMADO]: '#60A5FA',
  [EstadoPedido.EN_PREPARACION]: '#A78BFA',
  [EstadoPedido.LISTO_DESPACHO]: '#818CF8',
  [EstadoPedido.DESPACHO_PARCIAL]: '#F59E0B',
  [EstadoPedido.LISTO_FACTURAR]: '#34D399',
  [EstadoPedido.FACTURADO]: '#14B8A6',
  [EstadoPedido.COMPLETADO]: '#9CA3AF',
  [EstadoPedido.COMPLETADO_CON_GRE]: '#10B981',
  [EstadoPedido.CANCELADO]: '#F87171'
}

const ESTADO_LABELS: Record<EstadoPedido, string> = {
  [EstadoPedido.PENDIENTE]: 'Pendiente',
  [EstadoPedido.PENDIENTE_APROBACION]: 'Pendiente Aprobación',
  [EstadoPedido.CONFIRMADO]: 'Confirmado',
  [EstadoPedido.EN_PREPARACION]: 'En Preparación',
  [EstadoPedido.LISTO_DESPACHO]: 'Listo Despacho',
  [EstadoPedido.DESPACHO_PARCIAL]: 'Despacho Parcial',
  [EstadoPedido.LISTO_FACTURAR]: 'Listo Facturar',
  [EstadoPedido.FACTURADO]: 'Facturado',
  [EstadoPedido.COMPLETADO]: 'Completado',
  [EstadoPedido.COMPLETADO_CON_GRE]: 'Completado con GRE',
  [EstadoPedido.CANCELADO]: 'Cancelado'
}

export default function PedidosPorEstadoReport({ filters }: Props) {
  const { get } = useApi()
  const [data, setData] = useState<PedidoPorEstado[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const response = await get('/ventas/reportes/pedidos-por-estado', {
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

  const totalPedidos = data.reduce((sum, item) => sum + item.cantidad, 0)
  const totalMonto = data.reduce((sum, item) => sum + item.total, 0)
  const maxCantidad = Math.max(...data.map(item => item.cantidad), 1)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5" />
          Dashboard de Pedidos por Estado
        </CardTitle>
        <CardDescription>
          Distribución de pedidos según su estado actual
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-foreground/80">Cargando reporte...</p>
          </div>
        ) : data.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-lg font-medium">No hay datos disponibles</p>
            <p className="text-sm">Ajusta los filtros para ver resultados</p>
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="bg-primary/10 rounded-lg p-4">
                <p className="text-sm text-primary font-medium">Total Pedidos</p>
                <p className="text-2xl font-bold text-primary">{totalPedidos}</p>
              </div>
              <div className="bg-emerald-500/10 rounded-lg p-4">
                <p className="text-sm text-emerald-400 font-medium">Monto Total</p>
                <p className="text-2xl font-bold text-emerald-400">S/ {totalMonto.toFixed(2)}</p>
              </div>
            </div>

            {/* Visual Chart */}
            <div className="space-y-4 mb-6">
              <h3 className="text-sm font-medium text-foreground/85">Distribución por Estado</h3>
              {data.map((item) => (
                <div key={item.estado} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-foreground/85">
                      {ESTADO_LABELS[item.estado]}
                    </span>
                    <span className="text-foreground/80">
                      {item.cantidad} pedidos ({item.porcentaje.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Detailed Table */}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Estado
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Cantidad
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Porcentaje
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Monto Total
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Promedio
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-card divide-y divide-gray-200">
                  {data.map((item) => (
                    <tr key={item.estado} className="hover:bg-muted/30">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                          />
                          <span className="text-sm font-medium text-foreground">
                            {ESTADO_LABELS[item.estado]}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="text-sm font-medium text-foreground">
                          {item.cantidad}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="text-sm text-foreground">
                          {item.porcentaje.toFixed(1)}%
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="text-sm font-medium text-foreground">
                          S/ {item.total.toFixed(2)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="text-sm text-foreground">
                          S/ {(item.total / item.cantidad).toFixed(2)}
                        </div>
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
