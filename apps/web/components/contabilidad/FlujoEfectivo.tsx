'use client'

import { useAccountingStatement } from '@/hooks/use-accounting-statement'
import { readStatementCashflow } from '@/lib/contabilidad/statement-read-contract'
import FinanceReportStatus from '@/components/finanzas/FinanceReportStatus'

import { ArrowDownRight, ArrowUpRight, Landmark } from 'lucide-react'
import { useLocalizedMoney } from '@/hooks/use-localized-money'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type FlujoEfectivoProps = {
  anio: number
  mes: number
}

export function FlujoEfectivo({ anio, mes }: FlujoEfectivoProps) {
  const { data, loading, error, reload } = useAccountingStatement('/api/contabilidad/flujo-efectivo', anio, mes, readStatementCashflow)
  const { formatCurrency } = useLocalizedMoney()
  if (loading || error || !data) return <FinanceReportStatus loading={loading} retry={reload} />

  const sections = [
    { label: 'Actividades operativas', value: data.operativo },
    { label: 'Actividades de inversión', value: data.inversion },
    { label: 'Actividades de financiamiento', value: data.financiamiento },
  ]
  const details = [
    ['Utilidad neta del mes', data.detalle.utilidadNeta],
    // El método indirecto devuelve a la utilidad lo que no movió dinero. Sin
    // esta línea el estado no cuadra con la caja y no se ve por qué.
    ['Depreciación y amortización del mes', data.detalle.gastosNoDesembolsables],
    ['Variación de cuentas por cobrar', data.detalle.variacionCxc],
    ['Variación de inventarios', data.detalle.variacionInventario],
    ['Variación de cuentas por pagar', data.detalle.variacionCxp],
    ['Tributos, anticipos y otras partidas operativas (efecto en caja)', data.detalle.otrosOperativos],
    ['Variación de inversiones', data.detalle.variacionInversiones],
    ['Variación de financiamiento', data.detalle.variacionFinanciamiento],
    ['Variación real de caja y bancos', data.detalle.variacionCaja],
  ] as const

  // La prueba ácida del estado: lo que dice que se movió tiene que ser lo que de
  // verdad se movió en caja. Un descuadre no es un aviso genérico, es un importe
  // concreto que falta por clasificar, y callarlo deja firmar un estado que no
  // cierra.
  const descuadre = Number(data.detalle.descuadre ?? 0)
  const cuadra = Math.abs(descuadre) < 0.005

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

      {cuadra ? (
        <p className="rounded-lg border border-emerald-400/25 bg-emerald-400/5 px-4 py-3 text-xs leading-5 text-emerald-700 dark:text-emerald-200">
          El estado cuadra con la variación real de caja y bancos del período.
        </p>
      ) : (
        <p className="rounded-lg border border-rose-400/30 bg-rose-400/5 px-4 py-3 text-xs leading-5 text-rose-700 dark:text-rose-200">
          <strong>El estado no cuadra con la caja por {formatCurrency(descuadre)}.</strong>{' '}
          El flujo neto dice {formatCurrency(data.neto)} y caja y bancos se movieron{' '}
          {formatCurrency(data.detalle.variacionCaja)}. Falta clasificar esa diferencia
          antes de emitir un estado financiero firmado.
        </p>
      )}
    </div>
  )
}
