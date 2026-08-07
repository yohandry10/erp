'use client'

import { useCallback, useEffect, useState } from 'react'
import { useApi } from '@/hooks/use-api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Package, ArrowUpDown } from 'lucide-react'
import { toast } from '@/components/ui/use-toast'
import { useCountryContext } from '@/hooks/use-country-context'

interface ProductoVendido {
  producto_id: string
  producto_nombre: string
  producto_codigo: string
  unidades_vendidas: number
  importe_total: number
  cantidad_pedidos: number
  precio_promedio: number
}

interface ReportFilters {
  fechaDesde: string
  fechaHasta: string
  cliente?: string
}

interface Props {
  filters: ReportFilters
}

type SortField = 'unidades' | 'importe'
type SortOrder = 'asc' | 'desc'

export default function ProductosMasVendidosReport({ filters }: Props) {
  const { get } = useApi()
  const country = useCountryContext()
  const currencySymbol = country.simboloMoneda || (country.paisCodigo === 'PE' ? 'S/' : '$')
  const [data, setData] = useState<ProductoVendido[]>([])
  const [loading, setLoading] = useState(true)
  const [sortField, setSortField] = useState<SortField>('unidades')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const response = await get('/ventas/reportes/productos-mas-vendidos', {
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

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('desc')
    }
  }

  const sortedData = [...data].sort((a, b) => {
    const multiplier = sortOrder === 'asc' ? 1 : -1
    if (sortField === 'unidades') {
      return (a.unidades_vendidas - b.unidades_vendidas) * multiplier
    } else {
      return (a.importe_total - b.importe_total) * multiplier
    }
  })

  const totalUnidades = data.reduce((sum, item) => sum + item.unidades_vendidas, 0)
  const totalImporte = data.reduce((sum, item) => sum + item.importe_total, 0)
  const totalProductos = data.length

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="w-5 h-5" />
          Productos Más Vendidos
        </CardTitle>
        <CardDescription>
          Ranking de productos por unidades vendidas e importe total
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-primary/10 rounded-lg p-4">
                <p className="text-sm text-primary font-medium">Total Productos</p>
                <p className="text-2xl font-bold text-primary">{totalProductos}</p>
              </div>
              <div className="rounded-lg border border-border/70 bg-muted/40 p-4">
                <p className="text-sm text-emerald-400 font-medium">Unidades Vendidas</p>
                <p className="text-2xl font-bold text-emerald-400">{totalUnidades.toFixed(0)}</p>
              </div>
              <div className="rounded-lg border border-border/70 bg-muted/40 p-4">
                <p className="text-sm text-violet-400 font-medium">Importe Total</p>
                <p className="text-2xl font-bold text-violet-400">{currencySymbol} {totalImporte.toFixed(2)}</p>
              </div>
            </div>

            {/* Sort Controls */}
            <div className="flex gap-2 mb-4">
              <Button
                variant={sortField === 'unidades' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleSort('unidades')}
                className="text-xs"
              >
                <ArrowUpDown className="w-3 h-3 mr-1" />
                Ordenar por Unidades
                {sortField === 'unidades' && (sortOrder === 'asc' ? ' ↑' : ' ↓')}
              </Button>
              <Button
                variant={sortField === 'importe' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleSort('importe')}
                className="text-xs"
              >
                <ArrowUpDown className="w-3 h-3 mr-1" />
                Ordenar por Importe
                {sortField === 'importe' && (sortOrder === 'asc' ? ' ↑' : ' ↓')}
              </Button>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      #
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Producto
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Código
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Unidades Vendidas
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Importe Total
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Pedidos
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Precio Promedio
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-card divide-y divide-border">
                  {sortedData.map((producto, index) => (
                    <tr key={producto.producto_id} className="hover:bg-muted/30">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm">
                          {index + 1}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-foreground">
                          {producto.producto_nombre}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-foreground">
                          {producto.producto_codigo}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="text-sm font-medium text-foreground">
                          {producto.unidades_vendidas.toFixed(2)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="text-sm font-medium text-foreground">
                          {currencySymbol} {producto.importe_total.toFixed(2)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="text-sm text-foreground">
                          {producto.cantidad_pedidos}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="text-sm text-foreground">
                          {currencySymbol} {producto.precio_promedio.toFixed(2)}
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
