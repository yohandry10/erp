'use client'

import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Download } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { parseDateLocal } from '@/lib/date-utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/use-toast'

interface ReportFilters {
  fechaDesde: string
  fechaHasta: string
  vendedor?: string
  cliente?: string
  estado?: string
}

interface VentaResumen {
  id: string
  fecha: string
  estado?: string
  numero_documento?: string
  tipo_documento?: string
  subtotal?: number
  igv?: number
  total?: number
  moneda?: string
  metodo_pago?: string
  clientes?: {
    nombre?: string
    numero_documento?: string
  }
}

interface ResumenTotales {
  subtotal: number
  igv: number
  total: number
}

type Props = {
  filters: ReportFilters
}

function formatMoney(value: any) {
  const num = Number(value || 0)
  return num.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function ResumenVentasReport({ filters }: Props) {
  const { get } = useApi()
  const [data, setData] = useState<VentaResumen[]>([])
  const [resumen, setResumen] = useState<ResumenTotales>({ subtotal: 0, igv: 0, total: 0 })
  const [loading, setLoading] = useState(false)

  const loadData = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (filters.fechaDesde) params.set('fechaInicio', filters.fechaDesde)
      if (filters.fechaHasta) params.set('fechaFin', filters.fechaHasta)
      if (filters.estado) params.set('estado', filters.estado)

      const response = await get(`/reports/ventas?${params.toString()}`)
      const ventas = response?.data?.data || response?.data || []
      setData(ventas)
      setResumen(response?.resumen || response?.data?.resumen || { subtotal: 0, igv: 0, total: 0 })
    } catch (error: any) {
      toast({
        title: 'Error al cargar ventas',
        description: error?.message || 'No se pudieron obtener las ventas',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.fechaDesde, filters.fechaHasta, filters.estado])

  const csvData = useMemo(() => {
    if (!data.length) return ''
    const headers = [
      'Fecha',
      'TipoDocumento',
      'NumeroDocumento',
      'Cliente',
      'DocumentoCliente',
      'Estado',
      'Moneda',
      'Subtotal',
      'IGV',
      'Total',
      'MetodoPago'
    ]
    const rows = data.map(v => [
      v.fecha,
      v.tipo_documento || '',
      v.numero_documento || '',
      v.clientes?.nombre || '',
      v.clientes?.numero_documento || '',
      v.estado || '',
      v.moneda || 'PEN',
      Number(v.subtotal || 0).toFixed(2),
      Number(v.igv || 0).toFixed(2),
      Number(v.total || 0).toFixed(2),
      v.metodo_pago || ''
    ])
    return [headers, ...rows].map(r => r.join(',')).join('\n')
  }, [data])

  const handleExport = () => {
    if (!csvData) {
      toast({
        title: 'Sin datos para exportar',
        description: 'No hay ventas en el rango seleccionado',
      })
      return
    }
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', 'reporte-ventas.csv')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Total Ventas</CardTitle>
            <CardDescription>Suma de ventas en el rango seleccionado</CardDescription>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-emerald-400">
            S/ {formatMoney(resumen.total)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Subtotal</CardTitle>
            <CardDescription>Base imponible (sin IGV)</CardDescription>
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-foreground">
            S/ {formatMoney(resumen.subtotal)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <CardTitle>IGV</CardTitle>
              <CardDescription>Impuesto calculado</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={handleExport} className="shrink-0">
              <Download size={16} className="mr-2" /> Exportar CSV
            </Button>
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-amber-400">
            S/ {formatMoney(resumen.igv)}
          </CardContent>
        </Card>
      </div>

      <div className="overflow-auto rounded-lg border border-border/70 bg-card text-card-foreground shadow-sm">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-muted/60">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Fecha</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Documento</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Cliente</th>
              <th className="px-4 py-2 text-right text-xs font-semibold text-muted-foreground">Subtotal</th>
              <th className="px-4 py-2 text-right text-xs font-semibold text-muted-foreground">IGV</th>
              <th className="px-4 py-2 text-right text-xs font-semibold text-muted-foreground">Total</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-card">
            {loading && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-muted-foreground">
                  Cargando ventas...
                </td>
              </tr>
            )}
            {!loading && data.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No hay ventas en el rango seleccionado
                </td>
              </tr>
            )}
            {!loading &&
              data.map((venta) => (
                <tr key={venta.id}>
                  <td className="px-4 py-2 text-sm text-foreground">
                    {venta.fecha ? format(parseDateLocal(venta.fecha), 'dd MMM yyyy', { locale: es }) : '-'}
                  </td>
                  <td className="px-4 py-2 text-sm text-foreground">
                    <div className="font-medium">{venta.tipo_documento || '-'}</div>
                    <div className="text-xs text-muted-foreground">{venta.numero_documento || ''}</div>
                  </td>
                  <td className="px-4 py-2 text-sm text-foreground">
                    <div className="font-medium">{venta.clientes?.nombre || 'Sin cliente'}</div>
                    <div className="text-xs text-muted-foreground">{venta.clientes?.numero_documento || ''}</div>
                  </td>
                  <td className="px-4 py-2 text-right text-sm text-foreground">S/ {formatMoney(venta.subtotal)}</td>
                  <td className="px-4 py-2 text-right text-sm text-foreground">S/ {formatMoney(venta.igv)}</td>
                  <td className="px-4 py-2 text-sm text-right font-semibold text-emerald-400">
                    S/ {formatMoney(venta.total)}
                  </td>
                  <td className="px-4 py-2 text-sm text-foreground">{venta.estado || '-'}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
