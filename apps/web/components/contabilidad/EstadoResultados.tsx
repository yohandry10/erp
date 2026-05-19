'use client'

import { useState, useCallback, useEffect } from 'react'
import { useApi } from '@/hooks/use-api'
import { Download, AlertCircle, TrendingUp, TrendingDown, FileText } from 'lucide-react'
import { IngresosVsGastosChart } from './IngresosVsGastosChart'
import { exportToExcel, formatCurrencyForExcel, formatPercentageForExcel } from '@/lib/excel-export'
import { exportEstadoResultadosToPDF } from '@/lib/pdf-export'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface EstadoResultadosData {
  ingresos: {
    ventas: number
    otros_ingresos: number
    total_ingresos: number
  }
  costos: {
    costo_ventas: number
    utilidad_bruta: number
  }
  gastos: {
    gastos_administrativos: number
    gastos_ventas: number
    gastos_financieros: number
    total_gastos: number
  }
  utilidad_neta: number
}

interface EstadoResultadosProps {
  anio: number
  mes: number
  showComparison?: boolean
}

export function EstadoResultados({ anio, mes, showComparison = false }: EstadoResultadosProps) {
  const { get } = useApi()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<EstadoResultadosData | null>(null)
  const [previousData, setPreviousData] = useState<EstadoResultadosData | null>(null)

  const getPreviousPeriod = useCallback(() => {
    if (mes === 1) {
      return { anio: anio - 1, mes: 12 }
    }
    return { anio, mes: mes - 1 }
  }, [anio, mes])

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await get(`/api/contabilidad/estados/estado-resultados?anio=${anio}&mes=${mes}`)
      
      if (response?.success && response.data) {
        setData(response.data)
      } else {
        setError('No se pudieron cargar los datos')
      }

      // Cargar datos del período anterior si showComparison está activado
      if (showComparison) {
        const { anio: prevAnio, mes: prevMes } = getPreviousPeriod()
        const prevResponse = await get(`/api/contabilidad/estados/estado-resultados?anio=${prevAnio}&mes=${prevMes}`)
        
        if (prevResponse?.success && prevResponse.data) {
          setPreviousData(prevResponse.data)
        } else {
          setPreviousData(null)
        }
      } else {
        setPreviousData(null)
      }
    } catch (err: any) {
      console.error('Error loading estado resultados:', err)
      setError(err.message || 'Error al cargar el estado de resultados')
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
      minimumFractionDigits: 2
    }).format(amount)
  }

  const formatPercentage = (value: number, total: number) => {
    if (total === 0) return '0.00%'
    return ((value / total) * 100).toFixed(2) + '%'
  }

  const calculateVariation = (current: number, previous: number) => {
    if (previous === 0) return { absolute: current, percentage: current > 0 ? 100 : 0 }
    const absolute = current - previous
    const percentage = ((absolute / Math.abs(previous)) * 100)
    return { absolute, percentage }
  }

  const renderVariation = (current: number, previous: number) => {
    const { absolute, percentage } = calculateVariation(current, previous)
    const isPositive = absolute >= 0
    
    return (
      <div className={cn('flex items-center gap-2 text-xs font-semibold', isPositive ? 'text-cyan-200' : 'text-blue-200')}>
        {isPositive ? '↑' : '↓'}
        {formatCurrency(Math.abs(absolute))} ({Math.abs(percentage).toFixed(1)}%)
      </div>
    )
  }

  const handleExportExcel = () => {
    if (!data) {
      alert('No hay datos para exportar')
      return
    }

    const margenBruto = data.ingresos.total_ingresos > 0 
      ? (data.costos.utilidad_bruta / data.ingresos.total_ingresos) * 100 
      : 0
    const margenNeto = data.ingresos.total_ingresos > 0 
      ? (data.utilidad_neta / data.ingresos.total_ingresos) * 100 
      : 0

    const exportData = [
      { Concepto: 'INGRESOS', Monto: '', Porcentaje: '' },
      { Concepto: 'Ventas', Monto: formatCurrencyForExcel(data.ingresos.ventas), Porcentaje: '' },
      { Concepto: 'Otros Ingresos', Monto: formatCurrencyForExcel(data.ingresos.otros_ingresos), Porcentaje: '' },
      { Concepto: 'Total Ingresos', Monto: formatCurrencyForExcel(data.ingresos.total_ingresos), Porcentaje: '100.00%' },
      { Concepto: '', Monto: '', Porcentaje: '' },
      { Concepto: 'COSTOS', Monto: '', Porcentaje: '' },
      { Concepto: 'Costo de Ventas', Monto: `(${formatCurrencyForExcel(data.costos.costo_ventas)})`, Porcentaje: formatPercentageForExcel((data.costos.costo_ventas / data.ingresos.total_ingresos) * 100) },
      { Concepto: 'Utilidad Bruta', Monto: formatCurrencyForExcel(data.costos.utilidad_bruta), Porcentaje: formatPercentageForExcel(margenBruto) },
      { Concepto: '', Monto: '', Porcentaje: '' },
      { Concepto: 'GASTOS OPERATIVOS', Monto: '', Porcentaje: '' },
      { Concepto: 'Gastos Administrativos', Monto: `(${formatCurrencyForExcel(data.gastos.gastos_administrativos)})`, Porcentaje: formatPercentageForExcel((data.gastos.gastos_administrativos / data.ingresos.total_ingresos) * 100) },
      { Concepto: 'Gastos de Ventas', Monto: `(${formatCurrencyForExcel(data.gastos.gastos_ventas)})`, Porcentaje: formatPercentageForExcel((data.gastos.gastos_ventas / data.ingresos.total_ingresos) * 100) },
      { Concepto: 'Gastos Financieros', Monto: `(${formatCurrencyForExcel(data.gastos.gastos_financieros)})`, Porcentaje: formatPercentageForExcel((data.gastos.gastos_financieros / data.ingresos.total_ingresos) * 100) },
      { Concepto: 'Total Gastos', Monto: `(${formatCurrencyForExcel(data.gastos.total_gastos)})`, Porcentaje: formatPercentageForExcel((data.gastos.total_gastos / data.ingresos.total_ingresos) * 100) },
      { Concepto: '', Monto: '', Porcentaje: '' },
      { Concepto: 'UTILIDAD NETA', Monto: formatCurrencyForExcel(data.utilidad_neta), Porcentaje: formatPercentageForExcel(margenNeto) }
    ]

    exportToExcel(
      [
        {
          name: 'Estado de Resultados',
          data: exportData,
          columns: [
            { header: 'Concepto', key: 'Concepto', width: 35 },
            { header: 'Monto', key: 'Monto', width: 20 },
            { header: '% sobre Ingresos', key: 'Porcentaje', width: 18 }
          ]
        }
      ],
      `Estado_Resultados_${anio}_${String(mes).padStart(2, '0')}.xlsx`
    )
  }

  const handleExportPDF = () => {
    if (!data) {
      alert('No hay datos para exportar')
      return
    }

    exportEstadoResultadosToPDF(data, anio, mes)
  }

  if (loading) {
    return (
      <Card className="border-cyan-400/20 bg-slate-950/70 text-slate-100">
        <CardContent className="flex min-h-[180px] items-center justify-center gap-3 p-6">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-cyan-400/20 border-t-cyan-300" />
          <p className="text-sm font-medium text-slate-300">Cargando Estado de Resultados...</p>
        </CardContent>
      </Card>
    )
  }

  if (!data) {
    return (
      <Card className="border-cyan-400/20 bg-slate-950/70 text-slate-100">
        <CardContent className="flex min-h-[160px] items-center justify-center p-6 text-center text-sm text-slate-300">
          No hay datos disponibles para el período seleccionado
        </CardContent>
      </Card>
    )
  }

  const margenBruto = data.ingresos.total_ingresos > 0 
    ? (data.costos.utilidad_bruta / data.ingresos.total_ingresos) * 100 
    : 0
  const margenNeto = data.ingresos.total_ingresos > 0 
    ? (data.utilidad_neta / data.ingresos.total_ingresos) * 100 
    : 0

  const { anio: prevAnio, mes: prevMes } = getPreviousPeriod()

  const renderRow = (label: string, current: number, isNegative: boolean = false) => {
    return (
      <div className="flex items-center justify-between gap-4 border-b border-cyan-400/10 py-2 last:border-b-0">
        <span className="text-sm text-slate-300">{label}</span>
        <div className="flex items-center gap-4 text-right">
          <span className={cn('font-semibold', isNegative ? 'text-blue-200' : 'text-cyan-100')}>
            {isNegative ? `(${formatCurrency(current)})` : formatCurrency(current)}
          </span>
          {showComparison && previousData && (
            <div className="min-w-[150px] text-right">
              {renderVariation(current, getPreviousValue(label))}
            </div>
          )}
        </div>
      </div>
    )
  }

  const getPreviousValue = (label: string): number => {
    if (!previousData) return 0
    
    switch (label) {
      case 'Ventas': return previousData.ingresos.ventas
      case 'Otros Ingresos': return previousData.ingresos.otros_ingresos
      case 'Total Ingresos': return previousData.ingresos.total_ingresos
      case 'Costo de Ventas': return previousData.costos.costo_ventas
      case 'Utilidad Bruta': return previousData.costos.utilidad_bruta
      case 'Gastos Administrativos': return previousData.gastos.gastos_administrativos
      case 'Gastos de Ventas': return previousData.gastos.gastos_ventas
      case 'Gastos Financieros': return previousData.gastos.gastos_financieros
      case 'Total Gastos': return previousData.gastos.total_gastos
      case 'Utilidad Neta': return previousData.utilidad_neta
      default: return 0
    }
  }

  return (
    <Card className="overflow-hidden border-cyan-400/20 bg-slate-950/70 text-slate-100 shadow-2xl shadow-blue-950/20">
      <CardHeader className="border-b border-cyan-400/10 bg-white/[0.03] px-5 py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="text-xl text-white">
            Estado de Resultados (P&L)
            </CardTitle>
            <p className="mt-1 text-sm text-slate-400">
              Período: {anio} - {String(mes).padStart(2, '0')}
              {showComparison && ` vs ${prevAnio} - ${String(prevMes).padStart(2, '0')}`}
            </p>
          </div>
        
          <div className="flex flex-wrap gap-2">
            <Button
            onClick={handleExportExcel}
              variant="outline"
              className="gap-2 border-cyan-400/20 bg-white/10 text-cyan-50 hover:bg-white/15 hover:text-white"
          >
              <Download className="h-4 w-4" />
              Exportar Excel
            </Button>
            <Button
            onClick={handleExportPDF}
              variant="outline"
              className="gap-2 border-cyan-400/20 bg-white/10 text-cyan-50 hover:bg-white/15 hover:text-white"
          >
              <FileText className="h-4 w-4" />
              Exportar PDF
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-5">
      {error && (
          <div className="flex items-center gap-3 rounded-xl border border-blue-300/20 bg-blue-400/10 p-4">
            <AlertCircle className="h-5 w-5 text-blue-100" />
            <p className="text-sm text-blue-50">
            {error}
          </p>
        </div>
      )}

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
          <div className="space-y-4">
            <section className="overflow-hidden rounded-xl border border-cyan-400/15 bg-white/[0.03]">
              <div className="border-b border-cyan-400/10 bg-cyan-400/10 px-4 py-3 text-xs font-bold uppercase tracking-[0.16em] text-cyan-100">
            INGRESOS
          </div>
              <div className="p-4">
            {renderRow('Ventas', data.ingresos.ventas)}
            {renderRow('Otros Ingresos', data.ingresos.otros_ingresos)}
                <div className="mt-3 flex items-center justify-between gap-4 border-t border-cyan-400/20 pt-3 text-base font-bold">
                  <span className="text-cyan-100">Total Ingresos</span>
                  <div className="flex items-center gap-4 text-right">
                    <span className="text-cyan-100">
                  {formatCurrency(data.ingresos.total_ingresos)}
                </span>
                {showComparison && previousData && (
                      <div className="min-w-[150px]">
                    {renderVariation(data.ingresos.total_ingresos, previousData.ingresos.total_ingresos)}
                  </div>
                )}
              </div>
            </div>
          </div>
            </section>

            <section className="overflow-hidden rounded-xl border border-cyan-400/15 bg-white/[0.03]">
              <div className="border-b border-cyan-400/10 bg-blue-400/10 px-4 py-3 text-xs font-bold uppercase tracking-[0.16em] text-blue-100">
            COSTOS
          </div>
              <div className="p-4">
            {renderRow('Costo de Ventas', data.costos.costo_ventas, true)}
                <div className="mt-3 flex items-center justify-between gap-4 border-t border-cyan-400/20 pt-3 text-base font-bold">
                  <span className="text-white">
                Utilidad Bruta
                    <span className="ml-2 text-xs font-semibold text-slate-400">
                  ({margenBruto.toFixed(2)}%)
                </span>
              </span>
                  <div className="flex items-center gap-4 text-right">
                    <span className="text-cyan-100">
                  {formatCurrency(data.costos.utilidad_bruta)}
                </span>
                {showComparison && previousData && (
                      <div className="min-w-[150px]">
                    {renderVariation(data.costos.utilidad_bruta, previousData.costos.utilidad_bruta)}
                  </div>
                )}
              </div>
            </div>
          </div>
            </section>

            <section className="overflow-hidden rounded-xl border border-cyan-400/15 bg-white/[0.03]">
              <div className="border-b border-cyan-400/10 bg-slate-800 px-4 py-3 text-xs font-bold uppercase tracking-[0.16em] text-slate-100">
            GASTOS OPERATIVOS
          </div>
              <div className="p-4">
            {renderRow('Gastos Administrativos', data.gastos.gastos_administrativos, true)}
            {renderRow('Gastos de Ventas', data.gastos.gastos_ventas, true)}
            {renderRow('Gastos Financieros', data.gastos.gastos_financieros, true)}
                <div className="mt-3 flex items-center justify-between gap-4 border-t border-cyan-400/20 pt-3 text-base font-bold">
                  <span className="text-blue-100">Total Gastos</span>
                  <div className="flex items-center gap-4 text-right">
                    <span className="text-blue-100">
                  ({formatCurrency(data.gastos.total_gastos)})
                </span>
                {showComparison && previousData && (
                      <div className="min-w-[150px]">
                    {renderVariation(data.gastos.total_gastos, previousData.gastos.total_gastos)}
                  </div>
                )}
              </div>
            </div>
          </div>
            </section>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-5">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200/80">Utilidad neta</div>
              <div className="mt-3 flex items-center gap-3 text-3xl font-bold text-white">
                {data.utilidad_neta >= 0 ? (
                  <TrendingUp className="h-8 w-8 text-cyan-200" />
                ) : (
                  <TrendingDown className="h-8 w-8 text-blue-200" />
                )}
                {formatCurrency(data.utilidad_neta)}
              </div>
              {showComparison && previousData && (
                <div className="mt-3">
                  {renderVariation(data.utilidad_neta, previousData.utilidad_neta)}
                </div>
              )}
              <div className="mt-5 rounded-xl border border-cyan-400/15 bg-slate-950/40 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                MARGEN NETO
              </div>
                <div className="mt-2 text-2xl font-bold text-cyan-100">
                {margenNeto.toFixed(2)}%
              </div>
            </div>
          </div>

            <div className="rounded-xl border border-cyan-400/15 bg-white/[0.03] p-4">
              <h3 className="text-center text-sm font-bold text-white">
            Comparación: Ingresos vs Costos y Gastos
          </h3>
              <div className="mt-4">
          <IngresosVsGastosChart 
            ingresos={data.ingresos.total_ingresos}
            costos={data.costos.costo_ventas}
            gastos={data.gastos.total_gastos}
          />
        </div>
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-cyan-400/15 bg-white/[0.03] p-4 text-center">
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-200/70">
              Total Ingresos
            </div>
            <div className="text-xl font-bold text-cyan-100">
              {formatCurrency(data.ingresos.total_ingresos)}
            </div>
          </div>
          <div className="rounded-xl border border-cyan-400/15 bg-white/[0.03] p-4 text-center">
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-200/70">
              Total Costos y Gastos
            </div>
            <div className="text-xl font-bold text-blue-100">
              {formatCurrency(data.costos.costo_ventas + data.gastos.total_gastos)}
            </div>
          </div>
          <div className="rounded-xl border border-cyan-400/15 bg-white/[0.03] p-4 text-center">
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-200/70">
              Margen Bruto
            </div>
            <div className="text-xl font-bold text-white">
              {margenBruto.toFixed(2)}%
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
