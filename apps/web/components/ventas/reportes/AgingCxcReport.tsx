'use client'

import { useEffect, useMemo, useState } from 'react'
import { useApi } from '@/hooks/use-api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from '@/components/ui/use-toast'
import { AlertTriangle, Loader2, PiggyBank, TrendingDown } from 'lucide-react'

interface BucketItem {
  nombre: string
  rango: string
  monto: number
  porcentaje: number
}

interface ClienteSaldo {
  cliente: string
  monto: number
  porcentaje: number
}

interface CuentaCritica {
  id: string
  cliente: string
  documento: string
  cliente_documento: string | null
  monto: number
  diasMora: number
  estado: string
}

interface AgingResponse {
  resumen: {
    totalPendiente: number
    totalVencido: number
    porcentajeVencido: number
    cuentasAnalizadas: number
  }
  buckets: BucketItem[]
  cuentasCriticas: CuentaCritica[]
  saldoPorCliente: ClienteSaldo[]
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

const currencyFormatter = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
  maximumFractionDigits: 2
})

export default function AgingCxcReport({ filters }: Props) {
  const { get } = useApi()
  const [data, setData] = useState<AgingResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters])

  const loadData = async () => {
    try {
      setLoading(true)
      const response = await get('/ventas/reportes/cxc-aging', {
        params: filters
      })

      if (response?.success) {
        setData(response.data)
      } else {
        throw new Error('Respuesta inválida del servidor')
      }
    } catch (error) {
      console.error('Error cargando aging CxC:', error)
      toast({
        title: 'Error al cargar CxC',
        description: 'No fue posible obtener la cartera de cuentas por cobrar.',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const bucketTotales = useMemo(() => data?.buckets ?? [], [data])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Aging de cuentas por cobrar</CardTitle>
          <CardDescription>Calculando exposición por rangos de vencimiento…</CardDescription>
        </CardHeader>
        <CardContent className="py-12 flex flex-col items-center justify-center gap-2 text-foreground/80">
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
          <CardDescription>No se encontraron registros de cuentas por cobrar</CardDescription>
        </CardHeader>
        <CardContent className="py-12 text-center text-muted-foreground">
          Ajusta los filtros o verifica que existan facturas pendientes en el periodo.
        </CardContent>
      </Card>
    )
  }

  const { resumen } = data

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card text-white">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <PiggyBank className="h-5 w-5" />
              Saldo pendiente total
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Cartera total de cuentas por cobrar analizada
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-semibold">{currencyFormatter.format(resumen.totalPendiente)}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {resumen.cuentasAnalizadas} cuentas activas
            </p>
          </CardContent>
        </Card>

        <Card className="bg-rose-600 text-white">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Monto vencido
            </CardTitle>
            <CardDescription className="text-destructive dark:text-rose-200">
              Suma de cuentas que excedieron la fecha de vencimiento
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-semibold">{currencyFormatter.format(resumen.totalVencido)}</p>
            <p className="text-sm text-destructive dark:text-rose-200 mt-1">
              {resumen.porcentajeVencido.toFixed(1)}% de la cartera total
            </p>
          </CardContent>
        </Card>

        <Card className="bg-amber-500 text-white">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <TrendingDown className="h-5 w-5" />
              Riesgo concentrado
            </CardTitle>
            <CardDescription className="text-amber-400 dark:text-amber-200">
              Principales buckets con exposición relevante
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {bucketTotales
                .filter((bucket) => bucket.monto > 0)
                .slice(0, 3)
                .map((bucket) => (
                  <li key={bucket.nombre} className="flex justify-between items-center">
                    <span>{bucket.nombre}</span>
                    <span className="font-semibold">
                      {bucket.porcentaje.toFixed(1)}%
                    </span>
                  </li>
                ))}
              {bucketTotales.filter((bucket) => bucket.monto > 0).length === 0 && (
                <li className="text-foreground/80">Sin montos significativos</li>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Distribución por buckets</CardTitle>
          <CardDescription>Saldo pendiente agrupado por días de mora</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-muted/30">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-foreground/80">Bucket</th>
                <th className="px-3 py-2 text-left font-medium text-foreground/80">Rango</th>
                <th className="px-3 py-2 text-right font-medium text-foreground/80">Monto</th>
                <th className="px-3 py-2 text-right font-medium text-foreground/80">% del total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bucketTotales.map((bucket) => (
                <tr key={bucket.nombre} className="bg-card">
                  <td className="px-3 py-2 text-foreground/85 font-medium">{bucket.nombre}</td>
                  <td className="px-3 py-2 text-muted-foreground">{bucket.rango}</td>
                  <td className="px-3 py-2 text-right text-foreground/80 font-semibold">
                    {currencyFormatter.format(bucket.monto)}
                  </td>
                  <td className="px-3 py-2 text-right text-foreground/80 font-semibold">
                    {bucket.porcentaje.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Clientes con mayor exposición</CardTitle>
            <CardDescription>Ranking de clientes según saldo pendiente</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-muted/30">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-foreground/80">Cliente</th>
                  <th className="px-3 py-2 text-right font-medium text-foreground/80">Saldo</th>
                  <th className="px-3 py-2 text-right font-medium text-foreground/80">% cartera</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.saldoPorCliente.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-4 text-center text-muted-foreground">
                      Sin saldos pendientes en el periodo.
                    </td>
                  </tr>
                ) : (
                  data.saldoPorCliente.slice(0, 10).map((cliente) => (
                    <tr key={cliente.cliente} className="bg-card">
                      <td className="px-3 py-2 text-foreground/80">{cliente.cliente}</td>
                      <td className="px-3 py-2 text-right text-foreground/80 font-semibold">
                        {currencyFormatter.format(cliente.monto)}
                      </td>
                      <td className="px-3 py-2 text-right text-foreground/80 font-semibold">
                        {cliente.porcentaje.toFixed(1)}%
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cuentas críticas</CardTitle>
            <CardDescription>Documentos con mayor monto y días de mora</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-muted/30">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-foreground/80">Documento</th>
                  <th className="px-3 py-2 text-left font-medium text-foreground/80">Cliente</th>
                  <th className="px-3 py-2 text-right font-medium text-foreground/80">Monto</th>
                  <th className="px-3 py-2 text-right font-medium text-foreground/80">Días mora</th>
                  <th className="px-3 py-2 text-left font-medium text-foreground/80">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.cuentasCriticas.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">
                      No se detectaron cuentas vencidas en el periodo.
                    </td>
                  </tr>
                ) : (
                  data.cuentasCriticas.map((cuenta) => (
                    <tr key={cuenta.id} className="bg-card">
                      <td className="px-3 py-2 text-foreground/85 font-medium">{cuenta.documento}</td>
                      <td className="px-3 py-2 text-foreground/80">
                        <div>{cuenta.cliente}</div>
                        <div className="text-xs text-muted-foreground">{cuenta.cliente_documento ?? '—'}</div>
                      </td>
                      <td className="px-3 py-2 text-right text-foreground/80 font-semibold">
                        {currencyFormatter.format(cuenta.monto)}
                      </td>
                      <td className="px-3 py-2 text-right text-destructive font-semibold">
                        {cuenta.diasMora}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{cuenta.estado}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
