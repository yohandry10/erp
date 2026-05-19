'use client'

import type { ReactNode } from 'react'
import { useEffect, useState, useCallback } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  CheckCircle,
  Clock,
  DollarSign,
  Download,
  FileSpreadsheet,
  FileText,
  Package,
  RefreshCw,
  ShoppingCart,
  Target,
  TrendingDown,
  TrendingUp,
  Truck,
  Zap,
} from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/erp/empty-state'
import { StatusBadge } from '@/components/erp/status-badge'
import { useApiCall } from '@/hooks/use-api'
import { useCountryContext } from '@/hooks/use-country-context'
import { useConfigurationStatus } from './hooks/useConfigurationStatus'
import { ConfigurationBanner } from './components/ConfigurationBanner'
import { ConfigurationModal } from './components/ConfigurationModal'
import { DashboardNotificationBanners } from '@/components/notifications'

interface DashboardStats {
  totalCpe: number
  totalGre: number
  totalSire: number
  totalUsers: number
  totalInventario: number
  totalCompras: number
  totalCotizaciones: number
  ventasMes: number
  ventasHoy: number
  comprasMes: number
  valorInventario: number
  productosConStockBajo: number
  cotizacionesPendientes: number
  ordenesCompraPendientes: number
  movimientosHoy: number
  tasaConversionCotizaciones: number
  crecimientoVentas: number
  ultimaActualizacion?: string
  periodoCalculado?: {
    inicio: string
    fin: string
  }
}

interface RecentActivity {
  id: string
  type: 'CPE' | 'GRE' | 'COMPRA' | 'COTIZACION' | 'VENTA'
  description: string
  amount?: number
  date: string
  status: 'success' | 'warning' | 'error' | 'pending'
}

const formatNumber = (value: number | undefined) =>
  Number(value ?? 0).toLocaleString('es-PE')

const formatCurrency = (value: number | undefined, currencySymbol: string) =>
  `${currencySymbol} ${Number(value ?? 0).toLocaleString('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

const DEFAULT_DASHBOARD_STATS: DashboardStats = {
  totalCpe: 0,
  totalGre: 0,
  totalSire: 0,
  totalUsers: 0,
  totalInventario: 0,
  totalCompras: 0,
  totalCotizaciones: 0,
  ventasMes: 0,
  ventasHoy: 0,
  comprasMes: 0,
  valorInventario: 0,
  productosConStockBajo: 0,
  cotizacionesPendientes: 0,
  ordenesCompraPendientes: 0,
  movimientosHoy: 0,
  tasaConversionCotizaciones: 0,
  crecimientoVentas: 0,
}

const trendHeightClasses = [
  'h-[32%]',
  'h-[46%]',
  'h-[38%]',
  'h-[56%]',
  'h-[52%]',
  'h-[68%]',
  'h-[61%]',
  'h-[78%]',
  'h-[72%]',
  'h-[88%]',
]

const barHeightClasses = [
  'h-2',
  'h-[16%]',
  'h-[24%]',
  'h-[32%]',
  'h-[40%]',
  'h-[48%]',
  'h-[56%]',
  'h-[64%]',
  'h-[72%]',
  'h-[84%]',
  'h-[96%]',
]

const progressWidthClasses = [
  'w-0',
  'w-[12%]',
  'w-[20%]',
  'w-[30%]',
  'w-[40%]',
  'w-[50%]',
  'w-[60%]',
  'w-[70%]',
  'w-[80%]',
  'w-[90%]',
  'w-full',
]

const getBucketClass = (value: number, maxValue: number, classes: string[]) => {
  if (value <= 0 || maxValue <= 0) {
    return classes[0]
  }

  const bucket = Math.max(1, Math.min(classes.length - 1, Math.ceil((value / maxValue) * (classes.length - 1))))
  return classes[bucket]
}

function getActivityIcon(type: RecentActivity['type']) {
  switch (type) {
    case 'VENTA':
      return <DollarSign className="h-4 w-4 text-emerald-600" />
    case 'COMPRA':
      return <ShoppingCart className="h-4 w-4 text-blue-600" />
    case 'CPE':
      return <FileText className="h-4 w-4 text-purple-600" />
    case 'GRE':
      return <Truck className="h-4 w-4 text-orange-600" />
    case 'COTIZACION':
      return <FileSpreadsheet className="h-4 w-4 text-indigo-600" />
    default:
      return <Activity className="h-4 w-4 text-slate-600" />
  }
}

function getStatusTone(status: RecentActivity['status']) {
  switch (status) {
    case 'success':
      return 'success'
    case 'warning':
      return 'warning'
    case 'error':
      return 'danger'
    case 'pending':
    default:
      return 'neutral'
  }
}

function getStatusLabel(status: RecentActivity['status']) {
  switch (status) {
    case 'success':
      return 'Completado'
    case 'warning':
      return 'Alerta'
    case 'error':
      return 'Error'
    case 'pending':
    default:
      return 'Pendiente'
  }
}

const kpiToneClasses = {
  cyan: {
    card: 'border-cyan-400/20 from-cyan-500/15 via-slate-950/80 to-slate-950',
    icon: 'border-cyan-300/30 bg-cyan-400/15 text-cyan-200 shadow-cyan-500/20',
    value: 'text-cyan-50',
    glow: 'from-cyan-400/80 to-blue-500/80',
  },
  violet: {
    card: 'border-violet-400/20 from-violet-500/15 via-slate-950/80 to-slate-950',
    icon: 'border-violet-300/30 bg-violet-400/15 text-violet-200 shadow-violet-500/20',
    value: 'text-violet-50',
    glow: 'from-violet-400/80 to-fuchsia-500/80',
  },
  emerald: {
    card: 'border-emerald-400/20 from-emerald-500/15 via-slate-950/80 to-slate-950',
    icon: 'border-emerald-300/30 bg-emerald-400/15 text-emerald-200 shadow-emerald-500/20',
    value: 'text-emerald-50',
    glow: 'from-emerald-400/80 to-teal-500/80',
  },
  amber: {
    card: 'border-amber-400/20 from-amber-500/15 via-slate-950/80 to-slate-950',
    icon: 'border-amber-300/30 bg-amber-400/15 text-amber-200 shadow-amber-500/20',
    value: 'text-amber-50',
    glow: 'from-amber-400/80 to-orange-500/80',
  },
  rose: {
    card: 'border-rose-400/20 from-rose-500/15 via-slate-950/80 to-slate-950',
    icon: 'border-rose-300/30 bg-rose-400/15 text-rose-200 shadow-rose-500/20',
    value: 'text-rose-50',
    glow: 'from-rose-400/80 to-red-500/80',
  },
}

function MiniTrend({ tone }: { tone: keyof typeof kpiToneClasses }) {
  const toneClass = kpiToneClasses[tone]

  return (
    <div className="mt-5 flex h-12 items-end gap-1">
      {trendHeightClasses.map((heightClass, index) => (
        <span
          key={`${tone}-${index}`}
          className={`flex-1 rounded-t-sm bg-gradient-to-t ${toneClass.glow} ${heightClass} opacity-60 shadow-sm`}
        />
      ))}
    </div>
  )
}

function ExecutiveKpiCard({
  title,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  title: string
  value: ReactNode
  detail: ReactNode
  icon: typeof DollarSign
  tone: keyof typeof kpiToneClasses
}) {
  const toneClass = kpiToneClasses[tone]

  return (
    <article className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br p-5 shadow-2xl ${toneClass.card}`}>
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-slate-400">{title}</p>
          <div className={`mt-3 text-2xl font-bold tracking-tight md:text-3xl ${toneClass.value}`}>{value}</div>
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">{detail}</div>
        </div>
        <span className={`rounded-xl border p-3 shadow-lg ${toneClass.icon}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <MiniTrend tone={tone} />
    </article>
  )
}

function ExecutiveBarChart({
  title,
  subtitle,
  data,
  currencySymbol,
}: {
  title: string
  subtitle: string
  data: Array<{ label: string; value: number; tone: 'cyan' | 'violet' | 'emerald' | 'amber' | 'rose' }>
  currencySymbol: string
}) {
  const maxValue = Math.max(...data.map((item) => item.value), 1)
  const colorClass = {
    cyan: 'from-cyan-300 to-blue-500 shadow-cyan-500/30',
    violet: 'from-violet-300 to-fuchsia-500 shadow-violet-500/30',
    emerald: 'from-emerald-300 to-teal-500 shadow-emerald-500/30',
    amber: 'from-amber-300 to-orange-500 shadow-amber-500/30',
    rose: 'from-rose-300 to-red-500 shadow-rose-500/30',
  }

  return (
    <section className="rounded-3xl border border-cyan-400/20 bg-slate-950/85 p-5 shadow-2xl shadow-cyan-950/25 backdrop-blur-xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">{title}</h2>
          <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
        </div>
        <span className="rounded-xl border border-cyan-300/25 bg-cyan-300/10 p-3 text-cyan-100">
          <BarChart3 className="h-5 w-5" />
        </span>
      </div>
      <div className="flex h-72 items-end gap-4 border-b border-l border-slate-700/70 px-2 pb-4">
        {data.map((item) => (
          <div key={item.label} className="flex h-full flex-1 flex-col justify-end gap-3">
            <div className="flex flex-1 items-end">
              <div
                className={`w-full rounded-t-xl bg-gradient-to-t shadow-lg ${colorClass[item.tone]} ${getBucketClass(item.value, maxValue, barHeightClasses)}`}
                title={`${item.label}: ${formatCurrency(item.value, currencySymbol)}`}
              />
            </div>
            <div className="min-h-12 text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">{item.label}</p>
              <p className="mt-1 text-[0.7rem] text-slate-500">{formatCurrency(item.value, currencySymbol)}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function FiscalDonut({
  cpe,
  gre,
  sire,
  isPeru,
}: {
  cpe: number
  gre: number
  sire: number
  isPeru: boolean
}) {
  const segments = [
    { label: 'CPE', value: cpe, strokeClass: 'stroke-cyan-300', dotClass: 'bg-cyan-300', barClass: 'bg-cyan-300' },
    { label: 'GRE', value: gre, strokeClass: 'stroke-sky-400', dotClass: 'bg-sky-400', barClass: 'bg-sky-400' },
    ...(isPeru
      ? [{ label: 'SIRE', value: sire, strokeClass: 'stroke-blue-400', dotClass: 'bg-blue-400', barClass: 'bg-blue-400' }]
      : []),
  ]
  const total = Math.max(segments.reduce((sum, item) => sum + item.value, 0), 1)
  let offset = 25

  return (
    <section className="rounded-3xl border border-violet-400/20 bg-gradient-to-br from-violet-500/15 via-slate-950/90 to-slate-950 p-5 shadow-2xl shadow-violet-950/25">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Mix fiscal</h2>
          <p className="mt-1 text-sm text-slate-400">Documentos tributarios del periodo</p>
        </div>
        <span className="rounded-xl border border-violet-300/25 bg-violet-300/10 p-3 text-violet-100">
          <FileText className="h-5 w-5" />
        </span>
      </div>
      <div className="grid items-center gap-5 md:grid-cols-[220px_1fr]">
        <div className="relative mx-auto size-[220px]">
          <svg viewBox="0 0 120 120" className="-rotate-90">
            <circle cx="60" cy="60" r="42" fill="none" stroke="rgba(30,41,59,0.9)" strokeWidth="16" />
            {segments.map((segment) => {
              const dash = (segment.value / total) * 263.89
              const circle = (
                <circle
                  key={segment.label}
                  cx="60"
                  cy="60"
                  r="42"
                  fill="none"
                  className={segment.strokeClass}
                  strokeWidth="16"
                  strokeLinecap="round"
                  strokeDasharray={`${dash} 263.89`}
                  strokeDashoffset={offset}
                />
              )
              offset -= dash
              return circle
            })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Total</span>
            <span className="mt-1 text-3xl font-bold text-white">{formatNumber(total)}</span>
          </div>
        </div>
        <div className="space-y-3">
          {segments.map((segment) => (
            <div key={segment.label} className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`size-3 rounded-full ${segment.dotClass}`} />
                  <span className="font-medium text-slate-200">{segment.label}</span>
                </div>
                <span className="font-semibold text-white">{formatNumber(segment.value)}</span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800">
                <div className={`h-full rounded-full ${segment.barClass} ${getBucketClass(segment.value, total, progressWidthClasses)}`} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function ActivityDistribution({ activities }: { activities: RecentActivity[] }) {
  const counts = ['COMPRA', 'VENTA', 'CPE', 'GRE', 'COTIZACION'].map((type) => ({
    type,
    count: activities.filter((activity) => activity.type === type).length,
  }))
  const max = Math.max(...counts.map((item) => item.count), 1)

  return (
    <section className="rounded-3xl border border-slate-700/60 bg-slate-950/85 p-5 shadow-2xl shadow-slate-950/30">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Distribución operativa</h2>
          <p className="mt-1 text-sm text-slate-400">Actividad reciente por módulo</p>
        </div>
        <Activity className="h-5 w-5 text-cyan-200" />
      </div>
      <div className="space-y-4">
        {counts.map((item) => (
          <div key={item.type}>
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300">{item.type}</span>
              <span className="text-slate-500">{item.count}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-800">
              <div className={`h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-400 ${getBucketClass(item.count, max, progressWidthClasses)}`} />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export default function Dashboard() {
  const api = useApiCall({ throwOnError: true, timeoutMs: 30000 })
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<DashboardStats>(DEFAULT_DASHBOARD_STATS)
  const [activities, setActivities] = useState<RecentActivity[]>([])
  const [lastUpdate, setLastUpdate] = useState<string>('')
  const [showConfigModal, setShowConfigModal] = useState(false)
  const { status: configStatus, isLoading: isLoadingConfig } = useConfigurationStatus()
  const country = useCountryContext()
  const isPeru = country.paisCodigo === 'PE'
  const currencySymbol = country.simboloMoneda || 'S/'

  const fetchDashboardData = useCallback(async (showLoading = false) => {
    try {
      if (!showLoading) {
        setIsRefreshing(true)
      }

      setError(null)

      const [statsResult, activitiesResult] = await Promise.allSettled([
        api.get('/dashboard/stats'),
        api.get('/dashboard/activities'),
      ])

      if (statsResult.status === 'fulfilled' && statsResult.value?.success) {
        setStats({ ...DEFAULT_DASHBOARD_STATS, ...statsResult.value.data })
      } else {
        const reason =
          statsResult.status === 'rejected'
            ? statsResult.reason
            : statsResult.value?.message || 'Error al obtener estadísticas'
        setError(`No se pudieron actualizar las métricas: ${reason instanceof Error ? reason.message : String(reason)}`)
      }

      if (activitiesResult.status === 'fulfilled' && activitiesResult.value?.success) {
        setActivities(activitiesResult.value.data || [])
      } else {
        setActivities([])
      }

      setLastUpdate(new Date().toLocaleTimeString('es-PE'))
    } catch (err) {
      setError(`No se pudieron actualizar las métricas: ${err instanceof Error ? err.message : 'Error desconocido'}`)
    } finally {
      setIsRefreshing(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    fetchDashboardData(true)
  }, [fetchDashboardData])

  useEffect(() => {
    if (!isLoadingConfig && configStatus && !configStatus.isComplete) {
      const timer = setTimeout(() => {
        setShowConfigModal(true)
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [isLoadingConfig, configStatus])

  useEffect(() => {
    const interval = setInterval(() => {
      fetchDashboardData(false)
    }, 30000)

    return () => clearInterval(interval)
  }, [fetchDashboardData])

  const handleRefresh = () => fetchDashboardData(false)

  const alertasCriticas = Number(stats?.productosConStockBajo ?? 0) + Number(stats?.ordenesCompraPendientes ?? 0)
  const crecimiento = Number(stats?.crecimientoVentas ?? 0)
  const saludOperativa = Math.max(0, Math.min(100, 100 - alertasCriticas))
  const eficienciaFiscal = Number(stats?.totalCpe ?? 0) + Number(stats?.totalGre ?? 0) + Number(stats?.totalSire ?? 0)
  const stockRiskTone = alertasCriticas > 0 ? 'warning' : 'success'
  const financialChartData = [
    { label: 'Ventas mes', value: Number(stats?.ventasMes ?? 0), tone: 'cyan' as const },
    { label: 'Ventas hoy', value: Number(stats?.ventasHoy ?? 0), tone: 'emerald' as const },
    { label: 'Compras', value: Number(stats?.comprasMes ?? 0), tone: 'violet' as const },
    { label: 'Inventario', value: Number(stats?.valorInventario ?? 0), tone: 'amber' as const },
  ]

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#020817] p-4 text-slate-100 md:p-6">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.055)_1px,transparent_1px)] bg-[size:44px_44px]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(14,165,233,0.14),transparent_28%,rgba(168,85,247,0.10)_58%,transparent_78%)]" />
      <div className="relative mx-auto flex w-full max-w-[1720px] flex-col gap-5">
      {configStatus && !configStatus.isComplete && (
        <ConfigurationModal
          isOpen={showConfigModal}
          onClose={() => setShowConfigModal(false)}
          missingItems={configStatus.missingItems}
        />
      )}

      {configStatus && !configStatus.isComplete && (
        <ConfigurationBanner
          missingItems={configStatus.missingItems}
          completionPercentage={configStatus.completionPercentage}
        />
      )}

      <DashboardNotificationBanners />

      {error ? (
        <Alert variant="destructive" className="border-red-400/30 bg-red-950/50 text-red-50">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Dashboard sin sincronización completa</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <header className="relative overflow-hidden rounded-3xl border border-slate-700/60 bg-slate-950/80 px-5 py-5 shadow-2xl shadow-cyan-950/30 backdrop-blur-xl md:px-7">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-cyan-400/0 via-cyan-300/70 to-violet-400/0" />
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">
                ERP Command Center
              </span>
              <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs text-emerald-200">
                Datos reales del tenant
              </span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white md:text-5xl">
              Dashboard ejecutivo
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300 md:text-base">
              Visión operativa de ventas, compras, fiscal, logística, inventario y alertas críticas.
              {lastUpdate ? ` Última sincronización: ${lastUpdate}.` : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="border border-cyan-300/30 bg-cyan-400/15 text-cyan-50 shadow-lg shadow-cyan-950/40 hover:bg-cyan-300/25"
            >
              <RefreshCw className={isRefreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
              {isRefreshing ? 'Sincronizando...' : 'Actualizar'}
            </Button>
          </div>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
        <ExecutiveKpiCard
          title="Revenue operativo"
          value={formatCurrency(stats?.ventasMes, currencySymbol)}
          icon={DollarSign}
          tone="cyan"
          detail={
            <>
              {crecimiento >= 0 ? (
                <TrendingUp className="h-4 w-4 text-emerald-300" />
              ) : (
                <TrendingDown className="h-4 w-4 text-rose-300" />
              )}
              <span>{`${crecimiento > 0 ? '+' : ''}${crecimiento}% vs mes anterior`}</span>
            </>
          }
        />
        <ExecutiveKpiCard
          title="Compras del periodo"
          value={formatCurrency(stats?.comprasMes, currencySymbol)}
          icon={ShoppingCart}
          tone="violet"
          detail={
            <>
              <BarChart3 className="h-4 w-4 text-violet-300" />
              <span>Inversión registrada</span>
            </>
          }
        />
        <ExecutiveKpiCard
          title="Salud operativa"
          value={`${saludOperativa}%`}
          icon={Zap}
          tone={stockRiskTone === 'success' ? 'emerald' : 'amber'}
          detail={
            <>
              <AlertTriangle className={alertasCriticas > 0 ? 'h-4 w-4 text-amber-300' : 'h-4 w-4 text-emerald-300'} />
              <span>{alertasCriticas} alertas activas</span>
            </>
          }
        />
        <ExecutiveKpiCard
          title="Inventario total"
          value={formatNumber(stats?.totalInventario)}
          icon={Package}
          tone="emerald"
          detail="Productos con stock registrado"
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <ExecutiveBarChart
          title="Flujo financiero y operacional"
          subtitle="Comparación de ventas, compras e inventario valorizado con datos reales del dashboard."
          data={financialChartData}
          currencySymbol={currencySymbol}
        />

        <FiscalDonut
          cpe={Number(stats?.totalCpe ?? 0)}
          gre={Number(stats?.totalGre ?? 0)}
          sire={Number(stats?.totalSire ?? 0)}
          isPeru={isPeru}
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.72fr_0.88fr_0.7fr]">
        <ActivityDistribution activities={activities} />

        <div className="rounded-3xl border border-slate-700/60 bg-slate-950/80 p-5 shadow-2xl shadow-slate-950/40 backdrop-blur-xl">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">Timeline operacional</h2>
              <p className="mt-1 text-sm text-slate-400">Últimos eventos trazables</p>
            </div>
            <span className="inline-flex w-fit items-center rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs font-medium text-cyan-100">
              <Clock className="mr-1 h-3 w-3" />
              Live
            </span>
          </div>
          {activities.length > 0 ? (
            <div className="space-y-3">
              {activities.slice(0, 6).map((activity) => (
                <div key={activity.id} className="relative rounded-2xl border border-slate-700/70 bg-slate-900/55 p-3 pl-12">
                  <div className="absolute left-3 top-3 rounded-xl border border-slate-700 bg-slate-950 p-2">
                      {getActivityIcon(activity.type)}
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <p className="line-clamp-2 text-sm font-medium text-slate-100">{activity.description}</p>
                    <StatusBadge tone={getStatusTone(activity.status)} className="shrink-0">
                      {getStatusLabel(activity.status)}
                    </StatusBadge>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <span>
                      {new Date(activity.date).toLocaleDateString('es-PE', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {activity.amount ? <span>{formatCurrency(activity.amount, currencySymbol)}</span> : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Activity}
              title="No hay actividad reciente"
              description="Los eventos empresariales aparecerán aquí cuando se generen."
            />
          )}
        </div>

        <aside className="grid gap-5">
          <div className="rounded-3xl border border-violet-400/20 bg-gradient-to-br from-violet-500/15 via-slate-950/90 to-slate-950 p-5 shadow-2xl shadow-violet-950/30">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Radar ejecutivo</h2>
                <p className="mt-1 text-sm text-slate-400">Prioridades del día</p>
              </div>
              <span className="rounded-xl border border-violet-300/30 bg-violet-300/10 p-3 text-violet-100">
                <Target className="h-5 w-5" />
              </span>
            </div>
            <div className="space-y-3">
              <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-300">Conversión comercial</span>
                  <span className="font-semibold text-cyan-200">{Number(stats?.tasaConversionCotizaciones ?? 0).toFixed(1)}%</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                  <div className={`h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-400 ${getBucketClass(Number(stats?.tasaConversionCotizaciones ?? 0), 100, progressWidthClasses)}`} />
                </div>
              </div>
              <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-300">Documentos fiscales</span>
                  <span className="font-semibold text-emerald-200">{formatNumber(eficienciaFiscal)}</span>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-400">
                  CPE, GRE{isPeru ? ' y SIRE' : ''} consolidados en el periodo actual.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-300">Alertas críticas</span>
                  <span className={alertasCriticas > 0 ? 'font-semibold text-amber-200' : 'font-semibold text-emerald-200'}>
                    {alertasCriticas}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-400">
                  Stock bajo y órdenes pendientes listas para revisión.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-cyan-400/20 bg-slate-950/85 p-5 shadow-2xl shadow-cyan-950/20">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Módulos conectados</h2>
              <ArrowUpRight className="h-5 w-5 text-cyan-200" />
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
                <FileText className="mb-3 h-5 w-5 text-cyan-300" />
                <p className="text-slate-400">CPE</p>
                <p className="text-xl font-bold text-white">{formatNumber(stats?.totalCpe)}</p>
              </div>
              <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
                <Truck className="mb-3 h-5 w-5 text-orange-300" />
                <p className="text-slate-400">GRE</p>
                <p className="text-xl font-bold text-white">{formatNumber(stats?.totalGre)}</p>
              </div>
              {isPeru ? (
                <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
                  <Download className="mb-3 h-5 w-5 text-blue-300" />
                  <p className="text-slate-400">SIRE</p>
                  <p className="text-xl font-bold text-white">{formatNumber(stats?.totalSire)}</p>
                </div>
              ) : null}
              <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
                <CheckCircle className="mb-3 h-5 w-5 text-emerald-300" />
                <p className="text-slate-400">Usuarios</p>
                <p className="text-xl font-bold text-white">{formatNumber(stats?.totalUsers)}</p>
              </div>
            </div>
          </div>
        </aside>
      </section>

      {process.env.NODE_ENV === 'development' && stats && (
        <div className="rounded-2xl border border-slate-700/60 bg-slate-950/80 p-4 text-sm text-slate-400">
            <strong className="text-slate-100">Debug Info:</strong>
            <br />
            Período: {stats.periodoCalculado?.inicio} {'->'} {stats.periodoCalculado?.fin}
            <br />
            Última actualización:{' '}
            {stats.ultimaActualizacion ? new Date(stats.ultimaActualizacion).toLocaleString('es-PE') : 'N/A'}
            <br />
            Actividades: {activities.length} elementos
        </div>
      )}
      </div>
    </main>
  )
}
