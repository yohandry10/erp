'use client'

import { useState, useCallback, useEffect } from 'react'
import { useApiCall } from '@/hooks/use-api'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { PageShell } from '@/components/erp/page-shell'
import {
  AreaChart,
  Area,
  BarChart as RBarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
  PieChart as RPieChart,
  Pie,
} from 'recharts'
import {
  TrendingUp,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Minus,
  ArrowUpRight,
  ArrowDownRight,
  Lightbulb,
  Compass,
  ShieldAlert,
  Inbox,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
} from 'lucide-react'

// ============================================================================
// DESIGN TOKENS
// ============================================================================

const ANALYTICS_CACHE_KEY = 'erp-analytics-dashboard-snapshot'

const PALETTE = {
  primary: '#22d3ee',     // cyan-400 — ventas / cobrar
  secondary: '#a78bfa',   // violet-400 — comparativos
  positive: '#34d399',    // emerald-400 — favorable
  warning: '#fbbf24',     // amber-400
  critical: '#fb7185',    // rose-400 — pagar / vencido
  neutral: '#64748b',     // slate-500
}

const CATEGORY_PALETTE = ['#22d3ee', '#a78bfa', '#34d399', '#fbbf24', '#fb7185', '#60a5fa', '#f97316']

// Surface — dark gradient sutil + soporte light theme
const surface =
  'rounded-2xl border border-cyan-400/15 bg-gradient-to-br from-[#040c1c] via-[#020817] to-[#050d1f] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] group-data-[erp-theme=light]/dashboard:border-slate-200 group-data-[erp-theme=light]/dashboard:from-white group-data-[erp-theme=light]/dashboard:via-white group-data-[erp-theme=light]/dashboard:to-slate-50 group-data-[erp-theme=light]/dashboard:shadow-[0_1px_2px_rgba(15,23,42,0.05)]'

const eyebrow =
  'text-[0.65rem] font-medium uppercase tracking-[0.18em] text-slate-500 group-data-[erp-theme=light]/dashboard:text-slate-500'

const cardTitle =
  'text-base font-semibold tracking-tight text-slate-100 group-data-[erp-theme=light]/dashboard:text-slate-900'

const tabularNum = 'font-bold tabular-nums tracking-tight'

const inputClass =
  'h-10 min-w-0 rounded-md border border-cyan-400/20 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 group-data-[erp-theme=light]/dashboard:border-slate-200 group-data-[erp-theme=light]/dashboard:bg-white group-data-[erp-theme=light]/dashboard:text-slate-950 group-data-[erp-theme=light]/dashboard:placeholder:text-slate-400'

// ============================================================================
// TYPES & STORAGE
// ============================================================================

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
  Boolean(
    data.ventasTiempo ||
      data.deudasClientes ||
      data.deudasProveedores ||
      data.ventasCategoria ||
      data.kpisVisuales,
  )

const getCachedAnalytics = (): AnalyticsData => {
  if (typeof window === 'undefined') return EMPTY_ANALYTICS_DATA
  try {
    const raw = window.localStorage.getItem(ANALYTICS_CACHE_KEY)
    if (!raw) return EMPTY_ANALYTICS_DATA
    return { ...EMPTY_ANALYTICS_DATA, ...JSON.parse(raw) }
  } catch {
    return EMPTY_ANALYTICS_DATA
  }
}

const cacheAnalytics = (data: AnalyticsData) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(ANALYTICS_CACHE_KEY, JSON.stringify(data))
  } catch {
    /* ignore */
  }
}

// ============================================================================
// METRIC TILES (top KPI strip — reemplaza las gauges)
// ============================================================================

type Kpi = { valor?: number; objetivo?: number; estado?: string }

const estadoMeta = (estado?: string) => {
  const e = (estado || '').toUpperCase()
  if (e.includes('BUENO') || e.includes('OPTIMO') || e.includes('OK')) {
    return { tone: 'positive' as const, label: estado || 'Bueno', icon: CheckCircle2 }
  }
  if (e.includes('CRITIC') || e.includes('MAL') || e.includes('ALERT')) {
    return { tone: 'critical' as const, label: estado || 'Crítico', icon: AlertTriangle }
  }
  if (e.includes('REVISAR') || e.includes('MEDIO')) {
    return { tone: 'warning' as const, label: estado || 'Revisar', icon: Activity }
  }
  if (e.includes('SIN DATOS') || !estado) {
    return { tone: 'neutral' as const, label: estado || 'Sin datos', icon: Minus }
  }
  return { tone: 'neutral' as const, label: estado || 'Neutro', icon: Activity }
}

const toneClasses = {
  positive: {
    text: 'text-emerald-300 group-data-[erp-theme=light]/dashboard:text-emerald-700',
    bg: 'bg-emerald-400/10 group-data-[erp-theme=light]/dashboard:bg-emerald-50',
    border: 'border-emerald-400/30 group-data-[erp-theme=light]/dashboard:border-emerald-200',
    bar: 'bg-gradient-to-r from-emerald-400 to-emerald-500',
  },
  warning: {
    text: 'text-amber-300 group-data-[erp-theme=light]/dashboard:text-amber-700',
    bg: 'bg-amber-400/10 group-data-[erp-theme=light]/dashboard:bg-amber-50',
    border: 'border-amber-400/30 group-data-[erp-theme=light]/dashboard:border-amber-200',
    bar: 'bg-gradient-to-r from-amber-400 to-amber-500',
  },
  critical: {
    text: 'text-rose-300 group-data-[erp-theme=light]/dashboard:text-rose-700',
    bg: 'bg-rose-400/10 group-data-[erp-theme=light]/dashboard:bg-rose-50',
    border: 'border-rose-400/30 group-data-[erp-theme=light]/dashboard:border-rose-200',
    bar: 'bg-gradient-to-r from-rose-400 to-rose-500',
  },
  neutral: {
    text: 'text-slate-400 group-data-[erp-theme=light]/dashboard:text-slate-500',
    bg: 'bg-slate-400/10 group-data-[erp-theme=light]/dashboard:bg-slate-100',
    border: 'border-slate-400/20 group-data-[erp-theme=light]/dashboard:border-slate-300',
    bar: 'bg-gradient-to-r from-slate-500 to-slate-400',
  },
} as const

function MetricTile({
  label,
  data,
  format = 'decimal',
}: {
  label: string
  data?: Kpi
  format?: 'decimal' | 'percentage'
}) {
  const valor = Number(data?.valor ?? 0)
  const objetivo = Math.max(Number(data?.objetivo ?? 1), 0.0001)
  const pct = Math.min((valor / objetivo) * 100, 100)
  const meta = estadoMeta(data?.estado)
  const Icon = meta.icon
  const cls = toneClasses[meta.tone]
  const noData = !data || data.valor === undefined

  const formatNumber = (n: number) =>
    format === 'percentage' ? `${n.toFixed(1)}%` : n.toFixed(2)

  return (
    <div className={`${surface} flex h-full flex-col gap-3 p-5`}>
      <div className="flex items-start justify-between gap-2">
        <span className={eyebrow}>{label}</span>
        <span
          className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold ${cls.bg} ${cls.border} ${cls.text}`}
        >
          <Icon size={11} strokeWidth={2.5} />
          <span className="uppercase tracking-wider">{meta.label}</span>
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span
          className={`${tabularNum} text-4xl text-slate-50 group-data-[erp-theme=light]/dashboard:text-slate-950`}
        >
          {noData ? '—' : formatNumber(valor)}
        </span>
        {!noData && (
          <span className="text-xs text-slate-500 group-data-[erp-theme=light]/dashboard:text-slate-500">
            / {formatNumber(objetivo)}
          </span>
        )}
      </div>
      <div className="mt-auto flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-[0.7rem] text-slate-500 group-data-[erp-theme=light]/dashboard:text-slate-500">
          <span>Avance al objetivo</span>
          <span className={`${tabularNum} text-xs ${cls.text}`}>
            {noData ? '—' : `${pct.toFixed(0)}%`}
          </span>
        </div>
        <div className="relative h-1.5 overflow-hidden rounded-full bg-slate-800/80 group-data-[erp-theme=light]/dashboard:bg-slate-100">
          <span
            className={`absolute inset-y-0 left-0 ${cls.bar} transition-all duration-700 ease-out`}
            style={{ width: noData ? '0%' : `${pct}%` }}
          />
        </div>
      </div>
    </div>
  )
}

function EfficiencyTile({
  data,
}: {
  data?: { rotacionInventario?: number; cicloEfectivo?: number }
}) {
  const rotacion = data?.rotacionInventario
  const ciclo = data?.cicloEfectivo
  const hasData = rotacion !== undefined || ciclo !== undefined
  // Heurística: rotación ideal ~12x/año (mensual). Llenamos barra proporcional.
  const pct = rotacion !== undefined ? Math.min((rotacion / 12) * 100, 100) : 0

  return (
    <div className={`${surface} flex h-full flex-col gap-3 p-5`}>
      <div className="flex items-start justify-between gap-2">
        <span className={eyebrow}>Eficiencia operativa</span>
        <span className="flex items-center gap-1 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-cyan-300 group-data-[erp-theme=light]/dashboard:border-cyan-200 group-data-[erp-theme=light]/dashboard:bg-cyan-50 group-data-[erp-theme=light]/dashboard:text-cyan-700">
          <Activity size={11} strokeWidth={2.5} />
          Composite
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className={`${tabularNum} text-4xl text-slate-50 group-data-[erp-theme=light]/dashboard:text-slate-950`}>
          {rotacion !== undefined ? `${rotacion.toFixed(1)}x` : '—'}
        </span>
        <span className="text-xs text-slate-500 group-data-[erp-theme=light]/dashboard:text-slate-500">
          rotación / año
        </span>
      </div>
      <div className="mt-auto flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-[0.7rem] text-slate-500 group-data-[erp-theme=light]/dashboard:text-slate-500">
          <span>Ciclo de efectivo</span>
          <span className={`${tabularNum} text-xs text-violet-300 group-data-[erp-theme=light]/dashboard:text-violet-700`}>
            {ciclo !== undefined ? `${ciclo.toFixed(0)} días` : '—'}
          </span>
        </div>
        <div className="relative h-1.5 overflow-hidden rounded-full bg-slate-800/80 group-data-[erp-theme=light]/dashboard:bg-slate-100">
          <span
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-cyan-400 to-violet-400 transition-all duration-700 ease-out"
            style={{ width: hasData ? `${pct}%` : '0%' }}
          />
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// CHART EMPTY STATE — patrón estándar: SIN datos placeholder, SIN mocks.
// Cuando no hay datos reales, se muestra un estado vacío explícito en lugar
// de barras/curvas falsas que aparentan actividad.
// ============================================================================

function ChartEmptyState({
  height,
  icon: Icon,
  title,
  subtitle,
}: {
  height: number | string
  icon: any
  title: string
  subtitle?: string
}) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-2.5 rounded-xl border border-dashed border-cyan-400/15 bg-slate-950/30 px-6 text-center group-data-[erp-theme=light]/dashboard:border-cyan-200/70 group-data-[erp-theme=light]/dashboard:bg-cyan-50/30"
      style={{ height }}
    >
      <Icon
        size={26}
        strokeWidth={1.6}
        className="text-cyan-400/55 group-data-[erp-theme=light]/dashboard:text-cyan-600/70"
      />
      <p className="text-sm font-medium text-slate-300 group-data-[erp-theme=light]/dashboard:text-slate-700">
        {title}
      </p>
      {subtitle && (
        <p className="max-w-[36ch] text-xs leading-5 text-slate-500 group-data-[erp-theme=light]/dashboard:text-slate-500">
          {subtitle}
        </p>
      )}
    </div>
  )
}

// ============================================================================
// SALES EVOLUTION — area chart con stats integrados
// ============================================================================

function SalesEvolutionChart({
  data,
  totales,
}: {
  data?: { labels?: string[]; datasets?: any[] }
  totales?: any
}) {
  const labels = data?.labels || []
  const values: number[] = data?.datasets?.[0]?.data || []
  const hasReal = values.length > 0 && values.some((v) => Number(v) > 0)

  const series = labels.map((label: string, i: number) => ({
    label,
    value: Number(values[i]) || 0,
  }))

  const ventasActuales = Number(totales?.ventasActuales ?? 0)
  const ventasAnterior = Number(totales?.ventasAnterior ?? 0)
  const crecimiento = totales?.crecimiento ?? '—'

  return (
    <div className={`${surface} flex h-full flex-col gap-4 p-6`}>
      <header className="flex items-start justify-between gap-4">
        <div>
          <h3 className={cardTitle}>Evolución de ventas</h3>
          <p className="mt-1 text-xs text-slate-500 group-data-[erp-theme=light]/dashboard:text-slate-500">
            Tendencia del periodo vs. ciclo anterior
          </p>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatChip
          label="Ventas actuales"
          value={`S/ ${ventasActuales.toLocaleString('es-PE')}`}
          tone="cyan"
        />
        <StatChip
          label="Periodo anterior"
          value={`S/ ${ventasAnterior.toLocaleString('es-PE')}`}
          tone="violet"
        />
        <StatChip
          label="Crecimiento"
          value={String(crecimiento)}
          tone="emerald"
          icon={TrendingUp}
        />
      </div>

      {/* Estado vacío real: si no hay datos, mostramos contexto en vez de
          una curva falsa que aparente actividad inexistente. */}
      {hasReal ? (
        <div className="-mx-2 h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="evol-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={PALETTE.primary} stopOpacity={0.55} />
                  <stop offset="100%" stopColor={PALETTE.primary} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke="rgba(100,116,139,0.18)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: '#64748b', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: '#64748b', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={42}
                tickFormatter={(v: number) => v.toLocaleString('es-PE')}
              />
              <Tooltip
                cursor={{ stroke: PALETTE.primary, strokeWidth: 1, strokeDasharray: '3 3' }}
                contentStyle={{
                  background: 'rgba(2, 8, 23, 0.96)',
                  border: '1px solid rgba(34, 211, 238, 0.4)',
                  borderRadius: 12,
                  color: '#f8fafc',
                  fontSize: 12,
                }}
                formatter={(value: any) => [`S/ ${Number(value).toLocaleString('es-PE')}`, 'Ventas']}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={PALETTE.primary}
                strokeWidth={2.25}
                fill="url(#evol-grad)"
                dot={{ fill: PALETTE.primary, strokeWidth: 0, r: 2.5 }}
                activeDot={{ r: 5, fill: '#f8fafc', stroke: PALETTE.primary, strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <ChartEmptyState
          height={280}
          icon={LineChartIcon}
          title="Sin ventas registradas en el periodo"
          subtitle="La curva de evolución aparecerá automáticamente cuando comiences a registrar ventas."
        />
      )}
    </div>
  )
}

function StatChip({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string
  value: string
  tone: 'cyan' | 'violet' | 'emerald' | 'amber' | 'rose'
  icon?: any
}) {
  const map = {
    cyan: {
      border: 'border-cyan-400/20',
      text: 'text-cyan-300 group-data-[erp-theme=light]/dashboard:text-cyan-700',
    },
    violet: {
      border: 'border-violet-400/20',
      text: 'text-violet-300 group-data-[erp-theme=light]/dashboard:text-violet-700',
    },
    emerald: {
      border: 'border-emerald-400/20',
      text: 'text-emerald-300 group-data-[erp-theme=light]/dashboard:text-emerald-700',
    },
    amber: {
      border: 'border-amber-400/20',
      text: 'text-amber-300 group-data-[erp-theme=light]/dashboard:text-amber-700',
    },
    rose: {
      border: 'border-rose-400/20',
      text: 'text-rose-300 group-data-[erp-theme=light]/dashboard:text-rose-700',
    },
  }
  const cls = map[tone]
  return (
    <div className={`rounded-xl border ${cls.border} bg-slate-950/60 px-3.5 py-3 group-data-[erp-theme=light]/dashboard:bg-slate-50`}>
      <div className={eyebrow}>{label}</div>
      <div className={`${tabularNum} mt-1 flex items-center gap-1.5 text-lg ${cls.text}`}>
        {Icon ? <Icon size={16} strokeWidth={2.5} /> : null}
        {value}
      </div>
    </div>
  )
}

// ============================================================================
// CATEGORY RANK LIST — reemplaza el donut por barra horizontal rankeable
// ============================================================================

function CategoryRankList({ data }: { data?: { labels?: string[]; data?: number[] } }) {
  const rawLabels = data?.labels || []
  const rawValues = (data?.data || []).map((v: any) => Number(v) || 0)
  const total = rawValues.reduce((s: number, v: number) => s + v, 0)
  const hasReal = total > 0 && rawLabels.length > 0

  const ranked = rawLabels
    .map((label: string, i: number) => ({
      label,
      value: rawValues[i] ?? 0,
      pct: total > 0 ? (rawValues[i] / total) * 100 : 0,
      color: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length],
    }))
    .sort((a, b) => b.value - a.value)

  const donutData = ranked.map((r) => ({ name: r.label, value: r.value, color: r.color }))

  return (
    <div className={`${surface} flex h-full flex-col gap-4 p-6`}>
      <header className="flex items-start justify-between gap-2">
        <div>
          <h3 className={cardTitle}>Ventas por categoría</h3>
          <p className="mt-1 text-xs text-slate-500 group-data-[erp-theme=light]/dashboard:text-slate-500">
            Mix de ingresos rankeado por participación
          </p>
        </div>
      </header>

      {hasReal ? (
        <>
          <div className="relative mx-auto h-[180px] w-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <RPieChart>
                <Pie
                  data={donutData}
                  cx="50%"
                  cy="50%"
                  innerRadius={56}
                  outerRadius={84}
                  paddingAngle={3}
                  dataKey="value"
                  stroke="none"
                >
                  {donutData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: 'rgba(2, 8, 23, 0.96)',
                    border: '1px solid rgba(34, 211, 238, 0.4)',
                    borderRadius: 12,
                    color: '#f8fafc',
                    fontSize: 12,
                  }}
                  formatter={(value: any, name: any) => {
                    const pct = total > 0 ? ((Number(value) / total) * 100).toFixed(1) : '0.0'
                    return [`S/ ${Number(value).toLocaleString('es-PE')} · ${pct}%`, name]
                  }}
                />
              </RPieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className={eyebrow}>Total</span>
              <span
                className={`${tabularNum} mt-0.5 text-2xl text-slate-50 group-data-[erp-theme=light]/dashboard:text-slate-950`}
              >
                S/ {total.toLocaleString('es-PE')}
              </span>
            </div>
          </div>

          <ul className="flex flex-col gap-2">
            {ranked.map((item, idx) => (
              <li
                key={item.label}
                className="flex items-center justify-between gap-2 rounded-lg border border-cyan-400/10 bg-slate-950/40 px-2.5 py-1.5 group-data-[erp-theme=light]/dashboard:border-slate-200 group-data-[erp-theme=light]/dashboard:bg-slate-50"
              >
                <span className="flex min-w-0 items-center gap-2 text-sm">
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: item.color, boxShadow: `0 0 10px ${item.color}88` }}
                  />
                  <span className="truncate font-medium text-slate-200 group-data-[erp-theme=light]/dashboard:text-slate-800">
                    {item.label}
                  </span>
                  <span className={`${eyebrow} shrink-0 tabular-nums`}>#{idx + 1}</span>
                </span>
                <span className="flex shrink-0 items-baseline gap-1.5 tabular-nums">
                  <span
                    className={`${tabularNum} text-sm text-slate-50 group-data-[erp-theme=light]/dashboard:text-slate-950`}
                  >
                    {item.pct.toFixed(1)}%
                  </span>
                  <span className="text-[0.7rem] text-slate-500 group-data-[erp-theme=light]/dashboard:text-slate-500">
                    S/ {item.value.toLocaleString('es-PE')}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <ChartEmptyState
          height={300}
          icon={PieChartIcon}
          title="Sin ventas por categoría"
          subtitle="El mix de ingresos se rankea automáticamente cuando registras facturas con categorías."
        />
      )}
    </div>
  )
}

// ============================================================================
// AGING COMPOSITE — un solo chart con AR vs AP agrupado + summary tiles
// ============================================================================

function AgingComposite({
  deudasClientes,
  deudasProveedores,
}: {
  deudasClientes?: any
  deudasProveedores?: any
}) {
  const arData = deudasClientes?.graficoEdadSaldos
  const apData = deudasProveedores?.graficoEdadSaldos
  const labels: string[] = (arData?.labels?.length
    ? arData.labels
    : apData?.labels?.length
      ? apData.labels
      : ['0-30 días', '31-60 días', '61-90 días', '90+ días']) as string[]
  const arValues: number[] = arData?.data || []
  const apValues: number[] = apData?.data || []
  const hasRealAR = arValues.some((v: any) => Number(v) > 0)
  const hasRealAP = apValues.some((v: any) => Number(v) > 0)
  const hasReal = hasRealAR || hasRealAP

  const chartData = labels.map((label: string, i: number) => ({
    label,
    cobrar: Number(arValues[i] || 0),
    pagar: Number(apValues[i] || 0),
  }))

  const totalAR = Number(deudasClientes?.totales?.totalPorCobrar ?? 0)
  const venAR = Number(deudasClientes?.totales?.vencido ?? 0)
  const pctVenAR = Number(deudasClientes?.totales?.porcentajeVencido ?? 0)
  const totalAP = Number(deudasProveedores?.totales?.totalPorPagar ?? 0)
  const venAP = Number(deudasProveedores?.totales?.vencido ?? 0)
  const pctVenAP = Number(deudasProveedores?.totales?.porcentajeVencido ?? 0)
  const cashGap = totalAR - totalAP

  return (
    <div className={`${surface} flex h-full flex-col gap-5 p-6`}>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className={cardTitle}>Maduración de cuentas (CxC vs CxP)</h3>
          <p className="mt-1 text-xs text-slate-500 group-data-[erp-theme=light]/dashboard:text-slate-500">
            Edad de saldos por tramo, con diferencial neto de caja
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-400 group-data-[erp-theme=light]/dashboard:text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-cyan-400" />
            Por cobrar
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-rose-400" />
            Por pagar
          </span>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryStat
          label="Por cobrar (total)"
          value={`S/ ${totalAR.toLocaleString('es-PE')}`}
          sublabel={`Vencido: S/ ${venAR.toLocaleString('es-PE')} (${pctVenAR.toFixed(1)}%)`}
          tone="cyan"
        />
        <SummaryStat
          label="Por pagar (total)"
          value={`S/ ${totalAP.toLocaleString('es-PE')}`}
          sublabel={`Vencido: S/ ${venAP.toLocaleString('es-PE')} (${pctVenAP.toFixed(1)}%)`}
          tone="rose"
        />
        <SummaryStat
          label="Diferencial neto"
          value={`${cashGap >= 0 ? '+' : '−'}S/ ${Math.abs(cashGap).toLocaleString('es-PE')}`}
          sublabel={cashGap >= 0 ? 'Posición favorable' : 'Posición deficitaria'}
          tone={cashGap >= 0 ? 'emerald' : 'amber'}
          icon={cashGap >= 0 ? ArrowUpRight : ArrowDownRight}
        />
      </div>

      {hasReal ? (
        <div className="-mx-2 h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <RBarChart
              data={chartData}
              margin={{ top: 12, right: 12, left: 0, bottom: 0 }}
              barCategoryGap="22%"
            >
              <defs>
                <linearGradient id="bar-ar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22d3ee" stopOpacity={1} />
                  <stop offset="100%" stopColor="#0891b2" stopOpacity={0.9} />
                </linearGradient>
                <linearGradient id="bar-ap" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fb7185" stopOpacity={1} />
                  <stop offset="100%" stopColor="#be123c" stopOpacity={0.9} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke="rgba(100,116,139,0.18)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: '#64748b', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#64748b', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={52}
                tickFormatter={(v: number) => v.toLocaleString('es-PE')}
              />
              <Tooltip
                cursor={{ fill: 'rgba(59,130,246,0.06)' }}
                contentStyle={{
                  background: 'rgba(2, 8, 23, 0.96)',
                  border: '1px solid rgba(56, 189, 248, 0.35)',
                  borderRadius: 12,
                  color: '#f8fafc',
                  fontSize: 12,
                }}
                formatter={(value: any, name: any) => {
                  const lbl = name === 'cobrar' ? 'Por cobrar' : 'Por pagar'
                  return [`S/ ${Number(value).toLocaleString('es-PE')}`, lbl]
                }}
              />
              <Bar dataKey="cobrar" fill="url(#bar-ar)" radius={[6, 6, 0, 0]} />
              <Bar dataKey="pagar" fill="url(#bar-ap)" radius={[6, 6, 0, 0]} />
            </RBarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <ChartEmptyState
          height={300}
          icon={Inbox}
          title="Sin saldos pendientes de clientes ni proveedores"
          subtitle="Cuando emitas facturas con crédito o registres compras a plazo, el gráfico mostrará la maduración por tramos."
        />
      )}
    </div>
  )
}

function SummaryStat({
  label,
  value,
  sublabel,
  tone,
  icon: Icon,
}: {
  label: string
  value: string
  sublabel: string
  tone: 'cyan' | 'rose' | 'emerald' | 'amber'
  icon?: any
}) {
  const map = {
    cyan: {
      border: 'border-cyan-400/20',
      text: 'text-cyan-300 group-data-[erp-theme=light]/dashboard:text-cyan-700',
    },
    rose: {
      border: 'border-rose-400/20',
      text: 'text-rose-300 group-data-[erp-theme=light]/dashboard:text-rose-700',
    },
    emerald: {
      border: 'border-emerald-400/20',
      text: 'text-emerald-300 group-data-[erp-theme=light]/dashboard:text-emerald-700',
    },
    amber: {
      border: 'border-amber-400/20',
      text: 'text-amber-300 group-data-[erp-theme=light]/dashboard:text-amber-700',
    },
  }
  const cls = map[tone]
  return (
    <div
      className={`rounded-xl border ${cls.border} bg-slate-950/60 px-4 py-3 group-data-[erp-theme=light]/dashboard:bg-slate-50`}
    >
      <div className={eyebrow}>{label}</div>
      <div className={`${tabularNum} mt-1 flex items-center gap-1.5 text-xl ${cls.text}`}>
        {Icon ? <Icon size={16} strokeWidth={2.5} /> : null}
        {value}
      </div>
      <div className="mt-1 text-[0.7rem] text-slate-500 group-data-[erp-theme=light]/dashboard:text-slate-500">
        {sublabel}
      </div>
    </div>
  )
}

// ============================================================================
// INSIGHTS FOOTER (ref reference cards, mejor jerarquía)
// ============================================================================

function InsightCard({
  title,
  icon: Icon,
  accent,
  items,
}: {
  title: string
  icon: any
  accent: 'cyan' | 'emerald' | 'rose'
  items: { strong?: string; text: string }[]
}) {
  const accentMap = {
    cyan: 'text-cyan-300 group-data-[erp-theme=light]/dashboard:text-cyan-700 bg-cyan-400/10 border-cyan-400/20 group-data-[erp-theme=light]/dashboard:bg-cyan-50 group-data-[erp-theme=light]/dashboard:border-cyan-200',
    emerald: 'text-emerald-300 group-data-[erp-theme=light]/dashboard:text-emerald-700 bg-emerald-400/10 border-emerald-400/20 group-data-[erp-theme=light]/dashboard:bg-emerald-50 group-data-[erp-theme=light]/dashboard:border-emerald-200',
    rose: 'text-rose-300 group-data-[erp-theme=light]/dashboard:text-rose-700 bg-rose-400/10 border-rose-400/20 group-data-[erp-theme=light]/dashboard:bg-rose-50 group-data-[erp-theme=light]/dashboard:border-rose-200',
  }
  return (
    <div className={`${surface} flex h-full flex-col gap-4 p-6`}>
      <div className="flex items-center gap-3">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl border ${accentMap[accent]}`}>
          <Icon size={16} strokeWidth={2.4} />
        </span>
        <h4 className={cardTitle}>{title}</h4>
      </div>
      <ul className="space-y-2.5 text-sm leading-6 text-slate-300 group-data-[erp-theme=light]/dashboard:text-slate-600">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2">
            <span className={`mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${accentMap[accent]}`} />
            <span>
              {item.strong && (
                <strong className="font-semibold text-slate-100 group-data-[erp-theme=light]/dashboard:text-slate-900">
                  {item.strong}:
                </strong>
              )}{' '}
              {item.text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ============================================================================
// SKELETONS
// ============================================================================

function MetricTileSkeleton() {
  return (
    <div className={`${surface} flex h-[156px] flex-col gap-3 p-5`}>
      <div className="flex justify-between">
        <Skeleton className="h-3 w-16 bg-slate-700/40" />
        <Skeleton className="h-4 w-14 rounded-full bg-slate-700/40" />
      </div>
      <Skeleton className="h-10 w-24 bg-slate-700/40" />
      <div className="mt-auto space-y-2">
        <Skeleton className="h-2 w-full rounded-full bg-slate-700/40" />
      </div>
    </div>
  )
}

function ChartCardSkeleton({ height = 420 }: { height?: number }) {
  return (
    <div className={`${surface} p-6`} style={{ minHeight: height }}>
      <Skeleton className="h-5 w-44 bg-slate-700/40" />
      <Skeleton className="mt-2 h-3 w-60 bg-slate-700/40" />
      <Skeleton className="mt-5 h-[260px] w-full rounded-xl bg-slate-700/40" />
    </div>
  )
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function AnalyticsPage() {
  // SSR-safe: arrancamos vacíos en servidor y primer render del cliente. La
  // hidratación desde localStorage ocurre en el useEffect de abajo.
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData>(EMPTY_ANALYTICS_DATA)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [, setIsRefreshing] = useState(false)
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
        kpisResponse,
      ] = await Promise.allSettled([
        get(`/api/analytics/ventas-tiempo?${fechaQuery}`),
        get('/api/analytics/deudas-clientes'),
        get('/api/analytics/deudas-proveedores'),
        get('/api/analytics/ventas-categoria'),
        get('/api/analytics/kpis-visuales'),
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
    const cached = getCachedAnalytics()
    if (hasAnalyticsData(cached)) {
      setAnalyticsData(cached)
      setHasLoaded(true)
    }
  }, [])

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
    const csv = filas
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')
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
        <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3 xl:flex xl:w-auto xl:items-center">
          <select
            value={periodo}
            onChange={(e) => {
              setPeriodo(e.target.value)
              setFechaDesdeAplicada('')
              setFechaHastaAplicada('')
            }}
            className={`${inputClass} xl:w-28`}
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
            className={`min-w-0 xl:w-32 ${inputClass}`}
          />
          <Input
            type="text"
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
            placeholder="YYYY-MM-DD"
            maxLength={10}
            aria-label="Fecha hasta"
            className={`min-w-0 xl:w-32 ${inputClass}`}
          />
          <Button className="min-w-0" onClick={aplicarFiltrosFecha}>
            Aplicar
          </Button>
          <Button className="min-w-0" variant="secondary" onClick={limpiarFiltrosFecha}>
            Limpiar
          </Button>
          <Button className="col-span-2 min-w-0 sm:col-span-1" onClick={exportarCsv}>
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

      {/* ─── KPI STRIP ─────────────────────────────────────────────────── */}
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {!hasLoaded && !kpisVisuales ? (
          <>
            <MetricTileSkeleton />
            <MetricTileSkeleton />
            <MetricTileSkeleton />
            <MetricTileSkeleton />
          </>
        ) : (
          <>
            <MetricTile label="Liquidez" data={kpisVisuales?.liquidez} />
            <MetricTile label="Rentabilidad" data={kpisVisuales?.rentabilidad} format="percentage" />
            <MetricTile label="Crecimiento" data={kpisVisuales?.crecimiento} format="percentage" />
            <EfficiencyTile data={kpisVisuales?.eficiencia} />
          </>
        )}
      </section>

      {/* ─── ROW: SALES EVOLUTION (2/3) + CATEGORY RANK (1/3) ─────────── */}
      <section className="grid gap-3 xl:grid-cols-3">
        <div className="xl:col-span-2">
          {!hasLoaded ? (
            <ChartCardSkeleton height={440} />
          ) : (
            <SalesEvolutionChart data={ventasTiempo} totales={ventasTiempo?.totales} />
          )}
        </div>
        <div>
          {!hasLoaded ? (
            <ChartCardSkeleton height={440} />
          ) : (
            <CategoryRankList data={ventasCategoria?.graficoPie} />
          )}
        </div>
      </section>

      {/* ─── AGING COMPOSITE (full width) ─────────────────────────────── */}
      <section>
        {!hasLoaded ? (
          <ChartCardSkeleton height={460} />
        ) : (
          <AgingComposite deudasClientes={deudasClientes} deudasProveedores={deudasProveedores} />
        )}
      </section>

      {/* ─── INSIGHTS FOOTER ──────────────────────────────────────────── */}
      <section className="grid gap-3 lg:grid-cols-3">
        <InsightCard
          title="Lectura ejecutiva"
          icon={Compass}
          accent="cyan"
          items={[
            { strong: 'Liquidez', text: 'capacidad de pagar deudas inmediatas.' },
            { strong: 'Cuentas por cobrar', text: 'dinero que te deben tus clientes.' },
            { strong: 'Cuentas por pagar', text: 'dinero que debes a proveedores.' },
            { strong: 'Ciclo de efectivo', text: 'tiempo para convertir inventario en caja.' },
          ]}
        />
        <InsightCard
          title="Recomendaciones"
          icon={Lightbulb}
          accent="emerald"
          items={[
            { text: 'Mantén al menos 3 meses de gastos en efectivo.' },
            { text: 'Cobra a clientes en máximo 30 días.' },
            { text: 'Rota inventario al menos 6 veces al año.' },
            { text: 'Mantén margen de utilidad sobre 15%.' },
          ]}
        />
        <InsightCard
          title="Señales de alerta"
          icon={ShieldAlert}
          accent="rose"
          items={[
            { text: 'Liquidez por debajo de 1.0 (crítico).' },
            { text: 'Más del 20% de cuentas vencidas.' },
            { text: 'Inventario sin movimiento mayor a 90 días.' },
            { text: 'Gastos mayores a ingresos por 2+ meses.' },
          ]}
        />
      </section>
    </PageShell>
  )
}
