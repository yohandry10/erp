'use client'

import { useState, useCallback, useEffect } from 'react'
import { AlertCircle, Building2, Download, FileText, Landmark, Scale } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ActivosVsPasivosChart } from './ActivosVsPasivosChart'
import { exportToExcel, formatCurrencyForExcel } from '@/lib/excel-export'
import { exportBalanceGeneralToPDF } from '@/lib/pdf-export'

interface BalanceGeneralData {
  activos: {
    corrientes: {
      efectivo: number
      cuentas_por_cobrar: number
      inventarios: number
      otros_activos: number
      total_corrientes: number
    }
    no_corrientes: {
      activos_fijos: number
      depreciacion_acumulada: number
      activos_fijos_neto: number
      otros_activos: number
      total_no_corrientes: number
    }
    total_activos: number
  }
  pasivos: {
    corrientes: {
      cuentas_por_pagar: number
      tributos_por_pagar: number
      remuneraciones_por_pagar: number
      otros_pasivos: number
      total_corrientes: number
    }
    no_corrientes: {
      deudas_largo_plazo: number
      otros_pasivos: number
      total_no_corrientes: number
    }
    total_pasivos: number
  }
  patrimonio: {
    capital: number
    resultados_acumulados: number
    resultado_ejercicio: number
    total_patrimonio: number
  }
}

interface BalanceGeneralProps {
  anio: number
  mes: number
  showComparison?: boolean
}

type LineItem = {
  label: string
  value: number
  previous?: number
  subdued?: boolean
}

export function BalanceGeneral({ anio, mes, showComparison = false }: BalanceGeneralProps) {
  const { get } = useApi()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<BalanceGeneralData | null>(null)
  const [previousData, setPreviousData] = useState<BalanceGeneralData | null>(null)

  const getPreviousPeriod = useCallback(() => {
    if (mes === 1) return { anio: anio - 1, mes: 12 }
    return { anio, mes: mes - 1 }
  }, [anio, mes])

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await get(`/api/contabilidad/estados/balance-general?anio=${anio}&mes=${mes}`)

      if (response?.success && response.data) {
        setData(response.data)
      } else {
        setError('No se pudieron cargar los datos')
      }

      if (showComparison) {
        const { anio: prevAnio, mes: prevMes } = getPreviousPeriod()
        const prevResponse = await get(`/api/contabilidad/estados/balance-general?anio=${prevAnio}&mes=${prevMes}`)
        setPreviousData(prevResponse?.success && prevResponse.data ? prevResponse.data : null)
      } else {
        setPreviousData(null)
      }
    } catch (err: any) {
      console.error('Error loading balance general:', err)
      setError(err.message || 'Error al cargar el balance general')
    } finally {
      setLoading(false)
    }
  }, [anio, get, getPreviousPeriod, mes, showComparison])

  useEffect(() => {
    loadData()
  }, [loadData])

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN',
      minimumFractionDigits: 2,
    }).format(amount)
  }

  const calculateVariation = (current: number, previous: number) => {
    if (previous === 0) return { absolute: current, percentage: current > 0 ? 100 : 0 }
    const absolute = current - previous
    return { absolute, percentage: (absolute / Math.abs(previous)) * 100 }
  }

  const renderVariation = (current: number, previous?: number) => {
    if (!showComparison || previous === undefined) return null
    const { absolute, percentage } = calculateVariation(current, previous)

    return (
      <span className="ml-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-0.5 text-xs font-semibold text-cyan-100">
        {absolute >= 0 ? '+' : '-'}{Math.abs(percentage).toFixed(1)}%
      </span>
    )
  }

  const handleExportExcel = () => {
    if (!data) {
      alert('No hay datos para exportar')
      return
    }

    const exportData = [
      { Concepto: 'ACTIVOS', Monto: '' },
      { Concepto: '', Monto: '' },
      { Concepto: 'Activos Corrientes', Monto: '' },
      { Concepto: '  Efectivo y Equivalentes', Monto: formatCurrencyForExcel(data.activos.corrientes.efectivo) },
      { Concepto: '  Cuentas por Cobrar', Monto: formatCurrencyForExcel(data.activos.corrientes.cuentas_por_cobrar) },
      { Concepto: '  Inventarios', Monto: formatCurrencyForExcel(data.activos.corrientes.inventarios) },
      { Concepto: '  Otros Activos', Monto: formatCurrencyForExcel(data.activos.corrientes.otros_activos) },
      { Concepto: 'Total Activos Corrientes', Monto: formatCurrencyForExcel(data.activos.corrientes.total_corrientes) },
      { Concepto: '', Monto: '' },
      { Concepto: 'Activos No Corrientes', Monto: '' },
      { Concepto: '  Activos Fijos', Monto: formatCurrencyForExcel(data.activos.no_corrientes.activos_fijos) },
      { Concepto: '  (-) Depreciación Acumulada', Monto: `(${formatCurrencyForExcel(data.activos.no_corrientes.depreciacion_acumulada)})` },
      { Concepto: '  Otros Activos', Monto: formatCurrencyForExcel(data.activos.no_corrientes.otros_activos) },
      { Concepto: 'Total Activos No Corrientes', Monto: formatCurrencyForExcel(data.activos.no_corrientes.total_no_corrientes) },
      { Concepto: '', Monto: '' },
      { Concepto: 'TOTAL ACTIVOS', Monto: formatCurrencyForExcel(data.activos.total_activos) },
      { Concepto: '', Monto: '' },
      { Concepto: '', Monto: '' },
      { Concepto: 'PASIVOS', Monto: '' },
      { Concepto: '', Monto: '' },
      { Concepto: 'Pasivos Corrientes', Monto: '' },
      { Concepto: '  Cuentas por Pagar', Monto: formatCurrencyForExcel(data.pasivos.corrientes.cuentas_por_pagar) },
      { Concepto: '  Tributos por Pagar', Monto: formatCurrencyForExcel(data.pasivos.corrientes.tributos_por_pagar) },
      { Concepto: '  Remuneraciones por Pagar', Monto: formatCurrencyForExcel(data.pasivos.corrientes.remuneraciones_por_pagar) },
      { Concepto: '  Otros Pasivos', Monto: formatCurrencyForExcel(data.pasivos.corrientes.otros_pasivos) },
      { Concepto: 'Total Pasivos Corrientes', Monto: formatCurrencyForExcel(data.pasivos.corrientes.total_corrientes) },
      { Concepto: '', Monto: '' },
      { Concepto: 'Pasivos No Corrientes', Monto: '' },
      { Concepto: '  Deudas a Largo Plazo', Monto: formatCurrencyForExcel(data.pasivos.no_corrientes.deudas_largo_plazo) },
      { Concepto: '  Otros Pasivos', Monto: formatCurrencyForExcel(data.pasivos.no_corrientes.otros_pasivos) },
      { Concepto: 'Total Pasivos No Corrientes', Monto: formatCurrencyForExcel(data.pasivos.no_corrientes.total_no_corrientes) },
      { Concepto: '', Monto: '' },
      { Concepto: 'TOTAL PASIVOS', Monto: formatCurrencyForExcel(data.pasivos.total_pasivos) },
      { Concepto: '', Monto: '' },
      { Concepto: '', Monto: '' },
      { Concepto: 'PATRIMONIO', Monto: '' },
      { Concepto: '', Monto: '' },
      { Concepto: '  Capital', Monto: formatCurrencyForExcel(data.patrimonio.capital) },
      { Concepto: '  Resultados Acumulados', Monto: formatCurrencyForExcel(data.patrimonio.resultados_acumulados) },
      { Concepto: '  Resultado del Ejercicio', Monto: formatCurrencyForExcel(data.patrimonio.resultado_ejercicio) },
      { Concepto: 'TOTAL PATRIMONIO', Monto: formatCurrencyForExcel(data.patrimonio.total_patrimonio) },
      { Concepto: '', Monto: '' },
      { Concepto: 'TOTAL PASIVOS + PATRIMONIO', Monto: formatCurrencyForExcel(data.pasivos.total_pasivos + data.patrimonio.total_patrimonio) },
    ]

    exportToExcel(
      [
        {
          name: 'Balance General',
          data: exportData,
          columns: [
            { header: 'Concepto', key: 'Concepto', width: 40 },
            { header: 'Monto', key: 'Monto', width: 20 },
          ],
        },
      ],
      `Balance_General_${anio}_${String(mes).padStart(2, '0')}.xlsx`,
    )
  }

  const handleExportPDF = () => {
    if (!data) {
      alert('No hay datos para exportar')
      return
    }

    exportBalanceGeneralToPDF(data, anio, mes)
  }

  const renderLine = (item: LineItem) => (
    <div key={item.label} className="flex items-center justify-between gap-4 border-b border-cyan-400/10 py-2 last:border-b-0">
      <span className={`text-sm ${item.subdued ? 'text-slate-400' : 'text-slate-300'}`}>{item.label}</span>
      <span className="text-right text-sm font-semibold text-white">
        {formatCurrency(item.value)}
        {renderVariation(item.value, item.previous)}
      </span>
    </div>
  )

  const renderSection = (
    title: string,
    icon: React.ReactNode,
    groups: Array<{ title: string; items: LineItem[]; totalLabel: string; total: number; previousTotal?: number }>,
    grandTotalLabel: string,
    grandTotal: number,
  ) => (
    <Card className="border-cyan-400/20 bg-slate-950/65 text-slate-100 shadow-xl shadow-blue-950/20">
      <CardHeader className="border-b border-cyan-400/10 bg-white/[0.03]">
        <CardTitle className="flex items-center gap-3 text-lg text-white">
          <span className="rounded-lg border border-cyan-400/20 bg-cyan-400/10 p-2 text-cyan-100">{icon}</span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 p-5">
        {groups.map((group) => (
          <div key={group.title} className="rounded-xl border border-cyan-400/10 bg-white/[0.03] p-4">
            <div className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200/70">{group.title}</div>
            <div>{group.items.map(renderLine)}</div>
            <div className="mt-3 flex items-center justify-between rounded-lg bg-cyan-400/10 px-3 py-2 text-sm font-bold text-cyan-50">
              <span>{group.totalLabel}</span>
              <span>
                {formatCurrency(group.total)}
                {renderVariation(group.total, group.previousTotal)}
              </span>
            </div>
          </div>
        ))}
        <div className="flex items-center justify-between rounded-xl border border-cyan-300/30 bg-cyan-400/15 px-4 py-3 text-base font-bold text-white">
          <span>{grandTotalLabel}</span>
          <span>{formatCurrency(grandTotal)}</span>
        </div>
      </CardContent>
    </Card>
  )

  if (loading) {
    return (
      <Card className="border-cyan-400/20 bg-slate-950/65 text-slate-100">
        <CardContent className="flex min-h-[260px] flex-col items-center justify-center gap-4 p-8">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-cyan-400/20 border-t-cyan-300" />
          <p className="text-sm font-medium text-slate-300">Cargando Balance General...</p>
        </CardContent>
      </Card>
    )
  }

  if (!data) {
    return (
      <Card className="border-cyan-400/20 bg-slate-950/65 text-slate-100">
        <CardContent className="flex min-h-[220px] items-center justify-center p-8 text-center text-slate-300">
          No hay datos disponibles para el período seleccionado
        </CardContent>
      </Card>
    )
  }

  const isBalanced = Math.abs(data.activos.total_activos - (data.pasivos.total_pasivos + data.patrimonio.total_patrimonio)) < 0.01
  const { anio: prevAnio, mes: prevMes } = getPreviousPeriod()
  const activosCorrientes = data.activos.corrientes
  const activosNoCorrientes = data.activos.no_corrientes
  const pasivosCorrientes = data.pasivos.corrientes
  const pasivosNoCorrientes = data.pasivos.no_corrientes

  return (
    <div className="space-y-6">
      <Card className="border-cyan-400/20 bg-slate-950/70 text-slate-100 shadow-xl shadow-blue-950/20">
        <CardHeader className="border-b border-cyan-400/10">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle className="text-2xl text-white">Balance General</CardTitle>
              <p className="mt-2 text-sm text-slate-300">
                Período: {anio} - {String(mes).padStart(2, '0')}
                {showComparison && ` vs ${prevAnio} - ${String(prevMes).padStart(2, '0')}`}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button onClick={handleExportExcel} className="gap-2 bg-blue-600 text-white hover:bg-blue-500">
                <Download className="h-4 w-4" />
                Exportar Excel
              </Button>
              <Button onClick={handleExportPDF} variant="outline" className="gap-2 border-cyan-400/20 bg-white/5 text-cyan-50 hover:bg-white/10 hover:text-white">
                <FileText className="h-4 w-4" />
                Exportar PDF
              </Button>
            </div>
          </div>
        </CardHeader>
        {(error || !isBalanced) && (
          <CardContent className="p-5">
            <div className="flex items-start gap-3 rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-4 text-sm text-cyan-50">
              <AlertCircle className="mt-0.5 h-5 w-5 text-cyan-200" />
              <p className="m-0">
                {error || 'El balance no está cuadrado. Activos no coincide con Pasivos + Patrimonio.'}
              </p>
            </div>
          </CardContent>
        )}
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        {renderSection(
          'Activos',
          <Building2 className="h-5 w-5" />,
          [
            {
              title: 'Activos corrientes',
              items: [
                { label: 'Efectivo y equivalentes', value: activosCorrientes.efectivo, previous: previousData?.activos.corrientes.efectivo },
                { label: 'Cuentas por cobrar', value: activosCorrientes.cuentas_por_cobrar, previous: previousData?.activos.corrientes.cuentas_por_cobrar },
                { label: 'Inventarios', value: activosCorrientes.inventarios, previous: previousData?.activos.corrientes.inventarios },
                { label: 'Otros activos', value: activosCorrientes.otros_activos, previous: previousData?.activos.corrientes.otros_activos },
              ],
              totalLabel: 'Total corrientes',
              total: activosCorrientes.total_corrientes,
              previousTotal: previousData?.activos.corrientes.total_corrientes,
            },
            {
              title: 'Activos no corrientes',
              items: [
                { label: 'Activos fijos', value: activosNoCorrientes.activos_fijos },
                { label: 'Depreciación acumulada', value: -Math.abs(activosNoCorrientes.depreciacion_acumulada), subdued: true },
                { label: 'Otros activos', value: activosNoCorrientes.otros_activos },
              ],
              totalLabel: 'Total no corrientes',
              total: activosNoCorrientes.total_no_corrientes,
            },
          ],
          'Total activos',
          data.activos.total_activos,
        )}

        {renderSection(
          'Pasivos y patrimonio',
          <Landmark className="h-5 w-5" />,
          [
            {
              title: 'Pasivos corrientes',
              items: [
                { label: 'Cuentas por pagar', value: pasivosCorrientes.cuentas_por_pagar },
                { label: 'Tributos por pagar', value: pasivosCorrientes.tributos_por_pagar },
                { label: 'Remuneraciones por pagar', value: pasivosCorrientes.remuneraciones_por_pagar },
                { label: 'Otros pasivos', value: pasivosCorrientes.otros_pasivos },
              ],
              totalLabel: 'Total corrientes',
              total: pasivosCorrientes.total_corrientes,
            },
            {
              title: 'Pasivos no corrientes',
              items: [
                { label: 'Deudas a largo plazo', value: pasivosNoCorrientes.deudas_largo_plazo },
                { label: 'Otros pasivos', value: pasivosNoCorrientes.otros_pasivos },
              ],
              totalLabel: 'Total no corrientes',
              total: pasivosNoCorrientes.total_no_corrientes,
            },
            {
              title: 'Patrimonio',
              items: [
                { label: 'Capital', value: data.patrimonio.capital },
                { label: 'Resultados acumulados', value: data.patrimonio.resultados_acumulados },
                { label: 'Resultado del ejercicio', value: data.patrimonio.resultado_ejercicio },
              ],
              totalLabel: 'Total patrimonio',
              total: data.patrimonio.total_patrimonio,
            },
          ],
          'Total pasivos + patrimonio',
          data.pasivos.total_pasivos + data.patrimonio.total_patrimonio,
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          ['Total activos', data.activos.total_activos],
          ['Total pasivos', data.pasivos.total_pasivos],
          ['Total patrimonio', data.patrimonio.total_patrimonio],
          ['Estado', isBalanced ? 'Cuadrado' : 'Descuadrado'],
        ].map(([label, value]) => (
          <Card key={label} className="border-cyan-400/20 bg-slate-950/65 text-slate-100">
            <CardContent className="p-4 text-center">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200/70">{label}</div>
              <div className="mt-2 text-xl font-bold text-white">{typeof value === 'number' ? formatCurrency(value) : value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-cyan-400/20 bg-slate-950/65 text-slate-100">
        <CardHeader>
          <CardTitle className="flex items-center justify-center gap-2 text-base text-white">
            <Scale className="h-5 w-5 text-cyan-200" />
            Distribución: Activos, Pasivos y Patrimonio
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ActivosVsPasivosChart
            activos={data.activos.total_activos}
            pasivos={data.pasivos.total_pasivos}
            patrimonio={data.patrimonio.total_patrimonio}
          />
        </CardContent>
      </Card>
    </div>
  )
}
