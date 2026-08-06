'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Clock,
  Inbox,
  PieChart as PieChartIcon,
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
  Users,
  Zap,
} from 'lucide-react'
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

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/erp/status-badge'
import { useApiCall } from '@/hooks/use-api'
import { useCountryContext } from '@/hooks/use-country-context'
import { useConfigurationStatus } from './hooks/useConfigurationStatus'
import { ConfigurationBanner } from './components/ConfigurationBanner'
import { ConfigurationModal } from './components/ConfigurationModal'
import { DashboardNotificationBanners } from '@/components/notifications'

// ============================================================================
// TYPES
// ============================================================================

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

// ============================================================================
// HELPERS
// ============================================================================

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

function getActivityIcon(type: RecentActivity['type']) {
  const map = {
    VENTA: { Icon: DollarSign, color: 'text-emerald-400 group-data-[erp-theme=light]/dashboard:text-emerald-600' },
    COMPRA: { Icon: ShoppingCart, color: 'text-cyan-400 group-data-[erp-theme=light]/dashboard:text-cyan-600' },
    CPE: { Icon: FileText, color: 'text-violet-400 group-data-[erp-theme=light]/dashboard:text-violet-600' },
    GRE: { Icon: Truck, color: 'text-amber-400 group-data-[erp-theme=light]/dashboard:text-amber-600' },
    COTIZACION: { Icon: FileSpreadsheet, color: 'text-indigo-400 group-data-[erp-theme=light]/dashboard:text-indigo-600' },
  }
  return map[type] || { Icon: Activity, color: 'text-muted-foreground' }
}

function getStatusTone(status: RecentActivity['status']) {
  switch (status) {
    case 'success': return 'success'
    case 'warning': return 'warning'
    case 'error': return 'danger'
    default: return 'neutral'
  }
}

function getStatusLabel(status: RecentActivity['status']) {
  switch (status) {
    case 'success': return 'Completado'
    case 'warning': return 'Alerta'
    case 'error': return 'Error'
    default: return 'Pendiente'
  }
}

// ============================================================================
// DESIGN TOKENS (alineados con Analytics para coherencia visual del producto)
// ============================================================================

const surface =
  'rounded-2xl border border-cyan-400/15 bg-gradient-to-br from-[#040c1c] via-[#020817] to-[#050d1f] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] group-data-[erp-theme=light]/dashboard:border-border group-data-[erp-theme=light]/dashboard:from-white group-data-[erp-theme=light]/dashboard:via-white group-data-[erp-theme=light]/dashboard:to-slate-50 group-data-[erp-theme=light]/dashboard:shadow-[0_1px_2px_rgba(15,23,42,0.05)]'

const eyebrow =
  'text-[0.65rem] font-medium uppercase tracking-[0.18em] text-muted-foreground group-data-[erp-theme=light]/dashboard:text-muted-foreground'

const cardTitle =
  'text-base font-semibold tracking-tight text-foreground group-data-[erp-theme=light]/dashboard:text-foreground'

const tabularNum = 'font-bold tabular-nums tracking-tight'

const tonePalette = {
  cyan: {
    text: 'text-primary group-data-[erp-theme=light]/dashboard:text-cyan-700',
    chip: 'border-cyan-400/30 bg-cyan-400/10 text-primary group-data-[erp-theme=light]/dashboard:border-cyan-200 group-data-[erp-theme=light]/dashboard:bg-cyan-50 group-data-[erp-theme=light]/dashboard:text-cyan-700',
    accent: '#22d3ee',
  },
  violet: {
    text: 'text-violet-300 group-data-[erp-theme=light]/dashboard:text-violet-700',
    chip: 'border-violet-400/30 bg-violet-400/10 text-violet-300 group-data-[erp-theme=light]/dashboard:border-violet-200 group-data-[erp-theme=light]/dashboard:bg-violet-50 group-data-[erp-theme=light]/dashboard:text-violet-700',
    accent: '#a78bfa',
  },
  emerald: {
    text: 'text-emerald-300 group-data-[erp-theme=light]/dashboard:text-emerald-700',
    chip: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300 group-data-[erp-theme=light]/dashboard:border-emerald-200 group-data-[erp-theme=light]/dashboard:bg-emerald-50 group-data-[erp-theme=light]/dashboard:text-emerald-700',
    accent: '#34d399',
  },
  amber: {
    text: 'text-amber-300 group-data-[erp-theme=light]/dashboard:text-amber-700',
    chip: 'border-amber-400/30 bg-amber-400/10 text-amber-300 group-data-[erp-theme=light]/dashboard:border-amber-200 group-data-[erp-theme=light]/dashboard:bg-amber-50 group-data-[erp-theme=light]/dashboard:text-amber-700',
    accent: '#fbbf24',
  },
  rose: {
    text: 'text-rose-300 group-data-[erp-theme=light]/dashboard:text-rose-700',
    chip: 'border-rose-400/30 bg-rose-400/10 text-rose-300 group-data-[erp-theme=light]/dashboard:border-rose-200 group-data-[erp-theme=light]/dashboard:bg-rose-50 group-data-[erp-theme=light]/dashboard:text-rose-700',
    accent: '#fb7185',
  },
} as const

type Tone = keyof typeof tonePalette

const DASHBOARD_REFRESH_MS = 60_000
const DASHBOARD_REFRESH_JITTER_MS = 15_000

// ============================================================================
// EMPTY STATE — reutilizado para charts sin datos reales (sin mocks).
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
      className="flex flex-col items-center justify-center gap-2.5 rounded-xl border border-dashed border-cyan-400/15 bg-card/30 px-6 text-center group-data-[erp-theme=light]/dashboard:border-cyan-200/70 group-data-[erp-theme=light]/dashboard:bg-cyan-50/30"
      style={{ height }}
    >
      <Icon
        size={26}
        strokeWidth={1.6}
        className="text-cyan-400/55 group-data-[erp-theme=light]/dashboard:text-cyan-600/70"
      />
      <p className="text-sm font-medium text-muted-foreground group-data-[erp-theme=light]/dashboard:text-foreground/85">
        {title}
      </p>
      {subtitle && (
        <p className="max-w-[36ch] text-xs leading-5 text-muted-foreground group-data-[erp-theme=light]/dashboard:text-muted-foreground">
          {subtitle}
        </p>
      )}
    </div>
  )
}

// ============================================================================
// KPI TILE — métrica con sparkline opcional (solo si hay serie temporal real)
// ============================================================================

function MetricTile({
  label,
  value,
  delta,
  icon: Icon,
  tone,
  sparkData,
}: {
  label: string
  value: string
  delta?: { value: string; direction: 'up' | 'down' | 'neutral'; description: string }
  icon: typeof DollarSign
  tone: Tone
  sparkData?: number[]
}) {
  const cls = tonePalette[tone]
  const hasSpark = !!sparkData && sparkData.length > 1 && sparkData.some((v) => Number(v) > 0)
  const sparkPoints = hasSpark ? sparkData!.map((v, i) => ({ i, v })) : []

  return (
    <div className={`${surface} flex h-full flex-col gap-3 p-5`}>
      <div className="flex items-start justify-between gap-2">
        <span className={eyebrow}>{label}</span>
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg border ${cls.chip}`}>
          <Icon size={15} strokeWidth={2.4} />
        </span>
      </div>
      <div className={`${tabularNum} text-2xl text-foreground group-data-[erp-theme=light]/dashboard:text-foreground md:text-3xl`}>
        {value}
      </div>
      {delta && (
        <div className="flex items-center gap-1.5 text-xs">
          {delta.direction === 'up' && <TrendingUp size={13} className="text-emerald-400" />}
          {delta.direction === 'down' && <TrendingDown size={13} className="text-rose-400" />}
          {delta.direction === 'neutral' && <Activity size={13} className="text-muted-foreground" />}
          {delta.value && (
            <span
              className={
                delta.direction === 'up'
                  ? 'font-semibold tabular-nums text-emerald-300 group-data-[erp-theme=light]/dashboard:text-emerald-700'
                  : delta.direction === 'down'
                    ? 'font-semibold tabular-nums text-rose-300 group-data-[erp-theme=light]/dashboard:text-rose-700'
                    : 'font-semibold tabular-nums text-muted-foreground group-data-[erp-theme=light]/dashboard:text-foreground/85'
              }
            >
              {delta.value}
            </span>
          )}
          <span className="text-muted-foreground group-data-[erp-theme=light]/dashboard:text-muted-foreground">
            {delta.description}
          </span>
        </div>
      )}
      {/* Sparkline: solo se renderiza con serie temporal real. Sin datos no
          dibujamos curva (evitamos sugerir actividad que no existe). */}
      {hasSpark ? (
        <div className="-mx-1 mt-auto h-10 min-w-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={40}>
            <AreaChart data={sparkPoints} margin={{ top: 2, right: 2, left: 2, bottom: 0 }}>
              <defs>
                <linearGradient id={`spark-${tone}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={cls.accent} stopOpacity={0.6} />
                  <stop offset="100%" stopColor={cls.accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke={cls.accent}
                strokeWidth={1.5}
                fill={`url(#spark-${tone})`}
                isAnimationActive={false}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        // Baseline visual: línea sutil al fondo, sin sugerir movimiento.
        <div className="mt-auto h-px w-full bg-gradient-to-r from-transparent via-cyan-400/15 to-transparent group-data-[erp-theme=light]/dashboard:via-slate-300" />
      )}
    </div>
  )
}

// ============================================================================
// FINANCIAL FLOW CHART — bar chart limpio
// ============================================================================

function FinancialFlowChart({
  data,
  currencySymbol,
}: {
  data: Array<{ label: string; value: number; tone: Tone; chart?: boolean }>
  currencySymbol: string
}) {
  // El inventario es un valor de STOCK (no flujo) y su magnitud eclipsa a
  // ventas/compras en un eje compartido, dejando las barras de flujo invisibles.
  // Se muestra en la tira de stats de arriba, pero se excluye de las barras para
  // que las magnitudes comparables (ventas/compras) sean legibles.
  const chartData = data
    .filter((d) => d.chart !== false)
    .map((d) => ({ label: d.label, value: d.value, tone: d.tone }))
  const total = chartData.reduce((s, d) => s + d.value, 0)
  const hasReal = total > 0

  const renderTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null

    return (
      <div className="rounded-xl border border-cyan-400/35 bg-slate-950/95 px-3 py-2 shadow-xl backdrop-blur-sm">
        <p className="mb-1 text-xs font-bold text-slate-100">{label}</p>
        <p className="text-xs font-semibold text-slate-300">
          Valor:{' '}
          <span className="text-violet-300">
            {formatCurrency(Number(payload[0]?.value), currencySymbol)}
          </span>
        </p>
      </div>
    )
  }

  return (
    <div className={`${surface} flex h-full flex-col gap-4 p-6`}>
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className={cardTitle}>Flujo financiero y operacional</h3>
          <p className="mt-1 text-xs text-muted-foreground group-data-[erp-theme=light]/dashboard:text-muted-foreground">
            Ventas, compras e inventario valorizado del periodo
          </p>
        </div>
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl border ${tonePalette.cyan.chip}`}>
          <BarChart3 size={16} strokeWidth={2.4} />
        </span>
      </header>

      {/* Stat strip siempre visible: muestra valores reales aunque sean S/0. */}
      <div className="grid gap-2 sm:grid-cols-4">
        {data.map((d) => (
          <div
            key={d.label}
            className="rounded-xl border border-cyan-400/15 bg-card/60 px-3 py-2 group-data-[erp-theme=light]/dashboard:border-border group-data-[erp-theme=light]/dashboard:bg-muted/30"
          >
            <div className={eyebrow}>{d.label}</div>
            <div className={`${tabularNum} mt-0.5 text-sm ${tonePalette[d.tone].text}`}>
              {formatCurrency(d.value, currencySymbol)}
            </div>
          </div>
        ))}
      </div>

      {hasReal ? (
        <div className="-mx-2 h-[260px] min-w-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={260}>
            <RBarChart data={chartData} margin={{ top: 12, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
              <defs>
                {(['cyan', 'emerald', 'violet', 'amber', 'rose'] as Tone[]).map((t) => (
                  <linearGradient key={t} id={`flow-${t}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={tonePalette[t].accent} stopOpacity={1} />
                    <stop offset="100%" stopColor={tonePalette[t].accent} stopOpacity={0.6} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke="rgba(100,116,139,0.18)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fill: '#64748b', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={50}
                tickFormatter={(v: number) =>
                  v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toLocaleString('es-PE')
                }
              />
              <Tooltip
                cursor={{ fill: 'rgba(56,189,248,0.06)' }}
                content={renderTooltip}
              />
              <Bar dataKey="value" radius={[8, 8, 0, 0]} isAnimationActive={false}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={`url(#flow-${entry.tone})`} />
                ))}
              </Bar>
            </RBarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <ChartEmptyState
          height={260}
          icon={BarChart3}
          title="Sin movimiento financiero todavía"
          subtitle="Las barras de ventas, compras e inventario aparecerán cuando registres operaciones del periodo."
        />
      )}
    </div>
  )
}

// ============================================================================
// FISCAL DONUT — Recharts Pie limpio
// ============================================================================

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
    { name: 'CPE', value: cpe, color: tonePalette.cyan.accent },
    { name: 'GRE', value: gre, color: tonePalette.amber.accent },
    ...(isPeru ? [{ name: 'SIRE', value: sire, color: tonePalette.violet.accent }] : []),
  ]
  const total = segments.reduce((s, item) => s + item.value, 0)
  const hasReal = total > 0

  return (
    <div className={`${surface} flex h-full flex-col gap-4 p-6`}>
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className={cardTitle}>Mix fiscal</h3>
          <p className="mt-1 text-xs text-muted-foreground group-data-[erp-theme=light]/dashboard:text-muted-foreground">
            Documentos tributarios del periodo
          </p>
        </div>
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl border ${tonePalette.violet.chip}`}>
          <FileText size={16} strokeWidth={2.4} />
        </span>
      </header>

      {hasReal ? (
        <div className="relative mx-auto h-[180px] w-[180px] min-w-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={180}>
            <RPieChart>
              <Pie
                data={segments}
                cx="50%"
                cy="50%"
                innerRadius={56}
                outerRadius={84}
                paddingAngle={3}
                dataKey="value"
                stroke="none"
                isAnimationActive={false}
              >
                {segments.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: 'rgba(2, 8, 23, 0.96)',
                  border: '1px solid rgba(167, 139, 250, 0.35)',
                  borderRadius: 12,
                  color: '#f8fafc',
                  fontSize: 12,
                }}
                labelStyle={{ color: '#f8fafc', fontWeight: 700, marginBottom: 4 }}
                itemStyle={{ color: '#e2e8f0', fontWeight: 600, padding: 0 }}
                formatter={(value: any, name: any) => [formatNumber(Number(value)), name]}
              />
            </RPieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className={eyebrow}>Total</span>
            <span
              className={`${tabularNum} mt-0.5 text-2xl text-foreground group-data-[erp-theme=light]/dashboard:text-foreground`}
            >
              {formatNumber(total)}
            </span>
          </div>
        </div>
      ) : (
        <ChartEmptyState
          height={180}
          icon={PieChartIcon}
          title="Sin documentos emitidos"
          subtitle="El donut se llena al emitir CPE, GRE o reportes SIRE."
        />
      )}

      {/* Lista siempre visible con valores reales (incluso si todos son 0). */}
      <ul className="flex flex-col gap-2">
        {segments.map((seg) => (
          <li
            key={seg.name}
            className="flex items-center justify-between rounded-lg border border-cyan-400/10 bg-card/40 px-3 py-2 group-data-[erp-theme=light]/dashboard:border-border group-data-[erp-theme=light]/dashboard:bg-muted/30"
          >
            <span className="flex items-center gap-2 text-sm text-foreground/90 group-data-[erp-theme=light]/dashboard:text-foreground">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: seg.color, boxShadow: hasReal ? `0 0 10px ${seg.color}88` : 'none' }}
              />
              <span className="font-medium">{seg.name}</span>
            </span>
            <span
              className={`${tabularNum} text-sm text-foreground group-data-[erp-theme=light]/dashboard:text-foreground`}
            >
              {formatNumber(seg.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ============================================================================
// ACTIVITY TIMELINE — clean list
// ============================================================================

function ActivityTimeline({
  activities,
  currencySymbol,
}: {
  activities: RecentActivity[]
  currencySymbol: string
}) {
  return (
    <div className={`${surface} flex h-full flex-col gap-4 p-6`}>
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className={cardTitle}>Actividad reciente</h3>
          <p className="mt-1 text-xs text-muted-foreground group-data-[erp-theme=light]/dashboard:text-muted-foreground">
            Últimos eventos trazables del tenant
          </p>
        </div>
        <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-wider ${tonePalette.cyan.chip}`}>
          <Clock size={11} strokeWidth={2.5} />
          Live
        </span>
      </header>

      {activities.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {activities.slice(0, 6).map((activity) => {
            const { Icon, color } = getActivityIcon(activity.type)
            return (
              <li
                key={activity.id}
                className="flex items-start gap-3 rounded-xl border border-cyan-400/10 bg-card/40 p-3 group-data-[erp-theme=light]/dashboard:border-border group-data-[erp-theme=light]/dashboard:bg-muted/30"
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-cyan-400/15 bg-card/60 group-data-[erp-theme=light]/dashboard:border-border group-data-[erp-theme=light]/dashboard:bg-card`}>
                  <Icon size={15} strokeWidth={2.3} className={color} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="line-clamp-2 text-sm font-medium text-foreground group-data-[erp-theme=light]/dashboard:text-foreground">
                      {activity.description}
                    </p>
                    <StatusBadge tone={getStatusTone(activity.status)} className="shrink-0 text-[0.65rem]">
                      {getStatusLabel(activity.status)}
                    </StatusBadge>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-[0.7rem] text-muted-foreground group-data-[erp-theme=light]/dashboard:text-muted-foreground">
                    <span className="tabular-nums">
                      {new Date(activity.date).toLocaleDateString('es-PE', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {activity.amount ? (
                      <span className={`${tabularNum} text-[0.7rem] ${tonePalette.cyan.text}`}>
                        {formatCurrency(activity.amount, currencySymbol)}
                      </span>
                    ) : null}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-cyan-400/20 bg-card/40 p-8 text-center group-data-[erp-theme=light]/dashboard:border-cyan-200 group-data-[erp-theme=light]/dashboard:bg-cyan-50/30">
          <Activity size={28} className="text-cyan-400/70 group-data-[erp-theme=light]/dashboard:text-cyan-600" />
          <p className="text-sm font-medium text-foreground/90 group-data-[erp-theme=light]/dashboard:text-foreground/85">
            Sin actividad reciente
          </p>
          <p className="text-xs text-muted-foreground group-data-[erp-theme=light]/dashboard:text-muted-foreground">
            Los eventos del tenant aparecerán aquí en tiempo real
          </p>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// EXECUTIVE RADAR — prioridades del día
// ============================================================================

function ExecutiveRadar({
  conversion,
  documentosFiscales,
  alertas,
  isPeru,
  proximaRevision,
}: {
  conversion: number
  documentosFiscales: number
  alertas: number
  isPeru: boolean
  proximaRevision: Array<{ label: string; value: string; status: 'ok' | 'warn' | 'alert' }>
}) {
  const radarItems = [
    {
      label: 'Conversión comercial',
      value: `${conversion.toFixed(1)}%`,
      progress: Math.min(conversion, 100),
      tone: 'cyan' as Tone,
      sub: 'Cotizaciones → ventas',
    },
    {
      label: 'Documentos fiscales',
      value: formatNumber(documentosFiscales),
      progress: documentosFiscales > 0 ? Math.min((documentosFiscales / 50) * 100, 100) : 5,
      tone: 'violet' as Tone,
      sub: `CPE, GRE${isPeru ? ' y SIRE' : ''} consolidados`,
    },
    {
      label: 'Alertas críticas',
      value: formatNumber(alertas),
      progress: alertas > 0 ? Math.min(alertas * 10, 100) : 0,
      tone: (alertas > 0 ? 'amber' : 'emerald') as Tone,
      sub: 'Stock bajo y órdenes pendientes',
    },
  ]

  return (
    <div className={`${surface} flex h-full flex-col gap-4 p-6`}>
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className={cardTitle}>Radar ejecutivo</h3>
          <p className="mt-1 text-xs text-muted-foreground group-data-[erp-theme=light]/dashboard:text-muted-foreground">
            Prioridades operativas del día
          </p>
        </div>
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl border ${tonePalette.violet.chip}`}>
          <Target size={16} strokeWidth={2.4} />
        </span>
      </header>

      <div className="flex flex-col gap-3">
        {radarItems.map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-cyan-400/10 bg-card/40 p-3 group-data-[erp-theme=light]/dashboard:border-border group-data-[erp-theme=light]/dashboard:bg-muted/30"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-foreground/90 group-data-[erp-theme=light]/dashboard:text-foreground">
                {item.label}
              </span>
              <span className={`${tabularNum} text-sm ${tonePalette[item.tone].text}`}>
                {item.value}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted/80 group-data-[erp-theme=light]/dashboard:bg-muted">
              <span
                className="block h-full rounded-full transition-all duration-700 ease-out"
                style={{
                  width: `${item.progress}%`,
                  background: `linear-gradient(90deg, ${tonePalette[item.tone].accent}, ${tonePalette[item.tone].accent}cc)`,
                  boxShadow: `0 0 12px ${tonePalette[item.tone].accent}55`,
                }}
              />
            </div>
            <p className="mt-1.5 text-[0.7rem] text-muted-foreground group-data-[erp-theme=light]/dashboard:text-muted-foreground">
              {item.sub}
            </p>
          </div>
        ))}
      </div>

      {/* Próxima revisión strip */}
      <div className="mt-auto rounded-xl border border-cyan-400/15 bg-card/30 p-3 group-data-[erp-theme=light]/dashboard:border-cyan-200 group-data-[erp-theme=light]/dashboard:bg-cyan-50/40">
        <h4 className={`${eyebrow} mb-2`}>Siguiente revisión</h4>
        <div className="grid gap-1.5">
          {proximaRevision.map((item) => {
            const toneCls =
              item.status === 'alert'
                ? tonePalette.rose
                : item.status === 'warn'
                  ? tonePalette.amber
                  : tonePalette.emerald
            return (
              <div key={item.label} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground group-data-[erp-theme=light]/dashboard:text-muted-foreground">
                  {item.label}
                </span>
                <span className={`font-semibold ${toneCls.text}`}>{item.value}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// MODULES STRIP — bottom row
// ============================================================================

function ModuleTile({
  label,
  value,
  icon: Icon,
  tone,
  hint,
}: {
  label: string
  value: string
  icon: typeof FileText
  tone: Tone
  hint?: string
}) {
  const cls = tonePalette[tone]
  return (
    <div className={`${surface} flex h-full items-center gap-4 p-5`}>
      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border ${cls.chip}`}>
        <Icon size={20} strokeWidth={2.2} />
      </span>
      <div className="min-w-0 flex-1">
        <div className={eyebrow}>{label}</div>
        <div
          className={`${tabularNum} mt-0.5 text-2xl text-foreground group-data-[erp-theme=light]/dashboard:text-foreground`}
        >
          {value}
        </div>
        {hint && (
          <div className="mt-0.5 text-[0.7rem] text-muted-foreground group-data-[erp-theme=light]/dashboard:text-muted-foreground">
            {hint}
          </div>
        )}
      </div>
      <ArrowUpRight size={14} className="shrink-0 text-foreground/80 group-data-[erp-theme=light]/dashboard:text-muted-foreground" />
    </div>
  )
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function Dashboard() {
  const { get } = useApiCall({ throwOnError: true, timeoutMs: 30000 })
  const dashboardFetchInFlightRef = useRef(false)
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
    if (dashboardFetchInFlightRef.current) {
      return
    }

    dashboardFetchInFlightRef.current = true

    try {
      if (!showLoading) setIsRefreshing(true)
      setError(null)

      const [statsResult, activitiesResult] = await Promise.allSettled([
        get('/dashboard/stats'),
        get('/dashboard/activities'),
      ])

      if (statsResult.status === 'fulfilled' && statsResult.value?.success) {
        setStats({ ...DEFAULT_DASHBOARD_STATS, ...statsResult.value.data })
      } else {
        const reason =
          statsResult.status === 'rejected'
            ? statsResult.reason
            : statsResult.value?.message || 'Error al obtener estadísticas'
        setError(
          `No se pudieron actualizar las métricas: ${reason instanceof Error ? reason.message : String(reason)}`,
        )
      }

      if (activitiesResult.status === 'fulfilled' && activitiesResult.value?.success) {
        setActivities(activitiesResult.value.data || [])
      } else {
        setActivities([])
      }

      setLastUpdate(new Date().toLocaleTimeString('es-PE'))
    } catch (err) {
      setError(
        `No se pudieron actualizar las métricas: ${err instanceof Error ? err.message : 'Error desconocido'}`,
      )
    } finally {
      dashboardFetchInFlightRef.current = false
      setIsRefreshing(false)
    }
  }, [get])

  useEffect(() => {
    fetchDashboardData(true)
  }, [fetchDashboardData])

  useEffect(() => {
    if (!isLoadingConfig && configStatus && !configStatus.isDemo && !configStatus.isComplete) {
      const timer = setTimeout(() => setShowConfigModal(true), 1000)
      return () => clearTimeout(timer)
    }
  }, [isLoadingConfig, configStatus])

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const schedule = () => {
      if (cancelled) return
      const jitter = Math.floor(Math.random() * DASHBOARD_REFRESH_JITTER_MS)
      timer = setTimeout(async () => {
        if (!document.hidden) {
          await fetchDashboardData(false)
        }
        schedule()
      }, DASHBOARD_REFRESH_MS + jitter)
    }

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchDashboardData(false)
      }
    }

    schedule()
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [fetchDashboardData])

  const handleRefresh = () => fetchDashboardData(false)

  // Derived metrics
  const alertasCriticas =
    Number(stats?.productosConStockBajo ?? 0) + Number(stats?.ordenesCompraPendientes ?? 0)
  const crecimiento = Number(stats?.crecimientoVentas ?? 0)
  const saludOperativa = Math.max(0, Math.min(100, 100 - alertasCriticas))
  const eficienciaFiscal =
    Number(stats?.totalCpe ?? 0) + Number(stats?.totalGre ?? 0) + Number(stats?.totalSire ?? 0)
  const financialChartData = [
    { label: 'Ventas mes', value: Number(stats?.ventasMes ?? 0), tone: 'cyan' as Tone },
    { label: 'Ventas hoy', value: Number(stats?.ventasHoy ?? 0), tone: 'emerald' as Tone },
    { label: 'Compras', value: Number(stats?.comprasMes ?? 0), tone: 'violet' as Tone },
    { label: 'Inventario', value: Number(stats?.valorInventario ?? 0), tone: 'amber' as Tone, chart: false },
  ]
  const proximaRevision: Array<{ label: string; value: string; status: 'ok' | 'warn' | 'alert' }> = [
    {
      label: 'Caja y ventas',
      value: Number(stats?.ventasHoy ?? 0) > 0 ? 'Con venta hoy' : 'Sin venta hoy',
      status: Number(stats?.ventasHoy ?? 0) > 0 ? 'ok' : 'warn',
    },
    {
      label: 'Compras',
      value:
        Number(stats?.ordenesCompraPendientes ?? 0) > 0
          ? `${stats?.ordenesCompraPendientes} órdenes`
          : 'Sin pendientes',
      status: Number(stats?.ordenesCompraPendientes ?? 0) > 0 ? 'warn' : 'ok',
    },
    {
      label: 'Stock',
      value:
        Number(stats?.productosConStockBajo ?? 0) > 0
          ? `${stats?.productosConStockBajo} bajo stock`
          : 'Stock estable',
      status: Number(stats?.productosConStockBajo ?? 0) > 0 ? 'alert' : 'ok',
    },
  ]

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#020817] p-4 text-foreground group-data-[erp-theme=light]/dashboard:bg-muted group-data-[erp-theme=light]/dashboard:text-foreground md:p-6">
      {/* Atmospheric layers — sutiles, no distraen */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.04)_1px,transparent_1px)] bg-[size:48px_48px] group-data-[erp-theme=light]/dashboard:bg-[linear-gradient(rgba(15,23,42,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.035)_1px,transparent_1px)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[400px] bg-[radial-gradient(ellipse_at_top,rgba(14,165,233,0.12),transparent_70%)] group-data-[erp-theme=light]/dashboard:bg-[radial-gradient(ellipse_at_top,rgba(14,165,233,0.08),transparent_70%)]" />

      <div className="relative mx-auto flex w-full max-w-[1720px] flex-col gap-4">
        {/* Banners superiores */}
        {configStatus && !configStatus.isDemo && !configStatus.isComplete && (
          <ConfigurationModal
            isOpen={showConfigModal}
            onClose={() => setShowConfigModal(false)}
            missingItems={configStatus.missingItems}
          />
        )}
        {configStatus && !configStatus.isDemo && !configStatus.isComplete && (
          <ConfigurationBanner
            missingItems={configStatus.missingItems}
            completionPercentage={configStatus.completionPercentage}
          />
        )}
        <DashboardNotificationBanners />

        {error ? (
          <Alert variant="destructive" className="border-rose-400/30 bg-rose-950/50 text-destructive dark:text-rose-200">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Dashboard sin sincronización completa</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {/* ─── HEADER slim ─────────────────────────────────────────────── */}
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] ${tonePalette.cyan.chip}`}>
                <Zap size={11} strokeWidth={2.5} />
                ERP Command Center
              </span>
              <span className={`rounded-full border px-2.5 py-1 text-[0.65rem] font-medium uppercase tracking-wider ${tonePalette.emerald.chip}`}>
                Datos reales del tenant
              </span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white group-data-[erp-theme=light]/dashboard:text-foreground md:text-4xl">
              Dashboard ejecutivo
            </h1>
            <p className="mt-1.5 max-w-3xl text-sm text-muted-foreground group-data-[erp-theme=light]/dashboard:text-foreground/80">
              Visión operativa de ventas, compras, fiscal, logística e inventario.
              {lastUpdate ? (
                <span className="ml-1 tabular-nums text-muted-foreground">· Sync {lastUpdate}</span>
              ) : null}
            </p>
          </div>
          <Button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="shrink-0 border border-cyan-400/30 bg-cyan-400/10 text-primary hover:bg-cyan-400/20 group-data-[erp-theme=light]/dashboard:border-cyan-200 group-data-[erp-theme=light]/dashboard:bg-cyan-600 group-data-[erp-theme=light]/dashboard:text-white group-data-[erp-theme=light]/dashboard:hover:bg-cyan-700"
          >
            <RefreshCw className={isRefreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            {isRefreshing ? 'Sincronizando…' : 'Actualizar'}
          </Button>
        </header>

        {/* ─── KPI STRIP ──────────────────────────────────────────────── */}
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricTile
            label="Revenue operativo"
            value={formatCurrency(stats?.ventasMes, currencySymbol)}
            delta={{
              value: `${crecimiento > 0 ? '+' : ''}${crecimiento}%`,
              direction: crecimiento > 0 ? 'up' : crecimiento < 0 ? 'down' : 'neutral',
              description: 'vs mes anterior',
            }}
            icon={DollarSign}
            tone="cyan"
          />
          <MetricTile
            label="Compras del periodo"
            value={formatCurrency(stats?.comprasMes, currencySymbol)}
            delta={{ value: '', direction: 'neutral', description: 'Inversión registrada' }}
            icon={ShoppingCart}
            tone="violet"
          />
          <MetricTile
            label="Salud operativa"
            value={`${saludOperativa}%`}
            delta={{
              value: String(alertasCriticas),
              direction: alertasCriticas > 0 ? 'down' : 'up',
              description: alertasCriticas === 1 ? 'alerta activa' : 'alertas activas',
            }}
            icon={Zap}
            tone={alertasCriticas > 0 ? 'amber' : 'emerald'}
          />
          <MetricTile
            label="Inventario total"
            value={formatNumber(stats?.totalInventario)}
            delta={{ value: '', direction: 'neutral', description: 'Productos en catálogo' }}
            icon={Package}
            tone="emerald"
          />
        </section>

        {/* ─── HERO ROW: Flujo + Mix fiscal ───────────────────────────── */}
        <section className="grid gap-3 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <FinancialFlowChart data={financialChartData} currencySymbol={currencySymbol} />
          </div>
          <div>
            <FiscalDonut
              cpe={Number(stats?.totalCpe ?? 0)}
              gre={Number(stats?.totalGre ?? 0)}
              sire={Number(stats?.totalSire ?? 0)}
              isPeru={isPeru}
            />
          </div>
        </section>

        {/* ─── OPERATIONAL ROW: Timeline + Radar ──────────────────────── */}
        <section className="grid gap-3 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <ActivityTimeline activities={activities} currencySymbol={currencySymbol} />
          </div>
          <div>
            <ExecutiveRadar
              conversion={Number(stats?.tasaConversionCotizaciones ?? 0)}
              documentosFiscales={eficienciaFiscal}
              alertas={alertasCriticas}
              isPeru={isPeru}
              proximaRevision={proximaRevision}
            />
          </div>
        </section>

        {/* ─── MODULES STRIP ───────────────────────────────────────────── */}
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <ModuleTile
            label="CPE"
            value={formatNumber(stats?.totalCpe)}
            icon={FileText}
            tone="cyan"
            hint="Comprobantes electrónicos"
          />
          <ModuleTile
            label="GRE"
            value={formatNumber(stats?.totalGre)}
            icon={Truck}
            tone="amber"
            hint="Guías de remisión"
          />
          {isPeru ? (
            <ModuleTile
              label="SIRE"
              value={formatNumber(stats?.totalSire)}
              icon={Download}
              tone="violet"
              hint="Reportes SUNAT"
            />
          ) : (
            <ModuleTile
              label="Cotizaciones"
              value={formatNumber(stats?.totalCotizaciones)}
              icon={FileSpreadsheet}
              tone="violet"
              hint="Pendientes y emitidas"
            />
          )}
          <ModuleTile
            label="Usuarios"
            value={formatNumber(stats?.totalUsers)}
            icon={Users}
            tone="emerald"
            hint="Equipo activo"
          />
        </section>

      </div>
    </main>
  )
}
