'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, ArrowDownRight, ArrowUpRight, Landmark, Loader2 } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { useLocalizedMoney } from '@/hooks/use-localized-money'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type FlujoEfectivoData = {
  operativo: number
  inversion: number
  financiamiento: number
  neto: number
  detalle: {
    utilidadNeta: number
    variacionCxc: number
    variacionInventario: number
    variacionCxp: number
    variacionInversiones: number
    variacionFinanciamiento: number
  }
}

type FlujoEfectivoProps = {
  anio: number
  mes: number
}

export function FlujoEfectivo({ anio, mes }: FlujoEfectivoProps) {
  const { get } = useApi()
  const { formatCurrency } = useLocalizedMoney()
  const [data, setData] = useState<FlujoEfectivoData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await get(`/api/contabilidad/estados/flujo-efectivo?anio=${anio}&mes=${mes}`)
      if (!response?.success || !response.data) throw new Error(response?.message || 'No se pudo calcular el flujo de efectivo')
      setData(response.data)
    } catch (err: any) {
      setData(null)
      setError(err?.message || 'Error al cargar el flujo de efectivo')
    } finally {
      setLoading(false)
    }
  }, [anio, get, mes])

  useEffect(() => {
    loadData()
  }, [loadData])

  if (loading) {
    return <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
  }

  if (error || !data) {
    return (
      <Card className="border-destructive/30 bg-destructive/5">
        <CardContent className="flex gap-3 p-6 text-sm text-destructive">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <div><p className="font-semibold">No se pudo presentar el flujo de efectivo</p><p className="mt-1 opacity-80">{error}</p></div>
        </CardContent>
      </Card>
    )
  }

  const sections = [
    { label: 'Actividades operativas', value: data.operativo },
    { label: 'Actividades de inversión', value: data.inversion },
    { label: 'Actividades de financiamiento', value: data.financiamiento },
  ]
  const details = [
    ['Utilidad neta', data.detalle.utilidadNeta],
    ['Variación de cuentas por cobrar', data.detalle.variacionCxc],
    ['Variación de inventarios', data.detalle.variacionInventario],
    ['Variación de cuentas por pagar', data.detalle.variacionCxp],
    ['Variación de inversiones', data.detalle.variacionInversiones],
    ['Variación de financiamiento', data.detalle.variacionFinanciamiento],
  ] as const

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {sections.map((section) => (
          <Card key={section.label} className="min-w-0 border-border bg-card">
            <CardContent className="p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{section.label}</p>
              <p className={`mt-3 break-words text-2xl font-bold ${section.value < 0 ? 'text-rose-500' : 'text-emerald-500'}`}>{formatCurrency(section.value)}</p>
            </CardContent>
          </Card>
        ))}
        <Card className="min-w-0 border-cyan-400/30 bg-cyan-400/5">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Variación neta</p>
            <p className={`mt-3 break-words text-2xl font-bold ${data.neto < 0 ? 'text-rose-500' : 'text-primary'}`}>{formatCurrency(data.neto)}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border bg-card">
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Landmark className="h-5 w-5 text-primary" />Conciliación del método indirecto</CardTitle></CardHeader>
        <CardContent className="divide-y divide-border p-0">
          {details.map(([label, value]) => (
            <div key={label} className="grid min-w-0 gap-2 px-5 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(120px,auto)] sm:items-center">
              <span className="text-sm text-muted-foreground">{label}</span>
              <span className={`flex min-w-0 items-center gap-1 break-words font-semibold sm:justify-end ${value < 0 ? 'text-rose-500' : 'text-foreground'}`}>
                {value < 0 ? <ArrowDownRight className="h-4 w-4 shrink-0" /> : <ArrowUpRight className="h-4 w-4 shrink-0 text-emerald-500" />}
                {formatCurrency(value)}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <p className="rounded-lg border border-amber-400/25 bg-amber-400/5 px-4 py-3 text-xs leading-5 text-amber-700 dark:text-amber-200">
        Flujo indirecto operativo: usa utilidad neta y variaciones mensuales de capital de trabajo. Debe conciliarse con bancos antes de emitir un estado financiero firmado.
      </p>
    </div>
  )
}
