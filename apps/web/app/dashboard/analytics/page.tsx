'use client'

import { useState, useCallback, useEffect } from 'react'
import { useApiCall } from '@/hooks/use-api'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { PageShell } from '@/components/erp/page-shell'

const ANALYTICS_CACHE_KEY = 'erp-analytics-dashboard-snapshot'
const CHART_PALETTE = ['#38bdf8', '#22d3ee', '#2563eb', '#1e40af', '#64748b']
const CHART_SWATCH_CLASSES = ['bg-sky-400', 'bg-cyan-300', 'bg-blue-600', 'bg-blue-800', 'bg-slate-500']
const GAUGE_COLORS = {
  high: '#22d3ee',
  medium: '#2563eb',
  low: '#64748b',
}

const analyticsCard =
  'overflow-hidden rounded-[1.15rem] border border-cyan-400/20 bg-slate-950/75 text-slate-100 shadow-2xl shadow-cyan-950/25 group-data-[erp-theme=light]/dashboard:border-slate-200 group-data-[erp-theme=light]/dashboard:bg-white group-data-[erp-theme=light]/dashboard:text-slate-950 group-data-[erp-theme=light]/dashboard:shadow-slate-200/70'
const mutedPanel =
  'rounded-2xl border border-cyan-400/15 bg-slate-900/60 group-data-[erp-theme=light]/dashboard:border-slate-200 group-data-[erp-theme=light]/dashboard:bg-slate-50'
const analyticsInputClass =
  'border-cyan-400/20 bg-slate-950/60 text-slate-100 placeholder:text-slate-500 focus-visible:ring-cyan-400/40 group-data-[erp-theme=light]/dashboard:border-slate-200 group-data-[erp-theme=light]/dashboard:bg-white group-data-[erp-theme=light]/dashboard:text-slate-950'
const chartSkeletonClass =
  'h-full min-h-[260px] rounded-2xl border border-cyan-400/10 bg-slate-900/45 p-6 group-data-[erp-theme=light]/dashboard:border-slate-200 group-data-[erp-theme=light]/dashboard:bg-slate-50'

type AnalyticsData = {
  ventasTiempo: any
  deudasClientes: any
  deudasProveedores: any
  ventasCategoria: any
  kpisVisuales: any
}

const EMPTY_ANALYTICS_DATA: AnalyticsData = {
  ventasTiempo: null,
  deudasClientes: null,
  deudasProveedores: null,
  ventasCategoria: null,
  kpisVisuales: null,
}

const hasAnalyticsData = (data: AnalyticsData) =>
  Boolean(data.ventasTiempo || data.deudasClientes || data.deudasProveedores || data.ventasCategoria || data.kpisVisuales)

const getCachedAnalytics = (): AnalyticsData => {
  if (typeof window === 'undefined') {
    return EMPTY_ANALYTICS_DATA
  }

  try {
    const raw = window.localStorage.getItem(ANALYTICS_CACHE_KEY)
    if (!raw) {
      return EMPTY_ANALYTICS_DATA
    }

    return { ...EMPTY_ANALYTICS_DATA, ...JSON.parse(raw) }
  } catch {
    return EMPTY_ANALYTICS_DATA
  }
}

const cacheAnalytics = (data: AnalyticsData) => {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(ANALYTICS_CACHE_KEY, JSON.stringify(data))
  } catch {
    /* ignore storage failures */
  }
}

function ChartLoadingState({ label }: { label: string }) {
  return (
    <div className={chartSkeletonClass}>
      <p className="mb-6 text-sm font-semibold text-slate-200 group-data-[erp-theme=light]/dashboard:text-slate-700">
        {label}
      </p>
      <div className="flex h-44 items-end gap-3">
        <Skeleton className="h-20 flex-1 bg-cyan-400/15 group-data-[erp-theme=light]/dashboard:bg-slate-200" />
        <Skeleton className="h-28 flex-1 bg-cyan-400/15 group-data-[erp-theme=light]/dashboard:bg-slate-200" />
        <Skeleton className="h-36 flex-1 bg-cyan-400/15 group-data-[erp-theme=light]/dashboard:bg-slate-200" />
        <Skeleton className="h-24 flex-1 bg-cyan-400/15 group-data-[erp-theme=light]/dashboard:bg-slate-200" />
      </div>
    </div>
  )
}

function KpiLoadingState() {
  return (
    <Card className={analyticsCard}>
      <CardHeader>
        <CardTitle className="text-white group-data-[erp-theme=light]/dashboard:text-slate-950">
          Indicadores clave de rendimiento
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {['Liquidez', 'Rentabilidad', 'Crecimiento', 'Eficiencia'].map((label) => (
            <div key={label} className={`${mutedPanel} p-6 text-center`}>
              <p className="mb-4 text-sm font-semibold text-slate-200 group-data-[erp-theme=light]/dashboard:text-slate-700">
                {label}
              </p>
              <Skeleton className="mx-auto h-16 w-32 rounded-full bg-cyan-400/15 group-data-[erp-theme=light]/dashboard:bg-slate-200" />
              <Skeleton className="mx-auto mt-4 h-4 w-24 bg-cyan-400/15 group-data-[erp-theme=light]/dashboard:bg-slate-200" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// Componente simple para gráfico de barras
const BarChart = ({ data, title, color = '#2563eb' }: { data: any, title: string, color?: string }) => {
  const values = Array.isArray(data?.data) ? data.data.map((value: number) => Number(value) || 0) : []
  const maxValue = values.length ? Math.max(...values) : 0

  if (!data?.labels?.length || maxValue <= 0) {
    return (
      <div className="p-8 text-center text-sm text-slate-400 group-data-[erp-theme=light]/dashboard:text-slate-500">
        Sin datos para mostrar
      </div>
    )
  }

  return (
    <div>
      {title ? <h3 className="mb-6 text-center text-sm font-semibold text-white group-data-[erp-theme=light]/dashboard:text-slate-950">{title}</h3> : null}
      <div className="flex h-[200px] items-end gap-2 p-4">
        {data.labels.map((label: string, index: number) => {
          const value = values[index] || 0
          const height = Math.max((value / maxValue) * 160, value > 0 ? 4 : 0)
          return (
            <div key={index} className="flex flex-1 flex-col items-center">
              <svg className="h-40 w-full cursor-pointer overflow-visible transition-transform hover:scale-105" viewBox="0 0 32 160" preserveAspectRatio="none" aria-label={`${label}: ${value.toLocaleString()}`}>
                <rect x="2" y={160 - height} width="28" height={height} rx="4" fill={color} />
              </svg>
              {height > 30 ? (
                <div className="-mt-8 text-center text-xs font-semibold text-white group-data-[erp-theme=light]/dashboard:text-slate-800">
                  {value.toLocaleString()}
                </div>
              ) : null}
              <div className="mt-2 origin-center -rotate-45 whitespace-nowrap text-center text-[0.7rem] text-slate-400 group-data-[erp-theme=light]/dashboard:text-slate-500">
                {label}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Componente simple para gráfico de pastel
const PieChart = ({ data, title }: { data: any, title: string }) => {
  const total = Array.isArray(data?.data)
    ? data.data.reduce((sum: number, value: number) => sum + (Number(value) || 0), 0)
    : 0

  if (!data?.labels?.length || total <= 0) {
    return (
      <div className="p-8 text-center text-sm text-slate-400 group-data-[erp-theme=light]/dashboard:text-slate-500">
        Sin datos para mostrar
      </div>
    )
  }

  let currentAngle = 0

  return (
    <div>
      <h3 className="mb-6 text-center text-sm font-semibold text-white group-data-[erp-theme=light]/dashboard:text-slate-950">{title}</h3>
      <div className="flex flex-col items-center gap-6 md:flex-row">
        <div className="relative h-[200px] w-[200px] shrink-0">
          <svg width="200" height="200" className="-rotate-90">
            {data.labels.map((label: string, index: number) => {
              const percentage = (data.data[index] / total) * 100
              const angle = (data.data[index] / total) * 360
              const radius = 80
              const centerX = 100
              const centerY = 100

              const x1 = centerX + radius * Math.cos((currentAngle * Math.PI) / 180)
              const y1 = centerY + radius * Math.sin((currentAngle * Math.PI) / 180)
              const x2 = centerX + radius * Math.cos(((currentAngle + angle) * Math.PI) / 180)
              const y2 = centerY + radius * Math.sin(((currentAngle + angle) * Math.PI) / 180)

              const largeArcFlag = angle > 180 ? 1 : 0

              const pathData = [
                `M ${centerX} ${centerY}`,
                `L ${x1} ${y1}`,
                `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
                'Z'
              ].join(' ')

              const color = CHART_PALETTE[index % CHART_PALETTE.length]

              currentAngle += angle

              return (
                <path
                  key={index}
                  d={pathData}
                  fill={color}
                  stroke="rgba(15,23,42,0.7)"
                  strokeWidth="2"
                  className="cursor-pointer"
                >
                  <title>{`${label}: ${percentage.toFixed(1)}%`}</title>
                </path>
              )
            })}
          </svg>
        </div>

        <div className="min-w-0 flex-1">
          {data.labels.map((label: string, index: number) => {
            const percentage = ((data.data[index] / total) * 100).toFixed(1)
            const swatchClass = CHART_SWATCH_CLASSES[index % CHART_SWATCH_CLASSES.length]

            return (
              <div key={index} className="mb-2 flex items-center">
                <div className={`mr-3 h-4 w-4 rounded-sm ${swatchClass}`} />
                <span className="text-sm text-slate-200 group-data-[erp-theme=light]/dashboard:text-slate-700">
                  {label}: {percentage}%
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// Componente para KPI visual
const KPIGauge = ({ data, title }: { data: any, title: string }) => {
  // Verificación de seguridad para datos
  if (!data || typeof data.valor === 'undefined' || typeof data.objetivo === 'undefined') {
    return (
      <div className="rounded-2xl border border-cyan-400/15 bg-slate-900/60 p-6 text-center group-data-[erp-theme=light]/dashboard:bg-slate-50">
        <h4 className="mb-4 text-sm font-semibold text-white group-data-[erp-theme=light]/dashboard:text-slate-950">{title}</h4>
        <div className="text-sm text-slate-400 group-data-[erp-theme=light]/dashboard:text-slate-500">
          Sin datos disponibles
        </div>
      </div>
    )
  }

  const percentage = Math.min((data.valor / data.objetivo) * 100, 100)
  const color = percentage >= 80 ? GAUGE_COLORS.high : percentage >= 60 ? GAUGE_COLORS.medium : GAUGE_COLORS.low
  const valueClass = percentage >= 80 ? 'text-cyan-300 group-data-[erp-theme=light]/dashboard:text-cyan-700' : percentage >= 60 ? 'text-blue-300 group-data-[erp-theme=light]/dashboard:text-blue-700' : 'text-slate-300 group-data-[erp-theme=light]/dashboard:text-slate-600'

  return (
    <div className={`${mutedPanel} p-6 text-center`}>
      <h4 className="mb-4 text-sm font-semibold text-white group-data-[erp-theme=light]/dashboard:text-slate-950">{title}</h4>
      <div className="relative mx-auto mb-4 h-[60px] w-[120px]">
        <svg width="120" height="60" className="overflow-visible">
          {/* Fondo del gauge */}
          <path
            d="M 10 50 A 50 50 0 0 1 110 50"
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="8"
          />
          {/* Progreso del gauge */}
          <path
            d="M 10 50 A 50 50 0 0 1 110 50"
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeDasharray={`${(percentage / 100) * 157} 157`}
            className="transition-all duration-1000"
          />
        </svg>
        <div className={`absolute bottom-2 left-1/2 -translate-x-1/2 text-lg font-bold ${valueClass}`}>
          {data.valor.toFixed(1)}
        </div>
      </div>
      <div className="text-xs text-slate-400 group-data-[erp-theme=light]/dashboard:text-slate-500">
        Objetivo: {data.objetivo} | Estado: {data.estado || 'N/A'}
      </div>
    </div>
  )
}

export default function AnalyticsPage() {
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData>(() => getCachedAnalytics())
  const [hasLoaded, setHasLoaded] = useState(() => hasAnalyticsData(getCachedAnalytics()))
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [periodo, setPeriodo] = useState('mensual')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [fechaDesdeAplicada, setFechaDesdeAplicada] = useState('')
  const [fechaHastaAplicada, setFechaHastaAplicada] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { get } = useApiCall({ throwOnError: true, showErrorToast: false, retries: 1, timeoutMs: 15000 })
  const { ventasTiempo, deudasClientes, deudasProveedores, ventasCategoria, kpisVisuales } = analyticsData

  const cargarDatos = useCallback(async () => {
    setIsRefreshing(true)
    try {
      setError(null)
      const fechaQuery = fechaDesdeAplicada || fechaHastaAplicada
        ? `fecha_desde=${encodeURIComponent(fechaDesdeAplicada)}&fecha_hasta=${encodeURIComponent(fechaHastaAplicada)}`
        : `periodo=${encodeURIComponent(periodo)}`

      const [
        ventasResponse,
        deudasClientesResponse,
        deudasProveedoresResponse,
        ventasCategoriaResponse,
        kpisResponse
      ] = await Promise.allSettled([
        get(`/api/analytics/ventas-tiempo?${fechaQuery}`),
        get('/api/analytics/deudas-clientes'),
        get('/api/analytics/deudas-proveedores'),
        get('/api/analytics/ventas-categoria'),
        get('/api/analytics/kpis-visuales')
      ])

      const unwrap = (result: PromiseSettledResult<any>) =>
        result.status === 'fulfilled' && result.value?.success ? result.value.data ?? null : null

      const nextData: AnalyticsData = {
        ventasTiempo: unwrap(ventasResponse),
        deudasClientes: unwrap(deudasClientesResponse),
        deudasProveedores: unwrap(deudasProveedoresResponse),
        ventasCategoria: unwrap(ventasCategoriaResponse),
        kpisVisuales: unwrap(kpisResponse),
      }

      setAnalyticsData(nextData)
      setHasLoaded(true)
      cacheAnalytics(nextData)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Error cargando analytics')
      setHasLoaded(true)
    } finally {
      setIsRefreshing(false)
    }
  }, [get, periodo, fechaDesdeAplicada, fechaHastaAplicada])

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  const exportarCsv = () => {
    const filas = [
      ['metrica', 'valor'],
      ['ventas_actuales', analyticsData.ventasTiempo?.totales?.ventasActuales ?? 0],
      ['ventas_periodo_anterior', ventasTiempo?.totales?.ventasAnterior ?? 0],
      ['cxc_total', deudasClientes?.totales?.totalPorCobrar ?? 0],
      ['cxc_vencido', deudasClientes?.totales?.vencido ?? 0],
      ['cxp_total', deudasProveedores?.totales?.totalPorPagar ?? 0],
      ['cxp_vencido', deudasProveedores?.totales?.vencido ?? 0],
      ['liquidez', kpisVisuales?.liquidez?.valor ?? 0],
      ['rentabilidad', kpisVisuales?.rentabilidad?.valor ?? 0],
    ]
    const csv = filas.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `analytics_${fechaDesdeAplicada || periodo}_${fechaHastaAplicada || 'actual'}.csv`
    link.className = 'hidden'
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  const aplicarFiltrosFecha = () => {
    const desde = fechaDesde.trim()
    const hasta = fechaHasta.trim()
    const fechaValida = (value: string) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value)

    if (!fechaValida(desde) || !fechaValida(hasta)) {
      setError('Fecha inválida. Usa el formato YYYY-MM-DD.')
      return
    }

    setError(null)
    setFechaDesdeAplicada(desde)
    setFechaHastaAplicada(hasta)
  }

  const limpiarFiltrosFecha = () => {
    setFechaDesde('')
    setFechaHasta('')
    setFechaDesdeAplicada('')
    setFechaHastaAplicada('')
  }

  return (
    <PageShell
      title="Analytics Financiero"
      description="Indicadores gerenciales, cuentas por cobrar, cuentas por pagar y tendencias del periodo."
      actions={
        <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center">
          <select
            value={periodo}
            onChange={(e) => {
              setPeriodo(e.target.value)
              setFechaDesdeAplicada('')
              setFechaHastaAplicada('')
            }}
            className="h-10 rounded-md border border-cyan-400/20 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none group-data-[erp-theme=light]/dashboard:border-slate-200 group-data-[erp-theme=light]/dashboard:bg-white group-data-[erp-theme=light]/dashboard:text-slate-950"
          >
            <option value="semanal">Semanal</option>
            <option value="mensual">Mensual</option>
            <option value="trimestral">Trimestral</option>
            <option value="anual">Anual</option>
          </select>
          <Input
            type="text"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
            placeholder="YYYY-MM-DD"
            maxLength={10}
            aria-label="Fecha desde"
            className={`md:w-32 ${analyticsInputClass}`}
          />
          <Input
            type="text"
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
            placeholder="YYYY-MM-DD"
            maxLength={10}
            aria-label="Fecha hasta"
            className={`md:w-32 ${analyticsInputClass}`}
          />
          <Button onClick={aplicarFiltrosFecha}>
            Aplicar
          </Button>
          <Button variant="secondary" onClick={limpiarFiltrosFecha}>
            Limpiar
          </Button>
          <Button onClick={exportarCsv}>
            Exportar CSV
          </Button>
        </div>
      }
    >

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!hasLoaded && !kpisVisuales ? (
        <KpiLoadingState />
      ) : kpisVisuales ? (
        <Card className={analyticsCard}>
          <CardHeader>
            <CardTitle className="text-white group-data-[erp-theme=light]/dashboard:text-slate-950">
              Indicadores clave de rendimiento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <KPIGauge data={kpisVisuales?.liquidez} title="Liquidez" />
              <KPIGauge data={kpisVisuales?.rentabilidad} title="Rentabilidad" />
              <KPIGauge data={kpisVisuales?.crecimiento} title="Crecimiento" />
              <div className={`${mutedPanel} p-6 text-center`}>
                <h4 className="mb-4 text-sm font-semibold text-white group-data-[erp-theme=light]/dashboard:text-slate-950">Eficiencia</h4>
                {kpisVisuales?.eficiencia?.rotacionInventario !== undefined ? (
                  <>
                    <div className="mb-2 text-xl font-bold text-cyan-300 group-data-[erp-theme=light]/dashboard:text-blue-700">
                      {kpisVisuales.eficiencia.rotacionInventario.toFixed(1)}x
                    </div>
                    <div className="text-xs text-slate-400 group-data-[erp-theme=light]/dashboard:text-slate-500">
                      Rotación de Inventario
                    </div>
                  </>
                ) : (
                  <div className="mb-4 text-sm text-slate-400 group-data-[erp-theme=light]/dashboard:text-slate-500">
                    Sin datos de rotación
                  </div>
                )}

                {kpisVisuales?.eficiencia?.cicloEfectivo !== undefined ? (
                  <>
                    <div className="mt-2 text-base font-semibold text-cyan-300 group-data-[erp-theme=light]/dashboard:text-cyan-700">
                      {kpisVisuales.eficiencia.cicloEfectivo.toFixed(0)} días
                    </div>
                    <div className="text-xs text-slate-400 group-data-[erp-theme=light]/dashboard:text-slate-500">
                      Ciclo de Efectivo
                    </div>
                  </>
                ) : (
                  <div className="mt-2 text-sm text-slate-400 group-data-[erp-theme=light]/dashboard:text-slate-500">
                    Sin datos de ciclo
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {/* Ventas en el Tiempo */}
        <Card className={analyticsCard}>
          <CardContent className="p-6">
          {!hasLoaded ? (
            <ChartLoadingState label="Evolución de ventas" />
          ) : (
            <BarChart
              data={ventasTiempo ? {
                labels: ventasTiempo.labels,
                data: ventasTiempo.datasets?.[0]?.data || []
              } : null}
              title="Evolución de ventas"
              color="#38bdf8"
            />
          )}
          {ventasTiempo?.totales && (
            <div className="mt-4 rounded-2xl border border-cyan-400/10 bg-slate-900/60 p-4 text-sm group-data-[erp-theme=light]/dashboard:bg-slate-50">
              <div className="flex justify-between">
                <span>Ventas Actuales:</span>
                <span className="font-semibold text-blue-600">
                  S/ {ventasTiempo.totales.ventasActuales.toLocaleString()}
                </span>
              </div>
              <div className="mt-2 flex justify-between">
                <span>Crecimiento:</span>
                <span className="font-semibold text-cyan-300 group-data-[erp-theme=light]/dashboard:text-cyan-700">
                  {ventasTiempo.totales.crecimiento}
                </span>
              </div>
            </div>
          )}
          </CardContent>
        </Card>

        {/* Ventas por Categoría */}
        <Card className={analyticsCard}>
          <CardContent className="p-6">
          {!hasLoaded ? (
            <ChartLoadingState label="Ventas por categoría" />
          ) : (
            <PieChart
              data={ventasCategoria?.graficoPie}
              title="Ventas por categoría"
            />
          )}
          </CardContent>
        </Card>

        {/* Deudas de Clientes */}
        <Card className={analyticsCard}>
          <CardContent className="p-6">
          <h3 className="mb-6 text-center text-sm font-semibold text-white group-data-[erp-theme=light]/dashboard:text-slate-950">
            Análisis de cuentas por cobrar
          </h3>
          {!hasLoaded ? (
            <ChartLoadingState label="Cuentas por cobrar" />
          ) : deudasClientes?.graficoEdadSaldos ? (
            <BarChart
              data={{
                labels: deudasClientes.graficoEdadSaldos.labels || [],
                data: deudasClientes.graficoEdadSaldos.data || []
              }}
              title=""
              color="#22d3ee"
            />
          ) : null}
          {deudasClientes?.totales && (
            <div className="mt-4 rounded-2xl border border-cyan-400/10 bg-slate-900/60 p-4 text-sm group-data-[erp-theme=light]/dashboard:bg-slate-50">
              <div className="flex justify-between">
                <span>Total por Cobrar:</span>
                <span className="font-semibold text-cyan-300 group-data-[erp-theme=light]/dashboard:text-cyan-700">
                  S/ {deudasClientes.totales.totalPorCobrar.toLocaleString()}
                </span>
              </div>
              <div className="mt-2 flex justify-between">
                <span>Vencido:</span>
                <span className="font-semibold text-cyan-300 group-data-[erp-theme=light]/dashboard:text-blue-700">
                  S/ {deudasClientes.totales.vencido.toLocaleString()}
                  ({deudasClientes.totales.porcentajeVencido.toFixed(1)}%)
                </span>
              </div>
            </div>
          )}
          </CardContent>
        </Card>

        {/* Deudas a Proveedores */}
        <Card className={analyticsCard}>
          <CardContent className="p-6">
          <h3 className="mb-6 text-center text-sm font-semibold text-white group-data-[erp-theme=light]/dashboard:text-slate-950">
            Análisis de cuentas por pagar
          </h3>
          {!hasLoaded ? (
            <ChartLoadingState label="Cuentas por pagar" />
          ) : deudasProveedores?.graficoEdadSaldos ? (
            <BarChart
              data={{
                labels: deudasProveedores.graficoEdadSaldos.labels || [],
                data: deudasProveedores.graficoEdadSaldos.data || []
              }}
              title=""
              color="#2563eb"
            />
          ) : null}
          {deudasProveedores?.totales && (
            <div className="mt-4 rounded-2xl border border-cyan-400/10 bg-slate-900/60 p-4 text-sm group-data-[erp-theme=light]/dashboard:bg-slate-50">
              <div className="flex justify-between">
                <span>Total por Pagar:</span>
                <span className="font-semibold text-cyan-300 group-data-[erp-theme=light]/dashboard:text-cyan-700">
                  S/ {deudasProveedores.totales.totalPorPagar.toLocaleString()}
                </span>
              </div>
              <div className="mt-2 flex justify-between">
                <span>Vencido:</span>
                <span className="font-semibold text-cyan-300 group-data-[erp-theme=light]/dashboard:text-blue-700">
                  S/ {deudasProveedores.totales.vencido.toLocaleString()}
                  ({deudasProveedores.totales.porcentajeVencido.toFixed(1)}%)
                </span>
              </div>
            </div>
          )}
          </CardContent>
        </Card>
      </div>

      {/* Análisis Explicativo */}
      <Card className={analyticsCard}>
        <CardHeader>
          <CardTitle className="text-white group-data-[erp-theme=light]/dashboard:text-slate-950">
            Análisis inteligente para empresarios
          </CardTitle>
        </CardHeader>
        <CardContent>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className={`${mutedPanel} p-6`}>
            <h3 className="mb-4 flex items-center text-base font-semibold text-white group-data-[erp-theme=light]/dashboard:text-slate-950">
              Lectura ejecutiva
            </h3>
            <ul className="space-y-2 text-sm leading-6 text-slate-300 group-data-[erp-theme=light]/dashboard:text-slate-600">
              <li><strong>Liquidez:</strong> Tu capacidad de pagar deudas inmediatas</li>
              <li><strong>Cuentas por Cobrar:</strong> Dinero que te deben los clientes</li>
              <li><strong>Cuentas por Pagar:</strong> Dinero que debes a proveedores</li>
              <li><strong>Ciclo de Efectivo:</strong> Tiempo para convertir inventario en dinero</li>
            </ul>
          </div>

          <div className={`${mutedPanel} p-6`}>
            <h3 className="mb-4 flex items-center text-base font-semibold text-white group-data-[erp-theme=light]/dashboard:text-slate-950">
              Recomendaciones
            </h3>
            <ul className="space-y-2 text-sm leading-6 text-slate-300 group-data-[erp-theme=light]/dashboard:text-slate-600">
              <li>Mantén al menos 3 meses de gastos en efectivo</li>
              <li>Cobra a clientes en máximo 30 días</li>
              <li>Rota inventario al menos 6 veces al año</li>
              <li>Mantén margen de utilidad sobre 15%</li>
            </ul>
          </div>

          <div className={`${mutedPanel} p-6`}>
            <h3 className="mb-4 flex items-center text-base font-semibold text-white group-data-[erp-theme=light]/dashboard:text-slate-950">
              Senales de alerta
            </h3>
            <ul className="space-y-2 text-sm leading-6 text-slate-300 group-data-[erp-theme=light]/dashboard:text-slate-600">
              <li>Liquidez por debajo de 1.0 (crítico)</li>
              <li>Más del 20% de cuentas vencidas</li>
              <li>Inventario sin movimiento mayor a 90 días</li>
              <li>Gastos mayores a ingresos por 2+ meses</li>
            </ul>
          </div>
        </div>
        </CardContent>
      </Card>
    </PageShell>
  )
}
