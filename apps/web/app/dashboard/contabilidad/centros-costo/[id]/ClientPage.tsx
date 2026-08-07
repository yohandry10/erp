'use client'

import { useState, useCallback, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { AlertCircle, ArrowLeft, BarChart3, Building2, Calendar, DollarSign, FileText, Loader2, Pencil, TrendingUp } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useCountryContext } from '@/hooks/use-country-context'

interface CentroCosto {
  id: string
  codigo: string
  nombre: string
  descripcion: string | null
  activo: boolean
  created_at: string
  updated_at: string
}

interface Periodo {
  id: string
  anio: number
  mes: number
  estado: string
}

interface PresupuestoItem {
  id: string
  cuenta_id: string
  cuenta_codigo: string
  cuenta_nombre: string
  monto_presupuestado: number
  monto_ejecutado: number
  porcentaje_ejecutado: number
  monto_disponible: number
  alerta: 'NORMAL' | 'ADVERTENCIA' | 'SOBREGIRO' | null
}

interface ReporteGastos {
  centro_costo: CentroCosto
  periodo: {
    fecha_desde: string
    fecha_hasta: string
  }
  gastos_por_cuenta: Array<{
    cuenta_codigo: string
    cuenta_nombre: string
    total_debe: number
    total_haber: number
    saldo: number
    cantidad_movimientos: number
  }>
  resumen: {
    total_gastos: number
    total_movimientos: number
    cuenta_mayor_gasto: {
      codigo: string
      nombre: string
      monto: number
    } | null
  }
}

const inputClass =
  'w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-3 text-sm text-foreground outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-400/10'

const labelClass = 'text-xs font-semibold uppercase tracking-[0.12em] text-primary/80'

export default function CentroCostoDetailPage() {
  const router = useRouter()
  const params = useParams()
  const { get } = useApi()
  const country = useCountryContext()
  const [centroId, setCentroId] = useState<string>('')
  const [centro, setCentro] = useState<CentroCosto | null>(null)
  const [periodos, setPeriodos] = useState<Periodo[]>([])
  const [selectedPeriodoId, setSelectedPeriodoId] = useState<string>('')
  const [presupuestos, setPresupuestos] = useState<PresupuestoItem[]>([])
  const [reporteGastos, setReporteGastos] = useState<ReporteGastos | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingPresupuestos, setLoadingPresupuestos] = useState(false)
  const [loadingReporte, setLoadingReporte] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'presupuestos' | 'gastos'>('presupuestos')

  const loadCentro = useCallback(async () => {
    if (!centroId) return

    try {
      setLoading(true)
      setError(null)
      const response = await get(`/api/contabilidad/centros-costo/${centroId}`)

      if (response?.success && response.data) {
        setCentro(response.data)
      } else {
        setError(response?.message || 'Error al cargar el centro de costo')
      }
    } catch (err) {
      console.error('Error loading centro:', err)
      setError('Error al cargar el centro de costo')
    } finally {
      setLoading(false)
    }
  }, [centroId, get])

  const loadPeriodos = useCallback(async () => {
    try {
      const response = await get('/api/contabilidad/periodos')

      if (response?.success && response.data) {
        const periodosAbiertos = response.data.filter((p: Periodo) => p.estado === 'ABIERTO')
        setPeriodos(periodosAbiertos)

        if (periodosAbiertos.length > 0) setSelectedPeriodoId(periodosAbiertos[0].id)
      }
    } catch (err) {
      console.error('Error loading periodos:', err)
    }
  }, [get])

  const loadPresupuestos = useCallback(async () => {
    if (!selectedPeriodoId || !centro) return

    try {
      setLoadingPresupuestos(true)
      setError(null)
      const response = await get(`/api/contabilidad/presupuestos/centro/${centro.id}/periodo/${selectedPeriodoId}`)
      const payload = response?.data
      const items = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.presupuestos)
          ? payload.presupuestos
          : Array.isArray(payload?.data)
            ? payload.data
            : []
      setPresupuestos(items)
    } catch (err) {
      console.error('Error loading presupuestos:', err)
      setError('Error al cargar los presupuestos')
    } finally {
      setLoadingPresupuestos(false)
    }
  }, [centro, get, selectedPeriodoId])

  const loadReporteGastos = useCallback(async () => {
    if (!selectedPeriodoId || !centro) return

    try {
      setLoadingReporte(true)
      setError(null)

      const periodo = periodos.find((p) => p.id === selectedPeriodoId)
      if (!periodo) return

      const fechaDesde = `${periodo.anio}-${String(periodo.mes).padStart(2, '0')}-01`
      const lastDay = new Date(periodo.anio, periodo.mes, 0).getDate()
      const fechaHasta = `${periodo.anio}-${String(periodo.mes).padStart(2, '0')}-${lastDay}`

      const response = await get(`/api/contabilidad/centros-costo/${centro.id}/reporte-gastos?fecha_desde=${fechaDesde}&fecha_hasta=${fechaHasta}`)
      setReporteGastos(response?.success && response.data ? response.data : null)
    } catch (err) {
      console.error('Error loading reporte gastos:', err)
      setError('Error al cargar el reporte de gastos')
    } finally {
      setLoadingReporte(false)
    }
  }, [centro, get, periodos, selectedPeriodoId])

  useEffect(() => {
    if (typeof params.id === 'string') setCentroId(params.id)
  }, [params.id])

  useEffect(() => {
    if (!centroId) return
    loadCentro()
    loadPeriodos()
  }, [centroId, loadCentro, loadPeriodos])

  useEffect(() => {
    if (selectedPeriodoId && centro) {
      if (activeTab === 'presupuestos') loadPresupuestos()
      else loadReporteGastos()
    }
  }, [activeTab, centro, loadPresupuestos, loadReporteGastos, selectedPeriodoId])

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat(country.locale || 'es-PE', {
      style: 'currency',
      currency: country.moneda || 'PEN',
    }).format(value)

  const formatPercentage = (value: number) => `${value.toFixed(1)}%`

  const getAlertText = (alerta: string | null) => {
    if (alerta === 'SOBREGIRO') return 'Sobregiro'
    if (alerta === 'ADVERTENCIA') return 'Advertencia'
    return 'Normal'
  }

  const selectedPeriodo = periodos.find((p) => p.id === selectedPeriodoId)
  const totalPresupuestado = presupuestos.reduce((sum, item) => sum + item.monto_presupuestado, 0)
  const totalEjecutado = presupuestos.reduce((sum, item) => sum + item.monto_ejecutado, 0)
  const totalDisponible = presupuestos.reduce((sum, item) => sum + item.monto_disponible, 0)
  const detailTabs: Array<{ label: string; value: 'presupuestos' | 'gastos'; icon: typeof DollarSign }> = [
    { label: 'Presupuesto', value: 'presupuestos', icon: DollarSign },
    { label: 'Gastos', value: 'gastos', icon: TrendingUp },
  ]

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-muted/50 to-background p-4 text-foreground">
        <Card className="mx-auto max-w-[1500px] border-cyan-400/20 bg-card/70 text-foreground">
          <CardContent className="flex min-h-[180px] items-center justify-center gap-3 p-6">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
            <span className="text-sm font-medium text-muted-foreground">Cargando centro de costo...</span>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error && !centro) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-muted/50 to-background p-4 text-foreground">
        <Card className="mx-auto max-w-[1200px] border-cyan-400/20 bg-card/70 text-foreground">
          <CardContent className="flex min-h-[220px] flex-col items-center justify-center gap-4 p-6 text-center">
            <AlertCircle className="h-8 w-8 text-primary" />
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button onClick={() => router.push('/dashboard/contabilidad/centros-costo')} className="bg-blue-600 text-white hover:bg-blue-500">
              Volver
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!centro) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-muted/50 to-background p-4 text-foreground">
        <Card className="mx-auto max-w-[1200px] border-cyan-400/20 bg-card/70 text-foreground">
          <CardContent className="flex min-h-[220px] items-center justify-center p-6 text-center text-sm text-muted-foreground">
            Centro de costo no encontrado
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/50 to-background p-4 text-foreground">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <section className="rounded-2xl border border-cyan-400/20 bg-card/70 px-5 py-4 shadow-2xl shadow-blue-950/20">
          <Button
            type="button"
            onClick={() => router.push('/dashboard/contabilidad/centros-costo')}
            variant="outline"
            className="mb-4 gap-2 border-cyan-400/20 bg-white/5 text-primary hover:bg-white/10 hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Button>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-primary">
                <Building2 className="h-6 w-6" />
              </span>
              <div>
                <div className="mb-2 inline-flex rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                  {centro.activo ? 'Centro activo' : 'Centro inactivo'}
                </div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground">
                  {centro.codigo} - {centro.nombre}
                </h1>
                {centro.descripcion && <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{centro.descripcion}</p>}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => router.push(`/dashboard/contabilidad/presupuestos/comparacion?centroId=${centro.id}&periodoId=${selectedPeriodoId}`)}
                disabled={!selectedPeriodoId}
                variant="outline"
                className="gap-2 border-cyan-400/20 bg-white/5 text-primary hover:bg-white/10 hover:text-foreground disabled:opacity-50"
              >
                <BarChart3 className="h-4 w-4" />
                Comparacion
              </Button>
              <Button
                type="button"
                onClick={() => router.push(`/dashboard/contabilidad/centros-costo/${centro.id}/editar`)}
                className="gap-2 bg-blue-600 text-white hover:bg-blue-500"
              >
                <Pencil className="h-4 w-4" />
                Editar
              </Button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-4">
            <Card className="border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20">
              <CardContent className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_260px] md:items-end">
                <label className="space-y-2">
                  <span className={labelClass}>Periodo</span>
                  <select value={selectedPeriodoId} onChange={(e) => setSelectedPeriodoId(e.target.value)} className={inputClass}>
                    <option value="">Seleccionar periodo</option>
                    {periodos.map((periodo) => (
                      <option key={periodo.id} value={periodo.id}>
                        {new Date(periodo.anio, periodo.mes - 1).toLocaleDateString('es-PE', {
                          year: 'numeric',
                          month: 'long',
                        })}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {detailTabs.map(({ label, value, icon: Icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setActiveTab(value as 'presupuestos' | 'gastos')}
                      className={cn(
                        'flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold transition',
                        activeTab === value
                          ? 'border-cyan-300/40 bg-cyan-400/15 text-white'
                          : 'border-cyan-400/15 bg-white/[0.03] text-muted-foreground hover:bg-white/[0.07]',
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {!selectedPeriodoId ? (
              <EmptyPanel icon={Calendar} title="Selecciona un periodo" description="Elige un periodo abierto para revisar presupuesto o gastos." />
            ) : activeTab === 'presupuestos' ? (
              <BudgetPanel
                loading={loadingPresupuestos}
                presupuestos={presupuestos}
                formatCurrency={formatCurrency}
                formatPercentage={formatPercentage}
                getAlertText={getAlertText}
                onCreate={() => router.push('/dashboard/contabilidad/presupuestos/nuevo')}
              />
            ) : (
              <ExpensesPanel loading={loadingReporte} reporteGastos={reporteGastos} formatCurrency={formatCurrency} />
            )}
          </div>

          <aside className="space-y-4">
            <Card className="border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20">
              <CardHeader className="border-b border-cyan-400/10 px-5 py-4">
                <CardTitle className="text-base text-foreground">Resumen</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 p-5">
                {[
                  ['Periodo', selectedPeriodo ? `${selectedPeriodo.mes}/${selectedPeriodo.anio}` : 'Sin seleccion'],
                  ['Presupuestado', formatCurrency(totalPresupuestado)],
                  ['Ejecutado', formatCurrency(totalEjecutado)],
                  ['Disponible', formatCurrency(totalDisponible)],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between rounded-xl border border-cyan-400/15 bg-white/[0.03] px-3 py-3">
                    <span className={labelClass}>{label}</span>
                    <span className="text-sm font-bold text-foreground">{value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            {error && (
              <Card className="border-cyan-400/20 bg-cyan-400/10 text-primary">
                <CardContent className="flex items-center gap-3 p-4 text-sm font-medium">
                  <AlertCircle className="h-5 w-5" />
                  {error}
                </CardContent>
              </Card>
            )}
          </aside>
        </section>
      </div>
    </div>
  )
}

function EmptyPanel({ icon: Icon, title, description }: { icon: typeof Calendar; title: string; description: string }) {
  return (
    <Card className="border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20">
      <CardContent className="flex min-h-[260px] flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-4">
          <Icon className="h-10 w-10 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function BudgetPanel({
  loading,
  presupuestos,
  formatCurrency,
  formatPercentage,
  getAlertText,
  onCreate,
}: {
  loading: boolean
  presupuestos: PresupuestoItem[]
  formatCurrency: (value: number) => string
  formatPercentage: (value: number) => string
  getAlertText: (alerta: string | null) => string
  onCreate: () => void
}) {
  if (loading) {
    return <EmptyPanel icon={Loader2 as typeof Calendar} title="Cargando presupuestos" description="Consultando ejecucion presupuestal del periodo." />
  }

  if (presupuestos.length === 0) {
    return (
      <Card className="border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20">
        <CardContent className="flex min-h-[260px] flex-col items-center justify-center gap-4 p-8 text-center">
          <FileText className="h-10 w-10 text-primary" />
          <div>
            <h3 className="text-lg font-semibold text-foreground">Sin presupuestos configurados</h3>
            <p className="mt-2 text-sm text-muted-foreground">No hay presupuesto para este centro en el periodo seleccionado.</p>
          </div>
          <Button type="button" onClick={onCreate} className="bg-blue-600 text-white hover:bg-blue-500">
            Crear presupuesto
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20">
      <CardHeader className="border-b border-cyan-400/10 px-5 py-4">
        <CardTitle className="text-base text-foreground">Presupuesto vs real</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse">
            <thead className="bg-cyan-400/10">
              <tr className="border-b border-cyan-400/15 text-left text-xs font-semibold uppercase tracking-[0.12em] text-primary/80">
                <th className="px-4 py-3">Cuenta</th>
                <th className="px-4 py-3 text-right">Presupuestado</th>
                <th className="px-4 py-3 text-right">Ejecutado</th>
                <th className="px-4 py-3 text-right">Disponible</th>
                <th className="px-4 py-3 text-right">% Ejecutado</th>
                <th className="px-4 py-3 text-center">Estado</th>
              </tr>
            </thead>
            <tbody>
              {presupuestos.map((item) => (
                <tr key={item.id} className="border-b border-cyan-400/10 text-sm text-foreground/90 transition hover:bg-cyan-400/10">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-foreground">{item.cuenta_codigo}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{item.cuenta_nombre}</div>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-foreground">{formatCurrency(item.monto_presupuestado)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-foreground">{formatCurrency(item.monto_ejecutado)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-primary">{formatCurrency(item.monto_disponible)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-primary dark:text-blue-200">{formatPercentage(item.porcentaje_ejecutado)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-primary">
                      {getAlertText(item.alerta)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

function ExpensesPanel({
  loading,
  reporteGastos,
  formatCurrency,
}: {
  loading: boolean
  reporteGastos: ReporteGastos | null
  formatCurrency: (value: number) => string
}) {
  if (loading) {
    return <EmptyPanel icon={Loader2 as typeof Calendar} title="Cargando gastos" description="Consultando movimientos del centro de costo." />
  }

  if (!reporteGastos || reporteGastos.gastos_por_cuenta.length === 0) {
    return <EmptyPanel icon={FileText as typeof Calendar} title="Sin gastos registrados" description="No hay gastos para este centro de costo en el periodo seleccionado." />
  }

  return (
    <div className="space-y-4">
      <section className="grid gap-3 md:grid-cols-3">
        {[
          ['Total gastos', formatCurrency(reporteGastos.resumen.total_gastos)],
          ['Movimientos', reporteGastos.resumen.total_movimientos],
          ['Mayor gasto', reporteGastos.resumen.cuenta_mayor_gasto?.codigo || 'Sin datos'],
        ].map(([label, value]) => (
          <Card key={label} className="border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20">
            <CardContent className="p-4">
              <div className={labelClass}>{label}</div>
              <div className="mt-3 text-2xl font-bold text-foreground">{value}</div>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card className="overflow-hidden border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20">
        <CardHeader className="border-b border-cyan-400/10 px-5 py-4">
          <CardTitle className="text-base text-foreground">Gastos por cuenta</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse">
              <thead className="bg-cyan-400/10">
                <tr className="border-b border-cyan-400/15 text-left text-xs font-semibold uppercase tracking-[0.12em] text-primary/80">
                  <th className="px-4 py-3">Cuenta</th>
                  <th className="px-4 py-3 text-right">Debe</th>
                  <th className="px-4 py-3 text-right">Haber</th>
                  <th className="px-4 py-3 text-right">Saldo</th>
                  <th className="px-4 py-3 text-center">Movimientos</th>
                </tr>
              </thead>
              <tbody>
                {reporteGastos.gastos_por_cuenta.map((gasto, index) => (
                  <tr key={index} className="border-b border-cyan-400/10 text-sm text-foreground/90 transition hover:bg-cyan-400/10">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-foreground">{gasto.cuenta_codigo}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{gasto.cuenta_nombre}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-foreground">{formatCurrency(gasto.total_debe)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-foreground">{formatCurrency(gasto.total_haber)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-primary">{formatCurrency(Math.abs(gasto.saldo))}</td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{gasto.cantidad_movimientos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

