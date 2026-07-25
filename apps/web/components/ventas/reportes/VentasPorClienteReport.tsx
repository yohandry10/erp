'use client'

import { useCallback, useEffect, useState } from 'react'
import { useApi } from '@/hooks/use-api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Download, TrendingUp } from 'lucide-react'
import { toast } from '@/components/ui/use-toast'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface VentaPorCliente {
  cliente_id: string
  cliente_nombre: string
  cliente_documento: string
  periodo: string
  moneda: string
  estado: string
  total: number
  cantidad_pedidos: number
  cantidad_facturas: number
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

export default function VentasPorClienteReport({ filters }: Props) {
  const { get } = useApi()
  const [data, setData] = useState<VentaPorCliente[]>([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState<'total' | 'cantidad'>('total')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const response = await get('/ventas/reportes/ventas-por-cliente', {
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

  const handleExport = () => {
    try {
      // Convert data to CSV
      const headers = ['Cliente', 'Documento', 'Periodo', 'Moneda', 'Estado', 'Total', 'Pedidos', 'Facturas']
      const csvData = data.map(row => [
        row.cliente_nombre,
        row.cliente_documento,
        row.periodo,
        row.moneda,
        row.estado,
        row.total.toFixed(2),
        row.cantidad_pedidos,
        row.cantidad_facturas
      ])

      const csv = [
        headers.join(','),
        ...csvData.map(row => row.join(','))
      ].join('\n')

      // Create download link
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)
      link.setAttribute('href', url)
      link.setAttribute('download', `ventas-por-cliente-${format(new Date(), 'yyyy-MM-dd')}.csv`)
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      toast({
        title: 'Reporte exportado',
        description: 'El archivo CSV se ha descargado correctamente'
      })
    } catch (error) {
      console.error('Error exporting:', error)
      toast({
        title: 'Error',
        description: 'No se pudo exportar el reporte',
        variant: 'destructive'
      })
    }
  }

  const sortedData = [...data].sort((a, b) => {
    const multiplier = sortOrder === 'asc' ? 1 : -1
    if (sortBy === 'total') {
      return (a.total - b.total) * multiplier
    } else {
      return (a.cantidad_pedidos - b.cantidad_pedidos) * multiplier
    }
  })

  const totalGeneral = data.reduce((sum, item) => sum + item.total, 0)
  const totalPedidos = data.reduce((sum, item) => sum + item.cantidad_pedidos, 0)
  const totalFacturas = data.reduce((sum, item) => sum + item.cantidad_facturas, 0)

  const handleSort = (field: 'total' | 'cantidad') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortOrder('desc')
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Ventas por Cliente
            </CardTitle>
            <CardDescription>
              Análisis de ventas agrupadas por cliente en el periodo seleccionado
            </CardDescription>
          </div>
          <Button onClick={handleExport} variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Exportar CSV
          </Button>
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
            <p className="text-lg font-medium">No hay datos disponibles</p>
            <p className="text-sm">Ajusta los filtros para ver resultados</p>
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-primary/10 rounded-lg p-4">
                <p className="text-sm text-primary font-medium">Total Ventas</p>
                <p className="text-2xl font-bold text-primary">S/ {totalGeneral.toFixed(2)}</p>
              </div>
              <div className="bg-emerald-500/10 rounded-lg p-4">
                <p className="text-sm text-emerald-400 font-medium">Total Pedidos</p>
                <p className="text-2xl font-bold text-emerald-400">{totalPedidos}</p>
              </div>
              <div className="bg-violet-500/10 rounded-lg p-4">
                <p className="text-sm text-violet-400 font-medium">Total Facturas</p>
                <p className="text-2xl font-bold text-violet-400">{totalFacturas}</p>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Cliente
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Documento
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Periodo
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Moneda
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Estado
                    </th>
                    <th
                      className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground/85"
                      onClick={() => handleSort('total')}
                    >
                      Total {sortBy === 'total' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground/85"
                      onClick={() => handleSort('cantidad')}
                    >
                      Pedidos {sortBy === 'cantidad' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Facturas
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-card divide-y divide-gray-200">
                  {sortedData.map((row, index) => (
                    <tr key={index} className="hover:bg-muted/30">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-foreground">
                          {row.cliente_nombre}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-foreground">
                          {row.cliente_documento}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-foreground">
                          {row.periodo}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-foreground">
                          {row.moneda}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-foreground">
                          {row.estado}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="text-sm font-medium text-foreground">
                          S/ {row.total.toFixed(2)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="text-sm text-foreground">
                          {row.cantidad_pedidos}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="text-sm text-foreground">
                          {row.cantidad_facturas}
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
