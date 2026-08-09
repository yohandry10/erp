'use client'

import { useState } from 'react'
import { useApi } from '@/hooks/use-api'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BalanceComprobacion } from '@/components/contabilidad/BalanceComprobacion'
import { EstadoResultados } from '@/components/contabilidad/EstadoResultados'
import { BalanceGeneral } from '@/components/contabilidad/BalanceGeneral'
import { FlujoEfectivo } from '@/components/contabilidad/FlujoEfectivo'
import { RatiosFinancieros } from '@/components/contabilidad/RatiosFinancieros'
import { Calendar, FileText, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDashboardTheme } from '@/hooks/use-dashboard-theme'

export default function EstadosFinancierosPage() {
  const { post } = useApi()
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('balance-comprobacion')

  const currentDate = new Date()
  const [anio, setAnio] = useState(currentDate.getFullYear())
  const [mes, setMes] = useState(currentDate.getMonth() + 1)
  const [showComparison, setShowComparison] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const { theme } = useDashboardTheme()
  const darkMode = theme === 'dark'

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
      await post(`/api/contabilidad/estados/refrescar?anio=${anio}&mes=${mes}`, {})
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
          ? 'bg-gradient-to-br from-background via-muted/50 to-background text-foreground'
          : 'bg-gradient-to-br from-background via-muted/50 to-background text-foreground text-foreground',
      )}
    >
      <div className="mx-auto max-w-7xl space-y-6">
        <section className={cn('rounded-2xl border p-6 shadow-2xl', darkMode ? 'border-cyan-400/20 bg-card/70 shadow-blue-950/20' : 'border-border bg-card shadow-slate-200/70')}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-4">
            <div className={cn('rounded-xl border p-3', darkMode ? 'border-cyan-400/20 bg-cyan-400/10 text-primary' : 'border-blue-100 bg-primary/10 text-primary')}>
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <div className={cn('mb-2 inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]', darkMode ? 'border-cyan-400/25 bg-cyan-400/10 text-primary' : 'border-blue-100 bg-primary/10 text-primary')}>
                ERP Financial Statements
              </div>
              <h1 className={cn('text-4xl font-bold tracking-tight', darkMode ? 'text-foreground' : 'text-foreground')}>Estados Financieros</h1>
              <p className={cn('mt-3 max-w-3xl text-sm leading-6', darkMode ? 'text-muted-foreground' : 'text-muted-foreground')}>
                Balance de comprobación, resultados, situación financiera, flujo de efectivo e indicadores con periodo controlado.
              </p>
            </div>
            </div>
          </div>
        </section>

        <Card className={cn('shadow-xl', darkMode ? 'border-cyan-400/20 bg-card/65 text-foreground shadow-blue-950/20' : 'border-border bg-card text-foreground shadow-slate-200/70')}>
          <CardHeader className={cn('border-b', darkMode ? 'border-cyan-400/10' : 'border-border')}>
            <CardTitle className={cn('flex items-center gap-2 text-base', darkMode ? 'text-foreground' : 'text-foreground')}>
              <Calendar className={cn('h-5 w-5', darkMode ? 'text-primary' : 'text-primary')} />
              Seleccionar periodo
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            <div className="grid gap-4 md:grid-cols-[minmax(140px,180px)_minmax(160px,220px)_minmax(220px,1fr)_auto] md:items-end">
              <label className="space-y-2">
                <span className={cn('block text-xs font-semibold uppercase tracking-[0.16em]', darkMode ? 'text-primary/80' : 'text-muted-foreground')}>Año</span>
                <select
                  value={anio}
                  onChange={(event) => setAnio(Number(event.target.value))}
                  className={cn('h-11 w-full rounded-lg border px-3 text-sm outline-none transition focus:ring-4', darkMode ? 'border-cyan-400/15 bg-card text-foreground focus:border-cyan-300 focus:ring-cyan-400/10' : 'border-border bg-card text-foreground focus:border-blue-400 focus:ring-blue-100')}
                >
                  {years.map((year) => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className={cn('block text-xs font-semibold uppercase tracking-[0.16em]', darkMode ? 'text-primary/80' : 'text-muted-foreground')}>Mes</span>
                <select
                  value={mes}
                  onChange={(event) => setMes(Number(event.target.value))}
                  className={cn('h-11 w-full rounded-lg border px-3 text-sm outline-none transition focus:ring-4', darkMode ? 'border-cyan-400/15 bg-card text-foreground focus:border-cyan-300 focus:ring-cyan-400/10' : 'border-border bg-card text-foreground focus:border-blue-400 focus:ring-blue-100')}
                >
                  {months.map((month) => (
                    <option key={month.value} value={month.value}>{month.label}</option>
                  ))}
                </select>
              </label>

              <label className={cn('flex min-h-11 items-center gap-3 rounded-lg border px-3 text-sm font-semibold', darkMode ? 'border-cyan-400/15 bg-card/45 text-foreground/90' : 'border-border bg-muted/30 text-foreground/85')}>
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
          <TabsList className={cn('mb-6 grid h-auto w-full grid-cols-1 border p-1 sm:grid-cols-2 xl:grid-cols-5', darkMode ? 'border-cyan-400/15 bg-card/70' : 'border-border bg-card')}>
            <TabsTrigger
              value="balance-comprobacion"
              className={cn(darkMode ? 'text-muted-foreground data-[state=active]:bg-cyan-400/15 data-[state=active]:text-primary' : 'text-muted-foreground data-[state=active]:bg-primary/10 data-[state=active]:text-primary')}
            >
              Balance de Comprobación
            </TabsTrigger>
            <TabsTrigger
              value="estado-resultados"
              className={cn(darkMode ? 'text-muted-foreground data-[state=active]:bg-cyan-400/15 data-[state=active]:text-primary' : 'text-muted-foreground data-[state=active]:bg-primary/10 data-[state=active]:text-primary')}
            >
              Estado de Resultados
            </TabsTrigger>
            <TabsTrigger
              value="balance-general"
              className={cn(darkMode ? 'text-muted-foreground data-[state=active]:bg-cyan-400/15 data-[state=active]:text-primary' : 'text-muted-foreground data-[state=active]:bg-primary/10 data-[state=active]:text-primary')}
            >
              Balance General
            </TabsTrigger>
            <TabsTrigger
              value="flujo-efectivo"
              className={cn(darkMode ? 'text-muted-foreground data-[state=active]:bg-cyan-400/15 data-[state=active]:text-primary' : 'text-muted-foreground data-[state=active]:bg-primary/10 data-[state=active]:text-primary')}
            >
              Flujo de Efectivo
            </TabsTrigger>
            <TabsTrigger
              value="ratios-financieros"
              className={cn(darkMode ? 'text-muted-foreground data-[state=active]:bg-cyan-400/15 data-[state=active]:text-primary' : 'text-muted-foreground data-[state=active]:bg-primary/10 data-[state=active]:text-primary')}
            >
              Indicadores
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

          <TabsContent value="flujo-efectivo">
            <FlujoEfectivo key={`fe-${refreshKey}`} anio={anio} mes={mes} />
          </TabsContent>

          <TabsContent value="ratios-financieros">
            <RatiosFinancieros key={`rf-${refreshKey}`} anio={anio} mes={mes} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
