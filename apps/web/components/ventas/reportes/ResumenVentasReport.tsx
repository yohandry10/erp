'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Download } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { parseDateLocal } from '@/lib/date-utils'
import { downloadCsv } from '@/lib/csv-export'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useCountryContext } from '@/hooks/use-country-context'
import { useTaxConfig } from '@/hooks/useTaxConfig'
import { reportMoney } from './report-money'

interface ReportFilters {
  fechaDesde: string
  fechaHasta: string
  cliente?: string
  estado?: string
}

interface VentaResumen {
  id: string
  fecha: string
  estado?: string
  serie?: string
  numero_documento?: string
  tipo_documento?: string
  subtotal?: number
  igv?: number
  total?: number
  moneda?: string
  metodo_pago?: string
  total_gravadas?: number
  total_exoneradas?: number
  total_inafectas?: number
  total_exportacion?: number
  clientes?: { nombre?: string; numero_documento?: string }
}

interface ResumenTotales {
  moneda: string
  subtotal: number
  igv: number
  total: number
  exoneradas: number
  inafectas: number
  exportacion: number
}

export default function ResumenVentasReport({ filters }: { filters: ReportFilters }) {
  const { get } = useApi({ throwOnError: true, showErrorToast: false, retries: 1 })
  const country = useCountryContext()
  const { nombreImpuesto } = useTaxConfig()
  const [data, setData] = useState<VentaResumen[]>([])
  const [resumen, setResumen] = useState<ResumenTotales[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(0)
  const invalidate = useCallback(() => { ++requestId.current }, [])

  const loadData = useCallback(async () => {
    const id = ++requestId.current
    setLoading(true)
    setError(null)
    setData([])
    setResumen([])
    try {
      if (filters.fechaDesde && filters.fechaHasta && filters.fechaDesde > filters.fechaHasta) {
        throw new Error('La fecha desde debe ser anterior o igual a la fecha hasta')
      }
      const params = new URLSearchParams()
      if (filters.fechaDesde) params.set('fechaInicio', filters.fechaDesde)
      if (filters.fechaHasta) params.set('fechaFin', filters.fechaHasta)
      if (filters.estado) params.set('estado', filters.estado)
      if (filters.cliente?.trim()) params.set('cliente', filters.cliente.trim())
      const response = await get(`/reports/ventas?${params.toString()}`)
      if (!response?.success || !Array.isArray(response.data) || !Array.isArray(response.resumenPorMoneda)) {
        throw new Error('El reporte recibido está incompleto. Vuelve a intentarlo')
      }
      if (id !== requestId.current) return
      setData(response.data)
      setResumen(response.resumenPorMoneda)
    } catch (cause: unknown) {
      if (id === requestId.current) setError(cause instanceof Error ? cause.message : 'No se pudieron obtener las ventas')
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [filters.fechaDesde, filters.fechaHasta, filters.estado, filters.cliente, get])

  useEffect(() => {
    // Invalidar primero la consulta anterior, incluso durante la espera al teclear.
    invalidate()
    setLoading(true)
    setData([])
    setResumen([])
    setError(null)
    const timer = window.setTimeout(() => { void loadData() }, 250)
    return () => { window.clearTimeout(timer); invalidate() }
  }, [loadData, invalidate])

  const totals = resumen.length ? resumen : [{ moneda: country.moneda || 'PEN', subtotal: 0, igv: 0,
    total: 0, exoneradas: 0, inafectas: 0, exportacion: 0 }]
  const moneyTotals = (field: 'total' | 'subtotal' | 'igv') => loading || error ? '—' : totals.map(group => (
    <div key={group.moneda || 'unknown'}>
      {reportMoney(group[field], group.moneda)}
      {field === 'subtotal' && (group.exoneradas + group.inafectas + group.exportacion) > 0 && (
        <div className="mt-1 text-xs font-normal text-muted-foreground">
          + {reportMoney(group.exoneradas + group.inafectas + group.exportacion, group.moneda)} en operaciones no gravadas
        </div>
      )}
    </div>
  ))

  const handleExport = () => {
    if (loading || error || !data.length) return
    downloadCsv('reporte-ventas.csv', ['Fecha', 'TipoDocumento', 'Serie', 'NumeroDocumento', 'Cliente',
      'DocumentoCliente', 'Estado', 'Moneda', 'BaseGravada', 'Exoneradas', 'Inafectas', 'Exportacion',
      nombreImpuesto, 'Total', 'MetodoPago'], data.map(v => [v.fecha, v.tipo_documento, v.serie,
      v.numero_documento, v.clientes?.nombre, v.clientes?.numero_documento, v.estado, v.moneda,
      Number(v.total_gravadas ?? v.subtotal ?? 0).toFixed(2), Number(v.total_exoneradas || 0).toFixed(2),
      Number(v.total_inafectas || 0).toFixed(2), Number(v.total_exportacion || 0).toFixed(2),
      Number(v.igv || 0).toFixed(2), Number(v.total || 0).toFixed(2), v.metodo_pago]))
  }

  return (
    <div className="space-y-4" data-testid="sales-summary-report">
      {error && <div role="alert" className="rounded-lg border border-destructive p-4">
        <p className="font-semibold">No se pudo cargar el reporte de ventas</p>
        <p className="text-sm">{error}</p>
        <Button variant="outline" className="mt-2" onClick={() => { void loadData() }}>Reintentar</Button>
      </div>}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle>Total Ventas</CardTitle><CardDescription>Suma de ventas por moneda en el rango seleccionado</CardDescription></CardHeader>
          <CardContent className="text-2xl font-bold text-emerald-400" data-testid="sales-total">{moneyTotals('total')}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Base gravada</CardTitle><CardDescription>Base imponible (sin {nombreImpuesto})</CardDescription></CardHeader>
          <CardContent className="text-2xl font-semibold text-foreground" data-testid="sales-taxable-base">{moneyTotals('subtotal')}</CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <div className="min-w-0"><CardTitle>{nombreImpuesto}</CardTitle><CardDescription>Impuesto calculado por moneda</CardDescription></div>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={loading || !!error || !data.length} className="shrink-0">
              <Download size={16} className="mr-2" /> Exportar CSV
            </Button>
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-amber-400" data-testid="sales-tax">{moneyTotals('igv')}</CardContent>
        </Card>
      </div>
      <div className="overflow-auto rounded-lg border border-border/70 bg-card text-card-foreground shadow-sm">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-muted/60"><tr>
            {['Fecha', 'Documento', 'Cliente', 'Base gravada', 'No gravadas', nombreImpuesto, 'Total', 'Estado'].map((label, i) =>
              <th key={i} className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">{label}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-border bg-card">
            {loading && <tr><td colSpan={8} className="px-4 py-6 text-center text-sm text-muted-foreground">Cargando ventas...</td></tr>}
            {!loading && !error && data.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-sm text-muted-foreground">No hay ventas en el rango seleccionado</td></tr>}
            {!loading && !error && data.map(venta => <tr key={venta.id}>
              <td className="px-4 py-2 text-sm text-foreground">{venta.fecha ? format(parseDateLocal(venta.fecha), 'dd MMM yyyy', { locale: es }) : '-'}</td>
              <td className="px-4 py-2 text-sm text-foreground"><div className="font-medium">{venta.tipo_documento || '-'}</div><div className="text-xs text-muted-foreground">{venta.serie ? venta.serie + '-' : ''}{venta.numero_documento || ''}</div></td>
              <td className="px-4 py-2 text-sm text-foreground"><div className="font-medium">{venta.clientes?.nombre || 'Sin cliente'}</div><div className="text-xs text-muted-foreground">{venta.clientes?.numero_documento || ''}</div></td>
              <td className="px-4 py-2 text-right text-sm text-foreground">{reportMoney(Number(venta.total_gravadas ?? venta.subtotal ?? 0), venta.moneda)}</td>
              <td className="px-4 py-2 text-right text-sm text-foreground">{reportMoney(Number(venta.total_exoneradas || 0) + Number(venta.total_inafectas || 0) + Number(venta.total_exportacion || 0), venta.moneda)}</td>
              <td className="px-4 py-2 text-right text-sm text-foreground">{reportMoney(Number(venta.igv || 0), venta.moneda)}</td>
              <td className="px-4 py-2 text-right font-semibold text-emerald-400">{reportMoney(Number(venta.total || 0), venta.moneda)}</td>
              <td className="px-4 py-2 text-sm text-foreground">{venta.estado || '-'}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </div>
  )
}
