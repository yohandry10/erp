'use client'

import { useAccountingStatement, previousAccountingPeriod } from '@/hooks/use-accounting-statement'
import { readStatementBalance } from '@/lib/contabilidad/statement-read-contract'
import FinanceReportStatus from '@/components/finanzas/FinanceReportStatus'

import { AlertCircle, Download, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { exportToExcel, formatCurrencyForExcel } from '@/lib/excel-export'
import { exportBalanceComprobacionToPDF } from '@/lib/pdf-export'
import { useLocalizedMoney } from '@/hooks/use-localized-money'
import { useCountryContext } from '@/hooks/use-country-context'

interface BalanceComprobacionProps {
  anio: number
  mes: number
  showComparison?: boolean
}

export function BalanceComprobacion({ anio, mes, showComparison = false }: BalanceComprobacionProps) {
  const country = useCountryContext()
  const report = useAccountingStatement('/api/contabilidad/estados/balance-comprobacion', anio, mes, readStatementBalance, showComparison)
  const { loading, error, reload } = report
  const data = report.data ?? []
  const previousData = report.previousData ?? []
  const getPreviousPeriod = () => previousAccountingPeriod(anio, mes)
  const { formatCurrency } = useLocalizedMoney()

  const getPreviousItemValue = (cuenta: string): number => {
    const prevItem = previousData.find((item) => item.cuenta === cuenta)
    return prevItem ? prevItem.saldo_final : 0
  }

  const calculateVariation = (current: number, previous: number) => {
    if (previous === 0) return { absolute: current, percentage: current > 0 ? 100 : 0 }
    const absolute = current - previous
    return { absolute, percentage: (absolute / Math.abs(previous)) * 100 }
  }

  const renderVariation = (current: number, previous: number) => {
    const { absolute, percentage } = calculateVariation(current, previous)
    return (
      <span className="ml-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-0.5 text-xs font-semibold text-primary">
        {absolute >= 0 ? '+' : '-'}{Math.abs(percentage).toFixed(1)}%
      </span>
    )
  }

  const totales = data.reduce((acc, item) => ({
    saldo_inicial: acc.saldo_inicial + item.saldo_inicial,
    debe: acc.debe + item.debe,
    haber: acc.haber + item.haber,
    saldo_final: acc.saldo_final + item.saldo_final,
  }), { saldo_inicial: 0, debe: 0, haber: 0, saldo_final: 0 })

  const isBalanced = Math.abs(totales.debe - totales.haber) < 0.01
  const { anio: prevAnio, mes: prevMes } = getPreviousPeriod()

  const handleExportExcel = () => {
    if (data.length === 0) {
      alert('No hay datos para exportar')
      return
    }

    const exportData = data.map((item) => ({
      Cuenta: item.cuenta,
      Nombre: item.nombre,
      'Saldo Inicial': formatCurrencyForExcel(item.saldo_inicial),
      Debe: formatCurrencyForExcel(item.debe),
      Haber: formatCurrencyForExcel(item.haber),
      'Saldo Final': formatCurrencyForExcel(item.saldo_final),
    }))

    exportData.push({
      Cuenta: '',
      Nombre: 'TOTALES',
      'Saldo Inicial': formatCurrencyForExcel(totales.saldo_inicial),
      Debe: formatCurrencyForExcel(totales.debe),
      Haber: formatCurrencyForExcel(totales.haber),
      'Saldo Final': formatCurrencyForExcel(totales.saldo_final),
    })

    exportToExcel(
      [
        {
          name: 'Balance de Comprobación',
          data: exportData,
          columns: [
            { header: 'Cuenta', key: 'Cuenta', width: 12 },
            { header: 'Nombre', key: 'Nombre', width: 35 },
            { header: `Saldo Inicial (${country.moneda})`, key: 'Saldo Inicial', width: 22 },
            { header: `Debe (${country.moneda})`, key: 'Debe', width: 18 },
            { header: `Haber (${country.moneda})`, key: 'Haber', width: 18 },
            { header: `Saldo Final (${country.moneda})`, key: 'Saldo Final', width: 22 },
          ],
        },
      ],
      `Balance_Comprobacion_${anio}_${String(mes).padStart(2, '0')}.xlsx`,
    )
  }

  const handleExportPDF = () => {
    if (data.length === 0) {
      alert('No hay datos para exportar')
      return
    }
    exportBalanceComprobacionToPDF(data, anio, mes, totales, country.moneda, country.locale)
  }

  if (loading || error || !report.data) return <FinanceReportStatus loading={loading} retry={reload} />

  return (
    <Card className="border-cyan-400/20 bg-card/70 text-foreground shadow-xl shadow-blue-950/20">
      <CardHeader className="border-b border-cyan-400/10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="text-2xl text-foreground">Balance de Comprobación</CardTitle>
            <p className="mt-2 text-sm text-muted-foreground">
              Período: {anio} - {String(mes).padStart(2, '0')}
              {showComparison && ` vs ${prevAnio} - ${String(prevMes).padStart(2, '0')}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button onClick={handleExportExcel} className="gap-2 bg-blue-600 text-white hover:bg-blue-500">
              <Download className="h-4 w-4" />
              Exportar Excel
            </Button>
            <Button onClick={handleExportPDF} variant="outline" className="gap-2 border-cyan-400/20 bg-white/5 text-primary hover:bg-white/10 hover:text-white">
              <FileText className="h-4 w-4" />
              Exportar PDF
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-5">
        {(!isBalanced || error) && (
          <div className="flex items-start gap-3 rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-4 text-sm text-primary">
            <AlertCircle className="mt-0.5 h-5 w-5 text-primary" />
            <p className="m-0">
              {error || `El balance no está cuadrado. Diferencia: ${formatCurrency(Math.abs(totales.debe - totales.haber))}`}
            </p>
          </div>
        )}

        {data.length === 0 ? (
          <div className="rounded-xl border border-dashed border-cyan-400/20 bg-white/[0.03] p-10 text-center text-muted-foreground">
            No hay datos disponibles para el período seleccionado
          </div>
        ) : (
          <>
            <div className="overflow-auto rounded-xl border border-cyan-400/15">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-cyan-400/10 text-xs uppercase tracking-[0.16em] text-cyan-200/80">
                  <tr>
                    <th className="p-3 text-left font-semibold">Cuenta</th>
                    <th className="p-3 text-left font-semibold">Nombre</th>
                    <th className="p-3 text-right font-semibold">Saldo Inicial</th>
                    <th className="p-3 text-right font-semibold">Debe</th>
                    <th className="p-3 text-right font-semibold">Haber</th>
                    <th className="p-3 text-right font-semibold">Saldo Final</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cyan-400/10">
                  {data.map((item, index) => (
                    <tr key={`${item.cuenta}-${index}`} className="transition hover:bg-white/[0.04]">
                      <td className="p-3 font-semibold text-foreground">{item.cuenta}</td>
                      <td className="p-3 text-muted-foreground">{item.nombre}</td>
                      <td className="p-3 text-right text-muted-foreground">{formatCurrency(item.saldo_inicial)}</td>
                      <td className="p-3 text-right font-semibold text-primary">{formatCurrency(item.debe)}</td>
                      <td className="p-3 text-right font-semibold text-primary">{formatCurrency(item.haber)}</td>
                      <td className="p-3 text-right font-semibold text-foreground">
                        {formatCurrency(item.saldo_final)}
                        {showComparison && previousData.length > 0 && renderVariation(item.saldo_final, getPreviousItemValue(item.cuenta))}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-cyan-300/30 bg-cyan-400/10 font-bold text-foreground">
                  <tr>
                    <td colSpan={2} className="p-4">TOTALES</td>
                    <td className="p-4 text-right">{formatCurrency(totales.saldo_inicial)}</td>
                    <td className="p-4 text-right">{formatCurrency(totales.debe)}</td>
                    <td className="p-4 text-right">{formatCurrency(totales.haber)}</td>
                    <td className="p-4 text-right">{formatCurrency(totales.saldo_final)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="flex flex-col justify-between gap-3 rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-4 sm:flex-row sm:items-center">
              <p className="m-0 text-sm text-foreground/90">
                Total de cuentas: <strong className="text-foreground">{data.length}</strong>
              </p>
              <p className="m-0 text-sm font-semibold text-primary">
                {isBalanced ? 'Balance cuadrado' : 'Balance descuadrado'}
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
