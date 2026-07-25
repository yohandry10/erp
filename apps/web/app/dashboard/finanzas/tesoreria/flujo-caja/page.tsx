'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  ChevronDown,
  DollarSign,
  Filter,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useApi } from '@/hooks/use-api'
import { cn } from '@/lib/utils'

interface CuentaBancaria {
  id: string
  nombre: string
  banco: string
  numero_cuenta: string
  moneda: string
  saldo_actual: number
}

interface ResumenFlujo {
  moneda: string
  saldo_actual: number
  total_ingresos: number
  total_egresos: number
  flujo_neto: number
  saldo_proyectado: number
  alerta: string | null
}

interface ItemProyeccion {
  tipo: 'INGRESO' | 'EGRESO'
  concepto: string
  descripcion: string
  monto: number
  referencia_id: string
}

interface ProyeccionDia {
  fecha: string
  moneda: string
  saldo_inicial: number
  ingresos: number
  egresos: number
  flujo_neto: number
  saldo_final: number
  items: ItemProyeccion[]
}

interface FlujoCajaData {
  periodo: {
    fecha_desde: string
    fecha_hasta: string
    dias: number
  }
  cuentas_bancarias: CuentaBancaria[]
  resumen: ResumenFlujo[]
  proyeccion: ProyeccionDia[]
  estadisticas: {
    total_cxp_pendientes: number
    total_cxc_pendientes: number
    total_movimientos: number
  }
}

const fieldClass =
  'border-cyan-400/20 bg-card/60 text-foreground shadow-inner shadow-cyan-950/20 focus:ring-cyan-400/40 group-data-[erp-theme=light]/dashboard:bg-card group-data-[erp-theme=light]/dashboard:text-foreground'

const toNumber = (value: unknown) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

const normalizeFlujoCajaData = (raw: any): FlujoCajaData => ({
  periodo: {
    fecha_desde: raw?.periodo?.fecha_desde || '',
    fecha_hasta: raw?.periodo?.fecha_hasta || '',
    dias: toNumber(raw?.periodo?.dias),
  },
  cuentas_bancarias: Array.isArray(raw?.cuentas_bancarias) ? raw.cuentas_bancarias : [],
  resumen: Array.isArray(raw?.resumen)
    ? raw.resumen.map((resumen: any) => ({
        moneda: resumen?.moneda || 'PEN',
        saldo_actual: toNumber(resumen?.saldo_actual),
        total_ingresos: toNumber(resumen?.total_ingresos),
        total_egresos: toNumber(resumen?.total_egresos),
        flujo_neto: toNumber(resumen?.flujo_neto),
        saldo_proyectado: toNumber(resumen?.saldo_proyectado),
        alerta: resumen?.alerta ?? null,
      }))
    : [],
  proyeccion: Array.isArray(raw?.proyeccion)
    ? raw.proyeccion.map((dia: any) => ({
        fecha: dia?.fecha || '',
        moneda: dia?.moneda || 'PEN',
        saldo_inicial: toNumber(dia?.saldo_inicial),
        ingresos: toNumber(dia?.ingresos),
        egresos: toNumber(dia?.egresos),
        flujo_neto: toNumber(dia?.flujo_neto),
        saldo_final: toNumber(dia?.saldo_final),
        items: Array.isArray(dia?.items)
          ? dia.items.map((item: any) => ({
              tipo: item?.tipo === 'EGRESO' ? 'EGRESO' : 'INGRESO',
              concepto: item?.concepto || 'Movimiento',
              descripcion: item?.descripcion || '',
              monto: toNumber(item?.monto),
              referencia_id: item?.referencia_id || '',
            }))
          : [],
      }))
    : [],
  estadisticas: {
    total_cxp_pendientes: toNumber(raw?.estadisticas?.total_cxp_pendientes),
    total_cxc_pendientes: toNumber(raw?.estadisticas?.total_cxc_pendientes),
    total_movimientos: toNumber(raw?.estadisticas?.total_movimientos),
  },
})

export default function FlujoCajaPage() {
  const router = useRouter()
  const { get } = useApi()

  const [flujoCajaData, setFlujoCajaData] = useState<FlujoCajaData | null>(null)
  const [loading, setLoading] = useState(true)
  const [diasProyeccion, setDiasProyeccion] = useState(90)
  const [monedaFiltro, setMonedaFiltro] = useState('TODAS')
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set())

  const loadFlujoCaja = useCallback(async () => {
    try {
      setLoading(true)
      const response = await get(`/api/finanzas/tesoreria/flujo-caja?dias_proyeccion=${diasProyeccion}`)

      if (response?.success) {
        setFlujoCajaData(normalizeFlujoCajaData(response.data))
      }
    } catch (error) {
      console.error('Error loading flujo de caja:', error)
    } finally {
      setLoading(false)
    }
  }, [get, diasProyeccion])

  useEffect(() => {
    loadFlujoCaja()
  }, [loadFlujoCaja])

  const formatCurrency = (amount: number, moneda: string = 'PEN') => {
    const currency = moneda === 'USD' ? 'USD' : 'PEN'
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency,
    }).format(toNumber(amount))
  }

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('es-PE', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })

  const toggleDayExpansion = (fecha: string) => {
    const newExpanded = new Set(expandedDays)
    if (newExpanded.has(fecha)) {
      newExpanded.delete(fecha)
    } else {
      newExpanded.add(fecha)
    }
    setExpandedDays(newExpanded)
  }

  const proyeccionFiltrada =
    flujoCajaData?.proyeccion.filter((p) => monedaFiltro === 'TODAS' || p.moneda === monedaFiltro) || []

  const monedasDisponibles = Array.from(new Set(flujoCajaData?.proyeccion.map((p) => p.moneda) || []))

  if (loading) {
    return (
      <div className="min-h-full bg-background p-6 text-foreground">
        <Card className="border-cyan-400/20 bg-card/70">
          <CardContent className="flex min-h-80 flex-col items-center justify-center gap-4">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Generando proyección de flujo de caja...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.22),transparent_34%),linear-gradient(135deg,#020617_0%,#061a2f_58%,#020617_100%)] p-4 text-foreground group-data-[erp-theme=light]/dashboard:bg-muted/30 group-data-[erp-theme=light]/dashboard:text-foreground lg:p-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <Card className="border-cyan-400/20 bg-card/75 shadow-2xl shadow-cyan-950/20 group-data-[erp-theme=light]/dashboard:bg-card">
          <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <Button
                variant="outline"
                size="icon"
                className="mt-1 border-cyan-400/30 bg-card/50 text-primary hover:bg-cyan-400/10"
                aria-label="Volver a tesorería"
                onClick={() => router.push('/dashboard/finanzas/tesoreria')}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <Badge variant="outline" className="mb-2 border-cyan-400/30 bg-cyan-400/10 text-primary">
                  ERP Cash Flow
                </Badge>
                <h1 className="text-2xl font-semibold tracking-normal text-foreground group-data-[erp-theme=light]/dashboard:text-foreground lg:text-3xl">
                  Proyección de Flujo de Caja
                </h1>
                <p className="mt-1 text-sm text-muted-foreground group-data-[erp-theme=light]/dashboard:text-foreground/80">
                  Ingresos y egresos proyectados para los próximos {diasProyeccion} días.
                </p>
              </div>
            </div>

            <Button variant="outline" className="border-cyan-400/30 bg-card/50 text-primary hover:bg-cyan-400/10" onClick={loadFlujoCaja}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Actualizar
            </Button>
          </CardContent>
        </Card>

        {!flujoCajaData ? (
          <Card className="border-cyan-400/20 bg-card/70 group-data-[erp-theme=light]/dashboard:bg-card">
            <CardContent className="flex min-h-80 flex-col items-center justify-center gap-4 p-8 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-amber-300/30 bg-amber-300/10 text-amber-400 dark:text-amber-200">
                <AlertCircle className="h-7 w-7" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground group-data-[erp-theme=light]/dashboard:text-foreground">Error al cargar datos</h2>
                <p className="mt-1 text-sm text-muted-foreground group-data-[erp-theme=light]/dashboard:text-foreground/80">
                  No se pudo cargar la proyección de flujo de caja.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="border-cyan-400/20 bg-card/70 group-data-[erp-theme=light]/dashboard:bg-card">
              <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground group-data-[erp-theme=light]/dashboard:text-foreground/85">
                  <Filter className="h-4 w-4 text-primary" />
                  Filtros
                </div>

                <Select value={String(diasProyeccion)} onValueChange={(value) => setDiasProyeccion(Number(value))}>
                  <SelectTrigger className={cn(fieldClass, 'w-full md:w-44')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-cyan-400/20 bg-background text-foreground group-data-[erp-theme=light]/dashboard:bg-card group-data-[erp-theme=light]/dashboard:text-foreground">
                    <SelectItem value="30">30 días</SelectItem>
                    <SelectItem value="60">60 días</SelectItem>
                    <SelectItem value="90">90 días</SelectItem>
                    <SelectItem value="180">180 días</SelectItem>
                  </SelectContent>
                </Select>

                {monedasDisponibles.length > 1 && (
                  <Select value={monedaFiltro} onValueChange={setMonedaFiltro}>
                    <SelectTrigger className={cn(fieldClass, 'w-full md:w-52')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-cyan-400/20 bg-background text-foreground group-data-[erp-theme=light]/dashboard:bg-card group-data-[erp-theme=light]/dashboard:text-foreground">
                      <SelectItem value="TODAS">Todas las monedas</SelectItem>
                      {monedasDisponibles.map((moneda) => (
                        <SelectItem key={moneda} value={moneda}>
                          {moneda}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </CardContent>
            </Card>

            <Card className="border-cyan-400/20 bg-card/70 group-data-[erp-theme=light]/dashboard:bg-card">
              <CardHeader className="border-b border-cyan-400/10 p-4">
                <CardTitle className="text-base text-foreground group-data-[erp-theme=light]/dashboard:text-foreground">Resumen por moneda</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
                {flujoCajaData.resumen.map((resumen) => (
                  <SummaryCard key={resumen.moneda} resumen={resumen} formatCurrency={formatCurrency} />
                ))}
              </CardContent>
            </Card>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard icon={DollarSign} label="Cuentas bancarias" value={flujoCajaData.cuentas_bancarias.length.toString()} detail="Cuentas activas" />
              <MetricCard icon={TrendingDown} label="CxP pendientes" value={flujoCajaData.estadisticas.total_cxp_pendientes.toString()} detail="Egresos proyectados" />
              <MetricCard icon={TrendingUp} label="CxC pendientes" value={flujoCajaData.estadisticas.total_cxc_pendientes.toString()} detail="Ingresos proyectados" />
              <MetricCard icon={Calendar} label="Días con movimientos" value={proyeccionFiltrada.length.toString()} detail={`De ${flujoCajaData.periodo.dias} días totales`} />
            </div>

            <Card className="border-cyan-400/20 bg-card/70 group-data-[erp-theme=light]/dashboard:bg-card">
              <CardHeader className="border-b border-cyan-400/10 p-4">
                <CardTitle className="text-base text-foreground group-data-[erp-theme=light]/dashboard:text-foreground">Proyección día por día</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                {proyeccionFiltrada.length === 0 ? (
                  <div className="flex min-h-72 flex-col items-center justify-center gap-4 p-8 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-cyan-400/20 bg-cyan-400/10 text-primary">
                      <Calendar className="h-7 w-7" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-foreground group-data-[erp-theme=light]/dashboard:text-foreground">No hay movimientos proyectados</h2>
                      <p className="mt-1 text-sm text-muted-foreground group-data-[erp-theme=light]/dashboard:text-foreground/80">
                        No se encontraron ingresos o egresos para el periodo seleccionado.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {proyeccionFiltrada.map((dia) => {
                      const isExpanded = expandedDays.has(dia.fecha)
                      const isNegative = dia.saldo_final < 0
                      const isLow = dia.saldo_final < dia.saldo_inicial * 0.2 && dia.saldo_final >= 0

                      return (
                        <Card
                          key={`${dia.fecha}-${dia.moneda}`}
                          className={cn(
                            'overflow-hidden border-cyan-400/20 bg-card/55',
                            isNegative && 'border-amber-300/35 bg-amber-300/5',
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => toggleDayExpansion(dia.fecha)}
                            className="grid w-full gap-4 p-4 text-left transition hover:bg-cyan-400/5 lg:grid-cols-[minmax(150px,1fr)_2fr_minmax(180px,auto)] lg:items-center"
                          >
                            <div>
                              <div className="text-sm font-semibold text-foreground group-data-[erp-theme=light]/dashboard:text-foreground">{formatDate(dia.fecha)}</div>
                              <div className="mt-1 text-xs text-muted-foreground">{dia.moneda}</div>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-3">
                              <CompactAmount label="Ingresos" value={`+${formatCurrency(dia.ingresos, dia.moneda)}`} tone="positive" />
                              <CompactAmount label="Egresos" value={`-${formatCurrency(dia.egresos, dia.moneda)}`} tone="negative" />
                              <CompactAmount
                                label="Flujo neto"
                                value={`${dia.flujo_neto >= 0 ? '+' : ''}${formatCurrency(dia.flujo_neto, dia.moneda)}`}
                                tone={dia.flujo_neto >= 0 ? 'positive' : 'negative'}
                              />
                            </div>

                            <div className="flex items-center justify-between gap-4 lg:justify-end">
                              <div className="text-right">
                                <div className="text-xs text-muted-foreground">Saldo final</div>
                                <div className={cn('mt-1 text-base font-semibold', isNegative ? 'text-amber-700 dark:text-amber-200' : 'text-foreground group-data-[erp-theme=light]/dashboard:text-foreground')}>
                                  {formatCurrency(dia.saldo_final, dia.moneda)}
                                </div>
                              </div>
                              {(isNegative || isLow) && <AlertCircle className="h-5 w-5 text-amber-400 dark:text-amber-200" />}
                              <ChevronDown className={cn('h-5 w-5 text-muted-foreground transition-transform', isExpanded && 'rotate-180')} />
                            </div>
                          </button>

                          {isExpanded && dia.items.length > 0 && (
                            <div className="border-t border-cyan-400/10 bg-card/45 p-4">
                              <div className="mb-3 text-sm font-semibold text-foreground/90">Detalle de movimientos ({dia.items.length})</div>
                              <div className="space-y-2">
                                {dia.items.map((item, itemIndex) => (
                                  <div
                                    key={`${item.referencia_id}-${itemIndex}`}
                                    className="flex flex-col gap-3 rounded-md border border-cyan-400/15 bg-card/70 p-3 sm:flex-row sm:items-center sm:justify-between"
                                  >
                                    <div className="flex items-center gap-3">
                                      <div className="flex h-9 w-9 items-center justify-center rounded-md border border-cyan-400/20 bg-cyan-400/10 text-primary">
                                        {item.tipo === 'INGRESO' ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                                      </div>
                                      <div>
                                        <div className="text-sm font-semibold text-foreground">{item.concepto}</div>
                                        <div className="text-xs text-muted-foreground">{item.descripcion}</div>
                                      </div>
                                    </div>
                                    <div className={cn('text-sm font-semibold', item.tipo === 'INGRESO' ? 'text-primary' : 'text-amber-400 dark:text-amber-200')}>
                                      {item.tipo === 'INGRESO' ? '+' : '-'}{formatCurrency(item.monto, dia.moneda)}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </Card>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}

function SummaryCard({
  resumen,
  formatCurrency,
}: {
  resumen: ResumenFlujo
  formatCurrency: (amount: number, moneda?: string) => string
}) {
  return (
    <Card className="border-cyan-400/20 bg-card/55">
      <CardContent className="space-y-4 p-4">
        <div>
          <p className="text-xs font-semibold uppercase text-cyan-200/75">{resumen.moneda}</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{formatCurrency(resumen.saldo_proyectado, resumen.moneda)}</p>
          <p className="text-xs text-muted-foreground">Saldo proyectado al final del periodo</p>
        </div>

        <div className="space-y-2 border-t border-cyan-400/10 pt-3 text-sm">
          <FlowLine label="Saldo actual" value={formatCurrency(resumen.saldo_actual, resumen.moneda)} tone="neutral" />
          <FlowLine label="Ingresos" value={`+${formatCurrency(resumen.total_ingresos, resumen.moneda)}`} tone="positive" icon={TrendingUp} />
          <FlowLine label="Egresos" value={`-${formatCurrency(resumen.total_egresos, resumen.moneda)}`} tone="negative" icon={TrendingDown} />
          <div className="border-t border-cyan-400/10 pt-2">
            <FlowLine
              label="Flujo neto"
              value={`${resumen.flujo_neto >= 0 ? '+' : ''}${formatCurrency(resumen.flujo_neto, resumen.moneda)}`}
              tone={resumen.flujo_neto >= 0 ? 'positive' : 'negative'}
              strong
            />
          </div>
        </div>

        {resumen.alerta && (
          <Alert className="border-amber-300/30 bg-amber-300/10 text-amber-400 dark:text-amber-200">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {resumen.alerta === 'SALDO_NEGATIVO' ? 'Saldo negativo proyectado' : 'Saldo bajo proyectado'}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: React.ElementType
  label: string
  value: string
  detail: string
}) {
  return (
    <Card className="border-cyan-400/20 bg-card/70 group-data-[erp-theme=light]/dashboard:bg-card">
      <CardContent className="flex items-start justify-between gap-4 p-4">
        <div>
          <p className="text-xs font-semibold uppercase text-cyan-200/75 group-data-[erp-theme=light]/dashboard:text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-foreground group-data-[erp-theme=light]/dashboard:text-foreground">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground group-data-[erp-theme=light]/dashboard:text-foreground/80">{detail}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-400/20 bg-cyan-400/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  )
}

function FlowLine({
  label,
  value,
  tone,
  icon: Icon,
  strong = false,
}: {
  label: string
  value: string
  tone: 'positive' | 'negative' | 'neutral'
  icon?: React.ElementType
  strong?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className={cn('flex items-center gap-2 text-muted-foreground', strong && 'font-semibold text-foreground/90')}>
        {Icon && <Icon className={cn('h-4 w-4', tone === 'positive' ? 'text-primary' : 'text-amber-400 dark:text-amber-200')} />}
        {label}:
      </span>
      <span
        className={cn(
          'font-semibold',
          tone === 'positive' && 'text-primary',
          tone === 'negative' && 'text-amber-400 dark:text-amber-200',
          tone === 'neutral' && 'text-foreground/90',
          strong && 'font-bold',
        )}
      >
        {value}
      </span>
    </div>
  )
}

function CompactAmount({ label, value, tone }: { label: string; value: string; tone: 'positive' | 'negative' }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn('mt-1 text-sm font-semibold', tone === 'positive' ? 'text-primary' : 'text-amber-400 dark:text-amber-200')}>{value}</div>
    </div>
  )
}
