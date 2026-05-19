'use client'

import { useState } from 'react'
import { useApi } from '@/hooks/use-api'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BalanceComprobacion } from '@/components/contabilidad/BalanceComprobacion'
import { EstadoResultados } from '@/components/contabilidad/EstadoResultados'
import { BalanceGeneral } from '@/components/contabilidad/BalanceGeneral'
import { Calendar, FileText, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function EstadosFinancierosPage() {
  const { get } = useApi()
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('balance-comprobacion')

  const currentDate = new Date()
  const [anio, setAnio] = useState(currentDate.getFullYear())
  const [mes, setMes] = useState(currentDate.getMonth() + 1)
  const [showComparison, setShowComparison] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const darkMode = true

  const years = Array.from({ length: 7 }, (_, i) => currentDate.getFullYear() - 5 + i)
  const months = [
    { value: 1, label: 'Enero' },
    { value: 2, label: 'Febrero' },
    { value: 3, label: 'Marzo' },
    { value: 4, label: 'Abril' },
    { value: 5, label: 'Mayo' },
    { value: 6, label: 'Junio' },
    { value: 7, label: 'Julio' },
    { value: 8, label: 'Agosto' },
    { value: 9, label: 'Septiembre' },
    { value: 10, label: 'Octubre' },
    { value: 11, label: 'Noviembre' },
    { value: 12, label: 'Diciembre' },
  ]

  const handleRefresh = async () => {
    setLoading(true)
    try {
      await get(`/api/contabilidad/estados/refrescar?anio=${anio}&mes=${mes}`)
      setRefreshKey((prev) => prev + 1)
    } catch (error) {
      console.error('Error refrescando estados financieros:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className={cn(
        'min-h-screen p-6 transition-colors',
        darkMode
          ? 'bg-gradient-to-br from-slate-950 via-sky-950 to-slate-950 text-slate-100'
          : 'erp-light-scope text-slate-950',
      )}
    >
      <div className="mx-auto max-w-7xl space-y-6">
        <section className={cn('rounded-2xl border p-6 shadow-2xl', darkMode ? 'border-cyan-400/20 bg-slate-950/70 shadow-blue-950/20' : 'border-slate-200 bg-white shadow-slate-200/70')}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-4">
            <div className={cn('rounded-xl border p-3', darkMode ? 'border-cyan-400/20 bg-cyan-400/10 text-cyan-100' : 'border-blue-100 bg-blue-50 text-blue-700')}>
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <div className={cn('mb-2 inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]', darkMode ? 'border-cyan-400/25 bg-cyan-400/10 text-cyan-100' : 'border-blue-100 bg-blue-50 text-blue-700')}>
                ERP Financial Statements
              </div>
              <h1 className={cn('text-4xl font-bold tracking-tight', darkMode ? 'text-white' : 'text-slate-950')}>Estados Financieros</h1>
              <p className={cn('mt-3 max-w-3xl text-sm leading-6', darkMode ? 'text-slate-300' : 'text-slate-500')}>
                Balance de comprobación, estado de resultados y balance general con periodo controlado.
              </p>
            </div>
            </div>
          </div>
        </section>

        <Card className={cn('shadow-xl', darkMode ? 'border-cyan-400/20 bg-slate-950/65 text-slate-100 shadow-blue-950/20' : 'border-slate-200 bg-white text-slate-950 shadow-slate-200/70')}>
          <CardHeader className={cn('border-b', darkMode ? 'border-cyan-400/10' : 'border-slate-200')}>
            <CardTitle className={cn('flex items-center gap-2 text-base', darkMode ? 'text-white' : 'text-slate-950')}>
              <Calendar className={cn('h-5 w-5', darkMode ? 'text-cyan-200' : 'text-blue-700')} />
              Seleccionar periodo
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            <div className="grid gap-4 md:grid-cols-[minmax(140px,180px)_minmax(160px,220px)_minmax(220px,1fr)_auto] md:items-end">
              <label className="space-y-2">
                <span className={cn('block text-xs font-semibold uppercase tracking-[0.16em]', darkMode ? 'text-cyan-200/70' : 'text-slate-500')}>Año</span>
                <select
                  value={anio}
                  onChange={(event) => setAnio(Number(event.target.value))}
                  className={cn('h-11 w-full rounded-lg border px-3 text-sm outline-none transition focus:ring-4', darkMode ? 'border-cyan-400/15 bg-slate-900 text-slate-100 focus:border-cyan-300 focus:ring-cyan-400/10' : 'border-slate-200 bg-white text-slate-950 focus:border-blue-400 focus:ring-blue-100')}
                >
                  {years.map((year) => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className={cn('block text-xs font-semibold uppercase tracking-[0.16em]', darkMode ? 'text-cyan-200/70' : 'text-slate-500')}>Mes</span>
                <select
                  value={mes}
                  onChange={(event) => setMes(Number(event.target.value))}
                  className={cn('h-11 w-full rounded-lg border px-3 text-sm outline-none transition focus:ring-4', darkMode ? 'border-cyan-400/15 bg-slate-900 text-slate-100 focus:border-cyan-300 focus:ring-cyan-400/10' : 'border-slate-200 bg-white text-slate-950 focus:border-blue-400 focus:ring-blue-100')}
                >
                  {months.map((month) => (
                    <option key={month.value} value={month.value}>{month.label}</option>
                  ))}
                </select>
              </label>

              <label className={cn('flex min-h-11 items-center gap-3 rounded-lg border px-3 text-sm font-semibold', darkMode ? 'border-cyan-400/15 bg-slate-950/45 text-slate-200' : 'border-slate-200 bg-slate-50 text-slate-700')}>
                <input
                  type="checkbox"
                  checked={showComparison}
                  onChange={(event) => setShowComparison(event.target.checked)}
                  className="h-4 w-4 rounded border-cyan-400/30 accent-blue-600"
                />
                Comparar con periodo anterior
              </label>

              <Button
                onClick={handleRefresh}
                disabled={loading}
                className="h-11 gap-2 bg-blue-600 text-white hover:bg-blue-500"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                {loading ? 'Refrescando...' : 'Refrescar vistas'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className={cn('mb-6 grid w-full grid-cols-1 border p-1 sm:grid-cols-3', darkMode ? 'border-cyan-400/15 bg-slate-950/70' : 'border-slate-200 bg-white')}>
            <TabsTrigger
              value="balance-comprobacion"
              className={cn(darkMode ? 'text-slate-400 data-[state=active]:bg-cyan-400/15 data-[state=active]:text-cyan-50' : 'text-slate-500 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-800')}
            >
              Balance de Comprobación
            </TabsTrigger>
            <TabsTrigger
              value="estado-resultados"
              className={cn(darkMode ? 'text-slate-400 data-[state=active]:bg-cyan-400/15 data-[state=active]:text-cyan-50' : 'text-slate-500 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-800')}
            >
              Estado de Resultados
            </TabsTrigger>
            <TabsTrigger
              value="balance-general"
              className={cn(darkMode ? 'text-slate-400 data-[state=active]:bg-cyan-400/15 data-[state=active]:text-cyan-50' : 'text-slate-500 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-800')}
            >
              Balance General
            </TabsTrigger>
          </TabsList>

          <TabsContent value="balance-comprobacion">
            <BalanceComprobacion key={`bc-${refreshKey}`} anio={anio} mes={mes} showComparison={showComparison} />
          </TabsContent>

          <TabsContent value="estado-resultados">
            <EstadoResultados key={`er-${refreshKey}`} anio={anio} mes={mes} showComparison={showComparison} />
          </TabsContent>

          <TabsContent value="balance-general">
            <BalanceGeneral key={`bg-${refreshKey}`} anio={anio} mes={mes} showComparison={showComparison} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
