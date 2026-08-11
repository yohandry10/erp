'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApi } from '@/hooks/use-api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/use-toast'
import { AlertTriangle, Download, Loader2, PiggyBank, TrendingDown } from 'lucide-react'
import { useCountryContext } from '@/hooks/use-country-context'
import { downloadCsv } from '@/lib/csv-export'

type CurrencyTotals = Record<string, number>

interface BucketItem {
  id: string
  nombre: string
  rango: string
  cuentas: number
  montoBase: number
  sinValuacion: number
  porMoneda: CurrencyTotals
  porcentajeBase: number
}

interface ClienteSaldo {
  clienteId: string
  cliente: string
  clienteDocumento: string | null
  montoBase: number
  sinValuacion: number
  porMoneda: CurrencyTotals
}

interface CuentaAging {
  id: string
  cliente: string
  documento: string
  clienteDocumento: string | null
  fechaEmision: string
  fechaVencimiento: string
  montoOrigen: number | null
  moneda: string | null
  montoBase: number | null
  monedaBase: string | null
  tipoCambio: number | null
  valuacionEstado: string
  diasMora: number
  estado: string
}

interface AgingResponse {
  fechaCorte: string
  monedaBase: string | null
  resumen: {
    totalPendienteBase: number
    totalVencidoBase: number
    porcentajeVencidoBase: number
    cuentasAnalizadas: number
    cuentasSinValuacion: number
    cuentasSinReconstruir: number
    totalPendientePorMoneda: CurrencyTotals
  }
  buckets: BucketItem[]
  cuentasCriticas: CuentaAging[]
  saldoPorCliente: ClienteSaldo[]
  detalle: CuentaAging[]
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

const CurrencyBreakdown = ({
  values,
  formatMoney,
}: {
  values: CurrencyTotals
  formatMoney: (value: number | null | undefined, currency: string | null) => string
}) => {
  const entries = Object.entries(values ?? {})
  if (entries.length === 0) return <span className="text-muted-foreground">—</span>
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {entries.map(([currency, value]) => (
        <span key={currency} className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
          {formatMoney(value, currency)}
        </span>
      ))}
    </div>
  )
}

export default function AgingCxcReport({ filters }: Props) {
  const { get } = useApi()
  const country = useCountryContext()
  const [data, setData] = useState<AgingResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const formatMoney = useCallback((value: number | null | undefined, currency: string | null) => {
    if (value === null || value === undefined) return 'Por valorizar'
    if (!currency) return `${Number(value).toFixed(2)} (sin moneda)`
    try {
      return new Intl.NumberFormat(country.locale || 'es-PE', {
        style: 'currency',
        currency,
        maximumFractionDigits: 2,
      }).format(value)
    } catch {
      return `${currency} ${Number(value).toFixed(2)}`
    }
  }, [country.locale])

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const response = await get('/ventas/reportes/cxc-aging', {
        params: {
          fechaCorte: filters.fechaHasta || undefined,
          cliente: filters.cliente || undefined,
        },
      })

      if (!response?.success || !Array.isArray(response.data?.detalle)) {
        throw new Error('Respuesta inválida del servidor')
      }
      setData(response.data)
    } catch (error) {
      console.error('Error cargando aging CxC:', error)
      setData(null)
      toast({
        title: 'Error al cargar CxC',
        description: 'No fue posible obtener la cartera al corte solicitado.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [filters.cliente, filters.fechaHasta, get])

  useEffect(() => {
    loadData()
  }, [loadData])

  const exportCsv = () => {
    if (!data) return
    downloadCsv(
      `cxc-aging-${data.fechaCorte}.csv`,
      [
        'Fecha de corte', 'Cliente', 'Documento cliente', 'Comprobante', 'Emisión',
        'Vencimiento', 'Días mora', 'Estado', 'Moneda origen', 'Saldo origen',
        'Tipo de cambio snapshot', 'Moneda base', 'Saldo base', 'Estado valuación',
      ],
      data.detalle.map((row) => [
        data.fechaCorte, row.cliente, row.clienteDocumento, row.documento,
        row.fechaEmision, row.fechaVencimiento, row.diasMora, row.estado,
        row.moneda, row.montoOrigen, row.tipoCambio, row.monedaBase,
        row.montoBase, row.valuacionEstado,
      ]),
    )
    toast({ title: 'Reporte exportado', description: 'Se descargó el aging CxC al corte en CSV.' })
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Aging de cuentas por cobrar</CardTitle>
          <CardDescription>Calculando la cartera al corte local de la empresa…</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-foreground/80">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span>Procesando saldos</span>
        </CardContent>
      </Card>
    )
  }

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Aging de cuentas por cobrar</CardTitle>
          <CardDescription>No se pudo obtener el snapshot de cartera.</CardDescription>
        </CardHeader>
        <CardContent className="py-12 text-center text-muted-foreground">
          Revisa el corte seleccionado o vuelve a intentar.
        </CardContent>
      </Card>
    )
  }

  const { resumen } = data
  const hasPendingValuation = resumen.cuentasSinValuacion > 0 || resumen.cuentasSinReconstruir > 0
  const baseLabel = data.monedaBase ?? 'sin configurar'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Cartera al {data.fechaCorte}</h2>
          <p className="text-sm text-muted-foreground">
            Corte según fecha local de la empresa. Incluye toda deuda emitida hasta esa fecha.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={exportCsv} disabled={data.detalle.length === 0}>
          <Download className="mr-2 h-4 w-4" /> Exportar CSV
        </Button>
      </div>

      {hasPendingValuation && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-950 dark:text-amber-100">
          <div className="flex items-start gap-2 font-semibold">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Totales base incompletos: {resumen.cuentasSinValuacion} cuenta(s) sin tipo de cambio y{' '}
            {resumen.cuentasSinReconstruir} sin reconstrucción histórica confiable.
          </div>
          <p className="mt-1">Los saldos de origen se muestran por moneda; no se suman importes nominales distintos.</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="space-y-1 pb-2">
            <CardTitle className="flex items-start gap-2 text-sm font-medium text-muted-foreground">
              <PiggyBank className="h-4 w-4 shrink-0" /> Saldo pendiente en {baseLabel}
            </CardTitle>
            <CardDescription>Sólo cuentas con conversión snapshot disponible</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-semibold">{data.monedaBase ? formatMoney(resumen.totalPendienteBase, data.monedaBase) : 'Sin moneda base'}</p>
            <p className="mt-1 text-sm text-muted-foreground">{resumen.cuentasAnalizadas} cuentas activas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-1 pb-2">
            <CardTitle className="flex items-start gap-2 text-sm font-medium text-muted-foreground">
              <AlertTriangle className="h-4 w-4 shrink-0" /> Vencido en {baseLabel}
            </CardTitle>
            <CardDescription>Documentos vencidos a la fecha de corte</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-semibold text-rose-500">{data.monedaBase ? formatMoney(resumen.totalVencidoBase, data.monedaBase) : 'Sin moneda base'}</p>
            <p className="mt-1 text-sm text-muted-foreground">{resumen.porcentajeVencidoBase.toFixed(1)}% del total base valuado</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-1 pb-2">
            <CardTitle className="flex items-start gap-2 text-sm font-medium text-muted-foreground">
              <TrendingDown className="h-4 w-4 shrink-0" /> Saldos por moneda origen
            </CardTitle>
            <CardDescription>Sin mezclar valores nominales</CardDescription>
          </CardHeader>
          <CardContent>
            <CurrencyBreakdown values={resumen.totalPendientePorMoneda} formatMoney={formatMoney} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Distribución por vencimiento</CardTitle>
          <CardDescription>Saldo de origen por moneda y equivalente confirmado en {baseLabel}</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/30">
              <tr>
                <th className="px-3 py-2 text-left">Bucket</th>
                <th className="px-3 py-2 text-left">Rango</th>
                <th className="px-3 py-2 text-right">Cuentas</th>
                <th className="px-3 py-2 text-right">Moneda origen</th>
                <th className="px-3 py-2 text-right">Base ({baseLabel})</th>
                <th className="px-3 py-2 text-right">% base</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.buckets.map((bucket) => (
                <tr key={bucket.id}>
                  <td className="px-3 py-2 font-medium">{bucket.nombre}</td>
                  <td className="px-3 py-2 text-muted-foreground">{bucket.rango}</td>
                  <td className="px-3 py-2 text-right">{bucket.cuentas}</td>
                  <td className="px-3 py-2 text-right"><CurrencyBreakdown values={bucket.porMoneda} formatMoney={formatMoney} /></td>
                  <td className="px-3 py-2 text-right font-semibold">
                    {formatMoney(bucket.montoBase, data.monedaBase)}
                    {bucket.sinValuacion > 0 && <span className="block text-xs text-amber-600">+ {bucket.sinValuacion} pendiente(s)</span>}
                  </td>
                  <td className="px-3 py-2 text-right">{bucket.porcentajeBase.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Clientes con mayor exposición</CardTitle>
            <CardDescription>Importes de origen separados y total base confirmado</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/30"><tr><th className="px-3 py-2 text-left">Cliente</th><th className="px-3 py-2 text-right">Origen</th><th className="px-3 py-2 text-right">Base</th></tr></thead>
              <tbody className="divide-y divide-border">
                {data.saldoPorCliente.length === 0 ? (
                  <tr><td colSpan={3} className="px-3 py-4 text-center text-muted-foreground">Sin saldos pendientes al corte.</td></tr>
                ) : data.saldoPorCliente.slice(0, 15).map((cliente) => (
                  <tr key={cliente.clienteId}>
                    <td className="px-3 py-2"><span className="font-medium">{cliente.cliente}</span><span className="block text-xs text-muted-foreground">{cliente.clienteDocumento || '—'}</span></td>
                    <td className="px-3 py-2 text-right"><CurrencyBreakdown values={cliente.porMoneda} formatMoney={formatMoney} /></td>
                    <td className="px-3 py-2 text-right font-semibold">{formatMoney(cliente.montoBase, data.monedaBase)}{cliente.sinValuacion > 0 && <span className="block text-xs text-amber-600">{cliente.sinValuacion} pendiente(s)</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cuentas críticas</CardTitle>
            <CardDescription>Documentos vencidos con importe y tipo de cambio snapshot</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/30"><tr><th className="px-3 py-2 text-left">Documento</th><th className="px-3 py-2 text-left">Cliente</th><th className="px-3 py-2 text-right">Saldo</th><th className="px-3 py-2 text-right">Mora</th></tr></thead>
              <tbody className="divide-y divide-border">
                {data.cuentasCriticas.length === 0 ? (
                  <tr><td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">No hay cuentas vencidas al corte.</td></tr>
                ) : data.cuentasCriticas.map((cuenta) => (
                  <tr key={cuenta.id}>
                    <td className="px-3 py-2 font-medium">{cuenta.documento}</td>
                    <td className="px-3 py-2">{cuenta.cliente}<span className="block text-xs text-muted-foreground">{cuenta.clienteDocumento || '—'}</span></td>
                    <td className="px-3 py-2 text-right font-semibold">{formatMoney(cuenta.montoOrigen, cuenta.moneda)}<span className="block text-xs text-muted-foreground">{cuenta.montoBase === null ? cuenta.valuacionEstado : `≈ ${formatMoney(cuenta.montoBase, data.monedaBase)} · TC ${cuenta.tipoCambio}`}</span></td>
                    <td className="px-3 py-2 text-right font-semibold text-destructive">{cuenta.diasMora}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
