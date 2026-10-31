'use client'

import { useAccountingStatement } from '@/hooks/use-accounting-statement'
import { readStatementRatios } from '@/lib/contabilidad/statement-read-contract'
import FinanceReportStatus from '@/components/finanzas/FinanceReportStatus'

import { Activity } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

type RatiosFinancierosProps = {
  anio: number
  mes: number
}

export function RatiosFinancieros({ anio, mes }: RatiosFinancierosProps) {
  const { data, loading, error, reload } = useAccountingStatement('/api/contabilidad/ratios-financieros', anio, mes, readStatementRatios)
  if (loading || error || !data) return <FinanceReportStatus loading={loading} retry={reload} />

  const ratios = [
    { label: 'Liquidez corriente', value: data.liquidez, suffix: 'x', help: 'Activos corrientes / pasivos corrientes' },
    { label: 'Prueba ácida', value: data.pruebaAcida, suffix: 'x', help: 'Liquidez sin inventarios' },
    { label: 'Margen operativo aproximado', value: data.ebitdaMargin * 100, suffix: '%', help: 'No equivale a EBITDA auditado mientras no se separen depreciación y amortización' },
    { label: 'DSO', value: data.dso, suffix: ' días', help: 'Días estimados de cobranza' },
    { label: 'DPO', value: data.dpo, suffix: ' días', help: 'Días estimados de pago' },
    { label: 'DIO', value: data.dio, suffix: ' días', help: 'Días estimados de inventario' },
    { label: 'Rotación de inventario', value: data.rotacionInventario, suffix: 'x', help: 'Costo de ventas / inventario' },
  ]

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {ratios.map((ratio) => (
          <Card key={ratio.label} className="min-w-0 border-border bg-card">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{ratio.label}</p><Activity className="h-4 w-4 shrink-0 text-primary" /></div>
              <p className="mt-3 break-words text-2xl font-bold text-foreground">{ratio.value.toFixed(2)}{ratio.suffix}</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{ratio.help}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="rounded-lg border border-amber-400/25 bg-amber-400/5 px-4 py-3 text-xs leading-5 text-amber-700 dark:text-amber-200">
        Indicadores gerenciales del periodo seleccionado. Las razones basadas en saldos de cierre son estimaciones y no reemplazan el análisis sobre promedios ni la revisión profesional.
      </p>
    </div>
  )
}
